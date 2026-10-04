/* ETROM — model danych: fabryki i walidacja. Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  var Catalog = (typeof module !== 'undefined' && module.exports)
    ? require('./catalog.js')
    : root.ETROM.Catalog;
  var Kinds = (typeof module !== 'undefined' && module.exports)
    ? require('./kinds.js')
    : root.ETROM.Kinds;
  var Team = (typeof module !== 'undefined' && module.exports)
    ? require('./team.js')
    : root.ETROM.Team;
  var Tasks = (typeof module !== 'undefined' && module.exports)
    ? require('./tasks.js')
    : root.ETROM.Tasks;

  var TimeLog = (typeof module !== 'undefined' && module.exports)
    ? require('./timelog.js')
    : root.ETROM.TimeLog;
  var Social = (typeof module !== 'undefined' && module.exports)
    ? require('./social.js')
    : root.ETROM.Social;
  var Budget = (typeof module !== 'undefined' && module.exports)
    ? require('./budget.js')
    : root.ETROM.Budget;
  var Mail = (typeof module !== 'undefined' && module.exports)
    ? require('./mail.js')
    : root.ETROM.Mail;

  var Library = (typeof module !== 'undefined' && module.exports)
    ? require('./library.js')
    : root.ETROM.Library;

  var Absences = (typeof module !== 'undefined' && module.exports)
    ? require('./absences.js')
    : root.ETROM.Absences;

  var WORKSPACE_VERSION = 9;

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

    // Wartość umowy jest opcjonalna i trafia do wyniku tylko wtedy, gdy pole przyszło w danych
    // (zwykły użytkownik jej nie widzi, więc jej brak w formularzu nie może jej zerować).
    var contractValue;
    if (Object.prototype.hasOwnProperty.call(input, 'contractValue')) {
      var rawValue = text(String(input.contractValue == null ? '' : input.contractValue)).replace(/\s/g, '').replace(',', '.');
      if (!rawValue) contractValue = null;
      else if (!/^\d+(\.\d{1,2})?$/.test(rawValue) || Number(rawValue) > 1e10) errors.contractValue = 'Podaj kwotę w złotych, np. 120000.';
      else contractValue = Number(rawValue);
    }

    var value = { code: code, name: name, client: client, status: status, deadline: deadline };
    if (contractValue !== undefined) value.contractValue = contractValue;
    // Rodzaj projektu: klucz z listy albo brak (rozpoznawany z nazwy).
    if (Object.prototype.hasOwnProperty.call(input, 'kind')) {
      var rawKind = text(String(input.kind == null ? '' : input.kind));
      if (!rawKind) value.kind = null;
      else if (Kinds.isKey(rawKind)) value.kind = rawKind;
      else errors.kind = 'Wybierz rodzaj z listy.';
    }
    // Zakres opracowania: klucz z katalogu albo brak.
    if (Object.prototype.hasOwnProperty.call(input, 'scope')) {
      var rawScope = text(String(input.scope == null ? '' : input.scope));
      if (!rawScope) value.scope = null;
      else if (Catalog.isScope(rawScope)) value.scope = rawScope;
      else errors.scope = 'Wybierz zakres z listy.';
    }
    // Kolor projektu: indeks palety 0–39 albo brak (kolor z numeru projektu).
    if (Object.prototype.hasOwnProperty.call(input, 'color')) {
      var rawColor = input.color === '' || input.color == null ? null : Number(input.color);
      if (rawColor === null) value.color = null;
      else if (Number.isInteger(rawColor) && rawColor >= 0 && rawColor < 40) value.color = rawColor;
      else errors.color = 'Wybierz kolor z palety.';
    }
    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      value: value
    };
  }

  /** Najmniejszy wolny dodatni identyfikator. */
  /**
   * Proponowany numer nowego projektu: rok (2 cyfry) i kolejny numer w roku,
   * np. 2601, 2602 … Liczy się największy numer z tego roku w kodach istniejących projektów.
   */
  function nextProjectCode(projects, now) {
    var d = now instanceof Date ? now : new Date();
    var year = String(d.getFullYear()).slice(2);
    var max = 0;
    (projects || []).forEach(function (p) {
      var match = /^(\d{2})(\d{2,3})$/.exec(String(p && p.code).trim());
      if (match && match[1] === year) max = Math.max(max, Number(match[2]));
    });
    return year + String(max + 1).padStart(2, '0');
  }

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
    var stage = {
      id: entry.id,
      source: 'catalog',
      status: 'todo',
      hours: hours,
      deadline: isDate(options.deadline) ? options.deadline : '',
      adjustments: [],
      tasks: []
    };
    if (Number(options.weight) > 0) stage.weight = Number(options.weight);
    return stage;
  }

  /**
   * Dzieli budżet godzin na etapy proporcjonalnie do wag (metoda największych reszt),
   * w pełnych godzinach, z co najmniej 1 h na etap, o ile budżet na to pozwala.
   * @param {number} total
   * @param {Array<{id:string, weight:number}>} items
   * @returns {Object<string, number>} id → godziny; suma = total
   */
  function distributeHours(total, items) {
    var out = {};
    var list = (items || []).filter(function (i) { return i && i.id; });
    var sum = Math.round(Number(total));
    if (!list.length || !Number.isFinite(sum) || sum <= 0) return out;
    var weights = list.map(function (i) { return Number(i.weight) > 0 ? Number(i.weight) : 1; });
    var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
    var floor = sum >= list.length ? 1 : 0;
    var spare = sum - floor * list.length;
    var shares = weights.map(function (w) { return (w / wsum) * spare; });
    var base = shares.map(function (v) { return Math.floor(v); });
    var left = spare - base.reduce(function (a, b) { return a + b; }, 0);
    shares.map(function (v, i) { return { i: i, r: v - base[i] }; })
      .sort(function (a, b) { return b.r - a.r || a.i - b.i; })
      .slice(0, left).forEach(function (x) { base[x.i] += 1; });
    list.forEach(function (item, i) { out[item.id] = base[i] + floor; });
    return out;
  }

  /** Kolejny wolny identyfikator etapu własnego w obrębie projektu. */
  function nextCustomStageId(stages) {
    var max = 0;
    (stages || []).forEach(function (stage) {
      var match = /^custom-(\d+)$/.exec(String(stage && stage.id));
      if (match) max = Math.max(max, Number(match[1]));
    });
    return 'custom-' + (max + 1);
  }

  /**
   * Etap spoza katalogu: własna nazwa i dziedzina.
   * @returns {{valid: boolean, errors: Object, stage: (Object|null)}}
   */
  function createCustomStage(input, stages) {
    var data = input || {};
    var errors = {};
    var name = text(data.name);
    var domain = text(data.domain) || 'general';
    var kind = text(data.kind) || 'docs';
    var hours = Number(data.hours);

    if (!Object.prototype.hasOwnProperty.call(Catalog.KINDS, kind)) errors.kind = 'Wybierz rodzaj pracy.';
    if (!name) errors.name = 'Podaj nazwę etapu.';
    else if (name.length > LIMITS.name) errors.name = 'Nazwa może mieć najwyżej ' + LIMITS.name + ' znaków.';
    if (!Object.prototype.hasOwnProperty.call(Catalog.DOMAINS, domain)) errors.domain = 'Wybierz dziedzinę.';
    if (!Number.isFinite(hours) || hours <= 0) errors.hours = 'Podaj budżet godzin większy od zera.';
    if (data.deadline && !isDate(data.deadline)) errors.deadline = 'Użyj poprawnej daty.';

    if (Object.keys(errors).length) return { valid: false, errors: errors, stage: null };

    return {
      valid: true,
      errors: {},
      stage: {
        id: nextCustomStageId(stages),
        source: 'custom',
        name: name,
        domain: domain,
        kind: kind,
        status: 'todo',
        hours: hours,
        deadline: isDate(data.deadline) ? data.deadline : '',
        adjustments: [],
        tasks: []
      }
    };
  }

  /**
   * Zmiana danych istniejącego etapu. Etap własny można przemianować i przenieść do innej
   * dziedziny; etap standardowy zachowuje nazwę i dziedzinę ze standardu ETROM.
   * Status, zadania i identyfikator zostają bez zmian.
   * @returns {{valid: boolean, errors: Object, stage: (Object|null)}}
   */
  function updateStage(stage, input) {
    var data = input || {};
    var errors = {};
    var custom = !!stage && stage.source === 'custom';
    var hours = Number(data.hours);

    if (!stage) return { valid: false, errors: { hours: 'Nie znaleziono etapu.' }, stage: null };
    var name = text(data.name);
    var domain = text(data.domain) || stage.domain || 'general';
    var kind = text(data.kind) || stage.kind || 'docs';
    if (custom) {
      if (!Object.prototype.hasOwnProperty.call(Catalog.KINDS, kind)) errors.kind = 'Wybierz rodzaj pracy.';
      if (!name) errors.name = 'Podaj nazwę etapu.';
      else if (name.length > LIMITS.name) errors.name = 'Nazwa może mieć najwyżej ' + LIMITS.name + ' znaków.';
      if (!Object.prototype.hasOwnProperty.call(Catalog.DOMAINS, domain)) errors.domain = 'Wybierz dziedzinę.';
    }
    if (!Number.isFinite(hours) || hours <= 0) errors.hours = 'Podaj budżet godzin większy od zera.';
    if (text(data.deadline) && !isDate(text(data.deadline))) errors.deadline = 'Użyj poprawnej daty.';
    if (Object.keys(errors).length) return { valid: false, errors: errors, stage: null };

    var next = Object.assign({}, stage, {
      hours: hours,
      deadline: isDate(text(data.deadline)) ? text(data.deadline) : ''
    });
    if (custom) {
      next.name = name;
      next.domain = domain;
      next.kind = kind;
    }
    return { valid: true, errors: {}, stage: next };
  }

  /**
   * Jednolity opis etapu dla widoku — niezależnie od tego, czy pochodzi
   * z katalogu, czy został dopisany w projekcie.
   */
  function describeStage(stage) {
    var entry = stage && stage.source !== 'custom' ? Catalog.find(stage.id) : null;
    if (entry) {
      return {
        name: entry.name,
        domain: entry.domain,
        domainLabel: Catalog.domain(entry.domain).label,
        color: Catalog.domain(entry.domain).color,
        kind: entry.kind,
        kindLabel: Catalog.kind(entry.kind).label,
        icon: entry.icon,
        decision: entry.kind === 'decision',
        catalogNumber: entry.number,
        isCustom: false
      };
    }
    var domain = Catalog.domain(stage && stage.domain);
    var kind = Catalog.kind(stage && stage.kind);
    return {
      name: (stage && stage.name) || 'Etap bez nazwy',
      domain: domain.id,
      domainLabel: domain.label,
      color: domain.color,
      kind: kind.id,
      kindLabel: kind.label,
      icon: domain.id,
      decision: kind.id === 'decision',
      catalogNumber: null,
      isCustom: true
    };
  }

  /**
   * Wstawia etap katalogowy tak, żeby etapy katalogowe zachowały swoją
   * kolejność względem siebie. Etapy własne zostają tam, gdzie są.
   */
  function insertCatalogStage(stages, stage) {
    var list = (stages || []).slice();
    var entry = Catalog.find(stage.id);
    if (!entry) return list.concat([stage]);

    for (var i = 0; i < list.length; i += 1) {
      var other = Catalog.find(list[i].id);
      if (list[i].source === 'custom' || !other) continue;
      if (other.number > entry.number) {
        list.splice(i, 0, stage);
        return list;
      }
    }
    return list.concat([stage]);
  }

  /** Przesuwa etap o jedną pozycję. Zwraca nową tablicę. */
  function moveStage(stages, id, delta) {
    var list = (stages || []).slice();
    var from = list.findIndex(function (stage) { return stage.id === id; });
    if (from < 0) return list;
    var to = from + delta;
    if (to < 0 || to >= list.length) return list;
    var moved = list.splice(from, 1)[0];
    list.splice(to, 0, moved);
    return list;
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
      team: input.team ? Object.assign(Team.emptyTeam(), input.team) : Team.emptyTeam(),
      contractValue: v.contractValue == null ? null : v.contractValue,
      color: v.color == null ? null : v.color,
      kind: v.kind == null ? null : v.kind,
      scope: v.scope == null ? null : v.scope,
      createdAt: new Date().toISOString()
    };
  }

  /** Następny status etapu w cyklu todo → working → done → todo. */
  function cycleStageStatus(status) {
    var index = STAGE_CYCLE.indexOf(status);
    return STAGE_CYCLE[(index + 1) % STAGE_CYCLE.length];
  }

  /** Czyści dane wczytane z dysku — nigdy nie rzuca, pomija uszkodzone wpisy. */
  /** Plan bazowy projektu: zamrożone godziny etapów i koszt w chwili zamrożenia. */
  function cleanBaseline(b) {
    if (!b || typeof b !== 'object' || typeof b.at !== 'string') return null;
    var hours = Number(b.hours), cost = Number(b.cost), rate = Number(b.rate);
    if (!(hours >= 0) || !(cost >= 0)) return null;
    return {
      at: b.at, hours: hours, rate: rate >= 0 ? rate : 0, cost: cost,
      stages: (Array.isArray(b.stages) ? b.stages : []).filter(function (x) { return x && typeof x.id === 'string' && Number(x.hours) >= 0; })
        .map(function (x) { return { id: x.id, hours: Number(x.hours) }; })
    };
  }

  function normalizeWorkspace(raw) {
    var source = (raw && typeof raw === 'object') ? raw : {};
    var people = Team.normalizePeople(source.people);
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

      var team = Team.normalizeTeam(item.team, people);
      var roster = Team.projectPeople(team);

      // Kolejność tablicy jest kolejnością etapów w projekcie.
      var stages = (Array.isArray(item.stages) ? item.stages : []).reduce(function (acc, stage) {
        if (!stage || !stage.id) return acc;
        if (acc.some(function (s) { return s.id === stage.id; })) return acc;

        var entry = Catalog.find(stage.id);
        var custom = stage.source === 'custom' || (!entry && text(stage.name));
        if (!entry && !custom) return acc;

        var hours = Number(stage.hours);
        var fallbackHours = entry ? entry.defaultHours : 8;
        var common = {
          status: Object.prototype.hasOwnProperty.call(STAGE_STATUS, stage.status) ? stage.status : 'todo',
          hours: Number.isFinite(hours) && hours > 0 ? hours : fallbackHours,
          deadline: isDate(stage.deadline) ? stage.deadline : '',
          adjustments: Budget.normalizeAdjustments(stage.adjustments),
          weight: Number(stage.weight) > 0 && Number(stage.weight) <= 1000 ? Number(stage.weight) : null,
          locked: stage.locked === true,
          reserve: stage.reserve !== null && stage.reserve !== undefined && Number(stage.reserve) >= 0 && Number(stage.reserve) <= 5000 ? Number(stage.reserve) : null,
          // Realizatorem może być tylko ktoś z zespołu projektu.
          tasks: Tasks.normalizeTasks(stage.tasks, roster)
        };

        if (custom) {
          var domain = text(stage.domain);
          acc.push(Object.assign({
            id: String(stage.id),
            source: 'custom',
            name: text(stage.name) || 'Etap bez nazwy',
            domain: Object.prototype.hasOwnProperty.call(Catalog.DOMAINS, domain) ? domain : 'general',
            kind: Catalog.kind(text(stage.kind)).id
          }, common));
        } else {
          acc.push(Object.assign({ id: entry.id, source: 'catalog' }, common));
        }
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
        team: team,
        contractValue: Number.isFinite(Number(item.contractValue)) && item.contractValue !== null && Number(item.contractValue) >= 0 ? Number(item.contractValue) : null,
        color: Number.isInteger(item.color) && item.color >= 0 && item.color < 40 ? item.color : null,
        kind: Kinds.isKey(item.kind) ? item.kind : null,
        // Dawny rodzaj „Ekspertyza / OST” to dziś zakres opracowania, nie obiekt.
        scope: Catalog.isScope(item.scope) ? item.scope : (item.kind === 'survey' ? 'assessment' : null),
        baseline: cleanBaseline(item.baseline),
        priority: Number.isInteger(item.priority) && item.priority > 0 ? item.priority : 0,
        planAcceptedAt: typeof item.planAcceptedAt === 'string' && !Number.isNaN(Date.parse(item.planAcceptedAt)) ? item.planAcceptedAt : null,
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

    var entries = TimeLog.normalizeEntries(source.entries, projects.map(function (project) { return project.id; }));
    var mail = Mail.normalizeEntries(source.mail, projects.map(function (project) { return project.id; }));
    return { version: WORKSPACE_VERSION, projects: projects, people: people, entries: entries, mail: mail, social: Social.normalize(source.social), library: Library.normalize(source.library), absences: Absences.normalize(source.absences) };
  }

  function emptyWorkspace() {
    return { version: WORKSPACE_VERSION, projects: [], people: [], entries: [], mail: [], social: Social.empty(), library: Library.normalize(null), absences: [] };
  }

  var api = {
    WORKSPACE_VERSION: WORKSPACE_VERSION,
    PROJECT_STATUS: PROJECT_STATUS,
    STAGE_STATUS: STAGE_STATUS,
    STAGE_CYCLE: STAGE_CYCLE,
    isDate: isDate,
    validateProject: validateProject,
    nextProjectId: nextProjectId,
    nextProjectCode: nextProjectCode,
    createProject: createProject,
    createStage: createStage,
    distributeHours: distributeHours,
    createCustomStage: createCustomStage,
    updateStage: updateStage,
    nextCustomStageId: nextCustomStageId,
    describeStage: describeStage,
    insertCatalogStage: insertCatalogStage,
    moveStage: moveStage,
    cycleStageStatus: cycleStageStatus,
    normalizeWorkspace: normalizeWorkspace,
    emptyWorkspace: emptyWorkspace
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Model = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
