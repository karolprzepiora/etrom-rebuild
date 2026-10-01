/* ETROM — zapis lokalny. Warstwa wymienna, więc logikę można testować bez przeglądarki. */
(function (root) {
  'use strict';

  var Model = (typeof module !== 'undefined' && module.exports)
    ? require('./model.js')
    : root.ETROM.Model;
  var Catalog = (typeof module !== 'undefined' && module.exports)
    ? require('./catalog.js')
    : root.ETROM.Catalog;

  var KEY = 'etrom.v3';
  var LEGACY_KEY = 'etrom.workspace.v2';

  /**
   * Przekłada zapis starego ETROM (projects[].procedures[].stages[])
   * na nowy kształt. Czysta funkcja, nie dotyka dysku.
   */
  function legacyToWorkspace(raw) {
    var source = (raw && typeof raw === 'object') ? raw : {};
    var list = Array.isArray(source.projects) ? source.projects : [];

    var projects = list.map(function (item) {
      if (!item || typeof item !== 'object') return null;

      var procedures = Array.isArray(item.procedures) ? item.procedures : [];
      var stages = [];
      var seen = {};

      procedures.forEach(function (procedure) {
        var inner = (procedure && Array.isArray(procedure.stages)) ? procedure.stages : [];
        inner.forEach(function (stage) {
          if (!stage || seen[stage.id] || !Catalog.find(stage.id)) return;
          seen[stage.id] = true;
          stages.push({
            id: stage.id,
            status: stage.approval ? 'done' : 'todo',
            hours: Number(stage.hours) > 0 ? Number(stage.hours) : Catalog.find(stage.id).defaultHours,
            deadline: Model.isDate(stage.date) ? stage.date : ''
          });
        });
      });

      var firstDeadline = procedures
        .map(function (p) { return p && p.date; })
        .filter(function (d) { return Model.isDate(d); })
        .sort()[0] || '';

      return {
        id: item.id,
        code: item.code,
        name: item.name,
        client: item.client,
        status: item.status,
        deadline: firstDeadline,
        stages: stages,
        createdAt: ''
      };
    }).filter(Boolean);

    return Model.normalizeWorkspace({ projects: projects });
  }

  function resolveBackend(backend) {
    if (backend) return backend;
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (error) {
      return null; // np. zablokowane dane witryny
    }
    return null;
  }

  /**
   * @param {Object} [backend] obiekt zgodny z localStorage (getItem/setItem)
   * @returns {{available: boolean, load: Function, save: Function, clear: Function}}
   */
  function createStorage(backend) {
    var store = resolveBackend(backend);

    function read(key) {
      if (!store) return null;
      try { return store.getItem(key); } catch (error) { return null; }
    }

    /**
     * Wczytuje dane. Nigdy nie rzuca — przy błędzie zwraca pusty zbiór i ostrzeżenie,
     * żeby uszkodzony zapis nie zablokował aplikacji i nie został nadpisany po cichu.
     * @returns {{workspace: Object, warning: string, importedFromLegacy: boolean}}
     */
    function load() {
      if (!store) {
        return {
          workspace: Model.emptyWorkspace(),
          warning: 'Zapis lokalny jest niedostępny w tej przeglądarce. Zmiany nie zostaną zachowane po zamknięciu karty.',
          importedFromLegacy: false
        };
      }

      var current = read(KEY);
      if (current) {
        try {
          return {
            workspace: Model.normalizeWorkspace(JSON.parse(current)),
            warning: '',
            importedFromLegacy: false
          };
        } catch (error) {
          return {
            workspace: Model.emptyWorkspace(),
            warning: 'Nie udało się odczytać zapisu lokalnego. Dane nie zostały nadpisane — pobierz kopię przed dalszą pracą.',
            importedFromLegacy: false
          };
        }
      }

      var legacy = read(LEGACY_KEY);
      if (legacy) {
        try {
          var converted = legacyToWorkspace(JSON.parse(legacy));
          if (converted.projects.length) {
            return { workspace: converted, warning: '', importedFromLegacy: true };
          }
        } catch (error) {
          // Stary zapis zostaje nietknięty; startujemy od pustego zbioru.
        }
      }

      return { workspace: Model.emptyWorkspace(), warning: '', importedFromLegacy: false };
    }

    /** @returns {{ok: boolean, warning: string}} */
    function save(workspace) {
      if (!store) {
        return { ok: false, warning: 'Zapis lokalny jest niedostępny — zmiany nie zostaną zachowane.' };
      }
      try {
        store.setItem(KEY, JSON.stringify(workspace));
        return { ok: true, warning: '' };
      } catch (error) {
        return { ok: false, warning: 'Nie udało się zapisać danych lokalnie. Pobierz kopię JSON.' };
      }
    }

    function clear() {
      if (!store) return false;
      try { store.removeItem(KEY); return true; } catch (error) { return false; }
    }

    return { available: !!store, load: load, save: save, clear: clear, KEY: KEY };
  }

  var api = {
    KEY: KEY,
    LEGACY_KEY: LEGACY_KEY,
    legacyToWorkspace: legacyToWorkspace,
    createStorage: createStorage
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Storage = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
