'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TS = require('../src/core/timesheet.js');

const at = (y, mo, d, h, m = 0) => new Date(y, mo - 1, d, h, m);
const mk = (id, person, project, task, from, to, extra) => Object.assign({ id, personId: person, projectId: project, stageId: 's1', taskId: task, label: 'Zadanie ' + task, start: from.toISOString(), end: to ? to.toISOString() : null, note: '', source: 'timer' }, extra || {});

test('period: tydzień od poniedziałku i miesiąc kalendarzowy, z przesunięciem', () => {
  const now = at(2026, 10, 3, 12);               // sobota
  const w = TS.period(now, 'week', 0);
  assert.equal(w.days.length, 7);
  assert.equal(w.from.getDate(), 28);            // pon. 28 wrz
  assert.equal(w.to.getDate(), 4);               // ndz. 4 paź
  assert.equal(w.title, '28 września–4 października 2026');
  assert.equal(TS.period(now, 'week', -1).from.getDate(), 21);
  const m = TS.period(now, 'month', 0);
  assert.equal(m.days.length, 31);
  assert.equal(m.title, 'październik 2026');
  assert.equal(TS.period(now, 'month', -1).days.length, 30, 'wrzesień ma 30 dni');
  assert.equal(TS.period(at(2026, 1, 15, 9), 'month', -1).title, 'grudzień 2025', 'przejście przez rok');
});

test('build: godziny na projekty i zadania, tylko wybrana osoba i okres, cel okresu w dniach roboczych', () => {
  const now = at(2026, 10, 3, 12);
  const entries = [
    mk('a', 'p-1', 1, 't-1', at(2026, 9, 28, 8), at(2026, 9, 28, 10)),        // pon 2 h, projekt 1 zadanie 1
    mk('b', 'p-1', 1, 't-2', at(2026, 9, 28, 10), at(2026, 9, 28, 11, 30)),   // pon 1,5 h, zadanie 2
    mk('c', 'p-1', 2, 't-1', at(2026, 9, 29, 9), at(2026, 9, 29, 9, 45)),     // wt 45 min, projekt 2
    mk('d', 'p-2', 1, 't-1', at(2026, 9, 28, 8), at(2026, 9, 28, 16)),        // inna osoba
    mk('e', 'p-1', 1, 't-1', at(2026, 9, 21, 8), at(2026, 9, 21, 9))          // poprzedni tydzień
  ];
  const sheet = TS.build(entries, 'p-1', now, { mode: 'week' });
  assert.equal(sheet.total, 210 + 45);
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.rows[0].projectId, 1, 'projekty od największego czasu');
  assert.equal(sheet.rows[0].minutes, 210);
  assert.deepEqual(sheet.rows[0].cells.slice(0, 2), [210, 0]);
  assert.equal(sheet.rows[0].tasks.length, 2);
  assert.equal(sheet.rows[0].tasks[0].minutes, 120);
  assert.equal(sheet.days[0].minutes, 210);
  assert.equal(sheet.days[1].minutes, 45);
  assert.equal(sheet.days[5].today, true);
  assert.equal(sheet.workdays, 5);
  assert.equal(sheet.target, 5 * 480);
  assert.equal(sheet.activeDays, 2);
  assert.equal(TS.build(entries, 'p-1', now, { mode: 'week', offset: -1 }).total, 60);
  assert.equal(TS.build(entries, 'p-1', now, { mode: 'month', target: 420 }).target, 22 * 420, 'paź 2026 ma 22 dni robocze');
});

test('csv: średnik, cudzysłowy, BOM i CRLF; przecinek dziesiętny', () => {
  const out = TS.csv([['a', 'b;c', 'd"e'], ['1,5', '', 'x\ny']]);
  assert.equal(out.charCodeAt(0), 0xFEFF);
  assert.equal(out.slice(1), 'a;"b;c";"d""e"\r\n1,5;;"x\ny"\r\n');
});

test('summaryRows i entryRows: nagłówki, sumy i opisy z resolvera', () => {
  const now = at(2026, 10, 3, 12);
  const entries = [mk('a', 'p-1', 1, 't-1', at(2026, 9, 28, 8), at(2026, 9, 28, 10), { note: 'rysunki', source: 'manual' })];
  const sheet = TS.build(entries, 'p-1', now, { mode: 'week' });
  const rows = TS.summaryRows(sheet, () => ({ code: '2601', name: 'Przepust' }));
  assert.equal(rows[0][0], 'Projekt');
  assert.equal(rows[0].length, 3 + 7 + 1);
  assert.deepEqual(rows[1].slice(0, 3), ['2601', 'Przepust', 'RAZEM']);
  assert.equal(rows[1][3], '2');
  assert.equal(rows[rows.length - 1][2], 'SUMA');
  assert.equal(rows[rows.length - 1][rows[0].length - 1], '2');
  const list = TS.entryRows(entries, 'p-1', now, { mode: 'week' }, () => ({ project: { code: '2601', name: 'Przepust' }, stage: 'Koncepcja', task: 'Rysunki' }));
  assert.equal(list.length, 2);
  assert.deepEqual(list[1].slice(0, 6), ['2026-09-28', 'poniedziałek', '08:00', '10:00', 120, '2']);
  assert.equal(list[1][10], 'rysunki');
  assert.equal(list[1][11], 'ręcznie');
});

test('ocena dnia: zielony od celu, żółty do godziny poniżej, czerwony niżej, dziś w trakcie, weekendy i dni przed pierwszym wpisem neutralne', () => {
  const now = at(2026, 10, 2, 14);                       // piątek, dzień w trakcie
  const entries = [
    mk('w', 'p-1', 1, 't-1', at(2026, 9, 28, 8), at(2026, 9, 28, 16)),      // pon 8 h
    mk('x', 'p-1', 1, 't-1', at(2026, 9, 29, 8), at(2026, 9, 29, 15)),      // wt 7 h
    mk('y', 'p-1', 1, 't-1', at(2026, 9, 30, 8), at(2026, 9, 30, 14)),      // śr 6 h
    mk('z', 'p-1', 1, 't-1', at(2026, 10, 2, 8), at(2026, 10, 2, 10))       // pt 2 h, dziś
  ];
  const sheet = TS.build(entries, 'p-1', now, { mode: 'week' });
  assert.deepEqual(sheet.days.map(d => d.state), ['ok', 'warn', 'bad', 'bad', 'run', 'off', 'off']);
  const later = TS.build(entries, 'p-1', at(2026, 10, 6, 12), { mode: 'week', offset: 0 });
  assert.equal(later.days[3].state, 'off', 'przyszłość jest neutralna');
  const early = TS.build([mk('q', 'p-1', 1, 't-1', at(2026, 9, 30, 8), at(2026, 9, 30, 16))], 'p-1', now, { mode: 'week' });
  assert.deepEqual(early.days.slice(0, 3).map(d => d.state), ['off', 'off', 'ok'], 'dni przed pierwszym wpisem nie świecą na czerwono');
  assert.equal(sheet.state, 'bad', 'tydzień: 8+7+6+0 godzin z 32 oczekiwanych to czerwony');
});
