'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Plan = require('../src/core/plan.js');

const now = new Date(2026, 9, 5, 9, 0);                   // poniedziałek 5 paź 2026
const people = [{ id: 'p-1', active: true }, { id: 'p-2', active: true }, { id: 'p-3', active: false }];
const task = (id, extra) => Object.assign({ id, name: 'Zadanie ' + id, status: 'todo', workload: 'medium', assignees: ['p-1'], deadline: '' }, extra || {});
const project = (tasks) => ({ id: 1, code: '2601', stages: [{ id: 's1', tasks }] });
const run = (tasks, entries, extra) => Plan.build(Object.assign({ projects: [project(tasks)], people, entries: entries || [], now, target: 480, weeks: 3 }, extra || {}));
const rowOf = (plan, id) => plan.rows.filter((r) => r.personId === id)[0];

test('szacunek: własny albo z nakładu pracy; zużycie pomniejsza; „do zatwierdzenia” to najwyżej godzina', () => {
  assert.equal(Plan.estimateHours({ estimate: 20, workload: 'small' }), 20);
  assert.equal(Plan.estimateHours({ workload: 'large' }), 32);
  assert.equal(Plan.remainingHours({ estimate: 10, status: 'working' }, 4 * 60), 6);
  assert.equal(Plan.remainingHours({ estimate: 10, status: 'working' }, 99 * 60), 0);
  assert.equal(Plan.remainingHours({ estimate: 10, status: 'review' }, 0), 1);
  assert.equal(Plan.remainingHours({ estimate: 10, status: 'done' }, 0), 0);
});

test('zadanie z terminem rozkłada się równo na dni robocze od dziś do terminu', () => {
  // pon 5 → pt 9 paź: 5 dni, 20 h szacunku → 4 h dziennie, wszystko w tygodniu 0
  const plan = run([task('t1', { estimate: 20, deadline: '2026-10-09T15:00' })]);
  const w = rowOf(plan, 'p-1').weeks;
  assert.equal(w[0].planned, 20);
  assert.equal(w[0].capacity, 40);
  assert.equal(w[0].state, 'ok');
  assert.equal(w[1].planned, 0);
  assert.equal(plan.weeks[0].workdays, 5);
});

test('termin w kolejnym tygodniu dzieli godziny między tygodnie proporcjonalnie do dni', () => {
  // pon 5 → pt 16 paź: 10 dni, 40 h → po 20 h na tydzień
  const plan = run([task('t1', { estimate: 40, deadline: '2026-10-16' })]);
  const w = rowOf(plan, 'p-1').weeks;
  assert.equal(w[0].planned, 20);
  assert.equal(w[1].planned, 20);
});

test('zadanie po terminie ląduje w bieżącym tygodniu, bez terminu w osobnej puli, zakończone nie liczy się', () => {
  const plan = run([
    task('late', { estimate: 8, deadline: '2026-09-30' }),
    task('free', { estimate: 6 }),
    task('done', { estimate: 50, status: 'done' })
  ]);
  const r = rowOf(plan, 'p-1');
  assert.equal(r.weeks[0].planned, 8);
  assert.equal(r.weeks[0].tasks[0].overdue, true);
  assert.equal(r.unscheduled.hours, 6);
  assert.equal(r.unscheduled.tasks.length, 1);
});

test('wielu realizatorów dzieli godziny po równo; osoba wyłączona z obiegu nie ma wiersza', () => {
  const plan = run([task('t1', { estimate: 20, deadline: '2026-10-09', assignees: ['p-1', 'p-2', 'p-3'] })]);
  assert.equal(plan.rows.length, 2);
  assert.equal(rowOf(plan, 'p-1').weeks[0].planned, 6.7);
  assert.equal(rowOf(plan, 'p-2').weeks[0].planned, 6.7);
  assert.equal(rowOf(plan, 'p-3'), undefined);
});

