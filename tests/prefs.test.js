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

const BASE = { theme: 'system', view: 'list', accent: 'standard', hiddenColumns: [], groupBy: 'none', density: 'comfortable', taskView: 'list', detailsOpen: true, projectView: 'all', customViews: [], sidebarCollapsed: false, railCollapsed: false, collapsedRails: [], palette: 'ocean', hdr: true, tilesFull: false, colorBy: 'number', vivid: 100, contrast: 50, dayTarget: 480, dayEnd: '17:00', pinned: [], recent: [], me: null, snoozed: {}, progressMethod: 'auto', workingWeight: 50, forecastWarn: 10, forecastAlarm: 25, reservePct: 15, minProgress: 10, hourlyCost: 0 };
const withBase = (patch) => Object.assign({}, BASE, patch);

test('domyślnie motyw idzie za systemem, a projekty pokazują się jako lista', () => {
  assert.deepEqual(Prefs.defaults(), BASE);
});

test('wariant nurtu przyjmuje tylko znane nazwy, dawne nazwy przechodzą na obecne', () => {
  assert.equal(Prefs.normalize({ accent: 'raspberry' }).accent, 'standard', 'usunięta malina wraca do stali');
  assert.equal(Prefs.normalize({ accent: 'graphite' }).accent, 'graphite');
  assert.equal(Prefs.normalize({ accent: 'topo' }).accent, 'graphite');
  ['etrom', 'morski', 'lesny', 'granat'].forEach((a) => assert.equal(Prefs.normalize({ accent: a }).accent, a));
  assert.equal(Prefs.normalize({ palette: 'etrom' }).palette, 'etrom');
  assert.equal(Prefs.normalize({ accent: 'hydro' }).accent, 'standard');
  assert.equal(Prefs.normalize({ accent: 'neonowy' }).accent, 'standard');
});

test('przypięte i ostatnie: tylko dodatnie liczby całkowite, bez powtórzeń, z limitem', () => {
  const p = Prefs.normalize({ pinned: [3, 3, 'x', -1, 2.5, 7], recent: [1, 2, 3, 4, 5, 6, 7] });
  assert.deepEqual(p.pinned, [3, 7]);
  assert.deepEqual(p.recent, [1, 2, 3, 4, 5]);
});

test('touchRecent przenosi projekt na początek listy ostatnich', () => {
  const p = Prefs.touchRecent(Prefs.normalize({ recent: [1, 2, 3] }), 3);
  assert.deepEqual(p.recent, [3, 1, 2]);
});

