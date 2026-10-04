'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Library = require('../src/core/library.js');
const Catalog = require('../src/core/catalog.js');

test('biblioteka ma zadania dla etapów katalogu, a postępowania wnioski, bez uzupełnień', () => {
  Catalog.all.forEach((s) => assert.ok(Library.forStage(s.id).length >= 1, s.id));
  Catalog.all.filter((s) => s.kind === 'decision' && s.id.endsWith('-process')).forEach((s) => {
    const list = Library.forStage(s.id);
    assert.ok(list.every((x) => !x.reserve && !/uzupełnienia/i.test(x.name)));
    assert.ok(list.some((x) => /^Wniosek/.test(x.name)));
  });
  assert.ok(Library.forStage('water-docs').some((t) => t.name === 'Operat wodnoprawny'));
  // wnioski należą do postępowań, nie do dokumentacji
  Catalog.all.filter((s) => s.id.endsWith('-docs')).forEach((s) => Library.forStage(s.id).forEach((t) => assert.ok(!/^Wniosek/.test(t.name), t.name)));
  assert.ok(Library.forStage('building-process').some((t) => t.name === 'Wniosek o pozwolenie na budowę'));
  // mało zadań: nie więcej niż dwa na etap dokumentacji, trzy na postępowanie
  Catalog.all.forEach((s) => assert.ok(Library.forStage(s.id).length <= (s.id.endsWith('-process') ? 3 : 2), s.id));
  assert.deepEqual(Library.forStage('nieznany'), []);
});

test('brakujące pozycje pomijają to, co etap już ma', () => {
  const stage = { id: 'concept', tasks: [{ name: 'koncepcja techniczna' }] };
  assert.deepEqual(Library.missing({ id: 'building-docs', tasks: [{ name: 'projekt zagospodarowania terenu' }] }).map((t) => t.name), ['Projekt architektoniczno-budowlany']);
  assert.deepEqual(Library.missing(stage), []);
});

test('własna biblioteka: dodawanie, zmiana nazwy, usuwanie i przywracanie zadań etapu', () => {
  Library.configure(null);
  let lib = Library.normalize(null);
  let r = Library.addTask(lib, 'concept', 'Analiza wariantów');
  assert.equal(r.error, '');
  lib = r.library;
  Library.configure(lib);
  assert.deepEqual(Library.forStage('concept').map((t) => t.name), ['Koncepcja techniczna', 'Analiza wariantów']);
  assert.ok(Library.addTask(lib, 'concept', ' analiza wariantów ').error, 'duplikat bez względu na wielkość liter');
  assert.ok(Library.addTask(lib, 'concept', '  ').error);
  lib = Library.renameTask(lib, 'concept', 1, 'Warianty').library;
  lib = Library.removeTask(lib, 'concept', 0);
  Library.configure(lib);
  assert.deepEqual(Library.forStage('concept').map((t) => t.name), ['Warianty']);
  assert.equal(Library.isCustomized('concept'), true);
  Library.configure(Library.resetTasks(lib, 'concept'));
  assert.deepEqual(Library.forStage('concept').map((t) => t.name), ['Koncepcja techniczna']);
  Library.configure(null);
});

test('udziały etapów: standard z katalogu, zmiana jednego skaluje resztę do 100%', () => {
  Library.configure(null);
  const total = Catalog.all.reduce((t, e) => t + Library.sharePct(e.id), 0);
  assert.ok(Math.abs(total - 100) < 0.6);
  const r = Library.setShare(Library.normalize(null), 'concept', 30);
  assert.equal(r.error, '');
  Library.configure(r.library);
  assert.equal(Library.sharePct('concept'), 30);
  assert.ok(Math.abs(Catalog.all.reduce((t, e) => t + Library.sharePct(e.id), 0) - 100) < 0.6);
  assert.ok(Library.setShare(Library.normalize(null), 'concept', 0).error);
  assert.ok(Library.setShare(Library.normalize(null), 'concept', 100).error);
  const picked = Library.sharesFor(['concept', 'water-docs', 'handover']);
  assert.equal(Math.round(Object.values(picked).reduce((a, b) => a + b, 0) * 10) / 10, 100);
  Library.configure(Library.resetShares(r.library));
  assert.notEqual(Library.sharePct('concept'), 30);
  Library.configure(null);
});

test('normalizacja biblioteki odrzuca nieznane etapy i złe udziały', () => {
  const n = Library.normalize({ tasks: { nieznany: [{ name: 'x' }], concept: [{ name: 'A' }, { name: 'a' }, 5, { name: '' }] }, shares: { concept: 'x', 'water-docs': 20, land: -1 } });
  assert.deepEqual(n.tasks, { concept: [{ name: 'A' }, { name: '5' }] });
  assert.deepEqual(n.shares, { 'water-docs': 20 });
});