test('zapisany czas zespołu pomniejsza godziny, a przeciążenie i napięcie dostają stan', () => {
  const entries = [{ id: 'e', personId: 'p-2', projectId: 1, stageId: 's1', taskId: 't1', start: new Date(2026, 9, 5, 7).toISOString(), end: new Date(2026, 9, 5, 8).toISOString() }];
  const some = run([task('t1', { estimate: 21, deadline: '2026-10-09' })], entries);
  assert.equal(rowOf(some, 'p-1').weeks[0].planned, 20);
  const over = run([task('t1', { estimate: 50, deadline: '2026-10-09' })]);
  assert.equal(rowOf(over, 'p-1').weeks[0].state, 'over');
  const tight = run([task('t1', { estimate: 36, deadline: '2026-10-09' })]);
  assert.equal(rowOf(tight, 'p-1').weeks[0].state, 'tight');
});

test('pojemność bieżącego tygodnia liczy tylko pozostałe dni robocze', () => {
  const midweek = Plan.build({ projects: [], people, entries: [], now: new Date(2026, 9, 7, 9), target: 480, weeks: 2 });   // środa
  assert.equal(midweek.weeks[0].workdays, 3);
  assert.equal(midweek.weeks[0].capacity, 24);
  assert.equal(midweek.weeks[1].capacity, 40);
  const weekend = Plan.build({ projects: [], people, entries: [], now: new Date(2026, 9, 3, 9), target: 480, weeks: 2 });     // sobota
  assert.equal(new Date(weekend.weeks[0].start).getDate(), 5, 'w sobotę plan zaczyna się od najbliższego poniedziałku');
  assert.equal(weekend.weeks[0].workdays, 5);
  assert.equal(weekend.weeks[0].current, false);
});

test('termin w weekend, gdy plan zaczyna się od poniedziałku, nie wychodzi poza siatkę', () => {
  const sat = new Date(2026, 9, 3, 9);                     // sobota; plan od pon. 5 paź
  const plan = Plan.build({ projects: [project([task('t1', { estimate: 10, deadline: '2026-10-04' })])], people, entries: [], now: sat, target: 480, weeks: 2 });
  assert.equal(rowOf(plan, 'p-1').weeks[0].planned, 10, 'termin w niedzielę liczy się do najbliższego tygodnia planu');
});

test('okno do terminu: zadanie większe niż dostępne dni jest „za mało czasu”, równe — „musi ruszyć teraz”', () => {
  const now = new Date(2026, 9, 5, 9, 0); // poniedziałek
  const mk = (estimate, deadline) => ({ projects: [{ id: 1, code: '2601', stages: [{ id: 's', tasks: [{ id: 't', name: 'x', status: 'todo', assignees: ['p-1'], estimate, deadline }] }] }], people: [{ id: 'p-1' }], entries: [], now });
  const cell = (plan) => plan.rows[0].weeks.flatMap((w) => w.tasks)[0];
  assert.equal(cell(Plan.build(mk(80, '2026-10-09'))).squeezed, true); // 10 dni pracy, 5 dni w oknie
  assert.equal(cell(Plan.build(mk(40, '2026-10-09'))).mustStartNow, true); // 5 dni pracy, 5 dni w oknie
  assert.equal(cell(Plan.build(mk(8, '2026-10-30'))).squeezed, undefined);
});

test('data startu zadania: praca rozkłada się od startu, a pasek zaczyna się w dniu startu', () => {
  // start śr 14 paź → pt 16 paź: 3 dni, 12 h → cały plan w tygodniu 1, nic w tygodniu 0
  const plan = run([task('t1', { estimate: 12, start: '2026-10-14', deadline: '2026-10-16' })]);
  const row = rowOf(plan, 'p-1');
  assert.equal(row.weeks[0].planned, 0);
  assert.equal(row.weeks[1].planned, 12);
  assert.equal(row.bars.length, 1);
  assert.equal(row.bars[0].start, new Date(2026, 9, 14).getTime());
  assert.equal(row.bars[0].end, new Date(2026, 9, 16).getTime());
  assert.equal(row.bars[0].explicitStart, true);
});

