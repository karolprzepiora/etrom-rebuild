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

test('numery projektów RRNN sortują się liczbowo, a kierunek można odwrócić', () => {
  const list = [project('2610', 'J', 'K', 'active', ''), project('2602', 'B', 'K', 'active', ''), project('2601', 'A', 'K', 'done', ''), project('2509', 'Z', 'K', 'active', '')];
  assert.deepEqual(Query.filterAndSort(list, { sort: 'code' }).map((p) => p.code), ['2509', '2601', '2602', '2610']);
  assert.deepEqual(Query.filterAndSort(list, { sort: 'code', dir: 'desc' }).map((p) => p.code), ['2610', '2602', '2601', '2509']);
  assert.deepEqual(Query.filterAndSort(list, {}).map((p) => p.code), ['2509', '2601', '2602', '2610'], 'domyślnie po numerze, zakończone bez wyróżnienia');
});

test('nieznane sortowanie wraca do sortowania po numerze', () => {
  assert.deepEqual(
    Query.filterAndSort(SET, { sort: 'nie-ma' }).map((p) => p.code),
    Query.filterAndSort(SET, { sort: 'code' }).map((p) => p.code)
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

/* ---------- filtry z przeglądu portfela ---------- */

test('filtr stanu: „wymaga uwagi” to alarm i ostrzeżenie, pozostałe dokładnie', () => {
  const NOW_Q = new Date(2026, 9, 2, 12, 0);
  const projects = [
    { id: 1, code: 'A', name: 'Po terminie', status: 'active', deadline: '2026-09-20', stages: [], team: {} },
    { id: 2, code: 'B', name: 'W normie', status: 'active', deadline: '2026-12-31', stages: [], team: {} },
    { id: 3, code: 'C', name: 'Zamknięty', status: 'done', deadline: '2026-01-01', stages: [], team: {} }
  ];
  const codes = (health) => Query.filterAndSort(projects, { health, now: NOW_Q }).map((p) => p.code).join(',');
  assert.equal(codes('attention'), 'A');
  assert.equal(codes('alarm'), 'A');
  assert.equal(codes('normal'), 'B');
  assert.equal(codes('closed'), 'C');
  assert.equal(codes('all'), 'A,B,C');
  assert.equal(codes('wymyślony'), 'A,B,C', 'nieznana wartość nie filtruje');
});

test('filtr terminów: projekty z terminem umowy lub najbliższego zadania etapu w oknie dni', () => {
  const NOW_Q = new Date(2026, 9, 2, 12, 0);
  const projects = [
    { id: 1, code: 'A', name: 'Umowa za 10 dni', status: 'active', deadline: '2026-10-12', stages: [], team: {} },
    { id: 2, code: 'B', name: 'Etap za 20 dni', status: 'active', deadline: '2027-06-01', stages: [{ id: 'preparation', status: 'todo', hours: 1, tasks: [{ id: 't-1', name: 'Z', status: 'todo', deadline: '2026-10-22T10:00' }] }], team: {} },
    { id: 3, code: 'C', name: 'Etap zakończony', status: 'active', deadline: '2027-06-01', stages: [{ id: 'preparation', status: 'done', hours: 1, tasks: [{ id: 't-1', name: 'Z', status: 'done', deadline: '2026-10-05T10:00' }] }], team: {} },
    { id: 4, code: 'D', name: 'Daleko', status: 'active', deadline: '2027-06-01', stages: [], team: {} }
  ];
  const codes = (horizon) => Query.filterAndSort(projects, { horizon, now: NOW_Q, sort: 'code' }).map((p) => p.code).join(',');
  assert.equal(codes(14), 'A');
  assert.equal(codes(30), 'A,B');
  assert.equal(codes(0), 'A,B,C,D');
});

test('sortowanie „manual”: priorytet rosnąco, bez numeru po numerowanych, zakończone na końcu', () => {
  const Query = require('../src/core/query.js');
  const list = [
    { id: 1, code: '2601', name: 'A', status: 'active', priority: 0 },
    { id: 2, code: '2602', name: 'B', status: 'active', priority: 2 },
    { id: 3, code: '2603', name: 'C', status: 'done', priority: 1 },
    { id: 4, code: '2604', name: 'D', status: 'active', priority: 1 }
  ];
  assert.deepEqual(Query.filterAndSort(list, { sort: 'manual' }).map((p) => p.code), ['2604', '2602', '2601', '2603']);
});
