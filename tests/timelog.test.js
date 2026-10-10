'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/core/timelog.js');

const at = (h, m = 0, d = 2) => new Date(2026, 9, d, h, m, 0);
const spec = (extra) => Object.assign({ personId: 'p-1', projectId: 1, stageId: 'concept', taskId: 't-1', label: 'Zadanie' }, extra || {});

test('start włącza zegar, a stop zamyka go z poprawną liczbą minut', () => {
  const started = T.start([], spec(), at(9));
  assert.equal(started.entries.length, 1);
  assert.equal(started.started.end, null);
  assert.equal(T.running(started.entries, 'p-1').taskId, 't-1');
  assert.equal(T.minutes(started.started, at(9, 45)), 45);
  const done = T.stop(started.entries, 'p-1', at(10, 30));
  assert.equal(T.running(done.entries, 'p-1'), null);
  assert.equal(T.minutes(done.stopped), 90);
  assert.equal(started.entries[0].end, null, 'wejście nie jest zmieniane');
});

test('start innego zadania zatrzymuje poprzedni zegar tej osoby, ten sam jest bez zmian', () => {
  const first = T.start([], spec(), at(9));
  const same = T.start(first.entries, spec(), at(9, 10));
  assert.equal(same.same, true);
  assert.equal(same.entries.length, 1);
  const second = T.start(first.entries, spec({ taskId: 't-2' }), at(9, 30));
  assert.equal(second.entries.length, 2);
  assert.equal(T.minutes(second.stopped), 30);
  assert.equal(second.entries.filter((e) => !e.end).length, 1);
  const other = T.start(second.entries, spec({ personId: 'p-2' }), at(9, 40));
  assert.equal(other.entries.filter((e) => !e.end).length, 2, 'każda osoba ma własny zegar');
});

test('stop z limitem minut liczy tylko tyle od startu (zapomniany zegar)', () => {
  const started = T.start([], spec(), at(8));
  const stopped = T.stop(started.entries, 'p-1', at(20), { minutes: 150 });
  assert.equal(T.minutes(stopped.stopped), 150);
  assert.equal(T.stop(started.entries, 'p-9', at(20)).stopped, null);
  assert.equal(T.isForgotten(started.started, at(19)), true);
  assert.equal(T.isForgotten(started.started, at(10)), false);
});

test('wpis ręczny: walidacja godzin i daty oraz zapis w wybranym dniu', () => {
  const now = at(15);
  assert.equal(T.addManual([], spec({ date: '2026-10-01', hours: '0' }), now).errors.hours.length > 0, true);
  assert.ok(T.addManual([], spec({ date: '2026-10-01', hours: 25 }), now).errors.hours);
  assert.ok(T.addManual([], spec({ date: 'wczoraj', hours: 2 }), now).errors.date);
  assert.ok(T.addManual([], spec({ date: '2026-10-09', hours: 2 }), now).errors.date, 'przyszłość');
  const ok = T.addManual([], spec({ date: '2026-10-01', hours: '1,5', note: ' kolizja ' }), now);
  assert.equal(ok.valid, true);
  assert.equal(T.minutes(ok.entry), 90);
  assert.equal(T.dayKey(ok.entry.start), '2026-10-01');
  assert.equal(ok.entry.note, 'kolizja');
  assert.equal(ok.entry.source, 'manual');
});

test('update zmienia godziny i notatkę, nie rusza zegara; remove usuwa wpis', () => {
  const manual = T.addManual([], spec({ date: '2026-10-01', hours: 2 }), at(15));
  const upd = T.update(manual.entries, manual.entry.id, { hours: 3.5, note: 'x' }, at(16));
  assert.equal(T.minutes(upd.entry), 210);
  assert.equal(upd.entry.note, 'x');
  assert.ok(T.update(manual.entries, manual.entry.id, { hours: -1 }, at(16)).errors.hours);
  const run = T.start([], spec(), at(9));
  assert.equal(T.update(run.entries, run.started.id, { hours: 2 }, at(10)).valid, false);
  assert.equal(T.remove(manual.entries, manual.entry.id).length, 0);
});

test('sumy: wpisy dnia, etapy projektu i osoby zadania', () => {
  let list = [];
  list = T.addManual(list, spec({ date: '2026-10-02', hours: 2 }), at(15)).entries;
  list = T.addManual(list, spec({ date: '2026-10-02', hours: 1, stageId: 'survey', taskId: 't-5' }), at(15)).entries;
  list = T.addManual(list, spec({ date: '2026-10-01', hours: 4, personId: 'p-2' }), at(15)).entries;
  list = T.addManual(list, spec({ date: '2026-10-02', hours: 3, projectId: 2 }), at(15)).entries;
  assert.equal(T.sum(T.forDay(list, 'p-1', at(15))), 360);
  assert.deepEqual(T.byStage(list, 1, at(15)), { concept: 360, survey: 60 });
  assert.deepEqual(T.byPerson(list, 1, 't-1', at(15)), { 'p-1': 120, 'p-2': 240 });
  assert.equal(T.projectMinutes(list, 1, at(15)), 420);
});

