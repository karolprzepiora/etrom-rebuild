/* ETROM — czy plan wstępny projektu zmieści się w zespole. Czyste funkcje, bez DOM.
   Dla zespołu projektu zestawia tydzień po tygodniu: pojemność (bez nieobecności), pracę z innych projektów
   i zapotrzebowanie projektu wynikające z godzin i terminów etapów. Niczego nie podpowiada. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Plan = node ? require('./plan.js') : root.ETROM.Plan;
  var Team = node ? require('./team.js') : root.ETROM.Team;
  var TL = node ? require('./timelog.js') : root.ETROM.TimeLog;

  var DAY = 86400000;

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function isWorkday(d) { return d.getDay() !== 0 && d.getDay() !== 6; }
  function mondayOf(d) { return addDays(startOfDay(d), -((d.getDay() + 6) % 7)); }
  function dayDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  /**
   * @param {{project: Object, projects: Array, people: Array, entries: Array, absences?: Array, now?: Date, target?: number, weeks?: number}} input
   * @returns {{weeks: Array<{start:number, capacity:number, others:number, own:number, total:number, ratio:number, state:string}>, team: string[], unscheduled: number, overWeeks: number}}
   */
  function build(input) {
    var now = input.now instanceof Date ? input.now : new Date();
    var today = startOfDay(now);
    var project = input.project;
    var team = Team.projectPeople(project.team || {}).filter(function (id) { return (input.people || []).some(function (p) { return p.id === id && p.active !== false; }); });
    var count = Math.max(1, Math.min(12, Number(input.weeks) || 12));
    var plan = Plan.build({
      projects: (input.projects || []).filter(function (p) { return p.id !== project.id; }),
      people: input.people, entries: input.entries, now: now, target: input.target, weeks: count, absences: input.absences, personIds: team
    });
    var weeks = plan.weeks.map(function (w, i) {
      var capacity = 0, others = 0;
      plan.rows.forEach(function (r) { capacity += r.weeks[i].capacity; others += r.weeks[i].planned; });
      return { start: w.start, capacity: Math.round(capacity * 10) / 10, others: Math.round(others * 10) / 10, own: 0, total: 0, ratio: 0, state: 'ok' };
    });

    var loggedByStage = {};
    (input.entries || []).forEach(function (e) {
      if (e.projectId !== project.id) return;
      loggedByStage[e.stageId] = (loggedByStage[e.stageId] || 0) + TL.minutes(e, now) / 60;
    });
    var unscheduled = 0;
    var prevDeadline = null;
    (project.stages || []).forEach(function (stage) {
      var due = dayDate(stage.deadline);
      if (stage.status === 'done') { if (due) prevDeadline = due; return; }
      var left = Math.max(0, (Number(stage.hours) || 0) - (loggedByStage[stage.id] || 0));
      if (due) prevDeadline = prevDeadline && prevDeadline.getTime() > due.getTime() ? prevDeadline : due;
      if (left <= 0) return;
      if (!due) { unscheduled += left; return; }
      var from = today;
      var days = [];
      if (due.getTime() >= today.getTime()) {
        for (var d = from; d.getTime() <= due.getTime(); d = addDays(d, 1)) if (isWorkday(d)) days.push(d);
      }
      if (!days.length) days = [today];
      var per = left / days.length;
      days.forEach(function (day) {
        var idx = Math.floor((mondayOf(day).getTime() - plan.first) / (7 * DAY));
        if (idx < 0) idx = 0;
        if (idx < weeks.length) weeks[idx].own += per;
      });
    });
    var over = 0;
    weeks.forEach(function (w) {
      w.own = Math.round(w.own * 10) / 10;
      w.total = Math.round((w.others + w.own) * 10) / 10;
      w.ratio = w.capacity > 0 ? w.total / w.capacity : (w.total > 0 ? Infinity : 0);
      w.state = w.ratio > 1 ? 'over' : (w.ratio >= Plan.TIGHT_AT ? 'tight' : 'ok');
      if (w.state === 'over') over += 1;
    });
    return { weeks: weeks, team: team, unscheduled: Math.round(unscheduled * 10) / 10, overWeeks: over };
  }

  var api = { build: build };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Feasibility = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
