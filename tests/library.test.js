'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Library = require('../src/core/library.js');
const Catalog = require('../src/core/catalog.js');

test('biblioteka ma zadania dla etapów katalogu, a postępowania mają uzupełnienia z rezerwy', () => {
  Catalog.all.forEach((s) => assert.ok(Library.forStage(s.id).length >= 1, s.id));
  Catalog.all.filter((s) => s.kind === 'decision' && s.id.endsWith('-process')).forEach((s) => {
    const list = Library.forStage(s.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].reserve, true);
  });
  assert.ok(Library.forStage('water-docs').some((t) => t.name === 'Operat wodnoprawny'));
  assert.deepEqual(Library.forStage('nieznany'), []);
});

test('brakujące pozycje pomijają to, co etap już ma', () => {
  const stage = { id: 'concept', tasks: [{ name: 'koncepcja techniczna' }] };
  assert.deepEqual(Library.missing(stage).map((t) => t.name), ['Aktualizacja koncepcji']);
});
