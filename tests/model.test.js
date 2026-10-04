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
    domain: 'location', kind: 'docs', status: 'todo', hours: 12, deadline: '2026-07-01', adjustments: [], tasks: []
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
  assert.equal(fromCatalog.catalogNumber, '10');
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
  assert.equal(Model.describeStage(result.projects[0].stages[0]).catalogNumber, '10');
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

test('nowy etap zaczyna bez zadań', () => {
  assert.deepEqual(Model.createStage('concept').tasks, []);
});

test('normalizeWorkspace ogranicza realizatorów zadań do zespołu projektu', () => {
  const result = Model.normalizeWorkspace({
    people: [
      { id: 'p-1', firstName: 'Anna', lastName: 'T' },
      { id: 'p-2', firstName: 'Jan', lastName: 'T' }
    ],
    projects: [{
      id: 1, code: 'W-1', name: 'A', client: 'K',
      team: { leader: 'p-1' },
      stages: [{
        id: 'concept', hours: 80,
        tasks: [{ id: 't-1', name: 'Zadanie', assignees: ['p-1', 'p-2'] }]
      }]
    }]
  });
  assert.deepEqual(
    result.projects[0].stages[0].tasks[0].assignees,
    ['p-1'],
    'p-2 nie należy do zespołu projektu, więc nie może być realizatorem'
  );
});

test('updateStage zmienia godziny i termin, zostawia status, zadania i identyfikator', () => {
  const stage = Object.assign(Model.createStage('concept'), { status: 'working', tasks: [{ id: 't-1' }] });
  const result = Model.updateStage(stage, { hours: '100', deadline: '2026-12-01', name: 'Podmieniona', domain: 'water' });
  assert.equal(result.valid, true);
  assert.equal(result.stage.hours, 100);
  assert.equal(result.stage.deadline, '2026-12-01');
  assert.equal(result.stage.status, 'working');
  assert.equal(result.stage.id, 'concept');
  assert.deepEqual(result.stage.tasks, [{ id: 't-1' }]);
  // Etap standardowy zachowuje nazwę i dziedzinę ze standardu.
  assert.equal(result.stage.name, undefined);
  assert.equal(result.stage.domain, undefined);
});

test('updateStage pozwala przemianować etap własny i zmienić jego dziedzinę', () => {
  const own = Model.createCustomStage({ name: 'Uzgodnienie', domain: 'location', hours: 8 }, []).stage;
  const result = Model.updateStage(own, { name: '  Uzgodnienie z PKP ', domain: 'water', hours: 12, deadline: '' });
  assert.equal(result.valid, true);
  assert.equal(result.stage.name, 'Uzgodnienie z PKP');
  assert.equal(result.stage.domain, 'water');
  assert.equal(result.stage.deadline, '');
});

