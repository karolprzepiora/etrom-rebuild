'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Mail = require('../src/core/mail.js');

const NOW = new Date(2026, 9, 2, 12, 0);
const base = { direction: 'in', kind: 'summons', subject: 'Wezwanie do uzupełnienia wniosku', counterparty: 'RZGW Kraków', registeredDate: '2026-10-01', needsAction: true };

test('wpis wymaga kierunku, tematu, nadawcy i daty; adresat przy wychodzących', () => {
  const bad = Mail.validate({}, [], 1);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['counterparty', 'direction', 'registeredDate', 'subject']);
  assert.equal(Mail.validate({ direction: 'out' }, [], 1).errors.counterparty, 'Podaj adresata.');
  assert.equal(Mail.validate(base, [], 1).valid, true);
});

test('numer w dzienniku: osobno dla projektu, kierunku i roku, rośnie o 1', () => {
  let list = [];
  list = Mail.create(list, 1, base).entries;
  list = Mail.create(list, 1, base).entries;
  list = Mail.create(list, 2, base).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { direction: 'out' })).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { registeredDate: '2027-01-05' })).entries;
  assert.deepEqual(list.map((e) => e.regNo), ['P/2026/001', 'P/2026/002', 'P/2026/001', 'W/2026/001', 'P/2027/001']);
  assert.deepEqual(list.map((e) => e.id), ['m-1', 'm-2', 'm-3', 'm-4', 'm-5']);
});

test('odpowiedź wskazuje pismo w przeciwnym kierunku i załatwia oczekiwanie', () => {
  let list = Mail.create([], 1, base).entries;
  assert.equal(Mail.replyState(list[0], list, NOW).state, 'waiting');
    const same = Mail.create(list, 1, Object.assign({}, base, { replyTo: 'm-1' }));
  assert.ok(same.errors.replyTo, 'ten sam kierunek nie jest odpowiedzią');
  const answer = Mail.create(list, 1, Object.assign({}, base, { direction: 'out', kind: 'reply', counterparty: 'RZGW', replyTo: 'm-1' }));
  assert.equal(answer.valid, true);
  assert.equal(Mail.replyState(answer.entries[0], answer.entries, NOW).state, 'answered');
  assert.equal(Mail.pending(answer.entries, 1, NOW).length, 0);
});

test('edycja zachowuje numer, zmiana kierunku nadaje nowy; usunięcie odpina odpowiedzi', () => {
  let list = Mail.create([], 1, base).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { direction: 'out', replyTo: 'm-1' })).entries;
  const edited = Mail.update(list, 'm-1', Object.assign({}, base, { subject: 'Nowy temat' }));
  assert.equal(edited.entry.regNo, 'P/2026/001');
  const flipped = Mail.update(list, 'm-1', Object.assign({}, base, { direction: 'out' }));
  assert.equal(flipped.valid, false, 'wychodzące odpowiedziałoby samo sobie w tym samym kierunku');
  const after = Mail.remove(list, 'm-1');
  assert.equal(after.length, 1);
  assert.equal(after[0].replyTo, '');
});

test('filtr: kierunek, oczekujące, szukanie; najnowsze pierwsze', () => {
  let list = Mail.create([], 1, Object.assign({}, base, { subject: 'Alfa', registeredDate: '2026-09-01' })).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { direction: 'out', subject: 'Beta', counterparty: 'Urząd Miasta', registeredDate: '2026-09-20' })).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { subject: 'Gamma', registeredDate: '2026-09-25' })).entries;
  assert.deepEqual(Mail.filter(list, {}).map((e) => e.subject), ['Gamma', 'Beta', 'Alfa']);
  assert.deepEqual(Mail.filter(list, { direction: 'out' }).map((e) => e.subject), ['Beta']);
  assert.deepEqual(Mail.filter(list, { waiting: true, now: NOW }).map((e) => e.subject), ['Gamma', 'Alfa']);
  assert.deepEqual(Mail.filter(list, { query: 'urząd' }).map((e) => e.subject), ['Beta']);
});

test('normalizacja odrzuca zepsute wpisy i osierocone projekty, czyści złe powiązania', () => {
  const good = Mail.create([], 1, base).entries[0];
  const orphan = Object.assign({}, good, { id: 'm-2', projectId: 99 });
  const broken = { id: 'm-3', projectId: 1, direction: 'in' };
  const dup = Object.assign({}, good);
  const badLink = Object.assign({}, good, { id: 'm-4', direction: 'out', replyTo: 'm-404' });
  const out = Mail.normalizeEntries([good, orphan, broken, dup, badLink, null, 'x'], [1]);
  assert.deepEqual(out.map((e) => e.id), ['m-1', 'm-4']);
  assert.equal(out[1].replyTo, '');
  assert.deepEqual(Mail.normalizeEntries(undefined, [1]), []);
});

