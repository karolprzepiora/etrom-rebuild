/* ETROM — przegląd tygodnia dla zarządu i liderów: lista tego, co wymaga decyzji. Czyste funkcje, bez DOM.
   Nic nie podpowiada (nie proponuje przesunięć ani zmian): pokazuje fakty, decyzję podejmuje człowiek. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Plan = node ? require('./plan.js') : root.ETROM.Plan;
  var TS = node ? require('./timesheet.js') : root.ETROM.Timesheet;
  var TL = node ? require('./timelog.js') : root.ETROM.TimeLog;

  var DAY = 86400000;
  var IDLE_DAYS = 7;

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dayDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  /**
   * @param {{projects: Array, people: Array, entries: Array, mail?: Array, absences?: Array, now?: Date, target?: number,
   *   personIds?: string[], projectIds?: Array}} input personIds / projectIds zawężają zakres (lider widzi swoje projekty i ich osoby)
   */
  function build(input) {
    var now = input.now instanceof Date ? input.now : new Date();
    var today = startOfDay(now);
    var target = Number(input.target) > 0 ? Number(input.target) : 480;
    var inScope = function (project) { return !input.projectIds || input.projectIds.indexOf(project.id) >= 0; };
    var projects = (input.projects || []).filter(function (p) { return inScope(p) && p.status !== 'done'; });
    var people = (input.people || []).filter(function (p) { return p.active !== false && (!input.personIds || input.personIds.indexOf(p.id) >= 0); });
    var absences = input.absences || [];

    var plan = Plan.build({ projects: projects, people: people, entries: input.entries || [], now: now, target: target, weeks: 4, absences: absences, personIds: input.personIds });

    var overload = [];
    var tight = [];
    var seenTight = {};
    plan.rows.forEach(function (row) {
      row.weeks.forEach(function (cell, i) {
        if (cell.state === 'over') overload.push({ personId: row.personId, week: i, weekStart: cell.start, planned: cell.planned, capacity: cell.capacity, over: Math.round((cell.planned - cell.capacity) * 10) / 10 });
      });
      row.bars.forEach(function (b) {
        if (!(b.squeezed || b.mustStartNow) || b.overdue) return;
        var k = b.projectId + '|' + b.stageId + '|' + b.taskId;
        if (!seenTight[k]) { seenTight[k] = { projectId: b.projectId, stageId: b.stageId, taskId: b.taskId, code: b.code, name: b.name, squeezed: !!b.squeezed, personIds: [] }; tight.push(seenTight[k]); }
        seenTight[k].personIds.push(row.personId);
        if (b.squeezed) seenTight[k].squeezed = true;
      });
    });
    overload.sort(function (a, b) { return a.week - b.week || b.over - a.over; });
    tight.sort(function (a, b) { return (b.squeezed ? 1 : 0) - (a.squeezed ? 1 : 0); });

    var late = [];
    projects.forEach(function (p) {
      (p.stages || []).forEach(function (st) {
        (st.tasks || []).forEach(function (t) {
          if (t.status === 'done' || t.draft) return;
          var due = dayDate(t.deadline);
          if (!due || due.getTime() >= today.getTime()) return;
          late.push({ projectId: p.id, stageId: st.id, taskId: t.id, code: p.code, name: t.name, daysLate: Math.round((today.getTime() - due.getTime()) / DAY), personIds: (t.assignees || []).slice() });
        });
      });
    });
    late.sort(function (a, b) { return b.daysLate - a.daysLate; });

    var lastTouch = {};
    (input.entries || []).forEach(function (e) {
      var ms = Date.parse(e.start);
      if (!Number.isNaN(ms) && (lastTouch[e.projectId] === undefined || ms > lastTouch[e.projectId])) lastTouch[e.projectId] = ms;
    });
    projects.forEach(function (p) {
      (p.stages || []).forEach(function (st) { (st.tasks || []).forEach(function (t) { (t.history || []).forEach(function (h) {
        var ms = Date.parse(h.at);
        if (!Number.isNaN(ms) && (lastTouch[p.id] === undefined || ms > lastTouch[p.id])) lastTouch[p.id] = ms;
      }); }); });
    });
    var idle = [];
    projects.forEach(function (p) {
      if (p.status !== 'active') return;
      var ms = lastTouch[p.id];
      var days = ms === undefined ? null : Math.floor((today.getTime() - startOfDay(new Date(ms)).getTime()) / DAY);
      if (days === null || days >= IDLE_DAYS) idle.push({ projectId: p.id, code: p.code, name: p.name, days: days });
    });
    idle.sort(function (a, b) { return (b.days === null ? 1e6 : b.days) - (a.days === null ? 1e6 : a.days); });

    var lowTime = [];
    people.forEach(function (person) {
      var sheet = TS.build(input.entries || [], person.id, now, { mode: 'week', offset: -1, target: target, absences: absences });
      var settled = sheet.days.filter(function (d) { return d.state === 'ok' || d.state === 'warn' || d.state === 'bad'; });
      if (!settled.length) return;
      var minutes = settled.reduce(function (t, d) { return t + d.minutes; }, 0);
      var expected = settled.length * target;
      var badDays = settled.filter(function (d) { return d.state === 'bad'; }).length;
      if (sheet.state === 'ok' && !badDays) return;
      lowTime.push({ personId: person.id, minutes: minutes, expected: expected, badDays: badDays, days: settled.length, state: sheet.state });
    });
    lowTime.sort(function (a, b) { return (b.expected - b.minutes) - (a.expected - a.minutes); });

    var mail = [];
    var byProject = {};
    (input.mail || []).forEach(function (m) {
      if (!m.needsAction || !projects.some(function (p) { return p.id === m.projectId; })) return;
      byProject[m.projectId] = (byProject[m.projectId] || 0) + 1;
    });
    projects.forEach(function (p) { if (byProject[p.id]) mail.push({ projectId: p.id, code: p.code, name: p.name, count: byProject[p.id] }); });
    mail.sort(function (a, b) { return b.count - a.count; });

    return {
      overload: overload, late: late, tight: tight, idle: idle, lowTime: lowTime, mail: mail,
      total: overload.length + late.length + tight.length + idle.length + lowTime.length + mail.length
    };
  }

  var api = { build: build, IDLE_DAYS: IDLE_DAYS };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Review = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
