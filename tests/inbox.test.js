'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Inbox = require('../src/core/inbox.js');
const Model = require('../src/core/model.js');

const NOW = new Date(2026, 9, 2, 12, 0);

function stage(id, tasks) {
  return Object.assign(Model.createStage(id), { status: 'working', hours: 40, tasks });
}
function task(extra) {
  return Object.assign({ id: 't-1', name: 'Zadanie', status: 'todo', deadline: '', workload: 'medium', assignees: [], parts: {}, history: [] }, extra || {});
}
function project(extra) {
  return Object.assign({
    id: 1, code: 'P-1', name: 'Projekt', client: 'K', status: 'active', deadline: '2027-12-31', createdAt: '2026-09-01T08:00:00.000Z',
    team: { leader: 'p-1', coordinator: 'p-2', proxyLead: '', proxyExtra: '', members: ['p-3'] },
    stages: [stage('concept', [])]
  }, extra || {});
}

test('skrzynka: zatwierdzenia dostają lider i koordynator, ale nie autor jedynego udziału', () => {
  const p = project({ stages: [stage('concept', [
    task({ id: 'a', status: 'review', assignees: ['p-3'] }),
    task({ id: 'b', status: 'review', assignees: ['p-1'] })
  ])] });
  const lead = Inbox.build('p-1', [p], [], NOW, {});
  assert.deepEqual(lead.items.filter((i) => i.kind === 'approve').map((i) => i.task.id), ['a']);
  assert.equal(Inbox.build('p-2', [p], [], NOW, {}).counts.approve, 2);
  assert.equal(Inbox.build('p-3', [p], [], NOW, {}).total, 0);
});

test('skrzynka: zadanie zwrócone do poprawy wraca do realizatora z uzasadnieniem', () => {
  const p = project({ stages: [stage('concept', [task({ id: 'a', status: 'changes', feedback: 'Brak rzędnych', assignees: ['p-3'], deadline: '2026-09-30T12:00' })])] });
  const r = Inbox.build('p-3', [p], [], NOW, {});
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].kind, 'returned');
  assert.equal(r.items[0].detail, 'Brak rzędnych');
  assert.equal(r.items[0].urgent, true);
});

test('skrzynka: pisma — tylko w ciągu 3 dni lub po terminie, tylko dla lidera i koordynatora', () => {
  const mail = [
    { id: 'm1', projectId: 1, direction: 'in', subject: 'Wezwanie', counterparty: 'RZGW', replyDue: '2026-09-30', registeredDate: '2026-09-20' },
    { id: 'm2', projectId: 1, direction: 'in', subject: 'Zapytanie', replyDue: '2026-10-05', registeredDate: '2026-09-30' },
    { id: 'm3', projectId: 1, direction: 'in', subject: 'Daleko', replyDue: '2026-10-20', registeredDate: '2026-09-30' }
  ];
  const r = Inbox.build('p-1', [project()], mail, NOW, {});
  assert.deepEqual(r.items.map((i) => i.entry.id), ['m1', 'm2']);
  assert.equal(r.items[0].urgent, true);
  assert.equal(Inbox.build('p-3', [project()], mail, NOW, {}).total, 0);
});

test('skrzynka: projekt w alarmie widzi tylko lider; zakończony nic nie wnosi', () => {
  const p = project({ deadline: '2026-09-20' });
  assert.equal(Inbox.build('p-1', [p], [], NOW, {}).counts.project, 1);
  assert.equal(Inbox.build('p-2', [p], [], NOW, {}).counts.project, 0);
  assert.equal(Inbox.build('p-1', [project({ status: 'done', deadline: '2026-09-20' })], [], NOW, {}).total, 0);
});

test('skrzynka: kolejność — po terminie, potem najbliższy termin, potem rodzaj', () => {
  const p = project({ stages: [stage('concept', [
    task({ id: 'a', status: 'review', assignees: ['p-3'], deadline: '2026-10-09T12:00' }),
    task({ id: 'b', status: 'review', assignees: ['p-3'], deadline: '2026-10-03T12:00' }),
    task({ id: 'c', status: 'review', assignees: ['p-3'], deadline: '2026-09-29T12:00' }),
    task({ id: 'd', status: 'review', assignees: ['p-3'] })
  ])] });
  assert.deepEqual(Inbox.build('p-1', [p], [], NOW, {}).items.map((i) => i.task.id), ['c', 'b', 'a', 'd']);
});

test('skrzynka: odłożenie ukrywa do jutra i wraca samo', () => {
  const p = project({ stages: [stage('concept', [task({ id: 'a', status: 'review', assignees: ['p-3'] })])] });
  const key = Inbox.build('p-1', [p], [], NOW, {}).items[0].key;
  const snoozed = Inbox.snooze({}, key, NOW, 1);
  assert.equal(snoozed[key], '2026-10-03');
  const hidden = Inbox.build('p-1', [p], [], NOW, snoozed);
  assert.equal(hidden.total, 0);
  assert.equal(hidden.snoozed.length, 1);
  assert.equal(Inbox.build('p-1', [p], [], new Date(2026, 9, 3, 8, 0), snoozed).total, 1);
  assert.deepEqual(Inbox.unsnooze(snoozed, key), {});
});

test('skrzynka: odłożenie sprząta wygasłe wpisy, a zapis z dysku jest czyszczony', () => {
  const next = Inbox.snooze({ old: '2026-09-01', keep: '2026-10-10' }, 'k', NOW, 2);
  assert.deepEqual(next, { keep: '2026-10-10', k: '2026-10-04' });
  assert.deepEqual(Inbox.cleanSnoozed({ a: '2026-10-04', b: 'jutro', c: 5 }), { a: '2026-10-04' });
  assert.deepEqual(Inbox.cleanSnoozed(null), {});
  assert.deepEqual(Inbox.cleanSnoozed([1]), {});
});

test('skrzynka: bez osoby jest pusta', () => {
  const r = Inbox.build(null, [project()], [], NOW, {});
  assert.equal(r.total, 0);
});

test('skrzynka: pismo pokazuje powiązane zadania z czasem pracy i podpowiada, co zrobić', () => {
  const Mail = require('../src/core/mail.js');
  const mail = Mail.create([], 1, { direction: 'in', kind: 'summons', subject: 'Wezwanie', counterparty: 'RZGW', registeredDate: '2026-09-28', replyDue: '2026-10-03' }, { now: NOW }).entries;
  const id = mail[0].id;
  const p = project({ stages: [stage('concept', [task({ id: 'z', name: 'Odpowiedź', status: 'working', mailId: id })])] });
  const entries = [{ id: 'e1', personId: 'p-3', projectId: 1, stageId: 'concept', taskId: 'z', start: '2026-10-01T08:00:00.000Z', end: '2026-10-01T18:00:00.000Z', source: 'manual' }];
  const item = Inbox.build('p-1', [p], mail, NOW, {}, entries).items.filter((i) => i.kind === 'mail')[0];
  assert.equal(item.linked.length, 1);
  assert.equal(item.linked[0].hours, 10);
  assert.ok(/zadanie/i.test(item.why));
  const bare = Inbox.build('p-1', [project()], mail, NOW, {}, []).items.filter((i) => i.kind === 'mail')[0];
  assert.equal(bare.linked.length, 0);
  Inbox.build('p-1', [p], mail, NOW, {}, entries).items.forEach((i) => assert.ok(typeof i.why === 'string' && i.why.length > 10));
});
