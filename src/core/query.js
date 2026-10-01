/* ETROM — wyszukiwanie, filtrowanie i sortowanie listy projektów. Czyste funkcje. */
(function (root) {
  'use strict';

  var Progress = (typeof module !== 'undefined' && module.exports)
    ? require('./progress.js')
    : root.ETROM.Progress;

  var SORTS = {
    deadline: 'Termin — najbliższy (zakończone na końcu)',
    name: 'Nazwa A→Z',
    code: 'Kod A→Z',
    progress: 'Postęp — największy'
  };

  function normalize(value) {
    return String(value == null ? '' : value).toLocaleLowerCase('pl');
  }

  function matchesQuery(project, query) {
    if (!query) return true;
    var needle = normalize(query);
    return normalize(project.code).indexOf(needle) >= 0
      || normalize(project.name).indexOf(needle) >= 0
      || normalize(project.client).indexOf(needle) >= 0;
  }

  function compareText(a, b) {
    return String(a).localeCompare(String(b), 'pl', { sensitivity: 'base', numeric: true });
  }

  function compareDeadline(a, b) {
    // Projekt zakończony nie ma już czynnego terminu, więc nie zajmuje czoła listy,
    // nawet gdy jego data jest najstarsza.
    var closedA = a.status === 'done' ? 1 : 0;
    var closedB = b.status === 'done' ? 1 : 0;
    if (closedA !== closedB) return closedA - closedB;

    // Projekty bez terminu idą na koniec swojej grupy.
    if (!a.deadline && !b.deadline) return compareText(a.name, b.name);
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    if (a.deadline === b.deadline) return compareText(a.name, b.name);
    return a.deadline < b.deadline ? -1 : 1;
  }

  function compareProgress(a, b) {
    var diff = Progress.projectProgress(b).percent - Progress.projectProgress(a).percent;
    return diff !== 0 ? diff : compareText(a.name, b.name);
  }

  var COMPARATORS = {
    deadline: compareDeadline,
    name: function (a, b) { return compareText(a.name, b.name); },
    code: function (a, b) { return compareText(a.code, b.code); },
    progress: compareProgress
  };

  /**
   * @param {Array} projects
   * @param {{query?: string, status?: string, sort?: string}} filters
   * @returns {Array} nowa, przefiltrowana i posortowana tablica
   */
  function filterAndSort(projects, filters) {
    var list = Array.isArray(projects) ? projects.slice() : [];
    var options = filters || {};
    var status = options.status || 'all';
    var query = typeof options.query === 'string' ? options.query.trim() : '';

    var filtered = list.filter(function (project) {
      if (status !== 'all' && project.status !== status) return false;
      return matchesQuery(project, query);
    });

    var comparator = COMPARATORS[options.sort] || COMPARATORS.deadline;
    return filtered.sort(comparator);
  }

  var api = { SORTS: SORTS, filterAndSort: filterAndSort };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Query = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
