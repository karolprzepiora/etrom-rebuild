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

test('dzień nieobecności jest neutralny, chyba że osoba i tak osiągnęła cel', () => {
  const now = at(2026, 10, 2, 14);
  const entries = [mk('w', 'p-1', 1, 't-1', at(2026, 9, 28, 8), at(2026, 9, 28, 16))];
  const absences = [{ id: 'a-1', personId: 'p-1', from: '2026-09-29', to: '2026-09-30', kind: 'leave' }, { id: 'a-2', personId: 'p-1', from: '2026-09-28', to: '2026-09-28', kind: 'training' }];
  const sheet = TS.build(entries, 'p-1', now, { mode: 'week', absences });
  assert.deepEqual(sheet.days.slice(0, 4).map(d => d.state), ['ok', 'off', 'off', 'bad']);
  assert.equal(sheet.days[1].absent, 'leave');
});

test('dzień świąteczny nie wymaga godzin i nie liczy się do celu tygodnia', () => {
  const now = at(2026, 11, 13, 18);                       // piątek po święcie 11 listopada
  const r = TS.build([], 'p-1', now, { mode: 'week', offset: 0, target: 480 });
  const hol = r.days.filter((d) => d.holiday)[0];
  assert.equal(hol.number, 11);
  assert.equal(hol.state, 'off');
  assert.equal(r.workdays, 4);
});

test('build: norma bez urlopu i chorobowego, bilans co do minuty, liczniki i tygodnie', () => {
  const now = at(2026, 10, 10, 12);
  // 5–9 paź: pon 7:50, wt 7:50, śr urlop, czw L4, pt 8:00
  const entries = [
    mk('a', 'p-1', 1, 't-1', at(2026, 10, 5, 8), at(2026, 10, 5, 15, 50)),
    mk('b', 'p-1', 1, 't-1', at(2026, 10, 6, 8), at(2026, 10, 6, 15, 50)),
    mk('c', 'p-1', 1, 't-1', at(2026, 10, 9, 8), at(2026, 10, 9, 16))
  ];
  const absences = [
    { id: 'a-1', personId: 'p-1', from: '2026-10-07', to: '2026-10-07', kind: 'leave', onDemand: true, status: 'approved' },
    { id: 'a-2', personId: 'p-1', from: '2026-10-08', to: '2026-10-08', kind: 'sick', status: 'approved' }
  ];
  const s = TS.build(entries, 'p-1', now, { mode: 'week', offset: 0, target: 480, absences });
  assert.equal(s.target, 3 * 480, 'norma: 5 dni − urlop − L4');
  assert.equal(s.total, 470 + 470 + 480);
  assert.equal(s.balance, -20, 'brakuje 10 min w pon i wt');
  assert.deepEqual([s.days[0].diff, s.days[1].diff, s.days[2].diff, s.days[4].diff], [-10, -10, null, 0]);
  assert.equal(s.days[2].absentKind, 'leave');
  assert.equal(s.days[2].onDemand, true);
  assert.equal(s.counts.leave, 1); assert.equal(s.counts.onDemand, 1); assert.equal(s.counts.sick, 1);
  assert.equal(s.weeks.length, 1); assert.equal(s.weeks[0].minutes, 1420); assert.equal(s.weeks[0].norm, 3 * 480);
  const m = TS.build(entries, 'p-1', now, { mode: 'month', offset: 0, target: 480, absences });
  assert.equal(m.weeks.length, 5, 'październik 2026 obejmuje 5 tygodni ISO');
  assert.equal(m.weeks[0].indices.length, 4, 'pierwszy tydzień zaczyna się w czwartek');
});

test('wyjazd bez rejestratora daje pełne 8 h, a przy rejestratorze tylko godziny spoza niego', () => {
  const Trips = require('../src/core/trips.js');
  const people = [{ id: 'p-1' }];
  const trips = Trips.save([], { personIds: ['p-1'], kind: 'field', from: '2026-10-12', to: '2026-10-13', place: 'Lipnica' }, people, 'p-1', new Date()).list;
  const now = at(2026, 10, 14, 12);
  const none = TS.build([], 'p-1', now, { mode: 'week', offset: 0, trips });
  const mon = none.days.find((d) => d.key === '2026-10-12');
  assert.equal(mon.minutes, 480);
  assert.equal(mon.trip.place, 'Lipnica');
  assert.equal(none.total, 960);
  const withTimer = [mk('e1', 'p-1', 1, 't1', at(2026, 10, 13, 8), at(2026, 10, 13, 10))];
  const tue = TS.build(withTimer, 'p-1', now, { mode: 'week', offset: 0, trips }).days.find((d) => d.key === '2026-10-13');
  assert.equal(tue.minutes, 480);
  assert.equal(tue.trip.credited, 360);
  const future = TS.build([], 'p-1', at(2026, 10, 12, 7), { mode: 'week', offset: 0, trips }).days.find((d) => d.key === '2026-10-13');
  assert.equal(future.minutes, 0);
});
