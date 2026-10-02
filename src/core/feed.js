/* ETROM — strumień „Aktualności”: zdarzenia z pracy biura i wpisy ludzi w jednej osi czasu.
   Czyste funkcje, bez DOM. Zdarzenia są wyliczane ze stanu (historia zadań, pisma, czas,
   nowe projekty), więc nie ma osobnego zapisu poza wpisami i komentarzami z social.js.
   Zasada widoczności czasu pracy: cudzy czas widzi lider projektu i zarząd (budget.js). */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Budget = node ? require('./budget.js') : root.ETROM.Budget;
  var Team = node ? require('./team.js') : root.ETROM.Team;
  var TimeLog = node ? require('./timelog.js') : root.ETROM.TimeLog;

  var MIN_TIME_MINUTES = 5;
  // Zapisy czasu starsze niż to okno są w „Czasie” projektu, nie w strumieniu.
  var TIME_WINDOW_DAYS = 14;
  var FILTERS = ['all', 'mine', 'mail', 'posts', 'media'];

  function allTasks(project) {
    var out = [];
    (project.stages || []).forEach(function (stage) {
      (stage.tasks || []).forEach(function (task) { out.push({ stage: stage, task: task }); });
    });
    return out;
  }

  /** Autor zdarzenia: zapisany w historii, a dla starych zapisów — domniemany z roli. */
  function actorOf(entry, task, project) {
    if (entry.by) return entry.by;
    if (entry.to === 'working' || entry.to === 'review') return (task.assignees || [])[0] || '';
    if (entry.to === 'done' || entry.to === 'changes') return (project.team && project.team.leader) || '';
    return '';
  }

  function dayOf(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** Wszystkie pozycje strumienia widoczne dla osoby, od najnowszej. */
  function collect(ws, viewerId, now) {
    var projects = ws.projects || [];
    var people = ws.people || [];
    var byId = {};
    projects.forEach(function (p) { byId[p.id] = p; });
    var items = [];

    projects.forEach(function (project) {
      if (project.createdAt) {
        items.push({ key: 'project:' + project.id, kind: 'project', at: project.createdAt, actorId: '', project: project });
      }
      allTasks(project).forEach(function (entry) {
        (entry.task.history || []).forEach(function (h, index) {
          items.push({
            key: 'task:' + project.id + ':' + entry.stage.id + ':' + entry.task.id + ':' + index,
            kind: 'task', at: h.at, actorId: actorOf(h, entry.task, project), project: project,
            stage: entry.stage, task: entry.task, from: h.from, to: h.to, reason: h.reason || ''
          });
        });
      });
    });

    (ws.mail || []).forEach(function (m) {
      var project = byId[m.projectId];
      if (!project) return;
      var at = m.createdAt || (m.registeredDate ? m.registeredDate + 'T08:00:00.000Z' : '');
      if (!at) return;
      items.push({ key: 'mail:' + m.id, kind: 'mail', at: at, actorId: '', project: project, mail: m });
    });

    // Czas pracy: jedna pozycja na osobę, zadanie i dzień; cudzy czas tylko dla lidera i zarządu.
    var groups = {};
    (ws.entries || []).forEach(function (e) {
      if (!e.end) return;
      var project = byId[e.projectId];
      if (!project) return;
      if (Date.parse(e.end) < now.getTime() - TIME_WINDOW_DAYS * 86400000) return;
      if (e.personId !== viewerId && !Budget.canSeeHours(viewerId, project, people)) return;
      var key = 'time:' + e.personId + ':' + e.projectId + ':' + e.stageId + ':' + e.taskId + ':' + dayOf(e.start);
      var g = groups[key] || (groups[key] = { key: key, kind: 'time', at: e.end, actorId: e.personId, project: project, label: e.label, stageId: e.stageId, minutes: 0 });
      g.minutes += TimeLog.minutes(e, now);
      if (e.end > g.at) g.at = e.end;
    });
    Object.keys(groups).forEach(function (k) {
      if (groups[k].minutes >= MIN_TIME_MINUTES) items.push(groups[k]);
    });

    ((ws.social && ws.social.posts) || []).forEach(function (p) {
      var project = p.projectId ? byId[p.projectId] : null;
      if (p.projectId && !project) return;
      items.push({ key: 'post:' + p.id, kind: 'post', at: p.at, actorId: p.personId, project: project, post: p });
    });

    // Zdarzenia z przyszłości (np. wpisany z góry czas) nie należą do strumienia.
    var horizon = now.getTime() + 60000;
    items = items.filter(function (i) { var t = Date.parse(i.at); return Number.isFinite(t) && t <= horizon; });
    items.sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at) || (a.key < b.key ? -1 : 1); });
    return items;
  }

  function isMedia(item) { return item.kind === 'post' && !!(item.post.images && item.post.images.length); }

  function isMine(item, viewerId) {
    if (!viewerId) return false;
    if (item.actorId === viewerId) return true;
    return !!item.project && Team.functionsOf(viewerId, item.project.team).length > 0;
  }

  /**
   * @param {Object} ws przestrzeń robocza
   * @param {string|null} viewerId
   * @param {Date} now
   * @param {{filter?: string, limit?: number}} [options]
   * @returns {{items: Array, total: number, hasMore: boolean, counts: Object}}
   */
  function build(ws, viewerId, now, options) {
    var o = options || {};
    var ref = now instanceof Date ? now : new Date();
    var filter = FILTERS.indexOf(o.filter) >= 0 ? o.filter : 'all';
    var limit = Number(o.limit) > 0 ? Number(o.limit) : 20;
    var all = collect(ws, viewerId, ref);
    var counts = {
      all: all.length,
      mine: all.filter(function (i) { return isMine(i, viewerId); }).length,
      mail: all.filter(function (i) { return i.kind === 'mail'; }).length,
      posts: all.filter(function (i) { return i.kind === 'post'; }).length,
      media: all.filter(isMedia).length
    };
    // Przypięte ogłoszenia stoją osobno na górze, więc nie powtarzamy ich w osi czasu.
    var pinned = all.filter(function (i) { return i.kind === 'post' && i.post.pinned; });
    var shown = all;
    if (filter === 'mine') shown = all.filter(function (i) { return isMine(i, viewerId); });
    else if (filter === 'mail') shown = all.filter(function (i) { return i.kind === 'mail'; });
    else if (filter === 'posts') shown = all.filter(function (i) { return i.kind === 'post'; });
    else if (filter === 'media') shown = all.filter(isMedia);
    if (filter === 'all') shown = shown.filter(function (i) { return pinned.indexOf(i) < 0; });
    return { items: shown.slice(0, limit), total: shown.length, hasMore: shown.length > limit, counts: counts, pinned: filter === 'all' ? pinned : [] };
  }

  var api = { FILTERS: FILTERS, MIN_TIME_MINUTES: MIN_TIME_MINUTES, build: build, collect: collect, isMine: isMine, actorOf: actorOf };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Feed = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
