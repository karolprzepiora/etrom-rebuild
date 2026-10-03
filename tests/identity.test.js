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

test('paleta ma 40 różnych kolorów, poza czerwienią i bursztynem', () => {
  const Identity = require('../src/core/identity.js');
  const all = Identity.swatches();
  assert.equal(all.length, 40);
  assert.equal(new Set(all.map((c) => c.hue + ':' + c.tone)).size, 40);
  assert.ok(all.every((c) => c.hue >= 105 && c.hue <= 350));
});

test('kolejne numery projektów w roku dostają różne kolory (40 z rzędu bez powtórki)', () => {
  const Identity = require('../src/core/identity.js');
  Identity.setColors([]);
  const seen = new Set();
  for (let n = 1; n <= 40; n += 1) seen.add(Identity.colorIndex('26' + String(n).padStart(2, '0')));
  assert.equal(seen.size, 40);
  const a = Identity.swatch(Identity.colorIndex('2601')), b = Identity.swatch(Identity.colorIndex('2602'));
  assert.ok(Math.abs(a.hue - b.hue) > 60, 'sąsiednie numery są wyraźnie różne');
});

test('kolor wybrany ręcznie wygrywa z automatycznym', () => {
  const Identity = require('../src/core/identity.js');
  Identity.setColors([{ code: '2601', color: 5 }, { code: '2602', color: 99 }]);
  assert.equal(Identity.colorIndex('2601'), 5);
  assert.equal(Identity.colorIndex('2602'), Identity.autoIndex('2602'), 'zły indeks jest ignorowany');
  Identity.setColors([]);
  assert.equal(Identity.tileHue('2601'), Identity.tileHue('2601'));
});
