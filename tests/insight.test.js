'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Insight = require('../src/core/insight.js');
const Model = require('../src/core/model.js');

const NOW = new Date(2026, 9, 2, 12, 0);

// Termin etapu jest liczony z zadań: podany termin to termin jedynego zadania etapu.
function stage(id, status, hours, deadline, tasks) {
  const own = tasks || (deadline ? [Object.assign({ id: 't-d', name: 'Zadanie', status: 'todo', deadline: deadline + 'T12:00', workload: 'medium', assignees: [], parts: {}, history: [] })] : []);
  return Object.assign(Model.createStage(id), { status: status, hours: hours, tasks: own });
}

function project(extra) {
  return Object.assign({
    id: 1, code: 'P-1', name: 'Projekt', client: 'Klient', status: 'active',
    deadline: '2026-12-31', createdAt: '2026-09-01T08:00:00.000Z',
    team: { leader: '', coordinator: '', proxyLead: '', proxyExtra: '', members: [] },
    stages: [
      stage('preparation', 'done', 40),
      stage('concept', 'working', 80, '2026-11-15'),
      stage('handover', 'todo', 80, '2026-12-20')
    ]
  }, extra || {});
}

function task(extra) {
  return Object.assign({ id: 't-1', name: 'Zadanie', status: 'todo', deadline: '', workload: 'medium', assignees: [], parts: {}, history: [] }, extra || {});
}

test('projekt w terminie i bez zaległości jest w normie', () => {
  const h = Insight.health(project({ createdAt: '2026-09-25T08:00:00.000Z' }), NOW);
  assert.equal(h.level, 'normal');
  assert.equal(h.label, 'W normie');
  assert.deepEqual(h.reasons, []);
});

test('przekroczony termin umowy to stan alarmowy z liczbą dni w powodzie', () => {
  const h = Insight.health(project({ deadline: '2026-09-26' }), NOW);
  assert.equal(h.level, 'alarm');
  assert.equal(h.reasons[0].text, 'Termin umowy minął 6 dni temu');
});

test('zakończony projekt nie alarmuje, nawet z datą w przeszłości', () => {
  const h = Insight.health(project({ status: 'done', deadline: '2026-01-01' }), NOW);
  assert.equal(h.level, 'closed');
});

test('zadanie po terminie daje ostrzeżenie (etap nie ma własnego terminu)', () => {
  const p = project({ createdAt: '2026-09-30T08:00:00.000Z' });
  p.stages[1].tasks = [task({ deadline: '2026-10-01T10:00' })];
  const h = Insight.health(p, NOW);
  assert.equal(h.level, 'warning');
  assert.ok(h.reasons.some((r) => r.text === '1 zadanie po terminie'));
  assert.ok(!h.reasons.some((r) => /Etap/.test(r.text)), 'zaległy etap nie dubluje zaległego zadania');
});

test('bliski termin przy małym postępie ostrzega, przy prawie skończonej pracy nie', () => {
  const near = Insight.health(project({ deadline: '2026-10-10', createdAt: '2026-10-01T08:00:00.000Z' }), NOW);
  assert.equal(near.level, 'warning');
  assert.match(near.reasons[0].text, /Do terminu umowy 8 dni, postęp 20%/);
  const p = project({ deadline: '2026-10-10', createdAt: '2026-10-01T08:00:00.000Z' });
  p.stages.forEach((s) => { s.status = 'done'; });
  p.stages.push(stage('estimates', 'todo', 10));
  assert.equal(Insight.health(p, NOW).level, 'normal');
});

test('opóźnienie wobec upływu czasu: ostrzeżenie od 15 punktów, alarm od 30', () => {
  // umowa 1.07–31.12, 2.10 to ~51% czasu; postęp 20% → opóźnienie 31 pkt
  const late = Insight.health(project({ createdAt: '2026-07-01T08:00:00.000Z' }), NOW);
  assert.equal(late.level, 'alarm');
  assert.match(late.reasons[0].text, /Postęp 20% przy 5\d% czasu umowy/);
  const plan = Insight.schedule(project({ createdAt: '2026-07-01T08:00:00.000Z' }), NOW);
  assert.ok(plan.lag >= 30 && plan.expected > 50 && plan.daysLeft === 90);
});

