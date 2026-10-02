'use strict';
/**
 * Zrzuty ekranu do przeglądu wizualnego: różne ekrany, motywy, szerokości
 * i stany (pusto, dużo danych, otwarte menu, panel, zaznaczenie).
 * Uruchomienie:  node tools/screenshot.js [katalog] [filtr-nazw]
 * Błędy konsoli strony są wypisywane — zrzut z błędem nie przechodzi po cichu.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  process.env.CHROME_PATH,
  '/usr/bin/chromium'
].filter(Boolean).find((p) => fs.existsSync(p));

const PORT = 9334;
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'screenshots'));
const ONLY = process.argv[3] ? new RegExp(process.argv[3]) : null;
const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) { /* czekamy */ }
    await sleep(250);
  }
  throw new Error('Brak połączenia z przeglądarką.');
}

function connect(url, onEvent) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let id = 1;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
      } else if (message.method) onEvent(message);
    });
    socket.addEventListener('error', () => reject(new Error('Błąd DevTools.')));
    socket.addEventListener('open', () => resolve({
      send: (method, params) => new Promise((res, rej) => {
        const current = id++;
        pending.set(current, { resolve: res, reject: rej });
        socket.send(JSON.stringify({ id: current, method, params: params || {} }));
      }),
      close: () => socket.close()
    }));
  });
}

