'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tasks = require('../src/core/tasks.js');

const TEAM = ['p-1', 'p-2', 'p-3'];
const NOW = new Date(2026, 5, 15, 12, 0);

function task(extra) {
  return Object.assign({
    id: 't-1', name: 'Zadanie', status: 'todo', deadline: '', workload: 'medium',
    assignees: [], parts: {}, history: []
  }, extra || {});
}

/* ---------- walidacja ---------- */

test('validateTask wymaga nazwy', () => {
  const result = Tasks.validateTask({}, TEAM);
  assert.equal(result.valid, false);
  assert.ok(result.errors.name);
});

test('validateTask przycina nazwę i uzupełnia nakład', () => {
  const result = Tasks.validateTask({ name: '  Opracować rysunki  ' }, TEAM);
  assert.equal(result.valid, true);
  assert.equal(result.value.name, 'Opracować rysunki');
  assert.equal(result.value.workload, 'medium');
});

test('realizatorem może być tylko osoba z zespołu projektu', () => {
  const result = Tasks.validateTask({ name: 'X', assignees: ['p-1', 'p-99'] }, TEAM);
  assert.equal(result.valid, false);
  assert.match(result.errors.assignees, /zespołu/i);
});

test('powtórzony realizator jest liczony raz', () => {
  const result = Tasks.validateTask({ name: 'X', assignees: ['p-1', 'p-1', 'p-2'] }, TEAM);
  assert.deepEqual(result.value.assignees, ['p-1', 'p-2']);
});

test('validateTask odrzuca błędną datę i nieznany nakład', () => {
  assert.ok(Tasks.validateTask({ name: 'X', deadline: 'kiedyś' }, TEAM).errors.deadline);
  assert.ok(Tasks.validateTask({ name: 'X', workload: 'ogromny' }, TEAM).errors.workload);
});

test('createTask nadaje identyfikator, status i udziały realizatorów', () => {
  const created = Tasks.createTask({ name: 'Operat', assignees: ['p-1', 'p-2'] }, [], TEAM);
  assert.equal(created.id, 't-1');
  assert.equal(created.status, 'todo');
  assert.deepEqual(created.parts, { 'p-1': 'todo', 'p-2': 'todo' });
  assert.equal(Tasks.nextTaskId([created]), 't-2');
});

test('updateTask zachowuje status i stan udziału osób, które zostają', () => {
  const base = task({ status: 'working', assignees: ['p-1', 'p-2'], parts: { 'p-1': 'done', 'p-2': 'working' } });
  const changed = Tasks.updateTask(base, { name: 'Nowa nazwa', assignees: ['p-1', 'p-3'] }, TEAM);
  assert.equal(changed.status, 'working');
  assert.equal(changed.name, 'Nowa nazwa');
  assert.deepEqual(changed.parts, { 'p-1': 'done', 'p-3': 'todo' }, 'osoba zdjęta znika, nowa zaczyna od zera');
});

/* ---------- przepływ statusów ---------- */

test('dozwolone przejścia odpowiadają przepływowi ETROM', () => {
  assert.deepEqual(Tasks.nextStatuses('todo'), ['working', 'review', 'done']);
  assert.deepEqual(Tasks.nextStatuses('review'), ['done', 'changes']);
  assert.deepEqual(Tasks.nextStatuses('done'), ['todo']);
  assert.deepEqual(Tasks.nextStatuses('nieznany'), []);
});

test('niedozwolone przejście jest odrzucane', () => {
  const result = Tasks.moveTask(task({ status: 'done' }), 'review');
  assert.equal(result.ok, false);
  assert.match(result.error, /Niedozwolona/i);
  assert.equal(result.task, null);
});

test('przejście do poprawy wymaga powodu', () => {
  const inReview = task({ status: 'review' });
  assert.equal(Tasks.moveTask(inReview, 'changes', '   ').ok, false);
  const ok = Tasks.moveTask(inReview, 'changes', 'Brakuje przekroju A-A');
  assert.equal(ok.ok, true);
  assert.equal(ok.task.feedback, 'Brakuje przekroju A-A');
});