test('wstrzymany projekt i zwrot do poprawy są widoczne w powodach', () => {
  const p = project({ status: 'paused', createdAt: '2026-09-30T08:00:00.000Z' });
  p.stages[1].tasks = [task({ status: 'changes', feedback: 'x' })];
  const reasons = Insight.health(p, NOW).reasons.map((r) => r.text);
  assert.ok(reasons.indexOf('Projekt wstrzymany') >= 0);
  assert.ok(reasons.indexOf('1 zadanie zwrócone do poprawy') >= 0);
});

test('profil: odcinki ważone godzinami, bieżący etap oznaczony, zaległe zaznaczone', () => {
  const p = project();
  p.stages[2] = stage('handover', 'todo', 80, '2026-09-01');
  const prof = Insight.profile(p, NOW);
  assert.equal(prof.segments.length, 3);
  assert.deepEqual(prof.segments.map((s) => s.weight), [0.2, 0.4, 0.4]);
  assert.deepEqual(prof.segments.map((s) => s.start), [0, 0.2, 0.6000000000000001]);
  assert.equal(prof.segments[1].current, true);
  assert.equal(prof.segments[2].overdue, true);
  assert.equal(prof.percent, 20);
  assert.equal(prof.currentIndex, 1);
});

test('profil pustego projektu nie wywraca się', () => {
  const prof = Insight.profile(project({ stages: [] }), NOW);
  assert.deepEqual(prof.segments, []);
  assert.equal(prof.current, null);
});

test('najbliższe zdarzenie wybiera najwcześniejszy przyszły termin', () => {
  const p = project();
  p.stages[1].tasks = [task({ name: 'Rysunki', deadline: '2026-10-05T09:00' }), task({ id: 't-2', name: 'Stare', deadline: '2026-09-01T09:00' })];
  const ev = Insight.nextEvent(p, NOW);
  assert.equal(ev.kind, 'task');
  assert.equal(ev.label, 'Rysunki');
  assert.equal(ev.days, 3);
  assert.equal(Insight.nextEvent(project({ status: 'done' }), NOW), null);
});

test('portfel liczy projekty w każdym stanie i zbiera terminy w horyzoncie', () => {
  const list = [
    project({ id: 1, deadline: '2026-09-20' }),
    project({ id: 2, status: 'done' }),
    project({ id: 3, createdAt: '2026-09-30T08:00:00.000Z', deadline: '2026-11-01' })
  ];
  const view = Insight.portfolio(list, NOW, 60);
  assert.deepEqual(view.counts, { alarm: 1, warning: 0, normal: 1, closed: 1 });
  assert.equal(view.byLevel.alarm[0].project.id, 1);
  assert.ok(view.upcoming.every((u, i, a) => i === 0 || a[i - 1].days <= u.days));
  assert.ok(view.upcoming.some((u) => u.kind === 'project' && u.project.id === 3));
  assert.ok(!view.upcoming.some((u) => u.project.id === 2), 'zakończone projekty nie mają terminów');
});

test('obciążenie liczy tylko niedomknięte udziały osoby', () => {
  const p = project({ team: { leader: 'p-1', coordinator: '', proxyLead: '', proxyExtra: '', members: ['p-2'] } });
  p.stages[1].tasks = [
    task({ id: 't-1', assignees: ['p-1', 'p-2'], parts: { 'p-1': 'working', 'p-2': 'done' }, deadline: '2026-09-30T10:00' }),
    task({ id: 't-2', assignees: ['p-1'], status: 'done' }),
    task({ id: 't-3', assignees: ['p-1'] })
  ];
  const w1 = Insight.workload('p-1', [p], NOW);
  assert.equal(w1.open, 2);
  assert.equal(w1.overdue, 1);
  assert.equal(w1.projects, 1);
  assert.equal(w1.functions[0].fn.key, 'leader');
  assert.equal(w1.tasks[0].overdue, true, 'zaległe na początku');
  const w2 = Insight.workload('p-2', [p], NOW);
  assert.equal(w2.open, 0);
});