test('grupowanie i zwinięty panel boczny', () => {
  assert.equal(Prefs.normalize({ groupBy: 'status' }).groupBy, 'status');
  assert.equal(Prefs.normalize({ groupBy: 'kolor' }).groupBy, 'none');
  assert.equal(Prefs.normalize({ sidebarCollapsed: 'tak' }).sidebarCollapsed, false);
  assert.equal(Prefs.normalize({ sidebarCollapsed: true }).sidebarCollapsed, true);
  assert.equal(Prefs.normalize({ railCollapsed: 'tak' }).railCollapsed, false);
  assert.equal(Prefs.normalize({ railCollapsed: true }).railCollapsed, true);
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

test('preferencja „ja” przyjmuje tylko identyfikator osoby', () => {
  const Prefs = require('../src/core/prefs.js');
  assert.equal(Prefs.normalize({ me: 'p-3' }).me, 'p-3');
  assert.equal(Prefs.normalize({ me: 'x' }).me, null);
  assert.equal(Prefs.normalize({ me: 7 }).me, null);
  assert.equal(Prefs.normalize({}).me, null);
  assert.equal(Prefs.defaults().me, null);
});

test('gęstość: tylko komfortowa lub zwarta', () => {
  assert.equal(Prefs.normalize({ density: 'compact' }).density, 'compact');
  assert.equal(Prefs.normalize({ density: 'x' }).density, 'comfortable');
});

test('widoki listy: wbudowane i własne, z czyszczeniem złych wartości', () => {
  assert.equal(Prefs.normalize({ projectView: 'overdue' }).projectView, 'overdue');
  assert.equal(Prefs.normalize({ projectView: 'zly' }).projectView, 'all');
  assert.equal(Prefs.normalize({ projectView: 'c-1' }).projectView, 'all', 'nieistniejący własny widok');
  const prefs = Prefs.normalize({
    projectView: 'c-2',
    customViews: [
      { id: 'c-2', name: '  Mój wodociąg  ', filters: { health: 'overdue', status: 'zly', person: 'p-3', query: 'woda' } },
      { id: 'c-2', name: 'duplikat', filters: {} },
      { id: 'x', name: 'zły id', filters: {} },
      { id: 'c-3', name: '', filters: {} }
    ]
  });
  assert.equal(prefs.projectView, 'c-2');
  assert.deepEqual(prefs.customViews, [{ id: 'c-2', name: 'Mój wodociąg', filters: { health: 'overdue', status: 'all', person: 'p-3', query: 'woda' } }]);
});

test('panel szczegółów projektu jest domyślnie otwarty', () => {
  assert.equal(Prefs.normalize({}).detailsOpen, true);
  assert.equal(Prefs.normalize({ detailsOpen: false }).detailsOpen, false);
});

test('widok zadań projektu: lista albo kanban', () => {
  assert.equal(Prefs.normalize({ taskView: 'kanban' }).taskView, 'kanban');
  assert.equal(Prefs.normalize({ taskView: 'x' }).taskView, 'list');
});

test('wygląd: paleta tylko ze znanych, HDR domyślnie włączony, intensywność i kontrast w zakresie', () => {
  assert.equal(Prefs.normalize({ palette: 'forest' }).palette, 'forest');
  assert.equal(Prefs.normalize({ palette: 'neon' }).palette, 'ocean');
  assert.equal(Prefs.normalize({}).hdr, true);
  assert.equal(Prefs.normalize({ hdr: false }).hdr, false);
  assert.equal(Prefs.normalize({ hdr: 'nie' }).hdr, true);
  assert.equal(Prefs.normalize({ vivid: 500 }).vivid, 150);
  assert.equal(Prefs.normalize({ vivid: 3 }).vivid, 40);
  assert.equal(Prefs.normalize({ vivid: 'x' }).vivid, 100);
  assert.equal(Prefs.normalize({ vivid: 87.6 }).vivid, 88);
  assert.equal(Prefs.normalize({ contrast: -5 }).contrast, 0);
  assert.equal(Prefs.normalize({ contrast: 130 }).contrast, 100);
  assert.equal(Prefs.normalize({ contrast: 70 }).contrast, 70);
});

test('cel dnia i koniec dnia pracy: granice i format', () => {
  assert.equal(Prefs.normalize({}).dayTarget, 480);
  assert.equal(Prefs.normalize({ dayTarget: 30 }).dayTarget, 120);
  assert.equal(Prefs.normalize({ dayTarget: 5000 }).dayTarget, 720);
  assert.equal(Prefs.normalize({ dayTarget: 450 }).dayTarget, 450);
  assert.equal(Prefs.normalize({}).dayEnd, '17:00');
  assert.equal(Prefs.normalize({ dayEnd: '18:30' }).dayEnd, '18:30');
  assert.equal(Prefs.normalize({ dayEnd: '25:00' }).dayEnd, '17:00');
  assert.equal(Prefs.normalize({ dayEnd: 'koniec' }).dayEnd, '17:00');
});

test('collapsedRails: tylko poprawne, niepowtarzalne identyfikatory paneli', () => {
  assert.deepEqual(Prefs.normalize({ collapsedRails: ['mywork', 'mywork', 'time', 5, 'Zły Id!'] }).collapsedRails, ['mywork', 'time']);
  assert.deepEqual(Prefs.normalize({ collapsedRails: 'x' }).collapsedRails, []);
});

test('tilesFull: domyślnie spokojne kafle, tylko true włącza pełny kolor', () => {
  assert.equal(Prefs.normalize({}).tilesFull, false);
  assert.equal(Prefs.normalize({ tilesFull: 'tak' }).tilesFull, false);
  assert.equal(Prefs.normalize({ tilesFull: true }).tilesFull, true);
});

test('colorBy: zawsze według numeru (barwy rozstawione po kole), także gdy zapis ma starą wartość „kind”', () => {
  assert.equal(Prefs.normalize({}).colorBy, 'number');
  assert.equal(Prefs.normalize({ colorBy: 'xyz' }).colorBy, 'number');
  assert.equal(Prefs.normalize({ colorBy: 'kind' }).colorBy, 'number');
});
