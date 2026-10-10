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

test('skrzynka: pisma bez opiekuna widać od razu (nie dopiero przed terminem), tylko lider i koordynator', () => {
  const mail = [
    { id: 'm1', projectId: 1, direction: 'in', subject: 'Wezwanie', counterparty: 'RZGW', needsAction: true, registeredDate: '2026-09-20' },
    { id: 'm2', projectId: 1, direction: 'in', subject: 'Zapytanie', needsAction: true, registeredDate: '2026-09-30' },
    { id: 'm3', projectId: 1, direction: 'in', subject: 'Daleko', needsAction: true, registeredDate: '2026-09-30' }
  ];
  const r = Inbox.build('p-1', [project()], mail, NOW, {});
  assert.deepEqual(r.items.map((i) => i.entry.id), ['m1', 'm2', 'm3']);
  assert.ok(r.items.every((i) => i.handling === 'new'));
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

test('skrzynka: jedno pismo ma jednego właściciela — bez zadania, z otwartym zadaniem, po zakończeniu zadania', () => {
  const Mail = require('../src/core/mail.js');
  const mail = Mail.create([], 1, { direction: 'in', kind: 'summons', subject: 'Wezwanie', counterparty: 'RZGW', registeredDate: '2026-09-28', needsAction: true }, { now: NOW }).entries;
  const id = mail[0].id;
  const entries = [{ id: 'e1', personId: 'p-3', projectId: 1, stageId: 'concept', taskId: 'z', start: '2026-10-01T08:00:00.000Z', end: '2026-10-01T18:00:00.000Z', source: 'manual' }];
  const items = (p, e) => Inbox.build('p-1', [p], mail, NOW, {}, e).items.filter((i) => i.kind === 'mail');

  const bare = items(project(), [])[0];
  assert.equal(bare.handling, 'new');
  assert.equal(bare.linked.length, 0);
  assert.ok(/czeka na Twoją decyzję/i.test(bare.why));

  const taken = project({ stages: [stage('concept', [task({ id: 'z', name: 'Odpowiedź', status: 'working', mailId: id })])] });
  assert.equal(items(taken, entries).length, 0, 'pismo z otwartym zadaniem nie dubluje zadania w reakcjach');

  const finished = project({ stages: [stage('concept', [task({ id: 'z', name: 'Odpowiedź', status: 'done', mailId: id })])] });
  const back = items(finished, entries)[0];
  assert.ok(back, 'zadanie zakończone, a odpowiedzi brak: pismo wraca do Skrzynki');
  assert.equal(back.handling, 'finished');

});

test('skrzynka: pismo wychodzące czekające na cudzą odpowiedź nie jest zadaniem lidera', () => {
  const mail = [{ id: 'o1', projectId: 1, direction: 'out', subject: 'Wniosek', counterparty: 'Gmina', needsAction: true, registeredDate: '2026-09-20' }];
  assert.equal(Inbox.build('p-1', [project()], mail, NOW, {}).items.filter((i) => i.kind === 'mail').length, 0);
});

const PEOPLE = [
  { id: 'p-1', firstName: 'Anna', lastName: 'Lider', active: true, orgRole: 'managing' },
  { id: 'p-2', firstName: 'Jan', lastName: 'Koord', active: true, orgRole: 'employee' },
  { id: 'p-3', firstName: 'Ewa', lastName: 'Prac', active: true, orgRole: 'employee' }
];
const ORDER = (extra) => Object.assign({ id: 'z-1', kind: 'sign', text: 'Podpisać umowę', assigneeId: 'p-2', createdBy: 'p-3', status: 'open', createdAt: new Date(NOW.getTime() - 4 * 86400000).toISOString() }, extra || {});
const LEAVE = (extra) => Object.assign({ id: 'a-1', personId: 'p-3', from: '2026-10-05', to: '2026-10-06', kind: 'leave', status: 'pending', opinions: [] }, extra || {});

test('skrzynka: zlecenia do mnie wchodzą do listy, stare są pilne, cudze i zamknięte nie', () => {
  const extra = { orders: [ORDER(), ORDER({ id: 'z-2', assigneeId: 'p-3' }), ORDER({ id: 'z-3', status: 'done' })], people: PEOPLE, absences: [] };
  const r = Inbox.build('p-2', [project()], [], NOW, {}, [], extra);
  const orders = r.items.filter((i) => i.kind === 'order');
  assert.deepEqual(orders.map((i) => i.key), ['order:z-1']);
  assert.equal(orders[0].urgent, true, 'od 3 dni to alarm');
  assert.match(orders[0].detail, /Ewa Prac/);
});

test('skrzynka: wniosek urlopowy czeka na zarząd, a lider projektu dostaje go raz do opinii', () => {
  const p = project();
  const extra = { orders: [], people: PEOPLE, absences: [LEAVE()] };
  assert.equal(Inbox.build('p-1', [p], [], NOW, {}, [], extra).counts.leave, 1, 'zarząd decyduje');
  assert.equal(Inbox.build('p-2', [p], [], NOW, {}, [], extra).counts.leave, 0, 'koordynator nie jest liderem');
  const lead = project({ team: { leader: 'p-2', coordinator: '', proxyLead: '', proxyExtra: '', members: ['p-3'] } });
  assert.equal(Inbox.build('p-2', [lead], [], NOW, {}, [], extra).counts.leave, 1, 'lider dopisuje opinię');
  const done = { orders: [], people: PEOPLE, absences: [LEAVE({ opinions: [{ by: 'p-2', verdict: 'ok', note: '', at: '' }] })] };
  assert.equal(Inbox.build('p-2', [lead], [], NOW, {}, [], done).counts.leave, 0, 'po opinii znika');
  assert.equal(Inbox.build('p-3', [p], [], NOW, {}, [], extra).counts.leave, 0, 'własny wniosek nie trafia do autora');
  const decided = { orders: [], people: PEOPLE, absences: [LEAVE({ status: 'approved' })] };
  assert.equal(Inbox.build('p-1', [p], [], NOW, {}, [], decided).counts.leave, 0, 'rozpatrzony znika');
});

test('skrzynka: bez dodatkowych źródeł działa jak dawniej, a ekran pomija zadania zwrócone do poprawy', () => {
  const p = project({ stages: [stage('concept', [task({ id: 'a', status: 'changes', assignees: ['p-3'] }), task({ id: 'b', status: 'review', assignees: ['p-3'] })])] });
  const all = Inbox.build('p-1', [p], [], NOW, {});
  assert.equal(all.items.filter((i) => i.kind === 'order' || i.kind === 'leave').length, 0);
  const back = Inbox.build('p-3', [p], [], NOW, {}, [], { orders: [], people: PEOPLE, absences: [] });
  assert.equal(back.total, 1);
  const screen = Inbox.forScreen(back);
  assert.equal(screen.total, 0, 'praca własna nie liczy się do Skrzynki');
  const lead = Inbox.forScreen(Inbox.build('p-1', [p], [], NOW, {}, [], { orders: [], people: PEOPLE, absences: [] }));
  assert.equal(lead.total, 1);
  assert.deepEqual(Object.keys(lead.counts).sort(), ['approve', 'leave', 'mail', 'order', 'project', 'timeweek']);
});

test('skrzynka: zgłoszony tydzień czasu trafia do zarządu, nie do właściciela', () => {
  const locks = [{ id: 'p-2:2026-10-05', personId: 'p-2', week: '2026-10-05', status: 'submitted' }, { id: 'p-3:2026-10-05', personId: 'p-3', week: '2026-10-05', status: 'approved' }];
  const extra = { orders: [], people: PEOPLE, absences: [], timeLocks: locks };
  const mgmt = Inbox.build('p-1', [project()], [], NOW, {}, [], extra).items.filter((i) => i.kind === 'timeweek');
  assert.equal(mgmt.length, 1);
  assert.equal(mgmt[0].lock.personId, 'p-2');
  assert.equal(Inbox.build('p-2', [project()], [], NOW, {}, [], extra).items.filter((i) => i.kind === 'timeweek').length, 0);
});

test('skrzynka: odłożona pozycja ukrywa się także dla zleceń i wniosków', () => {
  const extra = { orders: [ORDER()], people: PEOPLE, absences: [] };
  const hidden = Inbox.snooze({}, 'order:z-1', NOW, 1);
  const r = Inbox.build('p-2', [project()], [], NOW, hidden, [], extra);
  assert.equal(r.items.filter((i) => i.kind === 'order').length, 0);
  assert.equal(Inbox.forScreen(r).snoozed.length, 1);
});
