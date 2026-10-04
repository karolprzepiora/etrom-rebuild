/* ETROM — planowanie budżetu: rozdział godzin na etapy wg wag, pula etapu (zadania, szkice, rezerwa),
   jednostka „dzień roboczy”. Czyste funkcje, bez DOM.

   Zasady:
   - budżet jest na etapach (`stage.hours`); dzień roboczy = cel dnia z ustawień (domyślnie 8 h),
   - waga etapu = `stage.weight`, a gdy jej nie ma, domyślne godziny z katalogu (albo godziny etapu),
   - etap zablokowany (`stage.locked`) nie zmienia godzin przy rozdziale budżetu,
   - pula etapu = budżet − rezerwa − godziny zadań zaplanowanych − godziny szkiców; zadanie „z rezerwy”
     (np. uzupełnienia w postępowaniu) zużywa rezerwę, a nie pulę,
   - rezerwę mają etapy-postępowania (rodzaj „decision”): `stage.reserve` albo procent budżetu etapu. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Catalog = node ? require('./catalog.js') : root.ETROM.Catalog;
  var Library = node ? require('./library.js') : root.ETROM.Library;

  var rules = { dayHours: 8, reservePct: 15 };

  function configure(next) {
    var n = next || {};
    var d = Number(n.dayHours);
    if (Number.isFinite(d) && d >= 2 && d <= 12) rules.dayHours = d;
    var r = Number(n.reservePct);
    if (Number.isFinite(r) && r >= 0 && r <= 100) rules.reservePct = r;
    return Object.assign({}, rules);
  }
  function getRules() { return Object.assign({}, rules); }

  function round(n, step) { return Math.round(n / step) * step; }
  function r1(n) { return Math.round(n * 10) / 10; }

  /** Najmniejszy krok planowania: pół dnia. */
  function step() { return rules.dayHours / 2; }
  function toDays(hours) { return hours / rules.dayHours; }
  function toHours(days) { return days * rules.dayHours; }

  function weightOf(stage) {
    var w = Number(stage && stage.weight);
    if (w > 0) return w;
    var entry = stage && Catalog.find(stage.id);
    if (entry) return Library.weightOf(stage.id);
    return Number(stage && stage.hours) > 0 ? Number(stage.hours) : 8;
  }

  /**
   * Rozdziela `total` godzin na etapy. Zablokowane i zakończone etapy zachowują swoje godziny.
   * Wynik jest wielokrotnością pół dnia, a suma etapów odblokowanych równa się reszcie budżetu.
   * @returns {{hours: Object<string, number>, total: number, locked: number, overLocked: boolean}}
   */
  function distribute(project, total) {
    var stages = (project && project.stages) || [];
    var st = step();
    var budget = Math.max(0, round(Number(total) || 0, st));
    var fixed = stages.filter(function (s) { return s.locked || s.status === 'done'; });
    var free = stages.filter(function (s) { return !(s.locked || s.status === 'done'); });
    var lockedSum = fixed.reduce(function (a, s) { return a + (Number(s.hours) || 0); }, 0);
    var rest = Math.max(0, budget - lockedSum);
    var hours = {};
    fixed.forEach(function (s) { hours[s.id] = Number(s.hours) || 0; });
    if (free.length) {
      var units = Math.round(rest / st);
      var w = free.map(weightOf);
      var wsum = w.reduce(function (a, b) { return a + b; }, 0);
      var shares = w.map(function (x) { return (x / wsum) * units; });
      var base = shares.map(Math.floor);
      // Każdy etap dostaje co najmniej jeden krok, jeśli budżet na to pozwala.
      if (units >= free.length) base = base.map(function (b) { return Math.max(1, b); });
      var diff = units - base.reduce(function (a, b) { return a + b; }, 0);
      var order = shares.map(function (v, i) { return { i: i, r: v - Math.floor(v) }; });
      if (diff > 0) {
        order.sort(function (a, b) { return b.r - a.r || a.i - b.i; });
        for (var k = 0; k < diff; k += 1) base[order[k % order.length].i] += 1;
      } else if (diff < 0) {
        order.sort(function (a, b) { return a.r - b.r || b.i - a.i; });
        var guard = 0;
        for (var j = 0; diff < 0 && guard < 10000; j += 1, guard += 1) {
          var idx = order[j % order.length].i;
          if (base[idx] > 1) { base[idx] -= 1; diff += 1; }
        }
      }
      free.forEach(function (s, i) { hours[s.id] = base[i] * st; });
    }
    var sum = stages.reduce(function (a, s) { return a + (hours[s.id] || 0); }, 0);
    return { hours: hours, total: sum, locked: lockedSum, overLocked: lockedSum > budget };
  }

  function isProcedure(stage) {
    var kind = stage && (stage.kind || (Catalog.find(stage.id) || {}).kind);
    return kind === 'decision';
  }

  /** Rezerwa etapu w godzinach (tylko postępowania). */
  function reserveOf(stage) {
    if (!isProcedure(stage)) return 0;
    var own = stage.reserve;
    if (own !== null && own !== undefined && Number.isFinite(Number(own)) && Number(own) >= 0) return Number(own);
    return round((Number(stage.hours) || 0) * rules.reservePct / 100, step());
  }

  function taskHours(task) { var e = Number(task && task.estimate); return e > 0 ? e : 0; }

  /** Pula etapu: z czego składa się budżet etapu. */
  function pool(stage) {
    var budget = Number(stage.hours) || 0;
    var reserve = reserveOf(stage);
    var scheduled = 0, drafts = 0, fromReserve = 0, unsized = 0, draftCount = 0;
    (stage.tasks || []).forEach(function (t) {
      var h = taskHours(t);
      if (!h) unsized += 1;
      if (t.fromReserve) fromReserve += h;
      else if (t.draft) { drafts += h; draftCount += 1; }
      else scheduled += h;
    });
    var free = budget - reserve - scheduled - drafts;
    return {
      budget: budget, reserve: reserve, reserveUsed: fromReserve, reserveLeft: reserve - fromReserve,
      scheduled: scheduled, drafts: drafts, draftCount: draftCount, free: free, unsized: unsized,
      over: free < -0.01, reserveOver: fromReserve > reserve + 0.01
    };
  }

  /** Domyślne godziny dla zadań bez szacunku: wolna pula podzielona po równo (wielokrotność pół dnia). */
  function fillShares(stage) {
    var p = pool(stage);
    var open = (stage.tasks || []).filter(function (t) { return !taskHours(t) && !t.fromReserve; });
    var out = {};
    if (!open.length || p.free <= 0) return out;
    var st = step();
    var units = Math.floor(p.free / st + 1e-9);
    var each = Math.floor(units / open.length);
    var extra = units - each * open.length;
    open.forEach(function (t, i) { var u = each + (i < extra ? 1 : 0); if (u > 0) out[t.id] = u * st; });
    return out;
  }

  /** Podsumowanie projektu. */
  function summary(project) {
    var t = { budget: 0, reserve: 0, scheduled: 0, drafts: 0, free: 0, over: 0, stages: 0, withFree: 0 };
    (project.stages || []).forEach(function (s) {
      var p = pool(s);
      t.budget += p.budget; t.reserve += p.reserve; t.scheduled += p.scheduled; t.drafts += p.drafts;
      t.free += Math.max(0, p.free); if (p.over) t.over += 1;
      t.stages += 1; if (p.free > 0.01) t.withFree += 1;
    });
    t.plannedPct = t.budget > 0 ? Math.round((t.scheduled / t.budget) * 100) : 0;
    return t;
  }

  var api = {
    configure: configure, getRules: getRules, step: step, toDays: toDays, toHours: toHours,
    weightOf: weightOf, distribute: distribute, isProcedure: isProcedure, reserveOf: reserveOf,
    pool: pool, fillShares: fillShares, summary: summary, round1: r1
  };
  if (node) module.exports = api; else { root.ETROM = root.ETROM || {}; root.ETROM.Planning = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