test('miernik: próg poprzedniego i następnego etapu wynikają z godzin, postęp z zakończonych', () => {
  const g = Insight.gauge(project(), NOW);
  assert.equal(g.percent, 20);                       // 40 z 200 h
  assert.equal(g.current.index, 1);
  assert.equal(Math.round(g.current.from), 20);
  assert.equal(Math.round(g.current.to), 60);
  assert.equal(g.previous.index, 0);
  assert.equal(g.next.index, 2);
  assert.deepEqual(g.stages.map((s) => Math.round(s.to)), [20, 60, 100]);
  assert.deepEqual(g.majors, [0, 25, 50, 75, 100]);
});

test('miernik: plan to upływ czasu umowy, odchylenie to plan minus postęp', () => {
  const p = project({ createdAt: '2026-09-02T12:00:00.000Z', deadline: '2026-10-12' });
  const g = Insight.gauge(p, NOW);                   // 30 z 40 dni minęło
  assert.equal(g.expected, 75);
  assert.equal(g.lag, 75 - g.percent);
});

test('miernik: projekt zakończony i bez etapów nie ma planu ani bieżącego etapu', () => {
  assert.equal(Insight.gauge(project({ status: 'done' }), NOW).expected, null);
  const empty = Insight.gauge(project({ stages: [] }), NOW);
  assert.equal(empty.current, null);
  assert.equal(empty.stages.length, 0);
  assert.equal(empty.percent, 0);
});

test('miernik: skrajne postępy 0% i 100%', () => {
  const all = project();
  all.stages.forEach((s) => { s.status = 'done'; });
  const full = Insight.gauge(all, NOW);
  assert.equal(full.percent, 100);
  assert.equal(full.current, null);
  const none = project();
  none.stages.forEach((s) => { s.status = 'todo'; });
  const zero = Insight.gauge(none, NOW);
  assert.equal(zero.percent, 0);
  assert.equal(zero.current.index, 0);
  assert.equal(zero.previous, null);
});

test('odcinek toru ma stan: wykonany, opóźniony, wstrzymany, zagrożony terminem, bieżący, przyszły', () => {
  const p = project();
  p.stages = [stage('preparation', 'done', 10), stage('concept', 'working', 10, '2026-09-30'),
    stage('location-docs', 'todo', 10, '2026-10-05'), stage('handover', 'todo', 10, '2026-12-20')];
  const states = Insight.profile(p, NOW).segments.map((s) => s.state);
  assert.deepEqual(states, ['done', 'delayed', 'warning', 'upcoming']);
  const cur = project();
  assert.equal(Insight.profile(cur, NOW).segments[1].state, 'current');
  const paused = project({ status: 'paused' });
  assert.equal(Insight.profile(paused, NOW).segments[1].state, 'blocked');
});

test('drabinka stanu: aktywny szczebel niesie powody, a każdy powód ma identyfikator reguły', () => {
  const l = Insight.ladder(project({ deadline: '2026-09-26' }), NOW);
  assert.deepEqual(l.rungs.map((r) => r.level), ['alarm', 'warning', 'normal']);
  assert.equal(l.rungs[0].active, true);
  assert.equal(l.rungs[0].reasons[0].rule, 'deadline-passed');
  assert.ok(l.reasons.every((r) => typeof r.rule === 'string' && r.rule));
  assert.equal(Insight.ladder(project({ status: 'done' }), NOW).closed, true);
});