test('updateStage odrzuca puste godziny, złą datę i pustą nazwę etapu własnego', () => {
  const own = Model.createCustomStage({ name: 'A', domain: 'general', hours: 8 }, []).stage;
  const bad = Model.updateStage(own, { name: ' ', domain: 'kosmos', hours: 0, deadline: '2026-13-40' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.name && bad.errors.domain && bad.errors.hours && bad.errors.deadline);
  const catalog = Model.updateStage(Model.createStage('concept'), { hours: -1 });
  assert.equal(catalog.valid, false);
  assert.ok(catalog.errors.hours);
  assert.equal(catalog.errors.name, undefined);
  assert.equal(Model.updateStage(null, { hours: 5 }).valid, false);
});

test('katalog: każdy etap ma rodzaj pracy i ikonę, a postępowania są decyzjami', () => {
  const Catalog = require('../src/core/catalog.js');
  Catalog.all.forEach((entry) => {
    assert.ok(Catalog.KINDS[entry.kind], 'rodzaj ' + entry.id);
    assert.ok(entry.icon, 'ikona ' + entry.id);
  });
  Catalog.all.filter((e) => /-process$/.test(e.id) || e.id === 'land').forEach((e) => assert.equal(e.kind, 'decision', e.id));
  assert.deepEqual(Catalog.all.filter((e) => e.kind === 'materials').map((e) => e.id), ['preparation', 'survey', 'studies']);
  assert.equal(Catalog.all.find((e) => e.id === 'handover').kind, 'docs');
  assert.equal(Catalog.kind('nic').id, 'docs');
  const numbers = Catalog.all.map((e) => e.number);
  assert.equal(new Set(numbers).size, numbers.length);
});

test('describeStage podaje rodzaj pracy; etap własny bierze rodzaj ze swoich danych', () => {
  const decision = Model.describeStage(Model.createStage('water-process'));
  assert.equal(decision.kind, 'decision');
  assert.equal(decision.decision, true);
  assert.equal(decision.kindLabel, 'Decyzje');
  assert.equal(Model.describeStage(Model.createStage('water-docs')).decision, false);
  const own = Model.describeStage({ id: 'custom-1', source: 'custom', name: 'X', domain: 'water', kind: 'materials' });
  assert.equal(own.kind, 'materials');
  assert.equal(own.icon, 'water');
  assert.equal(Model.describeStage({ id: 'custom-2', source: 'custom', name: 'Y' }).kind, 'docs');
});

test('etap własny: rodzaj pracy jest walidowany, zapisywany i edytowalny', () => {
  const made = Model.createCustomStage({ name: 'Uzgodnienie', domain: 'general', kind: 'decision', hours: 8 }, []);
  assert.equal(made.valid, true);
  assert.equal(made.stage.kind, 'decision');
  assert.equal(Model.createCustomStage({ name: 'A', kind: 'bzdura', hours: 8 }, []).errors.kind, 'Wybierz rodzaj pracy.');
  const edited = Model.updateStage(made.stage, { name: 'Uzgodnienie', domain: 'general', kind: 'materials', hours: 8 });
  assert.equal(edited.stage.kind, 'materials');
  assert.equal(Model.updateStage(Model.createStage('concept'), { hours: 5, kind: 'decision' }).stage.kind, undefined);
});

test('normalizeWorkspace uzupełnia rodzaj etapu własnego z dawnych danych', () => {
  const ws = Model.normalizeWorkspace({ version: 4, projects: [{ id: 'p', code: 'A-1', name: 'N', stages: [
    { id: 'custom-1', source: 'custom', name: 'Stary', domain: 'water', hours: 5 },
    { id: 'custom-2', source: 'custom', name: 'Nowy', hours: 5, kind: 'decision' },
    { id: 'custom-3', source: 'custom', name: 'Zły', hours: 5, kind: '???' }
  ] }] });
  assert.deepEqual(ws.projects[0].stages.map((s) => s.kind), ['docs', 'decision', 'docs']);
});

test('normalizeWorkspace zachowuje wpisy czasu istniejących projektów i odrzuca osierocone', () => {
  const entry = (id, projectId) => ({ id, personId: 'p-1', projectId, stageId: 'concept', taskId: 't-1', start: '2026-10-01T08:00:00.000Z', end: '2026-10-01T09:00:00.000Z' });
  const ws = Model.normalizeWorkspace({ projects: [{ id: 3, code: 'A-1', name: 'N', stages: [] }], entries: [entry('e-1', 3), entry('e-2', 99)] });
  assert.deepEqual(ws.entries.map((e) => e.id), ['e-1']);
  assert.deepEqual(Model.emptyWorkspace().entries, []);
  assert.deepEqual(Model.normalizeWorkspace({}).entries, []);
});

test('distributeHours dzieli budżet proporcjonalnie, w pełnych godzinach, z sumą równą budżetowi', () => {
  const split = Model.distributeHours(500, [{ id: 'a', weight: 40 }, { id: 'b', weight: 80 }, { id: 'c', weight: 40 }]);
  assert.deepEqual(split, { a: 125, b: 250, c: 125 });
  const odd = Model.distributeHours(100, [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }, { id: 'c', weight: 1 }]);
  assert.equal(odd.a + odd.b + odd.c, 100);
  const tiny = Model.distributeHours(2, [{ id: 'a', weight: 100 }, { id: 'b', weight: 1 }, { id: 'c', weight: 1 }]);
  assert.equal(tiny.a + tiny.b + tiny.c, 2);
  assert.deepEqual(Model.distributeHours(0, [{ id: 'a', weight: 1 }]), {});
  assert.deepEqual(Model.distributeHours(100, []), {});
});
