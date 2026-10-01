'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Identity = require('../src/core/identity.js');

test('ten sam kod zawsze daje tę samą barwę', () => {
  assert.equal(Identity.hue('DEMO-001'), Identity.hue('DEMO-001'));
  assert.deepEqual(Identity.coverStyle('W-7'), Identity.coverStyle('W-7'));
});

test('wielkość liter nie zmienia identyfikacji projektu', () => {
  assert.equal(Identity.hue('demo-001'), Identity.hue('DEMO-001'));
});

test('barwa mieści się w pełnym kole', () => {
  ['A', 'DEMO-001', 'W-2026-014', '', 'ŁĄKA-1'].forEach((code) => {
    const value = Identity.hue(code);
    assert.ok(Number.isInteger(value) && value >= 0 && value < 360, 'barwa dla "' + code + '": ' + value);
  });
});

test('kolejne kody projektów nie dostają zbliżonych barw', () => {
  const a = Identity.hue('DEMO-001');
  const b = Identity.hue('DEMO-002');
  const distance = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  assert.ok(distance > 20, 'sąsiednie kody różnią się o ' + distance + '°');
});

test('coverStyle zwraca komplet zmiennych CSS', () => {
  const style = Identity.coverStyle('DEMO-003');
  assert.deepEqual(Object.keys(style).sort(), ['--cover-a', '--cover-angle', '--cover-b']);
  assert.match(style['--cover-a'], /^hsl\(\d+ 30% 42%\)$/);
  assert.match(style['--cover-b'], /^hsl\(\d+ 34% 27%\)$/);
  assert.match(style['--cover-angle'], /^\d+deg$/);
});

test('inicjały budują się z imienia i nazwiska', () => {
  assert.equal(Identity.initials('Anna Testowa'), 'AT');
  assert.equal(Identity.initials('Michał Jan Testowy'), 'MT');
  assert.equal(Identity.initials('Olga'), 'OL');
  assert.equal(Identity.initials('  '), '?');
  assert.equal(Identity.initials(null), '?');
});

test('inicjały zachowują polskie znaki', () => {
  assert.equal(Identity.initials('Łukasz Żuk'), 'ŁŻ');
});
