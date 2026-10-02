'use strict';
/**
 * Test end-to-end uruchamiany na adresie file:// — czyli dokładnie w taki
 * sposób, w jaki aplikację otwiera się dwuklikiem z rozpakowanego ZIP-a.
 *
 * Sterowanie przez protokół DevTools, bez żadnych zależności z npm.
 * Uruchomienie:  node tests/browser/smoke.js
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome'
].filter(Boolean);

const PORT = 9333;
const APP_URL = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');

const results = [];
function check(name, condition, detail) {
  const note = detail === undefined || detail === null ? '(bez szczegółów)' : String(detail);
  results.push({ name, ok: !!condition, detail: note });
  process.stdout.write((condition ? '  ok   ' : '  FAIL ') + name + (condition ? '' : '  → ' + note) + '\n');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Nie znaleziono przeglądarki Chromium. Ustaw CHROME_PATH.');
}

async function waitForDebugger() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const targets = await response.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) { /* przeglądarka jeszcze wstaje */ }
    await sleep(250);
  }
  throw new Error('Przeglądarka nie udostępniła protokołu DevTools.');
}

function connect(url, onEvent) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;

    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (error) { return; }
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(message.error.message));
        else done(message.result);
        return;
      }
      if (message.method && onEvent) onEvent(message);
    });
    socket.addEventListener('error', () => reject(new Error('Błąd połączenia DevTools.')));
    socket.addEventListener('open', () => {
      function send(method, params) {
        const id = nextId++;
        return new Promise((res, rej) => {
          pending.set(id, { resolve: res, reject: rej });
          socket.send(JSON.stringify({ id, method, params: params || {} }));
        });
      }
      resolve({ send, close: () => socket.close() });
    });
  });
}

