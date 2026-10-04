/* ETROM — biblioteka typowych zadań wg etapów. Zadania są duże (kilka na etap), bez godzin i wag:
   godziny wynikają z puli etapu, wagi ustawi się później. Źródło: raporty czasu biura (docs/BIBLIOTEKA_ZADAN_PROPOZYCJA.md). */
(function (root) {
  'use strict';

  // Dokumentacja i postępowanie to osobne etapy: wnioski należą do etapów-postępowań; uzupełnienia na wezwanie powstają z pism, gdy się pojawią.
  var TASKS = {
    preparation: [{ name: 'Dane wyjściowe i warunki techniczne' }],
    survey: [{ name: 'Mapa do celów projektowych (MDCP)' }, { name: 'Prawa do gruntów i zgody' }],
    studies: [{ name: 'Opinia geotechniczna' }, { name: 'Analiza hydrologiczno-hydrauliczna' }],
    assessment: [{ name: 'Ekspertyza techniczna' }],
    concept: [{ name: 'Koncepcja techniczna' }],
    'environment-docs': [{ name: 'Karta Informacyjna Przedsięwzięcia' }],
    'environment-process': [{ name: 'Wniosek o decyzję środowiskową' }],
    'location-docs': [{ name: 'Opracowanie do wniosku lokalizacyjnego' }],
    'location-process': [{ name: 'Wniosek o decyzję lokalizacyjną' }],
    'water-docs': [{ name: 'Operat wodnoprawny' }],
    'water-process': [{ name: 'Wniosek o pozwolenie wodnoprawne' }],
    land: [{ name: 'Uzgodnienia i zgody terenowe' }],
    'building-docs': [{ name: 'Projekt zagospodarowania terenu' }, { name: 'Projekt architektoniczno-budowlany' }],
    'building-process': [{ name: 'Wniosek o pozwolenie na budowę' }],
    technical: [{ name: 'Projekt techniczny i wykonawczy' }],
    estimates: [{ name: 'Przedmiary, kosztorysy i STWiORB' }],
    handover: [{ name: 'Przekazanie i odbiór dokumentacji' }]
  };

  var node = typeof module !== 'undefined' && module.exports;
  var Catalog = node ? require('./catalog.js') : root.ETROM.Catalog;

  // Własna biblioteka biura: lista zadań każdego etapu nadpisuje standard.
  var custom = { tasks: {} };
  var MAX_TASKS = 30;
  var MAX_NAME = 120;

  function cleanName(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /** Czyści zapisaną bibliotekę: tylko znane etapy, unikalne nazwy, dodatnie udziały. */
  function normalize(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = { tasks: {} };
    var tasks = src.tasks && typeof src.tasks === 'object' ? src.tasks : {};
    Object.keys(tasks).forEach(function (id) {
      if (!Catalog.find(id) || !Array.isArray(tasks[id])) return;
      var seen = {};
      var list = [];
      tasks[id].forEach(function (t) {
        var name = cleanName(t && typeof t === 'object' ? t.name : t);
        if (!name || seen[name.toLowerCase()] || list.length >= MAX_TASKS) return;
        seen[name.toLowerCase()] = true;
        list.push({ name: name });
      });
      out.tasks[id] = list;
    });
    return out;
  }

  function configure(raw) { custom = normalize(raw); return custom; }
  function current() { return normalize(custom); }

  function defaultTasks(stageId) {
    return (has(TASKS, stageId) ? TASKS[stageId] : []).map(function (t) { return { name: t.name }; });
  }

  /** Typowe zadania etapu (kopie, żeby nikt nie zmienił biblioteki przez przypadek). */
  function forStage(stageId) {
    var list = has(custom.tasks, stageId) ? custom.tasks[stageId] : defaultTasks(stageId);
    return list.map(function (t) { return { name: t.name, reserve: false }; });
  }

  /** Waga etapu przy rozdziale budżetu: standard z katalogu (udziały ustawia się przy zakładaniu projektu). */
  function weightOf(stageId) {
    var entry = Catalog.find(stageId);
    return entry ? entry.defaultHours : 0;
  }

  /** Udział etapu w pełnym projekcie, w procentach (do wyświetlania, 1 miejsce po przecinku). */
  function sharePct(stageId) {
    var sum = Catalog.all.reduce(function (t, e) { return t + weightOf(e.id); }, 0);
    return sum > 0 ? Math.round(weightOf(stageId) / sum * 1000) / 10 : 0;
  }

  /** Udziały wybranych etapów przeskalowane do 100% (jedno miejsce po przecinku, suma równa 100). */
  function sharesFor(ids) {
    var sum = ids.reduce(function (t, id) { return t + weightOf(id); }, 0);
    var out = {};
    if (!(sum > 0)) return out;
    var used = 0;
    ids.forEach(function (id, i) {
      var v = i === ids.length - 1 ? Math.round((100 - used) * 10) / 10 : Math.round(weightOf(id) / sum * 1000) / 10;
      out[id] = v;
      used += v;
    });
    return out;
  }

  function isCustomized(stageId) { return has(custom.tasks, stageId); }

  /* --- zmiany (zwracają nową bibliotekę, bez modyfikacji obecnej) --- */

  function withTasks(lib, stageId, names) {
    var next = normalize(lib);
    var obj = {}; obj[stageId] = names.map(function (n) { return { name: n }; });
    next.tasks = Object.assign({}, next.tasks, normalize({ tasks: obj }).tasks);
    return next;
  }
  function tasksOf(lib, stageId) {
    var n = normalize(lib);
    return (has(n.tasks, stageId) ? n.tasks[stageId] : defaultTasks(stageId)).map(function (t) { return t.name; });
  }
  function addTask(lib, stageId, name) {
    var nm = cleanName(name);
    var list = tasksOf(lib, stageId);
    if (!nm) return { library: normalize(lib), error: 'Wpisz nazwę zadania.' };
    if (list.some(function (n) { return n.toLowerCase() === nm.toLowerCase(); })) return { library: normalize(lib), error: 'Takie zadanie już jest w tym etapie.' };
    if (list.length >= MAX_TASKS) return { library: normalize(lib), error: 'Etap może mieć najwyżej ' + MAX_TASKS + ' zadań.' };
    return { library: withTasks(lib, stageId, list.concat([nm])), error: '' };
  }
  function renameTask(lib, stageId, index, name) {
    var nm = cleanName(name);
    var list = tasksOf(lib, stageId);
    if (!nm) return { library: normalize(lib), error: 'Nazwa nie może być pusta.' };
    if (list.some(function (n, i) { return i !== index && n.toLowerCase() === nm.toLowerCase(); })) return { library: normalize(lib), error: 'Takie zadanie już jest w tym etapie.' };
    list[index] = nm;
    return { library: withTasks(lib, stageId, list), error: '' };
  }
  function removeTask(lib, stageId, index) {
    var list = tasksOf(lib, stageId);
    list.splice(index, 1);
    return withTasks(lib, stageId, list);
  }
  /** Przywraca standardowe zadania etapu. */
  function resetTasks(lib, stageId) {
    var next = normalize(lib);
    delete next.tasks[stageId];
    return next;
  }

  /** Pozycje biblioteki, których etap jeszcze nie ma (po nazwie, bez względu na wielkość liter). */
  function missing(stage) {
    var have = {};
    (stage.tasks || []).forEach(function (t) { have[String(t.name).trim().toLowerCase()] = true; });
    return forStage(stage.id).filter(function (t) { return !have[t.name.toLowerCase()]; });
  }

  var api = {
    TASKS: TASKS, forStage: forStage, missing: missing, normalize: normalize, configure: configure, current: current,
    defaultTasks: defaultTasks, weightOf: weightOf, sharePct: sharePct, sharesFor: sharesFor, isCustomized: isCustomized,
    addTask: addTask, renameTask: renameTask, removeTask: removeTask, resetTasks: resetTasks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Library = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
