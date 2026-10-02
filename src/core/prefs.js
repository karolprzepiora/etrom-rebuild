/* ETROM — preferencje urządzenia: motyw, akcent, widok listy i widoczne kolumny.
   Trzymane osobno od danych projektów, żeby wyczyszczenie danych
   nie zmieniało wyglądu. */
(function (root) {
  'use strict';

  var KEY = 'etrom.prefs.v1';
  var THEMES = ['system', 'light', 'dark'];
  var VIEWS = ['list', 'cards'];
  var ACCENTS = ['standard', 'graphite'];
  var GROUPS = ['health', 'status', 'none'];
  var DENSITIES = ['comfortable', 'compact'];
  // Elementy wiersza projektu, które można ukryć w opcjach widoku.
  var COLUMNS = ['client', 'progress', 'stages', 'tasks', 'deadline', 'team'];
  // Nazwy z wcześniejszych wersji przeniesione na obecne.
  var LEGACY_ACCENTS = { hydro: 'standard', topo: 'graphite', raspberry: 'standard' };
  var MAX_PINNED = 8;
  var MAX_RECENT = 5;

  function defaults() {
    // Lista jest domyślna: przy dziesiątkach projektów skanuje się ją szybciej niż karty.
    return {
      theme: 'system', view: 'list', accent: 'standard', hiddenColumns: [],
      groupBy: 'health', density: 'comfortable', sidebarCollapsed: false, pinned: [], recent: [], me: null
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

  function normalize(raw) {
    var source = (raw && typeof raw === 'object') ? raw : {};
    var accent = LEGACY_ACCENTS[source.accent] || source.accent;
    var hidden = Array.isArray(source.hiddenColumns) ? source.hiddenColumns : [];
    return {
      theme: THEMES.indexOf(source.theme) >= 0 ? source.theme : 'system',
      view: VIEWS.indexOf(source.view) >= 0 ? source.view : 'list',
      accent: ACCENTS.indexOf(accent) >= 0 ? accent : 'standard',
      hiddenColumns: COLUMNS.filter(function (key) { return hidden.indexOf(key) >= 0; }),
      groupBy: GROUPS.indexOf(source.groupBy) >= 0 ? source.groupBy : 'health',
      density: DENSITIES.indexOf(source.density) >= 0 ? source.density : 'comfortable',
      sidebarCollapsed: source.sidebarCollapsed === true,
      pinned: ids(source.pinned, MAX_PINNED),
      recent: ids(source.recent, MAX_RECENT),
      // Kim jest osoba przy tym urządzeniu (identyfikator z katalogu zespołu).
      me: typeof source.me === 'string' && /^p-\d+$/.test(source.me) ? source.me : null
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
    COLUMNS: COLUMNS,
    GROUPS: GROUPS,
    DENSITIES: DENSITIES,
    touchRecent: touchRecent,
    defaults: defaults,
    normalize: normalize,
    createPrefs: createPrefs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Prefs = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