test('bez startu pasek zaczyna się dziś; po terminie pasek biegnie od terminu do dziś', () => {
  const plan = run([task('a', { estimate: 8, deadline: '2026-10-09' }), task('b', { estimate: 4, deadline: '2026-10-01' })]);
  const bars = rowOf(plan, 'p-1').bars;
  const a = bars.filter((b) => b.taskId === 'a')[0];
  const b = bars.filter((x) => x.taskId === 'b')[0];
  assert.equal(a.start, new Date(2026, 9, 5).getTime());
  assert.equal(b.overdue, true);
  assert.equal(b.start, new Date(2026, 9, 1).getTime());
  assert.equal(b.end, new Date(2026, 9, 5).getTime());
});

test('pula etapu: zadanie bez szacunku bierze równą część tego, co zostało w budżecie etapu', () => {
  const stage = { id: 's1', hours: 100, tasks: [
    task('a', { estimate: 20, deadline: '2026-10-30' }),
    task('b', { deadline: '2026-10-30' }),
    task('c', { deadline: '2026-10-30', assignees: ['p-2'] })
  ] };
  const entries = [{ id: 'e1', personId: 'p-1', projectId: 1, stageId: 's1', taskId: 'a', start: '2026-10-01T08:00:00.000Z', end: '2026-10-01T12:00:00.000Z', source: 'manual' }];
  const plan = Plan.build({ projects: [{ id: 1, code: '2601', stages: [stage] }], people, entries, now, target: 480, weeks: 4 });
  // budżet 100 − zapisane 4 − szacunek zadania a (20 − 4 = 16) = 80, dla dwóch zadań bez szacunku po 40 h
  const b = rowOf(plan, 'p-1').bars.filter((x) => x.taskId === 'b')[0];
  const c = rowOf(plan, 'p-2').bars.filter((x) => x.taskId === 'c')[0];
  assert.equal(b.hours, 40);
  assert.equal(c.hours, 40);
  assert.equal(b.fromPool, true);
});

test('pojemność tygodnia uwzględnia udział planowalny (bufor na sprawy bieżące)', () => {
  const plan = run([task('t1', { estimate: 34, deadline: '2026-10-09' })], [], { capacityPct: 80 });
  const w = rowOf(plan, 'p-1').weeks[0];
  assert.equal(w.capacity, 32);
  assert.equal(w.state, 'over');
});

test('okno planu można przesunąć o tygodnie', () => {
  const plan = run([task('t1', { estimate: 8, deadline: '2026-10-20' })], [], { offsetWeeks: 1 });
  assert.equal(plan.weeks[0].start, new Date(2026, 9, 12).getTime());
  assert.equal(plan.weeks[0].current, false);
});

test('shiftSpan: przesuwanie całego paska i brzegów w dniach roboczych, z pominięciem weekendów', () => {
  const t = { start: '2026-10-08', deadline: '2026-10-09T12:00' };            // czw–pt
  assert.deepEqual(Plan.shiftSpan(t, 'move', 1, now), { start: '2026-10-09', deadline: '2026-10-12T12:00' });
  assert.deepEqual(Plan.shiftSpan(t, 'end', 3, now), { start: '2026-10-08', deadline: '2026-10-14T12:00' });
  assert.deepEqual(Plan.shiftSpan(t, 'start', -2, now), { start: '2026-10-06', deadline: '2026-10-09T12:00' });
  assert.deepEqual(Plan.shiftSpan(t, 'end', -5, now), { start: '2026-10-08', deadline: '2026-10-08T12:00' }, 'koniec nie wyprzedza startu');
  assert.deepEqual(Plan.shiftSpan({ deadline: '2026-10-09' }, 'move', 1, now), { start: '2026-10-06', deadline: '2026-10-12T16:00' }, 'bez startu pasek zaczyna się dziś');
  assert.equal(Plan.shiftSpan({ deadline: '' }, 'move', 1, now), null);
  assert.equal(Plan.workdayDiff(new Date(2026, 9, 9), new Date(2026, 9, 12)), 1);
});

