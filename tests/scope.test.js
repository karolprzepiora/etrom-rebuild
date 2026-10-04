'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../src/core/catalog.js');
const Model = require('../src/core/model.js');

test('zakres: pełny projekt z procedurami to wszystkie etapy poza oceną stanu', () => {
  const ids = Catalog.stagesFor('full', Catalog.defaultProcedures('full'));
  assert.equal(ids.length, Catalog.all.length - 1);
  assert.ok(!ids.includes('assessment'));
});

test('zakres: okrojony projekt to remont na zgłoszenie — wykonawcza i kosztorysy, bez postępowań', () => {
  const ids = Catalog.stagesFor('limited', Catalog.defaultProcedures('limited'));
  assert.deepEqual(ids, ['preparation', 'survey', 'technical', 'estimates', 'handover']);
});

test('zakres: procedura dokłada parę dokumentacja + postępowanie, w kolejności katalogu', () => {
  const ids = Catalog.stagesFor('limited', ['water']);
  assert.ok(ids.includes('water-docs') && ids.includes('water-process'));
  assert.deepEqual(ids, Catalog.all.map((e) => e.id).filter((id) => ids.includes(id)));
});

test('zakres: ekspertyza ma etap oceny stanu, a „inny” nic nie zaznacza', () => {
  assert.ok(Catalog.stagesFor('assessment', []).includes('assessment'));
  assert.deepEqual(Catalog.stagesFor('other', []), []);
  assert.equal(Catalog.stagesFor('nieznany', ['water']).length, 2);
});

test('zakres: walidacja przyjmuje klucz z katalogu, odrzuca obcy, pusty zeruje', () => {
  const base = { code: '2699', name: 'Test', client: 'X', status: 'planned', deadline: '' };
  assert.equal(Model.validateProject(Object.assign({}, base, { scope: 'concept' }), []).value.scope, 'concept');
  assert.equal(Model.validateProject(Object.assign({}, base, { scope: '' }), []).value.scope, null);
  const bad = Model.validateProject(Object.assign({}, base, { scope: 'xyz' }), []);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.scope);
  assert.equal(Model.createProject(Object.assign({}, base, { scope: 'limited' }), []).scope, 'limited');
});
