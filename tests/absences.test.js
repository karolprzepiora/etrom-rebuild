'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/core/absences.js');

const people = [{ id: 'p-1' }, { id: 'p-2' }];

test('zapis nieobecności: walidacja, nadawanie id, zmiana i usuwanie', () => {
  assert.equal(A.save([], { personId: 'p-9', from: '2026-10-05', to: '2026-10-06', kind: 'leave' }, people).errors.personId, 'Wybierz osobę.');
  assert.ok(A.save([], { personId: 'p-1', from: '2026-10-06', to: '2026-10-05', kind: 'leave' }, people).errors.to);
  assert.ok(A.save([], { personId: 'p-1', from: '2026-10-05', to: '2026-10-06', kind: 'wakacje' }, people).errors.kind);
  const one = A.save([], { personId: 'p-1', from: '2026-10-05', to: '2026-10-09', kind: 'leave', note: ' Wyjazd ' }, people);
  assert.equal(one.valid, true);
  assert.equal(one.list[0].id, 'a-1');
  assert.equal(one.list[0].note, 'Wyjazd');
  const two = A.save(one.list, { personId: 'p-2', from: '2026-10-12', to: '2026-10-12', kind: 'training' }, people);
  assert.deepEqual(two.list.map(a => a.id), ['a-1', 'a-2']);
  const changed = A.save(two.list, { id: 'a-1', personId: 'p-1', from: '2026-10-05', to: '2026-10-07', kind: 'sick' }, people);
  assert.equal(changed.list[0].kind, 'sick');
  assert.deepEqual(A.remove(changed.list, 'a-1').map(a => a.id), ['a-2']);
});

test('dni nieobecności osoby to dni robocze zakresu (weekendy pomijane)', () => {
  const list = A.normalize([{ id: 'a-1', personId: 'p-1', from: '2026-10-08', to: '2026-10-13', kind: 'leave' }, { personId: 'p-2', from: '2026-10-08', to: '2026-10-08' }, { bad: true }]);
  assert.equal(list.length, 2);
  assert.deepEqual(Object.keys(A.daysOf(list, 'p-1')), ['2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13']);
  assert.deepEqual(Object.keys(A.daysOf(list, 'p-2')), ['2026-10-08']);
});
