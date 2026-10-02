'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Insight = require('../src/core/insight.js');
const Model = require('../src/core/model.js');

const NOW = new Date(2026, 9, 2, 12, 0);

function stage(id, status, hours, deadline, tasks) {
  return Object.assign(Model.createStage(id), { status: status, hours: hours, deadline: deadline || '', tasks: tasks || [] });
}

function project(extra) {
  return Object.assign({
    id: 1, code: 'P-1', name: 'Projekt', client: 'Klient', status: 'active',
    deadline: '2026-12-31', createdAt: '2026-09-01T08:00:00.000Z',
    team: { leader: '', coordinator: '', proxyLead: '', proxyExtra: '', members: [] },
    stages: [
      stage('preparation', 'done', 40),
      stage('concept', 'working', 80, '2026-11-15'),
      stage('handover', 'todo', 80, '2026-12-20')
    ]
  }, extra || {});
}

function task(extra) {
  return Object.assign({ id: 't-1', name: 'Zadanie', status: 'todo', deadline: '', workload: 'medium', assignees: [], parts: {}, history: [] }, extra || {});
}

test('projekt w terminie i bez zaległości jest w normie', () => {
  const h = Insight.health(project({ createdAt: '2026-09-25T08:00:00.000Z' }), NOW);
  assert.equal(h.level, 'normal');
  assert.equal(h.label, 'W normie');
  assert.deepEqual(h.reasons, []);
});

test('przekroczony termin umowy to stan alarmowy z liczbą dni w powodzie', () => {
  const h = Insight.health(project({ deadline: '2026-09-26' }), NOW);
  assert.equal(h.level, 'alarm');
  assert.equal(h.reasons[0].text, 'Termin umowy minął 6 dni temu');
});

test('zakończony projekt nie alarmuje, nawet z datą w przeszłości', () => {
  const h = Insight.health(project({ status: 'done', deadline: '2026-01-01' }), NOW);
  assert.equal(h.level, 'closed');
});

test('zadanie po terminie i etap po terminie dają ostrzeżenie', () => {
  const p = project({ createdAt: '2026-09-30T08:00:00.000Z' });
  p.stages[1].tasks = [task({ deadline: '2026-10-01T10:00' })];
  p.stages[1].deadline = '2026-09-30';
  const h = Insight.health(p, NOW);
  assert.equal(h.level, 'warning');
  assert.ok(h.reasons.some((r) => r.text === '1 zadanie po terminie'));
  assert.ok(h.reasons.some((r) => /Koncepcja i analizy projektowe” po terminie/.test(r.text)));
});

test('bliski termin przy małym postępie ostrzega, przy prawie skończonej pracy nie', () => {
  const near = Insight.health(project({ deadline: '2026-10-10', createdAt: '2026-10-01T08:00:00.000Z' }), NOW);
  assert.equal(near.level, 'warning');
  assert.match(near.reasons[0].text, /Do terminu umowy 8 dni, postęp 20%/);
  const p = project({ deadline: '2026-10-10', createdAt: '2026-10-01T08:00:00.000Z' });
  p.stages.forEach((s) => { s.status = 'done'; });
  p.stages.push(stage('estimates', 'todo', 10));
  assert.equal(Insight.health(p, NOW).level, 'normal');
});

test('opóźnienie wobec upływu czasu: ostrzeżenie od 15 punktów, alarm od 30', () => {
  // umowa 1.07–31.12, 2.10 to ~51% czasu; postęp 20% → opóźnienie 31 pkt
  const late = Insight.health(project({ createdAt: '2026-07-01T08:00:00.000Z' }), NOW);
  assert.equal(late.level, 'alarm');
  assert.match(late.reasons[0].text, /Postęp 20% przy 5\d% czasu umowy/);
  const plan = Insight.schedule(project({ createdAt: '2026-07-01T08:00:00.000Z' }), NOW);
  assert.ok(plan.lag >= 30 && plan.expected > 50 && plan.daysLeft === 90);
});

