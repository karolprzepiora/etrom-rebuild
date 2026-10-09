/* ETROM — kafle Pulpitu: pula wskaźników i wybór widocznych.
   Czysta logika bez DOM: ekran tylko liczy wartości i rysuje wybrane kafle.
   Rola „manager” (Dyrekcja, Lider) i „worker” mają osobne pule. */
(function (root) {
  'use strict';

  var MAX = 5;
  var MIN = 2;

  var POOLS = {
    manager: [
      { id: 'risk', label: 'Projekty w ryzyku', hint: 'ostrzeżenia i alarmy' },
      { id: 'load', label: 'Obciążenie zespołu', hint: 'plan tygodnia do dostępnych godzin' },
      { id: 'approve', label: 'Do akceptacji', hint: 'wnioski urlopowe' },
      { id: 'react', label: 'Wymaga reakcji', hint: 'zatwierdzenia i pisma' },
      { id: 'late', label: 'Zadania po terminie', hint: 'w całej firmie' },
      { id: 'soon', label: 'Terminy w 7 dni', hint: 'zadania do zamknięcia' },
      { id: 'absent', label: 'Nieobecni dziś', hint: 'urlopy i wyjazdy' },
      { id: 'ontime', label: 'Terminowość 90 dni', hint: 'zadania zamknięte w terminie' }
    ],
    worker: [
      { id: 'today', label: 'Dziś', hint: 'godziny zarejestrowane dzisiaj' },
      { id: 'week', label: 'Ten tydzień', hint: 'zarejestrowane do planu' },
      { id: 'late', label: 'Po terminie', hint: 'moje zadania do nadrobienia' },
      { id: 'react', label: 'Wymaga reakcji', hint: 'zatwierdzenia i pisma' },
      { id: 'next', label: 'Najbliższy termin', hint: 'moje najbliższe zadanie' },
      { id: 'soon', label: 'Terminy w 7 dni', hint: 'moje zadania do zamknięcia' },
      { id: 'leave', label: 'Urlop do wykorzystania', hint: 'dni roboczych w tym roku' }
    ]
  };

  var DEFAULTS = {
    manager: ['risk', 'load', 'approve', 'late', 'soon'],
    worker: ['today', 'week', 'late', 'react', 'next']
  };

  function roleOf(management) { return management ? 'manager' : 'worker'; }
  function pool(role) { return POOLS[role] || POOLS.worker; }
  function defaults(role) { return (DEFAULTS[role] || DEFAULTS.worker).slice(); }
  function inPool(role, id) { return pool(role).some(function (t) { return t.id === id; }); }

  /** Wybór zapisany w ustawieniach → lista poprawnych kafli (kolejność zachowana). Pusty lub zepsuty → domyślne. */
  function resolve(saved, role) {
    var seen = {};
    var list = (Array.isArray(saved) ? saved : []).filter(function (id) {
      if (typeof id !== 'string' || seen[id] || !inPool(role, id)) return false;
      seen[id] = true;
      return true;
    }).slice(0, MAX);
    return list.length >= 1 ? list : defaults(role);
  }

  /** Włącza lub wyłącza kafel. Zwraca nową listę; nie schodzi poniżej MIN ani nie przekracza MAX. */
  function toggle(current, role, id) {
    var list = resolve(current, role);
    var at = list.indexOf(id);
    if (at >= 0) return list.length <= MIN ? list : list.filter(function (x) { return x !== id; });
    if (!inPool(role, id) || list.length >= MAX) return list;
    return list.concat([id]);
  }

  /** Przesuwa kafel o jedno miejsce (dir −1 w lewo, +1 w prawo). */
  function move(current, role, id, dir) {
    var list = resolve(current, role);
    var at = list.indexOf(id);
    var to = at + (dir < 0 ? -1 : 1);
    if (at < 0 || to < 0 || to >= list.length) return list;
    var out = list.slice();
    out.splice(at, 1);
    out.splice(to, 0, id);
    return out;
  }

  var api = { MAX: MAX, MIN: MIN, POOLS: POOLS, roleOf: roleOf, pool: pool, defaults: defaults, resolve: resolve, toggle: toggle, move: move };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.DashTiles = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
