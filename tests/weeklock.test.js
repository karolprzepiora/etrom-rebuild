'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WL = require('../src/core/weeklock.js');
const TS = require('../src/core/timesheet.js');

const NOW = new Date(2026, 9, 14, 10, 0);

test('tydzień: poniedziałek i zamknięcie', () => {
  assert.equal(WL.mondayOf('2026-10-14'), '2026-10-12');
  assert.equal(WL.mondayOf('2026-10-18'), '2026-10-12');
  const r = WL.submit([], 'p-2', '2026-10-14', NOW, false);
  assert.ok(r.valid);
  assert.equal(r.lock.status, 'submitted');
  assert.ok(WL.isLocked(r.locks, 'p-2', '2026-10-16'));
  assert.ok(!WL.isLocked(r.locks, 'p-2', '2026-10-19'));
  assert.ok(!WL.isLocked(r.locks, 'p-3', '2026-10-16'));
  assert.equal(WL.submit(r.locks, 'p-2', '2026-10-13', NOW, false).valid, false);
  assert.equal(WL.submit([], 'p-2', '2026-10-26', NOW, false).valid, false);
});

test('zarząd zatwierdza własny tydzień od razu; decyzja i zwrot', () => {
  const own = WL.submit([], 'p-1', '2026-10-12', NOW, true);
  assert.equal(own.lock.status, 'approved');
  const s = WL.submit([], 'p-2', '2026-10-12', NOW, false);
  const ret = WL.decide(s.locks, 'p-2', '2026-10-12', 'return', 'p-1', 'popraw', NOW);
  assert.equal(ret.lock.status, 'returned');
  assert.ok(!WL.isLocked(ret.locks, 'p-2', '2026-10-13'));
  const ok = WL.decide(s.locks, 'p-2', '2026-10-12', 'approve', 'p-1', '', NOW);
  assert.equal(ok.lock.status, 'approved');
  assert.equal(WL.decide(ok.locks, 'p-2', '2026-10-12', 'approve', 'p-1', '', NOW).valid, false);
  assert.ok(WL.reopen(ok.locks, 'p-2', '2026-10-12').valid);
});

test('kto zatwierdza: zarząd albo lider, nigdy sam siebie', () => {
  const projects = [{ team: { leader: 'p-3' }, stages: [{ tasks: [{ assignees: ['p-2'] }] }] }];
  assert.ok(WL.canDecide('p-1', 'p-2', projects, true));
  assert.ok(WL.canDecide('p-3', 'p-2', projects, false));
  assert.ok(!WL.canDecide('p-4', 'p-2', projects, false));
  assert.ok(!WL.canDecide('p-2', 'p-2', projects, true));
});

test('normalize usuwa duplikaty i śmieci', () => {
  const out = WL.normalize([{ personId: 'a', week: '2026-10-12', status: 'approved' }, { personId: 'a', week: '2026-10-12', status: 'submitted' }, { personId: 'b', week: 'x', status: 'approved' }, null]);
  assert.equal(out.length, 1);
});

test('mapa kompletności i bilans narastający', () => {
  const people = [{ id: 'p-2' }];
  const rows = WL.completeness([], people, '2026-10-05', NOW, { target: 480 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].days.length, 5);
  assert.ok(rows[0].missing >= 0);
  const c = TS.cumulative([], 'p-2', NOW, { target: 480 });
  assert.equal(typeof c, 'number');
});