test('budgetByKind liczy godziny i udziały trzech rodzajów pracy', () => {
  const p = { stages: [
    stage('preparation', 'done', 40), stage('concept', 'working', 60),
    stage('water-docs', 'todo', 100), stage('water-process', 'todo', 100),
    Object.assign(stage('concept', 'todo', 0), { id: 'custom-1', source: 'custom', name: 'Opinia', domain: 'water', kind: 'decision', hours: 100 })
  ] };
  const rows = Insight.budgetByKind(p);
  assert.deepEqual(rows.map((r) => r.kind), ['materials', 'docs', 'decision']);
  assert.deepEqual(rows.map((r) => r.hours), [40, 160, 200]);
  assert.deepEqual(rows.map((r) => r.count), [1, 2, 2]);
  assert.equal(rows[0].doneHours, 40);
  assert.equal(rows[2].doneHours, 0);
  assert.ok(Math.abs(rows.reduce((sum, r) => sum + r.share, 0) - 1) < 1e-9);
  const empty = Insight.budgetByKind({ stages: [] });
  assert.equal(empty.length, 3);
  assert.equal(empty[1].share, 0);
});

test('myWork dzieli zadania osoby na przedziały czasu i wskazuje, co wymaga jej decyzji', () => {
  const Team = require('../src/core/team.js');
  const mk = (over) => Object.assign({ id: 't-' + Math.random(), name: 'Z', status: 'todo', assignees: ['p-2'], deadline: '', parts: {} }, over);
  const team = Object.assign(Team.emptyTeam(), { leader: 'p-1', members: ['p-2'] });
  const p = { id: 1, status: 'active', team, stages: [
    Object.assign(Model.createStage('concept'), { status: 'working', tasks: [
      mk({ id: 't-1', deadline: '2026-10-01T09:00' }),
      mk({ id: 't-2', deadline: '2026-10-02T18:00' }),
      mk({ id: 't-3', deadline: '2026-10-06T09:00' }),
      mk({ id: 't-4', deadline: '2026-11-20T09:00' }),
      mk({ id: 't-5' }),
      mk({ id: 't-6', status: 'done', deadline: '2026-09-01T09:00' }),
      mk({ id: 't-7', status: 'changes', deadline: '2026-10-09T09:00' }),
      mk({ id: 't-8', assignees: ['p-3'] }),
      mk({ id: 't-9', status: 'review', assignees: ['p-2'], deadline: '2026-10-03T09:00' })
    ] })
  ] };
  const mine = Insight.myWork('p-2', [p], NOW);
  const ids = (list) => list.map((r) => r.task.id);
  assert.deepEqual(ids(mine.buckets.overdue), ['t-1']);
  assert.deepEqual(ids(mine.buckets.today), ['t-2']);
  assert.deepEqual(ids(mine.buckets.week), ['t-9', 't-3', 't-7']);
  assert.deepEqual(ids(mine.buckets.later), ['t-4']);
  assert.deepEqual(ids(mine.buckets.none), ['t-5']);
  assert.deepEqual(ids(mine.returned), ['t-7']);
  assert.equal(mine.open, 7);
  assert.equal(mine.overdue, 1);
  assert.equal(mine.toApprove.length, 0, 'zwykły członek zespołu nie zatwierdza');
  assert.equal(mine.projects.length, 1);

  const lead = Insight.myWork('p-1', [p], NOW);
  assert.deepEqual(ids(lead.toApprove), ['t-9']);
  assert.equal(lead.open, 0);
  assert.equal(lead.projects[0].functions[0].key, 'leader');
  assert.equal(Insight.myWork(null, [p], NOW).open, 0);
});

/* ---------- odchylenia, najbliższy próg, najbliższa akcja ---------- */

test('variance: postęp vs plan, bez zgadywania godzin gdy nikt nie zapisał czasu', () => {
  const v = Insight.variance(project(), NOW, 0);
  assert.equal(v.progress.available, true);
  assert.equal(v.progress.variance, v.progress.actual - v.progress.plan);
  assert.equal(v.hours.available, false);
  assert.equal(v.hours.reason, 'no-time-logged');
});

test('variance: godziny zapisane vs oczekiwane na dziś', () => {
  const p = project();
  const plan = Insight.schedule(p, NOW).expected;
  const total = 200;
  const v = Insight.variance(p, NOW, 60 * 120);
  assert.equal(v.hours.available, true);
  assert.equal(v.hours.used, 120);
  assert.equal(v.hours.expected, Math.round(plan / 100 * total));
  assert.equal(v.hours.variance, 120 - v.hours.expected);
});

