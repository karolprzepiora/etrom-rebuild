/* ETROM — wyszukiwanie, filtrowanie i sortowanie listy projektów. Czyste funkcje. */
(function (root) {
  'use strict';

  var Progress = (typeof module !== 'undefined' && module.exports)
    ? require('./progress.js')
    : root.ETROM.Progress;
  var Team = (typeof module !== 'undefined' && module.exports)
    ? require('./team.js')
    : root.ETROM.Team;

  var SORTS = {
    code: 'Numer projektu',
    deadline: 'Termin — najbliższy (zakończone na końcu)',
    name: 'Nazwa A→Z'
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
    code: function (a, b) { return compareText(a.code, b.code) || compareText(a.name, b.name); },
    progress: compareProgress
  };

  // Wczytywane przy wywołaniu: w przeglądarce insight.js ładuje się po query.js.
  function insight() {
    return (typeof module !== 'undefined' && module.exports) ? require('./insight.js') : root.ETROM.Insight;
  }

  var HEALTH = ['attention', 'alarm', 'warning', 'normal', 'closed', 'overdue'];

  function matchesHealth(project, health, now, mail) {
    if (!health || health === 'all' || HEALTH.indexOf(health) < 0) return true;
    if (health === 'overdue') return insight().hasOverdue(project, now, mail);
    var level = insight().healthOf(project, now, mail).level;
    if (health === 'attention') return level === 'alarm' || level === 'warning';
    return level === health;
  }

  /**
   * @param {Array} projects
   * @param {{query?: string, status?: string, sort?: string, person?: string,
   *          health?: string, horizon?: number, now?: Date}} filters
   *   health: all | attention (alarmowy + ostrzegawczy) | alarm | warning | normal | closed
   *   horizon: tylko projekty z terminem (umowy lub etapu) w najbliższych N dniach
   * @returns {Array} nowa, przefiltrowana i posortowana tablica
   */
  function filterAndSort(projects, filters) {
    var list = Array.isArray(projects) ? projects.slice() : [];
    var options = filters || {};
    var status = options.status || 'all';
    var query = typeof options.query === 'string' ? options.query.trim() : '';

    var person = options.person || 'all';

    var now = options.now instanceof Date ? options.now : new Date();
    var horizon = Number(options.horizon) > 0 ? Number(options.horizon) : 0;

    var filtered = list.filter(function (project) {
      if (status !== 'all' && project.status !== status) return false;
      if (person !== 'all' && Team.projectPeople(project.team).indexOf(person) < 0) return false;
      if (!matchesHealth(project, options.health, now, options.mail)) return false;
      if (horizon && !insight().upcomingFor(project, now, horizon).length) return false;
      return matchesQuery(project, query);
    });

    var comparator = COMPARATORS[options.sort] || COMPARATORS.code;
    filtered.sort(comparator);
    // Kierunek: domyślnie rosnąco; „desc” odwraca kolejność, np. najnowsze numery na górze.
    if (options.dir === 'desc') filtered.reverse();
    return filtered;
  }

  var api = { SORTS: SORTS, HEALTH: HEALTH, filterAndSort: filterAndSort };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Query = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
