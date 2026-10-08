'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core/cases.js');
const Model = require('../src/core/model.js');

const ids = [1, 2];
const data = { projectId: 1, name: ' Decyzja środowiskowa ', org: 'RDOŚ', ownerId: 'p-3', startedAt: '2026-09-30', remindEvery: 7 };

test('nowa sprawa: walidacja, id, wpis „złożono” i przypomnienie za okres dopytywania', () => {
  assert.equal(C.create([], { ...data, name: '  ' }, ids).errors.name, 'Podaj nazwę sprawy.');
  assert.ok(C.create([], { ...data, projectId: 9 }, ids).errors.projectId);
  assert.ok(C.create([], { ...data, startedAt: '30.09' }, ids).errors.startedAt);
  const res = C.create([], data, ids);
  assert.equal(res.valid, true);
  assert.equal(res.item.id, 'c-1');
  assert.equal(res.item.name, 'Decyzja środowiskowa');
  assert.equal(res.item.remindAt, '2026-10-07');
  assert.deepEqual(res.item.events.map((e) => e.kind), ['filed']);
  assert.equal(C.create(res.list, data, ids).item.id, 'c-2');
});

test('licznik liczy dni od złożenia, a „dopytano” przesuwa przypomnienie', () => {
  let list = C.create([], data, ids).list;
  assert.equal(C.daysSince(list[0], '2026-10-08'), 8);
  assert.equal(C.remindDue(list[0], '2026-10-07'), true);
  list = C.addEvent(list, 'c-1', { kind: 'call', note: 'Anna N. potwierdza' }, '2026-10-08');
  assert.equal(list[0].remindAt, '2026-10-15');
  assert.equal(C.remindDue(list[0], '2026-10-08'), false);
  assert.equal(C.lastCall(list[0]).note, 'Anna N. potwierdza');
});

test('sprawa trwa do zakończenia; zakończona znika z otwartych i można ją wznowić', () => {
  let list = C.create([], data, ids).list;
  list = C.close(list, 'c-1', '2026-10-20', 'Prawomocna');
  assert.equal(C.open(list).length, 0);
  assert.equal(list[0].closedAt, '2026-10-20');
  list = C.reopen(list, 'c-1', '2026-10-21');
  assert.equal(C.open(list).length, 1);
  assert.equal(list[0].closedAt, '');
});

test('pismo dodane jako zadanie wiąże zadanie ze sprawą', () => {
  let list = C.create([], { ...data, sourceTaskId: 't-1' }, ids).list;
  list = C.addEvent(list, 'c-1', { kind: 'letter', at: '2026-10-06', taskId: 't-9', note: 'Wezwanie' }, '2026-10-06');
  assert.equal(C.byTask(list, 't-1').id, 'c-1');
  assert.equal(C.byTask(list, 't-9').id, 'c-1');
  assert.equal(C.byTask(list, 't-2'), null);
});

test('wykrywanie zadań typu „złożyć / wysłać / zamówić”', () => {
  ['Złożyć wniosek o decyzję', 'Wysłać pismo do RDOŚ', 'Zamówić mapę do celów projektowych', 'Wystąpić o wypis z rejestru', 'Złożenie wniosku', 'Przekazać do klienta'].forEach((n) => assert.equal(C.looksLikeFiling(n), true, n));
  ['Opracować rysunki wykonawcze', 'Obliczenia hydrauliczne', 'Skompletować załączniki do wniosku', 'Przekazanie dokumentacji zamawiającemu', ''].forEach((n) => assert.equal(C.looksLikeFiling(n), false, n));
});

test('nie pomijamy śledzenia: zamknięte zadanie „złożyć…” czeka na decyzję, aż je rozstrzygniesz', () => {
  const done = (id, name, at) => ({ id, name, status: 'done', history: [{ from: 'review', to: 'done', at }] });
  const projects = [{ id: 1, stages: [{ id: 's', tasks: [done('t-1', 'Złożyć wniosek', '2026-10-05T10:00:00'), done('t-2', 'Zamówić mapę', '2026-10-06T10:00:00'), done('t-3', 'Rysunki', '2026-10-06T10:00:00'), done('t-4', 'Wysłać pismo', '2026-08-01T10:00:00'), { id: 't-5', name: 'Złożyć odwołanie', status: 'working', history: [] }] }] }];
  let pending = C.pendingDecisions(projects, [], '2026-10-08', 30);
  assert.deepEqual(pending.map((p) => p.taskId), ['t-2', 't-1']);
  const tracked = C.create([], { ...data, sourceTaskId: 't-1' }, ids).list;
  pending = C.pendingDecisions(projects, tracked, '2026-10-08', 30);
  assert.deepEqual(pending.map((p) => p.taskId), ['t-2']);
  const skipped = C.create(tracked, { ...data, name: 'Zamówić mapę', sourceTaskId: 't-2', status: 'skipped' }, ids).list;
  assert.equal(C.pendingDecisions(projects, skipped, '2026-10-08', 30).length, 0);
  assert.equal(C.open(skipped).length, 1);
});

test('przestrzeń robocza zachowuje sprawy istniejących projektów i odrzuca osierocone', () => {
  const ws = Model.normalizeWorkspace({ projects: [{ id: 3, code: 'A-1', name: 'N', stages: [] }], cases: [{ ...data, projectId: 3 }, { ...data, projectId: 99 }, { bad: true }] });
  assert.equal(ws.cases.length, 1);
  assert.equal(ws.cases[0].projectId, 3);
  assert.deepEqual(Model.emptyWorkspace().cases, []);
});
