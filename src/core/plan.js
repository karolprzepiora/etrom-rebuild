/* ETROM — plan obciążenia: ile godzin pracy czeka na każdą osobę w kolejnych tygodniach.
   Czyste funkcje, bez DOM.
   Godziny zadania: szacunek (`task.estimate`) albo wartość domyślna z nakładu pracy, pomniejszone o czas już
   zapisany na zadaniu przez zespół. Zadanie „do zatwierdzenia” liczy się jako godzina odbioru. Pozostałe godziny
   dzielą się po równo między realizatorów i rozkładają równomiernie na dni robocze od dziś do terminu;
   zadanie po terminie ląduje w bieżącym tygodniu, zadanie bez terminu trafia do osobnej puli.
   Zadanie bez własnego szacunku bierze równą część tego, co zostało w puli godzin etapu (budżet etapu minus zapisany
   czas minus szacunki innych zadań). Zadanie może mieć datę startu (`task.start`): praca rozkłada się wtedy od startu
   do terminu. Pojemność tygodnia = dni robocze × cel dnia × udział planowalny (reszta to bufor na sprawy bieżące).
   `row.bars` opisują zadania jako paski w czasie (do widoku tygodni z przeciąganiem). */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var TL = node ? require('./timelog.js') : root.ETROM.TimeLog;
  var Absences = node ? require('./absences.js') : root.ETROM.Absences;

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

  function dayDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /** Dzień roboczy: sobota i niedziela przesuwają się na najbliższy poniedziałek (kierunek +1) albo piątek (−1). */
  function snapWorkday(d, dir) {
    var x = startOfDay(d);
    var step = dir < 0 ? -1 : 1;
    while (!isWorkday(x)) x = addDays(x, step);
    return x;
  }
  /** Przesuwa dzień o `n` dni roboczych (ujemne = wstecz). */
  function addWorkdays(d, n) {
    var x = snapWorkday(d, n < 0 ? -1 : 1);
    var left = Math.abs(Math.round(n));
    var dir = n < 0 ? -1 : 1;
    while (left > 0) { x = addDays(x, dir); if (isWorkday(x)) left -= 1; }
    return x;
  }
  /** Liczba dni roboczych między dwiema datami (b − a), ze znakiem. */
  function workdayDiff(a, b) {
    var x = snapWorkday(a, 1);
    var y = snapWorkday(b, 1);
    var dir = y.getTime() >= x.getTime() ? 1 : -1;
    var n = 0;
    while (x.getTime() !== y.getTime()) { x = addDays(x, dir); if (isWorkday(x)) n += dir; }
    return n;
  }

  /**
   * Kolejność priorytetów projektów: najpierw projekty z numerem priorytetu (1 = najważniejszy), potem reszta po kodzie.
   * Zakończone projekty są pomijane. @returns {Array} projekty w kolejności
   */
  function rankProjects(projects) {
    return (projects || []).filter(function (p) { return p.status !== 'done'; }).slice().sort(function (a, b) {
      var pa = a.priority > 0 ? a.priority : 1e9;
      var pb = b.priority > 0 ? b.priority : 1e9;
      return pa !== pb ? pa - pb : String(a.code).localeCompare(String(b.code));
    });
  }

  /** Nowa kolejność identyfikatorów po przeniesieniu projektu `id` na miejsce `toIndex` (0 = najważniejszy). */
  function moveInOrder(ids, id, toIndex) {
    var list = ids.filter(function (x) { return x !== id; });
    if (ids.indexOf(id) < 0) return ids.slice();
    list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, id);
    return list;
  }

  /**
   * Przesuwa okno zadania. mode: 'move' (cały pasek), 'start' (lewy brzeg), 'end' (prawy brzeg); delta w dniach roboczych.
   * Bez własnego startu pasek zaczyna się w dniu `from` (zwykle dziś lub najwcześniejszy dzień osi).
   * @returns {{start: string, deadline: string}|null} nowe wartości pól zadania (deadline zachowuje godzinę)
   */
  function shiftSpan(task, mode, delta, from) {
    var due = dayDate(task && task.deadline);
    if (!due) return null;
    var start = dayDate(task.start) || startOfDay(from || new Date());
    if (start.getTime() > due.getTime()) start = due;
    var ns = start, ne = due;
    if (mode === 'move') { ns = addWorkdays(start, delta); ne = addWorkdays(due, delta); }
    else if (mode === 'start') ns = addWorkdays(start, delta);
    else ne = addWorkdays(due, delta);
    if (ne.getTime() < ns.getTime()) { if (mode === 'start') ns = ne; else ne = ns; }
    var time = /T(\d{2}:\d{2})/.exec(task.deadline);
    return { start: isoDay(ns), deadline: isoDay(ne) + 'T' + (time ? time[1] : '16:00') };
  }

  /** Pasma nieobecności osoby do narysowania w planie: [{from, to, kind, note, id}] (daty ISO). */
  function absenceBands(list, personId) {
    return (list || []).filter(function (a) { return a.personId === personId; }).map(function (a) { return { id: a.id, from: a.from, to: a.to, kind: a.kind, note: a.note || '' }; });
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
   * @param {{projects: Array, people: Array, entries: Array, now: Date, target?: number, weeks?: number,
   *   personIds?: string[], offsetWeeks?: number, capacityPct?: number}} input
   *   target: minuty celu dnia (domyślnie 480); weeks: liczba tygodni w planie (domyślnie 6, najwyżej 12);
   *   offsetWeeks: przesunięcie okna względem bieżącego tygodnia; capacityPct: udział planowalny pojemności (domyślnie 100)
   * @returns {{weeks: Array, rows: Array}}
   */
  function build(input) {
    var now = input.now instanceof Date ? input.now : new Date();
    var today = startOfDay(now);
    var targetH = (Number(input.target) > 0 ? Number(input.target) : 480) / 60;
    var pct = Number(input.capacityPct) >= 20 && Number(input.capacityPct) <= 100 ? Number(input.capacityPct) / 100 : 1;
    var count = Math.max(1, Math.min(12, Number(input.weeks) || 6));
    var offset = Math.max(-26, Math.min(52, Math.round(Number(input.offsetWeeks) || 0)));
    var first = mondayOf(today);
    // W weekend nie zostały już dni robocze bieżącego tygodnia: plan zaczyna się od najbliższego poniedziałku.
    if (!workdaysBetween(today, addDays(first, 6)).length) first = addDays(first, 7);
    first = addDays(first, offset * 7);
    var weeks = [];
    for (var w = 0; w < count; w += 1) {
      var start = addDays(first, w * 7);
      var days = workdaysBetween(start, addDays(start, 6)).filter(function (d) { return d.getTime() >= today.getTime(); });
      weeks.push({ start: start.getTime(), workdays: days.length, dayKeys: days.map(isoDay), capacity: days.length * targetH * pct, current: start.getTime() <= today.getTime() && addDays(start, 7).getTime() > today.getTime() });
    }
    var weekIndex = function (d) { return Math.floor((mondayOf(d).getTime() - first.getTime()) / (7 * 86400000)); };
    var curIdx = offset === 0 ? Math.max(0, weekIndex(today)) : weekIndex(today);

    var loggedByTask = {};
    var loggedByStage = {};
    (input.entries || []).forEach(function (e) {
      var min = TL.minutes(e, now);
      var k = e.projectId + '|' + e.stageId + '|' + e.taskId;
      loggedByTask[k] = (loggedByTask[k] || 0) + min;
      var sk = e.projectId + '|' + e.stageId;
      loggedByStage[sk] = (loggedByStage[sk] || 0) + min;
    });

    var absentOf = {};
    (input.absences || []).forEach(function (a) { if (!absentOf[a.personId]) absentOf[a.personId] = Absences.daysOf(input.absences, a.personId); });
    var rowsById = {};
    var people = (input.people || []).filter(function (p) { return p.active !== false && (!input.personIds || input.personIds.indexOf(p.id) >= 0); });
    people.forEach(function (p) {
      rowsById[p.id] = {
        personId: p.id,
        weeks: weeks.map(function (wk) {
          var gone = wk.dayKeys.filter(function (k) { return absentOf[p.id] && absentOf[p.id][k]; }).length;
          return { start: wk.start, capacity: (wk.dayKeys.length - gone) * targetH * pct, absentDays: gone, planned: 0, ratio: 0, state: 'ok', tasks: [] };
        }),
        absences: absenceBands(input.absences, p.id),
        bars: [],
        unscheduled: { hours: 0, tasks: [] }, total: 0
      };
    });

    (input.projects || []).forEach(function (project) {
      (project.stages || []).forEach(function (stage) {
        var open = (stage.tasks || []).filter(function (t) { return t.status !== 'done' && !t.draft; });
        var estimated = open.filter(function (t) { return Number(t.estimate) > 0; });
        var plain = open.filter(function (t) { return !(Number(t.estimate) > 0); });
        var estLeft = estimated.reduce(function (t, x) { return t + remainingHours(x, loggedByTask[project.id + '|' + stage.id + '|' + x.id]); }, 0);
        var poolLeft = Number(stage.hours) - (loggedByStage[project.id + '|' + stage.id] || 0) / 60 - estLeft;
        var poolShare = plain.length && Number(stage.hours) > 0 && poolLeft > 0 ? poolLeft / plain.length : 0;

        open.forEach(function (task) {
          var assignees = (task.assignees || []).filter(function (id) { return rowsById[id]; });
          if (!assignees.length) return;
          var left;
          var fromPool = false;
          if (Number(task.estimate) > 0) left = remainingHours(task, loggedByTask[project.id + '|' + stage.id + '|' + task.id]);
          else if (poolShare > 0) { left = task.status === 'review' ? Math.min(poolShare, 1) : poolShare; fromPool = true; }
          else left = remainingHours(task, loggedByTask[project.id + '|' + stage.id + '|' + task.id]);
          if (left <= 0) return;
          var share = left / (task.assignees || []).length;
          var loggedH = (loggedByTask[project.id + '|' + stage.id + '|' + task.id] || 0) / 60;
          var plannedTotal = Number(task.estimate) > 0 ? Number(task.estimate) : loggedH + (fromPool ? poolShare : left);
          var due = deadlineDate(task);
          var explicitStart = dayDate(task.start);
          var ref = { projectId: project.id, stageId: stage.id, taskId: task.id, name: task.name, code: project.code, overdue: !!due && due.getTime() < today.getTime(), fromPool: fromPool, explicitStart: !!explicitStart };
          var buckets = [];
          var from = explicitStart && explicitStart.getTime() > today.getTime() ? explicitStart : today;
          var bar = null;
          var windowDays = 1;
          if (!due) buckets = null;
          else if (due.getTime() < today.getTime()) {
            buckets = [{ week: curIdx, hours: share }];
            bar = { start: due.getTime(), end: today.getTime() };
          } else {
            var days = workdaysBetween(from, due);
            if (!days.length) days = [snapWorkday(due, -1)];
            windowDays = days.length;
            buckets = 'per-person';
            bar = { start: (explicitStart || today).getTime(), end: due.getTime() };
          }
          var allDays = buckets === 'per-person' ? workdaysBetween(from, due).length ? workdaysBetween(from, due) : [snapWorkday(due, -1)] : null;
          assignees.forEach(function (id) {
            var row = rowsById[id];
            var myRef = ref;
            var myBuckets = buckets;
            if (buckets === 'per-person') {
              var gone = absentOf[id] || {};
              var mine = allDays.filter(function (d) { return !gone[isoDay(d)]; });
              var effective = mine.length ? mine : allDays;
              var needDays = Math.ceil(share / targetH - 1e-9);
              myRef = Object.assign({}, ref);
              if (needDays > effective.length || !mine.length) myRef.squeezed = true;
              else if (needDays === effective.length && needDays >= 2) myRef.mustStartNow = true;
              if (mine.length < allDays.length) myRef.absentDays = allDays.length - mine.length;
              var per = share / effective.length;
              var byWeek = {};
              effective.forEach(function (d) { var i = offset === 0 ? Math.max(0, weekIndex(d)) : weekIndex(d); byWeek[i] = (byWeek[i] || 0) + per; });
              myBuckets = Object.keys(byWeek).map(function (i) { return { week: Number(i), hours: byWeek[i] }; });
            }
            if (bar) row.bars.push(Object.assign({ start: bar.start, end: bar.end, hours: share, days: windowDays, density: share / windowDays / targetH, workers: (task.assignees || []).length || 1, logged: loggedH, planned: plannedTotal, status: task.status }, myRef));
            if (!myBuckets) {
              row.unscheduled.hours += share;
              row.unscheduled.tasks.push(Object.assign({ hours: share }, ref));
              return;
            }
            myBuckets.forEach(function (b) {
              if (b.week < 0 || b.week >= weeks.length) return;
              var cell = row.weeks[b.week];
              cell.planned += b.hours;
              cell.tasks.push(Object.assign({ hours: b.hours }, myRef));
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
      row.bars.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
      row.unscheduled.hours = Math.round(row.unscheduled.hours * 10) / 10;
      row.unscheduled.tasks.sort(function (a, b) { return b.hours - a.hours; });
      return row;
    }).sort(function (a, b) { return b.total - a.total; });
    return { weeks: weeks, rows: rows, first: first.getTime(), today: today.getTime() };
  }

  var api = { shiftSpan: shiftSpan, rankProjects: rankProjects, moveInOrder: moveInOrder, addWorkdays: addWorkdays, workdayDiff: workdayDiff, snapWorkday: snapWorkday, isoDay: isoDay, DEFAULT_HOURS: DEFAULT_HOURS, TIGHT_AT: TIGHT_AT, estimateHours: estimateHours, remainingHours: remainingHours, build: build };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Plan = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