test('poczta: handling — kto trzyma pismo oczekujące na odpowiedź', () => {
  assert.equal(Mail.handling([]), 'new');
  assert.equal(Mail.handling([{ task: { status: 'working' } }]), 'taken');
  assert.equal(Mail.handling([{ task: { status: 'done' } }, { task: { status: 'todo' } }]), 'taken');
  assert.equal(Mail.handling([{ task: { status: 'done' } }]), 'taken');
});

test('zwykły dziennik: pismo bez oznaczenia nie czeka na nic, oznaczone czeka do odpowiedzi', () => {
  const plain = Mail.create([], 1, Object.assign({}, base, { needsAction: false })).entries;
  assert.equal(Mail.replyState(plain[0], plain, NOW).state, 'none');
  assert.equal(Mail.pending(plain, 1, NOW).length, 0);
  const flagged = Mail.create([], 1, base).entries;
  assert.equal(Mail.pending(flagged, 1, NOW).length, 1);
});

test('pismo: pliki, właściciel i termin odpowiedzi są zapisywane i czyszczone', () => {
  const r = Mail.create([], 1, Object.assign({}, base, {
    files: [{ name: 'wezwanie.pdf', size: 1200, location: 'e-Doręczenia' }, { name: '  ', size: 5 }, { name: 'zal1.pdf', size: -3 }],
    ownerId: 'p-1', responseDue: '2026-10-20', caseRef: 'KR.ZZ.1'
  }));
  assert.equal(r.valid, true);
  assert.deepEqual(r.entry.files.map((f) => f.name), ['wezwanie.pdf', 'zal1.pdf']);
  assert.equal(r.entry.files[1].size, 0);
  assert.equal(r.entry.responseDue, '2026-10-20');
  assert.equal(Mail.create([], 1, Object.assign({}, base, { responseDue: '2026-13-40' })).valid, false);
  assert.equal(Mail.create([], 1, Object.assign({}, base, { direction: 'out', responseDue: '2026-10-20', ownerId: 'p-1' })).entry.responseDue, '');
});

test('pismo: decyzje zapisują się w historii i zmieniają stan', () => {
  const NOW = new Date(2026, 9, 9);
  const list = Mail.create([], 1, base, { now: NOW }).entries;
  const id = list[0].id;
  assert.equal(Mail.incomingState(list[0], list, null, [], NOW).state, 'new');
  const filed = Mail.decide(list, id, 'file', {}, { now: NOW, personId: 'p-1' });
  assert.equal(Mail.incomingState(filed.entry, filed.entries, null, [], NOW).state, 'filed');
  assert.equal(filed.entry.history.slice(-1)[0].text, 'Do akt');
  const reply = Mail.decide(list, id, 'reply', { responseDue: '2026-10-10' }, { now: NOW });
  assert.equal(reply.entry.responseDue, '2026-10-10');
  assert.equal(Mail.decide(list, id, 'case', {}).valid, false, 'sprawa jest wymagana');
  assert.equal(Mail.decide(list, id, 'case', { caseId: 'c-1' }).entry.decision, 'case');
  assert.equal(Mail.decide(list, id, 'reassign', { ownerId: 'p-2' }).entry.ownerId, 'p-2');
  const answered = Mail.create(list, 1, { direction: 'out', kind: 'reply', subject: 'Odp', counterparty: 'RZGW', registeredDate: '2026-10-09', replyTo: id }).entries;
  assert.equal(Mail.incomingState(list[0], answered, null, [], NOW).state, 'answered');
});

test('pismo: stan odpowiedzi — w toku, zagrożona, zadanie zakończone bez odpowiedzi', () => {
  const NOW = new Date(2026, 9, 9);
  const list = Mail.decide(Mail.create([], 1, base, { now: NOW }).entries, 'm-1', 'reply', { responseDue: '2026-10-30' }).entries;
  const project = (task) => ({ id: 1, stages: [{ id: 's', tasks: [task] }] });
  const st = (task, due) => {
    const l = due ? Mail.decide(list, 'm-1', 'reply', { responseDue: due }).entries : list;
    return Mail.incomingState(l[0], l, project(task), [], NOW).state;
  };
  assert.equal(st({ id: 't', mailId: 'm-1', status: 'working', deadline: '2026-10-20' }), 'inprogress');
  assert.equal(st({ id: 't', mailId: 'm-1', status: 'working', deadline: '2026-10-20' }, '2026-10-10'), 'atrisk');
  assert.equal(st({ id: 't', mailId: 'm-1', status: 'working', deadline: '2026-11-05' }), 'atrisk', 'zadanie kończy się po terminie odpowiedzi');
  assert.equal(st({ id: 't', mailId: 'm-1', status: 'done' }), 'finished');
  assert.equal(Mail.ownerOf({ ownerId: '' , createdBy: 'p-9'}, { team: { leader: '', coordinator: 'p-2' } }), 'p-2');
  assert.equal(Mail.ownerOf({ ownerId: 'p-5' }, { team: { leader: 'p-1' } }), 'p-5');
});
