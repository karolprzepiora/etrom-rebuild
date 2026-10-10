'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LC = require('../src/core/leavecard.js');
const Team = require('../src/core/team.js');

const p = { id: 'p-1', name: 'Jan', surname: 'Kowalski', active: true, leaveDays: 26 };
const list = [
  { id: 'a1', personId: 'p-1', kind: 'leave', from: '2026-03-02', to: '2026-03-06', status: 'approved' },
  { id: 'a2', personId: 'p-1', kind: 'sick', from: '2026-04-01', to: '2026-04-02', status: 'approved', note: 'tajne' },
  { id: 'a3', personId: 'p-1', kind: 'leave', from: '2026-07-06', to: '2026-07-07', status: 'pending' }
];

test('karta urlopowa: wiersze bez L4, sumy i CSV', () => {
  const c = LC.build(list, p, 2026, new Date(2026, 9, 10));
  assert.equal(c.rows.length, 2);
  assert.equal(c.rows[0].days, 5);
  assert.ok(!JSON.stringify(c).includes('tajne'));
  assert.ok(LC.csvRows(c, {}).length > 10);
  assert.match(LC.html(c, { autoPrint: true }), /Karta urlopowa 2026[\s\S]*window\.print/);
  assert.equal(LC.team(list, [p], 2026, new Date(2026, 9, 10)).length, 1);
  assert.match(LC.teamHtml([c], 2026, {}), /Zestawienie urlopów 2026/);
});
