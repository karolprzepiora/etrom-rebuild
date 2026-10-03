'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Events = require('../src/core/events.js');
const Social = require('../src/core/social.js');
const Feed = require('../src/core/feed.js');
const Model = require('../src/core/model.js');

const NOW = new Date(2026, 9, 2, 12, 0);

function stage(id, status, deadline) {
  const tasks = deadline ? [{ id: 't-' + id, name: 'Zadanie', status: 'todo', deadline: deadline + 'T12:00', workload: 'medium', assignees: [], parts: {}, history: [] }] : [];
  return Object.assign(Model.createStage(id), { status: status, hours: 40, tasks: tasks });
}

function project(extra) {
  return Object.assign({
    id: 1, code: '2601', name: 'Projekt', client: 'Klient', status: 'active', deadline: '2027-12-31', createdAt: '2026-09-25T08:00:00.000Z',
    team: { leader: 'p-1', coordinator: '', proxyLead: '', proxyExtra: '', members: [] },
    stages: [stage('preparation', 'done'), stage('concept', 'working', '2026-11-15'), stage('handover', 'todo', '2026-12-20')]
  }, extra || {});
}

test('zdarzenia: bez poprzedniego odcisku nie ma zdarzeń etapów ani statusu', () => {
  const r = Events.detect(null, [project()], NOW, { actorId: 'p-1', health: {} });
  assert.deepEqual(r.events, []);
  assert.equal(r.health[1], 'normal');
});

test('zdarzenia: zakończenie etapu zapisuje etap, następny etap i autora', () => {
  const before = Events.snapshot([project()], NOW);
  const after = project({ stages: [stage('preparation', 'done'), stage('concept', 'done', '2026-11-15'), stage('handover', 'working', '2026-12-20')] });
  const r = Events.detect(before, [after], NOW, { actorId: 'p-2', health: { 1: 'normal' } });
  const ev = r.events.filter((e) => e.event === 'stage-done');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].stageId, 'concept');
  assert.equal(ev[0].actorId, 'p-2');
  assert.ok(/Następny etap/.test(ev[0].detail));
});

test('zdarzenia: wstrzymanie, wznowienie i zamknięcie projektu', () => {
  const base = project();
  const snap = Events.snapshot([base], NOW);
  assert.equal(Events.detect(snap, [Object.assign({}, base, { status: 'paused' })], NOW, { health: {} }).events.filter((e) => e.event === 'project-paused').length, 1);
  const pausedSnap = Events.snapshot([Object.assign({}, base, { status: 'paused' })], NOW);
  assert.equal(Events.detect(pausedSnap, [base], NOW, { health: {} }).events.filter((e) => e.event === 'project-resumed').length, 1);
  assert.equal(Events.detect(snap, [Object.assign({}, base, { status: 'done' })], NOW, { health: {} }).events.filter((e) => e.event === 'project-done').length, 1);
});

test('zdarzenia: zmiana stanu między sesjami (zapisany poziom) daje wpis z powodem', () => {
  const late = project({ deadline: '2026-09-26' });
  const r = Events.detect(null, [late], NOW, { health: { 1: 'normal' } });
  const h = r.events.filter((e) => e.event === 'health');
  assert.equal(h.length, 1);
  assert.equal(h[0].level, 'alarm');
  assert.ok(/alarmowy/.test(h[0].title));
  assert.ok(/minął/.test(h[0].text));
  assert.equal(r.health[1], 'alarm');
});

test('zdarzenia: powrót do normy i ochrona przed powtórką tego samego poziomu', () => {
  const back = Events.detect(null, [project()], NOW, { health: { 1: 'warning' } }).events.filter((e) => e.event === 'health');
  assert.equal(back.length, 1);
  assert.equal(back[0].level, 'normal');
  const recent = [{ event: 'health', projectId: 1, level: 'alarm', at: new Date(NOW.getTime() - 3600000).toISOString() }];
  const again = Events.detect(null, [project({ deadline: '2026-09-26' })], NOW, { health: { 1: 'normal' }, recent: recent });
  assert.equal(again.events.filter((e) => e.event === 'health').length, 0);
});

test('zdarzenia: nowy projekt (bez zapisanego poziomu) nie generuje zdarzeń stanu', () => {
  assert.deepEqual(Events.detect(null, [project({ deadline: '2026-09-26' })], NOW, { health: {} }).events, []);
});

test('social: zdarzenia i zapamiętane poziomy są czyszczone, zapisywane i ograniczone limitem', () => {
  const dirty = Social.normalize({
    events: [
      { id: 'ev-1', at: '2026-10-01T10:00:00.000Z', event: 'stage-done', projectId: 1, title: 'Etap zakończony', text: 'X', level: 'normal' },
      { id: 'ev-2', at: 'zła data', event: 'stage-done', projectId: 1, title: 'x' },
      { id: 'ev-3', at: '2026-10-01T10:00:00.000Z', event: 'nieznane', projectId: 1, title: 'x' },
      { id: 'ev-1', at: '2026-10-01T11:00:00.000Z', event: 'health', projectId: 1, title: 'duplikat' }
    ],
    health: { 1: 'warning', 2: 'zepsute', abc: 'normal' }
  });
  assert.equal(dirty.events.length, 1);
  assert.deepEqual(dirty.health, { 1: 'warning' });
  let s = Social.empty();
  for (let i = 0; i < Social.LIMITS.events + 20; i += 1) {
    s = Social.recordEvents(s, [{ event: 'stage-done', projectId: 1, title: 'E', at: new Date(2026, 9, 1, 0, i).toISOString() }], { 1: 'normal' });
  }
  assert.equal(s.events.length, Social.LIMITS.events);
  assert.deepEqual(s.health, { 1: 'normal' });
});

test('strumień: zdarzenia projektowe są pozycjami z kontekstem, filtrem i licznikiem', () => {
  const social = Social.recordEvents(Social.empty(), [{ event: 'stage-done', projectId: 1, stageId: 'concept', title: 'Etap zakończony', text: 'Koncepcja', at: '2026-10-02T08:00:00.000Z' }], {});
  const ws = { projects: [project()], people: [], entries: [], mail: [], social: social };
  const feed = Feed.build(ws, null, NOW, { filter: 'all' });
  const item = feed.items.find((i) => i.kind === 'event');
  assert.ok(item);
  assert.equal(item.key.indexOf('event:'), 0);
  assert.equal(feed.counts.events, 1);
  assert.equal(Feed.build(ws, null, NOW, { filter: 'events' }).items.every((i) => i.kind === 'event'), true);
  assert.ok(Feed.FILTERS.indexOf('events') >= 0);
});