test('variance: bez terminu nie ma planu ani prognozy', () => {
  const v = Insight.variance(project({ deadline: '' }), NOW, 600);
  assert.equal(v.progress.available, false);
  assert.equal(v.progress.reason, 'no-deadline');
  assert.equal(v.schedule.available, false);
  assert.equal(v.schedule.reason, 'no-deadline');
  assert.equal(v.hours.available, false);
});

test('variance: prognoza dopiero przy ≥ 7 dniach pracy i ≥ 5% postępu', () => {
  const young = Insight.variance(project({ createdAt: '2026-09-30T08:00:00.000Z' }), NOW, 0);
  assert.equal(young.schedule.reason, 'too-early');
  const idle = Insight.variance(project({ stages: [stage('preparation', 'todo', 40), stage('concept', 'todo', 80)] }), NOW, 0);
  assert.equal(idle.schedule.reason, 'no-progress');
  const ok = Insight.variance(project(), NOW, 0);
  assert.equal(ok.schedule.available, true);
  assert.match(ok.schedule.forecast, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof ok.schedule.days, 'number');
});

test('variance: projekt zakończony i 100% nie mają prognozy', () => {
  assert.equal(Insight.variance(project({ status: 'done' }), NOW, 0).schedule.reason, 'done');
  assert.equal(Insight.variance(project({ status: 'done' }), NOW, 0).progress.available, false);
});

test('nextAction: zwrócone > zaległe > do zatwierdzenia > bez realizatora > termin', () => {
  const mk = (tasks) => project({ stages: [stage('preparation', 'working', 40, '', tasks)] });
  const late = task({ id: 't-1', name: 'Zaległe', status: 'working', deadline: '2026-09-28T12:00', assignees: ['p-1'] });
  const ret = task({ id: 't-2', name: 'Zwrócone', status: 'changes', feedback: 'Popraw opis', assignees: ['p-1'] });
  const rev = task({ id: 't-3', name: 'Do akceptu', status: 'review', assignees: ['p-1'] });
  const orphan = task({ id: 't-4', name: 'Bez osoby', status: 'todo', deadline: '2026-10-09T12:00' });

  assert.equal(Insight.nextAction(mk([late, ret, rev, orphan]), NOW).rule, 'returned');
  const a = Insight.nextAction(mk([late, rev, orphan]), NOW);
  assert.equal(a.rule, 'overdue');
  assert.equal(a.tone, 'alarm');
  assert.equal(a.taskId, 't-1');
  assert.match(a.parts[0], /Termin minął \d+ dni temu/);
  assert.equal(Insight.nextAction(mk([rev, orphan]), NOW).rule, 'review');
  const o = Insight.nextAction(mk([orphan]), NOW);
  assert.equal(o.rule, 'unassigned');
  assert.deepEqual(o.parts.slice(0, 1), ['Nikt nie jest przypisany']);
  assert.equal(o.stageId, 'preparation');
});

test('nextAction: nic pilnego → null; zakończony → null; zbliżający się termin zadania', () => {
  const calm = project({ deadline: '2027-12-31', stages: [stage('preparation', 'working', 40, '', [task({ status: 'working', deadline: '2027-01-10T12:00', assignees: ['p-1'] })])] });
  assert.equal(Insight.nextAction(calm, NOW), null);
  assert.equal(Insight.nextAction(project({ status: 'done' }), NOW), null);
  const soon = project({ stages: [stage('preparation', 'working', 40, '', [task({ status: 'working', deadline: '2026-10-06T12:00', assignees: ['p-1'] })])] });
  const a = Insight.nextAction(soon, NOW);
  assert.equal(a.rule, 'next-event');
  assert.equal(a.kind, 'task');
  assert.equal(a.stageId, 'preparation');
  assert.match(a.parts[0], /^Termin zadania za 4 dni$/);
});

test('nextAction: projekt bez zespołu i bez zadań nie wywraca obliczeń', () => {
  const bare = project({ team: undefined, stages: [] });
  assert.equal(Insight.nextAction(bare, NOW), null);
  assert.equal(Insight.variance(bare, NOW, 0).progress.actual, 0);
});

