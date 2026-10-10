'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/core/workrecord.js');
const TS = require('../src/core/timesheet.js');

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m);
const mk = (id, from, to, project) => ({ id, personId: 'p-1', projectId: project || 1, stageId: 's1', taskId: 't-1', label: 'Z', start: from.toISOString(), end: to ? to.toISOString() : null, note: '', source: 'timer' });
const absences = [
  { id: 'a-1', personId: 'p-1', from: '2026-10-07', to: '2026-10-07', kind: 'leave', onDemand: true, status: 'approved' },
  { id: 'a-2', personId: 'p-1', from: '2026-10-08', to: '2026-10-08', kind: 'sick', status: 'approved' }
];
const entries = [
  mk('a', at(5, 8, 12), at(5, 12), 1), mk('b', at(5, 12, 30), at(5, 16, 41), 2),   // pon: 8:12–16:41, przerwa 30 min, 7 h 59 min
  mk('c', at(6, 8, 30), at(6, 14, 20), 1),                                           // wt: 5 h 50 min
  mk('d', at(9, 8, 0), at(9, 16, 0), 1)                                              // pt: 8 h
];
const now = at(10, 12);
const rec = () => W.build(entries, 'p-1', now, { year: 2026, month: 9, absences, project: (id) => ({ code: id === 1 ? '2601' : '2602' }) });

test('build: dzień po dniu – praca co do minuty, przerwy, projekty, nieobecności, weekendy', () => {
  const r = rec();
  assert.equal(r.days.length, 31);
  const mon = r.days[4];
  assert.equal(mon.kind, 'work'); assert.equal(mon.minutes, 479);
  assert.equal(mon.from, '08:12'); assert.equal(mon.to, '16:41'); assert.equal(mon.breakMinutes, 30);
  assert.deepEqual(mon.projects, ['2601', '2602']);
  assert.equal(r.days[6].kind, 'absence'); assert.equal(r.days[6].absenceCode, 'UŻ');
  assert.equal(r.days[7].absenceCode, 'L4');
  assert.equal(r.days[9].kind, 'weekend'); assert.match(r.days[9].title, /sobota/);
  assert.equal(r.totals.minutes, 479 + 350 + 480);
  assert.equal(r.totals.workDays, 3);
  assert.equal(r.totals.counts.leave, 1); assert.equal(r.totals.counts.sick, 1);
});

test('differences i normative: wariant 2 daje równe 8:00–16:00, a różnice względem zapisu są jawne', () => {
  const r = rec();
  assert.deepEqual(W.differences(r).map((d) => [d.number, d.diff]), [[5, -1], [6, -130]]);
  const n = W.normative(r);
  assert.equal(n.totals.minutes, 3 * 480);
  const wd = n.days.filter((d) => d.kind === 'work');
  assert.ok(wd.every((d) => d.from === '08:00' && d.to === '16:00' && d.minutes === 480));
  assert.equal(n.days[6].from, '', 'dzień urlopu bez godzin pracy');
  assert.equal(r.days[5].minutes, 350, 'oryginał nie jest zmieniany');
  assert.equal(W.normative(W.build(entries, 'p-1', now, { year: 2026, month: 9, absences, target: 420 })).days[4].to, '15:00');
});

test('csvRows i html: oba warianty, nagłówki, sumy i ucieczka znaków', () => {
  const r = rec();
  const c1 = W.csvRows(r, 1, { personName: 'Anna Testowa' });
  assert.equal(c1[0][1], 'Anna Testowa');
  assert.ok(c1[7].includes('08:12') && c1[7].includes(479) && c1[7].includes('7:59'));
  const last1 = c1[c1.length - 1];
  assert.equal(last1[5], '21:49'); assert.match(last1[7], /urlop wypoczynkowy 1 dzień \(w tym 1 na żądanie\), zwolnienie lekarskie 1 dzień/);
  const c2 = W.csvRows(W.normative(r), 2);
  assert.equal(c2[2][0], 'Data');
  assert.equal(c2[c2.length - 1][4], '24:00');
  const html1 = W.html(r, 1, { personName: 'A <b>&', generatedAt: '10.10.2026' });
  assert.match(html1, /Zestawienie czasu pracy/); assert.match(html1, /7:59/); assert.ok(!html1.includes('A <b>&'), 'imię jest zabezpieczone przed HTML');
  const html2 = W.html(W.normative(r), 2, { personName: 'Anna', confirmedBy: 'Anna Testowa', autoPrint: true });
  assert.doesNotMatch(html2, /art\. 149/); assert.doesNotMatch(html2, /Potwierdzono w aplikacji/); assert.match(html2, /window\.print/);
  assert.match(html2, /Dzień wolny – sobota/);
});

test('zgodność z kartą czasu: ta sama suma minut co Timesheet.build dla miesiąca', () => {
  const sheet = TS.build(entries, 'p-1', now, { mode: 'month', offset: 0, target: 480, absences });
  assert.equal(rec().totals.minutes, sheet.total);
  assert.equal(rec().totals.norm, sheet.target);
});

test('wyjazd bez rejestratora w ewidencji to zwykła praca 8:00–16:00, bez wzmianki o wyjeździe', () => {
  const Trips = require('../src/core/trips.js');
  const trips = Trips.save([], { personIds: ['p-1'], kind: 'field', from: '2026-10-12', to: '2026-10-12', place: 'Lipnica' }, [{ id: 'p-1' }], 'p-1', new Date()).list;
  const rec = W.build([], 'p-1', new Date(2026, 9, 20, 12), { year: 2026, month: 9, trips });
  const day = rec.days.find((d) => d.key === '2026-10-12');
  assert.deepEqual([day.kind, day.from, day.to, day.minutes, day.projects.length], ['work', '08:00', '16:00', 480, 0]);
  assert.equal(JSON.stringify(day).includes('Lipnica'), false);
});
