/* ETROM — preferencje urządzenia: motyw, akcent, widok listy i widoczne kolumny.
   Trzymane osobno od danych projektów, żeby wyczyszczenie danych
   nie zmieniało wyglądu. */
(function (root) {
  'use strict';

  var KEY = 'etrom.prefs.v1';
  var THEMES = ['system', 'light', 'dark'];
  var VIEWS = ['list', 'cards'];
  var ACCENTS = ['standard', 'graphite'];
  // Motywy kolorystyczne: tło okna, pasek boczny, nagłówki i przycisk główny.
  var PALETTES = ['ocean', 'graphite', 'forest', 'sunset', 'violet', 'sky', 'mint', 'peach', 'lilac'];
  var VIVID_MIN = 40; var VIVID_MAX = 150; var VIVID_DEFAULT = 100; var CONTRAST_DEFAULT = 50;
  var GROUPS = ['health', 'status', 'none'];
  var DENSITIES = ['comfortable', 'compact'];
  var TASK_VIEWS = ['list', 'kanban'];
  // Elementy wiersza projektu, które można ukryć w opcjach widoku.
  var COLUMNS = ['client', 'progress', 'stages', 'tasks', 'deadline', 'team', 'time'];
  // Nazwy z wcześniejszych wersji przeniesione na obecne.
  var LEGACY_ACCENTS = { hydro: 'standard', topo: 'graphite', raspberry: 'standard' };
  var MAX_PINNED = 8;
  var MAX_VIEWS = 6;
  var BUILTIN_VIEWS = ['all', 'mine', 'attention', 'overdue', 'done'];
  var HEALTH_FILTERS = ['all', 'attention', 'alarm', 'warning', 'normal', 'closed', 'overdue'];
  var STATUS_FILTERS = ['all', 'active', 'planned', 'paused', 'done'];

  /** Własne widoki listy projektów: nazwa i zapisane filtry. Nigdy nie rzuca. */
  function customViews(raw) {
    var seen = {};
    return (Array.isArray(raw) ? raw : []).map(function (v) {
      if (!v || typeof v !== 'object') return null;
      var id = typeof v.id === 'string' && /^c-\d+$/.test(v.id) ? v.id : null;
      var name = typeof v.name === 'string' ? v.name.trim().slice(0, 30) : '';
      if (!id || !name || seen[id]) return null;
      seen[id] = true;
      var f = v.filters && typeof v.filters === 'object' ? v.filters : {};
      return {
        id: id, name: name,
        filters: {
          health: HEALTH_FILTERS.indexOf(f.health) >= 0 ? f.health : 'all',
          status: STATUS_FILTERS.indexOf(f.status) >= 0 ? f.status : 'all',
          person: typeof f.person === 'string' && (f.person === 'all' || /^p-\d+$/.test(f.person)) ? f.person : 'all',
          query: typeof f.query === 'string' ? f.query.slice(0, 80) : ''
        }
      };
    }).filter(Boolean).slice(0, MAX_VIEWS);
  }
  var MAX_RECENT = 5;

  // Odłożone pozycje Skrzynki: klucz → data RRRR-MM-DD.
  function cleanSnoozed(value) {
    var out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    Object.keys(value).slice(0, 200).forEach(function (k) {
      if (k.length <= 80 && /^\d{4}-\d{2}-\d{2}$/.test(String(value[k]))) out[k] = value[k];
    });
    return out;
  }

  function defaults() {
    // Lista jest domyślna: przy dziesiątkach projektów skanuje się ją szybciej niż karty.
    return {
      theme: 'system', view: 'list', accent: 'standard', hiddenColumns: [],
      groupBy: 'none', density: 'comfortable', taskView: 'list', detailsOpen: true, projectView: 'all', customViews: [], sidebarCollapsed: false, railCollapsed: false, palette: 'ocean', hdr: true, vivid: 100, contrast: 50, pinned: [], recent: [], me: null, snoozed: {}, hourlyCost: 0
    };
  }

  function ids(value, max) {
    var list = Array.isArray(value) ? value : [];
    var seen = {};
    return list.filter(function (id) {
      if (!Number.isSafeInteger(id) || id <= 0 || seen[id]) return false;
      seen[id] = true;
      return true;
    }).slice(0, max);
  }

  function viewId(source) {
    var id = source.projectView;
    if (BUILTIN_VIEWS.indexOf(id) >= 0) return id;
    return customViews(source.customViews).some(function (v) { return v.id === id; }) ? id : 'all';
  }

  function clampInt(value, min, max, fallback) {
    var n = typeof value === 'number' ? value : NaN;
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function normalize(raw) {
    var source = (raw && typeof raw === 'object') ? raw : {};
    var accent = LEGACY_ACCENTS[source.accent] || source.accent;
    var hidden = Array.isArray(source.hiddenColumns) ? source.hiddenColumns : [];
    return {
      theme: THEMES.indexOf(source.theme) >= 0 ? source.theme : 'system',
      view: VIEWS.indexOf(source.view) >= 0 ? source.view : 'list',
      accent: ACCENTS.indexOf(accent) >= 0 ? accent : 'standard',
      hiddenColumns: COLUMNS.filter(function (key) { return hidden.indexOf(key) >= 0; }),
      groupBy: GROUPS.indexOf(source.groupBy) >= 0 ? source.groupBy : 'none',
      density: DENSITIES.indexOf(source.density) >= 0 ? source.density : 'comfortable',
      taskView: TASK_VIEWS.indexOf(source.taskView) >= 0 ? source.taskView : 'list',
      detailsOpen: source.detailsOpen !== false,
      customViews: customViews(source.customViews),
      projectView: viewId(source),
      sidebarCollapsed: source.sidebarCollapsed === true,
      railCollapsed: source.railCollapsed === true,
      palette: PALETTES.indexOf(source.palette) >= 0 ? source.palette : 'ocean',
      hdr: source.hdr !== false,
      vivid: clampInt(source.vivid, VIVID_MIN, VIVID_MAX, VIVID_DEFAULT),
      contrast: clampInt(source.contrast, 0, 100, CONTRAST_DEFAULT),
      pinned: ids(source.pinned, MAX_PINNED),
      recent: ids(source.recent, MAX_RECENT),
      // Kim jest osoba przy tym urządzeniu (identyfikator z katalogu zespołu).
      me: typeof source.me === 'string' && /^p-\d+$/.test(source.me) ? source.me : null,
      snoozed: cleanSnoozed(source.snoozed),
      // Koszt godziny pracy (zł) do oceny opłacalności; 0 = nie ustawiono.
      hourlyCost: Number.isFinite(Number(source.hourlyCost)) && Number(source.hourlyCost) >= 0 && Number(source.hourlyCost) <= 10000 ? Math.round(Number(source.hourlyCost) * 100) / 100 : 0
    };
  }

  /** Dopisuje projekt na początek listy ostatnio otwieranych. */
  function touchRecent(prefs, id) {
    var list = [id].concat((prefs.recent || []).filter(function (x) { return x !== id; }));
    return normalize(Object.assign({}, prefs, { recent: list }));
  }

  function resolveBackend(backend) {
    if (backend) return backend;
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (error) { return null; }
    return null;
  }

  /** @param {Object} [backend] obiekt zgodny z localStorage */
  function createPrefs(backend) {
    var store = resolveBackend(backend);

    function load() {
      if (!store) return defaults();
      try {
        var raw = store.getItem(KEY);
        return raw ? normalize(JSON.parse(raw)) : defaults();
      } catch (error) {
        return defaults();
      }
    }

    function save(prefs) {
      if (!store) return false;
      try {
        store.setItem(KEY, JSON.stringify(normalize(prefs)));
        return true;
      } catch (error) {
        return false;
      }
    }

    return { load: load, save: save, KEY: KEY };
  }

  var api = {
    KEY: KEY,
    THEMES: THEMES,
    VIEWS: VIEWS,
    ACCENTS: ACCENTS,
    PALETTES: PALETTES,
    VIVID_MIN: VIVID_MIN,
    VIVID_MAX: VIVID_MAX,
    COLUMNS: COLUMNS,
    GROUPS: GROUPS,
    DENSITIES: DENSITIES,
    BUILTIN_VIEWS: BUILTIN_VIEWS,
    MAX_VIEWS: MAX_VIEWS,
    touchRecent: touchRecent,
    defaults: defaults,
    normalize: normalize,
    createPrefs: createPrefs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Prefs = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
