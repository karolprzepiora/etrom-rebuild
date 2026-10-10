'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core/calendar.js');

test('Wielkanoc i święta ruchome', () => {
  assert.equal(C.easter(2026), '2026-04-05');
  assert.equal(C.easter(2025), '2025-04-20');
  assert.equal(C.holidayName('2026-04-06'), 'Poniedziałek Wielkanocny');
  assert.equal(C.holidayName('2026-06-04'), 'Boże Ciało');
  assert.equal(C.holidayName('2026-11-11'), 'Święto Niepodległości');
  assert.equal(C.holidayName('2026-12-24'), 'Wigilia');
  assert.equal(C.holidayName('2024-12-24'), '');
  assert.equal(C.holidayName('2026-10-05'), '');
});

test('dni robocze, tydzień ISO, poniedziałek, siatka miesiąca', () => {
  assert.equal(C.workdaysIn('2026-10-12', '2026-10-16'), 5);
  assert.equal(C.workdaysIn('2026-10-30', '2026-11-03'), 3); // pt 30.10, pn 2.11, wt 3.11 (1.11 to niedziela)
  assert.equal(C.workdaysIn('2026-11-09', '2026-11-13'), 4);  // 11.11 święto
  assert.equal(C.workdaysIn('2026-10-16', '2026-10-12'), 0);
  assert.equal(C.weekNumber('2026-10-05'), 41);
  assert.equal(C.mondayOf('2026-10-04'), '2026-09-28');
  const g = C.monthGrid(2026, 9);
  assert.equal(g.length, 42);
  assert.equal(g[0], '2026-09-28');
  assert.equal(g[41], '2026-11-08');
});

test('wpisywanie dat: skróty, dni tygodnia, daty z kropką', () => {
  const base = '2026-10-04'; // niedziela
  assert.equal(C.parseInput('jutro', base), '2026-10-05');
  assert.equal(C.parseInput('+2t', base), '2026-10-18');
  assert.equal(C.parseInput('+3 dni', base), '2026-10-07');
  assert.equal(C.parseInput('pn', base), '2026-10-05');
  assert.equal(C.parseInput('nd', base), '2026-10-11');
  assert.equal(C.parseInput('16.10', base), '2026-10-16');
  assert.equal(C.parseInput('1.3.27', base), '2027-03-01');
  assert.equal(C.parseInput('2026-12-01', base), '2026-12-01');
  assert.equal(C.parseInput('12', base), '2026-10-12');
  assert.equal(C.parseInput('31.02', base), null);
  assert.equal(C.parseInput('abc', base), null);
  assert.equal(C.parseInput('  ', base), '');
});

test('dni wolne firmy liczą się jak święta, dopóki są ustawione', () => {
  const C = require('../src/core/calendar.js');
  assert.equal(C.isWorkday('2026-05-04'), true);
  C.setExtraHolidays([{ date: '2026-05-04', name: 'Majówka' }]);
  assert.equal(C.holidayName('2026-05-04'), 'Majówka');
  assert.equal(C.isCompanyDay('2026-05-04'), true);
  assert.equal(C.isCompanyDay('2026-05-03'), false);
  assert.equal(C.workdaysIn('2026-05-04', '2026-05-05'), 1);
  C.setExtraHolidays([]);
  assert.equal(C.isWorkday('2026-05-04'), true);
});
