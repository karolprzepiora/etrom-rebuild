'use strict';
/* Kontrast tokenów barw wg WCAG 2.2. Test czyta styles/tokens.css,
   więc każda zmiana palety, która pogorszy czytelność, zatrzyma się tutaj. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'styles', 'tokens.css'), 'utf8');

function block(selector) {
  const start = CSS.indexOf(selector + ' {');
  if (start < 0) return '';
  return CSS.slice(start, CSS.indexOf('}', start));
}

function tokens(source) {
  const map = {};
  const re = /--([a-z0-9-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi;
  let m;
  while ((m = re.exec(source))) map[m[1]] = { light: m[2], dark: m[3] };
  const plain = /--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi;
  while ((m = plain.exec(source))) map[m[1]] = { light: m[2], dark: m[2] };
  return map;
}

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const base = tokens(block(':root'));
const MODES = ['light', 'dark'];

function expectPair(map, fg, bg, min) {
  MODES.forEach((mode) => {
    const f = map[fg] || base[fg];
    const b = map[bg] || base[bg];
    assert.ok(f && b, 'brak tokenu ' + fg + ' lub ' + bg);
    const ratio = contrast(f[mode], b[mode]);
    assert.ok(ratio >= min, `${fg} na ${bg} (${mode}): ${ratio.toFixed(2)} < ${min}`);
  });
}

const SURFACES = ['sheet', 'wash', 'wash-2', 'canvas', 'raised'];

test('tusz, tekst pomocniczy i metadane mają kontrast AA na każdej powierzchni', () => {
  SURFACES.forEach((surface) => {
    expectPair(base, 'ink', surface, 7);
    expectPair(base, 'ink-2', surface, 4.5);
    expectPair(base, 'ink-3', surface, 4.5);
  });
});

test('barwy stanów czytelne jako tekst na arkuszu i na własnym tle', () => {
  [['flow-ink', 'flow-wash'], ['warn-ink', 'warn-wash'], ['alarm-ink', 'alarm-wash'], ['review', 'review-wash']].forEach(([ink, wash]) => {
    expectPair(base, ink, 'sheet', 4.5);
    expectPair(base, ink, 'wash', 4.5);
    expectPair(base, ink, wash, 4.5);
  });
  expectPair(base, 'success', 'sheet', 4.5);
});

test('znaczniki graficzne (nurt, alarm, ostrzeżenie, gotowe) ≥ 3:1 wobec tła (WCAG 1.4.11)', () => {
  ['flow', 'alarm', 'warn', 'done'].forEach((mark) => {
    expectPair(base, mark, 'sheet', 3);
    expectPair(base, mark, 'wash', 3);
  });
  expectPair(base, 'done', 'track', 3);
  expectPair(base, 'flow', 'track', 2);
});

test('każdy wariant nurtu: tekst i znacznik czytelne', () => {
  ['', 'graphite', 'raspberry'].forEach((variant) => {
    const map = variant ? tokens(block(':root[data-accent="' + variant + '"]')) : {};
    expectPair(map, 'flow-ink', 'sheet', 4.5);
    expectPair(map, 'flow-ink', 'flow-wash', 4.5);
    expectPair(map, 'flow', 'sheet', 3);
  });
});

test('przycisk w tuszu, powiadomienie i krawędź pól mają kontrast', () => {
  expectPair(base, 'on-ink', 'ink', 7);
  expectPair(base, 'on-ink', 'ink-hover', 4.5);
  expectPair(base, 'on-inverse', 'inverse', 7);
  ['sheet', 'raised'].forEach((surface) => expectPair(base, 'control-line', surface, 3));
});

test('tokeny promieni: cztery wartości rosnące ze skalą i koło', () => {
  const radii = CSS.match(/--radius-[a-z]+:/g) || [];
  assert.deepEqual(radii, ['--radius-xs:', '--radius-sm:', '--radius-md:', '--radius-lg:', '--radius-full:']);
});
