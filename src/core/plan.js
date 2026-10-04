/* ETROM — plan obciążenia: ile godzin pracy czeka na każdą osobę w kolejnych tygodniach.
   Czyste funkcje, bez DOM.
   Godziny zadania: szacunek (`task.estimate`) albo wartość domyślna z nakładu pracy, pomniejszone o czas już
   zapisany na zadaniu przez zespół. Zadanie „do zatwierdzenia” liczy się jako godzina odbioru. Pozostałe godziny
   dzielą się po równo między realizatorów i rozkładają równomiernie na dni robocze od dziś do terminu;
   zadanie po terminie ląduje w bieżącym tygodniu, zadanie bez terminu trafia do osobnej puli. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var TL = node ? require('./timelog.js') : root.ETROM.TimeLog;

  var DEFAULT_HOURS = { small: 4, medium: 12, large: 32, veryLarge: 64 };
  var TIGHT_AT = 0.85;

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function isWorkday(d) { return d.getDay() !== 0 && d.getDay() !== 6; }
  function mondayOf(d) { return addDays(startOfDay(d), -((d.getDay() + 6) % 7)); }

  /** Szacunek godzin zadania. */
  function estimateHours(task) {
    var e = Number(task && task.estimate);
    if (e > 0) return e;
    return DEFAULT_HOURS[task && task.workload] || DEFAULT_HOURS.medium;
  }

  /** Godziny, które jeszcze zostały do zrobienia przy zadaniu (cały zespół). */
  function remainingHours(task, loggedMinutes) {
    if (!task || task.status === 'done') return 0;
    var left = Math.max(0, estimateHours(task) - (loggedMinutes || 0) / 60);
    return task.status === 'review' ? Math.min(left, 1) : left;
  }

  function deadlineDate(task) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(task && task.deadline || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  /** Dni robocze od `from` do `to` włącznie; pusta lista, gdy brak. */
  function workdaysBetween(from, to) {
    var out = [];
    for (var d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) if (isWorkday(d)) out.push(d);
    return out;
  }

  /**
   * @param {{projects: Array, people: Array, entries: Array, now: Date, target?: number, weeks?: number, personIds?: string[]}} input
   *   target: minuty celu dnia (domyślnie 480); weeks: liczba tygodni w planie (domyślnie 6)
   * @returns {{weeks: Array, rows: Array}}
   */
  function build(input) {
    var now = input.now instanceof Date ? input.now : new Date();
    var today = startOfDay(now);
    var targetH = (Number(input.target) > 0 ? Number(input.target) : 480) / 60;
    var count = Math.max(1, Math.min(12, Number(input.weeks) || 6));
    var first = mondayOf(today);
    // W weekend nie zostały już dni robocze bieżącego tygodnia: plan zaczyna się od najbliższego poniedziałku.
    if (!workdaysBetween(today, addDays(first, 6)).length) first = addDays(first, 7);
    var weeks = [];
    for (var w = 0; w < count; w += 1) {
      var start = addDays(first, w * 7);
      var days = workdaysBetween(start, addDays(start, 6)).filter(function (d) { return d.getTime() >= today.getTime(); });
      weeks.push({ start: start.getTime(), workdays: days.length, capacity: days.length * targetH, current: start.getTime() <= today.getTime() });
    }
    var weekIndex = function (d) { return Math.floor((mondayOf(d).getTime() - first.getTime()) / (7 * 86400000)); };

    var loggedByTask = {};
    (input.entries || []).forEach(function (e) {
      var k = e.projectId + '|' + e.stageId + '|' + e.taskId;
      loggedByTask[k] = (loggedByTask[k] || 0) + TL.minutes(e, now);
    });

    var rowsById = {};
    var people = (input.people || []).filter(function (p) { return p.active !== false && (!input.personIds || input.personIds.indexOf(p.id) >= 0); });
    people.forEach(function (p) {
      rowsById[p.id] = {
        personId: p.id,
        weeks: weeks.map(function (wk) { return { start: wk.start, capacity: wk.capacity, planned: 0, ratio: 0, state: 'ok', tasks: [] }; }),
        unscheduled: { hours: 0, tasks: [] }, total: 0
      };
    });

    (input.projects || []).forEach(function (project) {
      (project.stages || []).forEach(function (stage) {
        (stage.tasks || []).forEach(function (task) {
          var assignees = (task.assignees || []).filter(function (id) { return rowsById[id]; });
          if (!assignees.length) return;
          var left = remainingHours(task, loggedByTask[project.id + '|' + stage.id + '|' + task.id]);
          if (left <= 0) return;
          var share = left / (task.assignees || []).length;
          var due = deadlineDate(task);
          var ref = { projectId: project.id, stageId: stage.id, taskId: task.id, name: task.name, code: project.code, overdue: !!due && due.getTime() < today.getTime() };
          var buckets = [];
          if (!due) buckets = null;
          else if (due.getTime() < today.getTime()) buckets = [{ week: 0, hours: share }];
          else {
            var days = workdaysBetween(today, due);
            if (!days.length) days = [today];
            var per = share / days.length;
            // Okno za krótkie: ile dni roboczych pracy potrzeba osobie wobec dni do terminu.
            var needDays = Math.ceil(share / targetH - 1e-9);
            if (needDays > days.length) ref.squeezed = true;
            else if (needDays === days.length && needDays >= 2) ref.mustStartNow = true;
            var byWeek = {};
            days.forEach(function (d) { var i = Math.max(0, weekIndex(d)); byWeek[i] = (byWeek[i] || 0) + per; });
            buckets = Object.keys(byWeek).map(function (i) { return { week: Number(i), hours: byWeek[i] }; });
          }
          assignees.forEach(function (id) {
            var row = rowsById[id];
            if (!buckets) {
              row.unscheduled.hours += share;
              row.unscheduled.tasks.push(Object.assign({ hours: share }, ref));
              return;
            }
            buckets.forEach(function (b) {
              if (b.week >= weeks.length) return;
              var cell = row.weeks[b.week];
              cell.planned += b.hours;
              cell.tasks.push(Object.assign({ hours: b.hours }, ref));
            });
          });
        });
      });
    });

    var rows = Object.keys(rowsById).map(function (id) {
      var row = rowsById[id];
      row.weeks.forEach(function (cell) {
        cell.planned = Math.round(cell.planned * 10) / 10;
        cell.ratio = cell.capacity > 0 ? cell.planned / cell.capacity : (cell.planned > 0 ? Infinity : 0);
        cell.state = cell.ratio > 1 ? 'over' : (cell.ratio >= TIGHT_AT ? 'tight' : 'ok');
        cell.tasks.sort(function (a, b) { return b.hours - a.hours; });
        row.total += cell.planned;
      });
      row.unscheduled.hours = Math.round(row.unscheduled.hours * 10) / 10;
      row.unscheduled.tasks.sort(function (a, b) { return b.hours - a.hours; });
      return row;
    }).sort(function (a, b) { return b.total - a.total; });
    return { weeks: weeks, rows: rows };
  }

  var api = { DEFAULT_HOURS: DEFAULT_HOURS, TIGHT_AT: TIGHT_AT, estimateHours: estimateHours, remainingHours: remainingHours, build: build };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Plan = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
