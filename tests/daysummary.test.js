'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../src/core/daysummary.js');

const at = (y, mo, d, h, m = 0) => new Date(y, mo - 1, d, h, m);
const entry = (id, task, from, to) => ({ id, personId: 'p-1', projectId: 1, stageId: 's1', taskId: task, label: 'Etap', start: from.toISOString(), end: to.toISOString() });
const projects = [{ id: 1, code: '2601', stages: [{ id: 's1', tasks: [
  { id: 't1', name: 'Operat', status: 'working', assignees: ['p-1'], start: '2026-10-05', deadline: '2026-10-09T16:00', estimate: 40 },
  { id: 't2', name: 'Mapa', status: 'todo', assignees: ['p-1'], deadline: '2026-10-02T16:00' },
  { id: 't3', name: 'Cudze', status: 'todo', assignees: ['p-2'], deadline: '2026-10-08T16:00' },
  { id: 't4', name: 'Zrobione', status: 'done', assignees: ['p-1'], deadline: '2026-10-08T16:00' }
] }] }];

test('werdykt dnia: cel osiągnięty, dzień trwa, wieczorem brakuje mało albo dużo', () => {
  assert.equal(DS.dayVerdict(480, 480, at(2026, 10, 7, 10)), 'ok');
  assert.equal(DS.dayVerdict(100, 480, at(2026, 10, 7, 10)), 'run');
  assert.equal(DS.dayVerdict(430, 480, at(2026, 10, 7, 17)), 'warn');
  assert.equal(DS.dayVerdict(200, 480, at(2026, 10, 7, 17)), 'bad');
});

test('podsumowanie dnia: godziny, zadania, tydzień i terminy z upływem czasu, bez godzin zaplanowanych', () => {
  const now = at(2026, 10, 7, 17);   // środa wieczór
  const entries = [
    entry('a', 't1', at(2026, 10, 5, 8), at(2026, 10, 5, 16)),   // pon 8 h
    entry('b', 't1', at(2026, 10, 6, 8), at(2026, 10, 6, 13)),   // wt 5 h
    entry('c', 't1', at(2026, 10, 7, 8), at(2026, 10, 7, 12)),   // śr 4 h
    entry('d', 't2', at(2026, 10, 7, 13), at(2026, 10, 7, 14))   // śr 1 h
  ];
  const s = DS.build({ entries, projects, personId: 'p-1', now, target: 480 });
  assert.equal(s.minutes, 300);
  assert.equal(s.missing, 180);
  assert.equal(s.state, 'bad');
  assert.deepEqual(s.tasks.map(t => [t.name, t.minutes]), [['Operat', 240], ['Mapa', 60]]);
  assert.equal(s.week.days, 2, 'pon i wt są rozliczone, środa trwa');
  assert.equal(s.week.minutes, 780);
  assert.equal(s.week.expected, 960);
  assert.equal(s.week.state, 'bad');
  assert.deepEqual(s.upcoming.map(u => u.name), ['Mapa', 'Operat'], 'po terminie najpierw, cudze i zrobione pominięte');
  assert.equal(s.upcoming[0].overdue, true);
  assert.equal(s.upcoming[0].elapsed, 100);
  const operat = s.upcoming[1];
  assert.equal(operat.daysLeft, 2);
  assert.equal(operat.elapsed, 40, 'start pon, termin pt: środa to 2 z 5 dni');
  assert.ok(!('hours' in operat) && !('estimate' in operat), 'żadnych godzin zaplanowanych');
});
