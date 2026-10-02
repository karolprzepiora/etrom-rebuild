/* ETROM — tablica zadań: które zadania i w której kolumnie. Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  var Tasks = (typeof module !== 'undefined' && module.exports) ? require('./tasks.js') : root.ETROM.Tasks;

  var COLUMNS = ['todo', 'working', 'review', 'changes', 'done'];
  var DONE_DAYS = 30;

  // Szybki krok = jedno kliknięcie do kolejnego sensownego statusu.
  var STEPS = {
    todo: [{ to: 'working', label: 'Rozpocznij' }],
    working: [{ to: 'review', label: 'Do zatwierdzenia' }, { to: 'done', label: 'Zakończ' }],
    review: [{ to: 'done', label: 'Zatwierdź' }, { to: 'changes', label: 'Zwróć do poprawy' }],
    changes: [{ to: 'working', label: 'Wróć do pracy' }],
    done: []
  };

  /** Zakończone zadanie zostaje w ostatniej kolumnie przez 30 dni od zamknięcia (bez historii — zostaje). */
  function recentlyDone(task, now) {
    var last = (task.history || []).filter(function (h) { return h.to === 'done'; }).pop();
    if (!last) return true;
    return ((now instanceof Date ? now : new Date()).getTime() - Date.parse(last.at)) <= DONE_DAYS * 86400000;
  }

  /**
   * Zadania do pokazania na tablicy.
   * @param {Object} project
   * @param {{stage?: string, person?: string, mine?: boolean}} filters
   * @param {string|null} me identyfikator osoby przy tym urządzeniu (dla „Tylko moje”)
   * @returns {Array<{stage:Object, stageIndex:number, task:Object}>}
   */
  function cards(project, filters, me, now) {
    var f = filters || {};
    var out = [];
    ((project && project.stages) || []).forEach(function (stage, index) {
      if (f.stage && f.stage !== 'all' && stage.id !== f.stage) return;
      (stage.tasks || []).forEach(function (task) {
        var person = f.mine ? me : (f.person && f.person !== 'all' ? f.person : null);
        if (f.mine && !me) return;
        if (person && (task.assignees || []).indexOf(person) < 0) return;
        if (task.status === 'done' && !recentlyDone(task, now)) return;
        out.push({ stage: stage, stageIndex: index, task: task });
      });
    });
    return out;
  }

  /** Czy kartę wolno upuścić w danej kolumnie. */
  function canDrop(from, to) {
    return from !== to && Tasks.nextStatuses(from).indexOf(to) >= 0;
  }

  var api = { COLUMNS: COLUMNS, STEPS: STEPS, DONE_DAYS: DONE_DAYS, recentlyDone: recentlyDone, cards: cards, canDrop: canDrop };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Board = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
