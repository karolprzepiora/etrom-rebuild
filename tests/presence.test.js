'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/presence.js');

const people = [
  { id: 'a', firstName: 'Anna', lastName: 'T', orgRole: 'employee', active: true },
  { id: 'e', firstName: 'Ewa', lastName: 'T', orgRole: 'employee', active: true },
  { id: 'j', firstName: 'Jan', lastName: 'T', orgRole: 'employee', active: true },
  { id: 't', firstName: 'Tomasz', lastName: 'T', orgRole: 'employee', active: true },
  { id: 'm', firstName: 'Michał', lastName: 'T', orgRole: 'managing', active: true }
];
const absences = [
  { id: 'u1', personId: 'e', from: '2026-10-12', to: '2026-10-14', kind: 'leave', status: 'approved' },
  { id: 'p1', personId: 'j', from: '2026-10-19', to: '2026-10-23', kind: 'leave', status: 'pending' },
  { id: 's1', personId: 't', from: '2026-10-13', to: '2026-10-13', kind: 'sick', status: 'approved' }
];
const trips = [{ id: 't-1', personIds: ['a'], kind: 'field', from: '2026-10-14', to: '2026-10-14', place: 'Lipnica' }];
const base = { people, absences, trips, projects: [], viewerId: 'a', today: '2026-10-14' };

test('status dnia: urlop, teren, dostępny; zwolnienie widoczne dla innych tylko jako nieobecność', () => {
  const r = P.build(base);
  const by = (id) => r.rows.find((x) => x.person.id === id);
  assert.equal(by('e').today.kind, 'leave');
  assert.equal(by('a').today.kind, 'field');
  assert.match(by('a').today.sub, /Lipnica/);
  assert.equal(by('j').today.kind, 'ok');
  assert.equal(by('t').week[1].status.kind, 'away');
  assert.equal(by('t').week[1].status.label, 'Nieobecny');
  const mgr = P.build(Object.assign({}, base, { viewerId: 'm' }));
  assert.equal(mgr.rows.find((x) => x.person.id === 't').week[1].status.label, 'Zwolnienie');
});

test('wnioski czekające nie zmieniają statusu, ale są liczone i wymienione; weekend to dzień wolny', () => {
  const r = P.build(base);
  const j = r.rows.find((x) => x.person.id === 'j');
  assert.equal(j.requests.length, 1);
  assert.equal(r.counts.requests, 1);
  assert.equal(r.counts.leave, 1);
  assert.equal(r.counts.field, 1);
  const sat = P.build(Object.assign({}, base, { today: '2026-10-10' }));
  assert.equal(sat.counts.off, 5);
});