async function main() {
  if (!CHROME) throw new Error('Nie znaleziono Chromium. Ustaw CHROME_PATH.');
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'etrom-shot-'));

  const child = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--hide-scrollbars',
    '--window-size=1440,900', '--force-device-scale-factor=1',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    APP_URL
  ], { stdio: 'ignore' });

  const errors = [];
  const client = await connect((await target()).webSocketDebuggerUrl, (event) => {
    if (event.method === 'Runtime.exceptionThrown') {
      const d = event.params.exceptionDetails || {};
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
      errors.push(event.params.args.map((a) => a.value || a.description).join(' '));
    }
  });

  try {
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const run = async (expression) => {
      const result = await client.send('Runtime.evaluate', {
        expression: '(() => { ' + expression + ' })()', returnByValue: true, awaitPromise: true
      });
      if (result.exceptionDetails) {
        throw new Error((result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text);
      }
      return result.result.value;
    };
    const ready = async () => {
      for (let i = 0; i < 40; i += 1) {
        if (await run('return !!(window.ETROM && window.ETROM.app);').catch(() => false)) return;
        await sleep(200);
      }
    };
    await ready();

    let width = 1440;
    let height = 900;
    async function viewport(w, h) {
      width = w; height = h || 900;
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: w < 600 });
      await sleep(200);
    }
    async function shoot(name, options) {
      if (ONLY && !ONLY.test(name)) return;
      const settings = options || {};
      await sleep(settings.wait || 400);
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: !!settings.full
      });
      const file = path.join(OUT, 'etrom-' + name + '.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      process.stdout.write('zapisano ' + path.basename(file) + (errors.length ? '  BŁĘDY: ' + errors.join(' | ') : '') + '\n');
      errors.length = 0;
    }
    const theme = (value) => run('document.documentElement.setAttribute("data-theme", "' + value + '"); return true;');
    const go = async (hash) => { await run('location.hash = ' + JSON.stringify(hash) + '; return true;'); await sleep(450); };
    const click = (selector) => run('const n = document.querySelector(' + JSON.stringify(selector) + '); if (!n) throw new Error("brak: ' + selector.replace(/"/g, '') + '"); n.click(); return true;');
    const escape = async () => {
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(250);
    };
    const projectId = (code) => run('return window.ETROM.app.store.getState().workspace.projects.find(p => p.code === "' + code + '").id;');

    await viewport(1440, 900);
    await theme('light');
    await shoot('pusty');
    await go('#/zespol');
    await shoot('zespol-pusty');
    await go('#/projekty');

    await run('window.ETROM.app.loadDemo(); return true;');
    await sleep(300);
    await run('document.querySelectorAll(".toast__close").forEach(b => b.click()); return true;');
    await shoot('projekty');

    await click('[data-fk="cockpit-attention"]');
    await shoot('kokpit-filtr', { wait: 600 });
    await run('window.scrollTo(0, 0); document.querySelector(".sheet__scroll, .page") && (document.querySelector(".sheet__scroll") || document.querySelector(".page")).scrollTo(0, 0); return true;');
    await click('#tb-scope');
    await sleep(200);

    await theme('dark');
    await shoot('projekty-ciemny');
    await theme('light');

    await click('.segmented__btn[aria-label="Widok kart"]');
    await shoot('karty');
    await click('.segmented__btn[aria-label="Widok tabeli"]');

    await click('#tb-status');
    await shoot('menu-filtr', { wait: 250 });
    await escape();

    await run('document.querySelectorAll("#select-' + (await projectId('DEMO-001')) + ', #select-' + (await projectId('DEMO-004')) + '").forEach(b => b.click()); return true;');
    await shoot('zaznaczenie');
    await run('window.ETROM.app.store.set({ selection: {} }); return true;');

    const id2 = await projectId('DEMO-002');
    await viewport(1440, 1500);
    await go('#/projekty/' + id2);
    await shoot('projekt', { full: true });
    await theme('dark');
    await shoot('projekt-ciemny', { full: true });
    await theme('light');

    await viewport(1440, 900);
    await go('#/projekty/' + id2 + '/zadania');
    await shoot('projekt-zadania');
    await click('.trow__name');
    await shoot('inspektor-zadanie', { wait: 450 });
    await escape();
    await click('.trow__status');
    await shoot('menu-status', { wait: 250 });
    await escape();

    await go('#/projekty/' + id2 + '/zespol');
    await shoot('projekt-zespol');

    await click('#action-edit-project');
    await shoot('panel', { wait: 500 });
    await run('document.getElementById("pf-code").value = ""; document.getElementById("project-form").requestSubmit(); return true;');
    await shoot('panel-blad', { wait: 300 });
    await escape();

    await go('#/zespol');
    await shoot('zespol');
    await click('.prow .person__link');
    await shoot('inspektor-osoba', { wait: 450 });
    await escape();

    await click('#action-settings');
    await shoot('ustawienia', { wait: 250 });
    await escape();

    await run('window.ETROM.app.openPalette(); return true;');
    await run('const i = document.querySelector(".palette__input"); i.value = "re"; i.dispatchEvent(new Event("input", { bubbles: true })); return true;');
    await shoot('paleta', { wait: 250 });
    await escape();

    await run('document.documentElement.setAttribute("data-accent", "raspberry"); return true;');
    await go('#/projekty/' + id2);
    await shoot('akcent-malina');
    await run('document.documentElement.removeAttribute("data-accent"); return true;');

    await run('window.ETROM.app.store.set({ prefs: Object.assign({}, window.ETROM.app.store.getState().prefs, { sidebarCollapsed: true }) }); return true;');
    await go('#/projekty');
    await shoot('panel-zwiniety');
    await run('window.ETROM.app.store.set({ prefs: Object.assign({}, window.ETROM.app.store.getState().prefs, { sidebarCollapsed: false }) }); return true;');

    // Długie wartości: nazwa, zamawiający, kod — sprawdzenie skracania i zawijania.
    await run(
      'const E = window.ETROM; const s = E.app.store; const ws = s.getState().workspace;' +
      'const p = E.Model.createProject({ code: "W-2026-0142/KONC/II", name: "Przebudowa i rozbudowa systemu ochrony przeciwpowodziowej doliny rzeki Wisłoki wraz z modernizacją wałów, przepompowni i zbiornika retencyjnego", client: "Państwowe Gospodarstwo Wodne Wody Polskie, Regionalny Zarząd Gospodarki Wodnej w Krakowie", status: "active", deadline: "2026-10-03", stages: E.Catalog.all.slice(0, 4).map(e => E.Model.createStage(e.id)) }, ws.projects);' +
      's.update(st => Object.assign({}, st, { workspace: Object.assign({}, ws, { projects: ws.projects.concat([p]) }) })); return true;'
    );
    await go('#/projekty');
    await shoot('dlugie');
    await go('#/projekty/' + (await projectId('W-2026-0142/KONC/II')));
    await shoot('dlugie-projekt');

    await viewport(1024, 800);
    await shoot('projekty-1024');
    await go('#/projekty/' + id2);
    await shoot('projekt-1024');

    await viewport(390, 844);
    await go('#/projekty');
    await shoot('projekty-390');
    await go('#/projekty/' + id2);
    await shoot('projekt-390', { full: true });
    await click('#action-nav');
    await shoot('nawigacja-390', { wait: 400 });
    await run('window.ETROM.app.store.set({ navOpen: false }); return true;');
    await go('#/zespol');
    await shoot('zespol-390');
  } finally {
    client.close();
    child.kill('SIGKILL');
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (error) { /* nieistotne */ }
  }
}

main().catch((error) => {
  process.stderr.write('Nie udało się zrobić zrzutów: ' + error.message + '\n');
  process.exitCode = 1;
});
