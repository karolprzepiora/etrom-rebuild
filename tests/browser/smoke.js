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

    const cardCount = () => evaluate('return document.querySelectorAll(".project").length;');
    const click = (selector) => evaluate(
      'const node = document.querySelector(' + JSON.stringify(selector) + ');' +
      'if (!node) throw new Error("brak elementu: ' + selector + '");' +
      'node.click(); return true;'
    );

    // Prawdziwe zdarzenia klawiatury — inaczej natywny <dialog> nie zareaguje na Escape.
    const KEYS = {
      n: { key: 'n', code: 'KeyN', vk: 78, text: 'n' },
      slash: { key: '/', code: 'Slash', vk: 191, text: '/' },
      k: { key: 'k', code: 'KeyK', vk: 75, text: 'k' },
      enter: { key: 'Enter', code: 'Enter', vk: 13, text: '' },
      escape: { key: 'Escape', code: 'Escape', vk: 27, text: '' }
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
    check('start bez danych pokazuje stan pusty',
      (await cardCount()) === 0 && (await evaluate('return document.querySelector(".empty__title").textContent;')) === 'Nie ma jeszcze żadnego projektu');

    check('skrypty wczytały się z file:// (bez serwera)',
      (await evaluate('return location.protocol;')) === 'file:' &&
      (await evaluate('return Object.keys(window.ETROM).sort().join(",");')).includes('Model'));

    /* 2. Dane testowe */
    await click('#action-demo');
    check('dane testowe dodają 5 projektów', (await cardCount()) === 5, 'było ' + (await cardCount()));

    check('każdy projekt testowy ma 14 etapów w katalogowej kolejności',
      await evaluate(
        'const ws = window.ETROM.app.store.getState().workspace;' +
        'return ws.projects.every(p => p.stages.length === 14);'
      ));

    /* 3. Zapis lokalny */
    const stored = await evaluate(
      'const raw = localStorage.getItem("etrom.v3");' +
      'return raw ? JSON.parse(raw).projects.length : -1;'
    );
    check('dane trafiają do localStorage na file://', stored === 5, 'zapisano: ' + stored);

    /* 4. Trwałość po przeładowaniu — od tego momentu liczymy błędy strony
          od czystego wczytania, razem z fazą startu aplikacji. */
    pageErrors = [];
    await evaluate('location.reload(); return true;');
    await sleep(600);
    await waitForApp();
    check('po przeładowaniu projekty nadal są', (await cardCount()) === 5, 'było ' + (await cardCount()));

    /* 5. Wyszukiwanie */
    await evaluate(
      'const input = document.getElementById("tb-search");' +
      'input.value = "Lipnica";' +
      'input.dispatchEvent(new Event("input", { bubbles: true })); return true;'
    );
    check('szukanie po nazwie zawęża listę do jednego projektu', (await cardCount()) === 1, 'było ' + (await cardCount()));

    await evaluate(
      'const input = document.getElementById("tb-search");' +
      'input.value = "";' +
      'input.dispatchEvent(new Event("input", { bubbles: true })); return true;'
    );
    check('wyczyszczenie szukania przywraca pełną listę', (await cardCount()) === 5);

    /* 6. Filtr statusu */
    await evaluate(
      'const select = document.getElementById("tb-status");' +
      'select.value = "done";' +
      'select.dispatchEvent(new Event("change", { bubbles: true })); return true;'
    );
    check('filtr statusu „Zakończony” pokazuje 1 projekt', (await cardCount()) === 1, 'było ' + (await cardCount()));
    await evaluate(
      'const select = document.getElementById("tb-status");' +
      'select.value = "all";' +
      'select.dispatchEvent(new Event("change", { bubbles: true })); return true;'
    );

    /* 7. Sortowanie po terminie — projekt po terminie na początku */
    await evaluate(
      'const select = document.getElementById("tb-sort");' +
      'select.value = "deadline";' +
      'select.dispatchEvent(new Event("change", { bubbles: true })); return true;'
    );
    const order = await evaluate(
      'return [...document.querySelectorAll(".project")].map(c => c.dataset.projectCode).join(",");'
    );
    check('sortowanie po terminie: czynny projekt po terminie na czele, zakończony na końcu',
      order.split(',')[0] === 'DEMO-002' && order.split(',').pop() === 'DEMO-005', 'kolejność: ' + order);

    /* 8. Rozwinięcie etapów */
    await evaluate(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'card.querySelectorAll(".btn--small")[0].click(); return true;'
    );
    const stageRows = await evaluate(
      'return document.querySelector(\'[data-project-code="DEMO-002"]\').querySelectorAll(".srow").length;'
    );
    check('rozwinięcie karty pokazuje listę 14 etapów', stageRows === 14, 'wierszy: ' + stageRows);

    /* 9. Zmiana statusu etapu przelicza postęp */
    const before = await evaluate(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'return card.querySelector(".meter__track").getAttribute("aria-valuenow");'
    );
    await evaluate(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'const rows = card.querySelectorAll(".srow");' +
      'const last = rows[rows.length - 1];' +
      'last.querySelector(".srow__status").click(); return true;'
    );
    const statusAfter = await evaluate(
      'const ws = window.ETROM.app.store.getState().workspace;' +
      'const p = ws.projects.find(x => x.code === "DEMO-002");' +
      'return p.stages[13].status;'
    );
    check('klik na status etapu przechodzi todo → W toku', statusAfter === 'working', 'status: ' + statusAfter);

    await evaluate(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'const rows = card.querySelectorAll(".srow");' +
      'rows[rows.length - 1].querySelector(".srow__status").click(); return true;'
    );
    const after = await evaluate(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'return card.querySelector(".meter__track").getAttribute("aria-valuenow");'
    );
    check('oznaczenie etapu jako zakończony podnosi postęp',
      Number(after) > Number(before), 'przed ' + before + '%, po ' + after + '%');

    /* 10. Walidacja formularza: powtórzony kod */
    await click('#action-new');
    await evaluate(
      'document.getElementById("pf-code").value = "DEMO-001";' +
      'document.getElementById("pf-name").value = "Próba duplikatu";' +
      'document.getElementById("pf-client").value = "Klient";' +
      'document.getElementById("project-form").requestSubmit(); return true;'
    );
    await sleep(150);
    const duplicateError = await evaluate(
      'const node = document.querySelector("#project-form .field__error");' +
      'return node ? node.textContent : "";'
    );
    check('formularz blokuje powtórzony kod projektu',
      /już istnieje/i.test(duplicateError) && (await cardCount()) === 5, 'komunikat: "' + duplicateError + '"');

    /* 11. Poprawne dodanie projektu */
    await evaluate(
      'document.getElementById("pf-code").value = "NOWY-9";' +
      'document.getElementById("pf-name").value = "Projekt z testu";' +
      'document.getElementById("pf-client").value = "Klient testowy";' +
      'document.getElementById("project-form").requestSubmit(); return true;'
    );
    await sleep(150);
    check('poprawny formularz dodaje projekt i zamyka panel',
      (await cardCount()) === 6 && (await evaluate('return document.querySelectorAll("#project-form").length;')) === 0,
      'kart: ' + (await cardCount()));

    /* 12. Dane użytkownika nie są wykonywane jako HTML */
    await click('#action-new');
    await evaluate(
      'document.getElementById("pf-code").value = "XSS-1";' +
      'document.getElementById("pf-name").value = \'<img src=x onerror="window.__xss=1">\';' +
      'document.getElementById("pf-client").value = "Klient";' +
      'document.getElementById("project-form").requestSubmit(); return true;'
    );
    await sleep(250);
    const xss = await evaluate('return { flag: !!window.__xss, imgs: document.querySelectorAll(".project img").length };');
    const xssText = await evaluate(
      'const card = document.querySelector(\'[data-project-code="XSS-1"]\');' +
      'return card ? card.querySelector(".project__name").textContent : "";'
    );
    check('nazwa ze znacznikami HTML wyświetla się jako tekst, nie wykonuje się',
      xss.flag === false && xss.imgs === 0 && xssText.indexOf('<img') === 0,
      JSON.stringify(xss) + ' tekst: ' + xssText);

    /* 13. Usuwanie z możliwością cofnięcia */
    const codesBefore = await evaluate(
      'return window.ETROM.app.store.getState().workspace.projects.map(p => p.code).join(",");'
    );

    await evaluate(
      'const card = document.querySelector(\'[data-project-code="XSS-1"]\');' +
      'card.querySelector(".project__remove").click(); return true;'
    );
    await sleep(500);

    check('usunięcie działa od razu, bez pytania w osobnym oknie',
      await evaluate(
        'return !document.querySelector(\'[data-project-code="XSS-1"]\') && !document.querySelector("dialog[open]");'
      ));

    check('pojawia się pasek z możliwością cofnięcia',
      await evaluate('return !!document.querySelector("[data-toast-action]");'));

    await evaluate('document.querySelector("[data-toast-action]").click(); return true;');
    await sleep(300);

    const codesAfterUndo = await evaluate(
      'return window.ETROM.app.store.getState().workspace.projects.map(p => p.code).join(",");'
    );
    check('cofnięcie przywraca projekt na to samo miejsce listy',
      codesAfterUndo === codesBefore, 'przed: ' + codesBefore + ' | po cofnięciu: ' + codesAfterUndo);

    // Usuwamy ponownie i tym razem zostawiamy, zamykając pasek.
    await evaluate(
      'const card = document.querySelector(\'[data-project-code="XSS-1"]\');' +
      'card.querySelector(".project__remove").click(); return true;'
    );
    await sleep(500);
    await evaluate('document.querySelector(".toast__close").click(); return true;');
    await sleep(300);
    check('po zamknięciu paska usunięcie zostaje w mocy',
      await evaluate('return !document.querySelector(\'[data-project-code="XSS-1"]\');'));

    /* 14. Dane testowe nie duplikują się */
    await click('#action-demo');
    check('powtórne dodanie danych testowych nie tworzy duplikatów',
      (await evaluate(
        'const ws = window.ETROM.app.store.getState().workspace;' +
        'const codes = ws.projects.map(p => p.code);' +
        'return codes.length === new Set(codes).size;'
      )));

    /* 15. Klawiatura */
    await pressKey('n');
    check('klawisz N otwiera panel nowego projektu',
      await evaluate('return !!document.querySelector("dialog.drawer[open] #project-form");'));

    await pressKey('escape');
    check('Escape zamyka panel',
      await evaluate('return !document.querySelector("dialog.drawer[open]");'));

    await pressKey('slash');
    check('ukośnik przenosi kursor do wyszukiwarki',
      (await evaluate('return document.activeElement ? document.activeElement.id : "";')) === 'tb-search');
    await evaluate('document.activeElement.blur(); return true;');

    /* 16. Widok listy */
    await evaluate('document.querySelector(\'.segmented__btn[aria-label="Widok listy"]\').click(); return true;');
    await sleep(500);
    const listCheck = await evaluate(
      'return { rows: document.querySelectorAll(".table__row").length,' +
      ' projects: window.ETROM.app.store.getState().workspace.projects.length };'
    );
    check('przełącznik pokazuje listę z wierszem na każdy projekt',
      listCheck.rows === listCheck.projects && listCheck.rows > 0, JSON.stringify(listCheck));

    check('sortowanie z nagłówka kolumny działa w widoku listy',
      await evaluate(
        'const headers = [...document.querySelectorAll(".table__sort")];' +
        'const byName = headers.find(h => h.textContent.indexOf("Projekt") === 0);' +
        'byName.click();' +
        'return document.getElementById("tb-sort").value === "name";'
      ));

    /* 17. Zapamiętanie widoku i motywu */
    await evaluate('document.querySelector(\'.segmented__btn[aria-label="Motyw ciemny"]\').click(); return true;');
    await sleep(150);
    check('przełącznik motywu ustawia motyw ciemny',
      (await evaluate('return document.documentElement.getAttribute("data-theme");')) === 'dark');

    await evaluate('location.reload(); return true;');
    await sleep(600);
    await waitForApp();
    const kept = await evaluate(
      'return { theme: document.documentElement.getAttribute("data-theme"),' +
      ' rows: document.querySelectorAll(".table__row").length,' +
      ' projects: window.ETROM.app.store.getState().workspace.projects.length };'
    );
    check('po przeładowaniu zostają wybrany motyw i widok listy',
      kept.theme === 'dark' && kept.rows === kept.projects && kept.rows > 0, JSON.stringify(kept));

    await evaluate('document.querySelector(\'.segmented__btn[aria-label="Widok kart"]\').click(); return true;');
    await sleep(500);

    /* 18. Pasek etapów na karcie */
    check('karta pokazuje po jednym segmencie na każdy etap',
      await evaluate(
        'const card = document.querySelector(\'[data-project-code="DEMO-001"]\');' +
        'return card.querySelectorAll(".strip__seg").length === 14;'
      ));

    /* 19. Paleta poleceń */
    await pressKey('k', CTRL);
    check('Ctrl+K otwiera paletę poleceń',
      await evaluate('return !!document.querySelector("dialog.palette[open]");'));

    await evaluate(
      'const input = document.querySelector(".palette__input");' +
      'input.value = "lipnic";' +
      'input.dispatchEvent(new Event("input", { bubbles: true })); return true;'
    );
    await sleep(200);
    const firstRow = await evaluate(
      'const row = document.querySelector(".palette__row--active .palette__rowLabel");' +
      'return row ? row.textContent : "";'
    );
    check('wpisanie fragmentu nazwy podnosi właściwy projekt na pierwsze miejsce',
      firstRow.indexOf('Lipnic') >= 0, 'pierwszy wynik: "' + firstRow + '"');

    await pressKey('enter');
    await sleep(300);
    check('Enter zamyka paletę i rozwija wybrany projekt',
      await evaluate(
        'return !document.querySelector("dialog.palette[open]") &&' +
        ' !!document.querySelector(\'[data-project-code="DEMO-001"] .srow\');'
      ));

    await pressKey('k', CTRL);
    await evaluate(
      'const input = document.querySelector(".palette__input");' +
      'input.value = "barwy hydro";' +
      'input.dispatchEvent(new Event("input", { bubbles: true })); return true;'
    );
    await sleep(200);
    await pressKey('enter');
    await sleep(300);
    check('polecenie z palety zmienia wariant barw',
      (await evaluate('return document.documentElement.getAttribute("data-accent");')) === 'hydro');

    await pressKey('k', CTRL);
    await pressKey('escape');
    check('Escape zamyka paletę',
      await evaluate('return !document.querySelector("dialog.palette[open]");'));

    /* 20. Wybór etapów przy zakładaniu projektu */
    await pressKey('n');
    check('formularz pokazuje listę etapów do wyboru, domyślnie pustą',
      await evaluate(
        'const boxes = [...document.querySelectorAll(".picker__item input")];' +
        'return boxes.length === 14 && boxes.every(b => !b.checked);'
      ));

    await evaluate(
      'document.getElementById("pf-code").value = "PICK-1";' +
      'document.getElementById("pf-name").value = "Projekt z wyborem etapów";' +
      'document.getElementById("pf-client").value = "Gmina Testowa";' +
      '["preparation", "water-docs", "handover"].forEach(function (id) {' +
      '  document.getElementById("pf-stage-" + id).checked = true;' +
      '});' +
      'document.getElementById("project-form").requestSubmit(); return true;'
    );
    await sleep(300);

    const picked = await evaluate(
      'const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.code === "PICK-1");' +
      'return p ? p.stages.map(s => s.id).join(",") : "";'
    );
    check('projekt dostaje tylko wybrane etapy, w kolejności standardu',
      picked === 'preparation,water-docs,handover', 'etapy: ' + picked);

    /* 21. Etap spoza standardu */
    await evaluate(
      'const card = document.querySelector(\'[data-project-code="PICK-1"]\');' +
      'card.querySelectorAll(".btn--small")[0].click(); return true;'
    );
    await sleep(250);
    await evaluate(
      'const card = document.querySelector(\'[data-project-code="PICK-1"]\');' +
      'const btn = [...card.querySelectorAll("button")].find(b => b.textContent.indexOf("Dopisz") === 0);' +
      'btn.click(); return true;'
    );
    await sleep(250);

    await evaluate(
      'document.getElementById("cs-name").value = "";' +
      'document.getElementById("custom-stage-form").requestSubmit(); return true;'
    );
    await sleep(200);
    check('etap własny bez nazwy nie przechodzi',
      await evaluate('return !!document.querySelector("#custom-stage-form .field__error");'));

    await evaluate(
      'document.getElementById("cs-name").value = "Uzgodnienie z PKP";' +
      'document.getElementById("cs-domain").value = "location";' +
      'document.getElementById("cs-hours").value = "12";' +
      'document.getElementById("custom-stage-form").requestSubmit(); return true;'
    );
    await sleep(300);

    const custom = await evaluate(
      'const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.code === "PICK-1");' +
      'const last = p.stages[p.stages.length - 1];' +
      'return { count: p.stages.length, source: last.source, name: last.name, domain: last.domain };'
    );
    check('etap spoza standardu dopisuje się z własną nazwą i dziedziną',
      custom.count === 4 && custom.source === 'custom' && custom.name === 'Uzgodnienie z PKP' && custom.domain === 'location',
      JSON.stringify(custom));

    check('wiersz etapu własnego jest oznaczony w podpisie',
      await evaluate(
        'const card = document.querySelector(\'[data-project-code="PICK-1"]\');' +
        'const metas = [...card.querySelectorAll(".srow__meta")].map(n => n.textContent);' +
        'return metas.some(m => m.indexOf("własny") >= 0) && metas.some(m => m.indexOf("standard 07") >= 0);'
      ));

    /* 22. Przesuwanie etapu */
    await evaluate(
      'const card = document.querySelector(\'[data-project-code="PICK-1"]\');' +
      'const rows = card.querySelectorAll(".srow");' +
      'rows[rows.length - 1].querySelector(".srow__tools > button").click(); return true;'
    );
    await sleep(250);
    const stageOrder = await evaluate(
      'const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.code === "PICK-1");' +
      'return p.stages.map(s => s.id).join(",");'
    );
    check('etap własny daje się przesunąć pomiędzy standardowe',
      stageOrder === 'preparation,water-docs,custom-1,handover', 'kolejność: ' + stageOrder);

    /* 23. Brak błędów i wyjątków w konsoli przez cały scenariusz */
    check('brak wyjątków i błędów konsoli w całym scenariuszu',
      pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

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
