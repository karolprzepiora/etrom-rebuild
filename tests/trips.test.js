'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/core/trips.js');

const people = [{ id: 'p-1', orgRole: 'member' }, { id: 'p-2', orgRole: 'member' }, { id: 'p-3', orgRole: 'managing' }];
const projects = [{ id: 'pr-1', team: { leader: 'p-1', members: ['p-2'] } }];

test('zapis wyjazdu: walidacja, id, zmiana, usunięcie', () => {
  assert.ok(T.save([], { personIds: [], kind: 'field', from: '2026-10-10', to: '2026-10-10', place: 'Lipnica' }, people).errors.personIds);
  assert.ok(T.save([], { personIds: ['p-1'], kind: 'remote', from: '2026-10-10', to: '2026-10-10', place: 'X' }, people).errors.kind);
  assert.ok(T.save([], { personIds: ['p-1'], kind: 'field', from: '2026-10-10', to: '2026-10-09', place: 'X' }, people).errors.to);
  assert.ok(T.save([], { personIds: ['p-1'], kind: 'field', from: '2026-10-10', to: '2026-10-10', place: ' ' }, people).errors.place);
  const one = T.save([], { personIds: ['p-1', 'p-2'], kind: 'field', from: '2026-10-10', to: '2026-10-11', place: ' Lipnica ' }, people, 'p-1');
  assert.equal(one.valid, true);
  assert.equal(one.list[0].id, 't-1');
  assert.equal(one.list[0].place, 'Lipnica');
  assert.equal(one.list[0].createdBy, 'p-1');
  const two = T.save(one.list, { personIds: ['p-2'], kind: 'meeting', from: '2026-10-12', to: '2026-10-12', place: 'Urząd' }, people, 'p-3');
  assert.deepEqual(two.list.map(t => t.id), ['t-1', 't-2']);
  const ch = T.save(two.list, { id: 't-1', personIds: ['p-1'], kind: 'meeting', from: '2026-10-10', to: '2026-10-10', place: 'Biuro' }, people, 'p-3');
  assert.equal(ch.list[0].kind, 'meeting');
  assert.equal(ch.list[0].createdBy, 'p-1');
  assert.deepEqual(T.remove(ch.list, 't-1').map(t => t.id), ['t-2']);
});

test('normalizacja odrzuca śmieci, onDay filtruje po dniu i osobie', () => {
  const list = T.normalize([{ personIds: ['p-1'], from: '2026-10-09', to: '2026-10-12' }, { personIds: [], from: '2026-10-09', to: '2026-10-09' }, { bad: 1 }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'field');
  assert.equal(T.onDay(list, '2026-10-10').length, 1);
  assert.equal(T.onDay(list, '2026-10-13').length, 0);
  assert.equal(T.onDay(list, '2026-10-10', 'p-2').length, 0);
});

test('uprawnienia: sobie każdy, innym Lider i Dyrekcja', () => {
  assert.equal(T.canAddFor('p-2', 'p-2', people, projects), true);
  assert.equal(T.canAddFor('p-2', 'p-1', people, projects), false);
  assert.equal(T.canAddFor('p-1', 'p-2', people, projects), true);
  assert.equal(T.canAddFor('p-1', 'p-3', people, projects), false);
  assert.equal(T.canAddFor('p-3', 'p-2', people, projects), true);
  assert.deepEqual(T.assignable('p-2', people, projects).map(p => p.id), ['p-2']);
  assert.deepEqual(T.assignable('p-1', people, projects).map(p => p.id), ['p-1', 'p-2']);
  const trip = { createdBy: 'p-2', personIds: ['p-2'] };
  assert.equal(T.canEdit('p-2', trip, people, projects), true);
  assert.equal(T.canEdit('p-1', trip, people, projects), true);
  assert.equal(T.canEdit('p-3', trip, people, projects), true);
});
