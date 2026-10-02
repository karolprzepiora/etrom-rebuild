/* ETROM — rzędna ▽: znak stanu projektu (atom języka).
   Miernik, tor przebiegu, poziom i znaczniki: src/ui/flowSystem.js. Zasady: docs/DESIGN_SYSTEM.md. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Insight = E.Insight;

  /* ---------- Rzędna ▽ ---------- */

  // Kształt różni poziomy także bez koloru: kontur, wypełnienie, wypełnienie ze znakiem.
  function datumPaths(level) {
    var tri = 'M2.2 3.2h11.6L8 12.4Z';
    var line = D.svg('path', { d: 'M4 14.6h8', 'stroke-width': '1.5', fill: 'none' });
    if (level === 'alarm') {
      return [D.svg('path', { d: tri, fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linejoin': 'round' }),
        D.svg('path', { d: 'M8 5.2v3', stroke: 'var(--datum-mark, #fff)', 'stroke-width': '1.6', fill: 'none' }),
        line];
    }
    if (level === 'warning') {
      return [D.svg('path', { d: tri, fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linejoin': 'round' }), line];
    }
    if (level === 'closed') {
      return [D.svg('path', { d: tri, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linejoin': 'round' })];
    }
    return [D.svg('path', { d: tri, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linejoin': 'round' }), line];
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
