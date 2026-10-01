/* ETROM — pojemnik na stan. Widok nie trzyma danych, tylko reaguje na zmiany. */
(function (root) {
  'use strict';

  /**
   * Minimalny store: jedno źródło stanu, powiadamianie subskrybentów.
   * @param {Object} initialState
   */
  function createStore(initialState) {
    var state = initialState || {};
    var listeners = [];
    var notifying = false;
    var pending = false;
    var MAX_PASSES = 10;

    function getState() {
      return state;
    }

    function notify() {
      // Gdy subskrybent sam wywoła update, nie zagnieżdżamy powiadomień —
      // zapisujemy, że trzeba powtórzyć przebieg, żeby widok nie został na starym stanie.
      if (notifying) { pending = true; return; }
      notifying = true;
      try {
        var passes = 0;
        do {
          pending = false;
          passes += 1;
          listeners.slice().forEach(function (listener) { listener(state); });
        } while (pending && passes < MAX_PASSES);
      } finally {
        notifying = false;
        pending = false;
      }
    }

    /** @param {Function} producer (state) => nowy stan */
    function update(producer) {
      var next = producer(state);
      if (next === undefined) throw new Error('update() musi zwrócić nowy stan.');
      if (next === state) return state;
      state = next;
      notify();
      return state;
    }

    /** Scalenie częściowego stanu. */
    function set(patch) {
      return update(function (current) {
        return Object.assign({}, current, patch);
      });
    }

    /** @returns {Function} funkcja odsubskrybowania */
    function subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('subscribe() wymaga funkcji.');
      listeners.push(listener);
      return function unsubscribe() {
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    return { getState: getState, update: update, set: set, subscribe: subscribe };
  }

  var api = { createStore: createStore };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Store = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
