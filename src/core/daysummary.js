/* ETROM — podsumowanie dnia pracownika. Czyste funkcje, bez DOM.
   Pokazuje godziny względem celu dnia, rozbicie na zadania i najbliższe terminy z upływem czasu w procentach.
   Pracownik nie widzi tu godzin zaplanowanych na zadania ani obciążenia: tylko to, co sam zapisał, i ile czasu ucieka. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var TL = node ? require('./timelog.js') : root.ETROM.TimeLog;
  var TS = node ? require('./timesheet.js') : root.ETROM.Timesheet;

  var DAY = 86400000;
  var EVENING_HOUR = 16;   // od tej godziny brak celu dnia ocenia się jak zamknięty dzień

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  /** 'ok' (cel osiągnięty), 'run' (dzień trwa), 'warn' (wieczorem brakuje do godziny), 'bad' (wieczorem brakuje więcej). */
  function dayVerdict(minutes, target, now) {
    if (minutes >= target) return 'ok';
    if (now.getHours() < EVENING_HOUR) return 'run';
    return minutes >= target - 60 ? 'warn' : 'bad';
  }

  function dayDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function workdaysLeft(from, to) {
    var n = 0;
    for (var d = new Date(from.getTime()); d.getTime() < to.getTime(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) n += 1;
    }
    return n;
  }

  /**
   * @param {{entries: Array, projects: Array, personId: string, now: Date, target?: number, absences?: Array, limit?: number}} input
   */
  function build(input) {
    var now = input.now instanceof Date ? input.now : new Date();
    var today = startOfDay(now);
    var target = Number(input.target) > 0 ? Number(input.target) : 480;
    var entries = input.entries || [];
    var todays = TL.forDay(entries, input.personId, now);
    var minutes = TL.sum(todays, now);

    var byTask = {};
    var order = [];
    todays.forEach(function (e) {
      var k = e.projectId + '|' + e.stageId + '|' + e.taskId;
      if (!byTask[k]) { byTask[k] = { projectId: e.projectId, stageId: e.stageId, taskId: e.taskId, label: e.label || '', minutes: 0 }; order.push(k); }
      byTask[k].minutes += TL.minutes(e, now);
    });
    var projectCode = {};
    var taskName = {};
    (input.projects || []).forEach(function (p) {
      projectCode[p.id] = p.code;
      (p.stages || []).forEach(function (st) { (st.tasks || []).forEach(function (t) { taskName[p.id + '|' + st.id + '|' + t.id] = t.name; }); });
    });
    var tasks = order.map(function (k) {
      var t = byTask[k];
      return { projectId: t.projectId, stageId: t.stageId, taskId: t.taskId, code: projectCode[t.projectId] || '', name: taskName[k] || t.label || 'Zadanie', minutes: t.minutes };
    }).sort(function (a, b) { return b.minutes - a.minutes; });

    var sheet = TS.build(entries, input.personId, now, { mode: 'week', target: target, absences: input.absences || [] });
    var settled = sheet.days.filter(function (d) { return d.state === 'ok' || d.state === 'warn' || d.state === 'bad'; });
    var weekMinutes = settled.reduce(function (t, d) { return t + d.minutes; }, 0);

    var firstEntry = {};
    entries.forEach(function (e) {
      var k = e.projectId + '|' + e.stageId + '|' + e.taskId;
      var ms = Date.parse(e.start);
      if (!Number.isNaN(ms) && (firstEntry[k] === undefined || ms < firstEntry[k])) firstEntry[k] = ms;
    });
    var upcoming = [];
    (input.projects || []).forEach(function (p) {
      (p.stages || []).forEach(function (st) {
        (st.tasks || []).forEach(function (t) {
          if (t.status === 'done' || t.draft || (t.assignees || []).indexOf(input.personId) < 0) return;
          var due = dayDate(t.deadline);
          if (!due) return;
          var k = p.id + '|' + st.id + '|' + t.id;
          var start = dayDate(t.start) || (firstEntry[k] !== undefined ? startOfDay(new Date(firstEntry[k])) : null);
          var overdue = due.getTime() < today.getTime();
          var elapsed = null;
          if (overdue) elapsed = 100;
          else if (start && start.getTime() < due.getTime()) elapsed = Math.max(0, Math.min(100, Math.round((today.getTime() - start.getTime()) / (due.getTime() + DAY - start.getTime()) * 100)));
          else if (start) elapsed = 0;
          upcoming.push({
            projectId: p.id, stageId: st.id, taskId: t.id, code: p.code, name: t.name, deadline: t.deadline,
            overdue: overdue, daysLeft: overdue ? 0 : workdaysLeft(today, due), elapsed: elapsed, dueMs: due.getTime()
          });
        });
      });
    });
    upcoming.sort(function (a, b) { return a.dueMs - b.dueMs; });

    return {
      minutes: minutes, target: target, missing: Math.max(0, target - minutes), state: dayVerdict(minutes, target, now),
      week: { minutes: weekMinutes, expected: settled.length * target, state: sheet.state, days: settled.length },
      tasks: tasks, upcoming: upcoming.slice(0, Number(input.limit) > 0 ? Number(input.limit) : 4)
    };
  }

  var api = { build: build, dayVerdict: dayVerdict, EVENING_HOUR: EVENING_HOUR };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.DaySummary = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