test('zmiana statusu dopisuje wpis do historii i nie rusza oryginału', () => {
  const base = task({ status: 'todo' });
  const moved = Tasks.moveTask(base, 'working').task;
  assert.equal(moved.history.length, 1);
  assert.equal(moved.history[0].from, 'todo');
  assert.equal(moved.history[0].to, 'working');
  assert.equal(base.history.length, 0, 'oryginał zostaje nietknięty');
  assert.equal(base.status, 'todo');
});

test('zakończenie zadania zamyka udziały wszystkich realizatorów', () => {
  const base = task({ status: 'working', assignees: ['p-1', 'p-2'], parts: { 'p-1': 'working', 'p-2': 'todo' } });
  const done = Tasks.moveTask(base, 'done').task;
  assert.deepEqual(done.parts, { 'p-1': 'done', 'p-2': 'done' });
});

test('wznowienie zadania otwiera udziały od nowa', () => {
  const base = task({ status: 'done', assignees: ['p-1'], parts: { 'p-1': 'done' } });
  const back = Tasks.moveTask(base, 'todo').task;
  assert.deepEqual(back.parts, { 'p-1': 'todo' });
});

/* ---------- udział pojedynczej osoby ---------- */

test('udział przechodzi przez cykl do wykonania → w toku → gotowe', () => {
  let current = task({ assignees: ['p-1'], parts: { 'p-1': 'todo' } });
  current = Tasks.cyclePart(current, 'p-1');
  assert.equal(Tasks.partStatus(current, 'p-1'), 'working');
  current = Tasks.cyclePart(current, 'p-1');
  assert.equal(Tasks.partStatus(current, 'p-1'), 'done');
  current = Tasks.cyclePart(current, 'p-1');
  assert.equal(Tasks.partStatus(current, 'p-1'), 'todo');
});

test('cyclePart ignoruje osobę spoza realizatorów', () => {
  const base = task({ assignees: ['p-1'], parts: { 'p-1': 'todo' } });
  assert.equal(Tasks.cyclePart(base, 'p-9'), base);
});

test('allPartsDone wymaga zamknięcia udziału przez wszystkich', () => {
  assert.equal(Tasks.allPartsDone(task({ assignees: ['p-1', 'p-2'], parts: { 'p-1': 'done', 'p-2': 'working' } })), false);
  assert.equal(Tasks.allPartsDone(task({ assignees: ['p-1', 'p-2'], parts: { 'p-1': 'done', 'p-2': 'done' } })), true);
  assert.equal(Tasks.allPartsDone(task({ assignees: [] })), false, 'zadanie bez realizatorów nie jest domknięte');
});

/* ---------- podsumowania ---------- */

test('taskStats liczy otwarte, zakończone i po terminie', () => {
  const stats = Tasks.taskStats([
    task({ id: 't-1', status: 'done' }),
    task({ id: 't-2', status: 'working', deadline: '2026-06-10T12:00' }),
    task({ id: 't-3', status: 'review', deadline: '2026-06-20T12:00' }),
    task({ id: 't-4', status: 'todo' })
  ], NOW);
  assert.equal(stats.total, 4);
  assert.equal(stats.done, 1);
  assert.equal(stats.open, 3);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.review, 1);
  assert.equal(stats.nearest, '2026-06-10T12:00', 'najbliższy termin bierze się z zadań otwartych');
});

test('zadanie zakończone po terminie nie liczy się jako spóźnione', () => {
  const stats = Tasks.taskStats([task({ status: 'done', deadline: '2026-01-01T12:00' })], NOW);
  assert.equal(stats.overdue, 0);
});

test('taskStats znosi pustą i błędną listę', () => {
  assert.deepEqual(Tasks.taskStats([], NOW), { total: 0, open: 0, done: 0, overdue: 0, review: 0, nearest: '' });
  assert.equal(Tasks.taskStats(null, NOW).total, 0);
});

test('projectTaskStats sumuje zadania ze wszystkich etapów', () => {
  const project = {
    stages: [
      { id: 'a', tasks: [task({ id: 't-1', status: 'done' })] },
      { id: 'b', tasks: [task({ id: 't-2', status: 'todo' }), task({ id: 't-3', status: 'review' })] },
      { id: 'c' }
    ]
  };
  const stats = Tasks.projectTaskStats(project, NOW);
  assert.equal(stats.total, 3);
  assert.equal(stats.open, 2);
  assert.equal(stats.review, 1);
});

