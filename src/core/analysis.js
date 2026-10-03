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
   * @param {{rate?:number (zapasowa stawka dla osób bez własnej), weeks?:number, finance?:boolean}} [options]
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
      return { id: stage.id, source: stage.source, name: meta.name, domain: meta.domain, domainLabel: meta.domainLabel, deadline: stage.deadline || '', status: stage.status, planned: hours, used: round1(u.used), logged: round1(u.logged), bonus: round1(u.bonus), percent: u.percent, state: u.state, doneShare: share, kind: key, kindLabel: meta.kindLabel };
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

    // Godziny wg osób (widoczne dla lidera i zarządu); koszt liczony stawką każdej osoby.
    var fallbackRate = Number(o.rate) || 0;
    function rateOf(person) { return person && Number(person.hourlyCost) > 0 ? Number(person.hourlyCost) : fallbackRate; }
    var people = {};
    entries.forEach(function (e) { people[e.personId] = (people[e.personId] || 0) + TimeLog.minutes(e, now) / 60; });
    var loggedHours = 0, loggedCost = 0, missingRateHours = 0;
    var peopleList = Object.keys(people).map(function (id) {
      var person = (ctx.people || []).filter(function (p) { return p.id === id; })[0] || null;
      var rate = rateOf(person);
      loggedHours += people[id];
      if (rate > 0) loggedCost += people[id] * rate; else missingRateHours += people[id];
      return { personId: id, hours: round1(people[id]), person: person, rate: rate, cost: Math.round(people[id] * rate) };
    }).sort(function (a, b) { return b.hours - a.hours; });

    // Przeterminowane zadania i etapy — sygnał ryzyka niezależny od godzin.
    var overdueTasks = 0, openTasks = 0, overdueStages = 0;
    stages.forEach(function (stage) {
      if (stage.status !== 'done' && ms(stage.deadline) !== null && ms(stage.deadline) < now.getTime()) overdueStages += 1;
      (stage.tasks || []).forEach(function (task) {
        if (task.status === 'done') return;
        openTasks += 1;
        if (ms(task.deadline) !== null && ms(task.deadline) < now.getTime()) overdueTasks += 1;
      });
    });

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
      people: peopleList, burn: burn, pace: round1(pace), exhaustAt: exhaust,
      overdueTasks: overdueTasks, openTasks: openTasks, overdueStages: overdueStages, missingRateHours: round1(missingRateHours),
      start: start, end: end, contractValue: project.contractValue > 0 ? project.contractValue : null
    };
    result.verdict = verdictOf({ status: project.status, used: used, earned: earned, usagePct: usagePct, earnedPct: earnedPct, timePct: timePct, spi: spi, forecastRatio: forecastRatio });

    // Finanse (tylko zarząd): koszt = godziny każdej osoby × jej stawka; korekty zarządu liczone
    // średnią stawką projektu. Wartość wypracowana = wartość umowy × postęp rzeczowy.
    var value = project.contractValue;
    var avgRate = loggedHours > 0 && loggedCost > 0 ? loggedCost / loggedHours : fallbackRate;
    if (o.finance && value > 0 && avgRate > 0) {
      var adjHours = Math.max(0, used - loggedHours);
      var cost = loggedCost + adjHours * avgRate;
      var forecastHours = eac !== null ? eac : null;
      var forecastCost = forecastHours === null ? null : forecastHours * avgRate;
      var earnedValue = planned > 0 ? value * (earned / planned) : 0;
      result.finance = {
        value: value, rate: Math.round(avgRate), cost: Math.round(cost), margin: Math.round(value - cost),
        marginPct: round1(((value - cost) / value) * 100),
        forecastCost: forecastCost === null ? null : Math.round(forecastCost),
        forecastMargin: forecastCost === null ? null : Math.round(value - forecastCost),
        forecastMarginPct: forecastCost === null ? null : round1(((value - forecastCost) / value) * 100),
        perHour: used > 0 ? Math.round(value / used) : null,
        forecastPerHour: forecastHours ? Math.round(value / forecastHours) : null,
        budgetCost: Math.round(planned * avgRate), plannedMarginPct: round1(((value - planned * avgRate) / value) * 100),
        earnedValue: Math.round(earnedValue), earnedMargin: Math.round(earnedValue - cost),
        earnedMarginPct: earnedValue > 0 ? round1(((earnedValue - cost) / earnedValue) * 100) : null,
        costPerPct: earnedPct > 0 ? Math.round(cost / earnedPct) : null,
        missingRateHours: round1(missingRateHours)
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

    // Zespół: godziny osób w kolejnych tygodniach (wszystkie widoczne projekty), obłożenie i miks projektów.
    var CAPACITY = Number(o.capacity) > 0 ? Number(o.capacity) : 40;
    var perPerson = {};
    (ws.entries || []).forEach(function (e) {
      if (!visibleIds[e.projectId]) return;
      var st = ms(e.start);
      if (st === null) return;
      var slot = Math.floor((weekStart(st) - labels[0]) / WEEK);
      if (slot < 0 || slot >= weeks) return;
      var row = perPerson[e.personId] || (perPerson[e.personId] = { personId: e.personId, weeks: labels.map(function () { return 0; }), projects: {} });
      var h = TimeLog.minutes(e, now) / 60;
      row.weeks[slot] += h;
      row.projects[e.projectId] = (row.projects[e.projectId] || 0) + h;
    });
    var team = Object.keys(perPerson).map(function (id) {
      var row = perPerson[id];
      var person = people.filter(function (x) { return x.id === id; })[0] || null;
      var total = row.weeks.reduce(function (a, b) { return a + b; }, 0);
      var last4 = row.weeks.slice(-4);
      var avg4 = last4.reduce(function (a, b) { return a + b; }, 0) / 4;
      var rate = person && Number(person.hourlyCost) > 0 ? Number(person.hourlyCost) : (Number(o.rate) || 0);
      var mix = Object.keys(row.projects).map(function (pid) { return { id: pid, code: (list[index[pid]] || {}).code, hours: round1(row.projects[pid]) }; }).sort(function (a, b) { return b.hours - a.hours; });
      return {
        personId: id, person: person, weeks: row.weeks.map(round1), total: round1(total), avg4: round1(avg4),
        utilization: Math.round((avg4 / CAPACITY) * 100), peak: round1(Math.max.apply(null, row.weeks.concat([0]))),
        projects: mix, rate: management ? rate : null, cost: management ? Math.round(total * rate) : null
      };
    }).sort(function (a, b) { return b.total - a.total; });

    // Klienci: udział w portfelu.
    var clientMap = {};
    list.forEach(function (p) {
      var key = p.client || 'Bez zamawiającego';
      var c = clientMap[key] || (clientMap[key] = { client: key, projects: 0, planned: 0, used: 0, value: 0 });
      c.projects += 1; c.planned += p.planned; c.used += p.used; c.value += p.contractValue || 0;
    });
    var clients = Object.keys(clientMap).map(function (k) { var c = clientMap[k]; return { client: c.client, projects: c.projects, planned: round1(c.planned), used: round1(c.used), value: management ? c.value : null }; })
      .sort(function (a, b) { return b.used - a.used || b.planned - a.planned; });

    // Kalibracja wycen: etapy ze standardu zakończone w projektach — plan a rzeczywistość.
    var stageCal = {};
    list.forEach(function (p) { p.stages.forEach(function (st) {
      if (st.source === 'custom' || st.status !== 'done' || !(st.planned > 0) || !(st.used > 0)) return;
      var c = stageCal[st.id] || (stageCal[st.id] = { id: st.id, name: st.name, kind: st.kind, kindLabel: st.kindLabel, n: 0, planned: 0, used: 0 });
      c.n += 1; c.planned += st.planned; c.used += st.used;
    }); });
    var calibration = Object.keys(stageCal).map(function (k) {
      var c = stageCal[k];
      return { id: c.id, name: c.name, kind: c.kind, kindLabel: c.kindLabel, n: c.n, plannedAvg: round1(c.planned / c.n), usedAvg: round1(c.used / c.n), ratio: Math.round((c.used / c.planned) * 100) / 100 };
    }).sort(function (a, b) { return Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1); });
    var closed = list.filter(function (p) { return p.status === 'done' && p.planned > 0 && p.used > 0; });
    var accuracy = closed.length ? { n: closed.length, avgRatio: Math.round((closed.reduce(function (t, p) { return t + p.used / p.planned; }, 0) / closed.length) * 100) / 100 } : null;

    // Sygnały ryzyka i najbliższe terminy.
    var signals = {
      overdueTasks: active.reduce(function (t, p) { return t + p.overdueTasks; }, 0),
      overdueStages: active.reduce(function (t, p) { return t + p.overdueStages; }, 0),
      pastDeadline: active.filter(function (p) { return p.timePct !== null && p.timePct > 100; }).length,
      noBudget: active.filter(function (p) { return !(p.planned > 0); }).length
    };
    var deadlines = active.filter(function (p) { return ms(p.deadline) !== null; }).map(function (p) { return { id: p.id, code: p.code, name: p.name, at: ms(p.deadline), days: Math.round((ms(p.deadline) - now.getTime()) / DAY), verdict: p.verdict }; })
      .sort(function (a, b) { return a.at - b.at; });
    list.forEach(function (p) { p.weekly = series[index[p.id]].values; });

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
      financeProjects: finance.length,
      cost: management ? finance.reduce(function (t, p) { return t + p.finance.cost; }, 0) : null,
      earnedValue: management ? finance.reduce(function (t, p) { return t + p.finance.earnedValue; }, 0) : null,
      earnedMargin: management ? finance.reduce(function (t, p) { return t + p.finance.earnedMargin; }, 0) : null,
      forecastMargin: management ? finance.reduce(function (t, p) { return t + (p.finance.forecastMargin !== null ? p.finance.forecastMargin : p.finance.margin); }, 0) : null,
      avg4: round1(weekTotals.slice(-4).reduce(function (a, b) { return a + b; }, 0) / 4),
      capacity: CAPACITY * team.length,
      utilization: team.length ? Math.round((team.reduce(function (t, r) { return t + r.avg4; }, 0) / (CAPACITY * team.length)) * 100) : 0
    };
    return {
      access: true, management: management, projects: list, totals: totals,
      weekly: { labels: labels, series: series, totals: weekTotals },
      team: team, clients: clients, calibration: calibration, accuracy: accuracy, signals: signals, deadlines: deadlines, capacity: CAPACITY,
      byKind: Object.keys(kinds).map(function (k) { return { kind: k, label: kinds[k].label, planned: round1(kinds[k].planned), used: round1(kinds[k].used) }; })
    };
  }

  var api = { project: project, portfolio: portfolio, visibleProjects: visibleProjects, weekStart: weekStart, stageDone: stageDone, verdictOf: verdictOf };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Analysis = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
