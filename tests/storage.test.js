'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../src/core/storage.js');

function fakeBackend(initial) {
  const data = Object.assign({}, initial);
  return {
    data: data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; }
  };
}

test('load na czystym urządzeniu zwraca pusty zbiór bez ostrzeżenia', () => {
  const storage = Storage.createStorage(fakeBackend());
  const result = storage.load();
  assert.equal(storage.available, true);
  assert.deepEqual(result.workspace.projects, []);
  assert.equal(result.warning, '');
  assert.equal(result.importedFromLegacy, false);
});

test('save i load przenoszą dane w obie strony', () => {
  const backend = fakeBackend();
  const storage = Storage.createStorage(backend);
  const workspace = {
    version: 3,
    projects: [{
      id: 1, code: 'W-1', name: 'Przepust', client: 'Gmina',
      status: 'active', deadline: '2026-06-20',
      stages: [{ id: 'concept', status: 'done', hours: 80, deadline: '' }]
    }]
  };
  assert.equal(storage.save(workspace).ok, true);
  const loaded = storage.load();
  assert.equal(loaded.workspace.projects.length, 1);
  assert.equal(loaded.workspace.projects[0].code, 'W-1');
  assert.equal(loaded.workspace.projects[0].stages[0].status, 'done');
});

test('uszkodzony zapis nie wywraca aplikacji i ostrzega użytkownika', () => {
  const storage = Storage.createStorage(fakeBackend({ [Storage.KEY]: '{to nie jest json' }));
  const result = storage.load();
  assert.deepEqual(result.workspace.projects, []);
  assert.match(result.warning, /nie udało się odczytać/i);
});

test('uszkodzony zapis nie zostaje nadpisany przez samo wczytanie', () => {
  const backend = fakeBackend({ [Storage.KEY]: '{zepsute' });
  const storage = Storage.createStorage(backend);
  storage.load();
  assert.equal(backend.data[Storage.KEY], '{zepsute');
});

test('zablokowany zapis zwraca ostrzeżenie zamiast wyjątku', () => {
  const storage = Storage.createStorage({
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => {}
  });
  const loaded = storage.load();
  assert.deepEqual(loaded.workspace.projects, []);
  const saved = storage.save({ version: 3, projects: [] });
  assert.equal(saved.ok, false);
  assert.match(saved.warning, /nie udało się zapisać/i);
});

test('brak localStorage daje jasny komunikat', (t) => {
  if (typeof localStorage !== 'undefined') return t.skip('to środowisko ma localStorage');
  const storage = Storage.createStorage(null);
  assert.equal(storage.available, false);
  const result = storage.load();
  assert.match(result.warning, /niedostępny/i);
  assert.equal(storage.save({ version: 3, projects: [] }).ok, false);
});

test('clear usuwa tylko klucz nowej wersji', () => {
  const backend = fakeBackend({ [Storage.KEY]: '{"version":3,"projects":[]}', [Storage.LEGACY_KEY]: '{}' });
  const storage = Storage.createStorage(backend);
  assert.equal(storage.clear(), true);
  assert.equal(backend.data[Storage.KEY], undefined);
  assert.equal(backend.data[Storage.LEGACY_KEY], '{}');
});

/* ---------- import ze starego ETROM ---------- */

const LEGACY = {
  version: 2,
  projects: [{
    id: 4,
    code: 'STARY-1',
    name: 'Regulacja Białki',
    client: 'Wody Polskie',
    status: 'active',
    procedures: [
      {
        id: 1, name: 'Etap I', contract: 'U/1', date: '2026-08-01',
        stages: [
          { id: 'concept', hours: 40, date: '2026-05-01', approval: { by: 'Anna', at: '2026-05-02T10:00:00Z' } },
          { id: 'water-docs', hours: 60, date: '2026-06-01', approval: null }
        ]
      },
      {
        id: 2, name: 'Etap II', contract: 'U/2', date: '2026-07-01',
        stages: [
          { id: 'concept', hours: 10, date: '2026-05-10', approval: null },
          { id: 'nieistniejacy', hours: 10, date: '2026-05-10', approval: null },
          { id: 'handover', hours: 0, date: 'brak', approval: null }
        ]
      }
    ]
  }]
};

test('legacyToWorkspace przenosi projekt i zatwierdzone etapy', () => {
  const result = Storage.legacyToWorkspace(LEGACY);
  assert.equal(result.projects.length, 1);
  const project = result.projects[0];
  assert.equal(project.code, 'STARY-1');
  assert.equal(project.status, 'active');
  assert.equal(project.stages[0].status, 'done', 'etap z approval staje się zakończony');
  assert.equal(project.stages[1].status, 'todo');
});

test('legacyToWorkspace scala etapy z wielu procedur bez powtórzeń', () => {
  const stages = Storage.legacyToWorkspace(LEGACY).projects[0].stages;
  const ids = stages.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('nieistniejacy'), 'etapy poza katalogiem są pomijane');
  assert.deepEqual(ids.sort(), ['concept', 'handover', 'water-docs']);
});

test('legacyToWorkspace naprawia godziny i daty poza formatem', () => {
  const stages = Storage.legacyToWorkspace(LEGACY).projects[0].stages;
  const handover = stages.filter((s) => s.id === 'handover')[0];
  assert.equal(handover.hours, 24, 'zero godzin wraca do wartości z katalogu');
  assert.equal(handover.deadline, '', 'niepoprawna data zostaje wyczyszczona');
});

test('legacyToWorkspace bierze najbliższy termin z procedur', () => {
  assert.equal(Storage.legacyToWorkspace(LEGACY).projects[0].deadline, '2026-07-01');
});

test('legacyToWorkspace znosi śmieci na wejściu', () => {
  assert.deepEqual(Storage.legacyToWorkspace(null).projects, []);
  assert.deepEqual(Storage.legacyToWorkspace({ projects: [null, 'x'] }).projects, []);
});

test('load importuje stary zapis, gdy nowego jeszcze nie ma', () => {
  const backend = fakeBackend({ [Storage.LEGACY_KEY]: JSON.stringify(LEGACY) });
  const result = Storage.createStorage(backend).load();
  assert.equal(result.importedFromLegacy, true);
  assert.equal(result.workspace.projects.length, 1);
  assert.ok(backend.data[Storage.LEGACY_KEY], 'stary zapis pozostaje nietknięty');
});

test('nowy zapis ma pierwszeństwo nad starym', () => {
  const backend = fakeBackend({
    [Storage.KEY]: JSON.stringify({ version: 3, projects: [{ id: 1, code: 'NOWY', name: 'Nowy', client: 'K', stages: [] }] }),
    [Storage.LEGACY_KEY]: JSON.stringify(LEGACY)
  });
  const result = Storage.createStorage(backend).load();
  assert.equal(result.importedFromLegacy, false);
  assert.equal(result.workspace.projects[0].code, 'NOWY');
});
