'use strict';
/* Kontrast tokenów w stylach wyglądu (styles/looks.css) wg WCAG 2.2.
   Styl nadpisuje część tokenów stałymi barwami; reszta pochodzi z tokens.css dla schematu, który styl wymusza. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Prefs = require('../src/core/prefs.js');

const ROOT = path.join(__dirname, '..', 'styles');
const TOKENS = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
const LOOKS = fs.readFileSync(path.join(ROOT, 'looks.css'), 'utf8');

function block(css, selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) return '';
  return css.slice(start, css.indexOf('\n}', start));
}

function baseTokens(mode) {
  const map = {};
  const src = block(TOKENS, ':root');
  let m;
  const ld = /--([a-z0-9-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi;
  while ((m = ld.exec(src))) map[m[1]] = mode === 'light' ? m[2] : m[3];
  const plain = /--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi;
  while ((m = plain.exec(src))) map[m[1]] = m[2];
  return map;
}

function overrides(look) {
  const src = block(LOOKS, 'html[data-look="' + look + '"]');
  const map = {};
  const re = /--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi;
  let m;
  while ((m = re.exec(src))) map[m[1]] = m[2];
  return map;
}

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

Prefs.LOOKS.filter((l) => l.scheme).forEach((look) => {
  test('styl ' + look.label + ': tekst i znaczniki mają kontrast WCAG na każdej powierzchni', () => {
    const t = Object.assign(baseTokens(look.scheme), overrides(look.value));
    ['sheet', 'wash', 'wash-2', 'raised', 'canvas'].forEach((surface) => {
      assert.ok(t[surface], 'brak powierzchni ' + surface);
      [['ink', 7], ['ink-2', 4.5], ['ink-3', 4.5], ['flow-ink', 4.5], ['alarm-ink', 4.5], ['warn-ink', 4.5]].forEach(([fg, min]) => {
        const r = ratio(t[fg], t[surface]);
        assert.ok(r >= min, `${look.value}: ${fg} na ${surface}: ${r.toFixed(2)} < ${min}`);
      });
      ['flow', 'alarm', 'warn'].forEach((mark) => {
        const r = ratio(t[mark], t[surface]);
        assert.ok(r >= 3, `${look.value}: znacznik ${mark} na ${surface}: ${r.toFixed(2)} < 3`);
      });
    });
    assert.ok(ratio(t['line-strong'], t.sheet) >= 1.3, 'linie muszą być widoczne');
  });
});

test('każdy styl z wymuszonym schematem ma swój blok w looks.css', () => {
  Prefs.LOOKS.filter((l) => l.scheme).forEach((l) => assert.ok(block(LOOKS, 'html[data-look="' + l.value + '"]'), l.value));
});
