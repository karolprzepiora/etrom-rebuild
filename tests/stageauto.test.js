'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/core/stageauto.js');

const t = (id, status) => ({ id, status });
const stage = (status, tasks, extra) => Object.assign({ id: 's1', status, tasks }, extra || {});

test('ruszone zadanie uruchamia etap samo', () => {
  assert.deepEqual(A.suggest(stage('todo', [t('a', 'working'), t('b', 'todo')])), { to: 'working', mode: 'apply', reason: 'started' });
  assert.equal(A.suggest(stage('todo', [t('a', 'todo')])), null);
  assert.equal(A.suggest(stage('todo', [])), null);
});

test('wszystkie zadania skończone: pytanie o zamknięcie, nie zmiana', () => {
  const s = stage('working', [t('a', 'done'), t('b', 'done')]);
  assert.equal(A.suggest(s).mode, 'ask');
  assert.equal(A.reconcile([s]).changes.length, 0);
  assert.equal(A.suggest(stage('working', [t('a', 'done'), t('b', 'working')])), null);
});

test('„Jeszcze nie” wycisza pytanie do zmiany zadań', () => {
  const s = A.dismissAsk(stage('working', [t('a', 'done')]));
  assert.equal(A.suggest(s), null);
  const changed = Object.assign({}, s, { tasks: [t('a', 'done'), t('b', 'done')] });
  assert.equal(A.suggest(changed).mode, 'ask');
});

test('potwierdzone zamknięcie wraca do „W toku” po nowym otwartym zadaniu', () => {
  const closed = A.confirmDone(stage('working', [t('a', 'done')]));
  assert.equal(closed.status, 'done');
  assert.equal(A.suggest(closed), null);
  const reopened = Object.assign({}, closed, { tasks: [t('a', 'done'), t('b', 'todo')] });
  const r = A.reconcile([reopened]);
  assert.equal(r.stages[0].status, 'working');
  assert.equal(r.changes[0].reason, 'reopened');
});

test('ręczna zmiana wygrywa z automatem', () => {
  const manualDone = A.markManual(stage('todo', [t('a', 'working')]), 'done');
  assert.equal(A.suggest(manualDone), null);
  const manualTodo = A.markManual(stage('working', [t('a', 'working')]), 'todo');
  assert.equal(A.suggest(manualTodo), null);
});

test('etap „Postępowanie” liczy się ze spraw, nie z zadań', () => {
  const open = [{ id: 'c1', status: 'open' }];
  const closed = [{ id: 'c1', status: 'closed' }];
  const s = stage('todo', [], {});
  assert.equal(A.suggest(s, { decision: true, cases: [] }), null);
  assert.deepEqual(A.suggest(s, { decision: true, cases: open }), { to: 'working', mode: 'apply', reason: 'started' });
  const w = stage('working', []);
  assert.equal(A.suggest(w, { decision: true, cases: open }), null);
  assert.equal(A.suggest(w, { decision: true, cases: closed }).mode, 'ask');
  assert.equal(A.suggest(w, { decision: true, cases: [{ id: 'c2', status: 'skipped' }] }), null);
  const dismissed = A.dismissAsk(w, closed);
  assert.equal(A.suggest(dismissed, { decision: true, cases: closed }), null);
  assert.equal(A.suggest(dismissed, { decision: true, cases: closed.concat([{ id: 'c3', status: 'closed' }]) }).mode, 'ask');
});

test('etapy „Postępowanie” nie reagują na zadania', () => {
  const s = stage('todo', [t('a', 'working')]);
  assert.equal(A.suggest(s, { decision: true, cases: [] }), null);
});

test('stary test: etapy „Postępowanie” zostają ręczne bez spraw', () => {
  const s = stage('todo', [t('a', 'working')]);
  assert.equal(A.suggest(s, { decision: true }), null);
  assert.equal(A.reconcile([s], { decisionOf: () => true, casesOf: () => [] }).changes.length, 0);
});

test('reconcile nie zmienia tablicy, gdy nic się nie dzieje', () => {
  const list = [stage('working', [t('a', 'working')])];
  assert.equal(A.reconcile(list).stages, list);
});
