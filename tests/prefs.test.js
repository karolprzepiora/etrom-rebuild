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

const BASE = { theme: 'system', view: 'list', accent: 'standard', hiddenColumns: [] };
const withBase = (patch) => Object.assign({}, BASE, patch);

test('domyślnie motyw idzie za systemem, a projekty pokazują się jako lista', () => {
  assert.deepEqual(Prefs.defaults(), BASE);
});

test('wariant akcentu przyjmuje tylko znane nazwy, dawny „topo” przechodzi na grafit', () => {
  assert.equal(Prefs.normalize({ accent: 'hydro' }).accent, 'hydro');
  assert.equal(Prefs.normalize({ accent: 'graphite' }).accent, 'graphite');
  assert.equal(Prefs.normalize({ accent: 'topo' }).accent, 'graphite');
  assert.equal(Prefs.normalize({ accent: 'neonowy' }).accent, 'standard');
});

test('normalize odrzuca nieznane wartości', () => {
  assert.deepEqual(Prefs.normalize({ theme: 'neon', view: 'kafelki' }), BASE);
  assert.deepEqual(Prefs.normalize(null), BASE);
  assert.deepEqual(Prefs.normalize({ theme: 'dark', view: 'cards' }), withBase({ theme: 'dark', view: 'cards' }));
});

test('normalize uzupełnia brakujące pole, zachowując podane', () => {
  assert.deepEqual(Prefs.normalize({ theme: 'light' }), withBase({ theme: 'light' }));
  assert.deepEqual(Prefs.normalize({ view: 'cards' }), withBase({ view: 'cards' }));
});

test('ukryte kolumny: tylko znane, bez powtórzeń, w stałej kolejności', () => {
  assert.deepEqual(Prefs.normalize({ hiddenColumns: ['team', 'nieznana', 'client', 'team'] }).hiddenColumns, ['client', 'team']);
  assert.deepEqual(Prefs.normalize({ hiddenColumns: 'client' }).hiddenColumns, []);
});

test('zapis i odczyt przenoszą ustawienia', () => {
  const prefs = Prefs.createPrefs(fakeBackend());
  assert.equal(prefs.save({ theme: 'dark', view: 'cards', hiddenColumns: ['team'] }), true);
  assert.deepEqual(prefs.load(), withBase({ theme: 'dark', view: 'cards', hiddenColumns: ['team'] }));
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
