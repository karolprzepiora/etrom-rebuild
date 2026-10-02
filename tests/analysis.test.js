'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Analysis = require('../src/core/analysis.js');
const Model = require('../src/core/model.js');

const NOW = new Date(2026, 9, 2, 12, 0);
const people = [
  { id: 'p-1', orgRole: 'managing' },
  { id: 'p-2', orgRole: 'member' },
  { id: 'p-3', orgRole: 'member' }
];
const day = (offset) => new Date(2026, 9, 2 + offset, 9, 0).toISOString();
const stage = (id, hours, status, extra) => Object.assign(Model.createStage(id, { hours }), { status }, extra || {});
function project(extra) {
  return Object.assign({
    id: 1, code: '2601', name: 'Projekt', client: 'K', status: 'active', contractValue: 100000,
    createdAt: day(-50), deadline: '2026-11-21',
    team: { leader: 'p-2', coordinator: '', proxyLead: '', proxyExtra: '', members: ['p-3'] },
    stages: [stage('concept', 100, 'done'), stage('land', 100, 'working'), stage('technical', 200, 'todo')]
  }, extra || {});
}
const entry = (personId, offset, hours, stageId) => ({
  id: 'e' + offset + personId + stageId, personId, projectId: 1, stageId, taskId: '', label: 'x',
  start: day(offset), end: new Date(new Date(day(offset)).getTime() + hours * 3600000).toISOString()
});
const ws = (entries, p) => ({ projects: [p || project()], people, entries: entries || [], mail: [], social: {} });

test('postęp rzeczowy liczy godziny ukończonych etapów, a etap w toku — udział zakończonych zadań', () => {
  const p = project();
  p.stages[1].tasks = [{ status: 'done' }, { status: 'working' }];
  const a = Analysis.project(p, { entries: [], people }, NOW);
  assert.equal(a.planned, 400);
  assert.equal(a.earned, 150); // 100 + 100 * 0.5
  assert.equal(a.earnedPct, 37.5);
});

test('zużycie sumuje czas całego zespołu i korekty zarządu', () => {
  const p = project();
  p.stages[0].adjustments = [{ id: 'a-1', hours: 10, note: '', by: 'p-1', at: day(-3) }];
  const a = Analysis.project(p, { entries: [entry('p-2', -10, 20, 'concept'), entry('p-3', -9, 30, 'land')], people }, NOW);
  assert.equal(a.used, 60);
  assert.equal(a.usagePct, 15);
});

test('prognoza EAC i wskaźnik kosztu: wolniej niż plan → przekroczenie', () => {
  // 100 h zrobione kosztem 160 h: CPI 0,625, EAC = 400 / 0,625 = 640
  const entries = [entry('p-2', -20, 80, 'concept'), entry('p-3', -19, 80, 'concept')];
  const a = Analysis.project(project(), { entries, people }, NOW);
  assert.equal(a.cpi, 0.63);
  assert.equal(a.eac, 640);
  assert.equal(a.verdict, 'risk');
});

test('projekt zgodny z planem dostaje werdykt „ok”, bez danych — „nodata”, zakończony — „closed”', () => {
  const ok = Analysis.project(project({ createdAt: day(-10) }), { entries: [entry('p-2', -8, 90, 'concept')], people }, NOW);
  assert.equal(ok.verdict, 'ok');
  assert.equal(Analysis.project(project({ stages: [stage('concept', 100, 'todo')] }), { entries: [], people }, NOW).verdict, 'nodata');
  assert.equal(Analysis.project(project({ status: 'done' }), { entries: [], people }, NOW).verdict, 'closed');
});

test('godziny wg rodzaju pracy sumują zużycie etapów danego rodzaju', () => {
  const a = Analysis.project(project(), { entries: [entry('p-2', -10, 20, 'concept'), entry('p-2', -9, 10, 'land')], people }, NOW);
  const total = a.byKind.reduce((t, k) => t + k.used, 0);
  assert.equal(total, 30);
  assert.ok(a.byKind.length >= 1);
});

test('przebieg zużycia jest skumulowany tygodniami, a prognoza wyczerpania wynika z tempa', () => {
  const entries = [];
  for (let w = 0; w < 5; w += 1) entries.push(entry('p-2', -7 * w, 40, 'concept'));
  const a = Analysis.project(project(), { entries, people }, NOW);
  assert.ok(a.burn.length >= 5);
  assert.equal(a.burn[a.burn.length - 1].used, 200);
  for (let i = 1; i < a.burn.length; i += 1) assert.ok(a.burn[i].used >= a.burn[i - 1].used);
  assert.ok(a.pace > 0);
  assert.ok(a.exhaustAt > NOW.getTime());
});

test('finanse: tylko z wartością umowy i kosztem godziny', () => {
  const entries = [entry('p-2', -10, 100, 'concept')];
  const none = Analysis.project(project(), { entries, people }, NOW, { finance: true, rate: 0 });
  assert.equal(none.finance, null);
  const a = Analysis.project(project(), { entries, people }, NOW, { finance: true, rate: 150 });
  assert.equal(a.finance.cost, 15000);
  assert.equal(a.finance.margin, 85000);
  assert.equal(a.finance.marginPct, 85);
  assert.equal(a.finance.perHour, 1000);
  assert.equal(Analysis.project(project(), { entries, people }, NOW, { finance: false, rate: 150 }).finance, null);
});

test('portfel: zarząd widzi wszystko i finanse, lider swoje bez finansów, pracownik nic', () => {
  const second = project({ id: 2, code: '2602', team: { leader: 'p-3', coordinator: '', proxyLead: '', proxyExtra: '', members: [] } });
  const w = { projects: [project(), second], people, entries: [entry('p-2', -3, 10, 'concept')], mail: [] };
  const boss = Analysis.portfolio(w, 'p-1', NOW, { rate: 100 });
  assert.equal(boss.projects.length, 2);
  assert.ok(boss.totals.value > 0);
  const lead = Analysis.portfolio(w, 'p-2', NOW, { rate: 100 });
  assert.deepEqual(lead.projects.map((p) => p.id), [1]);
  assert.equal(lead.totals.value, null);
  assert.equal(lead.projects[0].finance, null);
  const nobody = Analysis.portfolio({ projects: [project()], people, entries: [] }, 'p-3', NOW);
  assert.equal(nobody.access, false);
  assert.equal(Analysis.portfolio(w, null, NOW).access, false);
});

test('trend tygodniowy: godziny trafiają do właściwego tygodnia i projektu', () => {
  const w = ws([entry('p-2', 0, 5, 'concept'), entry('p-2', -7, 3, 'concept')]);
  const r = Analysis.portfolio(w, 'p-1', NOW, { weeks: 4 });
  assert.equal(r.weekly.labels.length, 4);
  assert.equal(r.weekly.totals[3], 5);
  assert.equal(r.weekly.totals[2], 3);
  assert.equal(r.weekly.series[0].values[3], 5);
});

test('wartość umowy: walidacja i zachowanie przy braku pola w formularzu', () => {
  const base = { code: '2699', name: 'N', client: 'K', status: 'active' };
  assert.equal(Model.validateProject(Object.assign({ contractValue: '120 000,50' }, base), []).value.contractValue, 120000.5);
  assert.equal(Model.validateProject(Object.assign({ contractValue: '' }, base), []).value.contractValue, null);
  assert.ok(Model.validateProject(Object.assign({ contractValue: 'abc' }, base), []).errors.contractValue);
  assert.equal('contractValue' in Model.validateProject(base, []).value, false, 'brak pola nie zeruje wartości');
});
