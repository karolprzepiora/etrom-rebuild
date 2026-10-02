'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Feed = require('../src/core/feed.js');
const Social = require('../src/core/social.js');
const Model = require('../src/core/model.js');
const Format = require('../src/core/format.js');

const NOW = new Date(2026, 9, 2, 12, 0);
const iso = (d, h, m) => new Date(2026, 9, d, h, m || 0).toISOString();
const people = [
  { id: 'p-1', orgRole: 'managing' },
  { id: 'p-2', orgRole: 'member' },
  { id: 'p-3', orgRole: 'member' }
];
const task = (extra) => Object.assign({ id: 't-1', name: 'Zadanie', status: 'review', assignees: ['p-3'], history: [], deadline: '', parts: {}, workload: 'medium' }, extra || {});
const project = (extra) => Object.assign({
  id: 1, code: '2601', name: 'Projekt', client: 'K', status: 'active', deadline: '2027-01-01', createdAt: iso(1, 8),
  team: { leader: 'p-2', coordinator: '', proxyLead: '', proxyExtra: '', members: ['p-3'] },
  stages: [Object.assign(Model.createStage('concept'), { tasks: [task({ history: [
    { from: 'todo', to: 'working', at: iso(1, 9), reason: '', by: 'p-3' },
    { from: 'working', to: 'review', at: iso(2, 10), reason: '' },
    { from: 'review', to: 'changes', at: iso(2, 11), reason: 'Brak rzędnych', by: 'p-2' }
  ] })] })]
}, extra || {});
const entry = (personId, start, minutes, taskId) => ({
  id: 'e' + start + personId, personId, projectId: 1, stageId: 'concept', taskId: taskId || 't-1', label: 'Zadanie',
  start: iso(2, start), end: new Date(new Date(2026, 9, 2, start).getTime() + minutes * 60000).toISOString()
});
const ws = (extra) => Object.assign({ projects: [project()], people, entries: [], mail: [], social: Social.empty() }, extra || {});

test('strumień zbiera zdarzenia zadań, nowy projekt i pisma od najnowszego', () => {
  const mail = [{ id: 'm-1', projectId: 1, direction: 'in', regNo: 'P/2026/001', subject: 'Wezwanie', createdAt: iso(2, 9) }];
  const r = Feed.build(ws({ mail }), 'p-1', NOW, { limit: 50 });
  assert.deepEqual(r.items.map((i) => i.kind), ['task', 'task', 'mail', 'task', 'project']);
  assert.equal(r.items[0].reason, 'Brak rzędnych');
  assert.equal(r.total, 5);
});

test('autor zdarzenia: zapisany w historii albo domniemany z roli', () => {
  const r = Feed.build(ws(), 'p-1', NOW, { limit: 50 }).items.filter((i) => i.kind === 'task');
  const byTo = Object.fromEntries(r.map((i) => [i.to, i.actorId]));
  assert.equal(byTo.working, 'p-3', 'zapisany w historii');
  assert.equal(byTo.review, 'p-3', 'brak zapisu: realizator');
  assert.equal(byTo.changes, 'p-2', 'zapisany w historii');
});

test('czas pracy: własny widać zawsze, cudzy tylko lider projektu i zarząd', () => {
  const entries = [entry('p-3', 8, 90), entry('p-3', 10, 30)];
  const kinds = (viewer) => Feed.build(ws({ entries }), viewer, NOW, { limit: 50 }).items.filter((i) => i.kind === 'time');
  assert.equal(kinds('p-3').length, 1, 'własny czas, scalony w jeden wpis na dzień i zadanie');
  assert.equal(kinds('p-3')[0].minutes, 120);
  assert.equal(kinds('p-1').length, 1, 'zarząd');
  assert.equal(kinds('p-2').length, 1, 'lider projektu');
  const other = [{ id: 'x', personId: 'p-1', projectId: 1, stageId: 'concept', taskId: 't-1', label: 'Z', start: iso(2, 8), end: iso(2, 9) }];
  assert.equal(Feed.build(ws({ entries: other }), 'p-3', NOW, { limit: 50 }).items.filter((i) => i.kind === 'time').length, 0, 'zwykły pracownik nie widzi cudzego czasu');
  assert.equal(Feed.build(ws({ entries: other }), null, NOW, { limit: 50 }).items.filter((i) => i.kind === 'time').length, 0);
});

