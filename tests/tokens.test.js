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

const SURFACES = ['bg-surface', 'bg-canvas', 'bg-subtle', 'bg-raised', 'bg-hover'];

test('tekst podstawowy, pomocniczy i metadane mają kontrast AA na każdej powierzchni', () => {
  SURFACES.forEach((surface) => {
    expectPair(base, 'text-primary', surface, 7);
    expectPair(base, 'text-secondary', surface, 4.5);
    expectPair(base, 'text-tertiary', surface, 4.5);
  });
});

test('barwy stanów są czytelne jako tekst na tle strony i na własnym tle', () => {
  ['success', 'warning', 'danger', 'info', 'review', 'neutral'].forEach((tone) => {
    expectPair(base, tone, 'bg-surface', 4.5);
    expectPair(base, tone, tone + '-soft', 4.5);
  });
});

test('każdy wariant akcentu: tekst na wypełnieniu i akcent jako tekst', () => {
  ['', 'hydro', 'graphite'].forEach((variant) => {
    const map = variant ? tokens(block(':root[data-accent="' + variant + '"]')) : {};
    expectPair(map, 'on-accent', 'accent-fill', 4.5);
    expectPair(map, 'on-accent', 'accent-fill-hover', 4.5);
    expectPair(map, 'accent', 'bg-surface', 4.5);
    expectPair(map, 'accent', 'accent-soft', 4.5);
  });
});

test('przycisk niszczący i powiadomienie mają kontrast AA', () => {
  expectPair({ white: { light: '#ffffff', dark: '#ffffff' } }, 'white', 'danger-fill', 4.5);
  expectPair(base, 'text-inverse', 'bg-inverse', 7);
});

test('krawędzie kontrolek odróżniają się od tła (WCAG 1.4.11, 3:1 dla krawędzi mocnej)', () => {
  ['bg-surface', 'bg-subtle', 'bg-raised'].forEach((surface) => expectPair(base, 'border-control', surface, 3));
  expectPair(base, 'progress-fill', 'progress-track', 3);
});

test('tokeny promieni: dokładnie trzy wartości i koło', () => {
  const radii = CSS.match(/--radius-[a-z]+:/g) || [];
  assert.deepEqual(radii, ['--radius-sm:', '--radius-md:', '--radius-lg:', '--radius-full:']);
});
