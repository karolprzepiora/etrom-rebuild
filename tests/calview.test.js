'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CV = require('../src/core/calview.js');

const people = [{ id: 'p-1', active: true, orgRole: 'managing' }, { id: 'p-2', active: true }, { id: 'p-3', active: true }];
const projects = [
  { id: 1, code: '2601', name: 'Przepust', status: 'active', deadline: '2026-10-16', team: { leader: 'p-2', members: ['p-3'] }, stages: [
    { id: 's1', name: 'Koncepcja', status: 'active', deadline: '2026-10-09', tasks: [
      { id: 't1', name: 'Zebrać warunki', status: 'working', assignees: ['p-3'], deadline: '2026-10-06T16:00' },
      { id: 't2', name: 'Cudze', status: 'todo', assignees: ['p-2'], deadline: '2026-10-07T16:00' }] }] },
  { id: 2, code: '2602', name: 'Zbiornik', status: 'active', deadline: '2026-10-20', team: { leader: 'p-2', members: [] }, stages: [] }
];
const absences = [{ id: 'a1', personId: 'p-3', from: '2026-10-12', to: '2026-10-14', kind: 'leave' }, { id: 'a2', personId: 'p-2', from: '2026-10-19', to: '2026-10-19', kind: 'sick' }];
const base = { projects, people, absences, now: new Date(2026, 9, 5, 10), year: 2026, month: 9 };
const cell = (r, key) => r.cells.filter((c) => c.key === key)[0];

test('siatka miesiąca: 42 dni, numery tygodni w poniedziałki, święta i dziś', () => {
  const r = CV.build(Object.assign({ meId: 'p-1' }, base));
  assert.equal(r.title, 'październik 2026');
  assert.equal(r.cells.length, 42);
  assert.equal(cell(r, '2026-10-05').today, true);
  assert.equal(cell(r, '2026-10-05').weekNumber, 41);
  assert.equal(cell(r, '2026-10-06').weekNumber, 0);
  assert.equal(cell(r, '2026-11-01').out, true);
  assert.equal(cell(r, '2026-11-01').holiday, 'Wszystkich Świętych');
});

test('zarząd widzi terminy projektów, etapów, zadania osób w zakresie i wszystkie nieobecności', () => {
  const r = CV.build(Object.assign({ meId: 'p-1' }, base));
  assert.deepEqual(cell(r, '2026-10-16').events.map((e) => e.kind), ['project']);
  assert.deepEqual(cell(r, '2026-10-09').events.map((e) => e.kind), ['stage']);
  assert.equal(cell(r, '2026-10-06').events.length, 1, 'zarząd widzi zadania osób w zakresie');
  assert.equal(cell(r, '2026-10-06').events[0].kind, 'task');
  assert.deepEqual(cell(r, '2026-10-06').events[0].assigneeIds, ['p-3']);
  assert.equal(cell(r, '2026-10-13').events[0].kind, 'absence');
  assert.equal(cell(r, '2026-10-19').events[0].sub, 'Zwolnienie');
});

test('pracownik widzi własne zadania, terminy swoich projektów i nieobecności zespołu', () => {
  const r = CV.build(Object.assign({ meId: 'p-3' }, base));
  assert.deepEqual(cell(r, '2026-10-06').events.map((e) => e.kind), ['task']);
  assert.equal(cell(r, '2026-10-07').events.length, 0, 'cudze zadanie');
  assert.deepEqual(cell(r, '2026-10-16').events.map((e) => e.kind), ['project']);
  assert.equal(cell(r, '2026-10-20').events.length, 0, 'projekt, w którym nie jest w zespole');
  assert.equal(cell(r, '2026-10-09').events.length, 0, 'terminy etapów tylko dla zarządu i lidera');
  assert.equal(cell(r, '2026-10-19').events.length, 1, 'cudza nieobecność jest widoczna dla wszystkich');
  assert.equal(cell(r, '2026-10-13').events.length, 1);
});

