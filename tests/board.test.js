'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Board = require('../src/core/board.js');

const NOW = new Date(2026, 9, 2, 12, 0);
const t = (id, status, extra) => Object.assign({ id, name: id, status, assignees: [], history: [] }, extra || {});
const project = {
  stages: [
    { id: 'a', tasks: [t('t1', 'todo', { assignees: ['p-1'] }), t('t2', 'done', { history: [{ from: 'working', to: 'done', at: '2026-09-25T10:00:00.000Z' }] }), t('t3', 'done', { history: [{ from: 'working', to: 'done', at: '2026-07-01T10:00:00.000Z' }] })] },
    { id: 'b', tasks: [t('t4', 'review', { assignees: ['p-2'] }), t('t5', 'done')] }
  ]
};

test('tablica: zakończone zadania starsze niż 30 dni znikają, bez historii zostają', () => {
  const ids = Board.cards(project, {}, null, NOW).map((e) => e.task.id);
  assert.deepEqual(ids, ['t1', 't2', 't4', 't5']);
});

test('tablica: filtry etapu, osoby i „tylko moje”', () => {
  assert.deepEqual(Board.cards(project, { stage: 'b' }, null, NOW).map((e) => e.task.id), ['t4', 't5']);
  assert.deepEqual(Board.cards(project, { person: 'p-1' }, null, NOW).map((e) => e.task.id), ['t1']);
  assert.deepEqual(Board.cards(project, { mine: true }, 'p-2', NOW).map((e) => e.task.id), ['t4']);
  assert.deepEqual(Board.cards(project, { mine: true }, null, NOW), [], 'bez wskazanej osoby „moje” nic nie pokazuje');
  assert.equal(Board.cards(project, {}, null, NOW)[2].stageIndex, 1);
});

test('tablica: upuszczenie respektuje dozwolone przejścia', () => {
  assert.equal(Board.canDrop('todo', 'working'), true);
  assert.equal(Board.canDrop('review', 'changes'), true);
  assert.equal(Board.canDrop('todo', 'changes'), false);
  assert.equal(Board.canDrop('done', 'working'), false);
  assert.equal(Board.canDrop('working', 'working'), false);
});

test('tablica: pięć kolumn i szybkie kroki prowadzą tylko do dozwolonych statusów', () => {
  assert.deepEqual(Board.COLUMNS, ['todo', 'working', 'review', 'changes', 'done']);
  const Tasks = require('../src/core/tasks.js');
  Board.COLUMNS.forEach((from) => Board.STEPS[from].forEach((step) => {
    assert.ok(Tasks.nextStatuses(from).indexOf(step.to) >= 0, from + ' → ' + step.to);
  }));
});
