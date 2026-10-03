/* ETROM — rzędna ▽: znak stanu projektu (atom języka).
   Miernik, tor przebiegu, poziom i znaczniki: src/ui/flowSystem.js. Zasady: docs/DESIGN_SYSTEM.md. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Insight = E.Insight;

  /* ---------- Rzędna ▽ ---------- */

  // Kształt różni poziomy także bez koloru: kontur, wypełnienie, wypełnienie ze znakiem.
  // Znak stanu projektu: okrąg zamiast trójkąta, bo trójkąt kojarzy się z ostrzeżeniem drogowym i hałasował na kolorowych kaflach.
  // Alarm = pełne czerwone koło z wykrzyknikiem, uwaga = bursztynowy pierścień z wykrzyknikiem,
  // w normie = mała spokojna kropka, zakończony = pierścień z haczykiem. Kształt różni się nie tylko barwą.
  function datumPaths(level) {
    var bang = function (color) {
      return [D.svg('path', { d: 'M8 4.6v4', stroke: color, 'stroke-width': '1.8', fill: 'none' }),
        D.svg('circle', { cx: '8', cy: '11.2', r: '1', fill: color, stroke: 'none' })];
    };
    if (level === 'alarm') {
      return [D.svg('circle', { cx: '8', cy: '8', r: '7', fill: 'currentColor', stroke: 'none' })].concat(bang('var(--datum-mark, #fff)'));
    }
    if (level === 'warning') {
      return [D.svg('circle', { cx: '8', cy: '8', r: '6.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8' })].concat(bang('currentColor'));
    }
    if (level === 'closed') {
      return [D.svg('circle', { cx: '8', cy: '8', r: '6.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4' }),
        D.svg('path', { d: 'm5.4 8.2 1.8 1.8 3.4-3.6', stroke: 'currentColor', 'stroke-width': '1.5', fill: 'none', 'stroke-linejoin': 'round' })];
    }
    return [D.svg('circle', { cx: '8', cy: '8', r: '3', fill: 'currentColor', stroke: 'none' })];
  }

  /**
   * Znak stanu projektu.
   * @param {string} level alarm | warning | normal | closed
   * @param {{size?: number, label?: string|false}} [options]
   */
  function datum(level, options) {
    var settings = options || {};
    var size = settings.size || 14;
    var label = settings.label === false ? null : (settings.label || Insight.LEVELS[level].label);
    return D.el('span', {
      class: 'datum datum--' + level,
      attrs: label ? { role: 'img', 'aria-label': label, 'data-tooltip': label } : { 'aria-hidden': 'true' }
    }, [D.svg('svg', {
      viewBox: '0 0 16 16', width: String(size), height: String(size),
      'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false'
    }, datumPaths(level))]);
  }

  root.ETROM.Sig = { datum: datum };
})(typeof globalThis !== 'undefined' ? globalThis : this);