test('bardzo krótkie wpisy czasu i działające zegary nie trafiają do strumienia', () => {
  const entries = [entry('p-3', 8, 2), { id: 'run', personId: 'p-3', projectId: 1, stageId: 'concept', taskId: 't-1', label: 'Z', start: iso(2, 8), end: null }];
  assert.equal(Feed.build(ws({ entries }), 'p-3', NOW, { limit: 50 }).items.filter((i) => i.kind === 'time').length, 0);
});

test('wpisy ludzi trafiają do strumienia z projektem albo bez', () => {
  let social = Social.empty();
  social = Social.addPost(social, { personId: 'p-1', text: 'Spotkanie w piątek', projectId: null }, new Date(2026, 9, 2, 11)).social;
  social = Social.addPost(social, { personId: 'p-2', text: 'Mamy uzgodnienie', projectId: 1 }, new Date(2026, 9, 2, 11, 30)).social;
  const r = Feed.build(ws({ social }), 'p-1', NOW, { limit: 50, filter: 'posts' });
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].project.id, 1);
  assert.equal(r.items[1].project, null);
  assert.equal(r.counts.posts, 2);
});

test('filtr „Moje” zostawia pozycje z moich projektów lub moje własne; limit i hasMore', () => {
  const other = project({ id: 2, code: '2602', createdAt: iso(1, 7), team: { leader: 'p-1', coordinator: '', proxyLead: '', proxyExtra: '', members: [] }, stages: [] });
  const w = ws({ projects: [project(), other] });
  const mine = Feed.build(w, 'p-3', NOW, { filter: 'mine', limit: 50 });
  assert.ok(mine.items.every((i) => i.project.id === 1));
  assert.equal(mine.counts.all - mine.counts.mine, 1, 'jedna pozycja z cudzego projektu');
  const page = Feed.build(w, 'p-1', NOW, { limit: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(page.hasMore, true);
});

test('reakcje: przełączanie, liczenie, odrzucanie nieznanych', () => {
  let s = Social.empty();
  s = Social.toggleReaction(s, 'task:1', 'like', 'p-1');
  s = Social.toggleReaction(s, 'task:1', 'like', 'p-2');
  s = Social.toggleReaction(s, 'task:1', 'party', 'p-2');
  assert.deepEqual(Social.reactionsOf(s, 'task:1', 'p-1').map((r) => [r.id, r.count, r.mine]), [['like', 2, true], ['party', 1, false]]);
  s = Social.toggleReaction(s, 'task:1', 'like', 'p-1');
  assert.equal(Social.reactionsOf(s, 'task:1', 'p-1')[0].count, 1);
  assert.equal(Social.toggleReaction(s, 'task:1', 'nie-ma', 'p-1'), s);
  s = Social.toggleReaction(Social.toggleReaction(s, 'task:1', 'like', 'p-2'), 'task:1', 'party', 'p-2');
  assert.deepEqual(s.reactions, {}, 'puste wpisy znikają');
});

test('komentarze i wpisy: walidacja, numeracja, usuwanie z powiązaniami', () => {
  let s = Social.empty();
  assert.equal(Social.addComment(s, 'task:1', 'p-1', '   ', NOW).valid, false);
  assert.equal(Social.addComment(s, 'task:1', '', 'ok', NOW).valid, false);
  assert.equal(Social.addComment(s, 'task:1', 'p-1', 'x'.repeat(501), NOW).valid, false);
  s = Social.addComment(s, 'task:1', 'p-1', ' Dobra robota ', NOW).social;
  s = Social.addComment(s, 'task:1', 'p-2', 'Dzięki', new Date(NOW.getTime() + 1000)).social;
  assert.deepEqual(Social.commentsOf(s, 'task:1').map((c) => [c.id, c.text]), [['c-1', 'Dobra robota'], ['c-2', 'Dzięki']]);
  assert.equal(Social.addPost(s, { personId: 'p-1', text: '' }, NOW).valid, false);
  const posted = Social.addPost(s, { personId: 'p-1', text: 'Hej', projectId: 3 }, NOW);
  assert.equal(posted.post.id, 'w-1');
  let t = Social.addComment(posted.social, 'post:w-1', 'p-2', 'Cześć', NOW).social;
  t = Social.toggleReaction(t, 'post:w-1', 'like', 'p-2');
  t = Social.removePost(t, 'w-1');
  assert.equal(t.posts.length, 0);
  assert.equal(Social.commentsOf(t, 'post:w-1').length, 0);
  assert.equal(t.reactions['post:w-1'], undefined);
  assert.equal(Social.removeComment(s, 'c-1').comments.length, 1);
});

test('zapis społeczności jest czyszczony, a model go zachowuje', () => {
  const clean = Social.normalize({
    reactions: { 'task:1': { like: ['p-1', 'p-1', 'p-2'], zle: ['p-1'] }, '': { like: ['p-1'] } },
    comments: [{ id: 'c-1', key: 'task:1', personId: 'p-1', text: 'ok', at: iso(2, 8) }, { id: 'c-1', key: 'k', personId: 'p', text: 'dup', at: iso(2, 8) }, { id: 'c-2', key: 'k', personId: 'p', text: '', at: iso(2, 8) }],
    posts: [{ id: 'w-1', personId: 'p-1', projectId: 4, text: 'Hej', at: iso(2, 8) }, { id: 'w-2', personId: 'p-1', text: 'Zła data', at: 'wczoraj' }]
  });
  assert.deepEqual(clean.reactions, { 'task:1': { like: ['p-1', 'p-2'] } });
  assert.equal(clean.comments.length, 1);
  assert.equal(clean.posts.length, 1);
  const back = Model.normalizeWorkspace({ projects: [], social: clean });
  assert.equal(back.social.posts[0].text, 'Hej');
  assert.deepEqual(Model.normalizeWorkspace({}).social, Social.empty());
});

test('czas względny i etykiety dni', () => {
  const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();
  assert.equal(Format.ago(new Date(NOW.getTime() - 20000).toISOString(), NOW), 'przed chwilą');
  assert.equal(Format.ago(at(2, 11, 59), NOW), '1 min temu');
  assert.equal(Format.ago(at(2, 11, 30), NOW), '30 min temu');
  assert.equal(Format.ago(at(2, 8, 10), NOW), '3 godz. temu');
  assert.equal(Format.ago(at(1, 14, 5), NOW), 'wczoraj, 14:05');
  assert.equal(Format.ago(new Date(2026, 8, 28, 9, 5).toISOString(), NOW), '28\u00a0wrz, 09:05');
  assert.equal(Format.dayLabel(at(2, 8, 0), NOW), 'Dziś');
  assert.equal(Format.dayLabel(at(1, 8, 0), NOW), 'Wczoraj');
  assert.match(Format.dayLabel(new Date(2026, 8, 28, 8).toISOString(), NOW), /^pon\., 28\swrz/);
  assert.equal(Format.ago('zły', NOW), '');
});

test('historia zadania zapamiętuje, kto zmienił status', () => {
  const Tasks = require('../src/core/tasks.js');
  const t = Tasks.createTask({ name: 'A', assignees: [] }, [], []);
  const moved = Tasks.moveTask(t, 'working', '', 'p-9');
  assert.equal(moved.task.history[0].by, 'p-9');
  const clean = Tasks.normalizeTasks([moved.task], []);
  assert.equal(clean[0].history[0].by, 'p-9');
});

test('zdarzenia z przyszłości nie trafiają do strumienia', () => {
  const Feed = require('../src/core/feed.js');
  const now = new Date('2026-10-02T12:00:00.000Z');
  const ws = { projects: [], people: [], mail: [], entries: [], social: { reactions: {}, comments: [], posts: [
    { id: 'w-1', personId: 'p1', projectId: null, text: 'Za chwilę', at: '2026-10-02T15:00:00.000Z' },
    { id: 'w-2', personId: 'p1', projectId: null, text: 'Teraz', at: '2026-10-02T11:00:00.000Z' }
  ] } };
  const result = Feed.build(ws, 'p1', now);
  assert.deepStrictEqual(result.items.map((i) => i.key), ['post:w-2']);
});
