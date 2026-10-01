'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Prefs = require('../src/core/prefs.js');

function fakeBackend(initial) {
  const data = Object.assign({}, initial);
  return {
    data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; }
  };
}

test('domyślnie motyw idzie za systemem, a lista pokazuje karty', () => {
  assert.deepEqual(Prefs.defaults(), { theme: 'system', view: 'cards', accent: 'standard' });
});

test('wariant barw przyjmuje tylko znane nazwy', () => {
  assert.equal(Prefs.normalize({ accent: 'hydro' }).accent, 'hydro');
  assert.equal(Prefs.normalize({ accent: 'topo' }).accent, 'topo');
  assert.equal(Prefs.normalize({ accent: 'neonowy' }).accent, 'standard');
});

test('normalize odrzuca nieznane wartości', () => {
  assert.deepEqual(Prefs.normalize({ theme: 'neon', view: 'kafelki' }), { theme: 'system', view: 'cards', accent: 'standard' });
  assert.deepEqual(Prefs.normalize(null), { theme: 'system', view: 'cards', accent: 'standard' });
  assert.deepEqual(Prefs.normalize({ theme: 'dark', view: 'list' }), { theme: 'dark', view: 'list', accent: 'standard' });
});

test('normalize uzupełnia brakujące pole, zachowując podane', () => {
  assert.deepEqual(Prefs.normalize({ theme: 'light' }), { theme: 'light', view: 'cards', accent: 'standard' });
  assert.deepEqual(Prefs.normalize({ view: 'list' }), { theme: 'system', view: 'list', accent: 'standard' });
});

test('zapis i odczyt przenoszą ustawienia', () => {
  const prefs = Prefs.createPrefs(fakeBackend());
  assert.equal(prefs.save({ theme: 'dark', view: 'list' }), true);
  assert.deepEqual(prefs.load(), { theme: 'dark', view: 'list', accent: 'standard' });
});

test('uszkodzony zapis ustawień nie wywraca aplikacji', () => {
  const prefs = Prefs.createPrefs(fakeBackend({ [Prefs.KEY]: 'to nie json' }));
  assert.deepEqual(prefs.load(), Prefs.defaults());
});

test('zapis ustawień nie dotyka klucza z projektami', () => {
  const backend = fakeBackend({ 'etrom.v3': '{"version":3,"projects":[]}' });
  Prefs.createPrefs(backend).save({ theme: 'light', view: 'list' });
  assert.equal(backend.data['etrom.v3'], '{"version":3,"projects":[]}');
  assert.ok(backend.data[Prefs.KEY]);
});

test('zablokowany zapis zwraca false zamiast wyjątku', () => {
  const prefs = Prefs.createPrefs({
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => {}
  });
  assert.deepEqual(prefs.load(), Prefs.defaults());
  assert.equal(prefs.save({ theme: 'dark' }), false);
});