test('formaty: zegar, czas trwania i godziny dziesiętne', () => {
  assert.equal(T.clock(3909000), '1:05:09');
  assert.equal(T.clock(-5), '0:00:00');
  assert.equal(T.duration(135), '2 h 15 min');
  assert.equal(T.duration(120), '2 h');
  assert.equal(T.duration(45), '45 min');
  assert.equal(T.hoursOf(150), 2.5);
  assert.equal(T.hoursOf(100), 1.7);
});

test('normalizeEntries odrzuca uszkodzone i osierocone wpisy oraz pilnuje jednego zegara', () => {
  const good = { id: 'e-1', personId: 'p-1', projectId: 1, stageId: 'a', taskId: 't-1', start: '2026-10-01T08:00:00.000Z', end: '2026-10-01T09:00:00.000Z' };
  const raw = [
    good, good,
    { id: 'e-2', personId: 'p-1', projectId: 99, start: '2026-10-01T08:00:00.000Z', end: null },
    { id: 'e-3', personId: 'p-1', projectId: 1, start: 'bzdura' },
    { id: 'e-4', personId: 'p-1', projectId: 1, start: '2026-10-01T10:00:00.000Z', end: '2026-10-01T09:00:00.000Z' },
    { id: 'e-5', personId: 'p-1', projectId: 1, stageId: 'a', taskId: 't-1', start: '2026-10-02T08:00:00.000Z', end: null },
    { id: 'e-6', personId: 'p-1', projectId: 1, stageId: 'a', taskId: 't-2', start: '2026-10-02T09:00:00.000Z', end: null },
    null, 'x'
  ];
  const out = T.normalizeEntries(raw, [1]);
  assert.deepEqual(out.map((e) => e.id), ['e-1', 'e-5', 'e-6']);
  assert.equal(out[1].end, '2026-10-02T09:00:00.000Z', 'wcześniejszy zegar zamknięty w chwili startu późniejszego');
  assert.equal(out.filter((e) => !e.end).length, 1);
  assert.deepEqual(T.normalizeEntries(undefined, [1]), []);
});

test('clockLabel: dzień tygodnia, data, godzina i numer tygodnia ISO', () => {
  const l = T.clockLabel(new Date(2026, 9, 3, 11, 44));
  assert.equal(l.day, 'sob. 3 paź');
  assert.equal(l.time, '11:44');
  assert.equal(l.long, 'sobota, 3 października 2026 · tydzień 40');
  assert.equal(T.isoWeek(new Date(2026, 0, 1)), 1);
  assert.equal(T.isoWeek(new Date(2024, 11, 30)), 1, 'przełom roku liczy się do tygodnia 1');
});

test('weekDays: pon–ndz, minuty i podział na projekty, tylko wybrana osoba', () => {
  const mk = (id, person, project, from, to) => ({ id, personId: person, projectId: project, stageId: 's', taskId: 't', start: from.toISOString(), end: to ? to.toISOString() : null });
  const entries = [
    mk('a', 'p-1', 1, at(8, 0, -2), at(10, 0, -2)),       // pon, 2 h projekt 1
    mk('b', 'p-1', 2, at(10, 0, -2), at(11, 30, -2)),     // pon, 1,5 h projekt 2
    mk('c', 'p-1', 1, at(9, 0, -1), at(9, 45, -1)),       // wt, 45 min
    mk('d', 'p-2', 1, at(9, 0, -1), at(17, 0, -1))        // inna osoba
  ];
  const week = T.weekDays(entries, 'p-1', at(12, 0, 3)); // sob. 3 paź 2026: tydzień 28 wrz – 4 paź
  assert.equal(week.length, 7);
  assert.equal(week[0].key, '2026-09-28');
  assert.equal(week[4].key, "2026-10-02");
  assert.equal(week[5].today, true);
  assert.equal(week[5].weekend, true);
  assert.equal(week[0].minutes, 210);
  assert.deepEqual(week[0].projects, [{ projectId: 1, minutes: 120 }, { projectId: 2, minutes: 90 }]);
  assert.equal(week[1].minutes, 45, "wtorek tej osoby, bez wpisu innej osoby");
});

test('gaps: wykrywa przerwy między zapisami, z pominięciem krótkich i nakładających się', () => {
  const e = (h1, m1, h2, m2) => ({ start: at(h1, m1).toISOString(), end: at(h2, m2).toISOString() });
  const list = [e(8, 0, 9, 0), e(9, 10, 10, 0), e(10, 45, 11, 0), e(10, 50, 12, 0)];
  const out = T.gaps(list, at(13, 0), 20);
  assert.equal(out.length, 1, 'przerwa 10 min jest za krótka, a nakładające się wpisy nie tworzą luki');
  assert.equal(out[0].minutes, 45);
  assert.equal(new Date(out[0].from).getHours(), 10);
  const live = [e(8, 0, 9, 0), { start: at(9, 40).toISOString(), end: null }];
  assert.equal(T.gaps(live, at(10, 0), 20)[0].minutes, 40, 'chodzący zegar liczy do teraz');
  assert.deepEqual(T.gaps([], at(10, 0)), []);
});

