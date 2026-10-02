/* ETROM — preferencje urządzenia: motyw, akcent, widok listy i widoczne kolumny.
   Trzymane osobno od danych projektów, żeby wyczyszczenie danych
   nie zmieniało wyglądu. */
(function (root) {
  'use strict';

  var KEY = 'etrom.prefs.v1';
  var THEMES = ['system', 'light', 'dark'];
  var VIEWS = ['list', 'cards'];
  var ACCENTS = ['standard', 'hydro', 'graphite'];
  // Kolumny tabeli projektów, które można ukryć. Kod, nazwa i status są zawsze.
  var COLUMNS = ['client', 'progress', 'stages', 'tasks', 'deadline', 'team'];
  // Nazwy z wcześniejszych wersji, przeniesione na obecne.
  var LEGACY_ACCENTS = { topo: 'graphite' };

  function defaults() {
    // Lista jest domyślna: przy dziesiątkach projektów skanuje się ją szybciej niż karty.
    return { theme: 'system', view: 'list', accent: 'standard', hiddenColumns: [] };
  }

  function normalize(raw) {
    var source = (raw && typeof raw === 'object') ? raw : {};
    var accent = LEGACY_ACCENTS[source.accent] || source.accent;
    var hidden = Array.isArray(source.hiddenColumns) ? source.hiddenColumns : [];
    return {
      theme: THEMES.indexOf(source.theme) >= 0 ? source.theme : 'system',
      view: VIEWS.indexOf(source.view) >= 0 ? source.view : 'list',
      accent: ACCENTS.indexOf(accent) >= 0 ? accent : 'standard',
      hiddenColumns: COLUMNS.filter(function (key) { return hidden.indexOf(key) >= 0; })
    };
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
    defaults: defaults,
    normalize: normalize,
    createPrefs: createPrefs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Prefs = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
