'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/core/feasibility.js');

const people = [{ id: 'p-1', active: true }, { id: 'p-2', active: true }];
const NOW = new Date(2026, 9, 5, 8);   // poniedziałek 5 paź 2026
const own = {
  id: 1, code: '2601', team: { leader: 'p-1', members: ['p-2'] },
  stages: [{ id: 's1', status: 'working', hours: 80, deadline: '2026-10-16', tasks: [] }, { id: 's2', status: 'done', hours: 40, deadline: '2026-10-02', tasks: [] }, { id: 's3', status: 'todo', hours: 24, deadline: '', tasks: [] }]
};
const other = { id: 2, code: '2602', status: 'active', stages: [{ id: 'x', hours: 100, tasks: [{ id: 't', name: 'Obce', status: 'working', assignees: ['p-1'], estimate: 20, start: '2026-10-05', deadline: '2026-10-09T16:00' }] }] };

test('wykonalność planu wstępnego: pojemność zespołu, cudze zadania i zapotrzebowanie etapów tydzień po tygodniu', () => {
  const r = F.build({ project: own, projects: [own, other], people, entries: [], now: NOW, target: 480, weeks: 3 });
  assert.deepEqual(r.team.sort(), ['p-1', 'p-2']);
  assert.equal(r.weeks[0].capacity, 80, 'dwie osoby po 40 h');
  assert.equal(r.weeks[0].others, 20);
  assert.equal(r.weeks[0].own, 40, '80 h etapu na 10 dni roboczych: połowa w pierwszym tygodniu');
  assert.equal(r.weeks[0].total, 60);
  assert.equal(r.weeks[0].state, 'ok');
  assert.equal(r.weeks[1].own, 40);
  assert.equal(r.weeks[2].own, 0);
  assert.equal(r.unscheduled, 24, 'etap bez terminu liczy się osobno');
  assert.equal(r.overWeeks, 0);
});

test('zapisany czas pomniejsza zapotrzebowanie, nieobecność zmniejsza pojemność, przeciążenie jest wykrywane', () => {
  const entries = [{ id: 'e', personId: 'p-1', projectId: 1, stageId: 's1', taskId: '', start: new Date(2026, 9, 1, 8).toISOString(), end: new Date(2026, 9, 1, 16).toISOString() }];
  const absences = [{ id: 'a-1', personId: 'p-2', from: '2026-10-05', to: '2026-10-09', kind: 'leave', note: '' }];
  const r = F.build({ project: own, projects: [own, other], people, entries, absences, now: NOW, target: 480, weeks: 2 });
  assert.equal(r.weeks[0].capacity, 40, 'p-2 na urlopie cały tydzień');
  assert.equal(r.weeks[0].own, 36, '72 h do zrobienia rozłożone na 10 dni');
  assert.equal(r.weeks[0].total, 56);
  assert.equal(r.weeks[0].state, 'over');
  assert.equal(r.overWeeks, 1 + (r.weeks[1].state === 'over' ? 1 : 0));
});
