'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/core/format.js');

const NOW = new Date(2026, 9, 2);

test('odmiana przez liczby według polskich reguł', () => {
  const forms = ['projekt', 'projekty', 'projektów'];
  const expected = { 0: 'projektów', 1: 'projekt', 2: 'projekty', 4: 'projekty', 5: 'projektów',
    11: 'projektów', 12: 'projektów', 14: 'projektów', 21: 'projektów', 22: 'projekty', 104: 'projekty', 112: 'projektów' };
  Object.keys(expected).forEach((n) => assert.equal(F.plural(Number(n), ...forms), expected[n], 'n=' + n));
});

test('count łączy liczbę z formą spacją nierozdzielającą', () => {
  assert.equal(F.count(3, 'osoba', 'osoby', 'osób'), '3 osoby');
  assert.equal(F.count(1, 'osoba', 'osoby', 'osób'), '1 osoba');
});

test('liczby grupowane od pięciu cyfr', () => {
  assert.equal(F.number(746), '746');
  assert.equal(F.number(1240), '1240');
  assert.equal(F.number(12400), '12 400');
  assert.equal(F.number(1234567), '1 234 567');
  assert.equal(F.number('x'), '—');
  assert.equal(F.hours(424), '424 h');
});

test('data krótka pomija bieżący rok, pokazuje inny', () => {
  assert.equal(F.date('2026-10-12', { now: NOW }), '12 paź');
  assert.equal(F.date('2027-01-03', { now: NOW }), '3 sty 2027');
  assert.equal(F.date('2026-10-12', { now: NOW, year: 'always' }), '12 paź 2026');
  assert.equal(F.date('', { now: NOW }), '');
  assert.equal(F.date('kiedyś', { now: NOW }), '');
});

test('data z godziną i forma pełna', () => {
  assert.equal(F.dateTime('2026-10-12T09:05', { now: NOW }), '12 paź, 09:05');
  assert.equal(F.dateTime('2026-10-12', { now: NOW }), '12 paź');
  assert.equal(F.dateLong('2026-10-12'), '12 października 2026');
});

test('procent zaokrąglony', () => {
  assert.equal(F.percent(56.6), '57%');
  assert.equal(F.percent(null), '0%');
  assert.equal(F.percent('abc'), '—');
});
