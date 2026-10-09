'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DT = require('../src/core/dashtiles.js');

test('puste lub zepsute ustawienia dają kafle domyślne dla roli', () => {
  assert.deepEqual(DT.resolve([], 'manager'), DT.defaults('manager'));
  assert.deepEqual(DT.resolve(null, 'worker'), DT.defaults('worker'));
  assert.deepEqual(DT.resolve(['nie-ma', 5], 'worker'), DT.defaults('worker'));
  assert.equal(DT.defaults('manager').length, 5);
});

test('kafle spoza puli roli są pomijane, kolejność zostaje, limit pięciu', () => {
  assert.deepEqual(DT.resolve(['leave', 'risk', 'today', 'leave'], 'worker'), ['leave', 'today']);
  assert.equal(DT.resolve(['risk', 'load', 'approve', 'react', 'late', 'soon', 'absent'], 'manager').length, DT.MAX);
});

test('wszystkie domyślne kafle istnieją w puli', () => {
  ['manager', 'worker'].forEach((role) => {
    const ids = DT.pool(role).map((t) => t.id);
    DT.defaults(role).forEach((id) => assert.ok(ids.includes(id), role + ':' + id));
    assert.equal(new Set(ids).size, ids.length);
  });
});

test('włączanie i wyłączanie pilnuje dolnej i górnej granicy', () => {
  let list = ['risk', 'load'];
  assert.deepEqual(DT.toggle(list, 'manager', 'load'), list, 'nie schodzi poniżej minimum');
  list = DT.toggle(list, 'manager', 'approve');
  assert.deepEqual(list, ['risk', 'load', 'approve']);
  list = DT.toggle(list, 'manager', 'risk');
  assert.deepEqual(list, ['load', 'approve']);
  const full = DT.defaults('manager');
  assert.deepEqual(DT.toggle(full, 'manager', 'absent'), full, 'nie przekracza maksimum');
  assert.deepEqual(DT.toggle(['risk', 'load'], 'manager', 'today'), ['risk', 'load'], 'obcy kafel ignorowany');
});

test('przesuwanie zmienia kolejność o jedno miejsce i nie wychodzi poza listę', () => {
  const list = ['risk', 'load', 'approve'];
  assert.deepEqual(DT.move(list, 'manager', 'load', -1), ['load', 'risk', 'approve']);
  assert.deepEqual(DT.move(list, 'manager', 'load', 1), ['risk', 'approve', 'load']);
  assert.deepEqual(DT.move(list, 'manager', 'risk', -1), list);
  assert.deepEqual(DT.move(list, 'manager', 'approve', 1), list);
});
