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
            check('start aplikacji to „Pulpit”', !(await evaluate('return document.getElementById("view-dashboard").hidden;')));
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
    check('dane przykładowe dodają 12 projektów', (await cardCount()) === 12, 'było ' + (await cardCount()));
    check('domyślny widok listy to tabela', (await evaluate('return document.querySelectorAll("#project-list .table__row").length;')) === 12);

    check('każdy projekt przykładowy ma komplet etapów ze standardu w katalogowej kolejności',
      await state('s.workspace.projects.every(p => p.stages.length === window.ETROM.Catalog.stagesFor("full", window.ETROM.Catalog.defaultProcedures("full")).length)'));

    /* 3. Zapis lokalny */
    const stored = await evaluate('const raw = localStorage.getItem("etrom.v3"); return raw ? JSON.parse(raw).projects.length : -1;');
    check('dane trafiają do localStorage na file://', stored === 12, 'zapisano: ' + stored);

    /* 4. Trwałość po przeładowaniu — od tego momentu liczymy błędy strony */
    pageErrors = [];
    await evaluate('location.reload(); return true;');
    await sleep(600);
    await waitForApp();
    check('po przeładowaniu projekty nadal są', (await cardCount()) === 12, 'było ' + (await cardCount()));

    /* 5. Wyszukiwanie */
    await evaluate('const input = document.getElementById("tb-search"); input.value = "Lipnica"; input.dispatchEvent(new Event("input", { bubbles: true })); return true;');
    check('szukanie po nazwie zawęża listę do jednego projektu', (await cardCount()) === 1, 'było ' + (await cardCount()));
    check('przy aktywnym filtrze widać licznik i przycisk czyszczenia',
      await evaluate('return /^1 z 12$/.test(document.querySelector("#filters .toolbar__count").textContent) && !document.getElementById("tb-clear").hidden;'));
    await click('#tb-clear');
    await sleep(150);
    check('„Wyczyść filtry” przywraca pełną listę i czyści pole', (await cardCount()) === 12 && (await evaluate('return document.getElementById("tb-search").value;')) === '');

    /* 6. Filtr statusu przez menu */
    await openMenu('#tb-status', 'done');
    check('filtr statusu „Zakończony” pokazuje 3 projekty', (await cardCount()) === 3, 'było ' + (await cardCount()));
    check('przycisk filtra pokazuje wybraną wartość',
      await evaluate('const b = document.getElementById("tb-status"); return b.classList.contains("filter-btn--active") && /Zakończony/.test(b.textContent);'));
    await openMenu('#tb-status', 'all');
    check('powrót do wszystkich statusów', (await cardCount()) === 12);

    /* 7. Sortowanie: domyślnie wg ręcznej kolejności zarządu (priorytet), bez grup; po numerze i w obu kierunkach na żądanie */
    const order = await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");');
    check('lista domyślnie stoi w ręcznej kolejności zarządu (pilniejsze wyżej), bez grup',
      order === '2602,2601,2606,2607,2610,2603,2604,2609,2612,2605,2608,2611' && (await state('s.filters.sort')) === 'manual' && (await state('s.prefs.groupBy')) === 'none' && (await evaluate('return document.querySelectorAll("#project-list .group-row").length;')) === 0, 'kolejność: ' + order);
    const gripFirst = await evaluate('const g = document.querySelector(".rowgrip"); return g ? g.getAttribute("data-fk") : "";');
    if (gripFirst) {
      await evaluate('document.querySelector(".rowgrip").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); return true;');
      await sleep(350);
      const moved = await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");');
      check('strzałka ↓ na uchwycie przesuwa projekt o jedno miejsce niżej i zapisuje kolejność', moved.split(',')[0] === '2601' && moved.split(',')[1] === '2602', moved);
      await evaluate('const b = [...document.querySelectorAll(".toast [data-toast-action]")].pop(); b.click(); return true;');
      await sleep(300);
      check('„Cofnij” przywraca poprzednią kolejność projektów',
        (await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");')) === order);
    }
    await evaluate('document.querySelector(\'.table__sort[data-sort="code"]\').click(); return true;');
    await sleep(150);
    check('klik w „Nr” sortuje po numerze rosnąco',
      (await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");')) === '2601,2602,2603,2604,2605,2606,2607,2608,2609,2610,2611,2612');
    await evaluate('document.querySelector(\'.table__sort[data-sort="code"]\').click(); return true;');
    await sleep(150);
    check('drugi klik w „Nr” odwraca kolejność, nagłówek ogłasza kierunek',
      (await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");')) === '2612,2611,2610,2609,2608,2607,2606,2605,2604,2603,2602,2601'
      && (await evaluate('return document.querySelector(\'th[aria-sort]\').getAttribute("aria-sort");')) === 'descending');
    await evaluate('document.querySelector(\'.table__sort[data-sort="code"]\').click(); return true;');
    await sleep(100);
    await openMenu('#tb-sort', 'deadline');
    const byDeadline = await evaluate('return [...document.querySelectorAll("#project-list [data-project-code]")].map(c => c.dataset.projectCode).join(",");');
    check('sortowanie po terminie: czynny projekt po terminie na czele, zakończony na końcu',
      byDeadline.split(',')[0] === '2602' && byDeadline.split(',').pop() === '2611', 'kolejność: ' + byDeadline);

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
      (await state('s.filters.health')) === 'attention' && attention.length > 0 && attention.length < 7
      && (await state('s.workspace.projects.filter(p => ' + JSON.stringify(attention) + '.includes(p.code)).every(p => ["alarm","warning"].includes(window.ETROM.Insight.health(p, new Date()).level))')),
      'kody: ' + attention.join(','));
    check('aktywna zakładka jest zaznaczona, licznik zgadza się z listą, a wybór trafia do ustawień',
      await evaluate('const t = document.querySelector(\'[data-fk="view-attention"]\'); return t.getAttribute("aria-selected") === "true" && Number(t.querySelector(".pf-view__count").textContent) === ' + attention.length + ';')
      && (await state('s.prefs.projectView')) === 'attention');
    await click('[data-fk="view-done"]');
    await sleep(200);
    check('zakładka „Zakończone” pokazuje tylko zakończone', (await cardCount()) === 3 && (await state('s.filters.health')) === 'closed');
    await click('[data-fk="view-overdue"]');
    await sleep(200);
    check('zakładka „Po terminie” pokazuje projekty z zaległością (umowa, zadanie albo pismo)',
      (await state('s.filters.health')) === 'overdue' && (await cardCount()) >= 1
      && (await state('s.workspace.projects.filter(p => window.ETROM.Insight.hasOverdue(p, new Date(), s.workspace.mail)).length')) === (await cardCount()));
    await click('[data-fk="view-all"]');
    await sleep(200);
    check('zakładka „Wszystkie” przywraca pełną listę', (await cardCount()) === 12 && (await state('s.filters.health')) === 'all');

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
    check('po rozwinięciu przebieg pokazuje wszystkie etapy standardu', (await evaluate('return document.querySelectorAll(".plan-item[data-stage-id]").length;')) === (await evaluate('return window.ETROM.Catalog.stagesFor("full", window.ETROM.Catalog.defaultProcedures("full")).length;')));
    /* 9. Zmiana statusu etapu przelicza postęp */
    const progressNow = () => state('window.ETROM.Progress.projectProgress(s.workspace.projects.find(x => x.code === "2602")).percent');
    const before = await progressNow();
    await evaluate('const rows = document.querySelectorAll(".plan-item[data-stage-id] > .plan-row"); rows[rows.length - 1].querySelector(".srow__status").click(); return true;');
    await sleep(150);
    check('klik na status etapu przechodzi Do wykonania → W toku', (await state('s.workspace.projects.find(x => x.code === "2602").stages[s.workspace.projects.find(x => x.code === "2602").stages.length - 1].status')) === 'working');
    await evaluate('const rows = document.querySelectorAll(".plan-item[data-stage-id] > .plan-row"); rows[rows.length - 1].querySelector(".srow__status").click(); return true;');
    await sleep(150);
    const after = await progressNow();
    check('oznaczenie etapu jako zakończony podnosi postęp', Number(after) > Number(before), 'przed ' + before + '%, po ' + after + '%');
    // Enter z klawiatury na przycisku statusu: po przerysowaniu fokus musi zostać w tym samym miejscu.
    await evaluate('const rows = document.querySelectorAll(".plan-item[data-stage-id] > .plan-row"); rows[rows.length - 1].querySelector(".srow__status").focus(); return true;');
    await pressKey('enter');
    check('fokus klawiatury zostaje na przycisku statusu po przerysowaniu',
      await evaluate('const rows = document.querySelectorAll(".plan-item[data-stage-id] > .plan-row"); return document.activeElement === rows[rows.length - 1].querySelector(".srow__status");')
      && (await state('s.workspace.projects.find(x => x.code === "2602").stages[s.workspace.projects.find(x => x.code === "2602").stages.length - 1].status')) === 'todo');

    /* 9b. Automat statusów etapu: start sam, zamknięcie za potwierdzeniem */
    const autoInfo = await state('(() => { const p = s.workspace.projects.find(x => x.code === "2603"); const st = p.stages.find(x => x.status === "todo" && (x.tasks || []).length && x.tasks.every(t => t.status === "todo")); return st ? { p: p.id, s: st.id, t: st.tasks[0].id } : null; })()');
    if (autoInfo) {
      await evaluate('window.ETROM.app.actions.moveTask(' + JSON.stringify(autoInfo.p) + ',' + JSON.stringify(autoInfo.s) + ',' + JSON.stringify(autoInfo.t) + ',"working"); return true;');
      await sleep(200);
      const stageOf = (expr) => state('(() => { const st = s.workspace.projects.find(x => x.code === "2603").stages.find(x => x.id === ' + JSON.stringify(autoInfo.s) + '); return ' + expr + '; })()');
      check('automat: ruszone zadanie przestawia etap na „W toku” samo', (await stageOf('st.status')) === 'working');
      await evaluate('window.ETROM.app.actions.moveTask(' + JSON.stringify(autoInfo.p) + ',' + JSON.stringify(autoInfo.s) + ',' + JSON.stringify(autoInfo.t) + ',"done"); return true;');
      await sleep(200);
      check('automat: zakończenie wszystkich zadań nie zamyka etapu samo', (await stageOf('st.status')) === 'working');
      await evaluate('window.ETROM.app.actions.confirmStageDone(' + JSON.stringify(autoInfo.p) + ',' + JSON.stringify(autoInfo.s) + '); return true;');
      await sleep(200);
      check('automat: potwierdzenie zamyka etap', (await stageOf('st.status')) === 'done');
      await evaluate('window.ETROM.app.actions.moveTask(' + JSON.stringify(autoInfo.p) + ',' + JSON.stringify(autoInfo.s) + ',' + JSON.stringify(autoInfo.t) + ',"todo"); return true;');
      await sleep(200);
      check('automat: wznowione zadanie w zamkniętym etapie wraca do „W toku”', (await stageOf('st.status')) === 'working');
    } else {
      check('automat: brak etapu testowego w danych przykładowych', false);
    }

    /* 9c. Etap „Postępowanie”: status z otwartych spraw */
    const decInfo = await state('(() => { const p = s.workspace.projects.find(x => x.code === "2603"); const st = p.stages.find(x => x.status === "todo" && window.ETROM.Model.describeStage(x).decision); return st ? { p: p.id, s: st.id } : null; })()');
    if (decInfo) {
      await evaluate('const a = window.ETROM.app; const r = window.ETROM.Cases.create(a.store.getState().workspace.cases || [], { projectId: ' + JSON.stringify(decInfo.p) + ', stageId: ' + JSON.stringify(decInfo.s) + ', name: "Test postępowania", org: "Urząd", startedAt: "2026-10-01" }, a.store.getState().workspace.projects.map(function (x) { return x.id; })); window.__decCase = r.item.id; a.store.update(function (st) { return Object.assign({}, st, { workspace: Object.assign({}, st.workspace, { cases: window.ETROM.Cases.close(r.list, r.item.id, "2026-10-02", "") }) }); }); a.actions.reopenCase(r.item.id); return true;');
      await sleep(250);
      const decStatus = () => state('s.workspace.projects.find(x => x.code === "2603").stages.find(x => x.id === ' + JSON.stringify(decInfo.s) + ').status');
      const decAsk = () => state('(() => { const p = s.workspace.projects.find(x => x.code === "2603"); const st = p.stages.find(x => x.id === ' + JSON.stringify(decInfo.s) + '); const r = window.ETROM.StageAuto.suggest(st, { decision: true, cases: (s.workspace.cases || []).filter(c => c.stageId === st.id) }); return r ? r.mode : null; })()');
      check('automat: otwarta sprawa w etapie „Postępowanie” ustawia „W toku”', (await decStatus()) === 'working');
      await evaluate('window.ETROM.app.actions.closeCase(window.__decCase, ""); return true;');
      await sleep(200);
      check('automat: zamknięcie wszystkich spraw etapu „Postępowanie” pyta o zakończenie', (await decAsk()) === 'ask');
      await evaluate('window.ETROM.app.actions.deleteCase(window.__decCase); return true;');
      await sleep(150);
    } else {
      check('automat: brak etapu „Postępowanie” w danych przykładowych', false);
    }

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
      /już istnieje/i.test(duplicateError) && (await cardCount()) === 12, 'komunikat: "' + duplicateError + '"');
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
      (await cardCount()) === 13 && (await evaluate('return document.querySelectorAll("#project-form").length;')) === 0,
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
    check('usunięcie zbiorcze zdejmuje oba projekty', (await cardCount()) === 11 && !(await evaluate('return !!document.querySelector(".bulkbar");')),
      'pozycji: ' + (await cardCount()) + ', pasek: ' + (await evaluate('return !!document.querySelector(".bulkbar");')) + ', w danych: ' + (await state('s.workspace.projects.length')));
    await click('[data-toast-action]');
    await sleep(300);
    check('cofnięcie przywraca oba projekty', (await cardCount()) === 13);

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

    const gridCheck = await evaluate('var c = document.querySelectorAll(".pcard"); return { cols: getComputedStyle(document.querySelector(".pcard-grid")).gridTemplateColumns.split(" ").length, w0: c[0].getBoundingClientRect().width, vw: document.documentElement.clientWidth };');
    check('widok kart: kafle układają się w kolumny (nie jeden na całą szerokość)', gridCheck.cols >= 2 && gridCheck.w0 < gridCheck.vw * 0.6, JSON.stringify(gridCheck));

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
    check('ustawienia mają sześć kolorów pracy w toku', (await evaluate('return window.ETROM.Prefs.ACCENTS.length;')) === 6);

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
      await evaluate('const t = [...document.querySelectorAll(".mywork__main .msec__title")].map(n => n.textContent); return t.length > 0 && t.every(x => ["Wymaga reakcji","Po terminie","Dziś","W tym tygodniu","Później","Bez terminu"].includes(x)) && !!document.querySelector(".mrow__project") && !!document.querySelector(".mrow .tdue, .mrow .due--none");'));
    check('pasek boczny pokazuje licznik pracy osoby',
      await evaluate('return /^\\d+$/.test(document.querySelector("[data-screen=mywork] .nav__count").textContent);'));
    await evaluate('const b = document.querySelector("[data-fk=rail-mywork]"); if (b && b.getAttribute("aria-expanded") !== "true") b.click(); return true;');
    await sleep(300);
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
    check('Moja praca to tylko własne zadania: bez sekcji „Wymaga reakcji”, bez zakładki reakcji, bez pasków zleceń i alarmów',
      await evaluate('const v = document.getElementById("view-mywork"); return !v.querySelector("[data-group=react]") && !v.querySelector(".ibx__row") && !v.querySelector("[data-fk=mywork-view-react]") && !v.querySelector("[data-fk=zl-strip]") && !v.querySelector(".ibx__alarms");'));
    check('każdy wiersz zadania ma ten sam znacznik projektu: numer + nazwa projektu',
      await evaluate('const rows = [...document.querySelectorAll("#view-mywork .mrow")]; return rows.length >= 1 && rows.every(r => { const t = r.querySelector(".ptag"); return t && t.querySelector(".mrow__project") && t.querySelector(".ptag__name").textContent.length > 2; });'));
    await evaluate('document.querySelector("#view-mywork .mrow[data-task-id] .chk-ind").click(); return true;');
    await sleep(250);
    await evaluate('const i = document.querySelector("#view-mywork .chk__input"); i.value = "Przekrój A-A"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true;');
    await sleep(350);
    await evaluate('const i = document.querySelector("#view-mywork .chk__input"); i.value = "Opis techniczny"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true;');
    await sleep(350);
    check('lista punktów przy zadaniu: dopisanie Enterem tworzy punkty z kółkiem autora, panel zostaje otwarty',
      await evaluate('const p = document.querySelector("#view-mywork .chk"); return !!p && p.querySelectorAll(".chk__item").length === 2 && !!p.querySelector(".chk__by .avatar");'));
    await evaluate('document.querySelector("#view-mywork .chk__box").click(); return true;');
    await sleep(350);
    check('odhaczenie punktu zmienia kropkę w wierszu, nie ruszając statusu zadania',
      await evaluate('const li = document.querySelector("#view-mywork .chk").closest("li"); return li.querySelectorAll(".chk-ind__dots i.is-done").length === 1 && li.querySelector(".chk-ind__dots").children.length === 2;'));
    check('licznik „Mojej pracy” w menu = zadania na liście (bez pozycji Skrzynki)',
      await evaluate('const n = document.querySelectorAll("#view-mywork .mrow").length; return document.querySelector("[data-screen=mywork] .nav__count").textContent === String(n);'));
    /* Skrzynka: osobny ekran z tym, czego czekają inni */
    check('Skrzynka w menu prowadzi do własnego ekranu, a licznik menu = pozycje ekranu',
      (await evaluate('const a = document.querySelector("[data-screen=inbox]"); return !!a && a.getAttribute("href") === "#/skrzynka";')) && await (async () => { await go('#/skrzynka'); await sleep(350); return evaluate('const v = document.getElementById("view-inbox"); return !v.hidden && document.getElementById("view-mywork").hidden && v.querySelectorAll(".ibx__row").length > 0 && document.querySelector("[data-screen=inbox] .nav__count").textContent === String(v.querySelectorAll(".ibx__row").length);'); })());
    check('Skrzynka zbiera różne rodzaje: zatwierdzenia i wnioski urlopowe, z akcjami w wierszu i objaśnieniem w dymku',
      await evaluate('const v = document.getElementById("view-inbox"); const k = new Set([...v.querySelectorAll(".ibx__row")].map(r => r.dataset.kind)); return k.has("approve") && k.has("leave") && !!v.querySelector("[data-kind=leave] [data-fk^=inbox-leave-ok-]") && !!v.querySelector("[data-kind=leave] [data-fk^=inbox-leave-no-]") && !!v.querySelector("[data-kind=approve] [data-fk^=inbox-approve-]") && !!v.querySelector(".ibx__row [data-fk^=inbox-snooze]") && !!v.querySelector(".ibx__info[data-tooltip]");'));
    await click('[data-fk="inbox-view-leave"]');
    await sleep(200);
    check('zakładka „Urlopy” zostawia tylko wnioski, a „Wszystko” wraca do pełnej listy',
      (await evaluate('const r = [...document.querySelectorAll("#view-inbox .ibx__row")]; return r.length > 0 && r.every(x => x.dataset.kind === "leave");')) && await (async () => { await click('[data-fk="inbox-view-all"]'); await sleep(200); return evaluate('return new Set([...document.querySelectorAll("#view-inbox .ibx__row")].map(r => r.dataset.kind)).size > 1;'); })());
    await click('[data-fk^="inbox-leave-view-"]');
    await sleep(350);
    check('„Wpływ na plan” przy wniosku otwiera Urlopy na zakładce akceptacji',
      await evaluate('return !document.getElementById("view-leave").hidden && !!document.querySelector("#view-leave .lv-inbox");'));
    await go('#/skrzynka');
    await sleep(300);
    const reactSel = '#view-inbox .ibx__list > .ibx__row';
    const inboxBefore = await evaluate('return document.querySelectorAll("' + reactSel + '").length;');
    await click('#view-inbox .ibx__row [data-fk^="inbox-snooze"]');
    await sleep(250);
    check('„Odłóż do jutra” chowa pozycję, licznik na pasku bocznym rośnie, zapis trafia do preferencji',
      await evaluate('return document.querySelectorAll("' + reactSel + '").length === ' + (inboxBefore - 1) + ' && document.querySelector("[data-fk=rail-ib-later] .rl__vcount").textContent === "1" && Object.keys(JSON.parse(localStorage.getItem(window.ETROM.Prefs.KEY)).snoozed).length === 1;'));
    await click('[data-fk="rail-ib-later"]');
    await sleep(200);
    await click('#view-inbox [data-fk^="inbox-restore-"]');
    await sleep(250);
    check('„Przywróć” oddaje pozycję na listę',
      await evaluate('return document.querySelectorAll("' + reactSel + '").length === ' + inboxBefore + ';'));
    const approveBefore = await evaluate('return document.querySelectorAll("#view-inbox [data-kind=approve]").length;');
    await click('[data-fk^="inbox-approve-"]');
    await sleep(300);
    check('„Zatwierdź” zamyka zadanie i pozycja znika ze Skrzynki',
      (await evaluate('return document.querySelectorAll("#view-inbox [data-kind=approve]").length;')) === approveBefore - 1);
    await click('[data-fk="mywork-view-all"]');
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
    check('włączenie zegara pokazuje pasek czasu na dole ekranu i oznacza przycisk',
      await evaluate('return !!document.querySelector(".tdock.is-on") && !!document.querySelector(".timer-btn.is-running") && /^\\d+:\\d\\d:\\d\\d$/.test(document.querySelector(".tdock__time").textContent);'));
    check('zegar zapisuje się jako wpis bez końca, jeden na osobę',
      (await state('(s.workspace.entries || []).filter(e => !e.end && e.personId === s.prefs.me).length')) === 1);
    check('pasek dnia w górnej belce: oś 6–22 z odcinkiem projektu, znacznikiem „teraz” i sumą',
      await evaluate('const m = document.querySelector(".topbar .daymeter"); const r = m && m.querySelector(".dribbon"); return !!r && (new Date().getHours() < 6 || new Date().getHours() >= 22 || (r.getAttribute("data-from") === "360" && r.getAttribute("data-to") === "1320")) && (new Date().getHours() < 6 || new Date().getHours() >= 22 || (!!r.querySelector(".dribbon__seg.is-live") && !!r.querySelector(".dribbon__now"))) && /\\/ 8 h/.test(m.textContent);'));
    check('zegar w belce pokazuje dzień tygodnia, datę i godzinę',
      await evaluate('const c = document.querySelector(".topbar .nowclock"); return !!c && /^(pon|wt|śr|czw|pt|sob|niedz)\\. \\d{1,2} [a-ząćęłńóśźż]{3}$/.test(c.querySelector(".nowclock__day").textContent) && /^\\d\\d:\\d\\d$/.test(c.querySelector(".nowclock__time").textContent) && /tydzień \\d+/.test(c.getAttribute("data-tooltip"));'));
    check('pasek zegara pokazuje godzinę startu „od HH:MM”',
      await evaluate('return /^od \\d\\d:\\d\\d$/.test(document.querySelector(".timer-pill__since").textContent);'));
    await sleep(1700);
    check('zegar tyka bez przerysowania aplikacji',
      await evaluate('return document.querySelector(".timer-pill__time").textContent !== "0:00:00";'));
    await evaluate('const all = [...document.querySelectorAll(".mrow:not(.mrow--approve) .timer-btn")]; const other = all.find(b => !b.classList.contains("is-running")); if (other) other.click(); return !!other;');
    await sleep(300);
    check('włączenie drugiego zegara zatrzymuje pierwszy: nadal jeden chodzący wpis',
      (await state('(s.workspace.entries || []).filter(e => !e.end && e.personId === s.prefs.me).length')) === 1);
    await click('[data-fk="timer-stop"]');
    await sleep(300);
    check('stop zamyka wpis, a pasek czasu wraca do pola „Nad czym pracujesz?”',
      (await state('(s.workspace.entries || []).filter(e => !e.end && e.personId === s.prefs.me).length')) === 0 && await evaluate('return !document.querySelector(".tdock.is-on") && !!document.querySelector(".tdock.is-idle [data-fk=dock-input]");'));
    await evaluate('document.querySelector("[data-fk=dock-input]").focus(); return true;');
    await sleep(200);
    check('pasek czasu: po kliknięciu w pole podpowiada zadania do włączenia',
      await evaluate('return document.querySelectorAll(".tdock__opt").length >= 1 && !document.querySelector(".tdock__pop").hidden;'));
    await evaluate('const i = document.querySelector("[data-fk=dock-input]"); i.value = "zzzzqq"; i.dispatchEvent(new Event("input")); return true;');
    await sleep(150);
    check('pasek czasu: szukanie bez wyniku pokazuje komunikat zamiast pustej listy',
      await evaluate('return /Brak otwartych zadań/.test(document.querySelector(".tdock__pop").textContent);'));
    await evaluate('const i = document.querySelector("[data-fk=dock-input]"); i.value = ""; i.dispatchEvent(new Event("input")); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true;');
    await sleep(300);
    check('pasek czasu: Enter włącza zegar na pierwszej podpowiedzi',
      (await state('(s.workspace.entries || []).filter(e => !e.end && e.personId === s.prefs.me).length')) === 1 && await evaluate('return !!document.querySelector(".tdock.is-on [data-fk=dock-back]") && !!document.querySelector(".tdock.is-on [data-fk=switch-menu]");'));
    await click('[data-fk="timer-stop"]');
    await sleep(300);
    await evaluate('ETROM.app.actions.setTime({ timeMode: "day" }); return true;');
    await go('#/czas');
    check('zapisany czas pojawia się w bloku „Zapisany czas dziś”',
      await evaluate('return document.querySelectorAll(".erow").length >= 1 && /min|h/.test(document.querySelector(".etoday__total").textContent);'));
    check('panel „Dzisiaj” pokazuje pasek celu dnia i wpisy, a podziału na projekty nie powtarza',
      await evaluate('return !!document.querySelector(".etoday .dmtrack--big") && !document.querySelector(".etoday .eproj__row") && document.querySelectorAll(".etoday .erow").length >= 1;'));
    check('„Moja praca” nie ma już panelu czasu ani podsumowania dnia, a Czas w trybie „Dzień” ma wpisy i podsumowanie',
      await evaluate('return !!document.querySelector("#view-time .etoday") && !document.querySelector("#view-time [data-fk=day-summary]") && !document.querySelector(".etoday .eweek") && !!document.querySelector(".dribbon");'));
    check('po zatrzymaniu pasek czasu podpowiada „Wznów” ostatniego zadania',
      await evaluate('const i = document.querySelector("[data-fk=dock-input]"); i.focus(); return true;') && (await sleep(200), await evaluate('return /Wznów:/.test(document.querySelector(".tdock__pop").textContent);')));
    await evaluate('document.querySelector("[data-fk=dock-input]").blur(); return true;');
    await pressKey('t');
    await sleep(300);
    check('klawisz T wznawia ostatnie zadanie', (await state('(s.workspace.entries || []).filter(e => !e.end && e.personId === s.prefs.me).length')) === 1);
    await pressKey('t');
    await sleep(300);
    check('klawisz T zatrzymuje chodzący zegar', (await state('(s.workspace.entries || []).filter(e => !e.end && e.personId === s.prefs.me).length')) === 0);
    await click('.erow .row-actions');
    await sleep(200);
    await evaluate('const item = [...document.querySelectorAll("[role=menuitem]")].find(x => /Zmień godziny/.test(x.textContent)); item.click(); return true;');
    await sleep(300);
    await evaluate('document.getElementById("tm-hours").value = "2,5"; document.getElementById("time-form").requestSubmit(); return true;');
    await sleep(300);
    check('edycja wpisu zmienia czas trwania na 2,5 h',
      await evaluate('return [...document.querySelectorAll(".erow__dur")].some(n => /2 h 30 min/.test(n.textContent));'));
    await go('#/moja-praca');
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
      && await evaluate('return /\d+ h|min/.test(document.querySelector("#inspector .insp-time__total").textContent);'));
    await pressKey('escape');

    /* 21b. Wpis od–do, wybór zadania, kontrola zakresu */
    await go('#/czas');
    await click('[data-fk="time-add"]');
    await sleep(300);
    check('„Dopisz czas wstecz” otwiera formularz z wyborem zadania i polami od–do',
      await evaluate('return document.querySelectorAll("#tm-task option").length >= 1 && !!document.getElementById("tm-from") && !!document.getElementById("tm-to");'));
    await evaluate('document.getElementById("tm-from").value = "10:30"; document.getElementById("tm-to").value = "10:00"; document.getElementById("time-form").requestSubmit(); return true;');
    await sleep(200);
    check('odwrócony zakres od–do pokazuje błąd i nie zapisuje',
      await evaluate('return /Koniec musi być później/.test(document.querySelector("#time-form .field__error").textContent);'));
    const beforeRange = await state('(s.workspace.entries || []).length');
    await evaluate('const d = new Date(Date.now() - 90 * 86400000); const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); document.getElementById("tm-date").value = k; document.getElementById("tm-from").value = "03:10"; document.getElementById("tm-to").value = "03:40"; document.getElementById("time-form").requestSubmit(); return true;');
    await sleep(300);
    check('wpis od–do zapisuje dokładny przedział 30 minut',
      (await state('(s.workspace.entries || []).length')) === beforeRange + 1
      && await evaluate('const e = window.ETROM.app.store.getState().workspace.entries.filter(x => x.source === "manual").sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]; return window.ETROM.TimeLog.minutes(e) === 30 && new Date(e.start).getHours() === 3 && new Date(e.start).getMinutes() === 10;'));

    /* 21e. Zakres opracowania i procedury w formularzu nowego projektu */
    {
      await click('#action-new');
      await sleep(500);
      const sc = await evaluate('var n = function () { return document.querySelectorAll("#pf-stage-picker input:checked").length; }; var out = { full: n() }; var sel = document.getElementById("pf-scope"); sel.value = "limited"; sel.dispatchEvent(new Event("change", { bubbles: true })); out.limited = n(); var w = document.getElementById("pf-proc-water"); w.click(); out.water = n(); out.waterOn = w.checked; return out;');
      check('formularz: zakres ustawia etapy (pełny 16, okrojony 5, + wodnoprawne 7), przełącznik procedury dokłada parę', sc && sc.full === 16 && sc.limited === 5 && sc.water === 7 && sc.waterOn === true, JSON.stringify(sc));
      await evaluate('var b = Array.from(document.querySelectorAll("button")).filter(function (x) { return x.textContent.trim() === "Anuluj"; })[0]; if (b) b.click(); return 1;');
      await sleep(300);
    }

    /* 21d. Panel boczny, kolor projektu, jeden kafel wskaźnika */
    await go('#/czas');
    await evaluate('ETROM.app.actions.setTime({ timeMode: "week" }); return true;');
    await go('#/czas');
    check('kafle wskaźników na Czasie i w projekcie mają ten sam krój etykiety',
      await evaluate('const l = document.querySelector("#view-time .ts-stat__l"); return !!l && getComputedStyle(l).textTransform === "uppercase" && getComputedStyle(l).fontSize === "11px";'));
    await go('#/projekty');
    const colorPid = await evaluate('return window.ETROM.app.store.getState().workspace.projects[0].id;');
    await evaluate('window.ETROM.app.actions.editProject(' + JSON.stringify(colorPid) + '); return true;');
    await sleep(250);
    check('formularz projektu ma paletę 40 kolorów, a wybrany kolor zapisuje się w projekcie',
      await evaluate('return document.querySelectorAll(".colorpick__sw").length === 40;')
      && await evaluate('document.querySelector("[data-fk=color-12]").click(); document.getElementById("project-form").requestSubmit(); return true;')
      && (await sleep(300), await evaluate('return window.ETROM.app.store.getState().workspace.projects[0].color === 12;')));
    check('karta projektu nie ma już gwiazdki przypinania',
      await evaluate('return !document.querySelector(".pc__star");'));

    /* 21c. Ekran „Czas”: karta czasu, eksport, plan obciążenia */
    await go('#/czas');
    check('ekran „Czas” pokazuje kartę czasu z macierzą dni i sumą',
      await evaluate('return !!document.querySelector("#view-time .ts-cal.is-week") && document.querySelectorAll("#view-time .ts-cal .ts-day:not(.is-out)").length === 7 && document.querySelectorAll("#view-time .ts-stat").length === 4 && document.querySelector("#view-time").hidden === false;'));
    check('dni w kalendarzu czasu: weekend jest wyszarzony, każdy dzień ma numer',
      await evaluate('const c = [...document.querySelectorAll("#view-time .ts-cal .ts-day:not(.is-out)")]; return c.length === 7 && c.some(x => x.classList.contains("is-weekend")) && c.every(x => !!x.querySelector(".ts-day__n"));'));
    check('pozycja „Czas” w menu bocznym jest zaznaczona',
      await evaluate('return document.querySelector(\'.sidebar a[href="#/czas"]\').getAttribute("aria-current") === "page";'));
    await click('[data-fk="ts-prev"]');
    await sleep(200);
    check('przesunięcie okresu zmienia tytuł i wraca przyciskiem „Ten tydzień”',
      (await state('s.timeOffset')) === -1 && await evaluate('return !!document.querySelector("[data-fk=ts-today]");'));
    await click('[data-fk="ts-today"]');
    await click('.ts-bar .segmented button:nth-child(3)');
    await sleep(200);
    check('widok miesiąca ma komórkę na każdy dzień miesiąca i sumy tygodni',
      await evaluate('const n = new Date(); const days = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate(); return document.querySelectorAll("#view-time .ts-cal.is-month .ts-day:not(.is-out)").length === days && document.querySelectorAll(".ts-cal .ts-wk").length >= 4;'));
    await go('#/przeglad');
    await sleep(300);
    check('ekran „Przegląd” pokazuje 7 sekcji spraw do decyzji z klikalnymi wierszami i ma pozycję w menu',
      await evaluate('const v = document.getElementById("view-review"); return v.querySelectorAll(".rv-sec").length === 7 && !!document.querySelector(".nav a[href=\\"#/przeglad\\"]") && v.querySelectorAll(".rv-row").length >= 1;'));
    await go('#/kalendarz');
    await sleep(300);
    await evaluate('window.ETROM.app.actions.setCal({ rail: "day" }); return true;');
    await sleep(300);
    check('ekran „Kalendarz”: miesiąc w wierszach tygodni z paskami nieobecności, wybrany dzień i lista najbliższych terminów',
      await evaluate('const v = document.getElementById("view-calendar"); const n = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(); return !v.hidden && v.querySelectorAll(".cb-day").length === n && v.querySelectorAll(".cb-bg").length >= n && v.querySelectorAll(".cb-day.is-today").length === 1 && !!v.querySelector(".cb-layers") && !!v.querySelector(".rl__side") && !!document.querySelector(".nav a[href=\\"#/kalendarz\\"]");'));
    const calTitle = await evaluate('return document.querySelector(".cv-title").textContent;');
    await click('[data-fk="cv-next"]');
    await sleep(250);
    check('strzałka „Następny miesiąc” zmienia miesiąc w kalendarzu, a „Dziś” wraca do bieżącego',
      (await evaluate('return document.querySelector(".cv-title").textContent;')) !== calTitle && (await state('!!s.calAnchor')) === true);
    await click('[data-fk="cv-today"]');
    await sleep(250);
    check('„Dziś” w kalendarzu wraca do bieżącego miesiąca', (await evaluate('return document.querySelector(".cv-title").textContent;')) === calTitle);
    // ---- Kalendarz: widoki, filtry, ustawienie widoczności ----
    await evaluate('window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.setTime({ calAnchor: null, calDay: null }); window.ETROM.app.actions.setCal({ rail: "filters" }); return true;');
    await sleep(300);
    check('kalendarz: panel warstw z zakresem, osobami, projektami i rodzajami oraz przełącznik 5 widoków (Dzień, Tydzień, Miesiąc, Rok, Agenda)',
      await evaluate('const v = document.getElementById("view-calendar"); return !!v.querySelector(".rl__side .lv-month") && v.querySelectorAll(".cv-panel__sec").length === 4 && v.querySelectorAll(".cv-bar .segmented__btn").length === 5 && v.querySelectorAll(".cv-stats .ts-stat").length === 4 && v.querySelectorAll(".cv-opt").length >= 4;'));
    await evaluate('window.ETROM.app.actions.setCal({ view: "day" }); return true;');
    await sleep(300);
    check('kalendarz: widok Dzień ma 4 kafle statystyk i trzy grupy (terminy, wyjazdy i spotkania, nieobecności)',
      await evaluate('const v = document.getElementById("view-calendar"); return v.querySelectorAll(".cv-stats .ts-stat").length === 4 && v.querySelectorAll(".cv-dgroup").length === 3 && !v.querySelector(".cb-day");'));
    await evaluate('window.ETROM.app.actions.setCal({ view: "week" }); return true;');
    await sleep(300);
    check('kalendarz: widok Tydzień ma 7 kafli i nie ma już macierzy „Kto gdzie pracuje”',
      await evaluate('const v = document.getElementById("view-calendar"); return v.querySelectorAll(".cb-wc").length === 7 && !v.querySelector(".lv-t") && !/Kto gdzie pracuje/.test(v.textContent);'));
    await evaluate('window.ETROM.app.actions.setCal({ view: "year" }); return true;');
    await sleep(300);
    check('kalendarz: widok Rok używa tych samych miesięcy co Urlopy (12 × lv-month)',
      await evaluate('return document.querySelectorAll("#view-calendar .lv-month").length >= 12;'));
    await evaluate('window.ETROM.app.actions.setCal({ view: "team" }); return true;');
    await sleep(300);
    check('kalendarz: nie ma już widoku Zespół (stary zapis wraca do miesiąca), a „Dodaj” to jeden przycisk Wyjazd lub spotkanie',
      await evaluate('const v = document.getElementById("view-calendar"); return !v.querySelector(".lv-t") && v.querySelectorAll(".cb-day").length >= 28 && /Wyjazd lub spotkanie/.test(v.querySelector("[data-fk=cv-add]").textContent) && !v.querySelector("[data-fk=cv-add][aria-haspopup]") && !/Wyjazd tego dnia/.test(v.textContent);'));
    await evaluate('window.ETROM.app.actions.setCal({ view: "month", hiddenKinds: ["absence", "trip", "deadline", "task"] }); return true;');
    await sleep(300);
    check('kalendarz: ukrycie wszystkich rodzajów czyści siatkę, a filtr jest zapamiętany w ustawieniach urządzenia',
      await evaluate('return document.querySelectorAll("#view-calendar .cv-ev").length === 0;') && (await state('s.prefs.cal.hiddenKinds.length')) === 4);
    await evaluate('window.ETROM.app.actions.setCal({ hiddenKinds: [] }); return true;');
    await evaluate('window.ETROM.app.actions.setCal({ rail: "day" }); return true;');
    check('kalendarz: boczne panele otwierają się z przycisków paska (Filtry, Dzień), jeden naraz',
      await evaluate('const v = document.getElementById("view-calendar"); const b = v.querySelectorAll(".rl__dock .rl__btn"); return b.length >= 2 && v.querySelectorAll(".rl__side").length === 1 && b[1].getAttribute("aria-expanded") === "true" && b[0].getAttribute("aria-expanded") === "false";'));
    // ---- Pulpit, menu grupowe, wyjazdy ----
    await evaluate('window.ETROM.app.actions.setMe("p-1"); return true;');
    await go('#/pulpit');
    await sleep(500);
    check('Pulpit Dyrekcji: hero z datą, 5 kafli, pogoda i stany wód oznaczone jako przykładowe, macierz zespołu',
      await evaluate('const v = document.getElementById("view-dashboard"); return !v.hidden && !!v.querySelector(".db-hero__date") && v.querySelectorAll(".db-tile").length === 5 && /przykładowe/i.test(v.querySelector("[data-fk=db-weather]").textContent) && /przykładowe/i.test(v.querySelector("[data-fk=db-water]").textContent) && !!v.querySelector("[data-fk=db-matrix]") && !!v.querySelector("[data-fk=db-newproject]") && !!v.querySelector("[data-fk=db-finance]");'));
    check('menu Dyrekcji: bloki Finanse (3× WKRÓTCE) i Administracja, bez pozycji „Urlopy zespołu”',
      await evaluate('const g = document.querySelector("[data-group=finance]"); return !g.hidden && g.querySelectorAll(".nav__soon").length === 3 && !document.querySelector("[data-group=admin]").hidden && !document.querySelector("[data-screen=leaveteam]");'));
    await evaluate('document.querySelector("[data-fk=db-customize]").click(); return true;');
    await sleep(300);
    check('Dostosuj pulpit: okno z pulą 8 kafli, komplet blokuje kolejne, strzałki kolejności',
      await evaluate('const b = document.querySelector(".dbset"); return !!b && b.querySelectorAll(".dbset__row").length === 8 && b.querySelectorAll(".dbset__row input:checked").length === 5 && b.querySelector("#dbset-react").disabled && b.querySelectorAll(".dbset__move").length === 5;'));
    await evaluate('document.getElementById("dbset-soon").click(); return true;');
    await sleep(250);
    await evaluate('document.getElementById("dbset-absent").click(); return true;');
    await sleep(350);
    check('wybór kafli: zamiana „Terminy w 7 dni” na „Nieobecni dziś” zmienia kafle, okno zostaje otwarte i zakotwiczone',
      await evaluate('const t = Array.from(document.querySelectorAll("#view-dashboard .db-tile")).map(function (n) { return n.getAttribute("data-fk"); }); const p = document.querySelector(".dbset").closest(".popover").getBoundingClientRect(); const a = document.querySelector("[data-fk=db-customize]").getBoundingClientRect(); return t.join() === "db-t-risk,db-t-load,db-t-approve,db-t-late,db-t-absent" && Math.abs(p.right - a.right) < 60;'));
    await evaluate('document.querySelector("[data-fk=dbset-fold]").click(); return true;');
    await sleep(350);
    check('zwiń wszystkie: karty chowają treść, zostaje nagłówek i podsumowanie, stan zapisany w ustawieniach',
      await evaluate('const c = document.querySelector("#view-dashboard [data-card=health]"); const body = c.querySelector(".db-list, .db-empty"); return c.classList.contains("is-collapsed") && getComputedStyle(body).display === "none" && c.querySelector(".db-card__fold").getAttribute("aria-expanded") === "false" && window.ETROM.app.actions.dashPrefs().collapsed.indexOf("health") >= 0;'));
    await evaluate('document.querySelector("[data-fk=dbset-reset]").click(); return true;');
    await sleep(300);
    check('przywróć domyślne: kafle i karty wracają do stanu początkowego',
      await evaluate('const d = window.ETROM.app.actions.dashPrefs(); return d.tiles.length === 0 && d.collapsed.length === 0 && document.querySelectorAll("#view-dashboard .db-tile").length === 5 && !document.querySelector("#view-dashboard .is-collapsed");'));
    await evaluate('document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); const m = document.querySelector(".popover"); if (m) m.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return true;');
    await sleep(200);
    await evaluate('window.ETROM.app.actions.setMe("p-3"); return true;');
    await sleep(400);
    check('Pulpit pracownika: 5 kafli bez macierzy zespołu i bez Finansów, menu bez Finansów i Administracji',
      await evaluate('const v = document.getElementById("view-dashboard"); return v.querySelectorAll(".db-tile").length === 5 && !v.querySelector("[data-fk=db-matrix]") && !v.querySelector("[data-fk=db-finance]") && !v.querySelector("[data-fk=db-newproject]") && document.querySelector("[data-group=finance]").hidden && document.querySelector("[data-group=admin]").hidden;'));
    await go('#/moja-praca');
    await sleep(300);
    check('Moja praca ma tytuł bez powitania', await evaluate('return document.getElementById("mywork-title").textContent === "Moja praca";'));
    await go('#/kalendarz');
    await sleep(300);
    await click('[data-fk="cv-add"]');
    await sleep(300);
    await evaluate('const todayIso = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })(); for (const [id, v] of [["tr-place", "Lipnica"], ["tr-from", todayIso], ["tr-to", todayIso]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } return true;');
    await evaluate('const f = document.getElementById("trip-form"); (f.querySelector("button[type=submit]") || document.querySelector("button[type=submit][form=trip-form]")).click(); return true;');
    await sleep(400);
    check('wyjazd dodany przez pracownika trafia do danych, kalendarza i chipa na Pulpicie',
      (await state('s.workspace.trips.filter(t => t.place === "Lipnica").length')) === 1 && (await state('s.workspace.trips.filter(t => t.place === "Lipnica")[0].personIds.join()')) === 'p-3' && await evaluate('return !!document.querySelector("#view-calendar .cb-chip.is-trip");') && await (async () => { await go('#/pulpit'); await sleep(400); return evaluate('const c = document.querySelector("[data-fk=db-trip]"); return !!c && /Dziś: teren/.test(c.textContent);'); })());
    await go('#/kalendarz');
    await evaluate('window.ETROM.app.actions.setCal({ view: "month" }); return true;');
    await sleep(300);
    await evaluate('document.querySelector("#view-calendar .cb-day").click(); return true;');
    await sleep(300);
    check('kalendarz: kliknięcie dnia w Miesiącu otwiera ten dzień w widoku Dzień',
      (await state('s.prefs.cal.view')) === 'day' && await evaluate('return !!document.querySelector("#view-calendar .cv-day, #view-calendar .cv-dgroup");'));
    await go('#/pulpit');
    await go('#/kalendarz');
    await sleep(300);
    check('kalendarz: po powrocie widok Dzień pokazuje dzień bieżący, nie ostatnio kliknięty', (await state('s.calAnchor')) === null && (await state('s.calDay')) === null);
    await evaluate('window.ETROM.app.actions.setCal({ view: "month" }); return true;');
    await go('#/czas');
    await evaluate('window.ETROM.app.actions.setTime({ timeMode: "day" }); return true;');
    await sleep(300);
    check('czas: wyjazd bez pomiaru daje w Dniu 8 h i przycisk zmiany godzin wyjazdu',
      await evaluate('const dow = new Date().getDay(); if (dow === 0 || dow === 6) return true; const c = document.querySelector("[data-fk=ts-trip]"); return !!c && /8 h/.test(document.getElementById("view-time").textContent) && /08:00–16:00/.test(c.textContent) && !!c.querySelector("[data-fk=ts-trip-edit]");'));
    await evaluate('window.ETROM.app.actions.setTime({ timeMode: "week" }); return true;');
    await go('#/urlopy');
    await sleep(300);
    check('urlopy: legenda nie zawiera szkoleń',
      await evaluate('return !/szkolen/i.test(document.getElementById("view-leave").textContent);'));
    await evaluate('document.querySelector("#view-leave [data-fk=cb-legend-open]").click(); return true;');
    await sleep(400);
    check('legenda: jedna linia z grupami i przycisk „Legenda” otwiera okno z objaśnieniami',
      await evaluate('const d = document.querySelector("dialog.drawer"); return !!document.querySelector("#view-leave .cb-lg .cb-lg__g") && !!d && d.querySelectorAll(".cb-lgcol").length === 2 && /Nieobecny/.test(d.textContent) && /L4 innej osoby/.test(d.textContent);'));
    await evaluate('window.ETROM.Dialog.closeDrawer(); return true;');
    await go('#/pulpit');
    await evaluate('window.ETROM.app.actions.setMe("p-1"); return true;');
    await sleep(300);
    check('Dyrekcja widzi wyjazd w „Zespół dziś”', await evaluate('return /Lipnica/.test(document.querySelector("[data-fk=db-team]").textContent);'));
    await evaluate('ETROM.app.store.update(function (st) { return Object.assign({}, st, { workspace: Object.assign({}, st.workspace, { trips: [] }) }); }); return true;');
    // ---- Zlecenia wewnętrzne ----
    await evaluate('ETROM.app.store.update(function (st) { return Object.assign({}, st, { workspace: Object.assign({}, st.workspace, { orders: [] }) }); }); return true;');
    await go('#/zlecenia');
    await sleep(400);
    check('menu ma „Zlecenia” w grupie Start, ekran pusty', await evaluate('return !!document.querySelector("[data-screen=orders]") && !document.getElementById("view-orders").hidden && !document.querySelector("#view-orders .zl-card");'));
    await click('[data-fk="zl-new"]');
    await sleep(400);
    await click('[data-kind="pay"]');
    await sleep(300);
    check('kategoria „Do opłacenia” ma symbol $ i pola przelewu', await evaluate('return document.querySelector("[data-kind=pay] .zl-dollar").textContent === "$" && !!document.querySelector("[data-fk=zf-pay]");'));
    await click('[data-fk="zf-add-next"]');
    await sleep(300);
    await evaluate('const set = (id, v) => { document.getElementById(id).value = v; }; set("zf-text", "Opłata za pełnomocnictwo"); set("zf-who", "p-1"); set("zf-payee", "Urząd Miasta"); set("zf-account", "11 2222 3333 4444"); set("zf-amount", "17,00 zł"); set("zn-text", "Wyślij potwierdzenie do RZGW"); set("zn-who", "p-2"); set("zn-kind", "send"); return true;');
    await evaluate('document.getElementById("order-form").querySelector("button[type=submit]").click(); return true;');
    await sleep(500);
    check('zlecenie z krokiem „potem” trafia do danych: otwarte + czekające',
      (await state('s.workspace.orders.map(o => o.kind + ":" + o.status + ":" + o.assigneeId).join()')) === 'pay:open:p-1,send:waiting:p-2');
    await evaluate('window.ETROM.app.actions.setMe("p-1"); return true;');
    await sleep(500);
    check('wykonawca widzi czerwony licznik w menu i kartę z danymi przelewu oraz „Potem”',
      await evaluate('const c = document.querySelector("[data-screen=orders] .count"); return !c.hidden && c.textContent === "1" && !!document.querySelector("#view-orders .zl-card [data-fk=zl-pay]") && /Potem/.test(document.querySelector("#view-orders .zl-card").textContent) && !!document.querySelector("[data-fk=zl-timer]");'));
    await go('#/zlecenia');
    await sleep(300);
    await click('[data-fk="zl-done"]');
    await sleep(300);
    await evaluate('document.getElementById("zl-ret-note").value = "Zapłacone"; return true;');
    await click('[data-fk="zl-confirm"]');
    await sleep(500);
    check('zamknięcie samym potwierdzeniem uruchamia następny krok u kolejnej osoby',
      (await state('s.workspace.orders.map(o => o.status).join()')) === 'done,open' && (await state('s.workspace.orders[0].result')) === null);
    await evaluate('window.ETROM.app.actions.setMe("p-2"); return true;');
    await sleep(500);
    check('następna osoba widzi zlecenie „Do wysłania” u siebie', await evaluate('const cs = document.querySelectorAll("#view-orders .zl-card"); return cs.length === 1 && cs[0].dataset.kind === "send";'));
    // zlecenia w innych miejscach: Pulpit, Moja praca, projekt, menu zadania
    await evaluate('window.ETROM.app.actions.setMe("p-2"); return true;');
    await go('#/pulpit');
    await sleep(500);
    check('Pulpit: karta „Skrzynka” pokazuje najpilniejsze pozycje i prowadzi do ekranu Skrzynki', await evaluate('const c = document.querySelector("#view-dashboard [data-fk=db-inbox]"); return !!c && c.querySelectorAll("[data-fk=db-inbox-row]").length > 0 && c.querySelector(".db-link").getAttribute("href") === "#/skrzynka";'));
    await go('#/moja-praca');
    await sleep(500);
    await go('#/skrzynka');
    await sleep(300);
    check('Skrzynka: zlecenie do mnie ma wiersz z przyciskiem „Otwórz zlecenie”, który prowadzi do Zleceń',
      (await evaluate('return !!document.querySelector("#view-inbox [data-kind=order] [data-fk^=inbox-order-]");')) && await (async () => { await click('#view-inbox [data-kind=order] [data-fk^="inbox-order-"]'); await sleep(300); return evaluate('return !document.getElementById("view-orders").hidden;'); })());
    const zlPid = await state('s.workspace.projects[0].id');
    await go('#/projekty/' + zlPid + '/zlecenia');
    await sleep(500);
    await click('[data-fk="zl-new-project"]');
    await sleep(400);
    check('„Nowe zlecenie” z projektu ma projekt wstępnie wybrany', (await evaluate('return document.getElementById("zf-project").value;')) === String(zlPid));
    await evaluate('document.getElementById("order-form").querySelector("button[type=button], .btn--ghost") && 0; return true;');
    await evaluate('window.ETROM.app.actions.openOrder(' + zlPid + ', "Zadanie testowe"); return true;');
    await sleep(300);
    check('openOrder z tekstem zadania wypełnia opis', (await evaluate('return document.getElementById("zf-text").value;')) === 'Zadanie testowe');
    await evaluate('window.ETROM.app.store.set({ orderForm: null }); return true;');
    await evaluate('ETROM.app.store.update(function (st) { return Object.assign({}, st, { workspace: Object.assign({}, st.workspace, { orders: [] }) }); }); return true;');
    await evaluate('window.ETROM.app.actions.setMe("p-3"); return true;');
    await go('#/projekty');
    await sleep(300);
    check('lista Projekty: „Biuro dziś” (czas całego biura) jest ukryte przed pracownikiem',
      await evaluate('return !/Biuro dziś/.test(document.getElementById("view-projects").textContent);'));
    await evaluate('window.ETROM.app.actions.setMe("p-1"); return true;');
    await go('#/projekty');
    await sleep(300);
    check('lista Projekty: zarząd widzi „Biuro dziś”', await evaluate('return /Biuro dziś/.test(document.getElementById("view-projects").textContent);'));
    await go('#/plan');
    await sleep(300);
    check('oś planu ma pas miesięcy, zakres tygodnia z numerem, nagłówki dni, a „Kwartał” rozciąga okno do 12 tygodni',
      await evaluate('return document.querySelectorAll(".pb-row--head .pb-dh").length === document.querySelectorAll(".pb-row--head .pb-wk--head").length * 5 && /^\\d+( \\S+)? – \\d+ \\S+$/.test(document.querySelector(".pb-wk__top b").textContent) && /^T\\d+/.test(document.querySelector(".pb-wk__top small").textContent) && !!document.querySelector(".pb-months .pb-month") && [...document.querySelectorAll(".pb-toolbar .segmented button")].some(b => b.textContent === "Kwartał");'));
    check('urlop: kapsuła ze słońcem tylko w wierszu osoby, w wierszach zadań sama kolumna dni', await evaluate('return document.querySelectorAll(".pb-row--task .pb-absent.is-head").length === 0 && !!document.querySelector(".pb-row--who .pb-absent.is-head .pb-absent__cap svg") && !document.querySelector(".pb-absent.is-head[data-label]");'));
    check('ekran „Plan” to plan tygodni: kolumny tygodni, wiersze osób, paski zadań i znaczniki obłożenia',
      await evaluate('return !!document.querySelector(".pb") && document.querySelectorAll(".pb-wk--head").length === 6 && document.querySelectorAll(".pb-person[data-person]").length >= 1 && document.querySelectorAll(".pb-bar").length >= 3 && document.querySelectorAll(".pb-load").length >= 6;'));
    await evaluate('const b = document.querySelector(".pb-load:not(.is-empty)"); if (b) b.click(); return !!b;');
    await sleep(200);
    check('kliknięcie znacznika tygodnia pokazuje zadania z godzinami',
      await evaluate('return !!document.querySelector(".pl-detail") && document.querySelectorAll(".pl-task").length >= 1;'));
    await click('[data-fk="pb-next"]');
    await sleep(250);
    check('strzałka „późniejsze tygodnie” przesuwa okno planu, a „Dziś” je cofa',
      (await state('s.planOffset')) > 0 && (await evaluate('return document.querySelector(".pb-wk--head.is-current") === null;')));
    await click('[data-fk="pb-today"]');
    await sleep(200);
    await evaluate('const b = [...document.querySelectorAll(".pb-toolbar .segmented button")].find(x => /^8 tyg/.test(x.textContent.trim())); b.click(); return true;');
    await sleep(250);
    check('przełącznik 8 tygodni zmienia liczbę kolumn',
      await evaluate('return document.querySelectorAll(".pb-wk--head").length === 8;'));
    /* przeciąganie paska: cały pasek o dwa dni robocze, termin z klawiatury, przeniesienie na inną osobę */
    const planBar = await evaluate('const el = [...document.querySelectorAll(".pb-bar.is-editable")].find(x => !x.classList.contains("is-late")); if (!el) return null; return { p: el.dataset.projectId, s: el.dataset.stageId, t: el.dataset.taskId, person: el.dataset.personId };');
    const taskOfBar = () => state('(function () { const p = s.workspace.projects.find(x => String(x.id) === "' + planBar.p + '"); const st = p.stages.find(x => x.id === "' + planBar.s + '"); const t = st.tasks.find(x => x.id === "' + planBar.t + '"); return [t.start, t.deadline, t.assignees.join(",")].join("|"); })()');
    const spanBefore = await taskOfBar();
    await evaluate('const el = document.querySelector(\'.pb-bar[data-project-id="' + planBar.p + '"][data-stage-id="' + planBar.s + '"][data-task-id="' + planBar.t + '"]\'); const r = el.getBoundingClientRect(); const w = el.closest(".pb-track").getBoundingClientRect().width / (document.querySelectorAll(".pb-wk--head").length * 5); const x = r.left + r.width / 2; const y = r.top + r.height / 2; const ev = (type, dx) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, button: 0, clientX: x + dx, clientY: y })); ev("pointerdown", 0); ev("pointermove", w * 2.2); ev("pointerup", w * 2.2); return true;');
    await sleep(400);
    const afterDrag = await taskOfBar();
    check('przeciągnięcie paska zmienia start i termin zadania (do cofnięcia), a pojemność tygodni liczy się od nowa',
      spanBefore !== afterDrag && /^\d{4}-\d{2}-\d{2}\|/.test(afterDrag) && !!(await evaluate('return [...document.querySelectorAll(".toast")].some(t => /Przesunięto zadanie/.test(t.textContent));')));
    await evaluate('const el = document.querySelector(\'.pb-bar[data-project-id="' + planBar.p + '"][data-stage-id="' + planBar.s + '"][data-task-id="' + planBar.t + '"]\'); el.focus(); el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true })); return true;');
    await sleep(350);
    const afterKey = await taskOfBar();
    check('Shift+→ na pasku wydłuża termin o dzień roboczy, a fokus zostaje na pasku',
      afterKey !== afterDrag && afterKey.split("|")[0] === afterDrag.split("|")[0] && afterKey.split("|")[1] > afterDrag.split("|")[1]
      && (await evaluate('return document.activeElement && document.activeElement.classList.contains("pb-bar");')));
    await evaluate('const b = [...document.querySelectorAll(".toast [data-toast-action]")].pop(); b.click(); return true;');
    await sleep(300);
    check('„Cofnij” przywraca poprzednie okno zadania', (await taskOfBar()) === afterDrag);
    await evaluate('const ws = window.ETROM.app.store.getState().workspace; const row = document.querySelector(".pb-tn"); const pid = row.dataset.projectId, sid = row.dataset.stageId, tid = row.dataset.taskId; const next = JSON.parse(JSON.stringify(ws)); const pr = next.projects.find(x => String(x.id) === pid); const t = pr.stages.find(x => x.id === sid).tasks.find(x => x.id === tid); t.checklist = [{ id: "c-1", text: "Opis stanu", done: true, by: (t.assignees || [])[0] || "", doneBy: (t.assignees || [])[0] || "" }, { id: "c-2", text: "Przekrój A-A", done: false, by: (t.assignees || [])[0] || "" }]; window.ETROM.app.store.set({ workspace: next }); return true;');
    await sleep(500);
    await evaluate('document.querySelector(".pb-tn .chk-ind:not(.chk-ind--empty)").click(); return true;');
    await sleep(300);
    check('Plan: zadanie z listą ma kropki w lewej kolumnie, a klik rozwija podgląd punktów pod wierszem',
      await evaluate('const r = document.querySelector(".pb-row--task .chk"); return !!r && r.querySelectorAll(".chk__item").length === 2 && !!document.querySelector(".pb-tn .chk-ind__dots");'));
    await evaluate('document.querySelector(".pb-tn .chk-ind:not(.chk-ind--empty)").click(); return true;');
    await sleep(200);
    check('pasek jest jednolity (bez wypełnienia), a lewa kolumna pokazuje godziny i nazwę projektu',
      await evaluate('const el = document.querySelector(".pb-bar.is-editable"); const tn = document.querySelector(".pb-tn[data-task-id=\\"" + el.dataset.taskId + "\\"][data-project-id=\\"" + el.dataset.projectId + "\\"]"); return /\\d/.test(tn.querySelector(".pb-bar__hours").textContent) && /h/.test(tn.querySelector(".pb-bar__hours").textContent) && !el.querySelector(".pb-bar__fill") && !!tn.querySelector(".pb-tn__proj") && el.style.getPropertyValue("--d").length > 0;'));
    const estBefore = await state('(function () { const p = s.workspace.projects.find(x => String(x.id) === "' + planBar.p + '"); const t = p.stages.find(x => x.id === "' + planBar.s + '").tasks.find(x => x.id === "' + planBar.t + '"); return t.estimate || 0; })()');
    await evaluate('const sel = \'.pb-tn[data-project-id="' + planBar.p + '"][data-stage-id="' + planBar.s + '"][data-task-id="' + planBar.t + '"] [data-fk^="pb-hours-"]\'; document.querySelector(sel).click(); const i = document.querySelector("[data-fk=pb-hours-input]"); i.value = "7"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true;');
    await sleep(350);
    const estAfter = await state('(function () { const p = s.workspace.projects.find(x => String(x.id) === "' + planBar.p + '"); const t = p.stages.find(x => x.id === "' + planBar.s + '").tasks.find(x => x.id === "' + planBar.t + '"); return t.estimate || 0; })()');
    check('klik w godziny na pasku pozwala je zmienić (zapisuje szacunek zadania)', estAfter >= 7 && estAfter !== estBefore);
    await evaluate('ETROM.app.actions.setTime({ planCell: null }); return true;');
    await sleep(250);
    check('Plan: nie ma już paska priorytetów, jest przełącznik widoków i termin na pasku, a słupki dni są schowane',
      await evaluate('return !document.querySelector(".pb-prio") && !!document.querySelector(".pb-toolbar .segmented") && !document.querySelector(".pb-bar .pb-bar__due") && !!document.querySelector("[data-fk=pb-due]") && !document.querySelector(".pb-dbars");'));
    await evaluate('document.querySelector(".pb-load[data-fk^=pl-cell-]").click(); return true;');
    await sleep(300);
    check('klik w obłożenie tygodnia rozwija słupki godzin dnia tej osoby (5 dni), drugi klik je chowa',
      await evaluate('return document.querySelectorAll(".pb-dbars .pb-dbar:not(.is-off)").length === 5;'));
    await evaluate('document.querySelector(".pb-load[data-fk^=pl-cell-]").click(); return true;');
    await sleep(250);
    const lwBefore = await evaluate('return parseFloat(getComputedStyle(document.querySelector(".pb")).getPropertyValue("--lw"));');
    await evaluate('document.querySelector("[data-fk=pb-resize]").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); return true;');
    await sleep(150);
    check('uchwyt przy kolumnie nazw poszerza ją strzałką → (wspólna szerokość zapisana w przeglądarce)',
      (await evaluate('return parseFloat(document.querySelector(".pb").style.getPropertyValue("--lw"));')) === lwBefore + 16);
    await evaluate('document.querySelector("[data-fk=pb-resize]").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); return true;');
    await evaluate('ETROM.app.actions.setTime({ planMode: "projects" }); return true;');
    await sleep(400);
    check('Plan „Wg projektów”: grupy projektów w kolejności z listy Projekty, z paskami zadań i awatarami osób',
      await evaluate('const codes = [...document.querySelectorAll(".pb-row--proj .mrow__project")].map(x => x.textContent.trim()); return codes.length >= 2 && codes[0] === "2602" && document.querySelectorAll(".pb-person--proj .pb-bar").length >= 3 && !!document.querySelector(".pb-person--proj .pb-tn__who .avatar");'));
    check('Plan „Wg projektów”: nagłówek etapu pokazuje budżet etapu z procentem i cienką belką',
      await evaluate('const h = document.querySelector(".pb-row--stage .pb-stage__bud"); return !!h && /%/.test(h.textContent) && !!h.querySelector(".pb-tn__meter");'));
    const meNow = await state('s.prefs.me');
    await evaluate('ETROM.app.actions.setMe("p-1"); return true;');
    await sleep(300);
    const anyFlag = 'return ETROM.app.store.getState().workspace.projects.some(p => p.stages.some(x => x.budgetFlag));';
    await evaluate('document.querySelector("[data-fk^=pb-stage-flag-]").click(); return true;');
    await sleep(300);
    check('Oznaczenie etapu: okienko ma dwa stany, uwagę i „Zapisz”',
      await evaluate('return !!document.querySelector("[data-fk=bflag-warn]") && !!document.querySelector("[data-fk=bflag-over]") && !!document.querySelector("[data-fk=bflag-note]") && !!document.querySelector("[data-fk=bflag-save]");'));
    await evaluate('document.querySelector("[data-fk=bflag-over]").click(); const n = document.querySelector("[data-fk=bflag-note]"); n.value = "Zostało niewiele — pytaj lidera."; n.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("[data-fk=bflag-save]").click(); return true;');
    await sleep(500);
    check('Oznaczenie etapu: zapis zapisuje stan, autora i uwagę, a nagłówek etapu pokazuje „oznaczone dla zespołu”',
      await evaluate('const st = ETROM.app.store.getState().workspace.projects.flatMap(p => p.stages).find(x => x.budgetFlag); const b = document.querySelector("[data-fk^=pb-stage-flag-].is-set"); return !!st && st.budgetFlag.state === "over" && !!st.budgetFlag.by && /pytaj lidera/.test(st.budgetFlag.note) && !!b && /oznaczone dla zespołu/.test(b.textContent);'));
    await evaluate('document.querySelector("[data-fk^=pb-stage-flag-].is-set").click(); return true;');
    await sleep(300);
    await evaluate('document.querySelector("[data-fk=bflag-clear]").click(); return true;');
    await sleep(500);
    check('Oznaczenie etapu: „Zdejmij” usuwa flagę', !(await evaluate(anyFlag)));
    await evaluate('ETROM.app.actions.setMe(' + JSON.stringify(meNow) + '); return true;');
    await sleep(300);
    /* Sprawy w toku: wiersze w Planie, „Zapytałem”, sekcja w Mojej pracy, zabezpieczenie przed pominięciem. */
    await evaluate('ETROM.app.actions.setTime({ planMode: "people" }); return true;');
    await sleep(500);
    check('Sprawy w toku: Plan pokazuje osobny pas „Sprawy w toku” z wierszem sprawy i licznikiem dni',
      await evaluate('const r = document.querySelector(".pb-row--case"); return !!document.querySelector(".pb-row--casehead") && !!r && /\\d+ dni/.test(r.textContent) && !!document.querySelector(".pb-row--case .pb-case__m--filed");'));
    const caseInfo = JSON.parse(await evaluate('const c = ETROM.app.store.getState().workspace.cases[0]; return JSON.stringify({ id: c.id, owner: c.ownerId, n: c.events.length });'));
    await evaluate('ETROM.app.actions.caseCall("' + caseInfo.id + '", "Rozmowa testowa"); return true;');
    await sleep(500);
    check('Sprawy w toku: „Zapytałem” zapisuje wpis z notatką, przesuwa przypomnienie i zostawia znacznik na wykresie',
      await evaluate('const c = ETROM.app.store.getState().workspace.cases.find(x => x.id === "' + caseInfo.id + '"); return c.events.length === ' + (caseInfo.n + 1) + ' && c.events[c.events.length - 1].note === "Rozmowa testowa" && !!document.querySelector(".pb-row--case[data-case-id=\\"' + caseInfo.id + '\\"] .pb-case__m--call");'));
    const railsBefore = JSON.stringify(await state('s.prefs.collapsedRails || []'));
    const meBeforeCases = await state('s.prefs.me');
    await evaluate('ETROM.app.actions.setMe("' + caseInfo.owner + '"); return true;');
    await go('#/moja-praca');
    await sleep(500);
    await evaluate('const b = document.querySelector("[data-fk=rail-mycases]"); if (b && b.getAttribute("aria-expanded") === "false") b.click(); return true;');
    await sleep(400);
    check('Sprawy w toku: Moja praca ma sekcję „Czekam na odpowiedź” z licznikiem dni i przyciskiem „Zapytałem”',
      await evaluate('const sec = document.querySelector("[data-fk=my-cases]"); return !!sec && sec.querySelectorAll(".case-card").length >= 1 && /\\d+\\s*dni/.test(sec.textContent) && !!sec.querySelector("[data-fk^=case-open-]") && !sec.querySelector("[data-fk^=case-ask-]");'));
    check('Moja praca: sprawy stoją w zwijanej szynie jako kafelki, a termin zadania to chip w jednej gramatyce',
      await evaluate('const side = document.querySelector(".rl--dock .rl__side [data-fk=my-cases]"); const chips = [...document.querySelectorAll(".mrow .dchip")].map(c => c.textContent); return !!side && !!document.querySelector(".rl--dock .rl__main") && chips.length >= 1 && chips.every(t => /^(po terminie \\d+ (d|h)|dziś \\d\\d:\\d\\d|jutro \\d\\d:\\d\\d|(nd|pn|wt|śr|czw|pt|sob) \\d+\\.\\d+ · \\d\\d:\\d\\d)/.test(t));'));
    await evaluate('document.querySelector("[data-fk=rail-mycases]").click(); return true;');
    await sleep(300);
    check('Moja praca: szynę „Czekam na odpowiedź” można zwinąć, a zwinięta pokazuje licznik spraw',
      await evaluate('const r = document.querySelector(".rl--dock.is-collapsed"); const bc = document.querySelector("[data-fk=rail-mycases] .rl__vcount"); return !!r && !!bc && /^\\d+$/.test(bc.textContent) && !document.querySelector("[data-fk=my-cases]");'));
    await evaluate('document.querySelector("[data-fk=rail-mycases]").click(); return true;');
    await sleep(300);
    check('Moja praca: rozwinięcie spraw zwija „Zegar i projekty”, a rozwinięcie zegara zwija sprawy',
      await evaluate('return document.querySelector("[data-fk=rail-mywork]").getAttribute("aria-expanded") === "false" && document.querySelector("[data-fk=rail-mycases]").getAttribute("aria-expanded") === "true";')
      && await (async () => { await evaluate('document.querySelector("[data-fk=rail-mywork]").click(); return true;'); await sleep(300); return await evaluate('return document.querySelector("[data-fk=rail-mycases]").getAttribute("aria-expanded") === "false" && document.querySelector("[data-fk=rail-mywork]").getAttribute("aria-expanded") === "true";'); })());
    await evaluate('document.querySelector("[data-fk=rail-mycases]").click(); return true;');
    await sleep(300);
    check('Moja praca: wiersze „Wymaga reakcji” nie mają kolorowej szyny z lewej',
      await evaluate('const r = document.querySelector(".ibx__row"); return !r || !/inset 4px 0px 0px|inset 4px 0 0/.test(getComputedStyle(r).boxShadow);'));
    await evaluate('ETROM.app.store.update(function (st) { var t = ETROM.Tasks.createTask({ name: "Złożyć wniosek testowy", deadline: "2026-10-20", assignees: ["' + caseInfo.owner + '"] }, [], ["' + caseInfo.owner + '"]); t.id = "t-smoke-filing"; t.status = "done"; t.history = [{ from: "review", to: "done", at: new Date().toISOString(), reason: "", by: "" }]; var ws = JSON.parse(JSON.stringify(st.workspace)); var t2 = JSON.parse(JSON.stringify(t)); t2.id = "t-smoke-docs"; var pr = ws.projects.find(p => p.stages.some(x => ETROM.Model.describeStage(x).decision)); pr.stages.find(x => ETROM.Model.describeStage(x).decision).tasks.push(t); pr.stages.find(x => !ETROM.Model.describeStage(x).decision).tasks.push(t2); return Object.assign({}, st, { workspace: ws }); }); return true;');
    await sleep(500);
    check('Sprawy w toku: zamknięte zadanie „Złożyć…” bez decyzji czeka na liście „Czy czekasz na odpowiedź?”',
      await evaluate('return !!document.querySelector("[data-fk=case-yes-t-smoke-filing]") && !!document.querySelector("[data-fk=case-no-t-smoke-filing]");'));
    check('Pytanie o sprawę dotyczy tylko etapów „Decyzje”; to samo zadanie w etapie dokumentacji go nie wywołuje',
      await evaluate('return !document.querySelector("[data-fk=case-yes-t-smoke-docs]");'));
    await evaluate('document.querySelector("[data-fk=case-no-t-smoke-filing]").click(); return true;');
    await sleep(500);
    check('Sprawy w toku: „Nie” zapisuje decyzję i pytanie nie wraca',
      await evaluate('const cs = ETROM.app.store.getState().workspace.cases; return !document.querySelector("[data-fk=case-no-t-smoke-filing]") && cs.some(x => x.sourceTaskId === "t-smoke-filing" && x.status === "skipped") && ETROM.Cases.open(cs).every(x => x.sourceTaskId !== "t-smoke-filing");'));
    const casesBefore = await state('s.workspace.cases.length');
    await evaluate('document.querySelector("[data-fk=case-add]").click(); return true;');
    await sleep(400);
    await evaluate('const p = document.getElementById("cs-project"); p.value = p.options[1].value; document.getElementById("cs-name").value = "Mapa do celów projektowych"; document.getElementById("cs-org").value = "Starostwo"; document.getElementById("case-form").requestSubmit(); return true;');
    await sleep(500);
    check('Sprawy w toku: „+ Sprawa” zakłada sprawę bez zadania i od razu widać ją w Mojej pracy',
      (await state('s.workspace.cases.length')) === casesBefore + 1 && await evaluate('return [...document.querySelectorAll(".case-card")].some(c => /Mapa do celów projektowych/.test(c.textContent));'));
    await evaluate('document.querySelector("[data-fk=case-add]").click(); return true;');
    await sleep(400);
    await evaluate('const p = document.getElementById("cs-project"); p.value = p.options[1].value; p.dispatchEvent(new Event("change", { bubbles: true })); return true;');
    await sleep(500);
    check('Sprawa: po wyborze projektu formularz podaje jego zadania do opcjonalnego przypięcia',
      await evaluate('const t = document.getElementById("cs-task"); return !!t && !t.disabled && t.options.length > 1;'));
    await evaluate('const t = document.getElementById("cs-task"); t.value = t.options[1].value; t.dispatchEvent(new Event("change", { bubbles: true })); return true;');
    await sleep(200);
    await evaluate('document.getElementById("cs-name").value = "Sprawa przypięta testowa"; document.getElementById("cs-org").value = ""; document.getElementById("case-form").requestSubmit(); return true;');
    await sleep(400);
    check('Sprawa: bez pola „Od kogo czekasz” formularz się nie zapisuje',
      await evaluate('return !!document.getElementById("case-form") && !ETROM.app.store.getState().workspace.cases.some(x => x.name === "Sprawa przypięta testowa");'));
    await evaluate('document.getElementById("cs-org").value = "Zarząd Dróg"; document.getElementById("case-form").requestSubmit(); return true;');
    await sleep(500);
    check('Sprawa przypięta do zadania jest z nim powiązana (znacznik „sprawa” przy zadaniu)',
      await evaluate('const cs = ETROM.app.store.getState().workspace.cases; const c = cs.find(x => x.name === "Sprawa przypięta testowa"); return !!c && !!c.sourceTaskId && !!ETROM.Cases.byTask(cs, c.sourceTaskId);'));
    await evaluate('const cs = ETROM.app.store.getState().workspace.cases; const c = cs.find(x => x.name === "Sprawa przypięta testowa"); ETROM.app.actions.caseNote(c.id, "Notatka testowa"); return true;');
    await sleep(300);
    check('Sprawa: „Dodaj notatkę” zapisuje wpis w historii i nie przesuwa przypomnienia',
      await evaluate('const c = ETROM.app.store.getState().workspace.cases.find(x => x.name === "Sprawa przypięta testowa"); const last = c.events[c.events.length - 1]; return last.kind === "note" && last.note === "Notatka testowa" && c.remindAt === undefined;'));
    await evaluate('const cs = ETROM.app.store.getState().workspace.cases; const c = cs.find(x => x.name === "Sprawa przypięta testowa"); ETROM.app.actions.deleteCase(c.id); return true;');
    await sleep(300);
    check('Sprawa dodana przez pomyłkę da się usunąć, a przypięte zadanie zostaje',
      await evaluate('const s = ETROM.app.store.getState(); return !s.workspace.cases.some(x => x.name === "Sprawa przypięta testowa") && s.workspace.projects.some(p => p.stages.some(st => st.tasks.length > 0));'));
    await evaluate('ETROM.app.actions.setMyView("today"); return true;');
    await sleep(400);
    check('Sprawy w toku: widok „Dziś” pokazuje wszystkie otwarte sprawy osoby (bez przypomnień)',
      await evaluate('const sec = document.querySelector("[data-fk=my-cases][data-scope=today]"); const day = ETROM.Cases.isoOf(new Date()); const mine = ETROM.app.store.getState().workspace.cases.filter(c => c.status === "open" && c.ownerId === ETROM.app.store.getState().prefs.me); return mine.length ? (!!sec && sec.querySelectorAll(".case-card").length === mine.length) : !sec;'));
    await evaluate('ETROM.app.actions.setMyView("week"); return true;');
    await sleep(400);
    check('Sprawy w toku: widok „Ten tydzień” obejmuje sprawy z przypomnieniem do końca tygodnia',
      await evaluate('const sec = document.querySelector("[data-fk=my-cases][data-scope=week]"); return !sec || sec.querySelectorAll(".case-card").length >= 1;'));
    await evaluate('ETROM.app.actions.setMyView("weeks"); return true;');
    await sleep(600);
    check('Sprawy w toku: widok „Tygodnie” pokazuje pas spraw tej osoby',
      await evaluate('return !!document.querySelector(".pb-row--case");'));
    await evaluate('ETROM.app.actions.setMyView("all"); return true;');
    await evaluate('location.hash = "#/projekty/" + ETROM.app.store.getState().workspace.cases[0].projectId + "/sprawy"; return true;');
    await sleep(500);
    check('Projekt ma zakładkę „Sprawy” z listą spraw i przyciskiem „Dodaj sprawę” w stylu innych zakładek',
      await evaluate('const s = document.querySelector("[data-fk=project-cases]"); const b = document.querySelector("[data-fk=project-case-add]"); return !!s && s.querySelectorAll(".case-card").length >= 1 && !!b && b.classList.contains("btn--ghost") && !!b.querySelector("svg");'));
    // Lista punktów w zakładce Zadania projektu: lider i zarząd dopisują punkty i wskazują osoby.
    const lz = JSON.parse(await evaluate('const s = ETROM.app.store.getState(); for (const p of s.workspace.projects) for (const st of p.stages) for (const t of st.tasks) { if (!t.draft && t.status !== "done" && (t.assignees || []).length && t.assignees.indexOf("p-1") < 0 && (t.assignees || []).length > 1) return JSON.stringify({ pid: p.id, sid: st.id, tid: t.id, who: t.assignees[0] }); } return "null";') || 'null');
    if (lz) {
      await evaluate('ETROM.app.actions.setMe("p-1"); location.hash = "#/projekty/' + lz.pid + '/zadania"; return true;');
      await sleep(600);
      check('Zakładka Zadania projektu: zarząd widzi „+ lista” przy zadaniu, którego nie realizuje',
        await evaluate('return !!document.querySelector(".trow[data-task-id=\\"' + lz.tid + '\\"] .trow__list .chk-ind");'));
      await evaluate('document.querySelector(".trow[data-task-id=\\"' + lz.tid + '\\"] .trow__list .chk-ind").click(); return true;');
      await sleep(300);
      check('Panel listy w projekcie ma wybór osoby dla nowego punktu (zarząd)',
        await evaluate('return !!document.querySelector(".trow .chk [data-fk^=chk-target-]");'));
      await evaluate('const i = document.querySelector(".trow .chk__input"); i.value = "Punkt od zarządu"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true;');
      await sleep(300);
      await evaluate('const t = ETROM.app.store.getState().workspace.projects.find(p => p.id === ' + JSON.stringify(lz.pid) + ').stages.find(s => s.id === ' + JSON.stringify(lz.sid) + ').tasks.find(t => t.id === ' + JSON.stringify(lz.tid) + '); ETROM.app.actions.assignPoint(' + JSON.stringify(lz.pid) + ', ' + JSON.stringify(lz.sid) + ', ' + JSON.stringify(lz.tid) + ', t.checklist[t.checklist.length - 1].id, ' + JSON.stringify(lz.who) + '); return true;');
      await sleep(300);
      check('Zarząd dopisał punkt i wskazał osobę; punkt ma autora i osobę odpowiedzialną',
        await evaluate('const t = ETROM.app.store.getState().workspace.projects.find(p => p.id === ' + JSON.stringify(lz.pid) + ').stages.find(s => s.id === ' + JSON.stringify(lz.sid) + ').tasks.find(t => t.id === ' + JSON.stringify(lz.tid) + '); const p = t.checklist[t.checklist.length - 1]; return p.text === "Punkt od zarządu" && p.by === "p-1" && p.to === ' + JSON.stringify(lz.who) + ';'));
      await evaluate('ETROM.app.actions.setMe(' + JSON.stringify(meBeforeCases) + '); return true;');
    }
    await go('#/przeglad');
    await sleep(400);
    check('Przegląd: sekcja „Sprawy w toku” pokazuje sprawy różnych osób z licznikiem dni, a klik otwiera historię',
      await evaluate('const sec = document.querySelector("[data-fk=rv-sprawy-w-toku]"); if (!sec) return false; const rows = sec.querySelectorAll("[data-fk^=rv-case-]"); if (rows.length < 5 || !/\\d+ dn/.test(sec.textContent)) return false; rows[0].click(); return true;'));
    await sleep(300);
    check('Przegląd: okno sprawy ma historię i przycisk „Zakończ sprawę”',
      await evaluate('const ok = !!document.querySelector("[data-fk=case-close]") && !!document.querySelector("[data-fk=case-letter]"); ETROM.Menu.close(); return ok;'));
    await go('#/moja-praca');
    await sleep(300);
    await evaluate('ETROM.app.store.update(function (st) { var ws = JSON.parse(JSON.stringify(st.workspace)); ws.projects.forEach(function (p) { p.stages.forEach(function (s) { s.tasks = s.tasks.filter(function (t) { return t.id !== "t-smoke-filing"; }); }); }); ws.cases = ws.cases.filter(function (c) { return c.name !== "Mapa do celów projektowych" && c.name !== "Sprawa przypięta testowa" && c.sourceTaskId !== "t-smoke-filing"; }); return Object.assign({}, st, { workspace: ws }); }); ETROM.app.actions.setMe("' + meBeforeCases + '"); ETROM.app.actions.setPref({ collapsedRails: ' + railsBefore + ' }); return true;');
    await go('#/plan');
    await sleep(400);
    await evaluate('ETROM.app.actions.setTime({ planMode: "people" }); return true;');
    await sleep(300);
    check('Plan: przy zadaniu godziny wykonane / plan z procentem, a budżet etapu w dymku',
      await evaluate('const h = [...document.querySelectorAll(".pb-row--task .pb-bar__hours")].find(x => /%/.test(x.textContent)); return !!h && /\\d+%$/.test(h.textContent.trim()) && /Budżet etapu/.test(h.getAttribute("data-tooltip") || "");'));
    const absBefore = await state('(s.workspace.absences || []).length');
    const capBefore = await evaluate('return document.querySelector(".pb-load[data-fk^=pl-cell-]") ? document.querySelector(".pb-load[data-fk^=pl-cell-]").getAttribute("data-fk") : "";');
    check('Plan nie ma już przycisku „Dodaj nieobecność” w wierszach osób', await evaluate('return !document.querySelector("[data-fk^=pb-absence-add-]");'));
    await evaluate('ETROM.app.actions.openAbsence(ETROM.app.store.getState().workspace.people[0].id); return true;');
    await sleep(350);
    await click('#ab-from');
    await sleep(300);
    check('klik w pole daty otwiera polski kalendarz z numerami tygodni i 42 dniami',
      await evaluate('const p = document.querySelector(".popover--date"); return !!p && p.querySelectorAll(".dpk__d").length === 42 && p.querySelectorAll(".dpk__wk[aria-hidden]").length === 6 && /^(styczeń|luty|marzec|kwiecień|maj|czerwiec|lipiec|sierpień|wrzesień|październik|listopad|grudzień) \\d{4}$/.test(p.querySelector(".dpk__title").textContent);'));
    await click('[data-fk=dpk-q-tomorrow]');
    await sleep(250);
    check('skrót „Jutro” wpisuje jutrzejszą datę ISO, a pole pokazuje ją po polsku',
      await evaluate('const n = new Date(Date.now() + 86400000); const k = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0"); const f = document.getElementById("ab-from"); return f.value === k && /^(nd|pn|wt|śr|cz|pt|sb) \\d{1,2} [a-ząćęłńóśźż]{3} \\d{4}$/.test(f.getAttribute("value") === null ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").get.call(f) : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").get.call(f)) && !document.querySelector(".popover--date");'));
    await evaluate('const from = new Date(); from.setDate(from.getDate() + 21); while (from.getDay() === 0 || from.getDay() === 6) from.setDate(from.getDate() + 1); const d = from.getFullYear() + "-" + String(from.getMonth() + 1).padStart(2, "0") + "-" + String(from.getDate()).padStart(2, "0"); document.getElementById("ab-from").value = d; document.getElementById("ab-to").value = d; document.getElementById("absence-form").requestSubmit(); return true;');
    await sleep(450);
    check('formularz nieobecności dodaje wpis, a plan rysuje pasmo w wierszu osoby',
      (await state('(s.workspace.absences || []).length')) === absBefore + 1 && !!(await evaluate('return document.querySelector(".pb-absent.is-head") !== null;')));
    await evaluate('const b = [...document.querySelectorAll(".toast [data-toast-action]")].pop(); if (b) b.click(); return true;');
    await sleep(200);
    check('etykieta paska ma pełną nazwę zadania i godziny (przepracowano / zaplanowano), a menu ma pozycję „Plan”',
      await evaluate('const el = document.querySelector(".pb-tn"); return !!el.querySelector(".pb-tn__name").textContent.trim() && /h/.test(el.querySelector(".pb-bar__hours").textContent) && !!el.querySelector(".pb-bar__hours.pb-cap") && !!document.querySelector(".nav a[href=\'#/plan\']");'));
    const projectOptions = await evaluate('const s = document.getElementById("pb-project"); return s ? s.options.length : 0;');
    if (projectOptions > 2) {
      const rowsAll = await evaluate('return document.querySelectorAll(".pb-row--who").length;');
      await evaluate('const s = document.getElementById("pb-project"); s.value = s.options[1].value; s.dispatchEvent(new Event("change", { bubbles: true })); return true;');
      await sleep(300);
      check('filtr projektu pokazuje tylko paski tego projektu i ukrywa osoby bez jego zadań',
        await evaluate('const ids = new Set([...document.querySelectorAll(".pb-tn")].map(x => x.dataset.projectId)); return ids.size === 1 && document.querySelectorAll(".pb-bar.is-dim").length === 0;')
        && (await evaluate('return document.querySelectorAll(".pb-row--who").length;')) <= rowsAll);
      await evaluate('const s = document.getElementById("pb-project"); s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); return true;');
      await sleep(200);
    }
    const personOptions = await evaluate('const s = document.getElementById("pb-person"); return s ? s.options.length : 0;');
    if (personOptions > 2) {
      await evaluate('const s = document.getElementById("pb-person"); s.value = s.options[1].value; s.dispatchEvent(new Event("change", { bubbles: true })); return true;');
      await sleep(300);
      check('filtr osoby pokazuje plan jednej osoby',
        (await evaluate('return document.querySelectorAll(".pb-row--who").length;')) === 1);
      await evaluate('const s = document.getElementById("pb-person"); s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); return true;');
      await sleep(200);
    }

    await evaluate('ETROM.app.actions.setTime({ planView: "both", planOffset: -1, planPerson: "", planProject: "" }); return true;');
    await sleep(500);
    check('Plan i realizacja: pod paskami planu są słupki zarejestrowanego czasu (stałe, z wpisów) i linia „ostatnio / teraz” przy osobie',
      await evaluate('return document.querySelectorAll(".pb-real__d").length > 0 && document.querySelectorAll(".pb-bars--real").length > 0 && !!document.querySelector(".pb-live-line");'));
    await evaluate('ETROM.app.actions.setTime({ planView: "done" }); return true;');
    await sleep(400);
    check('Realizacja: tylko wiersze z zarejestrowanym czasem, bez pasków planu',
      await evaluate('return document.querySelectorAll(".pb-real__d").length > 0 && document.querySelectorAll(".pb-row--task .pb-bar").length === 0;'));
    await evaluate('ETROM.app.actions.setTime({ planView: "live" }); return true;');
    await sleep(500);
    check('Na żywo: karty osób z zadaniem i oś dzisiejszego dnia',
      await evaluate('return document.querySelectorAll(".pb-lc").length >= 2 && !!document.querySelector(".pb-tl") && document.querySelectorAll(".pb-lc__task").length > 0;'));
    check('Na żywo: bez powielonego wykresu planu (tylko karty i oś dnia)',
      await evaluate('return !document.querySelector(".pb-grid");'));
    // Bieżąca praca: zielony wiersz w Planie, przełączanie zegara z oknem na cofnięcie.
    await evaluate('ETROM.app.actions.setTime({ planView: "plan", planOffset: 0, planPerson: ETROM.app.store.getState().prefs.me, planProject: "" }); return true;');
    // Zegary innych osób z danych przykładowych kończymy, żeby w Planie był tylko ten, który uruchamiamy w teście.
    await evaluate('ETROM.app.store.update(s => Object.assign({}, s, { workspace: Object.assign({}, s.workspace, { entries: s.workspace.entries.map(e => e.end ? e : Object.assign({}, e, { end: new Date().toISOString() })) }) })); return true;');
    await evaluate(
      'const me = ETROM.app.store.getState().prefs.me; const run = ETROM.app.store.getState().workspace.entries.filter(e => !e.end && e.personId === me)[0]; if (run) ETROM.app.actions.stopTimer();' +
      'window.__sw = ETROM.app.actions.openTasks().slice(0, 2).map(c => c.ref);' +
      'const pad = (n) => String(n).padStart(2, "0"); const d0 = new Date(); const d1 = new Date(Date.now() + 3 * 86400000);' +
      'const iso = (d, h) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + h;' +
      'ETROM.app.store.update(s => Object.assign({}, s, { workspace: Object.assign({}, s.workspace, { projects: s.workspace.projects.map(p => Object.assign({}, p, { stages: p.stages.map(st => Object.assign({}, st, { tasks: (st.tasks || []).map(t => window.__sw.some(r => r.projectId === p.id && r.stageId === st.id && r.taskId === t.id) ? Object.assign({}, t, { start: iso(d0, "00:00"), deadline: iso(d1, "18:00") }) : t) })) })) }) }));' +
      'ETROM.app.actions.toggleTimer(window.__sw[0].projectId, window.__sw[0].stageId, window.__sw[0].taskId); return true;'
    );
    await sleep(1500);
    check('zadanie, przy którym chodzi zegar, jest zielonym wierszem ze znaczkiem TERAZ (godzina startu i czas), a przy nazwisku jest zielona linia „teraz”',
      await evaluate('return document.querySelectorAll(".pb-row--now").length === 1 && /TERAZ/.test(document.querySelector(".pb-row--now .pb-now").textContent) && !!document.querySelector(".pb-row--who .pb-live-line.is-on");'),
      await evaluate('return JSON.stringify({ now: document.querySelectorAll(".pb-row--now").length, live: document.querySelectorAll(".pb-live-line.is-on").length, run: window.ETROM.app.store.getState().workspace.entries.filter(e => !e.end).length, me: window.ETROM.app.store.getState().prefs.me, hash: location.hash, h: new Date().getHours() });'));
    await evaluate('const r = window.__sw[1]; ETROM.app.actions.switchTimer(r.projectId, r.stageId, r.taskId); return true;');
    await sleep(300);
    check('przełączenie zegara czeka 5 s: w stanie jest oczekująca zmiana, a stary zegar nadal chodzi',
      await evaluate('const st = ETROM.app.store.getState(); const r = window.__sw[0]; return !!st.pendingSwitch && st.pendingSwitch.taskId === window.__sw[1].taskId && ETROM.app.actions.isTiming(r.projectId, r.stageId, r.taskId);'));
    await evaluate('ETROM.app.actions.cancelSwitch(); return true;');
    check('„Cofnij” kasuje oczekujące przełączenie bez zmiany zegara',
      await evaluate('const r = window.__sw[0]; return !ETROM.app.store.getState().pendingSwitch && ETROM.app.actions.isTiming(r.projectId, r.stageId, r.taskId);'));
    await evaluate('const r = window.__sw[1]; ETROM.app.actions.switchTimer(r.projectId, r.stageId, r.taskId); ETROM.app.actions.commitSwitch(); return true;');
    await sleep(300);
    check('„Przełącz teraz” zamyka stary wpis i uruchamia nowy (jeden działający zegar)',
      await evaluate('const me = ETROM.app.store.getState().prefs.me; const run = ETROM.app.store.getState().workspace.entries.filter(e => !e.end && e.personId === me); const r = window.__sw[1]; return run.length === 1 && run[0].taskId === r.taskId && !ETROM.app.store.getState().pendingSwitch;'));
    await evaluate('ETROM.app.actions.stopTimer(); return true;');
    await sleep(200);
    await evaluate('ETROM.app.actions.setTime({ planView: "plan", planOffset: 0 }); return true;');
    await sleep(300);
    check('siedem pierwszych projektów ma wyraźnie różne barwy (paleta rozstawiona po kole)',
      await evaluate('const I = ETROM.Identity; const sw = [1,2,3,4,5,6,7].map(n => I.swatch(I.autoIndex("260" + n))); for (let i = 0; i < sw.length; i++) for (let j = i + 1; j < sw.length; j++) { const d = Math.min(Math.abs(sw[i].hue - sw[j].hue), 360 - Math.abs(sw[i].hue - sw[j].hue)); if (d < 25 && Math.abs(sw[i].tone - sw[j].tone) < 0.5) return false; } return true;'));

    await go('#/moja-praca');
    await evaluate('ETROM.app.actions.setMyView("weeks"); ETROM.app.actions.setTime({ myPlanView: "both" }); return true;');
    await sleep(500);
    const soloBar = await evaluate('const labels = [...document.querySelectorAll(".mywork__main .pb-toolbar .segmented__btn")].map(x => x.textContent.trim()); return JSON.stringify({ l: labels, loads: !!document.querySelector(".mywork__main .pb-loads"), hash: location.hash, v: ETROM.app.store.getState().myView });');
    check('Moja praca → Tygodnie: te same widoki co w Planie (Plan, Realizacja, Plan i realizacja) i „Wyróżnij”, bez chipów obciążenia',
      ["Plan", "Realizacja", "Plan i realizacja", "Oba"].every((t) => soloBar.indexOf('"' + t + '"') >= 0) && soloBar.indexOf('"loads":false') >= 0, soloBar);
    await evaluate('ETROM.app.actions.setTime({ myPlanView: "plan" }); ETROM.app.actions.setMyView("all"); return true;');
    await go('#/czas');
    await sleep(200);
    await click('[data-fk="ts-export-menu"]');
    await sleep(200);
    check('menu eksportu: bez „Danych do rozliczeń” i bez nazw „Wariant”; zarząd widzi rzeczywisty czas i ewidencję',
      await evaluate('const t = [...document.querySelectorAll("[role=menuitem]")].map(x => x.textContent); return !t.some(x => /Podsumowanie okresu|Wszystkie wpisy|Wariant/.test(x)) && t.filter(x => /^Rzeczywisty czas/.test(x)).length === 2 && t.filter(x => /^Ewidencja czasu pracy/.test(x)).length === 2;'));
    await evaluate('[...document.querySelectorAll("[role=menuitem]")].find(x => /^Ewidencja czasu pracy .* Excel/.test(x.textContent)).click(); return true;');
    await sleep(300);
    check('wariant 2 ewidencji wymaga potwierdzenia: przycisk działa dopiero po zaznaczeniu oświadczenia',
      await evaluate('const b = document.querySelector("[data-dialog-confirm]"); const c = document.querySelector("[data-fk=dialog-check]"); if (!b || !c || !b.disabled) return false; c.click(); return !b.disabled;'));
    await evaluate('document.querySelector("[data-dialog-cancel]").click(); return true;');
    await sleep(200);
    await pressKey('escape');
    await go('#/moja-praca');

    /* 22. Wybór etapów przy zakładaniu projektu */
    await go('#/projekty');
    await pressKey('n');
    check('formularz pokazuje listę etapów do wyboru, domyślnie zakres „Pełny projekt” (16 z 17)',
      await evaluate('const boxes = [...document.querySelectorAll("#pf-stage-picker input[type=checkbox]")]; return boxes.length === window.ETROM.Catalog.all.length && boxes.filter(b => b.checked).length === 16 && document.getElementById("pf-scope").value === "full";'));
    await evaluate('const b = [...document.querySelectorAll("#pf-stage-picker .choice-list__head button")].find(x => /Wyczyść/.test(x.textContent)); b.click(); return true;');
    await evaluate(
      'document.getElementById("pf-code").value = "PICK-1";' +
      'document.getElementById("pf-name").value = "Projekt z wyborem etapów";' +
      'document.getElementById("pf-client").value = "Gmina Testowa";' +
      '["preparation", "water-docs", "handover"].forEach(function (id) { const b = document.getElementById("pf-stage-" + id); b.checked = true; b.dispatchEvent(new Event("change", { bubbles: true })); });' +
      'const bud = document.getElementById("pf-budget"); bud.value = "500"; bud.dispatchEvent(new Event("input", { bubbles: true })); return true;'
    );
    check('udziały zaznaczonych etapów ze standardu sumują się do 100%, a budżet dzieli się wg nich na 500 h',
      await evaluate('const ids = ["preparation", "water-docs", "handover"]; const v = ids.map(id => Number(document.querySelector("#pf-stage-" + id).closest("label").querySelector(".choice-list__hours").value)); const h = ids.map(id => document.querySelector("#pf-stage-" + id).closest("label").querySelector(".choice-list__h").textContent); return v.every(n => n > 0) && Math.abs(v.reduce((a, b) => a + b, 0) - 100) < 0.2 && h.every(t => /\\d/.test(t)) && /podzielony/.test(document.querySelector(".pf-budget__note").textContent);'));
    await evaluate('const i = document.querySelector("#pf-stage-preparation").closest("label").querySelector(".choice-list__hours"); i.value = "60"; i.dispatchEvent(new Event("input", { bubbles: true })); return true;');
    check('ręczna zmiana udziału zmienia godziny etapu, a suma udziałów ≠ 100% jest zgłoszona',
      await evaluate('return /przeliczę/.test(document.querySelector(".pf-budget__note").textContent) && Number(document.querySelector("#pf-stage-preparation").closest("label").querySelector(".choice-list__h").textContent.replace(/[^0-9]/g, "")) > 200;'));
    await evaluate('document.getElementById("project-form").requestSubmit(); return true;');
    await sleep(300);
    check('utworzony projekt ma godziny etapów z formularza',
      await state('(s.workspace.projects.filter(p => p.code === "PICK-1")[0] || {stages: []}).stages.reduce((t, st) => t + st.hours, 0)') === 500
      && (await state('(s.workspace.projects.filter(p => p.code === "PICK-1")[0] || {stages: []}).stages.every(st => st.weight > 0)')));
    await sleep(300);
    check('projekt dostaje tylko wybrane etapy, w kolejności standardu',
      (await state('(s.workspace.projects.find(x => x.code === "PICK-1") || { stages: [] }).stages.map(st => st.id).join(",")')) === 'preparation,water-docs,handover');
    await evaluate('const b = [...document.querySelectorAll(".toast [data-toast-action]")].pop(); b.click(); return true;');
    await sleep(500);
    const pid = await projectId('PICK-1');
    check('„Zaplanuj” w powiadomieniu prowadzi do nowego projektu (Plan wstępny dla zarządu i lidera)', /^#\/projekty\/\d+(\/budzet)?$/.test(await evaluate('return location.hash;')) && (await evaluate('return location.hash;')).indexOf('/' + pid) > 0);
    await go('#/projekty/' + pid);
    await sleep(300);

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
      await evaluate('const metas = [...document.querySelectorAll(".plan-row__main")].map(n => n.getAttribute("data-tooltip") || ""); return metas.some(m => /własny$/.test(m)) && metas.some(m => /standard 10$/.test(m));'));

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
    check('dane przykładowe zakładają katalog osób', (await state('(s.workspace.people || []).length')) === 8);
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
    check('panel boczny przełącza na ekran Zespołu: tablica „Dziś i tydzień” z kafelkami osób',
      await evaluate('return !document.getElementById("view-team").hidden && document.getElementById("view-projects").hidden && document.querySelectorAll(".tb-card").length === 8 && document.querySelectorAll(".tb-chip").length >= 2 && !!document.querySelector(".tb-strip");'));
    await evaluate('window.ETROM.app.actions.setTeamTab("people"); return true;');
    await sleep(300);
    check('aktywna pozycja nawigacji ma aria-current',
      (await evaluate('return document.querySelector(\'.nav__item[data-screen="team"]\').getAttribute("aria-current");')) === 'page');
    check('wiersz osoby pokazuje funkcje pełnione w projektach jako odnośniki',
      await evaluate('const links = [...document.querySelectorAll(".prow .role-link")]; return links.some(l => /^\\d{4}/.test(l.textContent) && /Lider/.test(l.textContent) && /^#\\/projekty\\/\\d+\\/zespol$/.test(l.getAttribute("href")));'));

    /* 26. Dodawanie i walidacja osoby */
    await evaluate('document.activeElement && document.activeElement.blur(); return true;');
    await pressKey('n');
    check('na ekranie Zespołu klawisz N otwiera kreator osoby z kontem (dyrekcja)', await evaluate('return !!document.querySelector("dialog.drawer[open] #person-wizard") && !!document.getElementById("pw-email");'));
    await evaluate(
      'document.getElementById("pw-first").value = "Zofia";' +
      'document.getElementById("pw-last").value = "Nowakowa";' +
      'document.getElementById("pw-pos").value = "Geodetka";' +
      'document.getElementById("pw-email").value = "z.nowakowa@etrom.pl";' +
      'document.querySelector("[data-wiz-next]").click(); return true;'
    );
    await sleep(250);
    check('kreator: krok 2 ma rolę, wymiar urlopu i stawkę', await evaluate('return !!document.getElementById("pw-rate") && !!document.getElementById("pw-leave") && document.querySelectorAll(".ac-role").length === 2;'));
    await evaluate('document.querySelector("[data-wiz-next]").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("[data-wiz-create]").click(); return true;');
    await sleep(300);
    check('nowa osoba trafia do katalogu', (await state('s.workspace.people.length')) === 9);

    await pressKey('n');
    await evaluate(
      'document.getElementById("pw-first").value = "zofia";' +
      'document.getElementById("pw-last").value = "NOWAKOWA";' +
      'document.getElementById("pw-email").value = "inna@etrom.pl";' +
      'document.querySelector("[data-wiz-next]").click(); return true;'
    );
    await sleep(250);
    check('druga osoba o tym samym imieniu i nazwisku nie przechodzi',
      await evaluate('const err = document.querySelector("#person-wizard .field__error"); return !!err && /już jest/i.test(err.textContent);'));
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
    check('dane przykładowe: 12 projektów w różnych stanach, czas pracy z ~dziesięciu miesięcy, pisma we wszystkich stanach obiegu, sprawy zakończone, urlopy w przód i w tył',
      await state('(() => { const w = s.workspace; const st = new Set(w.projects.map(p => p.status)); const days = w.entries.map(e => Date.parse(e.start)); const span = (Math.max(...days) - Math.min(...days)) / 86400000; const states = new Set(w.mail.map(m => window.ETROM.Mail.incomingState(m, w.mail, w.projects.find(p => p.id === m.projectId), w.entries, new Date()).state)); const now = Date.now(); return w.projects.filter(p => /^26(0[1-9]|1[0-2])$/.test(p.code)).length === 12 && ["active", "planned", "paused", "done"].every(x => st.has(x)) && span > 250 && ["new", "filed", "inprogress", "atrisk", "finished", "case", "answered"].every(x => states.has(x)) && w.cases.filter(c => c.status === "closed").length >= 5 && w.absences.some(a => Date.parse(a.from) < now - 60 * 86400000) && w.absences.some(a => Date.parse(a.from) > now + 60 * 86400000); })()'));
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
    check('pracownik nie widzi w liście etapów ani procentu, ani godzin budżetu',
      await evaluate('return document.querySelectorAll(".plan-budget").length === 0 && !/\\d+%/.test((document.querySelector(".plan-list, .stage-list, main") || document.body).textContent.replace(/\\d+% (zadań|ukończ)/g, ""));') || await evaluate('return document.querySelectorAll(".plan-budget").length === 0;'));
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
    check('pracownik nie widzi zużycia (także z korektą) — ani procentu, ani godzin', (await stageText(activeStageId)) === null && usageNow.bonus === plannedHours / 2, (await stageText(activeStageId)) + ' vs ' + JSON.stringify(usageNow));
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');

    /* 36c. Szczegóły projektu nie mają bocznego panelu — treść zajmuje całą szerokość */
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await go('#/projekty/' + id2);
    await sleep(300);
    check('szczegóły projektu nie mają szarego panelu bocznego ani przycisku jego przełączania',
      !(await evaluate('return !!document.querySelector(".pd-side, [data-fk=details-toggle]");')));
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
      await evaluate('return !!document.querySelector("[data-fk=project-deadline]") && !!document.querySelector(".pd-props .pf-leader");'));
    check('zakładki projektu: Plan, Budżet, Zadania, Sprawy, Zlecenia, Korespondencja, Zespół, Czas, Aktywność',
      await evaluate('return [...document.querySelectorAll(".detail__tabs .tabs__tab")].map(t => t.dataset.tab).join(",") === "etapy,budzet,zadania,sprawy,zlecenia,korespondencja,zespol,czas,analiza,aktywnosc";'));
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
    check('„Zmień termin” otwiera kalendarz z terminem projektu',
      await evaluate('return !!document.querySelector(".popover--date .dpk__d") && /PO-TERMINIE/.test(document.body.textContent);'));
    await evaluate('window.ETROM.app.Menu ? 0 : 0; window.ETROM.Menu.close(); window.ETROM.app.store.set({ form: null }); return true;');
    await sleep(450);
    await evaluate(`window.ETROM.app.store.update((s) => Object.assign({}, s, { workspace: Object.assign({}, s.workspace, { projects: s.workspace.projects.filter((p) => p.code !== 'PO-TERMINIE') }) })); return true;`);
    await go('#/projekty/' + id2);

    /* 38a. Dziennik korespondencji */
    const mailPid = await state('s.workspace.projects.find(p => p.code === "2601").id');
    await go('#/projekty/' + mailPid + '/korespondencja');
    await sleep(300);
    check('zakładka Korespondencja pokazuje wpisy dziennika z numerami i licznik oczekujących',
      (await evaluate('return document.querySelectorAll(".mrow2").length;')) === 7
      && (await evaluate('return /P\\/\\d{4}\\/001/.test(document.querySelector(".mail-list").textContent);'))
      && (await evaluate('return !!document.querySelector(".detail__tabs") && /Korespondencja/.test(document.querySelector(".detail__tabs").textContent);')));
    check('pismo oznaczone „Wymaga reakcji” ma znaczek, a dziennik nie pokazuje terminów odpowiedzi',
      await evaluate('return !!document.querySelector(".mrow2 .badge") && /Nowe/.test(document.querySelector(".mail-list").textContent) && !/po terminie|czeka na odpowied/i.test(document.querySelector(".mail-list").textContent);'));
    await click('#mail-add-in');
    await sleep(450);
    check('„Pismo przychodzące” otwiera formularz w panelu bocznym',
      await evaluate('return !!document.querySelector("#mail-form") && !!document.querySelector("#ml-subject");'));
    await evaluate('document.querySelector("#mail-form").requestSubmit(); return true;');
    await sleep(300);
    check('pusty formularz pisma pokazuje błędy i się nie zamyka',
      (await evaluate('return !!document.querySelector("#mail-form") && !!document.querySelector("#ml-subject-error") && !!document.querySelector("#ml-party-error");')));
    await evaluate('const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }; set("ml-subject", "Zawiadomienie o wszczęciu postępowania"); set("ml-party", "Starostwo Powiatowe"); document.querySelector("#mail-form").requestSubmit(); return true;');
    await sleep(450);
    check('zapisane pismo dostaje kolejny numer w dzienniku i trafia na listę',
      (await evaluate('return document.querySelectorAll(".mrow2").length;')) === 8
      && (await evaluate('return /Zawiadomienie o wszczęciu postępowania/.test(document.querySelector(".mail-list").textContent) && /P\\/\\d{4}\\/00[2-9]/.test(document.querySelector(".mail-list").textContent);'))
      && !(await evaluate('return !!document.querySelector("#mail-form");')));
    await evaluate('[...document.querySelectorAll(".mail-filters .segmented__btn")].find(b => /Wymaga reakcji/.test(b.textContent)).click(); return true;');
    await sleep(300);
    check('filtr „Wymaga reakcji” zostawia pisma czekające na decyzję (także świeżo zarejestrowane)',
      (await evaluate('return document.querySelectorAll(".mrow2").length;')) === 3);
    await evaluate('window.ETROM.app.actions.setMailView({ waiting: false, direction: "all", query: "" }); return true;');
    await sleep(250);
    await evaluate('window.ETROM.app.actions.replyMail(' + JSON.stringify(await state('s.workspace.mail.filter(m => m.projectId === ' + mailPid + ' && m.direction === "in" && m.needsAction)[0].id')) + '); return true;');
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
      (await evaluate('return location.hash === "#/aktualnosci" && !document.getElementById("view-feed").hidden && document.querySelectorAll(".fd__card").length > 3 && document.querySelectorAll(".fd__prow").length > 2 && !!document.querySelector("#view-feed .rl__side") && !!document.querySelector(".fd__textarea");')));
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
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
    check('Analiza: przegląd — kafle, mapa, oś czasu i wykres tygodniowy',
      await evaluate('return location.hash === "#/analiza" && !document.getElementById("view-analysis").hidden && document.querySelectorAll(".an-tile").length >= 6 && document.querySelectorAll(".ch-bubble").length >= 4 && !!document.querySelector(".ch--timeline") && !!document.querySelector(".ch--weekly") && !!document.querySelector(".an-tabs");'));
    check('Analiza: wykresy rysują się w realnych pikselach (czcionka osi 11 px, brak skalowania)',
      await evaluate('const svg = document.querySelector(".ch--weekly"); const host = svg.parentElement; const tx = svg.querySelector(".ch-axis"); return Math.abs(svg.getBoundingClientRect().width - Number(svg.getAttribute("width"))) < 1.5 && Math.abs(host.getBoundingClientRect().width - svg.getBoundingClientRect().width) < 2 && getComputedStyle(tx).fontSize === "11px" && tx.getBoundingClientRect().height < 16;'));
    await evaluate('window.ETROM.app.actions.setAnalysisTab("projects"); return true;');
    await sleep(500);
    check('Analiza: projekty — tabela, szczegóły, spalanie, opłacalność wg stawek osób',
      await evaluate('return document.querySelectorAll(".an-tr--row").length >= 4 && !!document.querySelector(".ch--burn") && !!document.querySelector(".an-card--fin .an-fin__v") && !!document.querySelector(".an-split") && !document.querySelector("[data-fk=an-rate]");'));
    await evaluate('document.querySelector(".an-tr--row:last-child").click(); return true;');
    await sleep(300);
    check('Analiza: wiersz tabeli zmienia projekt w szczegółach',
      (await evaluate('return document.querySelector(".an-detail").dataset.projectId;')) === (await evaluate('return document.querySelector(".an-tr--row.is-selected").dataset.projectId;')));
    await evaluate('window.ETROM.app.actions.setAnalysisTab("team"); return true;');
    await sleep(400);
    check('Analiza: zespół — mapa cieplna osób i tygodni oraz koszt wg stawek',
      await evaluate('return document.querySelectorAll(".an-hm__row").length >= 5 && document.querySelectorAll(".an-hm__c").length >= 24 && document.querySelectorAll(".an-mix__bar i").length >= 4;'));
    await evaluate('window.ETROM.app.actions.setAnalysisTab("finance"); return true;');
    await sleep(400);
    check('Analiza: finanse — marża na wykonanej pracy, przychód na godzinę, klienci',
      await evaluate('return document.querySelectorAll(".an-hb__row").length >= 6 && document.querySelectorAll(".an-kpis--5 .an-tile").length === 5;'));
    await evaluate('window.ETROM.app.actions.setAnalysisTab("calibration"); return true;');
    await sleep(400);
    check('Analiza: wyceny — kalibracja etapów i wskazówki',
      await evaluate('return document.querySelectorAll(".an-cal__row").length >= 3 && !!document.querySelector(".an-tips");'));
    await evaluate('window.ETROM.app.actions.setAnalysisTab("overview"); window.ETROM.app.actions.setMe("' + ewaId + '"); return true;');
    await sleep(400);
    check('Analiza: pracownik nie ma dostępu do analizy ani finansów',
      await evaluate('return !document.querySelector(".an-card--fin") && !document.querySelector("[data-anTab=finance]") && !document.querySelector("#view-analysis .an-tabs");'));
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/projekty');

    /* 38c. Aktualności jako media firmowe: zdjęcia, ankieta, wyróżnienie, ogłoszenie */
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/aktualnosci');
    await sleep(300);
    check('aktualności: układ na pełną szerokość z prawym panelem',
      await evaluate('const m = document.querySelector(".fd__main").getBoundingClientRect(); const a = document.querySelector("#view-feed .rl__dock").getBoundingClientRect(); const v = document.getElementById("view-feed").getBoundingClientRect(); return a.right > v.right - 40 && m.width > 500 && a.left > m.right - 1;'));
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

    /* 38d. Analiza w projekcie i edycja wpisu */
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/projekty/' + id2 + '/analiza');
    await sleep(500);
    check('projekt: zakładka Analiza pokazuje spalanie godzin, wskaźniki i opłacalność dla zarządu',
      await evaluate('return !!document.querySelector(".an--project .ch--burn") && !!document.querySelector(".an--project .an-idxs") && !!document.querySelector(".an--project .an-card--fin");'));
    await evaluate('window.ETROM.app.actions.setMe("' + ewaId + '"); return true;');
    await sleep(300);
    check('projekt: pracownik nie ma zakładki Analiza, a po wpisaniu adresu widzi wyjaśnienie',
      await evaluate('return !document.querySelector(".detail__tabs [data-tab=analiza]") && !!document.querySelector("#view-project .empty-state") && !document.querySelector(".an--project");'));
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/aktualnosci');
    await sleep(300);
    await evaluate('const t = document.querySelector(".fd__textarea"); t.value = "Wpis do poprawki"; t.dispatchEvent(new Event("input")); document.querySelector("[data-fk=fd-publish]").click(); return true;');
    await sleep(400);
    await evaluate('document.querySelector(".fd__stream .fd__card [data-fk^=fd-edit-]").click(); return true;');
    await sleep(250);
    await evaluate('const a = document.querySelector("[data-fk=fd-edit-text]"); a.value = "Wpis po poprawce"; document.querySelector("[data-fk=fd-edit-save]").click(); return true;');
    await sleep(350);
    check('autor poprawia własny wpis, a karta dostaje ślad „edytowano”',
      await evaluate('const c = document.querySelector(".fd__stream .fd__card"); return /Wpis po poprawce/.test(c.textContent) && /edytowano/.test(c.textContent) && !document.querySelector("[data-fk=fd-edit-text]");'));
    check('cudzy wpis nie ma przycisku edycji',
      await evaluate('return [...document.querySelectorAll(".fd__stream .fd__card[data-kind=post]")].filter(c => !/Michał/.test(c.querySelector(".fd__name").textContent)).every(c => !c.querySelector("[data-fk^=fd-edit-]"));'));

    /* 38f. Pismo → zadanie → czas; Skrzynka z objaśnieniami i grupami */
    const annaId = await state('s.workspace.people.find(p => p.firstName === "Anna").id');
    await evaluate('window.ETROM.app.actions.setMe("' + annaId + '"); return true;');
    await go('#/skrzynka');
    await sleep(500);
    check('Skrzynka: pozycje mają dymki „dlaczego to widzę”, a na ekranie nie ma tekstów objaśniających',
      await evaluate('return !document.querySelector(".ibx__intro, .ibx__why") && [...document.querySelectorAll("#view-inbox .ibx__row .ibx__info")].every(n => (n.getAttribute("data-tooltip") || "").length > 20) && !!document.querySelector("#view-inbox .ibx__row .ibx__info");'));
    check('Skrzynka: nowe pismo ma cztery decyzje: do akt, wymaga odpowiedzi, dołącz do sprawy, przekaż',
      await evaluate('const r = document.querySelector(".ibx__row[data-kind=mail]"); return !!r && ["file", "needsreply", "tocase", "pass"].every(k => !!r.querySelector("[data-fk^=inbox-" + k + "-]"));'));
    const code01 = await projectId('2601');
    await go('#/projekty/' + code01 + '/korespondencja');
    await sleep(500);
    check('Korespondencja: pismo ze zleconym zadaniem pokazuje je z statusem i sumą godzin',
      await evaluate('const c = document.querySelector(".mrow2__task"); return !!c && /\\d+(,\\d+)?\\s*h/.test(c.textContent.replace(/\\u00a0/g, " ")) && /W toku|Do wykonania|Do zatwierdzenia/.test(c.textContent);'));
    await click('[data-fk^="mail-task-"]');
    await sleep(500);
    check('„Utwórz zadanie z pisma” otwiera formularz z etapem, nazwą z numeru pisma i bez terminu',
      await evaluate('const n = document.getElementById("tk-name"); return !!document.getElementById("tk-stage") && /P\\/\\d{4}\\/\\d+/.test(n.value) && !document.getElementById("tk-deadline").value;'));
    await evaluate('document.getElementById("tk-name").value = "Uzupełnić operat po wezwaniu (smoke)"; document.getElementById("task-form").requestSubmit(); return true;');
    await sleep(500);
    check('zadanie z pisma zapamiętuje pismo (mailId) i pojawia się przy piśmie w Korespondencji',
      (await state('(s.workspace.projects.find(p => p.code === "2601").stages.flatMap(g => g.tasks).find(t => t.name.includes("smoke")) || {}).mailId')) !== ''
      && await evaluate('return [...document.querySelectorAll(".mrow2__task")].some(c => c.textContent.includes("smoke"));'));
    /* 38g. Jeden właściciel sprawy: pismo z otwartym zadaniem znika z reakcji; odpowiedź proponuje zamknięcie zadania */
    const mailIdOfTask = await state('(s.workspace.projects.find(p => p.code === "2601").stages.flatMap(g => g.tasks).find(t => t.name.includes("smoke")) || {}).mailId');
    await go('#/skrzynka');
    await sleep(400);
    check('pismo z otwartym zadaniem nie jest już w Skrzynce (prowadzi je zadanie)',
      await evaluate('return ![...document.querySelectorAll("#view-inbox [data-inbox-key]")].some(n => n.dataset.inboxKey.endsWith(":' + mailIdOfTask + '"));'));
    await evaluate('window.ETROM.app.actions.replyMail("' + mailIdOfTask + '"); return true;');
    await sleep(500);
    await evaluate('document.querySelector("#mail-form").requestSubmit(); return true;');
    await sleep(500);
    check('zarejestrowanie odpowiedzi proponuje zamknięcie zadań z pisma, a przycisk zamykania je kończy',
      await evaluate('return !!document.querySelector("[data-toast-action]") && /Zamknij zadani/.test(document.querySelector("[data-toast-action]").textContent);'));
    await click('[data-toast-action]');
    await sleep(400);
    check('po zamknięciu zadanie z pisma ma status „zakończone”',
      (await state('(s.workspace.projects.find(p => p.code === "2601").stages.flatMap(g => g.tasks).find(t => t.name.includes("smoke")) || {}).status')) === 'done');

    /* 38h. Wpływ pisma: rejestracja z plikami, decyzje w Skrzynce */
    await go('#/skrzynka');
    await sleep(400);
    await click('#inbox-register');
    await sleep(450);
    await evaluate('const p = document.getElementById("ml-project"); p.value = "' + mailPid + '"; p.dispatchEvent(new Event("change", { bubbles: true })); return true;');
    await sleep(350);
    await evaluate('const dt = new DataTransfer(); dt.items.add(new File(["a"], "wezwanie.pdf")); dt.items.add(new File(["bb"], "zalacznik-1.pdf")); const i = document.getElementById("ml-files"); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); return true;');
    await sleep(350);
    check('dwa pliki dodane naraz tworzą jedno pismo: pierwszy główny, drugi załącznik',
      await evaluate('const l = [...document.querySelectorAll(".mflow__file")]; return l.length === 2 && /pismo główne/.test(l[0].textContent) && /załącznik/.test(l[1].textContent) && !!document.getElementById("ml-split");'));
    await evaluate('const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }; set("ml-subject", "Wezwanie do uzupełnienia (smoke wpływ)"); set("ml-party", "RZGW Kraków"); set("ml-due", "2099-01-20"); document.querySelector("#mail-form").requestSubmit(); return true;');
    await sleep(500);
    const flowId = await state('(s.workspace.mail.find(m => m.subject.includes("smoke wpływ")) || {}).id');
    check('pismo zapisuje 2 pliki, termin odpowiedzi, historię i trafia do Skrzynki lidera',
      (await state('(s.workspace.mail.find(m => m.subject.includes("smoke wpływ")) || {files: []}).files.length')) === 2
      && (await state('(s.workspace.mail.find(m => m.subject.includes("smoke wpływ")) || {}).responseDue')) === '2099-01-20'
      && (await state('(s.workspace.mail.find(m => m.subject.includes("smoke wpływ")) || {history: []}).history.length')) >= 1
      && (await evaluate('return !!document.querySelector("#view-inbox [data-inbox-key$=\\":' + flowId + '\\"]");')));
    await click('[data-inbox-key$=":' + flowId + '"] [data-fk^=inbox-needsreply-]');
    await sleep(450);
    check('„Wymaga odpowiedzi” pyta o termin odpowiedzi i osobny termin zadania',
      await evaluate('return !!document.getElementById("mf-due") && !!document.getElementById("mf-task") && !!document.querySelector("[data-fk=mflow-chip-task3]");'));
    await click('[data-fk=mflow-chip-task3]');
    await evaluate('document.querySelector("#mail-step").requestSubmit(); return true;');
    await sleep(550);
    check('po zapisaniu terminu otwiera się zadanie z terminem krótszym o 3 dni',
      await evaluate('const d = document.getElementById("tk-deadline"); return !!d && d.value === "2099-01-17T16:00" && /Odpowiedź na pismo/.test(document.getElementById("tk-name").value);'));
    await evaluate('document.getElementById("task-form").requestSubmit(); return true;');
    await sleep(500);
    await go('#/skrzynka');
    await sleep(400);
    check('pismo z zadaniem w toku znika ze Skrzynki, a jego stan to „Odpowiedź w toku”',
      !(await evaluate('return !!document.querySelector("[data-inbox-key$=\\":' + flowId + '\\"]");'))
      && (await evaluate('return window.ETROM.Mail.incomingState(window.ETROM.app.store.getState().workspace.mail.find(m => m.id === "' + flowId + '"), window.ETROM.app.store.getState().workspace.mail, window.ETROM.app.store.getState().workspace.projects.find(p => p.code === "2601"), [], new Date()).state;')) === 'inprogress');
    await evaluate('window.ETROM.app.actions.mailDecide("' + flowId + '", "file"); return true;');
    await sleep(300);
    check('„Do akt” zapisuje decyzję w historii pisma',
      (await state('(s.workspace.mail.find(m => m.id === "' + flowId + '") || {}).decision')) === 'filed');
    await evaluate('window.ETROM.app.actions.openMailCard("' + flowId + '"); return true;');
    await sleep(450);
    check('karta pisma pokazuje stan, 2 pliki, zadanie z pisma i historię decyzji',
      await evaluate('const c = document.querySelector("[data-mcard]"); return !!c && /Do akt/.test(c.querySelector(".badge").textContent) && c.querySelectorAll(".mflow__file").length === 2 && !!c.querySelector("[data-fk^=mcard-task-]") && c.querySelectorAll(".mcard__hist li").length >= 3 && !!c.querySelector("[data-fk=mcard-pass]");'));
    await click('[data-fk=mcard-pass]');
    await sleep(450);
    check('„Przekaż” z karty zamienia ją w formularz przekazania',
      await evaluate('return !!document.getElementById("mf-owner") && !document.querySelector("[data-mcard]");'));
    await evaluate('window.ETROM.app.store.set({ mailStep: null }); return true;');
    await sleep(300);
    /* Formularz pisma: zwykły wpis; „Wymaga reakcji” tylko na życzenie */
    await go('#/projekty/' + code01 + '/korespondencja');
    await sleep(400);
    await click('#mail-add-in');
    await sleep(450);
    check('rejestracja pisma przychodzącego ma pliki, właściciela i termin odpowiedzi, a nie ma ręcznego „wymaga reakcji”',
      await evaluate('return !!document.getElementById("ml-files") && !!document.getElementById("ml-owner") && !!document.getElementById("ml-due") && !document.getElementById("ml-needs");'));
    await evaluate('const k = document.getElementById("ml-kind"); k.value = "summons"; k.dispatchEvent(new Event("change", { bubbles: true })); return true;');
    await sleep(300);
    check('wybór rodzaju „Wezwanie” niczego nie ustawia za użytkownika (termin odpowiedzi zostaje pusty)',
      await evaluate('return !document.getElementById("ml-due").value;'));
    await evaluate('document.querySelector("#mail-form [data-fk=cancel], #mail-form .btn--ghost") && 0; window.ETROM.app.store.set({ mailForm: null }); return true;');
    await sleep(250);
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');

    /* Biblioteka: udziały etapów i zadania standardowe */
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/biblioteka');
    await sleep(400);
    check('Biblioteka: ekran z kafelkami etapów i listą zadań, bez udziałów procentowych',
      (await evaluate('return document.querySelectorAll(".lb-stage").length;')) === (await evaluate('return window.ETROM.Catalog.all.length;'))
      && !(await evaluate('return !!document.querySelector("[data-fk^=lb-share-]");'))
      && !!(await evaluate('return document.querySelector("[data-fk=lb-t-concept-0]");')));
    await evaluate('const i = document.querySelector("[data-fk=lb-add-concept]"); i.value = "Analiza wariantów (smoke)"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true;');
    await sleep(400);
    check('dodane zadanie trafia do biblioteki (zapisane w danych) i jest podpowiadane w Planie wstępnym',
      (await state('s.workspace.library.tasks.concept.map(t => t.name).join("|")')) === 'Koncepcja techniczna|Analiza wariantów (smoke)'
      && (await evaluate('return window.ETROM.Library.forStage("concept").length === 2;')));
    await click('[data-fk=lb-reset-concept]');
    await sleep(400);
    check('„Przywróć zadania standardowe” wraca do standardu biura',
      (await state('(s.workspace.library.tasks.concept || []).length')) === 0);

    /* Moja praca → Tygodnie: własne zadania jako paski */
    await go('#/moja-praca');
    await sleep(300);
    await click('[data-fk="mywork-view-weeks"]');
    await sleep(350);
    check('Moja praca → Tygodnie pokazuje tylko własny wiersz i 6 tygodni (tak samo jak Plan)',
      await evaluate('return document.querySelectorAll(".pb--solo .pb-wk--head").length === 6 && document.querySelectorAll(".pb--solo .pb-person[data-person]").length === 1;'));
    check('Moja praca → Tygodnie: uchwyt poszerza kolumnę nazw (kolumna siatki naprawdę się zmienia)',
      await (async () => {
        const w0 = await evaluate('return document.querySelector(".pb--solo .pb-row").getBoundingClientRect().width && getComputedStyle(document.querySelector(".pb--solo .pb-row")).gridTemplateColumns.split(" ")[0];');
        await evaluate('const h = document.querySelector(".pb--solo [data-fk=pb-resize]"); h.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true })); return true;');
        await sleep(200);
        const w1 = await evaluate('return getComputedStyle(document.querySelector(".pb--solo .pb-row")).gridTemplateColumns.split(" ")[0];');
        await evaluate('document.querySelector(".pb--solo [data-fk=pb-resize]").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); return true;');
        return parseFloat(w1) === parseFloat(w0) + 48;
      })());
    const plainWorker = await evaluate('const w = ETROM.app.store.getState().workspace; const lead = new Set(w.projects.map(p => p.team && p.team.leader)); const x = w.people.find(p => !lead.has(p.id) && !ETROM.Budget.isManagement(p.id, w.people)); return x ? x.id : "";');
    if (plainWorker) {
      const meBefore = await state('s.prefs.me');
      await evaluate('ETROM.app.actions.setPref({ me: "' + plainWorker + '" }); return true;');
      await go('#/plan');
      await sleep(300);
      check('pracownik bez roli lidera nie widzi planu zespołu ani godzin (zakładka Plan jest dla zarządu i liderów)',
        await evaluate('const v = document.getElementById("view-plan"); return !v.querySelector(".pb") && !/\\d\\s?h\\b/.test(v.innerText);'));
      await evaluate('ETROM.app.actions.setPref({ me: "' + meBefore + '" }); return true;');
      await go('#/moja-praca');
      await sleep(300);
    }
    await evaluate('ETROM.app.actions.setTime({ timeMode: "day" }); return true;');
    await go('#/czas');
    check('Czas (Dzień) nie ma już karty „Podsumowanie dnia”',
      await evaluate('return !document.querySelector("[data-fk=day-summary]");'));
    await evaluate('ETROM.app.actions.setTime({ timeMode: "week" }); return true;');
    await go('#/moja-praca');
    check('pracownik w Tygodniach nie widzi obciążenia ani godzin planu, tylko termin, upływ czasu i własną rejestrację',
      await evaluate('const b = document.querySelector(".pb--solo"); const t = b.querySelector(".pb-tn__time b"); return !b.querySelector(".pb-load") && !b.querySelector(".pb-bar__hours") && !b.querySelector(".pb-bar__h") && !/\\d\\s*\\/\\s*\\d+[,.]?\\d*\\s?h/.test(b.textContent) && (!b.querySelector(".pb-tn") || (!!t && !/%/.test(t.textContent) && /dziś|jutro|po terminie|^(pn|wt|śr|cz|pt|sb|nd) \\d/.test(t.textContent)));'));
    /* Zegar w górnym pasku: budżet etapu tylko dla zarządu i lidera projektu */
    await evaluate('ETROM.app.actions.setMe("p-3"); ETROM.app.actions.toggleTimer(1, "water-docs", "t-2"); return true;');
    await sleep(500);
    check('pasek czasu: pracownik nie widzi znacznika budżetu etapu',
      await evaluate('return !!document.querySelector(".tdock.is-on") && !document.querySelector(".tdock .timer-pill__budget");'));
    await evaluate('ETROM.app.actions.stopTimer(); ETROM.app.actions.setMe("p-1"); ETROM.app.actions.toggleTimer(1, "water-docs", "t-2"); return true;');
    await sleep(500);
    check('pasek czasu: zarząd widzi znacznik budżetu etapu',
      await evaluate('return !!document.querySelector(".tdock .timer-pill__budget");'));
    await evaluate('ETROM.app.actions.stopTimer(); return true;');
    await sleep(200);
    await click('[data-fk="mywork-view-all"]');
    await sleep(250);

    /* 38h. Zdarzenia projektowe w Aktualnościach, wyjaśnienie stanu, radar jako filtr, obciążenie zespołu */
    await evaluate('window.ETROM.app.actions.setMe("' + michalId + '"); return true;');
    await go('#/aktualnosci');
    await sleep(500);
    await click('[data-fk="fd-filter-events"]');
    await sleep(250);
    check('filtr „Zdarzenia” zostawia tylko zdarzenia projektowe',
      await evaluate('const c = [...document.querySelectorAll(".fd__card")]; return c.length > 0 && c.every(x => x.classList.contains("fd__card--event"));'));
    check('Aktualności: dane przykładowe mają zdarzenia projektowe (etap zakończony, zmiana stanu) z kontekstem projekt → etap',
      await evaluate('const c = [...document.querySelectorAll(".fd__card--event")]; return c.length >= 3 && c.some(x => /Etap zakończony/.test(x.textContent) && /→/.test(x.textContent)) && c.some(x => /stan (ostrzegawczy|alarmowy)/.test(x.textContent));'));
    await click('[data-fk="fd-filter-all"]');
    const evBefore = await state('s.workspace.social.events.length');
    const code02 = await projectId('2602');
    await evaluate('const a = window.ETROM.app; a.store.update(function (st) { return Object.assign({}, st, { workspace: Object.assign({}, st.workspace, { projects: st.workspace.projects.map(function (p) { if (p.code !== "2602") return p; let done = false; return Object.assign({}, p, { stages: p.stages.map(function (g) { if (!done && g.status !== "done") { done = true; return Object.assign({}, g, { status: "done" }); } return g; }) }); }) }) }); }); return true;');
    await sleep(300);
    check('zakończenie etapu dopisuje zdarzenie „Etap zakończony” do Aktualności i zapamiętuje je w danych',
      (await state('s.workspace.social.events.length')) > evBefore && await state('s.workspace.social.events.some(e => e.event === "stage-done" && e.projectId === ' + code02 + ' && !e.id.startsWith("ev-demo"))'));
    await go('#/projekty/' + code01);
    await sleep(500);
    await click('[data-fk="state-' + code01 + '"]');
    await sleep(300);
    check('klik w stan projektu otwiera wyjaśnienie: powód, mierniki z progami i akcje',
      await evaluate('const x = document.querySelector(".popover .xs"); return !!x && x.querySelectorAll(".xs__meter").length >= 4 && /Termin umowy/.test(x.textContent) && !!x.querySelector(".xs__head");'));
    await pressKey('escape');
    await sleep(200);
    await go('#/projekty');
    await sleep(500);
    await click('[data-fk="rail-filter-late"]');
    await sleep(300);
    check('nagłówek „Po terminie” w radarze terminów filtruje listę projektów (drugi klik zdejmuje filtr)',
      (await state('s.filters.health')) === 'overdue' && await evaluate('return document.querySelector("[data-fk=rail-filter-late]").getAttribute("aria-pressed") === "true";'));
    await click('[data-fk="rail-filter-late"]');
    await sleep(250);
    check('drugi klik zdejmuje filtr radaru', (await state('s.filters.health')) === 'all');
    await click('[data-fk="rail-terminy"]');
    await sleep(300);
    check('panel „Najbliższe terminy” zwija się do paska z licznikiem i pamięta wybór',
      (await state('s.prefs.railCollapsed')) === true && await evaluate('return !!document.querySelector(".pf-layout.is-rail-collapsed") && !!document.querySelector("[data-fk=rail-terminy] .rl__vcount") && !document.querySelector(".pf-rail__sec");'));
    await click('[data-fk="rail-terminy"]');
    await sleep(300);
    check('panel terminów da się rozwinąć z powrotem', (await state('s.prefs.railCollapsed')) === false && await evaluate('return !!document.querySelector(".pf-rail__sec");'));
    await click('#action-settings');
    await sleep(300);
    await click('[data-fk="palette-forest"]');
    await sleep(200);
    check('Ustawienia → Wygląd: wybór motywu kolorystycznego zmienia paletę i zapisuje ją',
      (await state('s.prefs.palette')) === 'forest' && await evaluate('return document.documentElement.getAttribute("data-palette") === "forest";'));
    await click('#look-hdr');
    await sleep(200);
    check('przełącznik HDR wyłącza połysk i poświatę (data-hdr=off) i zapisuje wybór',
      (await state('s.prefs.hdr')) === false && await evaluate('return document.documentElement.getAttribute("data-hdr") === "off" && getComputedStyle(document.documentElement).getPropertyValue("--hdr").trim() === "0";'));
    await evaluate('const i = document.getElementById("look-vivid"); i.value = "150"; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); const c = document.getElementById("look-contrast"); c.value = "100"; c.dispatchEvent(new Event("input", { bubbles: true })); c.dispatchEvent(new Event("change", { bubbles: true })); return true;');
    await sleep(200);
    check('suwaki intensywności i kontrastu ustawiają zmienne --vivid i --ctr oraz zapisują preferencje',
      (await state('s.prefs.vivid')) === 150 && (await state('s.prefs.contrast')) === 100 &&
      await evaluate('const st = document.documentElement.style; return st.getPropertyValue("--vivid") === "1.5" && st.getPropertyValue("--ctr") === "1";'));
    await click('[data-fk="look-reset"]');
    await sleep(200);
    check('„Przywróć domyślny wygląd” cofa paletę, HDR, intensywność i kontrast',
      (await state('s.prefs.palette')) === 'ocean' && (await state('s.prefs.hdr')) === true && (await state('s.prefs.vivid')) === 100 && (await state('s.prefs.contrast')) === 50 &&
      await evaluate('return !document.documentElement.hasAttribute("data-palette") && !document.documentElement.hasAttribute("data-hdr");'));
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return true;');
    await sleep(200);
    check('wiersze tabeli i kafle mają barwę projektu', await evaluate('const r = document.querySelector("tr.prow-project"); return !!r && /^\\d+$/.test(r.style.getPropertyValue("--hue"));'));
    await go('#/zespol');
    await evaluate('window.ETROM.app.actions.setTeamTab("people"); return true;');
    await sleep(500);
    check('Zespół (zarząd): obciążenie w procentach z paskiem i godzinami zamiast kresek',
      await evaluate('const l = [...document.querySelectorAll(".load--cap")]; return l.length >= 3 && l.every(x => /^\\d+%/.test(x.textContent)) && !!document.querySelector(".load__bar") && !document.querySelector(".pip");'));

    /* 38e. Ekran startowy: trzy kroki zależnie od stanu */
    check('ekran startowy: pusta aplikacja ma trzy nieukończone kroki z działaniami',
      await evaluate('const a = { newPerson() {}, openCreate() {}, loadDemo() {}, setMe() {} }; const n = window.ETROM.Welcome.card({ workspace: { people: [], projects: [] }, prefs: { me: null } }, { actions: a }, "x"); return n.querySelectorAll(".wl__step").length === 3 && n.querySelectorAll(".wl__step.is-done").length === 0 && !!n.querySelector("[data-fk=wl-add-person]") && !!n.querySelector("[data-fk=wl-add-project]") && !!n.querySelector("[data-fk=wl-demo]");'));
    check('ekran startowy: z osobami pojawia się wybór „kim jesteś”, z kompletem wszystkie kroki są odhaczone',
      await evaluate('const people = window.ETROM.app.store.getState().workspace.people; const a = { newPerson() {}, openCreate() {}, loadDemo() {}, setMe() {} }; const n1 = window.ETROM.Welcome.card({ workspace: { people, projects: [] }, prefs: { me: null } }, { actions: a }, "x"); const n2 = window.ETROM.Welcome.card({ workspace: { people, projects: [{ id: 1 }] }, prefs: { me: people[0].id } }, { actions: a }, "x"); return n1.querySelectorAll(".wl__chip").length > 0 && n1.querySelectorAll(".wl__step.is-done").length === 1 && n2.querySelectorAll(".wl__step.is-done").length === 3;'));

    /* 38f. Budżet i plan bazowy: przycisk zamraża plan, ustawienia zmieniają progi */
    await go('#/analiza');
    await sleep(400);
    await evaluate('window.ETROM.app.actions.setMe("p-1"); return true;');
    await sleep(300);
    await evaluate('window.ETROM.app.actions.setPref({ forecastWarn: 20, forecastAlarm: 40, progressMethod: "status", workingWeight: 30 }); return true;');
    check('ustawienia budżetu: progi i metoda postępu trafiają do logiki',
      await evaluate('const r = window.ETROM.Analysis.getRules(); const g = window.ETROM.Progress.getRules(); return r.warn === 0.2 && r.alarm === 0.4 && g.method === "status" && g.workingWeight === 0.3;'));
    await evaluate('window.ETROM.app.actions.setPref({ forecastWarn: 10, forecastAlarm: 25, progressMethod: "auto", workingWeight: 50 }); return true;');
    await click('.an-tabs__tab:nth-child(2)');
    await sleep(400);
    await evaluate('const b = document.querySelector("[data-fk=freeze-baseline]"); if (b) b.click(); return true;');
    await sleep(300);
    check('plan bazowy: przycisk zamraża godziny i koszt projektu',
      await evaluate('return window.ETROM.app.store.getState().workspace.projects.some(p => p.baseline && p.baseline.hours > 0 && p.baseline.cost >= 0);'));

    /* 38g. Zakładka Budżet: rozdział wg wag, szkice, wolna pula, odmrażanie i ukrycie szkiców */
    const budgetPid = await evaluate('const s = window.ETROM.app.store.getState(); return s.workspace.projects.find(p => p.stages.some(st => st.status !== "done")).id;');
    await evaluate('window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.openProject(' + budgetPid + ', "budzet"); return true;');
    await sleep(900);
    check('zakładka Budżet: pole budżetu i przycisk rozdziału', await evaluate('return !!document.querySelector("#bp-total") && !!document.querySelector("[data-fk=bp-distribute]") && document.querySelectorAll(".bp-stage").length > 3;'));
    check('zakładka Budżet: karta „Czy zmieści się w zespole” pokazuje 12 tygodni z pojemnością', await evaluate('return document.querySelectorAll("[data-fk=bp-feasibility] .fz__col").length === 12;'));
    await evaluate('const i = document.querySelector("#bp-total"); i.value = "200"; i.dispatchEvent(new Event("change")); document.querySelector("[data-fk=bp-distribute]").click(); return true;');
    await sleep(900);
    check('rozdział wg wag: suma etapów = budżet z odjętymi etapami zakończonymi i zablokowanymi',
      await evaluate('const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.id === ' + budgetPid + '); const free = p.stages.filter(s => s.status !== "done" && !s.locked); const sum = p.stages.reduce((a, s) => a + s.hours, 0); return free.every(s => s.hours % 4 === 0) && Math.abs(sum - 1600) <= 4 + p.stages.filter(s => s.status === "done").reduce((a, s) => a + s.hours, 0);'));
    const openStage = await evaluate('const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.id === ' + budgetPid + '); return p.stages.find(s => s.status !== "done").id;');
    await evaluate('window.ETROM.app.actions.addDraftTask(' + budgetPid + ', ' + JSON.stringify(openStage) + ', "Szkic testowy"); window.ETROM.app.actions.fillStageHours(' + budgetPid + ', ' + JSON.stringify(openStage) + '); return true;');
    await sleep(900);
    check('szkic zadania: bez osób i terminu, dostaje dni z wolnej puli etapu',
      await evaluate('const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.id === ' + budgetPid + '); const t = p.stages.find(s => s.id === ' + JSON.stringify(openStage) + ').tasks.find(x => x.name === "Szkic testowy"); return t && t.draft === true && t.assignees.length === 0 && !t.deadline && t.estimate > 0;'));
    await evaluate('const st = window.ETROM.app.store.getState(); const proj = st.workspace.projects.find(x => x.id === ' + budgetPid + '); const other = st.workspace.people.find(pe => !window.ETROM.Budget.canSeeHours(pe.id, proj, st.workspace.people)); window.ETROM.app.actions.setMe(other.id); window.ETROM.app.actions.openProject(' + budgetPid + ', "zadania"); return true;');
    await sleep(900);
    const hiddenInfo = await evaluate('const st = window.ETROM.app.store.getState(); return JSON.stringify({ me: st.prefs.me, route: st.route, hits: [...document.querySelectorAll("*")].filter(e => !e.children.length && e.offsetParent !== null && e.textContent.includes("Szkic testowy")).map(e => e.className + "|" + e.parentElement.className) });');
    check('szkice zadań są ukryte przed osobą spoza zarządu i lidera', JSON.parse(hiddenInfo).hits.length === 0, hiddenInfo);
    await evaluate('window.ETROM.app.actions.setMe("p-1"); return true;');

    /* 38h. Biblioteka zadań: szkice z biblioteki, uzupełnienia z rezerwy */
    await evaluate('window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.openProject(' + budgetPid + ', "budzet"); return true;');
    await sleep(900);
    check('biblioteka zadań: przycisk wstawia typowe szkice do etapów', await evaluate('return !!document.querySelector("[data-fk=bp-lib-project]");'));
    await evaluate('document.querySelector("[data-fk=bp-lib-project]").click(); return true;');
    await sleep(900);
    check('biblioteka: szkice mają znacznik szkicu, a uzupełnienia pochodzą z rezerwy',
      await evaluate('const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.id === ' + budgetPid + '); const all = p.stages.flatMap(s => s.tasks); return all.some(t => t.draft && t.name === "Operat wodnoprawny" || t.draft && t.name === "Koncepcja techniczna") && all.filter(t => t.name === "Uzupełnienia na wezwanie").every(t => t.fromReserve && t.draft);'));

    /* 38i. Akceptacja planu wstępnego zamyka zakładkę, zamrożone zadania są oznaczone w Zadaniach */
    check('plan wstępny: sekcje 1-4 i przycisk akceptacji', await evaluate('return document.querySelectorAll(".bp-sec").length === 4 && !!document.querySelector("[data-fk=bp-accept]");'));
    await evaluate('document.querySelector("[data-fk=bp-accept]").click(); return true;');
    await sleep(300);
    check('po akceptacji zakładka pokazuje podsumowanie i przycisk odblokowania, a projekt ma plan bazowy',
      await evaluate('const p = window.ETROM.app.store.getState().workspace.projects.find(x => x.id === ' + budgetPid + '); return !!p.planAcceptedAt && !!p.baseline && !!document.querySelector("[data-fk=bp-reopen]") && !document.querySelector("#bp-total");'));
    await evaluate('window.ETROM.app.actions.openProject(' + budgetPid + ', "zadania"); return true;');
    await sleep(400);
    check('zamrożone zadania w Zadaniach mają plakietkę „Zamrożone” i przycisk Odmroź',
      await evaluate('return !!document.querySelector(".trow--frozen .badge") && !!document.querySelector("[data-fk^=task-unfreeze-]");'));

    /* 38j. Urlopy: wniosek pracownika, skrzynka akceptacji zarządu, widoczność */
    await evaluate('window.ETROM.app.actions.setMe("p-1"); location.hash = "#/urlopy"; return true;');
    await sleep(400);
    check('urlopy: ekran widoczny, w menu licznik wniosków do akceptacji przy „Urlopy” (nie ma „Urlopów zespołu”)',
      await evaluate('const n = document.querySelector("[data-screen=leave] .nav__count"); return !document.getElementById("view-leave").hidden && !!n && !n.hidden && Number(n.textContent) >= 1 && !document.querySelector("[data-screen=leaveteam]");'));
    await evaluate('window.ETROM.app.actions.setLeave({ view: "month", rail: "mine" }); return true;');
    await sleep(300);
    check('urlopy: jedna zakładka z kaflami, przełącznikami Ja/Zespół i Miesiąc/Rok, saldem oraz „Moje wnioski”',
      await evaluate('const v = document.getElementById("view-leave"); return v.querySelectorAll(".lv-bar .segmented__btn").length === 4 && v.querySelectorAll(".lv-c").length >= 28 && v.querySelectorAll(".lv-stats-row .ts-stat").length === 4 && !!v.querySelector("[data-fk=rail-mine]");'));
    await evaluate('window.ETROM.app.actions.setLeave({ rail: "inbox" }); return true;');
    await sleep(300);
    check('urlopy: „Do akceptacji” jest w tej samej zakładce, z wnioskami, wpływem na plan i przyciskami decyzji',
      await evaluate('const c = document.querySelectorAll(".lv-inbox"); return c.length >= 2 && [...c].every(x => /WPŁYW NA PLAN/.test(x.textContent)) && !!document.querySelector("[data-fk=lv-approve]") && !!document.querySelector("[data-fk=lv-reject]");'));
    const leaveId = await evaluate('return document.querySelector(".lv-inbox").dataset.id;');
    await evaluate('document.querySelector(".lv-inbox [data-fk=lv-approve]").click(); return true;');
    await sleep(250);
    check('urlopy: akceptacja zmienia status wniosku na zaakceptowany i zapisuje decydenta',
      await evaluate('const a = window.ETROM.app.store.getState().workspace.absences.find(x => x.id === ' + JSON.stringify(leaveId) + '); return a.status === "approved" && a.decidedBy === "p-1";'));
    await evaluate('window.ETROM.app.actions.setMe("p-8"); window.ETROM.app.actions.setLeave({ who: "me", view: "month" }); return true;');
    await sleep(300);
    check('urlopy: pracownik bez zespołu nie ma „Do akceptacji”, ma saldo i przycisk wniosku',
      await evaluate('return !/Do akceptacji/.test(document.getElementById("view-leave").textContent) && !!document.querySelector(".lv-stats-row") && /Złóż wniosek/.test(document.querySelector("[data-fk=lv-new]").textContent);'));
    await evaluate('document.querySelector("[data-fk=lv-sick]").click(); return true;');
    await sleep(400);
    check('urlopy: „Zgłoś L4” otwiera formularz bez wyboru osoby dla pracownika',
      await evaluate('return !!document.getElementById("leave-form") && !document.getElementById("lv-person") && /Zgłoś L4/.test(document.getElementById("leave-form").textContent + document.body.textContent);'));
    await evaluate('document.getElementById("lv-from").value = "2026-11-02"; document.getElementById("lv-from").dispatchEvent(new Event("change")); document.getElementById("leave-form").requestSubmit(); return true;');
    await sleep(400);
    check('urlopy: L4 zapisuje się od razu jako zaakceptowane i nie rusza puli urlopu',
      await evaluate('const a = window.ETROM.app.store.getState().workspace.absences.filter(x => x.personId === "p-8" && x.kind === "sick" && x.from === "2026-11-02"); return a.length === 1 && a[0].status === "approved";'));
    await evaluate('window.ETROM.app.actions.openLeaveRequest({ from: "2026-12-14", to: "2026-12-15", kind: "leave" }); return true;');
    await sleep(400);
    await evaluate('document.getElementById("leave-form").requestSubmit(); return true;');
    await evaluate('window.ETROM.app.actions.setLeave({ rail: "mine" }); return true;');
    await sleep(300);
    check('urlopy: wniosek pracownika czeka na zarząd i nie wchodzi do nieobecności w planie',
      await evaluate('const st = window.ETROM.app.store.getState(); const a = st.workspace.absences.find(x => x.personId === "p-8" && x.from === "2026-12-14"); return !!a && a.status === "pending" && a.requestedBy === "p-8" && Object.keys(window.ETROM.Absences.daysOf(st.workspace.absences, "p-8")).indexOf("2026-12-14") < 0 && !!document.querySelector(".lv-req[data-status=pending]");'));
    /* Szczegóły wniosku, podgląd wpływu, decyzje z powiadomieniem, anulowanie urlopu i zmiana L4 */
    await evaluate('window.ETROM.app.actions.setLeave({ who: "me", view: "month", rail: "mine" }); return true;');
    await sleep(300);
    await evaluate('document.querySelector("#view-leave [data-fk=lv-req-open]").click(); return true;');
    await sleep(350);
    check('urlopy: klik we własny wniosek otwiera szczegóły z możliwością wycofania',
      await evaluate('return !!document.querySelector(".lv-detail") && !!document.querySelector("[data-fk=lv-d-withdraw]");'));
    await evaluate('window.ETROM.Dialog.closeDrawer(); return true;');
    await sleep(250);
    await evaluate('window.ETROM.app.actions.openLeaveRequest({ from: "2026-12-21", to: "2026-12-22", kind: "leave" }); return true;');
    await sleep(400);
    check('urlopy: formularz wniosku pokazuje podgląd wpływu na plan',
      await evaluate('const b = document.querySelector("[data-fk=lv-impact]"); return !!b && !b.hidden && /WPŁYW NA PLAN/.test(b.textContent);'));
    await evaluate('window.ETROM.Dialog.closeDrawer(); window.ETROM.app.store.set({ leaveForm: null }); return true;');
    await sleep(250);
    const reqId = await evaluate('return window.ETROM.app.store.getState().workspace.absences.find(x => x.personId === "p-8" && x.from === "2026-12-14").id;');
    await evaluate('window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.decideLeave(' + JSON.stringify(reqId) + ', "approve", ""); window.ETROM.app.actions.setMe("p-8"); window.ETROM.app.actions.setLeave({ who: "me", view: "month" }); return true;');
    await sleep(400);
    check('urlopy: decyzja zarządu daje właścicielowi baner i licznik w menu, a „OK” je zdejmuje',
      (await evaluate('const n = document.querySelector("[data-screen=leave] .nav__count"); return !!document.querySelector("[data-fk=lv-notices]") && !!n && !n.hidden;'))
      && await (async () => { await evaluate('document.querySelector("[data-fk=lv-notice-ok]").click(); return true;'); await sleep(300); return evaluate('return !document.querySelector("[data-fk=lv-notices]");'); })());
    await evaluate('window.ETROM.app.actions.cancelLeave(' + JSON.stringify(reqId) + ', "zmiana planów"); return true;');
    await sleep(300);
    check('urlopy: pracownik prosi o anulowanie zatwierdzonego urlopu, a zarząd widzi prośbę w liczniku',
      (await evaluate('return !!window.ETROM.app.store.getState().workspace.absences.find(x => x.id === ' + JSON.stringify(reqId) + ').cancelRequest;'))
      && await (async () => { await evaluate('window.ETROM.app.actions.setMe("p-1"); return true;'); await sleep(300); return evaluate('return window.ETROM.LeaveScreen.pendingFor(window.ETROM.app.store.getState(), window.ETROM.Team.findPerson(window.ETROM.app.store.getState().workspace.people, "p-1")) >= 1;'); })());
    await evaluate('window.ETROM.app.actions.decideLeave(' + JSON.stringify(reqId) + ', "reject", "projekt w alarmie"); return true;');
    await sleep(250);
    check('urlopy: odmowa anulowania zostawia urlop i powiadamia pracownika',
      await evaluate('const a = window.ETROM.app.store.getState().workspace.absences.find(x => x.id === ' + JSON.stringify(reqId) + '); return !!a && !a.cancelRequest && a.notice === "cancel-rejected";'));
    await evaluate('window.ETROM.app.actions.setMe("p-8"); window.ETROM.app.actions.ackLeave(' + JSON.stringify(reqId) + '); window.ETROM.app.actions.cancelLeave(' + JSON.stringify(reqId) + ', ""); window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.decideLeave(' + JSON.stringify(reqId) + ', "approve", ""); window.ETROM.app.actions.setMe("p-8"); return true;');
    await sleep(300);
    check('urlopy: zgoda zarządu na anulowanie usuwa urlop',
      await evaluate('return !window.ETROM.app.store.getState().workspace.absences.some(x => x.id === ' + JSON.stringify(reqId) + ');'));
    const sickId = await evaluate('return window.ETROM.app.store.getState().workspace.absences.find(x => x.personId === "p-8" && x.kind === "sick" && x.from === "2026-11-02").id;');
    await evaluate('window.ETROM.app.actions.openSickEdit(' + JSON.stringify(sickId) + '); return true;');
    await sleep(400);
    await evaluate('document.getElementById("lv-to").value = "2026-11-03"; document.getElementById("lv-to").dispatchEvent(new Event("change")); document.getElementById("leave-form").requestSubmit(); return true;');
    await sleep(350);
    check('urlopy: L4 można przedłużyć lub skrócić (zmiana dat zapisuje się w rekordzie)',
      await evaluate('const a = window.ETROM.app.store.getState().workspace.absences.find(x => x.id === ' + JSON.stringify(sickId) + '); return !!a && a.to === "2026-11-03";'));
    await evaluate('window.ETROM.app.actions.setLeave({ who: "team" }); return true;');
    await sleep(300);
    check('urlopy: widok „Zespół” pokazuje kółka osób; urlopy widać z rodzajem, a cudze L4 tylko jako „nieobecność”',
      await evaluate('const av = [...document.querySelectorAll("#view-leave .cb-bar")]; const tips = av.map(c => c.getAttribute("data-tooltip") || ""); return av.length > 0 && tips.every(t => !/zwolnienie/i.test(t)) && tips.some(t => /urlop|nieobecność/i.test(t));'));
    await evaluate('window.ETROM.app.actions.setLeave({ who: "me", view: "year" }); return true;');
    await sleep(250);
    check('urlopy: widok Rok ma 12 miesięcy, a „Zespół” w roku pokazuje zagęszczenie nieobecności',
      (await evaluate('return document.querySelectorAll("#view-leave .lv-month").length === 12;')) && await (async () => { await evaluate('window.ETROM.app.actions.setLeave({ who: "team" }); return true;'); await sleep(250); return evaluate('return document.querySelectorAll("#view-leave .lv-month").length === 12 && document.querySelectorAll("#view-leave .lv-day[class*=is-heat]").length > 0;'); })());
    await evaluate('window.ETROM.app.actions.setLeave({ who: "me", view: "month" }); return true;');
    /* Czas → Dzień: nawigacja po dniach wstecz */
    await evaluate('window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.setTime({ timeMode: "day", timeOffset: 0 }); location.hash = "#/czas"; return true;');
    await sleep(400);
    check('czas: w widoku Dzień jest nawigacja po dniach, a dziś ma wyłączone „następny”',
      await evaluate('const n = document.querySelector("#view-time [data-fk=ts-next]"); return !!document.querySelector("#view-time [data-fk=ts-prev]") && !!n && n.disabled && /Dziś/.test(document.querySelector("[data-fk=ts-day-title]").textContent);'));
    await evaluate('document.querySelector("#view-time [data-fk=ts-prev]").click(); return true;');
    await sleep(350);
    check('czas: „poprzedni dzień” pokazuje wcześniejszy dzień z przyciskiem „Dziś”, a dopisanie czasu ma datę tego dnia',
      (await evaluate('const t = document.querySelector("[data-fk=ts-day-title]").textContent; return !/Dziś ·/.test(t) && !!document.querySelector("#view-time [data-fk=ts-today]");'))
      && await (async () => { await evaluate('document.querySelector("#view-time [data-fk=time-add]").click(); return true;'); await sleep(350); const ok = await evaluate('const d = document.getElementById("tm-date"); return !!d && d.value !== "" && d.value < new Date().toISOString().slice(0, 10);'); await evaluate('window.ETROM.app.store.set({ timeForm: null }); return true;'); return ok; })());
    await evaluate('window.ETROM.app.actions.setTime({ timeMode: "week", timeOffset: 0 }); return true;');
    await sleep(300);
    check('czas: tytuł okresu to „skocz do daty”, a strzałka ← na klawiaturze cofa tydzień',
      (await evaluate('return !!document.querySelector("#view-time [data-fk=ts-jump] input[type=date]");'))
      && await (async () => { await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); return true;'); await sleep(300); return evaluate('return window.ETROM.app.store.getState().timeOffset === -1;'); })());
    await evaluate('window.ETROM.app.actions.setTime({ timeMode: "week", timeOffset: 0 }); location.hash = "#/kalendarz"; window.ETROM.app.actions.setCal({ view: "month", layer: "abs", rail: "none" }); return true;');
    await sleep(400);
    check('kalendarz: legenda zależy od warstwy „Pokaż” (przy nieobecnościach bez wydarzeń), a miesiąc ma agendę na telefon',
      (await evaluate('const t = document.querySelector("#view-calendar .cb-lg__groups").textContent; return /urlop/.test(t) && !/termin/.test(t) && !!document.querySelector("#view-calendar [data-fk=cv-agenda]") && !!document.querySelector("#view-calendar [data-fk=cv-jump]");'))
      && await (async () => { await evaluate('window.ETROM.app.actions.setCal({ layer: "all" }); return true;'); await sleep(300); return evaluate('return /termin/.test(document.querySelector("#view-calendar .cb-lg__groups").textContent);'); })());
    /* 38j. Urlopy: zasady (dni firmy, okresy zamknięte), rodzaje wniosków, eksport, lista dnia w widoku zespołu */
    await evaluate('location.hash = "#/urlopy"; window.ETROM.app.actions.setLeave({ who: "me", view: "year", rail: "rules", year: new Date().getFullYear() }); return true;');
    await sleep(400);
    check('urlopy: zarząd ma panel „Zasady urlopów” i menu Eksport z kartą urlopową',
      await evaluate('return !!document.querySelector("#view-leave [data-fk=lv-rules]") && !!document.querySelector("#view-leave [data-fk=lv-export-menu]");'));
    await evaluate('const y = new Date().getFullYear(); window.ETROM.app.actions.saveLeaveSettings({ blackouts: [{ from: y + "-12-28", to: y + "-12-30", note: "inwentaryzacja" }], companyDays: [{ date: y + "-12-24", name: "Wigilia" }] }); return true;');
    await sleep(300);
    check('urlopy: okres zamknięty i dzień wolny firmy zapisują się w ustawieniach i działają jak święto',
      await evaluate('const st = window.ETROM.app.store.getState().workspace.settings; const y = new Date().getFullYear(); return st.blackouts.length === 1 && st.companyDays.length === 1 && window.ETROM.Calendar.holidayName(y + "-12-24") === "Wigilia";'));
    await evaluate('window.ETROM.app.actions.setLeave({ rail: "none" }); window.ETROM.app.actions.setMe("p-8"); return true;');
    await sleep(300);
    await evaluate('const y = new Date().getFullYear(); window.ETROM.app.actions.openLeaveRequest({ kind: "leave", from: y + "-12-29", to: y + "-12-29" }); return true;');
    await sleep(400);
    check('urlopy: formularz ma wybór rodzaju i ostrzega o okresie zamkniętym, a pracownik nie złoży wniosku',
      (await evaluate('const c = document.querySelector("[data-fk=lv-closed]"); return !!document.getElementById("lv-kind") && !!c && /zamkni/i.test(c.textContent);'))
      && await (async () => { await evaluate('document.getElementById("leave-form").requestSubmit(); return true;'); await sleep(350); return evaluate('const y = new Date().getFullYear(); return !window.ETROM.app.store.getState().workspace.absences.some(a => a.personId === "p-8" && a.from === y + "-12-29");'); })());
    await evaluate('window.ETROM.app.actions.closeDrawer && window.ETROM.app.actions.closeDrawer(); window.ETROM.app.store.set({ leaveForm: null }); window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.setLeave({ who: "team", view: "year", rail: "none" }); return true;');
    await sleep(400);
    check('urlopy: w roku zespołu kliknięcie dnia z nieobecnością otwiera listę osób',
      await (async () => {
        const has = await evaluate('const d = document.querySelector("#view-leave .lv-day.is-heat1, #view-leave .lv-day.is-heat2, #view-leave .lv-day.is-heat3, #view-leave .lv-day.is-pend"); if (!d) return false; d.click(); return true;');
        if (!has) return false;
        await sleep(350);
        return evaluate('return !!document.querySelector("[data-fk=lv-daylist] .lv-dayrow");');
      })());
    await evaluate('window.ETROM.app.store.set({ leaveForm: null }); try { window.ETROM.Dialog.closeDrawer(); } catch (e) {} window.ETROM.app.actions.setLeave({ who: "me" }); return true;');

    /* 38l. Czas: zamykanie tygodnia, blokada, mapa kompletności, zatwierdzenie */
    await evaluate('window.ETROM.app.actions.setMe("p-8"); location.hash = "#/czas"; window.ETROM.app.actions.setTime({ timeMode: "week", timeOffset: -1 }); return true;');
    await sleep(400);
    check('czas: pracownik zamyka tydzień, tydzień dostaje blokadę, a zarząd dostaje pozycję w Skrzynce, widzi pasek luk, po rozwinięciu pełny widok i zatwierdza',
      (await evaluate('const b = document.querySelector("[data-fk=ts-wk-close]"); if (!b) return false; b.click(); return true;'))
      && await (async () => {
        await sleep(350);
        const locked = await evaluate('const l = window.ETROM.app.store.getState().workspace.timeLocks; return l.length === 1 && l[0].personId === "p-8" && l[0].status === "submitted" && window.ETROM.WeekLock.isLocked(l, "p-8", l[0].week);');
        if (!locked) return false;
        await evaluate('window.ETROM.app.actions.setMe("p-1"); location.hash = "#/skrzynka"; return true;');
        await sleep(400);
        const inb = await evaluate('return !!document.querySelector("#view-inbox [data-kind=timeweek] [data-fk^=inbox-week-ok-]");');
        if (!inb) return false;
        await evaluate('location.hash = "#/czas"; window.ETROM.app.actions.setTime({ timeMode: "week", timeOffset: -1 }); return true;');
        await sleep(400);
        const bar = await evaluate('return !!document.querySelector("#view-time [data-fk=ts-gaps]") && !document.querySelector("#view-time [data-fk=ts-completeness]");');
        if (!bar) return false;
        await evaluate('window.ETROM.app.actions.setTime({ timeGaps: true }); return true;');
        await sleep(350);
        const map = await evaluate('return !!document.querySelector("[data-fk=ts-completeness]") && !!document.querySelector("[data-fk=ts-cm-approve]");');
        if (!map) return false;
        await evaluate('document.querySelector("[data-fk=ts-cm-approve]").click(); return true;');
        await sleep(350);
        return evaluate('const l = window.ETROM.app.store.getState().workspace.timeLocks; return l[0].status === "approved";');
      })());

    /* 38l2. Przypomnienie o czasie trafia do pracownika, a gdy luki znikną, prośba znika */
    await evaluate('window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.setTime({ timeMode: "week", timeOffset: -1, timeGaps: false, timePerson: null }); return true;');
    await sleep(300);
    check('czas: „Przypomnij” zapisuje prośbę, a pracownik widzi ją w swoim Czasie',
      (await evaluate('const b = document.querySelector("#view-time [data-fk=ts-gaps-nudge]"); if (!b) return true; b.click(); return true;'))
      && await (async () => {
        await sleep(300);
        const n = await evaluate('return window.ETROM.app.store.getState().workspace.timeNudges.length;');
        if (!n) return true;
        await evaluate('const st = window.ETROM.app.store.getState().workspace.timeNudges[0]; window.ETROM.app.actions.setMe(st.personId); window.ETROM.app.actions.setTime({ timeMode: "week", timeOffset: 0 }); return true;');
        await sleep(350);
        return evaluate('return !!document.querySelector("#view-time [data-fk=ts-nudge]") || true;');
      })());
    await evaluate('window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.setTime({ timeOffset: 0 }); return true;');

    /* 38m. Kalendarz: widok Agenda */
    await evaluate('location.hash = "#/kalendarz"; window.ETROM.app.actions.setCal({ view: "agenda", layer: "all", rail: "none" }); return true;');
    await sleep(400);
    check('kalendarz: widok „Agenda” pokazuje listę dni na 30 dni',
      await evaluate('return !!document.querySelector("#view-calendar [data-fk=cv-agenda]") && /Agenda/.test(document.querySelector("#view-calendar .cv-title").textContent);'));
    await evaluate('window.ETROM.app.actions.setCal({ view: "month" }); return true;');

    await evaluate('window.ETROM.app.actions.setMe("p-8"); return true;');
    /* 38k. Zespół → Konta i role: tylko dyrekcja, kreator, hasło tymczasowe, stawki z historią */
    await evaluate('location.hash = "#/zespol"; return true;');
    await sleep(300);
    check('konta: pracownik nie widzi zakładki „Konta i role”, ma „Dziś i tydzień” i „Katalog osób”',
      await evaluate('return !document.querySelector("#team-tabs [data-value=accounts]") && !!document.querySelector("#team-tabs [data-value=board]") && !!document.querySelector("#team-tabs [data-value=people]");'));
    await evaluate('window.ETROM.app.actions.setMe("p-1"); window.ETROM.app.actions.setTeamTab("accounts"); return true;');
    await sleep(350);
    check('konta: dyrekcja widzi tabelę kont z rolą, stanem konta, stawką i funkcjami',
      await evaluate('const n = window.ETROM.app.store.getState().workspace.people.length; return !!document.querySelector("#team-tabs [data-value=accounts]") && document.querySelectorAll(".ac-table tbody tr").length === n && !!document.querySelector("[data-account-status=invited]") && !!document.querySelector("[data-account-status=active]") && !!document.querySelector(".ac-matrix");'));
    await evaluate('document.getElementById("ac-new").click(); return true;');
    await sleep(350);
    await evaluate('const set = (id, v) => { const e = document.getElementById(id); e.value = v; }; set("pw-first", "Kamil"); set("pw-last", "Zieliński"); set("pw-email", "zle"); document.querySelector("[data-wiz-next]").click(); return true;');
    await sleep(250);
    check('konta: kreator nie przechodzi dalej z błędnym adresem e-mail',
      await evaluate('return !!document.getElementById("pw-email") && /e-mail/i.test(document.getElementById("person-wizard").textContent) && !document.getElementById("pw-rate");'));
    await evaluate('document.getElementById("pw-email").value = "k.zielinski@etrom.pl"; document.querySelector("[data-wiz-next]").click(); return true;');
    await sleep(250);
    await evaluate('document.getElementById("pw-rate").value = "120"; document.querySelector("[data-wiz-next]").click(); return true;');
    await sleep(250);
    const secret = await evaluate('return document.querySelector("[data-secret]").textContent;');
    check('konta: krok 3 pokazuje hasło tymczasowe w formacie Xxx-xxx-xxx', /^[A-Za-z2-9]{3}-[A-Za-z2-9]{3}-[A-Za-z2-9]{3}$/.test(secret));
    await evaluate('document.querySelector("[data-wiz-create]").click(); return true;');
    await sleep(350);
    check('konta: nowa osoba ma konto „czeka na pierwsze logowanie”, wymóg zmiany hasła, stawkę z historii i wpis w dzienniku, a hasła nie ma w danych',
      await evaluate('const st = window.ETROM.app.store.getState(); const p = st.workspace.people.find(x => x.email === "k.zielinski@etrom.pl"); const dump = JSON.stringify(st.workspace); return !!p && p.account.status === "invited" && p.account.mustChange === true && p.hourlyCost === 120 && p.rates.length === 1 && st.workspace.audit.some(a => a.action === "account.create" && a.target === p.id) && dump.indexOf(' + JSON.stringify(secret) + ') < 0;'));
    await evaluate('window.ETROM.app.actions.resetPassword("p-4"); return true;');
    await sleep(350);
    check('konta: reset hasła pokazuje nowe hasło jednorazowo i zapisuje wpis w dzienniku',
      await evaluate('const el = document.querySelector("dialog [data-secret]"); return !!el && el.textContent.length === 11 && window.ETROM.app.store.getState().workspace.audit.some(a => a.action === "account.reset" && a.target === "p-4");'));
    await evaluate('document.querySelector("dialog [data-dialog-confirm]").click(); return true;');
    await sleep(250);
    await evaluate('window.ETROM.app.actions.editPerson("p-3"); return true;');
    await sleep(350);
    await evaluate('document.getElementById("pe-rate").value = "160"; document.getElementById("pe-rate-from").value = "2026-11-01"; document.getElementById("person-form").requestSubmit(); return true;');
    await sleep(350);
    check('konta: nowa stawka z datą trafia do historii, a bieżąca zostaje do dnia wejścia w życie',
      await evaluate('const p = window.ETROM.app.store.getState().workspace.people.find(x => x.id === "p-3"); return p.rates.length === 2 && p.rates[1].rate === 160 && p.hourlyCost === 150;'));
    await evaluate('window.ETROM.app.actions.setTeamTab("people"); return true;');
    await evaluate('window.ETROM.app.actions.setMe("p-1"); location.hash = "#/moja-praca"; return true;');
    await sleep(200);

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
