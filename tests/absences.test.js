'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/core/absences.js');

const people = [{ id: 'p-1' }, { id: 'p-2' }];

test('zapis nieobecności: walidacja, nadawanie id, zmiana i usuwanie', () => {
  assert.equal(A.save([], { personId: 'p-9', from: '2026-10-05', to: '2026-10-06', kind: 'leave' }, people).errors.personId, 'Wybierz osobę.');
  assert.ok(A.save([], { personId: 'p-1', from: '2026-10-06', to: '2026-10-05', kind: 'leave' }, people).errors.to);
  assert.ok(A.save([], { personId: 'p-1', from: '2026-10-05', to: '2026-10-06', kind: 'wakacje' }, people).errors.kind);
  const one = A.save([], { personId: 'p-1', from: '2026-10-05', to: '2026-10-09', kind: 'leave', note: ' Wyjazd ' }, people);
  assert.equal(one.valid, true);
  assert.equal(one.list[0].id, 'a-1');
  assert.equal(one.list[0].note, 'Wyjazd');
  const two = A.save(one.list, { personId: 'p-2', from: '2026-10-12', to: '2026-10-12', kind: 'training' }, people);
  assert.deepEqual(two.list.map(a => a.id), ['a-1', 'a-2']);
  const changed = A.save(two.list, { id: 'a-1', personId: 'p-1', from: '2026-10-05', to: '2026-10-07', kind: 'sick' }, people);
  assert.equal(changed.list[0].kind, 'sick');
  assert.deepEqual(A.remove(changed.list, 'a-1').map(a => a.id), ['a-2']);
});

test('dni nieobecności osoby to dni robocze zakresu (weekendy pomijane)', () => {
  const list = A.normalize([{ id: 'a-1', personId: 'p-1', from: '2026-10-08', to: '2026-10-13', kind: 'leave' }, { personId: 'p-2', from: '2026-10-08', to: '2026-10-08' }, { bad: true }]);
  assert.equal(list.length, 2);
  assert.deepEqual(Object.keys(A.daysOf(list, 'p-1')), ['2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13']);
  assert.deepEqual(Object.keys(A.daysOf(list, 'p-2')), ['2026-10-08']);
});

// ---------- wnioski urlopowe ----------
const ppl = [
  { id: 'p-1', orgRole: 'member', leaveDays: 26 },
  { id: 'p-2', orgRole: 'member' },
  { id: 'p-9', orgRole: 'managing' }
];
const NOW = new Date('2026-10-09T08:00:00');

test('dawne wpisy bez statusu są zaakceptowane, wnioski i odrzucone nie wchodzą do dni nieobecności', () => {
  const list = A.normalize([
    { id: 'a-1', personId: 'p-1', from: '2026-10-12', to: '2026-10-12', kind: 'leave' },
    { id: 'a-2', personId: 'p-1', from: '2026-10-13', to: '2026-10-13', kind: 'leave', status: 'pending' },
    { id: 'a-3', personId: 'p-1', from: '2026-10-14', to: '2026-10-14', kind: 'leave', status: 'rejected' }
  ]);
  assert.equal(list[0].status, 'approved');
  assert.deepEqual(Object.keys(A.daysOf(list, 'p-1')), ['2026-10-12']);
  assert.deepEqual(A.approved(list).map(a => a.id), ['a-1']);
});

