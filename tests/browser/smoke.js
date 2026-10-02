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
        if (ready) {
          if (!/^#\/projekty/.test(await evaluate('return location.hash;')) && !waitForApp.startChecked) {
            waitForApp.startChecked = true;
            check('start aplikacji to „Moja praca”', !(await evaluate('return document.getElementById("view-mywork").hidden;')));
            await go('#/projekty');
          }
          return;
        }
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
      j: { key: 'j', code: 'KeyJ', vk: 74, text: 'j' },
      v: { key: 'v', code: 'KeyV', vk: 86, text: 'v' },
      s: { key: 's', code: 'KeyS', vk: 83, text: 's' },
      rbracket: { key: ']', code: 'BracketRight', vk: 221, text: ']' },
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

    /* 7. Sortowanie: domyślnie po numerze projektu, bez grup; kierunek można odwrócić */
    const order = await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");');
    check('lista jest posortowana po numerze projektu (rosnąco) i nie ma grup',
      order === '2601,2602,2603,2604,2605' && (await state('s.prefs.groupBy')) === 'none' && (await evaluate('return document.querySelectorAll("#project-list .group-row").length;')) === 0, 'kolejność: ' + order);
    await evaluate('document.querySelector(\'.table__sort[data-sort="code"]\').click(); return true;');
    await sleep(150);
    check('drugi klik w „Nr” odwraca kolejność, nagłówek ogłasza kierunek',
      (await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");')) === '2605,2604,2603,2602,2601'
      && (await evaluate('return document.querySelector(\'th[aria-sort]\').getAttribute("aria-sort");')) === 'descending');
    await evaluate('document.querySelector(\'.table__sort[data-sort="code"]\').click(); return true;');
    await sleep(100);
    await openMenu('#tb-sort', 'deadline');
    const byDeadline = await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");');
    check('sortowanie po terminie: czynny projekt po terminie na czele, zakończony na końcu',
      byDeadline.split(',')[0] === '2602' && byDeadline.split(',').pop() === '2605', 'kolejność: ' + byDeadline);

    check('sortowanie z nagłówka kolumny',
      await evaluate('document.querySelector(\'.table__sort[data-sort="name"]\').click(); return true;')
      && (await state('s.filters.sort')) === 'name'
      && (await evaluate('return document.querySelector(\'th[aria-sort] .table__sort\').dataset.sort;')) === 'name');
    await openMenu('#tb-sort', 'deadline');
    check('menu sortowania wraca do terminu', (await state('s.filters.sort')) === 'deadline');
    await openMenu('#tb-sort', 'code');

    /* 7-. Klawiatura na liście: J/K przechodzą po projektach, V zmienia widok */
    await evaluate('document.activeElement && document.activeElement.blur(); return true;');
    await pressKey('j');
    const firstFocus = await evaluate('return document.activeElement && document.activeElement.classList.contains("project-link") ? document.activeElement.textContent : null;');
    await pressKey('j');
    const secondFocus = await evaluate('return document.activeElement && document.activeElement.classList.contains("project-link") ? document.activeElement.textContent : null;');
    await pressKey('k');
    check('J i K przesuwają fokus po projektach na liście', !!firstFocus && !!secondFocus && firstFocus !== secondFocus && (await evaluate('return document.activeElement.textContent;')) === firstFocus);
    await evaluate('document.activeElement.blur(); return true;');
    await pressKey('v');
    check('V przełącza widok listy projektów na karty', (await state('s.prefs.view')) === 'cards');
    await pressKey('v');
    check('V przełącza z powrotem na tabelę', (await state('s.prefs.view')) === 'list');

    /* 7a. Zapisane widoki listy: zakładki zawężają listę, wybór zostaje w ustawieniach */
    await click('[data-fk="view-attention"]');
    await sleep(250);
    const attention = await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(r => r.dataset.projectCode);');
    check('zakładka „Wymaga uwagi” zawęża listę do projektów w stanie ostrzegawczym i alarmowym',
      (await state('s.filters.health')) === 'attention' && attention.length > 0 && attention.length < 5
      && (await state('s.workspace.projects.filter(p => ' + JSON.stringify(attention) + '.includes(p.code)).every(p => ["alarm","warning"].includes(window.ETROM.Insight.health(p, new Date()).level))')),
      'kody: ' + attention.join(','));
    check('aktywna zakładka jest zaznaczona, licznik zgadza się z listą, a wybór trafia do ustawień',
      await evaluate('const t = document.querySelector(\'[data-fk="view-attention"]\'); return t.getAttribute("aria-selected") === "true" && Number(t.querySelector(".pf-view__count").textContent) === ' + attention.length + ';')
      && (await state('s.prefs.projectView')) === 'attention');
    await click('[data-fk="view-done"]');
    await sleep(200);
    check('zakładka „Zakończone” pokazuje tylko zakończone', (await cardCount()) === 1 && (await state('s.filters.health')) === 'closed');
    await click('[data-fk="view-overdue"]');
    await sleep(200);
    check('zakładka „Po terminie” pokazuje projekty z zaległością (umowa, zadanie albo pismo)',
      (await state('s.filters.health')) === 'overdue' && (await cardCount()) >= 1
      && (await state('s.workspace.projects.filter(p => window.ETROM.Insight.hasOverdue(p, new Date(), s.workspace.mail)).length')) === (await cardCount()));
    await click('[data-fk="view-all"]');
    await sleep(200);
    check('zakładka „Wszystkie” przywraca pełną listę', (await cardCount()) === 5 && (await state('s.filters.health')) === 'all');

    /* 7b. Edycja w komórce: lider zmieniany bez wchodzenia w projekt */
    const idLead = await projectId('2603');
    const leaderBefore = await state('s.workspace.projects.find(p => p.id === ' + idLead + ').team.leader');
    const otherPerson = await state('s.workspace.people.find(p => p.id !== ' + JSON.stringify(leaderBefore) + ' && p.active !== false).id');
    await click('[data-fk="leader-' + idLead + '"]');
    await sleep(150);
    await pickMenu(otherPerson);
    await sleep(200);
    check('klik w komórkę „Lider” zmienia lidera projektu bez otwierania projektu',
      (await state('s.workspace.projects.find(p => p.id === ' + idLead + ').team.leader')) === otherPerson && (await evaluate('return location.hash;')) === '#/projekty');
    await evaluate('window.ETROM.app.store.update(s => Object.assign({}, s, { workspace: Object.assign({}, s.workspace, { projects: s.workspace.projects.map(p => p.id === ' + idLead + ' ? Object.assign({}, p, { team: Object.assign({}, p.team, { leader: ' + JSON.stringify(leaderBefore) + ' }) }) : p) }) })); return true;');

    /* 7c. Gęstość listy */
    await evaluate('window.ETROM.app.actions.setPref({ density: "compact" }); return true;');
    check('gęstość „Zwarta” ustawia atrybut na dokumencie i skraca wiersze',
      await evaluate('return document.documentElement.getAttribute("data-density") === "compact" && getComputedStyle(document.documentElement).getPropertyValue("--row-h").trim() === "2.5rem";'));
    await evaluate('window.ETROM.app.actions.setPref({ density: "comfortable" }); return true;');

    check('panel terminów zbiera zadania, pisma i terminy umów z podziałem na okresy',
      await evaluate('return document.querySelectorAll(".pf-rail__sec").length >= 1 && document.querySelectorAll(".pf-due-item").length >= 1;'));
    const dueInfo = await evaluate('const l = [...document.querySelectorAll(".pf-due-item")]; return l.length + ":" + (l[0] ? l[0].textContent : "");');
    await evaluate('document.querySelector(".pf-due-item").click(); return true;');
    await sleep(1500);
    const hashAfter = (await evaluate('return location.hash;')) + ' | ' + dueInfo;
    check('termin z panelu otwiera projekt', /^#\/projekty\/\d+/.test(hashAfter), hashAfter);
    await go('#/projekty');

    /* 8. Szczegóły projektu pod własnym adresem */
    await evaluate('document.querySelector(\'[data-project-code="2602"] .project-link\').click(); return true;');
    await sleep(1100);
    const id2 = await projectId('2602');
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
    check('po rozwinięciu przebieg pokazuje wszystkie etapy standardu', (await evaluate('return document.querySelectorAll(".plan-item[data-stage-id]").length;')) === (await evaluate('return window.ETROM.Catalog.all.length;')));
    /* 9. Zmiana statusu etapu przelicza postęp */
    const progressNow = () => state('window.ETROM.Progress.projectProgress(s.workspace.projects.find(x => x.code === "2602")).percent');
    const before = await progressNow();
    await evaluate('const rows = document.querySelectorAll(".plan-item[data-stage-id] > .plan-row"); rows[rows.length - 1].querySelector(".srow__status").click(); return true;');
    await sleep(150);
    check('klik na status etapu przechodzi Do wykonania → W toku', (await state('s.workspace.projects.find(x => x.code === "2602").stages[15].status')) === 'working');
    await evaluate('const rows = document.querySelectorAll(".plan-item[data-stage-id] > .plan-row"); rows[rows.length - 1].querySelector(".srow__status").click(); return true;');
    await sleep(150);
    const after = await progressNow();
    check('oznaczenie etapu jako zakończony podnosi postęp', Number(after) > Number(before), 'przed ' + before + '%, po ' + after + '%');
    // Enter z klawiatury na przycisku statusu: po przerysowaniu fokus musi zostać w tym samym miejscu.
    await evaluate('const rows = document.querySelectorAll(".plan-item[data-stage-id] > .plan-row"); rows[rows.length - 1].querySelector(".srow__status").focus(); return true;');
    await pressKey('enter');
    check('fokus klawiatury zostaje na przycisku statusu po przerysowaniu',
      await evaluate('const rows = document.querySelectorAll(".plan-item[data-stage-id] > .plan-row"); return document.activeElement === rows[rows.length - 1].querySelector(".srow__status");')
      && (await state('s.workspace.projects.find(x => x.code === "2602").stages[15].status')) === 'todo');

    /* 10. Wstecz w przeglądarce */
    await evaluate('history.back(); return true;');
    await sleep(500);
    check('przycisk Wstecz wraca z projektu na listę',
      (await evaluate('return location.hash;')) === '#/projekty' || (await evaluate('return location.hash;')) === '');

    /* 11. Walidacja formularza: powtórzony kod */
    await click('#action-new');
    await sleep(200);
    await evaluate(
      'document.getElementById("pf-code").value = "2601";' +
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
    const did = await projectId('2603');
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
      await evaluate('return !document.querySelector("#project-list th.col-team") && !!document.querySelector("#project-list th.col-deadline");')
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
    const cardsCheck = await evaluate('return { cards: document.querySelectorAll(".pcard").length, projects: window.ETROM.app.store.getState().workspace.projects.length, bars: document.querySelectorAll(".pcard .pf-meter").length };');
    check('widok kart: jedna karta na projekt, bez paska postępu',
      cardsCheck.cards === cardsCheck.projects && cardsCheck.bars === 0, JSON.stringify(cardsCheck));

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
    const id1 = await projectId('2601');
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
    check('klawisz E w projekcie otwiera jego edycję', await evaluate('return !!document.querySelector("dialog.drawer[open] #project-form") && document.getElementById("pf-code").value === "2601";'));
    await pressKey('escape');

    /* 21a. Termin projektu zawsze z rokiem i licznikiem dni do końca */
    await go('#/projekty');
    check('najbliższy termin na liście ma datę i opis względny, a zaległy jest oznaczony',
      await evaluate('const cells = [...document.querySelectorAll(".pf-due")]; return cells.length > 0 && cells.every(c => !!c.querySelector(".pf-due__date").textContent && /dziś|jutro|za \\d+ dni|po terminie/.test(c.querySelector(".pf-due__rel").textContent)) && cells.some(c => c.classList.contains("is-overdue"));'));

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
      await evaluate('const t = [...document.querySelectorAll(".mywork__main .msec__title")].map(n => n.textContent); return t.length > 0 && t.every(x => ["Czeka na Twoją decyzję","Po terminie","Dziś","W tym tygodniu","Później","Bez terminu"].includes(x)) && !!document.querySelector(".mrow__project") && !!document.querySelector(".mrow .tdue, .mrow .due--none");'));
    check('pasek boczny pokazuje licznik pracy osoby',
      await evaluate('return /^\\d+$/.test(document.querySelector("[data-screen=mywork] .nav__count").textContent);'));
    check('moje projekty pokazują funkcję i licznik dni do końca',
      await evaluate('return document.querySelectorAll(".mproject").length > 0 && !!document.querySelector(".mproject .countdown");'));
    await click('.mrow .trow__name');
    await sleep(300);
    check('klik w zadanie otwiera inspektor zadania', await evaluate('return !document.getElementById("inspector").hidden;'));
    await pressKey('escape');
    await click('[data-fk="mywork-view-today"]');
    await sleep(200);
    check('zakładka „Dziś” w Mojej pracy zostawia tylko zaległe i dzisiejsze',
      await evaluate('const t = [...document.querySelectorAll(".mywork__main .msec__title")].map(n => n.textContent); return t.length > 0 && t.every(x => ["Po terminie","Dziś"].includes(x)) && document.querySelector("[data-fk=mywork-view-today]").getAttribute("aria-selected") === "true";'));
    await click('[data-fk="mywork-view-all"]');
    await pressKey('j');
    check('J w Mojej pracy ustawia fokus na pierwszym zadaniu',
      await evaluate('return document.activeElement && document.activeElement.classList.contains("trow__name");'));
    await pressKey('g');
    await pressKey('s');
    await sleep(300);
    check('skrót G S otwiera Skrzynkę, a pozycje mają rodzaj, projekt i akcje',
      (await evaluate('return location.hash;')) === '#/skrzynka' && await evaluate('return !document.getElementById("view-inbox").hidden && document.querySelectorAll(".ibx__row").length > 0 && !!document.querySelector(".ibx__row .mrow__project") && !!document.querySelector(".ibx__row [data-fk^=inbox-snooze]");'));
    check('pasek boczny pokazuje licznik Skrzynki zgodny z listą',
      await evaluate('return document.querySelector("[data-screen=inbox] .nav__count").textContent === String(document.querySelectorAll("#view-inbox .ibx > .ibx__list .ibx__row").length);'));
    await click('[data-fk="inbox-filter-approve"]');
    await sleep(150);
    check('filtr „Do zatwierdzenia” zostawia tylko zatwierdzenia',
      await evaluate('const r = [...document.querySelectorAll("#view-inbox .ibx > .ibx__list .ibx__row")]; return r.length > 0 && r.every(x => x.dataset.kind === "approve");'));
    await click('[data-fk="inbox-filter-all"]');
    await sleep(150);
    const inboxBefore = await evaluate('return document.querySelectorAll("#view-inbox .ibx > .ibx__list .ibx__row").length;');
    await click('.ibx__row [data-fk^="inbox-snooze"]');
    await sleep(250);
    check('„Odłóż do jutra” chowa pozycję i przenosi ją do odłożonych, zapis trafia do preferencji',
      await evaluate('return document.querySelectorAll("#view-inbox .ibx > .ibx__list .ibx__row").length === ' + (inboxBefore - 1) + ' && !!document.querySelector(".ibx__later") && Object.keys(JSON.parse(localStorage.getItem(window.ETROM.Prefs.KEY)).snoozed).length === 1;'));
    await click('.ibx__later > summary');
    await click('.ibx__row--later button');
    await sleep(250);
    check('„Przywróć” oddaje pozycję do Skrzynki',
      await evaluate('return document.querySelectorAll("#view-inbox .ibx > .ibx__list .ibx__row").length === ' + inboxBefore + ';'));
    await click('[data-fk^="inbox-approve-"]');
    await sleep(300);
    check('„Zatwierdź” w Skrzynce zamyka zadanie i pozycja znika',
      await evaluate('return document.querySelectorAll("#view-inbox [data-kind=approve]").length === 0;'));
    // Przywracamy zadanie do zatwierdzenia — dalsze kroki scenariusza na nim polegają.
    await evaluate('window.ETROM.app.store.update(function (st) { return Object.assign({}, st, { workspace: Object.assign({}, st.workspace, { projects: st.workspace.projects.map(function (p) { return Object.assign({}, p, { stages: p.stages.map(function (g) { return Object.assign({}, g, { tasks: (g.tasks || []).map(function (t) { return t.name.indexOf("Uzgodnić kolizję") >= 0 ? Object.assign({}, t, { status: "review" }) : t; }) }); }) }); }) }) }); }); return true;');
    await go('#/moja-praca');
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
    check('wiersz etapu własnego jest oznaczony w podpowiedzi (własny / standard)',
      await evaluate('const metas = [...document.querySelectorAll(".plan-row__main")].map(n => n.getAttribute("data-tooltip") || ""); return metas.some(m => /własny$/.test(m)) && metas.some(m => /standard 09$/.test(m));'));

    /* 23b. Plan to tabela etapów: bez paska rodzajów, osi i grupowania */
    check('plan nie pokazuje paska rodzajów pracy ani przełącznika grupowania',
      await evaluate('return !document.querySelector(".kindbar") && !document.querySelector("[data-fk=stage-group]") && document.querySelectorAll(".plan-row .plan-budget").length > 0;'));

    /* 23a. Edycja istniejącego etapu: godziny i termin */
    const pctBefore = await state('window.ETROM.Progress.projectProgress(s.workspace.projects.find(x => x.code === "PICK-1")).hoursTotal');
    await openMenu('.plan-item:first-child .srow__more', 'Edytuj etap');
    await sleep(300);
    check('edycja etapu standardowego blokuje nazwę i dziedzinę, godziny są do zmiany',
      await evaluate('const n = document.getElementById("cs-name"); const d = document.getElementById("cs-domain"); return n.readOnly && d.disabled && !document.getElementById("cs-hours").disabled && document.querySelector(".drawer, dialog[open]") !== null;'));
    await evaluate('document.getElementById("cs-hours").value = "0"; document.getElementById("custom-stage-form").requestSubmit(); return true;');
    await sleep(200);
    check('zerowy budżet godzin etapu nie przechodzi', await evaluate('return !!document.querySelector("#custom-stage-form .field__error");'));
    await evaluate('document.getElementById("cs-hours").value = "100"; document.getElementById("custom-stage-form").requestSubmit(); return true;');
    await sleep(300);
    const edited = await state('(() => { const p = s.workspace.projects.find(x => x.code === "PICK-1"); return { id: p.stages[0].id, hours: p.stages[0].hours, total: window.ETROM.Progress.projectProgress(p).hoursTotal }; })()');
    check('zapis etapu zmienia godziny, a budżet projektu się przelicza',
      edited.hours === 100 && edited.total !== pctBefore, JSON.stringify(edited) + ' przed ' + pctBefore);
    check('po zapisie panel się zamyka, a etap bez zadań nie ma własnego terminu',
      await evaluate('return !document.getElementById("custom-stage-form") && /—/.test(document.querySelector(".plan-item:first-child .plan-row__due").textContent);'));

    /* 24. Przesuwanie etapu z menu wiersza */
    await openMenu('.plan-item:last-child .srow__more', 'Przesuń wyżej');
    check('etap własny daje się przesunąć pomiędzy standardowe',
      (await state('s.workspace.projects.find(x => x.code === "PICK-1").stages.map(st => st.id).join(",")')) === 'preparation,water-docs,custom-1,handover');
    check('pozycja „Przesuń wyżej” jest nieaktywna dla pierwszego etapu',
      await evaluate('document.querySelector(".plan-item:first-child .srow__more").click(); return true;')
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
      await evaluate('return !!document.querySelector(\'[data-project-code="2601"] .col-team .avatar\');')
      && (await state('s.prefs.hiddenColumns.length')) === 0);

    await click('.nav__item[data-screen="team"]');
    await sleep(500);
    check('panel boczny przełącza na ekran Zespołu',
      await evaluate('return !document.getElementById("view-team").hidden && document.getElementById("view-projects").hidden && document.querySelectorAll(".prow").length === 6;'));
    check('aktywna pozycja nawigacji ma aria-current',
      (await evaluate('return document.querySelector(\'.nav__item[data-screen="team"]\').getAttribute("aria-current");')) === 'page');
    check('wiersz osoby pokazuje funkcje pełnione w projektach jako odnośniki',
      await evaluate('const links = [...document.querySelectorAll(".prow .role-link")]; return links.some(l => /^\\d{4}/.test(l.textContent) && /Lider/.test(l.textContent) && /^#\\/projekty\\/\\d+\\/zespol$/.test(l.getAttribute("href")));'));

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
    check('wiersz etapu pokazuje pod nazwą, ile zadań jest otwartych',
      await evaluate('return [...document.querySelectorAll(".plan-row__sub")].some(c => /Otwarte \\d+ z \\d+/.test(c.textContent));'));
    check('etap pokazuje pasek rozkładu statusów zadań',
      await evaluate('return document.querySelectorAll(".sbar .sbar__seg").length >= 1;'));
    check('zadanie w toku ma szybkie kroki „Do zatwierdzenia” i „Zakończ”',
      await evaluate('const t = [...document.querySelectorAll(".trow--working .trow__step")].map(b => b.textContent); return t.includes("Do zatwierdzenia") && t.includes("Zakończ");'));
    check('termin zadania ma rok i odliczanie, a etap pokazuje termin najbliższego zadania',
      await evaluate('const t = document.querySelector(".trow .tdue"); const e = document.querySelector(".plan-row__due .srow__due"); return !!t && /20\\d\\d/.test(t.querySelector(".tdue__date").textContent) && !!t.querySelector(".countdown") && !!e && /20\\d\\d/.test(e.textContent) && !!e.querySelector(".countdown");'));
    check('wiersz etapu nie powtarza rodzaju, tematu i numeru standardu w tekście',
      await evaluate('return ![...document.querySelectorAll(".plan-row__text")].some(n => /standard \\d/.test(n.textContent));'));
    check('bieżący etap jest od razu rozwinięty z zadaniami',
      await evaluate('const w = document.querySelector(".plan-row--working"); return !!w && w.querySelector(".plan-row__main").getAttribute("aria-expanded") === "true";')
      && (await evaluate('return document.querySelectorAll(".trow").length;')) > 0);
    await evaluate('const w = [...document.querySelectorAll(".plan-item[data-stage-id]")].find(w => !/Brak zadań/.test(w.querySelector(".plan-row__sub").textContent) && w.querySelector(".plan-row__main").getAttribute("aria-expanded") === "false"); w.querySelector(".plan-row__main").click(); return true;');
    await sleep(300);
    check('rozwinięcie kolejnego etapu pokazuje jego zadania', (await evaluate('return document.querySelectorAll(".plan-panel .trow").length;')) >= 3);
    check('przyciski rozwinięcia ogłaszają stan', await evaluate('return document.querySelectorAll(\'.plan-row__main[aria-expanded="true"]\').length === 2;'));

    /* 31. Nowe zadanie */
    await click('.plan-panel [data-action="add-task"]');
    await sleep(300);
    check('formularz zadania proponuje wyłącznie osoby z zespołu projektu',
      await evaluate('const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.code === "2602"); const allowed = window.ETROM.Team.projectPeople(p.team); const boxes = [...document.querySelectorAll("#tk-assignees input")].map(b => b.value); return boxes.length === allowed.length && boxes.every(id => allowed.indexOf(id) >= 0);'));
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

    /* 36b. Budżet etapu: pracownik widzi procent, lider i zarząd godziny, korekty dodaje zarząd */
    const ewaId = await state('s.workspace.people.find(p => p.firstName === "Ewa").id');
    const michalId = await state('s.workspace.people.find(p => p.firstName === "Michał").id');
    const activeStageId = await state('window.ETROM.Progress.activeStage(s.workspace.projects.find(x => x.code === "2602")).id');
    await evaluate('window.ETROM.app.actions.setMe("' + ewaId + '"); return true;');
    await go('#/projekty/' + id2);
    await sleep(300);
    check('pracownik widzi w planie tylko procent zużycia budżetu etapu',
      await evaluate('const t = [...document.querySelectorAll(".plan-budget__text")].map(n => n.textContent); return t.length > 0 && t.every(x => /^\\d+%$/.test(x));'));
    await evaluate('window.ETROM.app.actions.editStage(' + id2 + ', "' + activeStageId + '"); return true;');
    await sleep(300);
    check('pracownik nie ma w formularzu etapu pola korekty godzin',
      await evaluate('return !!document.getElementById("cs-hours") && !document.getElementById("cs-adj-hours");'));
    await evaluate('window.ETROM.app.store.set({ stageForm: null }); return true;');
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await sleep(300);
    check('zarząd widzi w planie godziny zużyte i zaplanowane',
      await evaluate('const t = [...document.querySelectorAll(".plan-budget__text")].map(n => n.textContent); return t.length > 0 && t.every(x => /^[\\d,]+ \\/ [\\d\\u00a0,]+\\s?h$/.test(x));'));
    await evaluate('window.ETROM.app.actions.editStage(' + id2 + ', "' + activeStageId + '"); return true;');
    await sleep(300);
    await evaluate('document.getElementById("cs-adj-hours").value = "-3"; document.getElementById("custom-stage-form").requestSubmit(); return true;');
    await sleep(200);
    check('ujemna korekta godzin nie przechodzi',
      await evaluate('return !!document.getElementById("custom-stage-form") && !!document.querySelector("#cs-adj-hours").closest(".field").querySelector(".field__error");'));
    const plannedHours = await state('s.workspace.projects.find(x => x.code === "2602").stages.find(st => st.id === "' + activeStageId + '").hours');
    await evaluate('document.getElementById("cs-adj-hours").value = "' + (plannedHours / 2) + '"; document.getElementById("cs-adj-note").value = "Zbliża się termin"; document.getElementById("custom-stage-form").requestSubmit(); return true;');
    await sleep(300);
    const adj = await state('s.workspace.projects.find(x => x.code === "2602").stages.find(st => st.id === "' + activeStageId + '").adjustments');
    check('zarząd dopisuje korektę godzin do etapu', adj.length === 1 && adj[0].hours === plannedHours / 2 && adj[0].by === '' + michalId + '' && adj[0].note === 'Zbliża się termin', JSON.stringify(adj));
    const usageNow = await state('(() => { const p = s.workspace.projects.find(x => x.code === "2602"); const u = window.ETROM.Budget.usage(p, p.stages.find(st => st.id === "' + activeStageId + '"), s.workspace.entries, new Date()); return { used: Math.round(u.used * 10) / 10, percent: u.percent, bonus: u.bonus }; })()');
    const stageText = (id) => evaluate('const el = document.querySelector(".plan-item[data-stage-id=\\"' + id + '\\"] .plan-budget__text"); return el ? el.textContent : null;');
    check('zarząd widzi zużycie z korektą w godzinach', (await stageText(activeStageId)) === String(usageNow.used).replace('.', ',') + ' / ' + plannedHours + ' h' || (await stageText(activeStageId)) === String(usageNow.used).replace('.', ',') + ' / ' + plannedHours + ' h', (await stageText(activeStageId)) + ' vs ' + JSON.stringify(usageNow));
    await evaluate('window.ETROM.app.actions.setMe("' + ewaId + '"); return true;');
    await sleep(300);
    check('pracownik widzi to samo zużycie (z korektą) jako zwykły procent, bez godzin', (await stageText(activeStageId)) === usageNow.percent + '%' && usageNow.bonus === plannedHours / 2, (await stageText(activeStageId)) + ' vs ' + JSON.stringify(usageNow));
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');

    /* 36c. Panel szczegółów zwija się (]) i oddaje miejsce środkowi */
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await go('#/projekty/' + id2);
    await sleep(300);
    const widthOpen = await evaluate('return document.querySelector(".detail__work").getBoundingClientRect().width;');
    check('panel szczegółów jest szarą powierzchnią tego samego koloru co menu',
      await evaluate('const a = getComputedStyle(document.querySelector(".pd-side")).backgroundColor; const b = getComputedStyle(document.querySelector(".sidebar")).backgroundColor; return a === b || b === "rgba(0, 0, 0, 0)";'));
    await pressKey('rbracket');
    await sleep(250);
    const widthClosed = await evaluate('return document.querySelector(".detail__work").getBoundingClientRect().width;');
    check('klawisz ] zwija panel szczegółów, a treść środkowa się powiększa',
      !(await evaluate('return !!document.querySelector(".pd-side");')) && (await state('s.prefs.detailsOpen')) === false && widthClosed > widthOpen + 100, widthOpen + ' → ' + widthClosed);
    await pressKey('rbracket');
    await sleep(250);
    check('ponowny ] rozwija panel szczegółów', await evaluate('return !!document.querySelector(".pd-side");') && (await state('s.prefs.detailsOpen')) === true);
    await client.send('Emulation.clearDeviceMetricsOverride');

    /* 37. Projekt bez danych i zły adres */
    await go('#/projekty/99999');
    check('nieistniejący projekt pokazuje pusty stan z drogą powrotu',
      await evaluate('return /Nie znaleziono projektu/.test(document.getElementById("project-view").textContent);'));

    /* 38. Język wizualny: stan projektu, przebieg, inspektor */
    await go('#/projekty');
    check('wiersz projektu niesie znak stanu i numer, bez postępu i godzin',
      await evaluate('const r = document.querySelector(\'[data-project-code="2602"]\'); return !!r.querySelector(".datum--alarm") && r.querySelector(".pf-num").textContent === "2602" && !r.querySelector(".pf-meter, .pf-progress, .pf-hours");'));
    await evaluate('document.querySelector(\'[data-project-code="2601"] .project-link\').focus(); return true;');
    await pressKey('space');
    check('Spacja na projekcie otwiera podgląd w inspektorze bez opuszczania listy',
      (await state('s.inspector && s.inspector.kind')) === 'project' && (await evaluate('return location.hash;')) === '#/projekty');
    await pressKey('escape');
    check('lista projektów nie ma paska stanu portfela (analiza trafi do osobnej zakładki)',
      await evaluate('return !document.querySelector(".pf-strip") && document.getElementById("portfolio").hidden;'));
    await go('#/projekty/' + id2);
    check('nagłówek projektu ma kafelki: stan, termin umowy, lider, czas umowy (bez postępu i godzin)',
      await evaluate('const l = [...document.querySelectorAll(".pd-props .pd-prop__label")].map(x => x.textContent).join(","); return l === "Stan,Termin umowy,Lider,Czas umowy" && /Wymaga uwagi/.test(document.querySelector(".pd-state").textContent) && !document.querySelector(".pd-progress");'));
    check('„Wymaga uwagi” w projekcie wylicza powody z działaniami',
      await evaluate('const a = document.querySelector(".pd-attention"); return !!a && a.querySelectorAll(".pd-attention__item").length >= 1 && !!a.querySelector(".pd-attention__actions button") && /Wymaga uwagi/.test(a.querySelector(".pd-attention__title").textContent);'));
    check('status i stan to dwa osobne wymiary: status jest przyciskiem, stan nie',
      await evaluate('return !!document.querySelector(".pd-head__id .detail__status") && !document.querySelector(".pd-state button");'));
    check('termin umowy i lider da się zmienić w miejscu',
      await evaluate('return !!document.querySelector("[data-fk=project-deadline]") && !!document.querySelector(".pd-props .pf-leader") && !!document.querySelector(".pd-date");'));
    check('zakładki projektu: Plan, Zadania, Korespondencja, Zespół, Czas, Aktywność',
      await evaluate('return [...document.querySelectorAll(".detail__tabs .tabs__tab")].map(t => t.dataset.tab).join(",") === "etapy,zadania,korespondencja,zespol,czas,aktywnosc";'));
    await click('[data-fk="attn-tasks-late-tasks"], [data-fk="attn-tasks-returned-tasks"]');
    await sleep(400);
    check('„Pokaż zadania” z listy uwagi przechodzi do zakładki Zadania',
      (await evaluate('return location.hash;')) === '#/projekty/' + id2 + '/zadania');
    /* 37a. Kanban: pięć kolumn, szybkie kroki, przeciąganie z kontrolą przejść */
    await evaluate('const b = [...document.querySelectorAll(".segmented__btn")].find(x => /Kanban/.test(x.textContent)); b.click(); return true;');
    await sleep(300);
    check('przełącznik Lista | Kanban pokazuje pięć kolumn statusów, wybór trafia do ustawień',
      (await evaluate('return [...document.querySelectorAll(".kb-col")].map(c => c.dataset.status).join(",");')) === 'todo,working,review,changes,done'
      && (await state('s.prefs.taskView')) === 'kanban');
    check('karty na tablicy odpowiadają zadaniom projektu',
      (await evaluate('return document.querySelectorAll(".kb-card").length;')) === (await state('s.workspace.projects.find(p => p.id === ' + id2 + ').stages.reduce((n, st) => n + (st.tasks || []).length, 0)')));
    const kb = await evaluate('const c = document.querySelector(".kb-col--working .kb-card"); return c ? { id: c.dataset.taskId, stage: c.dataset.stageId } : null;');
    const taskStatus = (tid, sid) => state('s.workspace.projects.find(p => p.id === ' + id2 + ').stages.find(st => st.id === ' + JSON.stringify(sid || kb.stage) + ').tasks.find(t => t.id === ' + JSON.stringify(tid) + ').status');
    await click('.kb-card[data-task-id="' + kb.id + '"][data-stage-id="' + kb.stage + '"] [data-fk="kb-step-review-' + kb.id + '"]');
    await sleep(250);
    check('szybki krok „Do zatwierdzenia” przenosi kartę do kolumny Do zatwierdzenia',
      (await taskStatus(kb.id)) === 'review' && (await evaluate('return !!document.querySelector(".kb-col--review .kb-card[data-task-id=" + JSON.stringify(' + JSON.stringify(kb.id) + ') + "][data-stage-id=" + JSON.stringify(' + JSON.stringify(kb.stage) + ') + "]");')));
    const drag = (tid, status, sid) => evaluate(`const card = document.querySelector('.kb-card[data-task-id="${tid}"][data-stage-id="${sid || kb.stage}"]'); const col = document.querySelector('.kb-col--${status}');
      const dt = new DataTransfer(); card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      col.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      col.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); return true;`);
    await drag(kb.id, 'done');
    await sleep(250);
    check('przeciągnięcie karty do kolumny Zakończone zmienia status zadania', (await taskStatus(kb.id)) === 'done');
    const todoCard = await evaluate('const c = document.querySelector(".kb-col--todo .kb-card"); return c ? { id: c.dataset.taskId, stage: c.dataset.stageId } : null;');
    if (todoCard) {
      await drag(todoCard.id, 'changes', todoCard.stage);
      await sleep(250);
      check('niedozwolone upuszczenie (Do wykonania → Do poprawy) nie zmienia statusu', (await taskStatus(todoCard.id, todoCard.stage)) === 'todo');
    }
    await evaluate('window.ETROM.app.actions.setPref({ taskView: "list" }); return true;');
    await sleep(250);

    await go('#/projekty/' + id2);
    await sleep(300);
    await click('#show-done');
    await sleep(200);
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

    /* 38. Projekt po terminie nie może mieć pustego „Co teraz zrobić” */
    const overdueId = await evaluate(`const A = window.ETROM.app, M = window.ETROM.Model;
      const st = M.createStage('preparation'); st.status = 'working';
      let id = 0;
      A.store.update((s) => { const p = M.createProject({ code: 'PO-TERMINIE', name: 'Projekt po terminie', client: 'K', status: 'active', deadline: '2026-01-15', stages: [st] }, s.workspace.projects); id = p.id; return Object.assign({}, s, { workspace: Object.assign({}, s.workspace, { projects: s.workspace.projects.concat([p]) }) }); });
      return id;`);
    await go('#/projekty/' + overdueId);
    await sleep(300);
    check('projekt po terminie umowy ma na liście uwagi działanie z przyciskiem zmiany terminu',
      await evaluate('const n = document.querySelector(".pd-attention__item--alarm"); return !!n && /Termin umowy minął/.test(n.textContent) && /Zmień termin/.test(n.textContent);'));
    await click('[data-fk="attn-deadline-passed-deadline"]');
    await sleep(450);
    check('„Zmień termin” otwiera wybór daty albo formularz edycji projektu',
      await evaluate('return !!document.querySelector("dialog.drawer[open], .drawer") && /PO-TERMINIE/.test(document.body.textContent);'));
    await evaluate('window.ETROM.app.store.set({ form: null }); return true;');
    await sleep(450);
    await evaluate(`window.ETROM.app.store.update((s) => Object.assign({}, s, { workspace: Object.assign({}, s.workspace, { projects: s.workspace.projects.filter((p) => p.code !== 'PO-TERMINIE') }) })); return true;`);
    await go('#/projekty/' + id2);

    /* 38a. Dziennik korespondencji */
    const mailPid = await state('s.workspace.projects.find(p => p.code === "2601").id');
    await go('#/projekty/' + mailPid + '/korespondencja');
    await sleep(300);
    check('zakładka Korespondencja pokazuje wpisy dziennika z numerami i licznik oczekujących',
      (await evaluate('return document.querySelectorAll(".mrow2").length;')) === 3
      && (await evaluate('return /P\\/\\d{4}\\/001/.test(document.querySelector(".mail-list").textContent);'))
      && (await evaluate('return !!document.querySelector(".detail__tabs") && /Korespondencja/.test(document.querySelector(".detail__tabs").textContent);')));
    check('pismo po terminie jest oznaczone, a dziennik ma termin odpowiedzi z rokiem',
      await evaluate('return !!document.querySelector(".mrow2.is-overdue") && /20\\d\\d/.test(document.querySelector(".mrow2 .tdue").textContent);'));
    await click('#mail-add-in');
    await sleep(450);
    check('„Pismo przychodzące” otwiera formularz w panelu bocznym',
      await evaluate('return !!document.querySelector("#mail-form") && !!document.querySelector("#ml-subject");'));
    await evaluate('document.querySelector("#mail-form").requestSubmit(); return true;');
    await sleep(300);
    check('pusty formularz pisma pokazuje błędy i się nie zamyka',
      (await evaluate('return !!document.querySelector("#mail-form") && !!document.querySelector("#ml-subject-error") && !!document.querySelector("#ml-party-error");')));
    await evaluate('const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }; set("ml-subject", "Zawiadomienie o wszczęciu postępowania"); set("ml-party", "Starostwo Powiatowe"); set("ml-due", ""); document.querySelector("#mail-form").requestSubmit(); return true;');
    await sleep(450);
    check('zapisane pismo dostaje kolejny numer w dzienniku i trafia na listę',
      (await evaluate('return document.querySelectorAll(".mrow2").length;')) === 4
      && (await evaluate('return /Zawiadomienie o wszczęciu postępowania/.test(document.querySelector(".mail-list").textContent) && /P\\/\\d{4}\\/00[2-9]/.test(document.querySelector(".mail-list").textContent);'))
      && !(await evaluate('return !!document.querySelector("#mail-form");')));
    await evaluate('[...document.querySelectorAll(".mail-filters .segmented__btn")].find(b => /Czeka na odpowiedź/.test(b.textContent)).click(); return true;');
    await sleep(300);
    check('filtr „Czeka na odpowiedź” zostawia tylko pisma z oczekiwaną odpowiedzią',
      (await evaluate('return document.querySelectorAll(".mrow2").length;')) === 2);
    await evaluate('window.ETROM.app.actions.setMailView({ waiting: false, direction: "all", query: "" }); return true;');
    await sleep(250);
    await evaluate('window.ETROM.app.actions.replyMail(' + JSON.stringify(await state('s.workspace.mail.filter(m => m.projectId === ' + mailPid + ' && m.direction === "in" && m.replyDue)[0].id')) + '); return true;');
    await sleep(450);
    check('„Napisz odpowiedź” otwiera pismo wychodzące z adresatem i powiązaniem',
      (await evaluate('return document.getElementById("ml-party").value.length > 2 && /^Odp\\./.test(document.getElementById("ml-subject").value) && document.getElementById("ml-replyto").value !== "";')));
    await evaluate('document.querySelector("#mail-form").requestSubmit(); return true;');
    await sleep(450);
    check('odpowiedź załatwia oczekujące pismo (znika z oczekujących)',
      (await evaluate('return [...document.querySelectorAll(".mrow2")].some(r => /odpowiedź na P\\//.test(r.textContent)) && document.querySelectorAll(".mrow2 .badge--info, .mrow2 .badge--danger").length < 2;')));
    await click('.tabs a[href$="/zespol"], .detail__tabs a[href$="/zespol"]');
    await sleep(200);
    await go('#/projekty/' + mailPid);

    /* 38b. Aktualności: strumień, reakcje, komentarze, wpisy */
    await go('#/aktualnosci');
    await sleep(300);
    check('aktualności: ekran ze strumieniem kart, paskiem projektów i kompozytorem',
      (await evaluate('return location.hash === "#/aktualnosci" && !document.getElementById("view-feed").hidden && document.querySelectorAll(".fd__card").length > 3 && document.querySelectorAll(".fd__prow").length > 2 && !!document.querySelector(".fd__side") && !!document.querySelector(".fd__textarea");')));
    const feedKey = await evaluate('return document.querySelector(".fd__card[data-kind=task], .fd__card[data-kind=time], .fd__card[data-kind=mail]").dataset.feedKey;');
    await evaluate('window.ETROM.app.actions.toggleReaction(' + JSON.stringify(feedKey) + ', "heart"); return true;');
    await sleep(250);
    check('reakcja pojawia się jako wyróżniony chip i znika po ponownym kliku',
      (await evaluate('return !!document.querySelector(".fd__card[data-feed-key=" + JSON.stringify(' + JSON.stringify(feedKey) + ') + "] .fd__react.is-mine");'))
      && (await evaluate('window.ETROM.app.actions.toggleReaction(' + JSON.stringify(feedKey) + ', "heart"); return true;'), await sleep(250), await evaluate('return !document.querySelector(".fd__react.is-mine .fd__emoji") || document.querySelector(".fd__react.is-mine .fd__emoji").textContent !== "❤️";')));
    await evaluate('window.ETROM.app.actions.toggleFeedComments(' + JSON.stringify(feedKey) + '); return true;');
    await sleep(250);
    await evaluate('const i = document.querySelector(".fd__cinput"); i.value = "Sprawdzę jutro"; i.dispatchEvent(new Event("input")); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true;');
    await sleep(300);
    check('komentarz po Enterze trafia do strumienia',
      (await evaluate('return [...document.querySelectorAll(".fd__ctext")].some(n => n.textContent === "Sprawdzę jutro");')));
    await evaluate('const t = document.querySelector(".fd__textarea"); t.value = "Test wpisu z kompozytora"; t.dispatchEvent(new Event("input")); document.querySelector(".fd__composer .btn--primary").click(); return true;');
    await sleep(500);
    check('wpis z kompozytora jest pierwszą kartą i czyści pole',
      (await evaluate('return /Test wpisu z kompozytora/.test(document.querySelector(".fd__stream .fd__card").textContent) && document.querySelector(".fd__textarea").value === "";')));
    await evaluate('document.querySelector("#view-feed [data-fk=fd-filter-posts]").click(); return true;');
    await sleep(250);
    check('filtr „Wpisy” zostawia tylko wpisy ludzi',
      (await evaluate('const c = [...document.querySelectorAll(".fd__card")]; return c.length > 0 && c.every(n => n.dataset.kind === "post");')));
    await evaluate('window.ETROM.app.actions.setFeedFilter("all"); return true;');
    await sleep(200);

    /* 38b. Analiza: zarząd widzi wszystko z finansami, pracownik bez opłacalności */
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/analiza');
    await sleep(500);
    check('Analiza: kafle, mapa projektów, szczegóły, trend i tabela',
      await evaluate('return location.hash === "#/analiza" && !document.getElementById("view-analysis").hidden && document.querySelectorAll(".an-tile").length >= 4 && document.querySelectorAll(".ch-bubble").length >= 4 && !!document.querySelector(".ch--burn") && !!document.querySelector(".ch--weekly") && document.querySelectorAll(".an-tr--row").length >= 4;'));
    check('Analiza: zarząd widzi opłacalność i pole kosztu godziny',
      await evaluate('return !!document.querySelector(".an-card--fin .an-fin__v") && !!document.querySelector("[data-fk=an-rate]");'));
    await evaluate('document.querySelector(".an-tr--row:last-child").click(); return true;');
    await sleep(300);
    check('Analiza: wiersz tabeli zmienia projekt w szczegółach',
      (await evaluate('return document.querySelector(".an-detail").dataset.projectId;')) === (await evaluate('return document.querySelector(".an-tr--row.is-selected").dataset.projectId;')));
    await evaluate('window.ETROM.app.actions.setMe("' + ewaId + '"); return true;');
    await sleep(300);
    check('Analiza: pracownik nie widzi opłacalności ani kosztu godziny',
      await evaluate('return !document.querySelector(".an-card--fin") && !document.querySelector("[data-fk=an-rate]");'));
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/projekty');

    /* 38c. Aktualności jako media firmowe: zdjęcia, ankieta, wyróżnienie, ogłoszenie */
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/aktualnosci');
    await sleep(300);
    check('aktualności: układ na pełną szerokość z prawym panelem',
      await evaluate('const m = document.querySelector(".fd__main").getBoundingClientRect(); const a = document.querySelector(".fd__side").getBoundingClientRect(); const v = document.getElementById("view-feed").getBoundingClientRect(); return a.right > v.right - 40 && m.width > 500 && a.left > m.right - 1;'));
    check('kafelki projektów w panelu mają czytelny skrót numeru (bez ucięcia)',
      await evaluate('return [...document.querySelectorAll(".fd__pcode")].every(n => n.scrollWidth <= n.clientWidth + 1 && n.textContent.length <= 4);'));
    await evaluate('window.__att = null; const c = document.createElement("canvas"); c.width = 1800; c.height = 1200; const g = c.getContext("2d"); g.fillStyle = "#3a7"; g.fillRect(0,0,1800,1200); c.toBlob(b => { const f = new File([b], "plac.png", { type: "image/png" }); window.ETROM.FeedScreen.attach([f, f]).then(n => { window.__att = n; }); }); return true;');
    await sleep(1200);
    check('kompozytor: dodane zdjęcia są zmniejszone i widać podgląd z przyciskiem usunięcia',
      (await evaluate('return window.__att;')) === 2 && (await evaluate('return document.querySelectorAll(".fd__thumb img").length;')) === 2
      && (await evaluate('return window.ETROM.FeedScreen.drafts.images.every(u => u.length < 700000 && /^data:image\\/jpeg/.test(u));')));
    await evaluate('document.querySelector("[data-fk=fd-unattach-1]").click(); return true;');
    await sleep(150);
    await evaluate('const t = document.querySelector(".fd__textarea"); t.value = "Plac budowy po deszczu"; t.dispatchEvent(new Event("input")); document.querySelector("[data-fk=fd-publish]").click(); return true;');
    await sleep(500);
    check('wpis ze zdjęciem trafia na górę osi czasu z galerią',
      await evaluate('const c = document.querySelector(".fd__stream .fd__card"); return /Plac budowy po deszczu/.test(c.textContent) && c.querySelectorAll(".fd__shot img").length === 1 && window.ETROM.FeedScreen.drafts.images.length === 0;'));
    await evaluate('document.querySelector(".fd__stream .fd__card .fd__shot").click(); return true;');
    await sleep(250);
    check('kliknięcie zdjęcia otwiera powiększenie, Esc je zamyka i oddaje fokus',
      (await evaluate('return !!document.querySelector(".fd__lightbox .fd__lbimg");'))
      && (await pressKey('escape'), await sleep(200), await evaluate('return !document.querySelector(".fd__lightbox") && !!document.querySelector(".fd__stream .fd__shot:focus, .fd__stream .fd__shot");')));
    await evaluate('document.querySelector("[data-fk=fd-mode-poll]").click(); return true;');
    await sleep(150);
    await evaluate('const t = document.querySelector(".fd__textarea"); t.value = "Pizza czy sushi?"; t.dispatchEvent(new Event("input")); const o = document.querySelectorAll(".fd__optin"); o[0].value = "Pizza"; o[0].dispatchEvent(new Event("input")); o[1].value = "Sushi"; o[1].dispatchEvent(new Event("input")); document.querySelector("[data-fk=fd-publish]").click(); return true;');
    await sleep(500);
    const pollId = await evaluate('const c = document.querySelector(".fd__stream .fd__card[data-post-type=poll]"); return c ? c.dataset.feedKey.replace("post:", "") : null;');
    check('ankieta pojawia się w osi czasu z odpowiedziami', !!pollId && (await evaluate('return document.querySelectorAll("[data-feed-key=\\"post:' + pollId + '\\"] .fd__opt").length;')) === 2);
    await evaluate('document.querySelector("[data-fk=fd-vote-' + pollId + '-o2]").click(); return true;');
    await sleep(250);
    check('głos w ankiecie jest podświetlony i pokazuje procent',
      await evaluate('const b = document.querySelector("[data-fk=fd-vote-' + pollId + '-o2]"); return b.classList.contains("is-mine") && /100%/.test(b.textContent);'));
    await evaluate('document.querySelector("[data-fk=fd-mode-kudos]").click(); return true;');
    await sleep(150);
    await evaluate('const sel = document.querySelector("[data-fk=fd-kudos-to]"); sel.value = sel.options[1].value; sel.dispatchEvent(new Event("change")); const t = document.querySelector(".fd__textarea"); t.value = "Za sprawną koordynację odbioru"; t.dispatchEvent(new Event("input")); document.querySelector("[data-fk=fd-publish]").click(); return true;');
    await sleep(500);
    check('wyróżnienie ma osobną kartę z pucharem i osobą',
      await evaluate('const c = document.querySelector(".fd__stream .fd__card[data-post-type=kudos]"); return !!c && !!c.querySelector(".fd__trophy") && /Za sprawną koordynację odbioru/.test(c.textContent);'));
    await evaluate('document.querySelector("[data-fk=fd-mode-announcement]").click(); return true;');
    await sleep(150);
    await evaluate('const t = document.querySelector(".fd__textarea"); t.value = "Biuro zamknięte w piątek"; t.dispatchEvent(new Event("input")); document.querySelector("[data-fk=fd-publish]").click(); return true;');
    await sleep(500);
    check('ogłoszenie zarządu jest przypięte na górze, nad filtrami',
      await evaluate('const p = document.querySelector(".fd__pinned"); return !!p && /Biuro zamknięte w piątek/.test(p.textContent) && p.compareDocumentPosition(document.querySelector(".fd__filters")) & Node.DOCUMENT_POSITION_FOLLOWING;'));
    await evaluate('window.ETROM.app.actions.setMe("' + ewaId + '"); return true;');
    await sleep(300);
    check('pracownik nie ma trybu „Ogłoszenie” ani przypinania',
      await evaluate('return !document.querySelector("[data-fk=fd-mode-announcement]") && !document.querySelector("[data-fk^=fd-pin-]");'));
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await evaluate('window.ETROM.app.actions.setFeedFilter("all"); return true;');

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
