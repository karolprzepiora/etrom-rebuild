'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Query = require('../src/core/query.js');

function project(code, name, client, status, deadline, stages) {
  return {
    id: code.length,
    code: code,
    name: name,
    client: client,
    status: status || 'active',
    deadline: deadline || '',
    stages: stages || []
  };
}

const SET = [
  project('W-2', 'Zbiornik Dąbrowa', 'Starostwo', 'planned', '2026-09-01'),
  project('W-1', 'Przepust Lipnica', 'Gmina Lipnica', 'active', '2026-06-20'),
  project('W-3', 'Łąki Zarzecze', 'Urząd Miasta', 'done', ''),
  project('W-4', 'Stacja pomp', 'Spółka Wodna', 'paused', '2026-07-05')
];

test('filterAndSort nie zmienia tablicy wejściowej', () => {
  const input = SET.slice();
  const order = input.map((p) => p.code);
  Query.filterAndSort(input, { sort: 'name' });
  assert.deepEqual(input.map((p) => p.code), order);
});

test('filtrowanie po statusie', () => {
  const result = Query.filterAndSort(SET, { status: 'active' });
  assert.deepEqual(result.map((p) => p.code), ['W-1']);
  assert.equal(Query.filterAndSort(SET, { status: 'all' }).length, 4);
});

test('szukanie obejmuje kod, nazwę i zamawiającego', () => {
  assert.deepEqual(Query.filterAndSort(SET, { query: 'w-3' }).map((p) => p.code), ['W-3']);
  assert.deepEqual(Query.filterAndSort(SET, { query: 'przepust' }).map((p) => p.code), ['W-1']);
  assert.deepEqual(Query.filterAndSort(SET, { query: 'starostwo' }).map((p) => p.code), ['W-2']);
});

test('szukanie nie zważa na wielkość liter, także polskich', () => {
  assert.deepEqual(Query.filterAndSort(SET, { query: 'ŁĄKI' }).map((p) => p.code), ['W-3']);
  assert.deepEqual(Query.filterAndSort(SET, { query: 'dąbrowa' }).map((p) => p.code), ['W-2']);
});

test('szukanie z pustym zapytaniem zwraca wszystko', () => {
  assert.equal(Query.filterAndSort(SET, { query: '   ' }).length, 4);
});

test('filtry łączą się ze sobą', () => {
  assert.equal(Query.filterAndSort(SET, { status: 'done', query: 'przepust' }).length, 0);
  assert.equal(Query.filterAndSort(SET, { status: 'done', query: 'łąki' }).length, 1);
});

test('sortowanie po terminie stawia projekty bez terminu na końcu', () => {
  const result = Query.filterAndSort(SET, { sort: 'deadline' });
  assert.deepEqual(result.map((p) => p.code), ['W-1', 'W-4', 'W-2', 'W-3']);
});

test('sortowanie po terminie odsuwa projekty zakończone na koniec', () => {
  const list = [
    project('Z', 'Zamknięty dawno', 'K', 'done', '2026-01-01'),
    project('A', 'Czynny po terminie', 'K', 'active', '2026-06-10'),
    project('B', 'Czynny w planie', 'K', 'planned', '2026-12-01')
  ];
  assert.deepEqual(
    Query.filterAndSort(list, { sort: 'deadline' }).map((p) => p.code),
    ['A', 'B', 'Z'],
    'zakończony projekt nie zajmuje czoła listy terminowej'
  );
});

test('sortowanie po nazwie i kodzie', () => {
  assert.deepEqual(
    Query.filterAndSort(SET, { sort: 'name' }).map((p) => p.name),
    ['Łąki Zarzecze', 'Przepust Lipnica', 'Stacja pomp', 'Zbiornik Dąbrowa']
  );
  assert.deepEqual(
    Query.filterAndSort(SET, { sort: 'code' }).map((p) => p.code),
    ['W-1', 'W-2', 'W-3', 'W-4']
  );
});

test('sortowanie po postępie — najpierw najbardziej zaawansowane', () => {
  const list = [
    project('A', 'A', 'K', 'active', '', [{ status: 'todo', hours: 10 }]),
    project('B', 'B', 'K', 'active', '', [{ status: 'done', hours: 10 }]),
    project('C', 'C', 'K', 'active', '', [{ status: 'done', hours: 5 }, { status: 'todo', hours: 5 }])
  ];
  assert.deepEqual(Query.filterAndSort(list, { sort: 'progress' }).map((p) => p.code), ['B', 'C', 'A']);
});

test('nieznane sortowanie wraca do sortowania po terminie', () => {
  assert.deepEqual(
    Query.filterAndSort(SET, { sort: 'nie-ma' }).map((p) => p.code),
    Query.filterAndSort(SET, { sort: 'deadline' }).map((p) => p.code)
  );
});

test('filterAndSort znosi brak argumentów', () => {
  assert.deepEqual(Query.filterAndSort(null, null), []);
  assert.equal(Query.filterAndSort(SET).length, 4);
});

/* ---------- filtr po osobie ---------- */

const Team = require('../src/core/team.js');

function withTeam(code, team) {
  return { id: code.length, code, name: code, client: 'K', status: 'active', deadline: '', stages: [], team };
}

const PEOPLE = [
  { id: 'p-1', firstName: 'Anna', lastName: 'Testowa', orgRole: 'member', cooperation: 'internal', active: true },
  { id: 'p-2', firstName: 'Michał', lastName: 'Testowy', orgRole: 'member', cooperation: 'internal', active: true }
];

const WITH_TEAMS = [
  withTeam('T-1', Team.normalizeTeam({ leader: 'p-1' }, PEOPLE)),
  withTeam('T-2', Team.normalizeTeam({ members: ['p-2'] }, PEOPLE)),
  withTeam('T-3', Team.normalizeTeam({}, PEOPLE))
];

test('filtr osoby pokazuje projekty, w których ta osoba cokolwiek pełni', () => {
  assert.deepEqual(Query.filterAndSort(WITH_TEAMS, { person: 'p-1' }).map((p) => p.code), ['T-1']);
  assert.deepEqual(Query.filterAndSort(WITH_TEAMS, { person: 'p-2' }).map((p) => p.code), ['T-2']);
  assert.deepEqual(Query.filterAndSort(WITH_TEAMS, { person: 'p-9' }), []);
});

test('filtr osoby ustawiony na „wszyscy” niczego nie odcina', () => {
  assert.equal(Query.filterAndSort(WITH_TEAMS, { person: 'all' }).length, 3);
  assert.equal(Query.filterAndSort(WITH_TEAMS, {}).length, 3);
});

test('filtr osoby łączy się z filtrem statusu', () => {
  const mixed = WITH_TEAMS.concat([
    Object.assign(withTeam('T-4', Team.normalizeTeam({ leader: 'p-1' }, PEOPLE)), { status: 'done' })
  ]);
  assert.deepEqual(
    Query.filterAndSort(mixed, { person: 'p-1', status: 'done' }).map((p) => p.code),
    ['T-4']
  );
});