test('saldo: wykorzystane, zaplanowane, oczekujące, na żądanie, zwolnienia; weekendy i święta nie liczą się', () => {
  const list = A.normalize([
    { id: 'a-1', personId: 'p-1', from: '2026-07-14', to: '2026-07-25', kind: 'leave' },
    { id: 'a-2', personId: 'p-1', from: '2026-08-03', to: '2026-08-03', kind: 'leave', onDemand: true },
    { id: 'a-3', personId: 'p-1', from: '2026-11-23', to: '2026-11-27', kind: 'leave' },
    { id: 'a-4', personId: 'p-1', from: '2026-10-12', to: '2026-10-12', kind: 'leave', status: 'pending' },
    { id: 'a-5', personId: 'p-1', from: '2026-03-02', to: '2026-03-04', kind: 'sick' },
    { id: 'a-6', personId: 'p-1', from: '2026-04-20', to: '2026-04-21', kind: 'training' },
    { id: 'a-7', personId: 'p-2', from: '2026-01-05', to: '2026-01-09', kind: 'leave' }
  ]);
  const b = A.balance(list, ppl[0], NOW);
  assert.equal(b.total, 26);
  assert.equal(b.used, 9 + 1);
  assert.equal(b.planned, 5);
  assert.equal(b.pending, 1);
  assert.equal(b.left, 26 - 15);
  assert.equal(b.free, 26 - 15 - 1);
  assert.equal(b.onDemandUsed, 1);
  assert.equal(b.sick, 3);
  assert.equal(b.training, 2);
  assert.equal(A.balance(list, ppl[1], NOW).total, 26);
  assert.equal(A.balance(list, ppl[1], NOW).used, 4); // 6 stycznia to święto
});

test('wniosek: czeka na zarząd, a złożony przez zarząd jest od razu zaakceptowany', () => {
  const r = A.request([], { personId: 'p-1', from: '2026-10-09', to: '2026-10-12', kind: 'leave' }, ppl, { by: 'p-1', now: NOW });
  assert.equal(r.valid, true);
  assert.equal(r.absence.status, 'pending');
  assert.equal(r.absence.requestedBy, 'p-1');
  assert.equal(A.workdays(r.absence), 2);
  const own = A.request([], { personId: 'p-9', from: '2026-10-12', to: '2026-10-13', kind: 'leave' }, ppl, { by: 'p-9', autoApprove: true, now: NOW });
  assert.equal(own.absence.status, 'approved');
  assert.equal(own.absence.decidedBy, 'p-9');
});

test('wniosek: walidacja zakresu, braku dni roboczych, nakładania i salda', () => {
  assert.ok(A.request([], { personId: 'p-1', from: '2026-10-10', to: '2026-10-11', kind: 'leave' }, ppl, { now: NOW }).errors.to);
  const first = A.request([], { personId: 'p-1', from: '2026-10-12', to: '2026-10-13', kind: 'leave' }, ppl, { now: NOW });
  assert.ok(A.request(first.list, { personId: 'p-1', from: '2026-10-13', to: '2026-10-14', kind: 'leave' }, ppl, { now: NOW }).errors.from);
  const tight = A.normalize([{ id: 'a-1', personId: 'p-1', from: '2026-02-02', to: '2026-03-06', kind: 'leave' }]);
  const over = A.request(tight, { personId: 'p-1', from: '2026-12-14', to: '2026-12-23', kind: 'leave' }, ppl, { now: NOW });
  assert.match(over.errors.to, /Brakuje dni urlopu/);
  const sickOk = A.request(tight, { personId: 'p-1', from: '2026-12-14', to: '2026-12-23', kind: 'sick' }, ppl, { now: NOW });
  assert.equal(sickOk.valid, true);
});

test('urlop na żądanie: limit 4 dni w roku', () => {
  const list = A.normalize([{ id: 'a-1', personId: 'p-1', from: '2026-08-03', to: '2026-08-05', kind: 'leave', onDemand: true }]);
  assert.ok(A.request(list, { personId: 'p-1', from: '2026-10-12', to: '2026-10-13', kind: 'leave', onDemand: true }, ppl, { now: NOW }).errors.onDemand);
  assert.equal(A.request(list, { personId: 'p-1', from: '2026-10-12', to: '2026-10-12', kind: 'leave', onDemand: true }, ppl, { now: NOW }).valid, true);
});

test('decyzja zarządu dotyczy tylko wniosków oczekujących; opinia lidera jest jedna na osobę', () => {
  const r = A.request([], { personId: 'p-1', from: '2026-10-12', to: '2026-10-12', kind: 'leave' }, ppl, { by: 'p-1', now: NOW });
  const id = r.absence.id;
  let list = A.addOpinion(r.list, id, 'p-3', 'concern', 'termin 2601', NOW);
  list = A.addOpinion(list, id, 'p-3', 'ok', '', NOW);
  assert.equal(list[0].opinions.length, 1);
  assert.equal(list[0].opinions[0].verdict, 'ok');
  const ok = A.decide(list, id, 'approve', 'p-9', 'miłego wypoczynku', NOW);
  assert.equal(ok[0].status, 'approved');
  assert.equal(ok[0].decidedBy, 'p-9');
  const again = A.decide(ok, id, 'reject', 'p-9', '', NOW);
  assert.equal(again[0].status, 'approved');
  assert.equal(A.decide(list, id, 'reject', 'p-9', 'termin projektu', NOW)[0].status, 'rejected');
});

