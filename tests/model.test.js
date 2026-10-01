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
