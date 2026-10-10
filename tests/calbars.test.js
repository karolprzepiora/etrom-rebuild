'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Cal = require('../src/core/calendar.js');

globalThis.ETROM = { Dom: { el() { return {}; } }, Calendar: Cal };
require('../src/ui/calBars.js');
const CB = globalThis.ETROM.CalBars;

test('kindOf: wniosek ma pierwszeństwo, reszta wg rodzaju', () => {
  assert.equal(CB.kindOf('leave', true), 'req');
  assert.equal(CB.kindOf('leave', false), 'leave');
  assert.equal(CB.kindOf('sick', false), 'sick');
  assert.equal(CB.kindOf('training', false), 'other');
  assert.equal(CB.kindOf('other', false), 'other');
});

test('top: L4 przed urlopem, urlop przed wnioskiem', () => {
  assert.equal(CB.top(['req', 'leave']), 'leave');
  assert.equal(CB.top(['leave', 'sick']), 'sick');
  assert.equal(CB.top(['other', 'req']), 'req');
  assert.equal(CB.top([]), null);
});

test('stripCls: początek i koniec ciągu dni tego samego rodzaju', () => {
  const kinds = { '2026-10-12': 'leave', '2026-10-13': 'leave', '2026-10-14': 'leave', '2026-10-15': 'sick' };
  const at = (k) => kinds[k] || null;
  assert.match(CB.stripCls(at, '2026-10-12'), /is-k-leave is-s$/);
  assert.equal(CB.stripCls(at, '2026-10-13'), ' is-strip is-k-leave');
  assert.match(CB.stripCls(at, '2026-10-14'), /is-k-leave is-e$/);
  assert.match(CB.stripCls(at, '2026-10-15'), /is-k-sick is-s is-e$/);
  assert.equal(CB.stripCls(at, '2026-10-20'), '');
});