test('wpływ na plan: kolidujący termin zadania i nieobecność innych osób zespołu', () => {
  const projects = [{ code: '2601', team: { leader: 'p-3', coordinator: '', proxyLead: '', proxyExtra: '', members: ['p-1', 'p-2'] }, stages: [{ tasks: [
    { name: 'Zebrać warunki', status: 'working', assignees: ['p-1'], deadline: '2026-10-10T16:00' },
    { name: 'Inne', status: 'todo', assignees: ['p-1'], deadline: '2026-11-10' }
  ] }] }];
  const abs = A.normalize([{ id: 'a-1', personId: 'p-2', from: '2026-10-09', to: '2026-10-13', kind: 'leave' }, { id: 'a-2', personId: 'p-1', from: '2026-10-09', to: '2026-10-12', kind: 'leave', status: 'pending' }]);
  const out = A.impact(abs[1], { projects, people: ppl, absences: abs });
  assert.equal(out[0].tone, 'alarm');
  assert.match(out[0].text, /Zebrać warunki/);
  assert.ok(out.some(x => x.tone === 'warn'));
  const clean = A.impact({ id: 'x', personId: 'p-1', from: '2026-12-01', to: '2026-12-02' }, { projects, people: ppl, absences: [] });
  assert.deepEqual(clean.map(x => x.tone), ['ok']);
});

test('widoczność wniosku: właściciel, zarząd i lider projektu osoby', () => {
  const projects = [{ team: { leader: 'p-3', members: ['p-1'] } }];
  const a = { personId: 'p-1' };
  const people = ppl.concat([{ id: 'p-3', orgRole: 'member' }]);
  assert.equal(A.canSee('p-1', a, projects, people), true);
  assert.equal(A.canSee('p-9', a, projects, people), true);
  assert.equal(A.canSee('p-3', a, projects, people), true);
  assert.equal(A.canSee('p-2', a, projects, people), false);
});

test('L4 zgłoszone od razu: zaakceptowane, nie zużywa urlopu, innym pokazuje tylko „nieobecny”', () => {
  const people = [{ id: 'p-1', firstName: 'A', lastName: 'B' }, { id: 'p-2', firstName: 'C', lastName: 'D' }];
  const res = A.request([], { personId: 'p-1', from: '2026-10-12', to: '2026-10-14', kind: 'sick' }, people, { by: 'p-1', autoApprove: true, now: new Date('2026-10-12T08:00:00') });
  assert.equal(res.valid, true);
  assert.equal(res.absence.status, 'approved');
  assert.equal(res.absence.kind, 'sick');
  const bal = A.balance(res.list, people[0], new Date('2026-10-12T12:00:00'));
  assert.equal(bal.sick, 3);
  assert.equal(bal.used, 0);
  assert.equal(bal.left, bal.total);
  assert.equal(A.peek('p-2', res.absence, [], people), 'who');
  const again = A.request(res.list, { personId: 'p-1', from: '2026-10-13', to: '2026-10-13', kind: 'sick' }, people, { by: 'p-1', autoApprove: true });
  assert.equal(again.valid, false);
});

test('wniosek urlopowy na przełomie roku liczy się osobno w puli każdego roku', () => {
  const ppl = [{ id: 'p-1', leaveDays: 5 }];
  const base = [{ id: 'a1', personId: 'p-1', from: '2026-12-14', to: '2026-12-17', kind: 'leave', status: 'approved' }];
  const now = new Date('2026-10-10T10:00:00');
  /* 2026: zostaje 1 dzień (31.12), 2027: 4 stycznia to pierwszy dzień roboczy → po jednym dniu w każdej puli */
  const ok = A.request(base, { personId: 'p-1', from: '2026-12-31', to: '2027-01-04', kind: 'leave' }, ppl, { now });
  assert.equal(ok.valid, true);
  const bad = A.request(base, { personId: 'p-1', from: '2026-12-30', to: '2027-01-04', kind: 'leave' }, ppl, { now });
  assert.equal(bad.valid, false);
  assert.match(bad.errors.to, /2026/);
});