/* ---------- wczytywanie z dysku ---------- */

test('normalizeTasks pomija zadania bez nazwy i powtórzone identyfikatory', () => {
  const result = Tasks.normalizeTasks([
    { id: 't-1', name: 'Pierwsze' },
    { id: 't-1', name: 'Duplikat' },
    { id: 't-2', name: '' },
    { id: '', name: 'Bez id' },
    null
  ], TEAM);
  assert.deepEqual(result.map((t) => t.name), ['Pierwsze']);
});

test('normalizeTasks usuwa realizatorów spoza zespołu i naprawia stany', () => {
  const result = Tasks.normalizeTasks([{
    id: 't-1', name: 'Operat', status: 'wymyślony', workload: 'ogromny',
    assignees: ['p-1', 'p-99', 'p-1'],
    parts: { 'p-1': 'nieznany' },
    deadline: 'nie-data'
  }], TEAM);
  const first = result[0];
  assert.deepEqual(first.assignees, ['p-1']);
  assert.equal(first.status, 'todo');
  assert.equal(first.workload, 'medium');
  assert.equal(first.parts['p-1'], 'todo');
  assert.equal(first.deadline, '');
});

test('normalizeTasks zachowuje poprawną historię i odrzuca uszkodzoną', () => {
  const result = Tasks.normalizeTasks([{
    id: 't-1', name: 'X',
    history: [
      { from: 'todo', to: 'working', at: '2026-06-01T10:00:00.000Z' },
      { from: 'todo', to: 'wymyślony', at: '2026-06-01T10:00:00.000Z' },
      { from: 'todo', to: 'done', at: 'kiedyś' }
    ]
  }], TEAM);
  assert.equal(result[0].history.length, 1);
  assert.equal(result[0].history[0].to, 'working');
});

test('normalizeTasks bez listy zespołu przyjmuje każdego realizatora', () => {
  const result = Tasks.normalizeTasks([{ id: 't-1', name: 'X', assignees: ['ktokolwiek'] }], null);
  assert.deepEqual(result[0].assignees, ['ktokolwiek']);
});

/* ---------- opis terminu ---------- */

test('termin zadania bez daty i zakończone nie straszą kolorem', () => {
  assert.deepEqual(Tasks.deadlineInfo(task({ deadline: '' }), NOW), { tone: 'none', text: 'bez terminu' });
  assert.equal(Tasks.deadlineInfo(task({ status: 'done', deadline: '2026-01-01T10:00' }), NOW).tone, 'none');
});

test('ostatnia doba liczona jest w godzinach', () => {
  const info = Tasks.deadlineInfo(task({ deadline: '2026-06-15T18:00' }), NOW);
  assert.equal(info.tone, 'urgent');
  assert.match(info.text, /zostało 6 h/);
});

test('przekroczony termin rozróżnia godziny i dni', () => {
  assert.match(Tasks.deadlineInfo(task({ deadline: '2026-06-15T09:00' }), NOW).text, /3 h po terminie/);
  assert.match(Tasks.deadlineInfo(task({ deadline: '2026-06-12T12:00' }), NOW).text, /3 dni po terminie/);
  assert.equal(Tasks.deadlineInfo(task({ deadline: '2026-06-12T12:00' }), NOW).tone, 'overdue');
});

test('progi dalszych terminów', () => {
  assert.equal(Tasks.deadlineInfo(task({ deadline: '2026-06-20T12:00' }), NOW).tone, 'warning');
  assert.equal(Tasks.deadlineInfo(task({ deadline: '2026-07-20T12:00' }), NOW).tone, 'normal');
});

test('zadanie zapamiętuje pismo, z którego powstało (mailId), i zachowuje je po wczytaniu z dysku', () => {
  const check = Tasks.validateTask({ name: 'Odpowiedź', mailId: 'm-7', assignees: [] }, []);
  assert.equal(check.value.mailId, 'm-7');
  const created = Tasks.createTask({ name: 'Odpowiedź', mailId: 'm-7' }, [], []);
  assert.equal(created.mailId, 'm-7');
  assert.equal(Tasks.normalizeTasks([created], []).pop().mailId, 'm-7');
  assert.equal(Tasks.validateTask({ name: 'Zwykłe' }, []).value.mailId, '');
});
