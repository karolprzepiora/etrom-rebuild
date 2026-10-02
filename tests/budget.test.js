'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Budget = require('../src/core/budget.js');
const Model = require('../src/core/model.js');

const NOW = new Date(2026, 9, 2, 12, 0);
const people = [
  { id: 'p-1', orgRole: 'managing' },
  { id: 'p-2', orgRole: 'member' },
  { id: 'p-3', orgRole: 'member' }
];
const project = { id: 7, team: { leader: 'p-2', members: ['p-3'] } };
const entry = (personId, minutes, stageId) => ({
  id: 'e-' + personId + minutes, personId, projectId: 7, stageId: stageId || 'concept', taskId: 't',
  start: '2026-10-01T08:00:00.000Z', end: new Date(Date.parse('2026-10-01T08:00:00.000Z') + minutes * 60000).toISOString()
});
const stage = (extra) => Object.assign(Model.createStage('concept'), { hours: 10 }, extra || {});

test('zużycie liczy czas całego zespołu na etapie i korekty dyrekcji', () => {
  const entries = [entry('p-2', 120), entry('p-3', 180), entry('p-2', 600, 'other')];
  const u = Budget.usage(project, stage({ adjustments: [{ id: 'a-1', hours: 2, note: '', by: 'p-1', at: '' }] }), entries, NOW);
  assert.equal(u.logged, 5);
  assert.equal(u.bonus, 2);
  assert.equal(u.used, 7);
  assert.equal(u.percent, 70);
  assert.equal(u.state, 'ok');
});

test('stan budżetu: ostrzeżenie od 80%, przekroczenie powyżej 100%', () => {
  assert.equal(Budget.usage(project, stage(), [entry('p-2', 480)], NOW).state, 'warn');
  assert.equal(Budget.usage(project, stage(), [entry('p-2', 600)], NOW).state, 'warn');
  assert.equal(Budget.usage(project, stage(), [entry('p-2', 660)], NOW).state, 'over');
  assert.equal(Budget.usage(project, stage({ hours: 0 }), [], NOW).percent, 0);
});

test('godziny widzą zarząd i lider projektu, reszta tylko procent', () => {
  const entries = [entry('p-3', 300)];
  const s = stage();
  const boss = Budget.view(project, s, entries, 'p-1', people, NOW);
  const lead = Budget.view(project, s, entries, 'p-2', people, NOW);
  const member = Budget.view(project, s, entries, 'p-3', people, NOW);
  const nobody = Budget.view(project, s, entries, null, people, NOW);
  assert.equal(boss.exact, true);
  assert.equal(boss.used, 5);
  assert.equal(lead.planned, 10);
  [member, nobody].forEach((v) => {
    assert.equal(v.exact, false);
    assert.equal(v.percent, 50);
    assert.equal(v.used, null);
    assert.equal(v.planned, null);
    assert.equal(v.bonus, null);
  });
});

test('pracownik widzi w procentach także korekty dyrekcji, nie wiedząc, że to korekta', () => {
  const s = stage({ adjustments: [{ id: 'a-1', hours: 5, note: 'zapas', by: 'p-1', at: '' }] });
  const v = Budget.view(project, s, [], 'p-3', people, NOW);
  assert.equal(v.percent, 50);
  assert.equal(v.bonus, null);
});

test('korekty dodaje tylko zarząd', () => {
  assert.equal(Budget.canAdjust('p-1', people), true);
  assert.equal(Budget.canAdjust('p-2', people), false);
  assert.equal(Budget.canAdjust(null, people), false);
});

test('addAdjustment: walidacja, kolejne numery, przecinek dziesiętny, usuwanie', () => {
  const s = stage();
  assert.equal(Budget.addAdjustment(s, { hours: 0 }, 'p-1', NOW).valid, false);
  assert.equal(Budget.addAdjustment(s, { hours: 'abc' }, 'p-1', NOW).errors.hours.length > 0, true);
  assert.equal(Budget.addAdjustment(s, { hours: 5000 }, 'p-1', NOW).valid, false);
  const a = Budget.addAdjustment(s, { hours: '2,5', note: ' zapas ' }, 'p-1', NOW);
  assert.equal(a.valid, true);
  assert.deepEqual(a.stage.adjustments.map((x) => [x.id, x.hours, x.note, x.by]), [['a-1', 2.5, 'zapas', 'p-1']]);
  const b = Budget.addAdjustment(a.stage, { hours: 1 }, 'p-1', NOW);
  assert.equal(b.stage.adjustments[1].id, 'a-2');
  assert.deepEqual(Budget.removeAdjustment(b.stage, 'a-1').adjustments.map((x) => x.id), ['a-2']);
  assert.equal(s.adjustments.length, 0, 'wejście nie jest zmieniane');
});

test('zapis korekt jest czyszczony, a model je zachowuje', () => {
  assert.deepEqual(Budget.normalizeAdjustments([{ id: 'a-1', hours: 3, note: 'x' }, { id: 'a-1', hours: 2 }, { id: 'a-2', hours: -1 }, null, { hours: 1 }]).map((a) => a.id), ['a-1']);
  const ws = Model.normalizeWorkspace({ projects: [{ code: '2601', name: 'P', stages: [Object.assign(Model.createStage('concept'), { adjustments: [{ id: 'a-1', hours: 4, note: 'n', by: 'p-1', at: '2026-10-01T00:00:00.000Z' }] })] }] });
  assert.equal(ws.projects[0].stages[0].adjustments[0].hours, 4);
});

test('numer nowego projektu: rok i kolejny numer w roku', () => {
  assert.equal(Model.nextProjectCode([], NOW), '2601');
  assert.equal(Model.nextProjectCode([{ code: '2601' }, { code: '2602' }], NOW), '2603');
  assert.equal(Model.nextProjectCode([{ code: '2509' }, { code: '2601' }, { code: '2604' }], NOW), '2605');
  assert.equal(Model.nextProjectCode([{ code: '2609' }], NOW), '2610');
  assert.equal(Model.nextProjectCode([{ code: '2609' }], new Date(2027, 0, 5)), '2701');
});
