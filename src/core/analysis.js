/* ETROM — analiza projektów: postęp rzeczowy, zużycie budżetu godzin, prognoza,
   godziny wg rodzaju pracy i osób, trend tygodniowy, opłacalność.
   Czyste funkcje, bez DOM. Zasady widoczności (jak w budget.js):
   - zarząd widzi wszystkie projekty, godziny, osoby i finanse,
   - lider widzi godziny i osoby w swoich projektach (bez finansów),
   - pozostali nie mają dostępu do analizy. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Budget = node ? require('./budget.js') : root.ETROM.Budget;
  var Model = node ? require('./model.js') : root.ETROM.Model;
  var Progress = node ? require('./progress.js') : root.ETROM.Progress;
  var TimeLog = node ? require('./timelog.js') : root.ETROM.TimeLog;

  var DAY = 86400000;
  var WEEK = 7 * DAY;

  function round1(n) { return Math.round(n * 10) / 10; }
  function ms(value) { var t = Date.parse(value); return Number.isFinite(t) ? t : null; }

  /** Poniedziałek 00:00 (czas lokalny) tygodnia, w którym leży moment. */
  function weekStart(time) {
    var d = new Date(time);
    d.setHours(0, 0, 0, 0);
    var shift = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - shift);
    return d.getTime();
  }

  /** Udział wykonania etapu: zakończony = 1, w toku = udział zakończonych zadań, reszta = 0. */
  function stageDone(stage) {
    if (stage.status === 'done') return 1;
    if (stage.status !== 'working') return 0;
    var tasks = stage.tasks || [];
    if (!tasks.length) return 0;
    var done = tasks.filter(function (t) { return t.status === 'done'; }).length;
    return Math.min(0.95, done / tasks.length);
  }

  function verdictOf(m) {
    if (m.status === 'done') return 'closed';
    if (m.used <= 0 && m.earned <= 0) return 'nodata';
    if (m.usagePct > 100 || (m.forecastRatio !== null && m.forecastRatio > 1.15) || (m.timePct !== null && m.timePct > 100)) return 'risk';
    if ((m.forecastRatio !== null && m.forecastRatio > 1.02) || (m.spi !== null && m.spi < 0.9) || (m.usagePct >= 80 && m.earnedPct < m.usagePct - 5)) return 'watch';
    return 'ok';
  }

  /**
   * Analiza jednego projektu.
   * @param {Object} project
   * @param {{entries:Array, people:Array}} ctx
   * @param {Date} now
   * @param {{rate?:number, weeks?:number, finance?:boolean}} [options]
   */
  function project(project, ctx, now, options) {
    var o = options || {};
    var entries = (ctx.entries || []).filter(function (e) { return e.projectId === project.id; });
    var stages = project.stages || [];
    var planned = 0;
    var earned = 0;
    var used = 0;
    var byKind = {};
    var stageRows = stages.map(function (stage) {
      var u = Budget.usage(project, stage, ctx.entries || [], now);
      var hours = Number(stage.hours) || 0;
      var share = stageDone(stage);
      planned += hours;
      earned += hours * share;
      used += u.used;
      var meta = Model.describeStage(stage);
      var key = meta.kind || 'other';
      var bucket = byKind[key] || (byKind[key] = { kind: key, label: meta.kindLabel || 'Inne', planned: 0, used: 0 });
      bucket.planned += hours;
      bucket.used += u.used;
      return { id: stage.id, name: meta.name, status: stage.status, planned: hours, used: round1(u.used), logged: round1(u.logged), bonus: round1(u.bonus), percent: u.percent, state: u.state, doneShare: share, kind: key, kindLabel: meta.kindLabel };
    });

    var start = ms(project.createdAt);
    var end = ms(project.deadline);
    var nowMs = now.getTime();
    var timePct = start !== null && end !== null && end > start ? Math.max(0, ((nowMs - start) / (end - start)) * 100) : null;
    var earnedPct = planned > 0 ? (earned / planned) * 100 : 0;
    var usagePct = planned > 0 ? (used / planned) * 100 : 0;
    var cpi = used > 0 && earned > 0 ? earned / used : null;
    var spi = timePct !== null && timePct > 0 && earned > 0 ? earnedPct / timePct : null;
    var eac = cpi ? planned / cpi : null;
    var forecastRatio = eac !== null && planned > 0 ? eac / planned : null;

    // Godziny wg osób (widoczne dla lidera i zarządu) i tygodniowy przebieg zużycia.
    var people = {};
    entries.forEach(function (e) { people[e.personId] = (people[e.personId] || 0) + TimeLog.minutes(e, now) / 60; });
    var peopleList = Object.keys(people).map(function (id) {
      var person = (ctx.people || []).filter(function (p) { return p.id === id; })[0];
      return { personId: id, hours: round1(people[id]), person: person || null };
    }).sort(function (a, b) { return b.hours - a.hours; });

    var firstWeek = weekStart(start !== null ? start : nowMs);
    entries.forEach(function (e) { var s = ms(e.start); if (s !== null && s < firstWeek) firstWeek = weekStart(s); });
    var thisWeek = weekStart(nowMs);
    var burn = [];
    var cumulative = 0;
    var adjustments = [];
    stages.forEach(function (stage) { (stage.adjustments || []).forEach(function (a) { adjustments.push({ at: ms(a.at), hours: Number(a.hours) || 0 }); }); });
    for (var w = firstWeek; w <= thisWeek; w += WEEK) {
      var minutes = 0;
      entries.forEach(function (e) { var s = ms(e.start); if (s !== null && s >= w && s < w + WEEK) minutes += TimeLog.minutes(e, now); });
      var extra = 0;
      adjustments.forEach(function (a) { if (a.at !== null && a.at >= w && a.at < w + WEEK) extra += a.hours; });
      cumulative += minutes / 60 + extra;
      burn.push({ t: w, used: round1(cumulative) });
    }
    // Prognoza: średnie tempo z ostatnich 4 tygodni → tydzień wyczerpania budżetu.
    var recent = burn.slice(-5);
    var pace = recent.length > 1 ? (recent[recent.length - 1].used - recent[0].used) / (recent.length - 1) : 0;
    var exhaust = null;
    if (planned > 0 && used < planned && pace > 0.5) exhaust = nowMs + ((planned - used) / pace) * WEEK;

    var result = {
      id: project.id, code: project.code, name: project.name, client: project.client, status: project.status,
      deadline: project.deadline, createdAt: project.createdAt,
      planned: round1(planned), used: round1(used), earned: round1(earned),
      earnedPct: round1(earnedPct), usagePct: round1(usagePct), timePct: timePct === null ? null : round1(timePct),
      cpi: cpi === null ? null : Math.round(cpi * 100) / 100, spi: spi === null ? null : Math.round(spi * 100) / 100,
      eac: eac === null ? null : round1(eac), forecastRatio: forecastRatio === null ? null : Math.round(forecastRatio * 100) / 100,
      stages: stageRows,
      byKind: Object.keys(byKind).map(function (k) { return { kind: k, label: byKind[k].label, planned: round1(byKind[k].planned), used: round1(byKind[k].used) }; }),
      people: peopleList, burn: burn, pace: round1(pace), exhaustAt: exhaust
    };
    result.verdict = verdictOf({ status: project.status, used: used, earned: earned, usagePct: usagePct, earnedPct: earnedPct, timePct: timePct, spi: spi, forecastRatio: forecastRatio });

    // Finanse: tylko gdy podano wartość umowy i koszt godziny.
    var rate = Number(o.rate) || 0;
    var value = project.contractValue;
    if (o.finance && value > 0 && rate > 0) {
      var cost = used * rate;
      var forecastCost = eac !== null ? eac * rate : null;
      result.finance = {
        value: value, rate: rate, cost: Math.round(cost), margin: Math.round(value - cost),
        marginPct: round1(((value - cost) / value) * 100),
        forecastCost: forecastCost === null ? null : Math.round(forecastCost),
        forecastMargin: forecastCost === null ? null : Math.round(value - forecastCost),
        forecastMarginPct: forecastCost === null ? null : round1(((value - forecastCost) / value) * 100),
        perHour: used > 0 ? Math.round(value / used) : null,
        budgetCost: Math.round(planned * rate), plannedMarginPct: round1(((value - planned * rate) / value) * 100)
      };
    } else result.finance = null;
    return result;
  }

  /** Projekty, które osoba może analizować. */
  function visibleProjects(ws, viewerId) {
    var people = ws.people || [];
    return (ws.projects || []).filter(function (p) { return Budget.canSeeHours(viewerId, p, people); });
  }

  /**
   * Analiza portfela dla osoby.
   * @returns {{access:boolean, management:boolean, projects:Array, totals:Object, weekly:Object, byKind:Array}}
   */
  function portfolio(ws, viewerId, now, options) {
    var o = options || {};
    var people = ws.people || [];
    var management = Budget.isManagement(viewerId, people);
    var visible = visibleProjects(ws, viewerId);
    if (!visible.length) return { access: false, management: management, projects: [], totals: null, weekly: null, byKind: [] };

    var weeks = Number(o.weeks) > 0 ? Number(o.weeks) : 12;
    var ctx = { entries: ws.entries || [], people: people };
    var list = visible.map(function (p) { return project(p, ctx, now, { rate: o.rate, finance: management }); });
    var active = list.filter(function (p) { return p.status !== 'done'; });

    var thisWeek = weekStart(now.getTime());
    var labels = [];
    for (var i = weeks - 1; i >= 0; i -= 1) labels.push(thisWeek - i * WEEK);
    var visibleIds = {};
    visible.forEach(function (p) { visibleIds[p.id] = true; });
    var series = list.map(function (p) { return { id: p.id, code: p.code, name: p.name, values: labels.map(function () { return 0; }) }; });
    var index = {};
    list.forEach(function (p, k) { index[p.id] = k; });
    (ws.entries || []).forEach(function (e) {
      if (!visibleIds[e.projectId]) return;
      var s = ms(e.start);
      if (s === null) return;
      var slot = Math.floor((weekStart(s) - labels[0]) / WEEK);
      if (slot < 0 || slot >= weeks) return;
      series[index[e.projectId]].values[slot] += TimeLog.minutes(e, now) / 60;
    });
    series.forEach(function (s) { s.values = s.values.map(round1); });
    var weekTotals = labels.map(function (_, k) { return round1(series.reduce(function (t, s) { return t + s.values[k]; }, 0)); });

    var kinds = {};
    list.forEach(function (p) { p.byKind.forEach(function (k) {
      var b = kinds[k.kind] || (kinds[k.kind] = { kind: k.kind, label: k.label, planned: 0, used: 0 });
      b.planned += k.planned; b.used += k.used;
    }); });

    var sum = function (key, rows) { return (rows || active).reduce(function (t, p) { return t + (p[key] || 0); }, 0); };
    var finance = management ? list.filter(function (p) { return p.finance; }) : [];
    var totals = {
      projects: list.length, active: active.length,
      planned: round1(sum('planned')), used: round1(sum('used')), earned: round1(sum('earned')),
      usagePct: sum('planned') > 0 ? round1((sum('used') / sum('planned')) * 100) : 0,
      risk: active.filter(function (p) { return p.verdict === 'risk'; }).length,
      watch: active.filter(function (p) { return p.verdict === 'watch'; }).length,
      thisWeek: weekTotals[weekTotals.length - 1] || 0,
      lastWeek: weekTotals[weekTotals.length - 2] || 0,
      value: management ? finance.reduce(function (t, p) { return t + p.finance.value; }, 0) : null,
      margin: management ? finance.reduce(function (t, p) { return t + p.finance.margin; }, 0) : null,
      financeProjects: finance.length
    };
    return {
      access: true, management: management, projects: list, totals: totals,
      weekly: { labels: labels, series: series, totals: weekTotals },
      byKind: Object.keys(kinds).map(function (k) { return { kind: k, label: kinds[k].label, planned: round1(kinds[k].planned), used: round1(kinds[k].used) }; })
    };
  }

  var api = { project: project, portfolio: portfolio, visibleProjects: visibleProjects, weekStart: weekStart, stageDone: stageDone, verdictOf: verdictOf };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Analysis = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