test('lider widzi swój zespół i etapy swoich projektów', () => {
  const r = CV.build(Object.assign({ meId: 'p-2' }, base));
  assert.deepEqual(cell(r, '2026-10-09').events.map((e) => e.kind), ['stage']);
  assert.equal(cell(r, '2026-10-13').events[0].personId, 'p-3');
  assert.deepEqual(cell(r, '2026-10-07').events.map((e) => e.kind), ['task']);
});

test('zwolnienie lekarskie innych osób widać tylko jako „nieobecność”; zarząd widzi rodzaj', () => {
  const who = CV.build(Object.assign({ meId: 'p-3' }, base));
  const e = cell(who, '2026-10-19').events[0];
  assert.equal(e.sub, 'Nieobecność');
  assert.equal(e.personId, 'p-2');
  const boss = CV.build(Object.assign({ meId: 'p-1' }, base));
  assert.equal(cell(boss, '2026-10-19').events[0].sub, 'Zwolnienie');
});

test('wniosek czekający na decyzję jest widoczny dla wszystkich, ale nie liczy się do nieobecnych', () => {
  const ab = [{ id: 'w1', personId: 'p-2', from: '2026-10-21', to: '2026-10-21', kind: 'leave', status: 'pending' }];
  const r = CV.build(Object.assign({ meId: 'p-3' }, base, { absences: ab }));
  const e = cell(r, '2026-10-21').events.filter((x) => x.kind === 'absence')[0];
  assert.equal(e.pending, true);
  assert.match(e.sub, /Wniosek/);
  assert.equal(cell(r, '2026-10-21').awayCount, 0);
});

test('filtry: zakres „mine”, ukryte osoby i rodzaje', () => {
  const mine = CV.build(Object.assign({ meId: 'p-1', filters: { scope: 'mine' } }, base));
  assert.equal(cell(mine, '2026-10-13').events.length, 0);
  const noP = CV.build(Object.assign({ meId: 'p-1', filters: { hiddenPeople: ['p-3'] } }, base));
  assert.equal(cell(noP, '2026-10-13').events.length, 0);
  const noK = CV.build(Object.assign({ meId: 'p-1', filters: { hiddenKinds: ['absence', 'deadline'] } }, base));
  assert.equal(cell(noK, '2026-10-13').events.length, 0);
  assert.equal(cell(noK, '2026-10-16').events.length, 0);
});

test('obsada i konflikty: termin przy nieobecnym liderze, próg 3 nieobecnych', () => {
  const ab = absences.concat([{ id: 'a3', personId: 'p-2', from: '2026-10-16', to: '2026-10-16', kind: 'leave' }]);
  const r = CV.build(Object.assign({ meId: 'p-1' }, base, { absences: ab }));
  assert.equal(cell(r, '2026-10-13').awayCount, 1);
  assert.equal(cell(r, '2026-10-13').present, 2);
  assert.ok(r.conflicts.some((c) => c.type === 'leader' && c.day === '2026-10-16'));
  const many = ['p-1', 'p-2', 'p-3'].map((id, i) => ({ id: 'm' + i, personId: id, from: '2026-10-21', to: '2026-10-21', kind: 'leave' }));
  const r2 = CV.build(Object.assign({ meId: 'p-1' }, base, { absences: many }));
  assert.ok(r2.conflicts.some((c) => c.type === 'thin'));
  const w = CV.build(Object.assign({ meId: 'p-3' }, base, { absences: ab }));
  assert.equal(w.conflicts.length, 0);
});

test('zakres range i eksport .ics', () => {
  const r = CV.build(Object.assign({ meId: 'p-1', range: { from: '2026-10-12', to: '2026-10-18' } }, base));
  assert.equal(r.cells.length, 7);
  const ics = CV.toIcs(r.items, base.now, 'Test');
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261012/);
  assert.match(ics, /DTEND;VALUE=DATE:20261015/);
});
