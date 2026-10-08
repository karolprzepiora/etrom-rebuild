/* ETROM — automatyczne statusy etapów.
   Start etapu dzieje się sam (ktoś ruszył zadanie), zamknięcie wymaga potwierdzenia lidera lub zarządu.
   Ręczna zmiana statusu zawsze wygrywa z automatem. Etapy „Postępowanie” (czekanie na zewnątrz) są ręczne.
   Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  function tasksOf(stage) { return Array.isArray(stage && stage.tasks) ? stage.tasks : []; }

  /** Odcisk zadań: zmienia się, gdy ktoś doda zadanie albo przestawi status. */
  function signature(stage, cases) {
    return tasksOf(stage).map(function (t) { return t.id + ':' + t.status; }).concat((cases || []).map(function (c) { return 'c' + c.id + ':' + c.status; })).join('|');
  }

  function liveCases(cases) { return (cases || []).filter(function (c) { return c.status !== 'skipped'; }); }

  /**
   * Co automat proponuje dla etapu.
   * @param {Object} stage
   * @param {{decision: boolean, cases: Array}} [opts] decision: etap „Postępowanie”; jego status wynika ze spraw
   *   („Czekam na odpowiedź”) tego etapu, nie z zadań
   * @returns {({to: string, mode: ('apply'|'ask'), reason: string}|null)}
   */
  function suggest(stage, opts) {
    if (!stage) return null;
    var decision = !!(opts && opts.decision);
    var cases = liveCases(opts && opts.cases);
    if (stage.statusManual && stage.statusManual === stage.status) return null;
    var open; var allDone; var started; var hasWork;
    if (decision) {
      hasWork = cases.length > 0;
      open = cases.filter(function (c) { return c.status === 'open'; });
      started = open.length > 0;
      allDone = hasWork && open.length === 0;
    } else {
      var tasks = tasksOf(stage);
      hasWork = tasks.length > 0;
      started = tasks.some(function (t) { return t.status !== 'todo'; });
      allDone = hasWork && tasks.every(function (t) { return t.status === 'done'; });
    }
    if (!hasWork) return null;

    if (stage.status === 'todo' && started) return { to: 'working', mode: 'apply', reason: 'started' };
    if (stage.status === 'working' && allDone) {
      if (stage.askDismissed && stage.askDismissed === signature(stage, decision ? cases : null)) return null;
      return { to: 'done', mode: 'ask', reason: 'allDone' };
    }
    if (stage.status === 'done' && stage.autoClosed && !allDone) return { to: 'working', mode: 'apply', reason: 'reopened' };
    return null;
  }

  /**
   * Stosuje propozycje „apply” do wszystkich etapów (do dwóch przebiegów, bo start może od razu
   * ujawnić pytanie o zamknięcie, którego nie stosujemy).
   * @returns {{stages: Array, changes: Array}}
   */
  function reconcile(stages, opts) {
    var decisionOf = opts && opts.decisionOf;
    var casesOf = opts && opts.casesOf;
    var changes = [];
    var next = (stages || []).map(function (stage) {
      var s = suggest(stage, { decision: decisionOf ? !!decisionOf(stage) : false, cases: casesOf ? casesOf(stage) : [] });
      if (!s || s.mode !== 'apply') return stage;
      changes.push({ id: stage.id, from: stage.status, to: s.to, reason: s.reason });
      var copy = Object.assign({}, stage, { status: s.to });
      if (s.reason === 'reopened') copy.autoClosed = false;
      return copy;
    });
    return { stages: changes.length ? next : stages, changes: changes };
  }

  /** Potwierdzenie zamknięcia: status „done”, zapamiętane jako zamknięcie automatyczne (wraca przy nowym zadaniu). */
  function confirmDone(stage) {
    return Object.assign({}, stage, { status: 'done', autoClosed: true, statusManual: '', askDismissed: '' });
  }

  /** „Jeszcze nie”: pytanie wraca dopiero, gdy zadania się zmienią. */
  function dismissAsk(stage, cases) {
    return Object.assign({}, stage, { askDismissed: signature(stage, cases ? liveCases(cases) : null) });
  }

  /** Ręczna zmiana statusu: automat jej nie nadpisuje. */
  function markManual(stage, status) {
    return Object.assign({}, stage, { status: status, statusManual: status, autoClosed: false, askDismissed: '' });
  }

  var api = { suggest: suggest, reconcile: reconcile, confirmDone: confirmDone, dismissAsk: dismissAsk, markManual: markManual, signature: signature };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.StageAuto = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