test('zapis nieobecności bez dni roboczych (sama sobota i niedziela) jest odrzucany', () => {
  const r = A.save([], { personId: 'p-1', from: '2026-10-10', to: '2026-10-11', kind: 'leave' }, people);
  assert.equal(r.valid, false);
  assert.ok(r.errors.to);
});

test('anulowanie zatwierdzonego urlopu: prośba, zgoda usuwa, odmowa zostawia i powiadamia', () => {
  const now = new Date('2026-10-10T10:00:00');
  const list = [{ id: 'u1', personId: 'p-1', from: '2026-10-20', to: '2026-10-21', kind: 'leave', status: 'approved' }, { id: 'u2', personId: 'p-1', from: '2026-10-05', to: '2026-10-12', kind: 'leave', status: 'approved' }];
  assert.equal(A.cancellable(list[0], now), true);
  assert.equal(A.cancellable(list[1], now), false);
  assert.equal(A.requestCancel(list, 'u2', 'p-1', '', now).valid, false);
  const asked = A.requestCancel(list, 'u1', 'p-1', 'zmiana planów', now);
  assert.equal(asked.valid, true);
  assert.equal(asked.list.find((a) => a.id === 'u1').cancelRequest.note, 'zmiana planów');
  assert.equal(A.requestCancel(asked.list, 'u1', 'p-1', '', now).valid, false);
  assert.equal(A.decideCancel(asked.list, 'u1', 'approve', 'p-2').some((a) => a.id === 'u1'), false);
  const kept = A.decideCancel(asked.list, 'u1', 'reject', 'p-2', 'projekt w alarmie');
  const row = kept.find((a) => a.id === 'u1');
  assert.equal(row.cancelRequest, null);
  assert.equal(row.notice, 'cancel-rejected');
  assert.equal(A.notices(kept, 'p-1').length, 1);
  assert.equal(A.notices(A.acknowledge(kept, 'u1'), 'p-1').length, 0);
});

test('decyzja zarządu zostawia powiadomienie właścicielowi, własna decyzja nie', () => {
  const list = [{ id: 'u1', personId: 'p-1', from: '2026-10-20', to: '2026-10-21', kind: 'leave', status: 'pending' }, { id: 'u2', personId: 'p-2', from: '2026-10-22', to: '2026-10-22', kind: 'leave', status: 'pending' }];
  let next = A.decide(list, 'u1', 'approve', 'p-2', '');
  next = A.decide(next, 'u2', 'approve', 'p-2', '');
  assert.equal(A.notices(next, 'p-1')[0].notice, 'approved');
  assert.equal(A.notices(next, 'p-2').length, 0);
  assert.equal(A.notices(A.decide(list, 'u1', 'reject', 'p-2', 'brak obsady'), 'p-1')[0].notice, 'rejected');
});

test('zmiana L4: skracanie, przedłużanie i kolizje', () => {
  const list = [{ id: 's1', personId: 'p-1', from: '2026-10-05', to: '2026-10-09', kind: 'sick', status: 'approved' }, { id: 'u1', personId: 'p-1', from: '2026-10-14', to: '2026-10-15', kind: 'leave', status: 'approved' }];
  const shorter = A.updateSick(list, 's1', { from: '2026-10-05', to: '2026-10-07', note: 'wróciłem' }, people);
  assert.equal(shorter.valid, true);
  assert.equal(shorter.list.find((a) => a.id === 's1').to, '2026-10-07');
  assert.equal(A.updateSick(list, 's1', { from: '2026-10-05', to: '2026-10-14' }, people).valid, false);
  assert.equal(A.updateSick(list, 'u1', { from: '2026-10-14', to: '2026-10-15' }, people).valid, false);
  assert.ok(A.updateSick(list, 's1', { from: '2026-10-09', to: '2026-10-05' }, people).errors.to);
});
