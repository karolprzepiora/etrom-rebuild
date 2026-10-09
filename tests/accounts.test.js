'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/core/accounts.js');
const Team = require('../src/core/team.js');

const mk = (id, extra) => Object.assign({ id, firstName: id, lastName: 'T', orgRole: 'member', active: true }, extra || {});

test('hasło tymczasowe: format, brak mylących znaków, deterministyczne z rand', () => {
  const pw = A.generatePassword();
  assert.match(pw, /^[A-Za-z2-9]{3}-[A-Za-z2-9]{3}-[A-Za-z2-9]{3}$/);
  assert.ok(!/[01OIl]/.test(pw));
  assert.equal(A.generatePassword(() => 0), 'AAA-AAA-AAA');
});

test('e-mail: poprawność i unikalność bez względu na wielkość liter', () => {
  assert.ok(A.validEmail('a@b.pl'));
  assert.ok(!A.validEmail('a@b'));
  assert.ok(A.emailTaken([mk('p-1', { email: 'a@b.pl' })], 'A@B.PL'));
  assert.ok(!A.emailTaken([mk('p-1', { email: 'a@b.pl' })], 'a@b.pl', 'p-1'));
});

test('validatePerson: e-mail i wymiar urlopu', () => {
  const people = [mk('p-1', { email: 'a@b.pl' })];
  const bad = Team.validatePerson({ firstName: 'X', lastName: 'Y', email: 'a@b.pl' }, people);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.email);
  assert.ok(Team.validatePerson({ firstName: 'X', lastName: 'Y', email: 'zle' }, people).errors.email);
  assert.ok(Team.validatePerson({ firstName: 'X', lastName: 'Y', leaveDays: 99 }, people).errors.leaveDays);
  const ok = Team.validatePerson({ firstName: 'X', lastName: 'Y', email: ' X@Y.PL ', leaveDays: '20' }, people);
  assert.equal(ok.value.email, 'x@y.pl');
  assert.equal(ok.value.leaveDays, 20);
});

test('stawki z historią: obowiązuje ta z najnowszą datą nieprzekraczającą dnia', () => {
  let p = mk('p-1', { hourlyCost: 100 });
  p = A.addRate(p, 110, '2025-07-01', '2026-10-09').person;
  p = A.addRate(p, 120, '2026-01-01', '2026-10-09').person;
  assert.equal(A.rateOn(p, '2025-08-01'), 110);
  assert.equal(A.rateOn(p, '2026-10-09'), 120);
  assert.equal(p.hourlyCost, 120);
  assert.equal(p.rates.length, 3);
  // stawka z przyszłości nie zmienia bieżącej
  p = A.addRate(p, 150, '2027-01-01', '2026-10-09').person;
  assert.equal(p.hourlyCost, 120);
  assert.equal(A.addRate(p, -5, '2026-01-01').ok, false);
  assert.equal(A.addRate(p, 100, 'x').ok, false);
});

test('konto: założenie, reset, wyłączenie i przywrócenie', () => {
  let p = A.createAccount(mk('p-1'), 'p-9', new Date('2026-10-09T08:00:00Z'));
  assert.equal(A.statusOf(p), 'invited');
  assert.equal(p.account.mustChange, true);
  const dis = A.disable([p, mk('p-9', { orgRole: 'managing', account: { status: 'active' } })], 'p-1');
  assert.ok(dis.ok);
  const off = dis.people[0];
  assert.equal(off.active, false);
  assert.equal(A.statusOf(off), 'disabled');
  const back = A.enable(dis.people, 'p-1')[0];
  assert.equal(back.active, true);
  assert.equal(A.statusOf(back), 'invited');
  assert.equal(A.resetPassword(back).account.mustChange, true);
});

test('nie da się wyłączyć ani zdegradować ostatniej dyrekcji', () => {
  const only = mk('p-1', { orgRole: 'managing', account: { status: 'active' } });
  const list = [only, mk('p-2')];
  assert.equal(A.disable(list, 'p-1').ok, false);
  assert.equal(A.setRole(list, 'p-1', 'member').ok, false);
  const two = list.concat([mk('p-3', { orgRole: 'managing', account: { status: 'active' } })]);
  assert.ok(A.disable(two, 'p-1').ok);
  assert.ok(A.setRole(two, 'p-1', 'member').ok);
  assert.equal(A.setRole(two, 'p-2', 'managing').people[1].orgRole, 'managing');
});

test('dziennik zmian: normalizacja i limit', () => {
  let log = [];
  for (let i = 0; i < 520; i += 1) log = A.addAudit(log, { by: 'p-1', action: 'role.change', target: 'p-2' }, new Date(2026, 0, 1, 0, 0, i));
  assert.equal(log.length, 500);
  assert.deepEqual(A.normalizeAudit([{ action: 'zly', at: '2026-01-01T00:00:00Z' }, null]), []);
});

test('normalizePeople zachowuje konto, stawki i e-mail', () => {
  const [p] = Team.normalizePeople([{ id: 'p-1', firstName: 'A', lastName: 'B', email: 'A@B.pl', account: { status: 'active', mustChange: false }, rates: [{ from: '2026-01-01', rate: 120 }, { from: 'zla', rate: 1 }] }]);
  assert.equal(p.email, 'a@b.pl');
  assert.equal(p.account.status, 'active');
  assert.equal(p.rates.length, 1);
});