async function main() {
  const chrome = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'etrom-profile-'));

  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    APP_URL
  ], { stdio: 'ignore' });

  let client = null;
  let pageErrors = [];
  try {
    const target = await waitForDebugger();
    client = await connect(target.webSocketDebuggerUrl, (event) => {
      if (event.method === 'Runtime.exceptionThrown') {
        const details = event.params.exceptionDetails || {};
        pageErrors.push('wyjątek: ' + (details.exception ? details.exception.description : details.text));
      }
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
        pageErrors.push('console.error: ' + (event.params.args || [])
          .map((arg) => String(arg.value !== undefined ? arg.value : arg.description)).join(' '));
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');

    /** Wykonuje wyrażenie w stronie i zwraca wartość. */
    async function evaluate(expression) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
          const result = await client.send('Runtime.evaluate', {
            expression: '(() => { ' + expression + ' })()',
            returnByValue: true,
            awaitPromise: true
          });
          if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception
              ? result.exceptionDetails.exception.description
              : result.exceptionDetails.text);
          }
          return result.result.value;
        } catch (error) {
          if (!/context was destroyed|Cannot find context/i.test(String(error.message))) throw error;
          await sleep(200);
        }
      }
      throw new Error('Nie udało się wykonać wyrażenia po przeładowaniu strony.');
    }

    async function waitForApp() {
      for (let i = 0; i < 60; i += 1) {
        const ready = await evaluate('return !!(window.ETROM && window.ETROM.app && document.getElementById("project-list"));');
        if (ready) return;
        await sleep(200);
      }
      throw new Error('Aplikacja nie wystartowała.');
    }

    // Wiersz tabeli albo karta — każdy widoczny projekt na liście ma data-project-code.
    const cardCount = () => evaluate('return document.querySelectorAll("#project-list [data-project-code]").length;');
    const click = (selector) => evaluate(
      'const node = document.querySelector(' + JSON.stringify(selector) + ');' +
      'if (!node) throw new Error("brak elementu: ' + selector.replace(/"/g, "'") + '");' +
      'node.click(); return true;'
    );
    const go = async (hash) => { await evaluate('location.hash = ' + JSON.stringify(hash) + '; return true;'); await sleep(450); };
    const projectId = (code) => evaluate('const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.code === "' + code + '"); return p ? p.id : null;');
    const state = (expr) => evaluate('const s = window.ETROM.app.store.getState(); return ' + expr + ';');

    /** Wybiera pozycję z otwartego menu po wartości albo po początku etykiety. */
    async function pickMenu(match) {
      await evaluate(
        'const items = [...document.querySelectorAll(".popover [role^=menuitem]")];' +
        'const m = ' + JSON.stringify(match) + ';' +
        'const item = items.find(i => i.dataset.value === m) || items.find(i => i.textContent.trim().indexOf(m) === 0);' +
        'if (!item) throw new Error("brak pozycji menu: " + m + " w [" + items.map(i => i.textContent.trim()).join(", ") + "]");' +
        'item.click(); return true;'
      );
      await sleep(250);
    }
    async function openMenu(selector, match) {
      await click(selector);
      await sleep(150);
      await pickMenu(match);
    }

    // Prawdziwe zdarzenia klawiatury — inaczej natywny <dialog> nie zareaguje na Escape.
    const KEYS = {
      n: { key: 'n', code: 'KeyN', vk: 78, text: 'n' },
      g: { key: 'g', code: 'KeyG', vk: 71, text: 'g' },
      m: { key: 'm', code: 'KeyM', vk: 77, text: 'm' },
      t: { key: 't', code: 'KeyT', vk: 84, text: 't' },
      e: { key: 'e', code: 'KeyE', vk: 69, text: 'e' },
      slash: { key: '/', code: 'Slash', vk: 191, text: '/' },
      k: { key: 'k', code: 'KeyK', vk: 75, text: 'k' },
      enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
      escape: { key: 'Escape', code: 'Escape', vk: 27, text: '' },
      down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40, text: '' },
      space: { key: ' ', code: 'Space', vk: 32, text: ' ' }
    };
    async function pressKey(name, modifiers) {
      const spec = KEYS[name];
      const mod = modifiers || 0;
      await client.send('Input.dispatchKeyEvent', {
        type: spec.text && !mod ? 'keyDown' : 'rawKeyDown',
        key: spec.key, code: spec.code, modifiers: mod,
        windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk,
        text: mod ? '' : spec.text
      });
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: spec.key, code: spec.code, modifiers: mod,
        windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk
      });
      await sleep(200);
    }
    const CTRL = 2;

    await waitForApp();

    /* 1. Start na czystym profilu */
    check('start bez danych pokazuje pusty stan z następnym krokiem',
      (await cardCount()) === 0
      && (await evaluate('return document.getElementById("projects-onboard-title").textContent;')) === 'Załóż pierwszy projekt'
      && (await evaluate('return !!document.getElementById("empty-new") && !!document.getElementById("empty-demo");')));

    await go('#/zespol');
    check('pusty Zespół prowadzi do pierwszej osoby i danych przykładowych',
      await evaluate('const b = document.getElementById("team-empty-new"); return !!b && !!document.querySelector(".onboard") && /Dodaj dane przykładowe/.test(document.querySelector(".onboard").textContent);'));
    await go('#/projekty');

    check('skrypty wczytały się z file:// (bez serwera)',
      (await evaluate('return location.protocol;')) === 'file:' &&
      (await evaluate('return Object.keys(window.ETROM).sort().join(",");')).includes('Model'));

    /* 2. Dane przykładowe */
    await click('#empty-demo');
    await sleep(200);
    check('dane przykładowe dodają 5 projektów', (await cardCount()) === 5, 'było ' + (await cardCount()));
    check('domyślny widok listy to tabela', (await evaluate('return document.querySelectorAll("#project-list .table__row").length;')) === 5);

    check('każdy projekt przykładowy ma komplet etapów ze standardu w katalogowej kolejności',
      await state('s.workspace.projects.every(p => p.stages.length === window.ETROM.Catalog.all.length)'));

    /* 3. Zapis lokalny */
    const stored = await evaluate('const raw = localStorage.getItem("etrom.v3"); return raw ? JSON.parse(raw).projects.length : -1;');
    check('dane trafiają do localStorage na file://', stored === 5, 'zapisano: ' + stored);

    /* 4. Trwałość po przeładowaniu — od tego momentu liczymy błędy strony */
    pageErrors = [];
    await evaluate('location.reload(); return true;');
    await sleep(600);
    await waitForApp();
    check('po przeładowaniu projekty nadal są', (await cardCount()) === 5, 'było ' + (await cardCount()));

    /* 5. Wyszukiwanie */
    await evaluate('const input = document.getElementById("tb-search"); input.value = "Lipnica"; input.dispatchEvent(new Event("input", { bubbles: true })); return true;');
    check('szukanie po nazwie zawęża listę do jednego projektu', (await cardCount()) === 1, 'było ' + (await cardCount()));
    check('przy aktywnym filtrze widać licznik i przycisk czyszczenia',
      await evaluate('return /^1 z 5$/.test(document.querySelector("#filters .toolbar__count").textContent) && !document.getElementById("tb-clear").hidden;'));
    await click('#tb-clear');
    await sleep(150);
    check('„Wyczyść filtry” przywraca pełną listę i czyści pole', (await cardCount()) === 5 && (await evaluate('return document.getElementById("tb-search").value;')) === '');

    /* 6. Filtr statusu przez menu */
    await openMenu('#tb-status', 'done');
    check('filtr statusu „Zakończony” pokazuje 1 projekt', (await cardCount()) === 1, 'było ' + (await cardCount()));
    check('przycisk filtra pokazuje wybraną wartość',
      await evaluate('const b = document.getElementById("tb-status"); return b.classList.contains("filter-btn--active") && /Zakończony/.test(b.textContent);'));
    await openMenu('#tb-status', 'all');
    check('powrót do wszystkich statusów', (await cardCount()) === 5);

    /* 7. Sortowanie po terminie — projekt po terminie na początku */
    const order = await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");');
    check('sortowanie po terminie: czynny projekt po terminie na czele, zakończony na końcu',
      order.split(',')[0] === 'DEMO-002' && order.split(',').pop() === 'DEMO-005', 'kolejność: ' + order);

    check('sortowanie z nagłówka kolumny',
      await evaluate('document.querySelector(\'.table__sort[data-sort="name"]\').click(); return true;')
      && (await state('s.filters.sort')) === 'name'
      && (await evaluate('return document.querySelector(\'th[aria-sort] .table__sort\').dataset.sort;')) === 'name');
    await openMenu('#tb-sort', 'deadline');
    check('menu sortowania wraca do terminu', (await state('s.filters.sort')) === 'deadline');

    /* 7a. Przegląd portfela jako narzędzie: kliknięcie zawęża listę */
    await click('[data-fk="cockpit-attention"]');
    await sleep(250);
    const attention = await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(r => r.dataset.projectCode);');
    check('„Wymagają uwagi” w kokpicie zawęża listę do projektów w stanie ostrzegawczym i alarmowym',
      (await state('s.filters.health')) === 'attention' && attention.length > 0 && attention.length < 5
      && (await state('s.workspace.projects.filter(p => ' + JSON.stringify(attention) + '.includes(p.code)).every(p => ["alarm","warning"].includes(window.ETROM.Insight.health(p, new Date()).level))')),
      'kody: ' + attention.join(','));
    check('zawężenie widać w pasku filtrów jako zdejmowalny znacznik',
      await evaluate('const b = document.getElementById("tb-scope"); return !!b && !b.hidden && /Wymaga uwagi/.test(b.textContent) && document.querySelector(\'[data-fk="cockpit-attention"]\').getAttribute("aria-pressed") === "true";'));
    await click('#tb-scope');
    await sleep(200);
    check('zdjęcie znacznika przywraca pełną listę', (await cardCount()) === 5 && (await state('s.filters.health')) === 'all');
    await click('[data-fk="mix-alarm"]');
    await sleep(200);
    check('pozycja legendy stanu portfela filtruje listę po stanie', (await state('s.filters.health')) === 'alarm' && (await cardCount()) === 1);
    await click('[data-fk="mix-alarm"]');
    await sleep(200);
    check('ponowne kliknięcie legendy zdejmuje filtr', (await cardCount()) === 5);
    await click('[data-fk="cockpit-horizon"]');
    await sleep(200);
    check('„Najbliższe terminy” pokazują na liście projekty z terminem w 60 dniach',
      (await state('s.filters.horizon')) === 60 && (await cardCount()) >= 1 && (await cardCount()) <= 5
      && (await evaluate('return /Pokaż \\d+/.test(document.querySelector(\'[data-fk="cockpit-horizon"]\').textContent) || /Pokaż wszystkie/.test(document.querySelector(\'[data-fk="cockpit-horizon"]\').textContent);')));
    await click('#tb-scope');
    await sleep(200);
    await evaluate('document.querySelector(".upcoming__item").click(); return true;');
    await sleep(1500);
    const hashAfter = await evaluate('return location.hash;');
    check('termin z kokpitu otwiera projekt na właściwym etapie', /^#\/projekty\/\d+/.test(hashAfter), hashAfter);
    await go('#/projekty');

    /* 8. Szczegóły projektu pod własnym adresem */
    await evaluate('document.querySelector(\'[data-project-code="DEMO-002"] .project-link\').click(); return true;');
    await sleep(500);
    const id2 = await projectId('DEMO-002');
    check('klik w projekt otwiera jego szczegóły pod własnym adresem',
      (await evaluate('return location.hash;')) === '#/projekty/' + id2 && !(await evaluate('return document.getElementById("view-project").hidden;')));
    check('ścieżka w pasku górnym prowadzi z powrotem do listy',
      await evaluate('const a = document.querySelector("#crumb a"); return !!a && a.getAttribute("href") === "#/projekty";'));
    check('fokus po zmianie ekranu trafia na nagłówek strony',
      (await evaluate('return document.activeElement && document.activeElement.id;')) === 'project-title');

    check('zakończone etapy z początku zwinięte w jedną linię z liczbą',
      await evaluate('const b = document.getElementById("show-done"); return !!b && /11\\u00a0etapów zakończonych/.test(b.textContent);'));
    await click('#show-done');
    await sleep(200);
    check('po rozwinięciu przebieg pokazuje wszystkie etapy standardu', (await evaluate('return document.querySelectorAll(".srow-wrap[data-stage-id]").length;')) === (await evaluate('return window.ETROM.Catalog.all.length;')));
    /* 9. Zmiana statusu etapu przelicza postęp */
    const progressNow = () => evaluate('return document.querySelector(".gauge__number").dataset.count;');
    const before = await progressNow();
    await evaluate('const rows = document.querySelectorAll(".srow-wrap[data-stage-id] > .srow"); rows[rows.length - 1].querySelector(".srow__status").click(); return true;');
    await sleep(150);
    check('klik na status etapu przechodzi Do wykonania → W toku', (await state('s.workspace.projects.find(x => x.code === "DEMO-002").stages[15].status')) === 'working');
    await evaluate('const rows = document.querySelectorAll(".srow-wrap[data-stage-id] > .srow"); rows[rows.length - 1].querySelector(".srow__status").click(); return true;');
    await sleep(150);
    const after = await progressNow();
    check('oznaczenie etapu jako zakończony podnosi postęp', Number(after) > Number(before), 'przed ' + before + '%, po ' + after + '%');
    // Enter z klawiatury na przycisku statusu: po przerysowaniu fokus musi zostać w tym samym miejscu.
    await evaluate('const rows = document.querySelectorAll(".srow-wrap[data-stage-id] > .srow"); rows[rows.length - 1].querySelector(".srow__status").focus(); return true;');
    await pressKey('enter');
    check('fokus klawiatury zostaje na przycisku statusu po przerysowaniu',
      await evaluate('const rows = document.querySelectorAll(".srow-wrap[data-stage-id] > .srow"); return document.activeElement === rows[rows.length - 1].querySelector(".srow__status");')
      && (await state('s.workspace.projects.find(x => x.code === "DEMO-002").stages[15].status')) === 'todo');

    /* 10. Wstecz w przeglądarce */
    await evaluate('history.back(); return true;');
    await sleep(500);
    check('przycisk Wstecz wraca z projektu na listę',
      (await evaluate('return location.hash;')) === '#/projekty' || (await evaluate('return location.hash;')) === '');

    /* 11. Walidacja formularza: powtórzony kod */
    await click('#action-new');
    await sleep(200);
    await evaluate(
      'document.getElementById("pf-code").value = "DEMO-001";' +
      'document.getElementById("pf-name").value = "Próba duplikatu";' +
      'document.getElementById("pf-client").value = "Klient";' +
      'document.getElementById("project-form").requestSubmit(); return true;'
    );
    await sleep(150);
    const duplicateError = await evaluate('const node = document.querySelector("#project-form .field__error"); return node ? node.textContent : "";');
    check('formularz blokuje powtórzony kod projektu',
      /już istnieje/i.test(duplicateError) && (await cardCount()) === 5, 'komunikat: "' + duplicateError + '"');
    check('pole z błędem jest oznaczone i opisane dla czytnika ekranu',
      await evaluate('const i = document.getElementById("pf-code"); return i.getAttribute("aria-invalid") === "true" && (i.getAttribute("aria-describedby") || "").indexOf("pf-code-error") >= 0;'));

    /* 12. Poprawne dodanie projektu */
    await evaluate(
      'document.getElementById("pf-code").value = "NOWY-9";' +
      'document.getElementById("pf-name").value = "Projekt z testu";' +
      'document.getElementById("pf-client").value = "Klient testowy";' +
      'document.getElementById("project-form").requestSubmit(); return true;'
    );
    await sleep(200);
    check('poprawny formularz dodaje projekt i zamyka panel',
      (await cardCount()) === 6 && (await evaluate('return document.querySelectorAll("#project-form").length;')) === 0,
      'pozycji: ' + (await cardCount()));

    /* 13. Dane użytkownika nie są wykonywane jako HTML */
    await click('#action-new');
    await sleep(200);
    await evaluate(
      'document.getElementById("pf-code").value = "XSS-1";' +
      'document.getElementById("pf-name").value = \'<img src=x onerror="window.__xss=1">\';' +
      'document.getElementById("pf-client").value = "Klient";' +
      'document.getElementById("project-form").requestSubmit(); return true;'
    );
    await sleep(250);
    const xss = await evaluate('return { flag: !!window.__xss, imgs: document.querySelectorAll("#project-list img").length };');
    const xssText = await evaluate('const row = document.querySelector(\'[data-project-code="XSS-1"]\'); return row ? row.querySelector(".project-link").textContent : "";');
    check('nazwa ze znacznikami HTML wyświetla się jako tekst, nie wykonuje się',
      xss.flag === false && xss.imgs === 0 && xssText.indexOf('<img') === 0, JSON.stringify(xss) + ' tekst: ' + xssText);

    /* 14. Usuwanie z menu wiersza, z możliwością cofnięcia */
    await evaluate('document.querySelectorAll(".toast__close").forEach(b => b.click()); return true;');
    await sleep(200);
    const codesBefore = await state('s.workspace.projects.map(p => p.code).join(",")');
    await openMenu('[data-project-code="XSS-1"] .row-actions', 'Usuń projekt');
    await sleep(300);
    check('usunięcie działa od razu, bez pytania w osobnym oknie',
      await evaluate('return !document.querySelector(\'[data-project-code="XSS-1"]\') && !document.querySelector("dialog[open]");'));
    check('pojawia się powiadomienie z możliwością cofnięcia', await evaluate('return !!document.querySelector("[data-toast-action]");'));
    await click('[data-toast-action]');
    await sleep(300);
    const codesAfterUndo = await state('s.workspace.projects.map(p => p.code).join(",")');
    check('cofnięcie przywraca projekt na to samo miejsce listy', codesAfterUndo === codesBefore, 'przed: ' + codesBefore + ' | po: ' + codesAfterUndo);

    await openMenu('[data-project-code="XSS-1"] .row-actions', 'Usuń projekt');
    await sleep(300);
    await click('.toast__close');
    await sleep(300);
    check('po zamknięciu powiadomienia usunięcie zostaje w mocy',
      await evaluate('return !document.querySelector(\'[data-project-code="XSS-1"]\');'));

    /* 15. Zaznaczanie i akcje zbiorcze */
    const nid = await projectId('NOWY-9');
    const did = await projectId('DEMO-003');
    await click('#select-' + nid);
    await sleep(100);
    await click('#select-' + did);
    await sleep(150);
    check('zaznaczenie dwóch wierszy pokazuje pasek akcji zbiorczych',
      await evaluate('const b = document.querySelector(".bulkbar"); return !!b && /Zaznaczono 2/.test(b.textContent) && document.querySelectorAll(\'tr[aria-selected="true"]\').length === 2;'));
    check('pole „zaznacz wszystkie” jest w stanie pośrednim', await evaluate('return document.getElementById("select-all").indeterminate;'));
    await click('#bulk-delete');
    await sleep(300);
    check('usunięcie zbiorcze zdejmuje oba projekty', (await cardCount()) === 4 && !(await evaluate('return !!document.querySelector(".bulkbar");')),
      'pozycji: ' + (await cardCount()) + ', pasek: ' + (await evaluate('return !!document.querySelector(".bulkbar");')) + ', w danych: ' + (await state('s.workspace.projects.length')));
    await click('[data-toast-action]');
    await sleep(300);
    check('cofnięcie przywraca oba projekty', (await cardCount()) === 6);

    /* 16. Wybór kolumn (zapamiętany) */
    await click('#tb-columns');
    await sleep(150);
    await pickMenu('team');
    await pressKey('escape');
    check('ukrycie kolumny „Zespół” usuwa ją z tabeli',
      await evaluate('return !document.querySelector("#project-list th.col-team") && !!document.querySelector("#project-list th.col-status");')
      && (await state('s.prefs.hiddenColumns.join(",")')) === 'team');
    check('Escape zamyka menu i oddaje fokus przyciskowi', await evaluate('return !document.querySelector(".popover") && document.activeElement.id === "tb-columns";'));

    /* 17. Dane przykładowe nie duplikują się */
    await evaluate('window.ETROM.app.loadDemo(); return true;');
    await sleep(200);
    check('powtórne dodanie danych przykładowych nie tworzy duplikatów',
      await state('(() => { const c = s.workspace.projects.map(p => p.code); return c.length === new Set(c).size; })()'));

    /* 18. Klawiatura */
    await evaluate('document.activeElement && document.activeElement.blur(); return true;');
    await pressKey('n');
    check('klawisz N otwiera panel nowego projektu', await evaluate('return !!document.querySelector("dialog.drawer[open] #project-form");'));
    await pressKey('escape');
    check('Escape zamyka panel', await evaluate('return !document.querySelector("dialog.drawer[open]");'));
    await pressKey('slash');
    check('ukośnik przenosi kursor do wyszukiwarki', (await evaluate('return document.activeElement ? document.activeElement.id : "";')) === 'tb-search');
    await evaluate('document.activeElement.blur(); return true;');

    await evaluate('document.getElementById("tb-status").focus(); return true;');
    await pressKey('down');
    check('strzałka w dół na przycisku filtra otwiera menu z fokusem w środku',
      await evaluate('const m = document.querySelector(".popover[role=menu]"); return !!m && m.contains(document.activeElement);'));
    await pressKey('down');
    check('strzałki przesuwają fokus po pozycjach menu',
      await evaluate('const items = [...document.querySelectorAll(".popover [role^=menuitem]")]; return items.indexOf(document.activeElement) === 1;'));
    await pressKey('escape');
    check('Escape zamyka menu filtra', await evaluate('return !document.querySelector(".popover");'));

    /* 19. Widok kart, motyw, zapamiętanie */
    await click('.segmented__btn[aria-label="Widok kart"]');
    await sleep(450);
    const cardsCheck = await evaluate('return { cards: document.querySelectorAll(".pcard").length, projects: window.ETROM.app.store.getState().workspace.projects.length, bars: document.querySelectorAll(".pcard .flow").length };');
    check('widok kart: karta i profil przebiegu na każdy projekt',
      cardsCheck.cards === cardsCheck.projects && cardsCheck.bars === cardsCheck.cards, JSON.stringify(cardsCheck));

    await click('#action-settings');
    await sleep(150);
    await evaluate('document.querySelector(\'.settings .segmented__btn[data-value="dark"]\').click(); return true;');
    await sleep(150);
    check('ustawienia: przełącznik motywu ustawia motyw ciemny', (await evaluate('return document.documentElement.getAttribute("data-theme");')) === 'dark');
    await pressKey('escape');

    await evaluate('location.reload(); return true;');
    await sleep(600);
    await waitForApp();
    const kept = await evaluate('return { theme: document.documentElement.getAttribute("data-theme"), cards: document.querySelectorAll(".pcard").length, projects: window.ETROM.app.store.getState().workspace.projects.length };');
    check('po przeładowaniu zostają motyw i widok kart', kept.theme === 'dark' && kept.cards === kept.projects && kept.cards > 0, JSON.stringify(kept));
    await click('.segmented__btn[aria-label="Widok tabeli"]');
    await sleep(450);

    /* 20. Paleta poleceń */
    await pressKey('k', CTRL);
    check('Ctrl+K otwiera paletę poleceń', await evaluate('return !!document.querySelector("dialog.palette[open]");'));
    await evaluate('const input = document.querySelector(".palette__input"); input.value = "lipnic"; input.dispatchEvent(new Event("input", { bubbles: true })); return true;');
    await sleep(200);
    const firstRow = await evaluate('const row = document.querySelector(".palette__row--active .palette__rowLabel"); return row ? row.textContent : "";');
    check('wpisanie fragmentu nazwy podnosi właściwy projekt na pierwsze miejsce', firstRow.indexOf('Lipnic') >= 0, 'pierwszy wynik: "' + firstRow + '"');
    await pressKey('enter');
    await sleep(500);
    const id1 = await projectId('DEMO-001');
    check('Enter zamyka paletę i otwiera wybrany projekt',
      (await evaluate('return !document.querySelector("dialog.palette[open]");')) && (await evaluate('return location.hash;')) === '#/projekty/' + id1);

    await pressKey('k', CTRL);
    await evaluate('const input = document.querySelector(".palette__input"); input.value = "kolor grafit"; input.dispatchEvent(new Event("input", { bubbles: true })); return true;');
    await sleep(200);
    await pressKey('enter');
    await sleep(300);
    check('polecenie z palety zmienia akcent', (await evaluate('return document.documentElement.getAttribute("data-accent");')) === 'graphite');

    await pressKey('k', CTRL);
    await pressKey('escape');
    check('Escape zamyka paletę', await evaluate('return !document.querySelector("dialog.palette[open]");'));

    /* 21. Zespół projektu i skrót E */
    await go('#/projekty/' + id1 + '/zespol');
    check('zakładka Zespół pokazuje Lidera z awatarem',
      await evaluate('const row = [...document.querySelectorAll(".kv")].find(r => /Lider/.test(r.textContent)); return !!row && !!row.querySelector(".avatar");'));
    check('aktywna zakładka jest oznaczona dla czytnika ekranu',
      await evaluate('const t = document.querySelector(\'.tabs__tab[aria-current="page"]\'); return !!t && t.dataset.tab === "zespol";'));
    await evaluate('document.activeElement && document.activeElement.blur(); return true;');
    await pressKey('e');
    check('klawisz E w projekcie otwiera jego edycję', await evaluate('return !!document.querySelector("dialog.drawer[open] #project-form") && document.getElementById("pf-code").value === "DEMO-001";'));
    await pressKey('escape');

    /* 21a. Termin projektu zawsze z rokiem i licznikiem dni do końca */
    await go('#/projekty');
    check('termin projektu na liście ma rok i licznik dni',
      await evaluate('const cells = [...document.querySelectorAll(".deadline-cell")]; return cells.length > 0 && cells.every(c => /20\\d\\d/.test(c.querySelector(".stack__main").textContent) && !!c.querySelector(".countdown"));'));
    check('licznik pokazuje liczbę dni do końca albo po terminie',
      await evaluate('return [...document.querySelectorAll(".deadline-cell .countdown")].some(c => /\\d+\\s(dni|dzień)\\s(do końca|po terminie)|zamknięty|termin dzisiaj/.test(c.textContent));'));

    /* 21b. Moja praca: wybór osoby, zadania według czasu, zatwierdzanie */
    await go('#/projekty');
    await pressKey('g');
    await pressKey('m');
    await sleep(250);
    check('skrót G M otwiera Moją pracę, a bez wybranej osoby pyta „Kim jesteś?”',
      (await evaluate('return location.hash;')) === '#/moja-praca' && await evaluate('return !!document.querySelector(".mpick") && document.querySelectorAll(".mpick__item").length > 1;'));
    await evaluate('const b = [...document.querySelectorAll(".mpick__item")].find(x => /Michał Testowy/.test(x.textContent)); b.click(); return true;');
    await sleep(300);
    check('wybór osoby zapisuje się w preferencjach i pokazuje jej zadania',
      await evaluate('return !!document.querySelector(".mywork") && !!document.querySelector(".mywho") && document.querySelectorAll(".mrow").length > 0 && /^p-\\d+$/.test(JSON.parse(localStorage.getItem(window.ETROM.Prefs.KEY)).me || "");'));
    check('zadania są pogrupowane w przedziały czasu i mają projekt oraz termin',
      await evaluate('const t = [...document.querySelectorAll(".mywork__main .msec__title")].map(n => n.textContent); return t.length > 0 && t.every(x => ["Czeka na Twoją decyzję","Po terminie","Dziś","W tym tygodniu","Później","Bez terminu"].includes(x)) && !!document.querySelector(".mrow__project") && !!document.querySelector(".mrow .due, .mrow .due--none");'));
    check('pasek boczny pokazuje licznik pracy osoby',
      await evaluate('return /^\\d+$/.test(document.querySelector("[data-screen=mywork] .nav__count").textContent);'));
    check('moje projekty pokazują funkcję i licznik dni do końca',
      await evaluate('return document.querySelectorAll(".mproject").length > 0 && !!document.querySelector(".mproject .countdown");'));
    await click('.mrow .trow__name');
    await sleep(300);
    check('klik w zadanie otwiera inspektor zadania', await evaluate('return !document.getElementById("inspector").hidden;'));
    await pressKey('escape');
    await click('[data-fk="my-who"]');
    await sleep(200);
    check('menu „Pracuję jako” pozwala zmienić osobę',
      await evaluate('return document.querySelectorAll("[role=menuitem]").length > 1;'));
    await pressKey('escape');

    /* 21c. Zegar rejestracji czasu */
    check('wiersz zadania w Mojej pracy ma przycisk zegara',
      await evaluate('return document.querySelectorAll(".mrow .timer-btn").length > 0;'));
    const firstTimer = await evaluate('const b = document.querySelector(".mrow:not(.mrow--approve) .timer-btn"); return b ? b.dataset.fk : null;');
    await click('[data-fk="' + firstTimer + '"]');
    await sleep(300);
    check('włączenie zegara pokazuje pływający zegar w pasku górnym i oznacza przycisk',
      await evaluate('return !!document.querySelector(".timer-pill") && !!document.querySelector(".timer-btn.is-running") && /^\\d+:\\d\\d:\\d\\d$/.test(document.querySelector(".timer-pill__time").textContent);'));
    check('zegar zapisuje się jako wpis bez końca, jeden na osobę',
      (await state('(s.workspace.entries || []).filter(e => !e.end).length')) === 1);
    check('pasek dnia w górnej belce pokazuje czas i segment projektu',
      await evaluate('const m = document.querySelector(".topbar .daymeter"); return !!m && !!m.querySelector(".dmseg.is-live") && /\\/ 8 h/.test(m.textContent);'));
    check('pasek zegara pokazuje godzinę startu „od HH:MM”',
      await evaluate('return /^od \\d\\d:\\d\\d$/.test(document.querySelector(".timer-pill__since").textContent);'));
    await sleep(1700);
    check('zegar tyka bez przerysowania aplikacji',
      await evaluate('return document.querySelector(".timer-pill__time").textContent !== "0:00:00";'));
    await evaluate('const all = [...document.querySelectorAll(".mrow:not(.mrow--approve) .timer-btn")]; const other = all.find(b => !b.classList.contains("is-running")); if (other) other.click(); return !!other;');
    await sleep(300);
    check('włączenie drugiego zegara zatrzymuje pierwszy: nadal jeden chodzący wpis',
      (await state('(s.workspace.entries || []).filter(e => !e.end).length')) === 1);
    await click('[data-fk="timer-stop"]');
    await sleep(300);
    check('stop zamyka wpis i chowa pływający zegar',
      (await state('(s.workspace.entries || []).filter(e => !e.end).length')) === 0 && await evaluate('return !document.querySelector(".timer-pill");'));
    check('zapisany czas pojawia się w bloku „Zapisany czas dziś”',
      await evaluate('return document.querySelectorAll(".erow").length >= 1 && /min|h/.test(document.querySelector(".etoday__total").textContent);'));
    check('panel „Dzisiaj” pokazuje podział na projekty i pasek celu dnia',
      await evaluate('return document.querySelectorAll(".etoday .eproj__row").length >= 1 && !!document.querySelector(".etoday .dmtrack--big");'));
    check('po zatrzymaniu pojawia się „Wznów” ostatniego zadania',
      await evaluate('return !!document.querySelector(".etoday__resume");'));
    await pressKey('t');
    await sleep(300);
    check('klawisz T wznawia ostatnie zadanie', (await state('(s.workspace.entries || []).filter(e => !e.end).length')) === 1);
    await pressKey('t');
    await sleep(300);
    check('klawisz T zatrzymuje chodzący zegar', (await state('(s.workspace.entries || []).filter(e => !e.end).length')) === 0);
    await click('.erow .row-actions');
    await sleep(200);
    await evaluate('const item = [...document.querySelectorAll("[role=menuitem]")].find(x => /Zmień godziny/.test(x.textContent)); item.click(); return true;');
    await sleep(300);
    await evaluate('document.getElementById("tm-hours").value = "2,5"; document.getElementById("time-form").requestSubmit(); return true;');
    await sleep(300);
    check('edycja wpisu zmienia czas trwania na 2,5 h',
      await evaluate('return [...document.querySelectorAll(".erow__dur")].some(n => /2 h 30 min/.test(n.textContent));'));
    await click('.mrow:not(.mrow--approve) .trow__name');
    await sleep(300);
    await evaluate('const b = [...document.querySelectorAll("#inspector button")].find(x => /Dopisz czas/.test(x.textContent)); b.click(); return true;');
    await sleep(300);
    await evaluate('document.getElementById("tm-hours").value = "0"; document.getElementById("time-form").requestSubmit(); return true;');
    await sleep(200);
    check('wpis ręczny z zerowymi godzinami nie przechodzi walidacji', await evaluate('return !!document.querySelector("#time-form .field__error");'));
    await evaluate('document.getElementById("tm-hours").value = "1,5"; document.getElementById("tm-note").value = "Kolizja z gazem"; document.getElementById("time-form").requestSubmit(); return true;');
    await sleep(300);
    check('wpis ręczny trafia do rejestru z notatką i do bloku czasu w inspektorze',
      (await state('(s.workspace.entries || []).filter(e => e.source === "manual" && e.note === "Kolizja z gazem").length')) === 1
      && await evaluate('return /1 h 30 min|4 h/.test(document.querySelector("#inspector .insp-time__total").textContent);'));
    await pressKey('escape');

    /* 22. Wybór etapów przy zakładaniu projektu */
    await go('#/projekty');
    await pressKey('n');
    check('formularz pokazuje listę etapów do wyboru, domyślnie pustą',
      await evaluate('const boxes = [...document.querySelectorAll("#pf-stage-picker input[type=checkbox]")]; return boxes.length === window.ETROM.Catalog.all.length && boxes.every(b => !b.checked);'));
    await evaluate(
      'document.getElementById("pf-code").value = "PICK-1";' +
      'document.getElementById("pf-name").value = "Projekt z wyborem etapów";' +
      'document.getElementById("pf-client").value = "Gmina Testowa";' +
      '["preparation", "water-docs", "handover"].forEach(function (id) { document.getElementById("pf-stage-" + id).checked = true; });' +
      'document.getElementById("project-form").requestSubmit(); return true;'
    );
    await sleep(300);
    check('projekt dostaje tylko wybrane etapy, w kolejności standardu',
      (await state('(s.workspace.projects.find(x => x.code === "PICK-1") || { stages: [] }).stages.map(st => st.id).join(",")')) === 'preparation,water-docs,handover');
    await click('[data-toast-action]');
    await sleep(500);
    const pid = await projectId('PICK-1');
    check('„Otwórz” w powiadomieniu prowadzi do nowego projektu', (await evaluate('return location.hash;')) === '#/projekty/' + pid);

    /* 23. Etap spoza standardu */
    await openMenu('[data-fk="add-stage"]', 'Etap własny');
    await sleep(250);
    await evaluate('document.getElementById("cs-name").value = ""; document.getElementById("custom-stage-form").requestSubmit(); return true;');
    await sleep(200);
    check('etap własny bez nazwy nie przechodzi', await evaluate('return !!document.querySelector("#custom-stage-form .field__error");'));
    await evaluate(
      'document.getElementById("cs-name").value = "Uzgodnienie z PKP";' +
      'document.getElementById("cs-domain").value = "location";' +
      'document.getElementById("cs-hours").value = "12";' +
      'document.getElementById("custom-stage-form").requestSubmit(); return true;'
    );
    await sleep(300);
    const custom = await state('(() => { const p = s.workspace.projects.find(x => x.code === "PICK-1"); const l = p.stages[p.stages.length - 1]; return { count: p.stages.length, source: l.source, name: l.name, domain: l.domain }; })()');
    check('etap spoza standardu dopisuje się z własną nazwą i dziedziną',
      custom.count === 4 && custom.source === 'custom' && custom.name === 'Uzgodnienie z PKP' && custom.domain === 'location', JSON.stringify(custom));
    check('wiersz etapu własnego jest oznaczony w podpisie',
      await evaluate('const metas = [...document.querySelectorAll(".srow__meta")].map(n => n.textContent); return metas.some(m => /własny$/.test(m)) && metas.some(m => /standard 09$/.test(m));'));

    /* 23b. Rodzaj pracy: ikony, plakietka decyzji, pasek budżetu, grupowanie */
    check('projekt pokazuje budżet godzin według trzech rodzajów pracy',
      await evaluate('return document.querySelectorAll(".kindbar__item").length === 3 && !!document.querySelector(".kindbar__track");'));
    const decisionIds = await state('s.workspace.projects.find(x => x.code === "PICK-1").stages.filter(st => window.ETROM.Model.describeStage(st).decision).map(st => st.id)');
    const badgedIds = await evaluate('return [...document.querySelectorAll(".srow-wrap[data-stage-id]")].filter(li => li.querySelector(".stageicon--decision")).map(li => li.dataset.stageId);');
    check('plakietka decyzji pokrywa się z etapami o rodzaju „Decyzje”', JSON.stringify(decisionIds) === JSON.stringify(badgedIds), JSON.stringify(decisionIds) + ' vs ' + JSON.stringify(badgedIds));
    const kindCount = await state('new Set(s.workspace.projects.find(x => x.code === "PICK-1").stages.map(st => window.ETROM.Model.describeStage(st).kind)).size');
    await click('[data-fk="stage-group"]');
    await sleep(200);
    check('„Grupuj wg rodzaju” dodaje nagłówki rodzajów, a numeracja zostaje chronologiczna',
      (await evaluate('return document.querySelectorAll(".srow-group").length;')) === kindCount
      && (await evaluate('return document.querySelector("[data-fk=stage-group]").getAttribute("aria-pressed");')) === 'true');
    await click('[data-fk="stage-group"]');
    await sleep(200);
    check('ponowny klik wraca do kolejności chronologicznej', (await evaluate('return document.querySelectorAll(".srow-group").length;')) === 0);

    /* 23a. Edycja istniejącego etapu: godziny i termin */
    const pctBefore = await state('window.ETROM.Progress.projectProgress(s.workspace.projects.find(x => x.code === "PICK-1")).hoursTotal');
    await openMenu('.srow-wrap:first-child .srow__more', 'Edytuj etap');
    await sleep(300);
    check('edycja etapu standardowego blokuje nazwę i dziedzinę, godziny są do zmiany',
      await evaluate('const n = document.getElementById("cs-name"); const d = document.getElementById("cs-domain"); return n.readOnly && d.disabled && !document.getElementById("cs-hours").disabled && document.querySelector(".drawer, dialog[open]") !== null;'));
    await evaluate('document.getElementById("cs-hours").value = "0"; document.getElementById("custom-stage-form").requestSubmit(); return true;');
    await sleep(200);
    check('zerowy budżet godzin etapu nie przechodzi', await evaluate('return !!document.querySelector("#custom-stage-form .field__error");'));
    await evaluate('document.getElementById("cs-hours").value = "100"; document.getElementById("cs-deadline").value = "2027-05-05"; document.getElementById("custom-stage-form").requestSubmit(); return true;');
    await sleep(300);
    const edited = await state('(() => { const p = s.workspace.projects.find(x => x.code === "PICK-1"); return { id: p.stages[0].id, hours: p.stages[0].hours, deadline: p.stages[0].deadline, total: window.ETROM.Progress.projectProgress(p).hoursTotal }; })()');
    check('zapis etapu zmienia godziny i termin, a budżet projektu się przelicza',
      edited.hours === 100 && edited.deadline === '2027-05-05' && edited.total !== pctBefore, JSON.stringify(edited) + ' przed ' + pctBefore);
    check('po zapisie panel się zamyka, a termin etapu widać w wierszu',
      await evaluate('return !document.getElementById("custom-stage-form") && /2027/.test(document.querySelector(".srow-wrap:first-child .srow__deadline").textContent);'));

    /* 24. Przesuwanie etapu z menu wiersza */
    await openMenu('.srow-wrap:last-child .srow__more', 'Przesuń wyżej');
    check('etap własny daje się przesunąć pomiędzy standardowe',
      (await state('s.workspace.projects.find(x => x.code === "PICK-1").stages.map(st => st.id).join(",")')) === 'preparation,water-docs,custom-1,handover');
    check('pozycja „Przesuń wyżej” jest nieaktywna dla pierwszego etapu',
      await evaluate('document.querySelector(".srow-wrap:first-child .srow__more").click(); return true;')
      && (await evaluate('const i = [...document.querySelectorAll(".popover [role=menuitem]")].find(n => /Przesuń wyżej/.test(n.textContent)); return !!i && i.getAttribute("aria-disabled") === "true";')));
    await pressKey('escape');
    check('Escape zamyka menu wiersza bez skutków ubocznych', await evaluate('return !document.querySelector(".popover") && !document.querySelector("dialog[open]");'));

    /* 25. Ekran Zespołu */
    check('dane przykładowe zakładają katalog osób', (await state('(s.workspace.people || []).length')) === 6);
    await go('#/projekty');
    await click('#tb-columns');
    await sleep(150);
    await pickMenu('team');
    await pressKey('escape');
    check('przywrócona kolumna „Zespół” pokazuje awatary osób projektu',
      await evaluate('return !!document.querySelector(\'[data-project-code="DEMO-001"] .col-team .avatar\');')
      && (await state('s.prefs.hiddenColumns.length')) === 0);

    await click('.nav__item[data-screen="team"]');
    await sleep(500);
    check('panel boczny przełącza na ekran Zespołu',
      await evaluate('return !document.getElementById("view-team").hidden && document.getElementById("view-projects").hidden && document.querySelectorAll(".prow").length === 6;'));
    check('aktywna pozycja nawigacji ma aria-current',
      (await evaluate('return document.querySelector(\'.nav__item[data-screen="team"]\').getAttribute("aria-current");')) === 'page');
    check('wiersz osoby pokazuje funkcje pełnione w projektach jako odnośniki',
      await evaluate('const links = [...document.querySelectorAll(".prow .role-link")]; return links.some(l => l.textContent.indexOf("DEMO-") === 0 && /Lider/.test(l.textContent) && /^#\\/projekty\\/\\d+\\/zespol$/.test(l.getAttribute("href")));'));

    /* 26. Dodawanie i walidacja osoby */
    await evaluate('document.activeElement && document.activeElement.blur(); return true;');
    await pressKey('n');
    check('na ekranie Zespołu klawisz N otwiera formularz osoby', await evaluate('return !!document.querySelector("dialog.drawer[open] #person-form");'));
    await evaluate(
      'document.getElementById("pe-first").value = "Zofia";' +
      'document.getElementById("pe-last").value = "Nowakowa";' +
      'document.getElementById("pe-position").value = "Geodetka";' +
      'document.getElementById("pe-role").value = "member";' +
      'document.getElementById("person-form").requestSubmit(); return true;'
    );
    await sleep(300);
    check('nowa osoba trafia do katalogu', (await state('s.workspace.people.length')) === 7);

    await pressKey('n');
    await evaluate(
      'document.getElementById("pe-first").value = "zofia";' +
      'document.getElementById("pe-last").value = "NOWAKOWA";' +
      'document.getElementById("person-form").requestSubmit(); return true;'
    );
    await sleep(250);
    check('druga osoba o tym samym imieniu i nazwisku nie przechodzi',
      await evaluate('const err = document.querySelector("#person-form .field__error"); return !!err && /już jest/i.test(err.textContent);'));
    await pressKey('escape');
    await sleep(250);

    /* 27. Wyłączanie osoby i jego blokada */
    const anna = await state('s.workspace.people.find(x => x.firstName === "Anna").id');
    await evaluate('document.querySelectorAll(".toast__close").forEach(b => b.click()); return true;');
    await openMenu('[data-person-id="' + anna + '"] .row-actions', 'toggle');
    check('nie da się wyłączyć osoby pełniącej funkcję w czynnym projekcie',
      await evaluate('const t = document.querySelector(".toast__text"); const p = window.ETROM.app.store.getState().workspace.people.find(x => x.id === "' + anna + '"); return p.active === true && !!t && /niezakończonych/i.test(t.textContent);'));

    const zofia = await state('s.workspace.people.find(x => x.firstName === "Zofia").id');
    await openMenu('[data-person-id="' + zofia + '"] .row-actions', 'toggle');
    check('osobę bez przypisań da się wyłączyć z obiegu', (await state('s.workspace.people.find(x => x.id === "' + zofia + '").active')) === false);
    check('wyłączona osoba znika z listy, gdy filtr jej nie pokazuje', !(await evaluate('return !!document.querySelector(\'[data-person-id="' + zofia + '"]\');')));
    await click('[data-toast-action]');
    await sleep(300);
    check('po cofnięciu osoba wraca do obiegu', (await state('s.workspace.people.find(x => x.id === "' + zofia + '").active')) === true);

    /* 28. Filtr osoby na ekranie projektów */
    await go('#/projekty');
    const expected = await state('s.workspace.projects.filter(p => window.ETROM.Team.projectPeople(p.team).indexOf("' + anna + '") >= 0).length');
    await openMenu('#tb-person', anna);
    const shown = await cardCount();
    check('filtr osoby zawęża listę do jej projektów', shown === expected && shown > 0, 'pokazano ' + shown + ', oczekiwano ' + expected);
    await openMenu('#tb-person', 'all');

    /* 29. Paleta znajduje osoby */
    await pressKey('k', CTRL);
    await evaluate('const input = document.querySelector(".palette__input"); input.value = "zofia"; input.dispatchEvent(new Event("input", { bubbles: true })); return true;');
    await sleep(250);
    check('paleta pokazuje osoby w osobnej grupie',
      await evaluate('const g = [...document.querySelectorAll(".palette__group")].map(x => x.textContent); const l = [...document.querySelectorAll(".palette__rowLabel")].map(x => x.textContent); return g.indexOf("Osoby") >= 0 && l.some(x => x.indexOf("Zofia") === 0);'));
    await pressKey('escape');
    await sleep(200);

    /* 30. Zadania w etapach */
    check('dane przykładowe zawierają zadania w etapach', (await state('s.workspace.projects.flatMap(p => p.stages).flatMap(st => st.tasks || []).length')) >= 6);
    await go('#/projekty/' + id2);
    check('wiersz etapu pokazuje licznik otwartych zadań',
      await evaluate('return [...document.querySelectorAll(".srow__tasks")].some(c => /^\\d+\\/\\d+$/.test(c.textContent));'));
    check('etap pokazuje pasek rozkładu statusów zadań',
      await evaluate('return document.querySelectorAll(".sbar .sbar__seg").length >= 1;'));
    check('zadanie w toku ma szybki krok „Zgłoś do zatwierdzenia”',
      await evaluate('return [...document.querySelectorAll(".trow--working .trow__step")].some(b => b.textContent === "Zgłoś do zatwierdzenia");'));
    check('bieżący etap jest od razu rozwinięty z zadaniami',
      await evaluate('const w = document.querySelector(".srow--working"); return !!w && w.querySelector(".srow__expand").getAttribute("aria-expanded") === "true";')
      && (await evaluate('return document.querySelectorAll(".trow").length;')) > 0);
    await evaluate('const w = [...document.querySelectorAll(".srow-wrap[data-stage-id]")].find(w => w.querySelector(".srow__tasks").textContent !== "—" && w.querySelector(".srow__expand").getAttribute("aria-expanded") === "false"); w.querySelector(".srow__expand").click(); return true;');
    await sleep(300);
    check('rozwinięcie kolejnego etapu pokazuje jego zadania', (await evaluate('return document.querySelectorAll(".srow__panel .trow").length;')) >= 3);
    check('przyciski rozwinięcia ogłaszają stan', await evaluate('return document.querySelectorAll(\'.srow__expand[aria-expanded="true"]\').length === 2;'));

    /* 31. Nowe zadanie */
    await click('.srow__panel [data-action="add-task"]');
    await sleep(300);
    check('formularz zadania proponuje wyłącznie osoby z zespołu projektu',
      await evaluate('const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.code === "DEMO-002"); const allowed = window.ETROM.Team.projectPeople(p.team); const boxes = [...document.querySelectorAll("#tk-assignees input")].map(b => b.value); return boxes.length === allowed.length && boxes.every(id => allowed.indexOf(id) >= 0);'));
    const taskCount = () => state('s.workspace.projects.flatMap(p => p.stages).flatMap(st => st.tasks || []).length');
    const beforeTasks = await taskCount();
    await evaluate(
      'document.getElementById("tk-name").value = "Sprawdzić zestawienie stali";' +
      'document.querySelectorAll("#tk-assignees input")[0].checked = true;' +
      'document.getElementById("task-form").requestSubmit(); return true;'
    );
    await sleep(350);
    check('nowe zadanie trafia do etapu', (await taskCount()) === beforeTasks + 1);

    /* 32. Przepływ statusów przez menu */
    const taskRowSel = (name) => 'const row = [...document.querySelectorAll(".trow")].find(r => r.textContent.indexOf(' + JSON.stringify(name) + ') >= 0);';
    await evaluate(taskRowSel('Sprawdzić zestawienie stali') + 'row.querySelector(".trow__status").click(); return true;');
    await sleep(150);
    check('menu statusu zawiera tylko dozwolone przejścia',
      (await evaluate('return [...document.querySelectorAll(".popover [role=menuitem]")].map(i => i.dataset.value).join(",");')) === 'working,review,done');
    await pickMenu('working');
    check('zmiana statusu zapisuje się razem z wpisem w historii',
      await state('(() => { const t = s.workspace.projects.flatMap(p => p.stages).flatMap(st => st.tasks || []).find(x => x.name === "Sprawdzić zestawienie stali"); return t.status === "working" && t.history.length === 1 && t.history[0].to === "working"; })()'));

    /* 33. Zwrot do poprawy wymaga powodu */
    await evaluate(taskRowSel('Uzgodnić kolizję') + 'row.querySelector(".trow__status").click(); return true;');
    await sleep(150);
    await pickMenu('changes');
    await sleep(200);
    check('zwrot do poprawy pyta o powód', await evaluate('return !!document.querySelector("dialog.dialog[open] [data-dialog-input]");'));
    await click('[data-dialog-confirm]');
    await sleep(200);
    check('pusty powód nie przechodzi', await evaluate('return !!document.querySelector("dialog.dialog[open] .field__error");'));
    await evaluate('document.querySelector("[data-dialog-input]").value = "Brakuje przekroju A-A."; document.querySelector("[data-dialog-confirm]").click(); return true;');
    await sleep(350);
    check('po podaniu powodu zadanie wraca do poprawy z notatką',
      await state('(() => { const t = s.workspace.projects.flatMap(p => p.stages).flatMap(st => st.tasks || []).find(x => x.name.indexOf("Uzgodnić kolizję") >= 0); return t.status === "changes" && t.feedback === "Brakuje przekroju A-A."; })()'));
    check('notatka do poprawy jest widoczna w wierszu zadania',
      await evaluate(taskRowSel('Uzgodnić kolizję') + 'return !!row && /Brakuje przekroju A-A/.test(row.querySelector(".trow__feedback").textContent);'));

    /* 34. Udział pojedynczego realizatora */
    await evaluate('const row = [...document.querySelectorAll(".trow")].find(r => r.querySelector(".part")); row.querySelector(".part").click(); return true;');
    await sleep(300);
    check('kliknięcie realizatora przestawia jego udział',
      await state('s.workspace.projects.flatMap(p => p.stages).flatMap(st => st.tasks || []).some(t => Object.keys(t.parts || {}).some(k => t.parts[k] === "working" || t.parts[k] === "done"))'));

    /* 35. Usuwanie zadania z cofnięciem */
    const tasksBeforeDelete = await taskCount();
    await evaluate('document.querySelectorAll(".toast__close").forEach(b => b.click()); return true;');
    await evaluate(taskRowSel('Sprawdzić zestawienie stali') + 'row.querySelector(".row-actions").click(); return true;');
    await sleep(150);
    await pickMenu('Usuń zadanie');
    check('usunięcie zadania działa od razu', (await taskCount()) === tasksBeforeDelete - 1);
    await click('[data-toast-action]');
    await sleep(300);
    check('usunięte zadanie wraca po cofnięciu', (await taskCount()) === tasksBeforeDelete);

    /* 36. Zakładka Zadania grupuje po etapach */
    await click('.tabs__tab[data-tab="zadania"]');
    await sleep(450);
    check('zakładka Zadania grupuje otwarte zadania według etapów',
      (await evaluate('return location.hash;')) === '#/projekty/' + id2 + '/zadania'
      && (await evaluate('return document.querySelectorAll(".task-group").length;')) >= 2);

    /* 37. Projekt bez danych i zły adres */
    await go('#/projekty/99999');
    check('nieistniejący projekt pokazuje pusty stan z drogą powrotu',
      await evaluate('return /Nie znaleziono projektu/.test(document.getElementById("project-view").textContent);'));

    /* 38. Język wizualny: stan projektu, przebieg, inspektor */
    await go('#/projekty');
    check('wiersz projektu niesie znak stanu i profil przebiegu',
      await evaluate('const r = document.querySelector(\'[data-project-code="DEMO-002"]\'); return !!r.querySelector(".datum--alarm") && !!r.querySelector(".flow--mini");'));
    await evaluate('document.querySelector(\'[data-project-code="DEMO-001"] .project-link\').focus(); return true;');
    await pressKey('space');
    check('Spacja na projekcie otwiera podgląd w inspektorze bez opuszczania listy',
      (await state('s.inspector && s.inspector.kind')) === 'project' && (await evaluate('return location.hash;')) === '#/projekty');
    await pressKey('escape');
    check('kokpit wskazuje projekty wymagające uwagi',
      await evaluate('return !!document.querySelector(".cockpit") && /wymaga/.test(document.querySelector(".cockpit").textContent);'));
    await go('#/projekty/' + id2);
    check('nagłówek projektu pokazuje profil z bieżącym etapem i stan alarmowy',
      await evaluate('return !!document.querySelector(".flow--hero .flow__seg.is-current") && !!document.querySelector(".level--alarm");'));
    check('miernik podaje postęp, plan i bieżący etap także czytnikowi ekranu',
      await evaluate('const g = document.querySelector(".gauge"); const l = g.getAttribute("aria-label"); return g.getAttribute("role") === "img" && /Postęp \\d+%/.test(l) && /plan \\d+%/.test(l) && /bieżący etap/.test(l) && !!g.querySelector(".gauge__plan") && !!g.querySelector(".gauge__now");'));
    check('stan projektu to drabinka progów z jednym aktywnym szczeblem i powodem słowami',
      await evaluate('const r = document.querySelectorAll(".level--hero .rung"); return r.length === 3 && document.querySelectorAll(".level--hero .rung[aria-current=\\"true\\"]").length === 1 && document.querySelector(".level__lead").textContent.length > 8;'));
    check('status i stan to dwa osobne wymiary: status jest przyciskiem, stan nie',
      await evaluate('return !!document.querySelector(".workspace-head__id .detail__status") && !document.querySelector(".level .rung button");'));
    check('stan projektu pokazuje „Najbliższy próg” albo przyczynę, a powody są klikalne',
      await evaluate('return !!document.querySelector(".level__reason") && (!!document.querySelector(".level__limit") || document.querySelector(".level--alarm"));'));
    check('„Najbliższa akcja” wskazuje zadanie z krótkim powodem',
      await evaluate('const n = document.querySelector(".naction--alarm, .naction--warning, .naction--normal"); return !!n && n.querySelector(".naction__title").textContent.length > 3 && !!n.querySelector(".naction__lead");'));
    check('zespół w nagłówku nie powtarza tej samej osoby',
      await evaluate('const n = [...document.querySelectorAll(".signatures__list .signature__name")].map(x => x.textContent); return n.length === new Set(n).size;'));
    await click('[data-fk="gauge-detail"]');
    await sleep(400);
    check('klik w odczyt miernika otwiera plan i odchylenia z trzema sekcjami',
      await evaluate('const i = document.getElementById("inspector"); return !!i && !i.hidden && i.querySelectorAll(".vrow").length === 3;'));
    await pressKey('escape');
    await sleep(250);
    await click('[data-fk="next-action"]');
    await sleep(400);
    check('„Przejdź do zadania” otwiera inspektor tego zadania',
      await evaluate('const i = document.getElementById("inspector"); return !!i && !i.hidden && !!i.querySelector(".history");'));
    await pressKey('escape');
    await sleep(250);
    await click('.gauge__note');
    await sleep(500);
    check('podpis etapu w mierniku prowadzi do bieżącego etapu na liście',
      await evaluate('const row = document.querySelector(".srow-wrap.is-current, .srow-wrap[data-stage-id]"); return !!document.querySelector(".srow-wrap[data-stage-id]");'));
    check('odcinek toru przebiegu jest przyciskiem z pełnym opisem etapu i stanu',
      await evaluate('const b = document.querySelector("button.flow__seg.is-current"); return !!b && /w toku/.test(b.getAttribute("aria-label")) && b.getAttribute("aria-current") === "step";'));
    await evaluate('document.querySelector(".trow__name").focus(); document.querySelector(".trow__name").click(); return true;');
    await sleep(400);
    check('nazwa zadania otwiera inspektor z historią zmian',
      await evaluate('const i = document.getElementById("inspector"); return !!i && !!i.querySelector("#inspector-title") && !!i.querySelector(".history");')
      && (await evaluate('return location.hash;')) === '#/projekty/' + id2);
    await pressKey('escape');
    check('Escape zamyka inspektor i oddaje fokus nazwie zadania',
      (await state('s.inspector')) === null
      && (await evaluate('return document.activeElement && document.activeElement.classList.contains("trow__name");')));
    await evaluate('document.activeElement && document.activeElement.blur(); return true;');
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "[", bubbles: true })); return true;');
    await sleep(400);
    check('klawisz [ zwija panel boczny i zapamiętuje to',
      (await evaluate('return document.getElementById("app").classList.contains("app--collapsed");'))
      && (await evaluate('return JSON.parse(localStorage.getItem("etrom.prefs.v1")).sidebarCollapsed;')) === true);
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "[", bubbles: true })); return true;');
    await sleep(300);

    /* 39. Brak błędów i wyjątków w konsoli przez cały scenariusz */
    check('brak wyjątków i błędów konsoli w całym scenariuszu', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  } finally {
    if (client) client.close();
    child.kill('SIGKILL');
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (error) { /* bez znaczenia */ }
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write('\n' + (results.length - failed.length) + '/' + results.length + ' sprawdzeń przeszło\n');
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write('\nTest przerwany: ' + error.message + '\n');
  process.exitCode = 1;
});
