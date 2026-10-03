/* ETROM — kreskowa grafika rodzaju projektu (jaz, zapora, pompownia…).
   Rysowana w kodzie, w siatce 120×80, kontur w kolorze tekstu (currentColor):
   na kaflu jako jasny znak wodny, na liście jako mała ikona. */
(function (root) {
  'use strict';

  var E = root.ETROM;

  var ART = {
    weir: ['M4 24h44', 'M10 32h32', 'M48 18v44h68', 'M48 18h8l26 34h34', 'M76 64h40', 'M88 72h28', 'M54 40l10 14', 'M60 34l10 14'],
    dam: ['M20 68 46 14h28l26 54Z', 'M2 30h22', 'M2 40h18', 'M2 50h14', 'M56 28v30', 'M46 40v18', 'M66 40v18', 'M8 68h104'],
    reservoir: ['M18 42C16 24 40 14 62 18c24 4 42 18 38 36-4 16-30 20-52 14C30 64 20 56 18 42Z', 'M36 42c0-9 14-14 26-12 14 2 22 10 20 20-2 9-16 11-28 8-10-3-18-8-18-16Z', 'M46 44c4 3 9 3 14 0s9-3 14 0'],
    pump: ['M28 66V36L58 18l30 18v30Z', 'M6 74q9-8 18 0t18 0 18 0 18 0 18 0 18 0', 'M58 54a8 8 0 1 0 .01 0', 'M58 46v16', 'M50 54h16', 'M92 44h18v-8', 'M92 56h18'],
    hydro: ['M60 40a6 6 0 1 0 .01 0', 'M60 34c-2-12 4-20 12-22', 'M66 40c12-2 20 4 22 12', 'M60 46c2 12-4 20-12 22', 'M54 40c-12 2-20-4-22-12', 'M8 68h104', 'M96 14l-8 14h10l-8 14'],
    levee: ['M0 66h120', 'M14 66 42 30h38l28 36', 'M0 54q6-6 12 0t12 0', 'M0 62q6-6 12 0', 'M48 40h26', 'M42 50h38'],
    retention: ['M34 68V46', 'M34 14c-16 12-18 26 0 30 18-4 16-18 0-30Z', 'M34 36v10', 'M60 68q12-34 54-40', 'M52 68q16-44 66-52', 'M70 68q8-22 42-26'],
    river: ['M4 56c20-34 32 14 54-12s34-18 62-14', 'M4 68c20-34 32 14 54-12s34-18 62-14', 'M20 26l4-4', 'M96 62l4 4'],
    survey: ['M50 30a18 18 0 1 0 .01 0', 'M63 43l24 24', 'M50 22v8', 'M50 50v8', 'M32 40h8', 'M60 40h8', 'M8 68h46', 'M70 20 100 20'],
    other: ['M4 70C20 30 60 10 116 14', 'M4 78C28 40 66 22 116 28', 'M20 74C40 50 70 38 116 42']
  };

  function svg(kind, className) {
    var paths = ART[kind] || ART.other;
    var markup = '<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      paths.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</svg>';
    var holder = document.createElement('span');
    holder.className = className || 'kind-art';
    holder.innerHTML = markup;
    return holder;
  }

  /** Duży znak wodny na kafel lub baner. */
  function art(kind) { return svg(kind, 'kind-art'); }
  /** Mała ikona rodzaju na listę. */
  function icon(kind, title) {
    var node = svg(kind, 'kind-icon');
    if (title) { node.setAttribute('title', title); node.setAttribute('role', 'img'); node.setAttribute('aria-label', title); node.firstChild.removeAttribute('aria-hidden'); }
    return node;
  }

  E.KindArt = { art: art, icon: icon, KEYS: Object.keys(ART) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
