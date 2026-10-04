'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Planning = require('../src/core/planning.js');

const st = (id, hours, extra) => Object.assign({ id, hours, status: 'todo', tasks: [] }, extra || {});

test('rozdział budżetu wg wag: suma równa budżetowi, wielokrotność pół dnia', () => {
  const p = { stages: [st('concept', 80), st('technical', 120), st('estimates', 56), st('handover', 24)] };
  const r = Planning.distribute(p, 1000);
  assert.equal(r.total, 1000);
  Object.values(r.hours).forEach((h) => assert.equal(h % 4, 0));
  assert.ok(r.hours.technical > r.hours.concept && r.hours.concept > r.hours.handover);
});

test('zablokowany i zakończony etap zachowuje godziny, reszta dzieli pozostałe', () => {
  const p = { stages: [st('concept', 100, { locked: true }), st('technical', 120), st('estimates', 56, { status: 'done' }), st('handover', 24)] };
  const r = Planning.distribute(p, 500);
  assert.equal(r.hours.concept, 100);
  assert.equal(r.hours.estimates, 56);
  assert.equal(r.total, 500);
  assert.equal(r.overLocked, false);
  assert.equal(Planning.distribute(p, 100).overLocked, true);
});

test('własna waga etapu przesuwa podział', () => {
  const a = Planning.distribute({ stages: [st('concept', 1, { weight: 1 }), st('technical', 1, { weight: 3 })] }, 400);
  assert.equal(a.hours.concept, 100);
  assert.equal(a.hours.technical, 300);
});

test('pula etapu: zadania, szkice, rezerwa postępowania i uzupełnienia', () => {
  const s = st('water-process', 40, { tasks: [
    { id: 't1', estimate: 8 }, { id: 't2', estimate: 8, draft: true }, { id: 't3', estimate: 4, fromReserve: true }, { id: 't4' }
  ] });
  const p = Planning.pool(s);
  assert.equal(p.reserve, 8); // 15% z 40 h = 6 h, zaokrąglone do pół dnia
  assert.equal(p.reserveUsed, 4);
  assert.equal(p.reserveLeft, 4);
  assert.equal(p.scheduled, 8);
  assert.equal(p.drafts, 8);
  assert.equal(p.free, 16); // 40 − 8 − 8 − 8
  assert.equal(p.unsized, 1);
  assert.equal(Planning.pool(st('concept', 80, { tasks: [{ id: 'a', estimate: 100 }] })).over, true);
  assert.equal(Planning.reserveOf(st('concept', 80)), 0);
  assert.equal(Planning.reserveOf(st('water-process', 40, { reserve: 12 })), 12);
});

test('rozdział reszty po równo między zadania bez szacunku', () => {
  const s = st('concept', 80, { tasks: [{ id: 'a', estimate: 16 }, { id: 'b' }, { id: 'c' }, { id: 'd' }] });
  const f = Planning.fillShares(s); // wolne 64 h → 16 jednostek po 4 h na 3 zadania: 6,5,5
  assert.deepEqual(Object.values(f).reduce((a, b) => a + b, 0), 64);
  assert.deepEqual(Object.keys(f), ['b', 'c', 'd']);
  assert.ok(Object.values(f).every((h) => h % 4 === 0));
});

test('podsumowanie projektu i jednostka dni', () => {
  const p = { stages: [st('concept', 80, { tasks: [{ id: 'a', estimate: 40 }] }), st('technical', 120)] };
  const s = Planning.summary(p);
  assert.equal(s.budget, 200);
  assert.equal(s.scheduled, 40);
  assert.equal(s.plannedPct, 20);
  assert.equal(Planning.toDays(40), 5);
  Planning.configure({ dayHours: 7.5 });
  assert.equal(Planning.toHours(2), 15);
  Planning.configure({ dayHours: 8 });
});
