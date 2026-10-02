'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Mail = require('../src/core/mail.js');

const NOW = new Date(2026, 9, 2, 12, 0);
const base = { direction: 'in', kind: 'summons', subject: 'Wezwanie do uzupełnienia wniosku', counterparty: 'RZGW Kraków', registeredDate: '2026-10-01', replyDue: '2026-10-15' };

test('wpis wymaga kierunku, tematu, nadawcy i daty; adresat przy wychodzących', () => {
  const bad = Mail.validate({}, [], 1);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['counterparty', 'direction', 'registeredDate', 'subject']);
  assert.equal(Mail.validate({ direction: 'out' }, [], 1).errors.counterparty, 'Podaj adresata.');
  assert.equal(Mail.validate(base, [], 1).valid, true);
});

test('termin odpowiedzi nie może być przed datą pisma, daty muszą być poprawne', () => {
  assert.ok(Mail.validate(Object.assign({}, base, { replyDue: '2026-09-01' }), [], 1).errors.replyDue);
  assert.ok(Mail.validate(Object.assign({}, base, { letterDate: '2026-02-31' }), [], 1).errors.letterDate);
});

test('numer w dzienniku: osobno dla projektu, kierunku i roku, rośnie o 1', () => {
  let list = [];
  list = Mail.create(list, 1, base).entries;
  list = Mail.create(list, 1, base).entries;
  list = Mail.create(list, 2, base).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { direction: 'out' })).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { registeredDate: '2027-01-05', replyDue: '' })).entries;
  assert.deepEqual(list.map((e) => e.regNo), ['P/2026/001', 'P/2026/002', 'P/2026/001', 'W/2026/001', 'P/2027/001']);
  assert.deepEqual(list.map((e) => e.id), ['m-1', 'm-2', 'm-3', 'm-4', 'm-5']);
});

test('odpowiedź wskazuje pismo w przeciwnym kierunku i załatwia oczekiwanie', () => {
  let list = Mail.create([], 1, base).entries;
  assert.equal(Mail.replyState(list[0], list, NOW).state, 'waiting');
  assert.equal(Mail.replyState(list[0], list, NOW).days, 13);
  const same = Mail.create(list, 1, Object.assign({}, base, { replyTo: 'm-1' }));
  assert.ok(same.errors.replyTo, 'ten sam kierunek nie jest odpowiedzią');
  const answer = Mail.create(list, 1, Object.assign({}, base, { direction: 'out', kind: 'reply', counterparty: 'RZGW', replyDue: '', replyTo: 'm-1' }));
  assert.equal(answer.valid, true);
  assert.equal(Mail.replyState(answer.entries[0], answer.entries, NOW).state, 'answered');
  assert.equal(Mail.pending(answer.entries, 1, NOW).length, 0);
});

test('po terminie i „odpowiedź niewymagana”', () => {
  const list = Mail.create([], 1, Object.assign({}, base, { registeredDate: '2026-09-01', replyDue: '2026-09-20' })).entries;
  const s = Mail.replyState(list[0], list, NOW);
  assert.equal(s.state, 'overdue');
  assert.equal(s.days, -12);
  assert.equal(Mail.pending(list, 1, NOW)[0].entry.id, 'm-1');
  const waived = Object.assign({}, list[0], { noReply: true });
  assert.equal(Mail.replyState(waived, [waived], NOW).state, 'none');
});

test('edycja zachowuje numer, zmiana kierunku nadaje nowy; usunięcie odpina odpowiedzi', () => {
  let list = Mail.create([], 1, base).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { direction: 'out', replyTo: 'm-1', replyDue: '' })).entries;
  const edited = Mail.update(list, 'm-1', Object.assign({}, base, { subject: 'Nowy temat' }));
  assert.equal(edited.entry.regNo, 'P/2026/001');
  const flipped = Mail.update(list, 'm-1', Object.assign({}, base, { direction: 'out', replyDue: '' }));
  assert.equal(flipped.valid, false, 'wychodzące odpowiedziałoby samo sobie w tym samym kierunku');
  const after = Mail.remove(list, 'm-1');
  assert.equal(after.length, 1);
  assert.equal(after[0].replyTo, '');
});

test('filtr: kierunek, oczekujące, szukanie; najnowsze pierwsze', () => {
  let list = Mail.create([], 1, Object.assign({}, base, { subject: 'Alfa', registeredDate: '2026-09-01', replyDue: '2026-09-10' })).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { direction: 'out', subject: 'Beta', counterparty: 'Urząd Miasta', registeredDate: '2026-09-20', replyDue: '' })).entries;
  list = Mail.create(list, 1, Object.assign({}, base, { subject: 'Gamma', registeredDate: '2026-09-25', replyDue: '' })).entries;
  assert.deepEqual(Mail.filter(list, {}).map((e) => e.subject), ['Gamma', 'Beta', 'Alfa']);
  assert.deepEqual(Mail.filter(list, { direction: 'out' }).map((e) => e.subject), ['Beta']);
  assert.deepEqual(Mail.filter(list, { waiting: true, now: NOW }).map((e) => e.subject), ['Alfa']);
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
