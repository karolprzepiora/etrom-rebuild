'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/core/model.js');

test('isDate odrzuca nieistniejące daty', () => {
  assert.equal(Model.isDate('2026-02-28'), true);
  assert.equal(Model.isDate('2026-02-30'), false);
  assert.equal(Model.isDate('2026-13-01'), false);
  assert.equal(Model.isDate('26-01-01'), false);
  assert.equal(Model.isDate(''), false);
  assert.equal(Model.isDate(null), false);
});

test('validateProject wymaga kodu, nazwy i zamawiającego', () => {
  const result = Model.validateProject({}, []);
  assert.equal(result.valid, false);
  assert.ok(result.errors.code);
  assert.ok(result.errors.name);
  assert.ok(result.errors.client);
});

test('validateProject przycina spacje i przyjmuje poprawne dane', () => {
  const result = Model.validateProject(
    { code: '  W-1 ', name: ' Przepust ', client: ' Gmina ', status: 'active' },
    []
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    code: 'W-1', name: 'Przepust', client: 'Gmina', status: 'active', deadline: ''
  });
});

test('validateProject blokuje powtórzony kod niezależnie od wielkości liter', () => {
  const existing = [{ id: 1, code: 'W-1' }];
  const result = Model.validateProject({ code: 'w-1', name: 'X', client: 'Y' }, existing);
  assert.equal(result.valid, false);
  assert.ok(result.errors.code);
});

test('validateProject pozwala zachować własny kod przy edycji', () => {
  const existing = [{ id: 7, code: 'W-1' }];
  const result = Model.validateProject({ code: 'W-1', name: 'X', client: 'Y' }, existing, 7);
  assert.equal(result.valid, true);
});

test('validateProject odrzuca błędny termin i nieznany status', () => {
  const bad = Model.validateProject({ code: 'A', name: 'B', client: 'C', deadline: '2026-02-30' }, []);
  assert.ok(bad.errors.deadline);
  const status = Model.validateProject({ code: 'A', name: 'B', client: 'C', status: 'xyz' }, []);
  assert.ok(status.errors.status);
});

test('nextProjectId zwraca kolejny wolny numer', () => {
  assert.equal(Model.nextProjectId([]), 1);
  assert.equal(Model.nextProjectId([{ id: 1 }, { id: 4 }]), 5);
  assert.equal(Model.nextProjectId([{ id: 'x' }]), 1);
});

test('createProject nadaje identyfikator i kopiuje etapy', () => {
  const projects = [];
  const project = Model.createProject(
    { code: 'W-1', name: 'Przepust', client: 'Gmina', stages: [Model.createStage('concept')] },
    projects
  );
  assert.equal(project.id, 1);
  assert.equal(project.stages.length, 1);
  assert.equal(project.status, 'planned');
  assert.ok(project.createdAt);
});

test('createProject odmawia przy niepoprawnych danych', () => {
  assert.throws(() => Model.createProject({ code: '', name: '', client: '' }, []));
});

test('createStage korzysta z katalogu i pilnuje godzin', () => {
  assert.throws(() => Model.createStage('nie-ma-takiego'));
  const base = Model.createStage('concept');
  assert.equal(base.status, 'todo');
  assert.equal(base.hours, 80);
  assert.equal(Model.createStage('concept', { hours: 12 }).hours, 12);
  assert.equal(Model.createStage('concept', { hours: -5 }).hours, 80, 'ujemne godziny wracają do domyślnych');
  assert.equal(Model.createStage('concept', { deadline: 'zła' }).deadline, '');
});

test('cycleStageStatus przechodzi todo → working → done → todo', () => {
  assert.equal(Model.cycleStageStatus('todo'), 'working');
  assert.equal(Model.cycleStageStatus('working'), 'done');
  assert.equal(Model.cycleStageStatus('done'), 'todo');
  assert.equal(Model.cycleStageStatus('nieznany'), 'todo');
});

