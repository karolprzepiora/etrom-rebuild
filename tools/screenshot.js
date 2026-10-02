'use strict';
/**
 * Zrzuty ekranu aplikacji w motywie jasnym i ciemnym, z danymi testowymi.
 * Uruchomienie:  node tools/screenshot.js [katalog-wyjściowy]
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

function connect(url) {
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
      }
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
    '--allow-file-access-from-files',
    '--window-size=1440,1100',
    '--force-device-scale-factor=1',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    APP_URL
  ], { stdio: 'ignore' });

  const client = await connect((await target()).webSocketDebuggerUrl);
  try {
    await client.send('Runtime.enable');
    const run = async (expression) => {
      const result = await client.send('Runtime.evaluate', {
        expression: '(() => { ' + expression + ' })()',
        returnByValue: true
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };

    for (let i = 0; i < 40; i += 1) {
      if (await run('return !!(window.ETROM && window.ETROM.app);')) break;
      await sleep(200);
    }

    await run('document.getElementById("action-demo").click(); return true;');
    await sleep(300);

    async function shoot(name) {
      await sleep(350);
      const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const file = path.join(OUT, 'etrom-' + name + '.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      process.stdout.write('zapisano ' + file + '\n');
    }
    const theme = (value) => run('document.documentElement.setAttribute("data-theme", "' + value + '"); return true;');
    const pick = (label) => run('document.querySelector(\'.segmented__btn[aria-label="' + label + '"]\').click(); return true;');

    // Karty z rozwiniętymi etapami
    await run(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'card.querySelectorAll(".btn--small")[0].click(); return true;'
    );
    await theme('light');
    await shoot('light');
    await theme('dark');
    await shoot('dark');

    // Widok listy
    await theme('light');
    await run(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'card.querySelectorAll(".btn--small")[0].click(); return true;'
    );
    await pick('Widok listy');
    await shoot('lista');

    // Panel nowego projektu
    await pick('Widok kart');
    await run('document.getElementById("action-new").click(); return true;');
    await shoot('panel');
    await run('document.querySelector("[data-drawer-close]").click(); return true;');
    await sleep(300);

    // Paleta poleceń
    await run('window.ETROM.app.openPalette(); return true;');
    await sleep(200);
    await run(
      'const i = document.querySelector(".palette__input");' +
      'i.value = "do"; i.dispatchEvent(new Event("input", { bubbles: true })); return true;'
    );
    await shoot('paleta');
    await run('document.querySelector("dialog.palette").close(); return true;');
    await sleep(300);

    // Wariant barw hydro
    await run('document.documentElement.setAttribute("data-accent", "hydro"); return true;');
    await shoot('hydro');
    await run('document.documentElement.removeAttribute("data-accent"); return true;');

    // Zadania w etapie
    await run('window.ETROM.app.goTo("projects"); return true;');
    await sleep(300);
    // Najpierw rozwinięcie etapów karty, inaczej nie ma czego rozwijać.
    await run(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'if (!card.querySelector(".srow-wrap")) card.querySelectorAll(".btn--small")[0].click();' +
      'return true;'
    );
    await sleep(350);
    await run(
      'const card = document.querySelector(\'[data-project-code="DEMO-002"]\');' +
      'const wrap = [...card.querySelectorAll(".srow-wrap")].find(w => {' +
      '  const c = w.querySelector(".srow__tasks");' +
      '  return c && c.textContent !== "—";' +
      '});' +
      'wrap.querySelector(".srow__expand").click(); return true;'
    );
    await sleep(400);
    await shoot('zadania');

    // Ekran Zespołu
    await run('window.ETROM.app.goTo("team"); return true;');
    await sleep(500);
    await shoot('zespol');

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
