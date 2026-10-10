'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Team = require('../src/core/team.js');

function person(id, first, last, extra) {
  return Object.assign({ id, firstName: first, lastName: last, orgRole: 'member', cooperation: 'internal', active: true }, extra || {});
}

const PEOPLE = [
  person('p-1', 'Anna', 'Testowa', { orgRole: 'managing' }),
  person('p-2', 'Michał', 'Testowy'),
  person('p-3', 'Ewa', 'Testowa')
];

test('validatePerson wymaga imienia i nazwiska', () => {
  const result = Team.validatePerson({}, []);
  assert.equal(result.valid, false);
  assert.ok(result.errors.firstName);
  assert.ok(result.errors.lastName);
});

test('validatePerson przycina spacje i uzupełnia domyślne role', () => {
  const result = Team.validatePerson({ firstName: '  Anna ', lastName: ' Testowa ' }, []);
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    firstName: 'Anna', lastName: 'Testowa', position: '',
    orgRole: 'member', cooperation: 'internal', hourlyCost: 0, email: '', leaveDays: null, hiredAt: '', leaveCarry: null
  });
});

test('validatePerson blokuje drugą osobę o tym samym imieniu i nazwisku', () => {
  const result = Team.validatePerson({ firstName: 'anna', lastName: 'TESTOWA' }, PEOPLE);
  assert.equal(result.valid, false);
  assert.match(result.errors.lastName, /już jest/i);
});

test('validatePerson pozwala zachować własne nazwisko przy edycji', () => {
  const result = Team.validatePerson({ firstName: 'Anna', lastName: 'Testowa' }, PEOPLE, 'p-1');
  assert.equal(result.valid, true);
});

test('validatePerson odrzuca nieznaną rolę i formę współpracy', () => {
  const result = Team.validatePerson(
    { firstName: 'A', lastName: 'B', orgRole: 'król', cooperation: 'barter' }, []
  );
  assert.ok(result.errors.orgRole);
  assert.ok(result.errors.cooperation);
});

test('identyfikatory osób nie powtarzają się', () => {
  assert.equal(Team.nextPersonId([]), 'p-1');
  assert.equal(Team.nextPersonId(PEOPLE), 'p-4');
  const created = Team.createPerson({ firstName: 'Olga', lastName: 'Nowa' }, PEOPLE);
  assert.equal(created.id, 'p-4');
  assert.equal(created.active, true);
});

test('createPerson odmawia przy niepoprawnych danych', () => {
  assert.throws(() => Team.createPerson({ firstName: '', lastName: '' }, []));
});

test('normalizePeople pomija uszkodzone wpisy i duplikaty identyfikatorów', () => {
  const people = Team.normalizePeople([
    { id: 'p-1', firstName: 'Anna', lastName: 'Testowa' },
    { id: 'p-1', firstName: 'Podszywacz', lastName: 'X' },
    { id: '', firstName: 'Bez', lastName: 'Id' },
    { id: 'p-2', firstName: '', lastName: '' },
    null
  ]);
  assert.deepEqual(people.map((p) => p.id), ['p-1']);
  assert.equal(people[0].firstName, 'Anna');
});

test('normalizePeople naprawia nieznane role i zachowuje wyłączenie', () => {
  const people = Team.normalizePeople([
    { id: 'p-1', firstName: 'A', lastName: 'B', orgRole: 'król', cooperation: 'barter', active: false }
  ]);
  assert.equal(people[0].orgRole, 'member');
  assert.equal(people[0].cooperation, 'internal');
  assert.equal(people[0].active, false);
});

/* ---------- funkcje w projekcie ---------- */

test('normalizeTeam zostawia tylko osoby z katalogu', () => {
  const team = Team.normalizeTeam(
    { leader: 'p-1', coordinator: 'p-nieznany', members: ['p-2', 'p-brak'] }, PEOPLE
  );
  assert.equal(team.leader, 'p-1');
  assert.equal(team.coordinator, '');
  assert.deepEqual(team.members, ['p-2']);
});

test('normalizeTeam nie dubluje osoby pełniącej już funkcję', () => {
  const team = Team.normalizeTeam({ leader: 'p-1', members: ['p-1', 'p-2', 'p-2'] }, PEOPLE);
  assert.deepEqual(team.members, ['p-2'], 'lider nie jest dodatkowo członkiem, a członek nie powtarza się');
});