test('normalizeWorkspace pomija uszkodzone wpisy i duplikaty kodów', () => {
  const result = Model.normalizeWorkspace({
    projects: [
      { id: 1, code: 'W-1', name: 'A', client: 'K', status: 'active' },
      { id: 2, code: 'w-1', name: 'Duplikat', client: 'K' },
      { id: 3, code: '', name: 'Bez kodu', client: 'K' },
      null,
      'tekst'
    ]
  });
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].code, 'W-1');
  assert.equal(result.version, Model.WORKSPACE_VERSION);
});

test('normalizeWorkspace nadaje brakujące identyfikatory bez kolizji', () => {
  const result = Model.normalizeWorkspace({
    projects: [
      { code: 'A', name: 'A' },
      { id: 5, code: 'B', name: 'B' },
      { code: 'C', name: 'C' }
    ]
  });
  const ids = result.projects.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'identyfikatory są niepowtarzalne');
  assert.ok(ids.every((id) => Number.isSafeInteger(id) && id > 0));
});

test('normalizeWorkspace czyści etapy: nieznane, powtórzone i złe godziny', () => {
  const result = Model.normalizeWorkspace({
    projects: [{
      id: 1, code: 'W-1', name: 'A', client: 'K',
      stages: [
        { id: 'concept', status: 'done', hours: 10 },
        { id: 'concept', status: 'todo', hours: 10 },
        { id: 'wymyslony', status: 'todo', hours: 10 },
        { id: 'handover', status: 'nieznany', hours: 0 }
      ]
    }]
  });
  const stages = result.projects[0].stages;
  assert.equal(stages.length, 2);
  assert.equal(stages[0].id, 'concept');
  assert.equal(stages[0].status, 'done');
  assert.equal(stages[1].status, 'todo', 'nieznany status wraca do todo');
  assert.equal(stages[1].hours, 24, 'zerowe godziny wracają do domyślnych z katalogu');
});

test('normalizeWorkspace radzi sobie z pustym i błędnym wejściem', () => {
  assert.deepEqual(Model.normalizeWorkspace(null), Model.emptyWorkspace());
  assert.deepEqual(Model.normalizeWorkspace({}), Model.emptyWorkspace());
  assert.deepEqual(Model.normalizeWorkspace({ projects: 'nie tablica' }), Model.emptyWorkspace());
});

/* ---------- etapy spoza katalogu ---------- */

test('createCustomStage wymaga nazwy, dziedziny i dodatnich godzin', () => {
  const bad = Model.createCustomStage({ name: '', domain: 'kosmos', hours: 0 }, []);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.name);
  assert.ok(bad.errors.domain);
  assert.ok(bad.errors.hours);
  assert.equal(bad.stage, null);
});

test('createCustomStage tworzy etap z własną nazwą i dziedziną', () => {
  const made = Model.createCustomStage(
    { name: '  Uzgodnienie z PKP ', domain: 'location', hours: 12, deadline: '2026-07-01' }, []
  );
  assert.equal(made.valid, true);
  assert.deepEqual(made.stage, {
    id: 'custom-1', source: 'custom', name: 'Uzgodnienie z PKP',
    domain: 'location', status: 'todo', hours: 12, deadline: '2026-07-01'
  });
});

test('identyfikatory etapów własnych nie powtarzają się w projekcie', () => {
  const first = Model.createCustomStage({ name: 'A', domain: 'general', hours: 4 }, []).stage;
  const second = Model.createCustomStage({ name: 'B', domain: 'general', hours: 4 }, [first]).stage;
  assert.equal(first.id, 'custom-1');
  assert.equal(second.id, 'custom-2');
  assert.equal(Model.nextCustomStageId([first, second]), 'custom-3');
});

test('describeStage daje jednolity opis dla obu rodzajów etapów', () => {
  const fromCatalog = Model.describeStage(Model.createStage('water-docs'));
  assert.equal(fromCatalog.catalogNumber, '07');
  assert.equal(fromCatalog.isCustom, false);
  assert.equal(fromCatalog.name, 'Dokumentacja wodnoprawna');

  const own = Model.describeStage({ id: 'custom-1', source: 'custom', name: 'Uzgodnienie', domain: 'water' });
  assert.equal(own.catalogNumber, null);
  assert.equal(own.isCustom, true);
  assert.equal(own.domainLabel, 'Wodnoprawne');
});