test('nextAction: pismo po terminie wyprzedza zatwierdzenie, bliski termin odpowiedzi wyprzedza następny termin', () => {
  const late = { entry: { id: 'm-1', regNo: 'P/2026/001', subject: 'Wezwanie', counterparty: 'RZGW', direction: 'in' }, reply: { state: 'overdue', days: -3 } };
  const soon = { entry: { id: 'm-2', regNo: 'W/2026/001', subject: 'Wniosek', counterparty: 'Urząd', direction: 'out' }, reply: { state: 'waiting', days: 2 } };
  const proj = project({ deadline: '2027-12-31', stages: [stage('preparation', 'working', 40, '', [task({ status: 'working', deadline: '2027-01-10T12:00', assignees: ['p-1'] })])] });
  const a = Insight.nextAction(proj, NOW, [late]);
  assert.equal(a.rule, 'mail');
  assert.equal(a.mailId, 'm-1');
  assert.match(a.parts[0], /Termin odpowiedzi minął 3 dni temu/);
  const b = Insight.nextAction(proj, NOW, [soon]);
  assert.equal(b.rule, 'mail');
  assert.equal(b.tone, 'warning');
  assert.equal(Insight.nextAction(proj, NOW, [{ entry: soon.entry, reply: { state: 'waiting', days: 20 } }]), null);
  assert.equal(Insight.nextAction(proj, NOW), null);
});

test('nextAction: termin umowy minął → zawsze jest działanie; zadania zaległe nadal ważniejsze', () => {
  const calm = [stage('preparation', 'working', 40, '', [task({ status: 'working', deadline: '2027-01-10T12:00', assignees: ['p-1'] })])];
  const over = Insight.nextAction(project({ deadline: '2026-09-26', stages: calm }), NOW);
  assert.equal(over.rule, 'project-overdue');
  assert.equal(over.tone, 'alarm');
  assert.equal(over.title, 'Ustal nowy termin umowy');
  assert.match(over.parts[0], /Aneks/);
  assert.equal(Insight.nextAction(project({ deadline: '2026-09-26', status: 'paused', stages: calm }), NOW), null);
  const withLate = [stage('preparation', 'working', 40, '', [task({ status: 'working', deadline: '2026-09-28T12:00', assignees: ['p-1'] })])];
  assert.equal(Insight.nextAction(project({ deadline: '2026-09-26', stages: withLate }), NOW).rule, 'overdue');
});

test('nextAction: etap w toku bez zadań prosi o rozpisanie zadań', () => {
  const p = project({ deadline: '2027-12-31', stages: [stage('preparation', 'done', 40), stage('concept', 'working', 80, '', [])] });
  const a = Insight.nextAction(p, NOW);
  assert.equal(a.rule, 'empty-stage');
  assert.equal(a.kind, 'stage');
  assert.equal(a.stageId, 'concept');
  assert.match(a.title, /^Etap 2: /);
  const filled = project({ deadline: '2027-12-31', stages: [stage('concept', 'working', 80, '', [task({ status: 'working', deadline: '2027-01-10T12:00', assignees: ['p-1'] })])] });
  assert.equal(Insight.nextAction(filled, NOW), null);
});

test('dueItems: zadania, odpowiedzi na pisma i termin umowy w jednym zestawieniu, zaległe pierwsze', () => {
  const stages = [stage('preparation', 'working', 40, '', [
    task({ id: 'a', name: 'Spóźnione', status: 'working', deadline: '2026-09-29T12:00' }),
    task({ id: 'b', name: 'Za tydzień', deadline: '2026-10-09T12:00' }),
    task({ id: 'c', name: 'Gotowe', status: 'done', deadline: '2026-10-03T12:00' })
  ])];
  const p = project({ deadline: '2026-10-20', stages });
  const mail = [{ id: 'm1', projectId: 1, direction: 'in', subject: 'Zapytanie', replyDue: '2026-10-05', registeredDate: '2026-09-30' }];
  const items = Insight.dueItems([p], mail, NOW, 60);
  assert.deepEqual(items.map((i) => i.kind + ':' + i.days), ['task:-3', 'mail:3', 'task:7', 'project:18']);
  assert.equal(items[0].overdue, true);
  assert.equal(Insight.dueItems([p], mail, NOW, 5).length, 2);
  assert.equal(Insight.dueItems([project({ status: 'done' })], [], NOW, 60).length, 0);
});