test('addManual w trybie od–do: zapisuje dokładny przedział, odrzuca przyszłość, odwrócony zakres i nakładanie', () => {
  const base = T.start([], spec(), at(9, 0));
  const closed = T.stop(base.entries, 'p-1', at(10, 0)).entries;               // 09:00–10:00
  const now = at(15, 0);
  const day = '2026-10-02';
  const ok = T.addManual(closed, spec({ date: day, from: '10:15', to: '11:45', note: 'x' }), now);
  assert.equal(ok.valid, true);
  assert.equal(T.minutes(ok.entry), 90);
  assert.equal(new Date(ok.entry.start).getHours(), 10);
  assert.equal(new Date(ok.entry.start).getMinutes(), 15);
  assert.equal(T.addManual(closed, spec({ date: day, from: '12:00', to: '11:00' }), now).errors.time, 'Koniec musi być później niż początek.');
  assert.match(T.addManual(closed, spec({ date: day, from: '14:00', to: '16:00' }), now).errors.time, /przyszłości/);
  assert.match(T.addManual(closed, spec({ date: day, from: '09:30', to: '10:30' }), now).errors.time, /Nakłada się na zapis 09:00–10:00/);
  assert.match(T.addManual(closed, spec({ date: day, from: '9', to: '10:30' }), now).errors.time, /GG:MM/);
  assert.equal(T.addManual(closed, spec({ date: day, from: '10:00', to: '10:30' }), now).valid, true, 'styk końca z początkiem nie jest nakładaniem');
  assert.equal(T.addManual(closed, spec({ date: day, hours: '2' }), now).valid, true, 'tryb godzin działa jak wcześniej');
});

test('update w trybie od–do przesuwa wpis i nie liczy samego siebie jako nakładania', () => {
  const now = at(15, 0);
  const a = T.addManual([], spec({ date: '2026-10-02', from: '09:00', to: '10:00' }), now);
  const b = T.addManual(a.entries, spec({ date: '2026-10-02', from: '10:00', to: '11:00' }), now);
  const moved = T.update(b.entries, a.entry.id, { from: '08:30', to: '09:45' }, now);
  assert.equal(moved.valid, true);
  assert.equal(T.minutes(moved.entry), 75);
  const clash = T.update(b.entries, a.entry.id, { from: '09:30', to: '10:30' }, now);
  assert.match(clash.errors.time, /Nakłada się/);
  assert.equal(T.update(b.entries, a.entry.id, { from: '09:00', to: '10:00' }, now).valid, true, 'ten sam przedział jest dozwolony');
});

test('shiftStart: tylko po wcześniejszym wpisie tego dnia; pierwszy zegar dnia jest nienaruszalny; nie nachodzi na poprzedni wpis', () => {
  const lone = T.start([], spec(), at(9)).entries;                                    // pierwszy zegar dnia
  assert.equal(T.canShiftStart(lone, 'p-1'), false);
  const denied = T.shiftStart(lone, 'p-1', 60, at(9, 5));
  assert.equal(denied.valid, false);
  assert.match(denied.error, /Pierwszy zegar dnia/);
  const first = T.stop(T.start([], spec(), at(8)).entries, 'p-1', at(9)).entries;      // 8:00–9:00
  const run = T.start(first, spec({ taskId: 't-2' }), at(10)).entries;                // zegar od 10:00
  assert.equal(T.canShiftStart(run, 'p-1'), true);
  const a = T.shiftStart(run, 'p-1', 15, at(10, 5));
  assert.equal(a.valid, true); assert.equal(a.shifted, 15);
  const b = T.shiftStart(run, 'p-1', 120, at(10, 5));
  assert.equal(b.shifted, 60, 'zatrzymuje się na końcu wpisu 8:00–9:00');
  assert.equal(T.shiftStart(b.entries, 'p-1', 5, at(10, 5)).valid, false, 'dalej nie ma miejsca');
  const yesterday = T.stop(T.start([], spec(), at(8, 0, 1)).entries, 'p-1', at(9, 0, 1)).entries;
  assert.equal(T.canShiftStart(T.start(yesterday, spec(), at(9)).entries, 'p-1'), false, 'wpis z wczoraj nie otwiera cofania dziś');
  assert.equal(T.shiftStart([], 'p-1', 5, at(10)).valid, false);
  assert.equal(T.shiftStart(run, 'p-1', 0, at(10)).valid, false);
  assert.equal(run.find((e) => !e.end).start, at(10).toISOString(), 'oryginał bez zmian');
});
