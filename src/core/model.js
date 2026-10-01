/* ETROM — model danych: fabryki i walidacja. Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  var Catalog = (typeof module !== 'undefined' && module.exports)
    ? require('./catalog.js')
    : root.ETROM.Catalog;

  var WORKSPACE_VERSION = 3;

  var PROJECT_STATUS = {
    planned: 'Przygotowanie',
    active: 'W realizacji',
    paused: 'Wstrzymany',
    done: 'Zakończony'
  };

  var STAGE_STATUS = {
    todo: 'Do wykonania',
    working: 'W toku',
    done: 'Zakończony'
  };

  var STAGE_CYCLE = ['todo', 'working', 'done'];

  var LIMITS = { code: 50, name: 200, client: 200 };

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number);
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return d.getUTCFullYear() === parts[0]
      && d.getUTCMonth() === parts[1] - 1
      && d.getUTCDate() === parts[2];
  }

  /**
   * Sprawdza dane projektu z formularza.
   * @returns {{valid: boolean, errors: Object<string,string>, value: Object}}
   */
  function validateProject(input, projects, ignoreId) {
    input = input || {};
    projects = Array.isArray(projects) ? projects : [];
    var errors = {};

    var code = text(input.code);
    var name = text(input.name);
    var client = text(input.client);
    var status = text(input.status) || 'planned';
    var deadline = text(input.deadline);

    if (!code) errors.code = 'Podaj kod projektu.';
    else if (code.length > LIMITS.code) errors.code = 'Kod może mieć najwyżej ' + LIMITS.code + ' znaków.';
    else if (projects.some(function (p) {
      return p.id !== ignoreId && String(p.code).toUpperCase() === code.toUpperCase();
    })) errors.code = 'Projekt o tym kodzie już istnieje.';

    if (!name) errors.name = 'Podaj nazwę projektu.';
    else if (name.length > LIMITS.name) errors.name = 'Nazwa może mieć najwyżej ' + LIMITS.name + ' znaków.';

    if (!client) errors.client = 'Podaj zamawiającego.';
    else if (client.length > LIMITS.client) errors.client = 'Pole może mieć najwyżej ' + LIMITS.client + ' znaków.';

    if (!Object.prototype.hasOwnProperty.call(PROJECT_STATUS, status)) errors.status = 'Nieznany status.';

    if (deadline && !isDate(deadline)) errors.deadline = 'Użyj poprawnej daty.';

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      value: { code: code, name: name, client: client, status: status, deadline: deadline }
    };
  }

  /** Najmniejszy wolny dodatni identyfikator. */
  function nextProjectId(projects) {
    var max = 0;
    (projects || []).forEach(function (p) {
      if (Number.isSafeInteger(p.id) && p.id > max) max = p.id;
    });
    return max + 1;
  }

  /** Tworzy etap na podstawie wpisu katalogu. */
  function createStage(catalogId, options) {
    var entry = Catalog.find(catalogId);
    if (!entry) throw new Error('Nieznany etap: ' + catalogId);
    options = options || {};
    var hours = Number(options.hours);
    if (!Number.isFinite(hours) || hours <= 0) hours = entry.defaultHours;
    return {
      id: entry.id,
      status: 'todo',
      hours: hours,
      deadline: isDate(options.deadline) ? options.deadline : ''
    };
  }

  /**
   * Tworzy projekt. Rzuca wyjątkiem, gdy dane są niepoprawne —
   * UI woła wcześniej validateProject i pokazuje błędy przy polach.
   */
  function createProject(input, projects) {
    var check = validateProject(input, projects);
    if (!check.valid) throw new Error('Dane projektu są niepoprawne.');
    var v = check.value;
    return {
      id: nextProjectId(projects),
      code: v.code,
      name: v.name,
      client: v.client,
      status: v.status,
      deadline: v.deadline,
      stages: Array.isArray(input.stages) ? input.stages.slice() : [],
      createdAt: new Date().toISOString()
    };
  }

  /** Następny status etapu w cyklu todo → working → done → todo. */
  function cycleStageStatus(status) {
    var index = STAGE_CYCLE.indexOf(status);
    return STAGE_CYCLE[(index + 1) % STAGE_CYCLE.length];
  }

  /** Czyści dane wczytane z dysku — nigdy nie rzuca, pomija uszkodzone wpisy. */
  function normalizeWorkspace(raw) {
    var source = (raw && typeof raw === 'object') ? raw : {};
    var list = Array.isArray(source.projects) ? source.projects : [];
    var seenIds = {};
    var seenCodes = {};
    var projects = [];

    list.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var code = text(item.code);
      var name = text(item.name);
      if (!code || !name) return;
      var upper = code.toUpperCase();
      if (seenCodes[upper]) return;

      var id = Number.isSafeInteger(item.id) && item.id > 0 ? item.id : 0;
      if (!id || seenIds[id]) id = 0;

      var status = Object.prototype.hasOwnProperty.call(PROJECT_STATUS, item.status)
        ? item.status : 'planned';

      var stages = (Array.isArray(item.stages) ? item.stages : []).reduce(function (acc, stage) {
        if (!stage || !Catalog.find(stage.id)) return acc;
        if (acc.some(function (s) { return s.id === stage.id; })) return acc;
        var hours = Number(stage.hours);
        acc.push({
          id: stage.id,
          status: Object.prototype.hasOwnProperty.call(STAGE_STATUS, stage.status) ? stage.status : 'todo',
          hours: Number.isFinite(hours) && hours > 0 ? hours : Catalog.find(stage.id).defaultHours,
          deadline: isDate(stage.deadline) ? stage.deadline : ''
        });
        return acc;
      }, []);

      projects.push({
        id: id,
        code: code,
        name: name,
        client: text(item.client),
        status: status,
        deadline: isDate(item.deadline) ? item.deadline : '',
        stages: stages,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : ''
      });

      seenCodes[upper] = true;
      if (id) seenIds[id] = true;
    });

    // Uzupełnia brakujące identyfikatory po przejściu całej listy.
    projects.forEach(function (project) {
      if (project.id) return;
      project.id = nextProjectId(projects);
      seenIds[project.id] = true;
    });

    return { version: WORKSPACE_VERSION, projects: projects };
  }

  function emptyWorkspace() {
    return { version: WORKSPACE_VERSION, projects: [] };
  }

  var api = {
    WORKSPACE_VERSION: WORKSPACE_VERSION,
    PROJECT_STATUS: PROJECT_STATUS,
    STAGE_STATUS: STAGE_STATUS,
    STAGE_CYCLE: STAGE_CYCLE,
    isDate: isDate,
    validateProject: validateProject,
    nextProjectId: nextProjectId,
    createProject: createProject,
    createStage: createStage,
    cycleStageStatus: cycleStageStatus,
    normalizeWorkspace: normalizeWorkspace,
    emptyWorkspace: emptyWorkspace
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Model = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