test('hasOverdue: termin umowy, zadanie albo pismo po terminie', () => {
  assert.equal(Insight.hasOverdue(project(), NOW, []), false);
  assert.equal(Insight.hasOverdue(project({ deadline: '2026-09-26' }), NOW, []), true);
  const late = project({ stages: [stage('preparation', 'working', 40, '', [task({ deadline: '2026-09-29T12:00' })])] });
  assert.equal(Insight.hasOverdue(late, NOW, []), true);
  const mail = [{ id: 'm1', projectId: 1, direction: 'in', subject: 'X', replyDue: '2026-09-30', registeredDate: '2026-09-20' }];
  assert.equal(Insight.hasOverdue(project(), NOW, mail), true);
  assert.equal(Insight.hasOverdue(project({ status: 'done', deadline: '2026-09-26' }), NOW, mail), false);
});

test('attentionItems: powody stanu z działaniami, zaległe pisma, etap bez zadań, zadania bez osoby', () => {
  const calm = project({ deadline: '2027-12-31', stages: [stage('concept', 'working', 80, '', [task({ deadline: '2027-01-10T12:00', assignees: ['p-1'] })])] });
  assert.deepEqual(Insight.attentionItems(calm, NOW, []), []);
  assert.deepEqual(Insight.attentionItems(project({ status: 'done' }), NOW, []), []);

  const over = Insight.attentionItems(project({ deadline: '2026-09-26' }), NOW, []);
  assert.equal(over[0].rule, 'deadline-passed');
  assert.deepEqual(over[0].actions.map((a) => a.id), ['deadline', 'close']);

  const empty = Insight.attentionItems(project({ deadline: '2027-12-31', stages: [stage('concept', 'working', 80, '', [])] }), NOW, []);
  assert.equal(empty[0].rule, 'empty-stage');
  assert.equal(empty[0].actions[0].id, 'addTasks');

  const orphan = Insight.attentionItems(project({ deadline: '2027-12-31', stages: [stage('concept', 'working', 80, '', [task({ deadline: '2027-01-10T12:00' })])] }), NOW, []);
  assert.deepEqual(orphan.map((x) => x.rule), ['unassigned']);

  const waiting = [{ entry: { id: 'm1' }, reply: { state: 'overdue', days: -3 } }];
  const withMail = Insight.attentionItems(calm, NOW, waiting);
  assert.equal(withMail[0].rule, 'mail-late');
  assert.equal(withMail[0].level, 'alarm');
});

test('activity: zmiany statusów zadań i pisma, najnowsze pierwsze', () => {
  const t = task({ id: 't1', name: 'Rysunki', status: 'review', history: [
    { from: 'todo', to: 'working', reason: '', at: '2026-09-30T08:00:00.000Z' },
    { from: 'working', to: 'review', reason: '', at: '2026-10-01T09:00:00.000Z' }
  ] });
  const p = project({ stages: [stage('concept', 'working', 80, '', [t])] });
  const mail = [{ id: 'm1', projectId: 1, direction: 'in', regNo: 'P/2026/1', subject: 'Zapytanie', createdAt: '2026-09-30T12:00:00.000Z' }, { id: 'm2', projectId: 2, direction: 'in', regNo: 'P/2026/2', subject: 'Inny', createdAt: '2026-10-02T12:00:00.000Z' }];
  const list = Insight.activity(p, mail, 10);
  assert.equal(list.length, 3);
  assert.match(list[0].text, /W toku → Do zatwierdzenia/);
  assert.equal(list[1].kind, 'mail');
  assert.equal(Insight.activity(p, mail, 2).length, 2);
});