test('pasek niesie godziny i gęstość pracy: 8 h rozciągnięte na 4 tygodnie to cienka praca, nie cztery tygodnie pracy', () => {
  const plan = run([task('mapa', { estimate: 8, deadline: '2026-11-02' }), task('pelna', { estimate: 160, deadline: '2026-11-02' })]);
  const bars = rowOf(plan, 'p-1').bars;
  const mapa = bars.filter((b) => b.taskId === 'mapa')[0];
  const pelna = bars.filter((b) => b.taskId === 'pelna')[0];
  assert.equal(mapa.hours, 8);
  assert.equal(mapa.days, 21);
  assert.ok(mapa.density < 0.06);
  assert.ok(Math.abs(pelna.density - 160 / 21 / 8) < 1e-9);
  // obciążenie tygodni wynika z godzin, a nie z długości paska
  assert.ok(rowOf(plan, 'p-1').weeks[0].planned < 40 + 8 / 21 * 5 + 1);
});

test('priorytety projektów: numerowane najpierw, reszta po kodzie, zakończone pominięte; przesunięcie zachowuje pozostałe', () => {
  const list = [
    { id: 1, code: '2601', status: 'active', priority: 0 },
    { id: 2, code: '2602', status: 'active', priority: 2 },
    { id: 3, code: '2603', status: 'done', priority: 1 },
    { id: 4, code: '2604', status: 'planned', priority: 1 }
  ];
  assert.deepEqual(Plan.rankProjects(list).map(p => p.id), [4, 2, 1]);
  assert.deepEqual(Plan.moveInOrder([4, 2, 1], 1, 0), [1, 4, 2]);
  assert.deepEqual(Plan.moveInOrder([4, 2, 1], 4, 9), [2, 1, 4], 'poza zakresem trafia na koniec');
  assert.deepEqual(Plan.moveInOrder([4, 2], 99, 0), [4, 2], 'nieznany projekt nic nie zmienia');
});

test('nieobecność zmniejsza pojemność tygodnia i omija dni urlopu przy rozkładaniu pracy', () => {
  const people = [{ id: 'p-1', active: true }];
  const task = { id: 't1', name: 'Zadanie', status: 'todo', assignees: ['p-1'], estimate: 16, start: '2026-10-05', deadline: '2026-10-09T16:00' };
  const projects = [{ id: 1, code: '2601', stages: [{ id: 's1', hours: 100, tasks: [task] }] }];
  const now = new Date(2026, 9, 5, 8);
  const plain = Plan.build({ projects, people, entries: [], now, weeks: 2 }).rows[0];
  assert.equal(plain.weeks[0].capacity, 40);
  assert.equal(plain.weeks[0].planned, 16);
  const absences = [{ id: 'a-1', personId: 'p-1', from: '2026-10-07', to: '2026-10-08', kind: 'leave', note: '' }];
  const row = Plan.build({ projects, people, entries: [], now, weeks: 2, absences }).rows[0];
  assert.equal(row.weeks[0].capacity, 24, 'dwa dni urlopu odejmują 16 h');
  assert.equal(row.weeks[0].absentDays, 2);
  assert.equal(row.weeks[0].planned, 16, 'praca nadal się mieści, tylko na trzech dniach');
  assert.equal(row.bars[0].absentDays, 2);
  assert.equal(row.absences.length, 1);
  const tight = { ...task, estimate: 30 };
  const squeezed = Plan.build({ projects: [{ id: 1, code: '2601', stages: [{ id: 's1', hours: 100, tasks: [tight] }] }], people, entries: [], now, weeks: 2, absences }).rows[0];
  assert.equal(squeezed.bars[0].squeezed, true, '30 h na 3 dniach po 8 h to za mało czasu');
});
