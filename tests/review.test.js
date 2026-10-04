'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Review = require('../src/core/review.js');

const at = (y, mo, d, h, m = 0) => new Date(y, mo - 1, d, h, m);
const NOW = at(2026, 10, 7, 9);   // środa

const people = [{ id: 'p-1', active: true }, { id: 'p-2', active: true }];
const mkTask = (id, extra) => Object.assign({ id, name: 'Zadanie ' + id, status: 'working', assignees: ['p-1'], deadline: '2026-10-09T16:00', estimate: 4 }, extra);
const project = (id, code, status, tasks, hours) => ({ id, code, name: 'Projekt ' + code, status, stages: [{ id: 's1', hours: hours || 100, tasks }] });

test('przegląd tygodnia zbiera przeciążenia, spóźnione i ciasne zadania, projekty bez ruchu, niską normę i pisma', () => {
  const projects = [
    project(1, '2601', 'active', [mkTask('t1', { estimate: 70, deadline: '2026-10-09T16:00' }), mkTask('t2', { deadline: '2026-10-01T16:00' })]),
    project(2, '2602', 'active', [mkTask('t3', { assignees: ['p-2'] })]),
    project(3, '2603', 'done', [mkTask('t4', { deadline: '2026-09-01T16:00' })])
  ];
  const entries = [
    { id: 'e1', personId: 'p-2', projectId: 1, stageId: 's1', taskId: 't1', label: 'x', start: at(2026, 10, 6, 8).toISOString(), end: at(2026, 10, 6, 16).toISOString() },
    { id: 'e2', personId: 'p-1', projectId: 1, stageId: 's1', taskId: 't1', label: 'x', start: at(2026, 9, 29, 8).toISOString(), end: at(2026, 9, 29, 10).toISOString() }
  ];
  const mail = [{ id: 'm1', projectId: 1, needsAction: true }, { id: 'm2', projectId: 1, needsAction: false }, { id: 'm3', projectId: 3, needsAction: true }];
  const r = Review.build({ projects, people, entries, mail, now: NOW });
  assert.ok(r.overload.length >= 1 && r.overload[0].personId === 'p-1', '70 h w 3 dni to przeciążenie p-1');
  assert.deepEqual(r.late.map(l => l.taskId), ['t2'], 'zakończony projekt pominięty');
  assert.equal(r.late[0].daysLate, 6);
  assert.ok(r.tight.some(t => t.taskId === 't1' && t.squeezed));
  assert.deepEqual(r.idle.map(i => i.code), ['2602'], '2602 nie ma żadnego śladu aktywności');
  assert.equal(r.idle[0].days, null);
  assert.deepEqual(r.mail.map(m => [m.code, m.count]), [['2601', 1]]);
  const low = r.lowTime.find(l => l.personId === 'p-1');
  assert.ok(low && low.minutes === 120 && low.badDays >= 1, 'p-1 poprzedni tydzień: 2 h');
  assert.equal(r.total, r.overload.length + r.late.length + r.tight.length + r.idle.length + r.lowTime.length + r.mail.length);
});

test('zakres: lider widzi tylko swoje projekty i ich osoby', () => {
  const projects = [project(1, '2601', 'active', [mkTask('t1', { deadline: '2026-10-01T16:00' })]), project(2, '2602', 'active', [mkTask('t2', { assignees: ['p-2'], deadline: '2026-10-01T16:00' })])];
  const r = Review.build({ projects, people, entries: [], now: NOW, projectIds: [1], personIds: ['p-1'] });
  assert.deepEqual(r.late.map(l => l.taskId), ['t1']);
  assert.ok(r.lowTime.every(l => l.personId === 'p-1'));
});
