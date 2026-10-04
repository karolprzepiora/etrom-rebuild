/* ETROM — kreskowa grafika rodzaju projektu (jaz, zapora, pompownia…).
   Rysowana w kodzie, w siatce 120×80, kontur w kolorze tekstu (currentColor):
   na kaflu jako jasny znak wodny, na liście jako mała ikona. */
(function (root) {
  'use strict';

  var E = root.ETROM;

  var ART = {
    weir: ['M4 24h44', 'M10 32h32', 'M48 18v44h68', 'M48 18h8l26 34h34', 'M76 64h40', 'M88 72h28', 'M54 40l10 14', 'M60 34l10 14'],
    dam: ['M20 68 46 14h28l26 54Z', 'M2 30h22', 'M2 40h18', 'M2 50h14', 'M56 28v30', 'M46 40v18', 'M66 40v18', 'M8 68h104'],
    pond: ['M14 56c0-12 16-18 36-18s40 6 40 18-18 16-40 16-36-4-36-16Z', 'M32 56q9-5 18 0t18 0', 'M104 72V38', 'M98 72V46', 'M110 72V44', 'M104 46l-6-6', 'M104 40l6-6', 'M98 54l-6-5'],
    reservoir: ['M18 42C16 24 40 14 62 18c24 4 42 18 38 36-4 16-30 20-52 14C30 64 20 56 18 42Z', 'M36 42c0-9 14-14 26-12 14 2 22 10 20 20-2 9-16 11-28 8-10-3-18-8-18-16Z', 'M46 44c4 3 9 3 14 0s9-3 14 0'],
    pump: ['M28 66V36L58 18l30 18v30Z', 'M6 74q9-8 18 0t18 0 18 0 18 0 18 0 18 0', 'M58 54a8 8 0 1 0 .01 0', 'M58 46v16', 'M50 54h16', 'M92 44h18v-8', 'M92 56h18'],
    hydro: ['M60 40a6 6 0 1 0 .01 0', 'M60 34c-2-12 4-20 12-22', 'M66 40c12-2 20 4 22 12', 'M60 46c2 12-4 20-12 22', 'M54 40c-12 2-20-4-22-12', 'M8 68h104', 'M96 14l-8 14h10l-8 14'],
    levee: ['M0 66h120', 'M14 66 42 30h38l28 36', 'M0 54q6-6 12 0t12 0', 'M0 62q6-6 12 0', 'M48 40h26', 'M42 50h38'],
    retention: ['M26 70V54', 'M26 12 12 34h28Z', 'M26 26 8 50h36Z', 'M52 70V58', 'M52 30 42 46h20Z', 'M52 42 38 58h28Z', 'M74 62h12v-7h12v-7h12v-7', 'M70 72q7-4 14 0t14 0 14 0'],
    culvert: ['M0 28h120', 'M0 36h120', 'M20 36v36', 'M100 36v36', 'M34 72V58a26 20 0 0 1 52 0v14', 'M0 72h120', 'M44 66q6-4 12 0t12 0', 'M12 20h8', 'M52 20h16', 'M100 20h8'],
    multi: ['M0 70h120', 'M8 70V44l14-9 14 9v26', 'M18 62h8v8', 'M50 70V38h24v32', 'M50 46h24', 'M84 70l8-20h14l8 20', 'M92 60h14', 'M62 30V20', 'M56 20h12'],
    river: ['M4 56c20-34 32 14 54-12s34-18 62-14', 'M4 68c20-34 32 14 54-12s34-18 62-14', 'M20 26l4-4', 'M96 62l4 4'],
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
