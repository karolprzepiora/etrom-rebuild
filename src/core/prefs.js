/* ETROM — preferencje urządzenia: motyw i sposób wyświetlania listy.
   Trzymane osobno od danych projektów, żeby wyczyszczenie danych
   nie zmieniało wyglądu. */
(function (root) {
  'use strict';

  var KEY = 'etrom.prefs.v1';
  var THEMES = ['system', 'light', 'dark'];
  var VIEWS = ['cards', 'list'];
  var ACCENTS = ['standard', 'hydro', 'topo'];

  function defaults() {
    return { theme: 'system', view: 'cards', accent: 'standard' };
  }

  function normalize(raw) {
    var source = (raw && typeof raw === 'object') ? raw : {};
    return {
      theme: THEMES.indexOf(source.theme) >= 0 ? source.theme : 'system',
      view: VIEWS.indexOf(source.view) >= 0 ? source.view : 'cards',
      accent: ACCENTS.indexOf(source.accent) >= 0 ? source.accent : 'standard'
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
    defaults: defaults,
    normalize: normalize,
    createPrefs: createPrefs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Prefs = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