test('describeStage znosi uszkodzony etap własny', () => {
  const broken = Model.describeStage({ id: 'custom-9', source: 'custom' });
  assert.equal(broken.name, 'Etap bez nazwy');
  assert.equal(broken.domain, 'general');
});

test('etap katalogowy trafia na swoje miejsce w kolejności katalogu', () => {
  const stages = [Model.createStage('preparation'), Model.createStage('water-docs')];
  const withConcept = Model.insertCatalogStage(stages, Model.createStage('concept'));
  assert.deepEqual(withConcept.map((s) => s.id), ['preparation', 'concept', 'water-docs']);

  const withHandover = Model.insertCatalogStage(withConcept, Model.createStage('handover'));
  assert.equal(withHandover[withHandover.length - 1].id, 'handover');
});

test('wstawianie etapu katalogowego nie przesuwa etapów własnych', () => {
  const own = Model.createCustomStage({ name: 'Uzgodnienie', domain: 'location', hours: 8 }, []).stage;
  const stages = [Model.createStage('preparation'), own, Model.createStage('handover')];
  const result = Model.insertCatalogStage(stages, Model.createStage('technical'));
  assert.deepEqual(result.map((s) => s.id), ['preparation', 'custom-1', 'technical', 'handover']);
});

test('moveStage przesuwa etap o jedną pozycję', () => {
  const stages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(Model.moveStage(stages, 'b', -1).map((s) => s.id), ['b', 'a', 'c']);
  assert.deepEqual(Model.moveStage(stages, 'b', 1).map((s) => s.id), ['a', 'c', 'b']);
});

test('moveStage nie wypycha etapu poza listę ani nie zmienia oryginału', () => {
  const stages = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(Model.moveStage(stages, 'a', -1).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(Model.moveStage(stages, 'b', 1).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(Model.moveStage(stages, 'nie-ma', 1).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(stages.map((s) => s.id), ['a', 'b'], 'oryginał zostaje nietknięty');
});

test('normalizeWorkspace zachowuje etapy własne i ich kolejność', () => {
  const result = Model.normalizeWorkspace({
    projects: [{
      id: 1, code: 'W-1', name: 'A', client: 'K',
      stages: [
        { id: 'preparation', source: 'catalog', status: 'done', hours: 40 },
        { id: 'custom-1', source: 'custom', name: 'Uzgodnienie z PKP', domain: 'location', hours: 12, status: 'working' },
        { id: 'handover', source: 'catalog', status: 'todo', hours: 24 }
      ]
    }]
  });
  const stages = result.projects[0].stages;
  assert.deepEqual(stages.map((s) => s.id), ['preparation', 'custom-1', 'handover']);
  assert.equal(stages[1].name, 'Uzgodnienie z PKP');
  assert.equal(stages[1].status, 'working');
});

test('normalizeWorkspace naprawia etap własny bez dziedziny i z błędnymi godzinami', () => {
  const result = Model.normalizeWorkspace({
    projects: [{
      id: 1, code: 'W-1', name: 'A', client: 'K',
      stages: [{ id: 'custom-5', source: 'custom', name: 'Coś własnego', domain: 'kosmos', hours: -3 }]
    }]
  });
  const stage = result.projects[0].stages[0];
  assert.equal(stage.domain, 'general');
  assert.equal(stage.hours, 8);
});

test('starsze dane bez oznaczenia źródła są traktowane jako katalogowe', () => {
  const result = Model.normalizeWorkspace({
    projects: [{
      id: 1, code: 'W-1', name: 'A', client: 'K',
      stages: [{ id: 'water-docs', status: 'done', hours: 70 }]
    }]
  });
  assert.equal(result.projects[0].stages[0].source, 'catalog');
  assert.equal(Model.describeStage(result.projects[0].stages[0]).catalogNumber, '07');
});

test('etap spoza katalogu i bez nazwy nadal jest odrzucany', () => {
  const result = Model.normalizeWorkspace({
    projects: [{
      id: 1, code: 'W-1', name: 'A', client: 'K',
      stages: [{ id: 'wymyslony', status: 'todo', hours: 10 }]
    }]
  });
  assert.equal(result.projects[0].stages.length, 0);
});
