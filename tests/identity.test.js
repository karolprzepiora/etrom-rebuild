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

test('paleta ma 40 różnych kolorów, a 12 głównych leży poza czerwienią', () => {
  const Identity = require('../src/core/identity.js');
  const all = Identity.swatches();
  assert.equal(all.length, 40);
  assert.equal(new Set(all.map((c) => c.hue + ':' + c.tone)).size, 40);
  const core = all.slice(0, 12);
  assert.ok(core.every((c) => c.hue >= 55 && c.hue <= 340), 'bez czerwieni i bursztynu');
  assert.equal(new Set(core.map((c) => c.hue)).size, 12);
});

test('12 kolejnych numerów projektów dostaje 12 różnych kolorów, a siedem pierwszych dzieli ≥ 25° barwy lub ≥ 0,5 tonu', () => {
  const Identity = require('../src/core/identity.js');
  Identity.setColors([]);
  const seen = new Set();
  for (let n = 1; n <= 12; n += 1) seen.add(Identity.colorIndex('26' + String(n).padStart(2, '0')));
  assert.equal(seen.size, 12);
  const sw = []; for (let n = 1; n <= 7; n += 1) sw.push(Identity.swatch(Identity.colorIndex('26' + String(n).padStart(2, '0'))));
  for (let i = 0; i < sw.length; i += 1) for (let j = i + 1; j < sw.length; j += 1) {
    const dh = Math.min(Math.abs(sw[i].hue - sw[j].hue), 360 - Math.abs(sw[i].hue - sw[j].hue));
    assert.ok(dh >= 25 || Math.abs(sw[i].tone - sw[j].tone) >= 0.5, 'projekty ' + i + ' i ' + j + ' się zlewają');
  }
});

test('kolor wybrany ręcznie wygrywa z automatycznym', () => {
  const Identity = require('../src/core/identity.js');
  Identity.setColors([{ code: '2601', color: 5 }, { code: '2602', color: 99 }]);
  assert.equal(Identity.colorIndex('2601'), 5);
  assert.equal(Identity.colorIndex('2602'), Identity.autoIndex('2602'), 'zły indeks jest ignorowany');
  Identity.setColors([]);
  assert.equal(Identity.tileHue('2601'), Identity.tileHue('2601'));
});

test('tryb „według rodzaju”: ten sam rodzaj ma jedną rodzinę barw, a numer tylko ją odcienia', () => {
  global.ETROM = { Kinds: { of: (p) => p.kind } };
  Identity.setColors([{ code: '2601', kind: 'pump' }, { code: '2602', kind: 'pump' }, { code: '2603', kind: 'weir' }, { code: '2604', kind: 'pump', color: 5 }]);
  Identity.setMode('kind');
  const a = Identity.tileHue('2601'), b = Identity.tileHue('2602'), c = Identity.tileHue('2603');
  assert.ok(Math.abs(a - b) <= 24, 'dwie pompownie w jednej rodzinie');
  assert.ok(Math.abs(a - c) > 40, 'jaz ma inną rodzinę');
  assert.equal(Identity.tileHue('2604'), Identity.swatch(5).hue, 'ręczny wybór wygrywa');
  Identity.setMode('number');
  assert.equal(Identity.tileHue('2601'), Identity.swatch(Identity.autoIndex('2601')).hue);
  Identity.setColors([]); delete global.ETROM;
});
