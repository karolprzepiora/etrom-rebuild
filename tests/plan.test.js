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