test('wstrzymany projekt i zwrot do poprawy są widoczne w powodach', () => {
  const p = project({ status: 'paused', createdAt: '2026-09-30T08:00:00.000Z' });
  p.stages[1].tasks = [task({ status: 'changes', feedback: 'x' })];
  const reasons = Insight.health(p, NOW).reasons.map((r) => r.text);
  assert.ok(reasons.indexOf('Projekt wstrzymany') >= 0);
  assert.ok(reasons.indexOf('1 zadanie zwrócone do poprawy') >= 0);
});

test('profil: odcinki ważone godzinami, bieżący etap oznaczony, zaległe zaznaczone', () => {
  const p = project();
  p.stages[2].deadline = '2026-09-01';
  const prof = Insight.profile(p, NOW);
  assert.equal(prof.segments.length, 3);
  assert.deepEqual(prof.segments.map((s) => s.weight), [0.2, 0.4, 0.4]);
  assert.deepEqual(prof.segments.map((s) => s.start), [0, 0.2, 0.6000000000000001]);
  assert.equal(prof.segments[1].current, true);
  assert.equal(prof.segments[2].overdue, true);
  assert.equal(prof.percent, 20);
  assert.equal(prof.currentIndex, 1);
});

test('profil pustego projektu nie wywraca się', () => {
  const prof = Insight.profile(project({ stages: [] }), NOW);
  assert.deepEqual(prof.segments, []);
  assert.equal(prof.current, null);
});

test('najbliższe zdarzenie wybiera najwcześniejszy przyszły termin', () => {
  const p = project();
  p.stages[1].tasks = [task({ name: 'Rysunki', deadline: '2026-10-05T09:00' }), task({ id: 't-2', name: 'Stare', deadline: '2026-09-01T09:00' })];
  const ev = Insight.nextEvent(p, NOW);
  assert.equal(ev.kind, 'task');
  assert.equal(ev.label, 'Rysunki');
  assert.equal(ev.days, 3);
  assert.equal(Insight.nextEvent(project({ status: 'done' }), NOW), null);
});

test('portfel liczy projekty w każdym stanie i zbiera terminy w horyzoncie', () => {
  const list = [
    project({ id: 1, deadline: '2026-09-20' }),
    project({ id: 2, status: 'done' }),
    project({ id: 3, createdAt: '2026-09-30T08:00:00.000Z', deadline: '2026-11-01' })
  ];
  const view = Insight.portfolio(list, NOW, 60);
  assert.deepEqual(view.counts, { alarm: 1, warning: 0, normal: 1, closed: 1 });
  assert.equal(view.byLevel.alarm[0].project.id, 1);
  assert.ok(view.upcoming.every((u, i, a) => i === 0 || a[i - 1].days <= u.days));
  assert.ok(view.upcoming.some((u) => u.kind === 'project' && u.project.id === 3));
  assert.ok(!view.upcoming.some((u) => u.project.id === 2), 'zakończone projekty nie mają terminów');
});

test('obciążenie liczy tylko niedomknięte udziały osoby', () => {
  const p = project({ team: { leader: 'p-1', coordinator: '', proxyLead: '', proxyExtra: '', members: ['p-2'] } });
  p.stages[1].tasks = [
    task({ id: 't-1', assignees: ['p-1', 'p-2'], parts: { 'p-1': 'working', 'p-2': 'done' }, deadline: '2026-09-30T10:00' }),
    task({ id: 't-2', assignees: ['p-1'], status: 'done' }),
    task({ id: 't-3', assignees: ['p-1'] })
  ];
  const w1 = Insight.workload('p-1', [p], NOW);
  assert.equal(w1.open, 2);
  assert.equal(w1.overdue, 1);
  assert.equal(w1.projects, 1);
  assert.equal(w1.functions[0].fn.key, 'leader');
  assert.equal(w1.tasks[0].overdue, true, 'zaległe na początku');
  const w2 = Insight.workload('p-2', [p], NOW);
  assert.equal(w2.open, 0);
});