test('normalizeTeam znosi brak danych', () => {
  assert.deepEqual(Team.normalizeTeam(null, PEOPLE), Team.emptyTeam());
  assert.deepEqual(Team.normalizeTeam({ members: 'nie tablica' }, PEOPLE), Team.emptyTeam());
});

test('dwa pełnomocnictwa są niezależnymi slotami', () => {
  const team = Team.normalizeTeam({ proxyLead: 'p-2', proxyExtra: 'p-3' }, PEOPLE);
  assert.equal(team.proxyLead, 'p-2');
  assert.equal(team.proxyExtra, 'p-3');
});

test('projectPeople zbiera wszystkich bez powtórzeń', () => {
  const team = Team.normalizeTeam(
    { leader: 'p-1', coordinator: 'p-2', proxyLead: 'p-1', members: ['p-3'] }, PEOPLE
  );
  assert.deepEqual(Team.projectPeople(team), ['p-1', 'p-2', 'p-3']);
});

test('functionsOf wymienia wszystkie funkcje osoby w projekcie', () => {
  const team = Team.normalizeTeam({ leader: 'p-1', proxyLead: 'p-1', members: ['p-2'] }, PEOPLE);
  assert.deepEqual(Team.functionsOf('p-1', team).map((f) => f.key), ['leader', 'proxyLead']);
  assert.deepEqual(Team.functionsOf('p-2', team).map((f) => f.key), ['member']);
  assert.deepEqual(Team.functionsOf('p-3', team), []);
});

/* ---------- wyłączanie osoby ---------- */

const PROJECTS = [
  { id: 1, code: 'W-1', status: 'active', team: Team.normalizeTeam({ leader: 'p-1' }, PEOPLE) },
  { id: 2, code: 'W-2', status: 'done', team: Team.normalizeTeam({ members: ['p-2'] }, PEOPLE) }
];

test('osoby z funkcją w czynnym projekcie nie da się wyłączyć', () => {
  const check = Team.canDeactivate('p-1', PROJECTS);
  assert.equal(check.allowed, false);
  assert.match(check.reason, /W-1/);
  assert.equal(check.projects.length, 1);
});

test('funkcja w zakończonym projekcie nie blokuje wyłączenia', () => {
  assert.equal(Team.canDeactivate('p-2', PROJECTS).allowed, true);
});

test('osoba bez przypisań daje się wyłączyć', () => {
  assert.equal(Team.canDeactivate('p-3', PROJECTS).allowed, true);
  assert.equal(Team.canDeactivate('p-3', []).allowed, true);
});

test('projectsOfPerson znajduje projekty osoby', () => {
  assert.deepEqual(Team.projectsOfPerson(PROJECTS, 'p-1').map((p) => p.code), ['W-1']);
  assert.deepEqual(Team.projectsOfPerson(PROJECTS, 'p-3'), []);
});

test('releasePerson zdejmuje osobę ze wszystkich funkcji', () => {
  const team = Team.normalizeTeam(
    { leader: 'p-1', coordinator: 'p-2', proxyLead: 'p-1', members: ['p-3'] }, PEOPLE
  );
  const after = Team.releasePerson(team, 'p-1');
  assert.equal(after.leader, '');
  assert.equal(after.proxyLead, '');
  assert.equal(after.coordinator, 'p-2', 'pozostałe funkcje zostają nietknięte');
  assert.deepEqual(after.members, ['p-3']);
});

test('fullName składa imię i nazwisko bez zbędnych spacji', () => {
  assert.equal(Team.fullName({ firstName: ' Anna ', lastName: 'Testowa' }), 'Anna Testowa');
  assert.equal(Team.fullName({ firstName: 'Anna', lastName: '' }), 'Anna');
  assert.equal(Team.fullName(null), '');
});

test('findPerson zwraca osobę albo null', () => {
  assert.equal(Team.findPerson(PEOPLE, 'p-2').firstName, 'Michał');
  assert.equal(Team.findPerson(PEOPLE, 'p-99'), null);
  assert.equal(Team.findPerson(null, 'p-1'), null);
});
