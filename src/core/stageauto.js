/* ETROM — automatyczne statusy etapów.
   Start etapu dzieje się sam (ktoś ruszył zadanie), zamknięcie wymaga potwierdzenia lidera lub zarządu.
   Ręczna zmiana statusu zawsze wygrywa z automatem. Etapy „Postępowanie” (czekanie na zewnątrz) są ręczne.
   Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  function tasksOf(stage) { return Array.isArray(stage && stage.tasks) ? stage.tasks : []; }

  /** Odcisk zadań: zmienia się, gdy ktoś doda zadanie albo przestawi status. */
  function signature(stage) {
    return tasksOf(stage).map(function (t) { return t.id + ':' + t.status; }).join('|');
  }

  /**
   * Co automat proponuje dla etapu.
   * @param {Object} stage
   * @param {{decision: boolean}} [opts] decision: etap „Postępowanie” — zawsze ręczny
   * @returns {({to: string, mode: ('apply'|'ask'), reason: string}|null)}
   */
  function suggest(stage, opts) {
    if (!stage || (opts && opts.decision)) return null;
    var tasks = tasksOf(stage);
    if (!tasks.length) return null;
    if (stage.statusManual && stage.statusManual === stage.status) return null;
    var started = tasks.some(function (t) { return t.status !== 'todo'; });
    var allDone = tasks.every(function (t) { return t.status === 'done'; });

    if (stage.status === 'todo' && started) return { to: 'working', mode: 'apply', reason: 'started' };
    if (stage.status === 'working' && allDone) {
      if (stage.askDismissed && stage.askDismissed === signature(stage)) return null;
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
    var changes = [];
    var next = (stages || []).map(function (stage) {
      var s = suggest(stage, { decision: decisionOf ? !!decisionOf(stage) : false });
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
  function dismissAsk(stage) {
    return Object.assign({}, stage, { askDismissed: signature(stage) });
  }

  /** Ręczna zmiana statusu: automat jej nie nadpisuje. */
  function markManual(stage, status) {
    return Object.assign({}, stage, { status: status, statusManual: status, autoClosed: false, askDismissed: '' });
  }

  var api = { suggest: suggest, reconcile: reconcile, confirmDone: confirmDone, dismissAsk: dismissAsk, markManual: markManual, signature: signature };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.StageAuto = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
