'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/core/ambient.js');

test('pogoda i stany wód są oznaczone jako przykładowe i deterministyczne', () => {
  const now = new Date(2026, 9, 9, 8, 0);
  const w = A.weather('Kraków', now);
  assert.equal(w.sample, true);
  assert.equal(w.days.length, 4);
  assert.deepEqual(A.weather('Kraków', now), w);
  const lv = A.waterLevels(now);
  assert.equal(lv.length, 3);
  lv.forEach(l => { assert.equal(l.sample, true); assert.equal(l.series.length, 12); assert.ok(['ok', 'warn', 'alarm'].includes(l.status)); });
  assert.equal(A.statusOf(400, { warn: 300, alarm: 380 }), 'alarm');
  assert.equal(A.statusOf(310, { warn: 300, alarm: 380 }), 'warn');
  assert.equal(A.statusOf(100, { warn: 300, alarm: 380 }), 'ok');
});
