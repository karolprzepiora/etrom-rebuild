/* ETROM — wykresy w czystym SVG (bez bibliotek). Każdy zwraca węzeł <svg> z viewBox,
   więc skaluje się do szerokości kontenera. Kolory przez klasy (styles/analysis.css),
   dzięki czemu działają w obu motywach. Opisy dla czytnika ekranu w <title>. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var F = E.Format;

  function s(tag, attrs, children) { return D.svg(tag, attrs || {}, children || []); }
  function t(x, y, text, cls, anchor) {
    var node = s('text', { x: x, y: y, class: 'ch-t ' + (cls || ''), 'text-anchor': anchor || 'start' });
    node.textContent = text;
    return node;
  }
  function svgRoot(w, h, label, cls) {
    var node = s('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'ch ' + (cls || ''), role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
    return node;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function nice(max) {
    var steps = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 2000, 2500, 5000, 10000];
    for (var i = 0; i < steps.length; i += 1) if (max <= steps[i] * 4) return steps[i] * 4;
    return Math.ceil(max / 4 / 1000) * 4000;
  }

  /** Mapa projektów: oś X — postęp rzeczowy, oś Y — zużycie budżetu; powyżej przekątnej wydajemy szybciej niż robimy. */
  function scatter(projects, options) {
    var o = options || {};
    var W = 640, H = 400, L = 52, R = 40, T = 16, B = 44;
    var pw = W - L - R, ph = H - T - B;
    var maxY = Math.max(120, Math.ceil(Math.max.apply(null, projects.map(function (p) { return p.usagePct; }).concat([100])) / 20) * 20 + 10);
    var maxPlanned = Math.max.apply(null, projects.map(function (p) { return p.planned; }).concat([1]));
    var x = function (v) { return L + (clamp(v, 0, 100) / 100) * pw; };
    var y = function (v) { return T + ph - (clamp(v, 0, maxY) / maxY) * ph; };
    var svg = svgRoot(W, H, 'Mapa projektów: postęp rzeczowy a zużycie budżetu godzin', 'ch--scatter');

    // strefa przekroczenia (nad przekątną) i linia 100% budżetu
    svg.appendChild(s('polygon', { class: 'ch-zone', points: x(0) + ',' + y(0) + ' ' + x(0) + ',' + y(maxY) + ' ' + x(100) + ',' + y(maxY) + ' ' + x(100) + ',' + y(100) }));
    [0, 25, 50, 75, 100].forEach(function (v) {
      svg.appendChild(s('line', { class: 'ch-grid', x1: x(v), y1: T, x2: x(v), y2: T + ph }));
      svg.appendChild(t(x(v), H - 22, v + '%', 'ch-axis', 'middle'));
    });
    for (var g = 0; g <= maxY; g += 25) {
      svg.appendChild(s('line', { class: 'ch-grid', x1: L, y1: y(g), x2: L + pw, y2: y(g) }));
      svg.appendChild(t(L - 8, y(g) + 4, g + '%', 'ch-axis', 'end'));
    }
    svg.appendChild(s('line', { class: 'ch-diag', x1: x(0), y1: y(0), x2: x(100), y2: y(100) }));
    svg.appendChild(s('line', { class: 'ch-limit', x1: L, y1: y(100), x2: L + pw, y2: y(100) }));
    svg.appendChild(t(L + pw - 48, y(100) - 6, 'budżet 100%', 'ch-note', 'end'));
    svg.appendChild(t(x(100) - 30, y(100) + 22, 'zgodnie z planem', 'ch-note', 'end'));
    svg.appendChild(t(L + 8, T + 16, 'wydajemy szybciej, niż robimy', 'ch-note ch-note--bad'));
    svg.appendChild(t(L + pw / 2, H - 4, 'Postęp rzeczowy', 'ch-label', 'middle'));
    var yl = t(14, T + ph / 2, 'Zużycie budżetu', 'ch-label', 'middle');
    yl.setAttribute('transform', 'rotate(-90 14 ' + (T + ph / 2) + ')');
    svg.appendChild(yl);

    projects.slice().sort(function (a, b) { return b.planned - a.planned; }).forEach(function (p) {
      var r = 9 + Math.sqrt(p.planned / maxPlanned) * 17;
      var cx = x(p.earnedPct), cy = y(p.usagePct);
      var g2 = s('g', { class: 'ch-bubble ch-v-' + p.verdict + (o.selected === p.id ? ' is-selected' : ''), tabindex: '0', role: 'button', 'data-tooltip': p.code + ' ' + p.name + ' — postęp ' + Math.round(p.earnedPct) + '%, budżet ' + Math.round(p.usagePct) + '%', 'aria-label': p.code + ' ' + p.name + ', postęp ' + Math.round(p.earnedPct) + ' procent, zużycie budżetu ' + Math.round(p.usagePct) + ' procent' });
      g2.appendChild(s('circle', { class: 'ch-halo', cx: cx, cy: cy, r: r + 6 }));
      g2.appendChild(s('circle', { class: 'ch-dot', cx: cx, cy: cy, r: r }));
      g2.appendChild(t(cx, cy + 4, p.code.replace(/^\D+/, '').slice(-4), 'ch-code', 'middle'));
      g2.addEventListener('click', function () { if (o.onPick) o.onPick(p.id); });
      g2.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && o.onPick) { e.preventDefault(); o.onPick(p.id); } });
      svg.appendChild(g2);
    });
    return svg;
  }

  /** Spalanie godzin: skumulowane zużycie, budżet, plan liniowy wg czasu umowy i prognoza wyczerpania. */
  function burn(p, now) {
    var W = 640, H = 300, L = 52, R = 16, T = 18, B = 36;
    var pw = W - L - R, ph = H - T - B;
    var start = Date.parse(p.createdAt) || (p.burn[0] && p.burn[0].t) || now.getTime();
    var first = p.burn.length ? Math.min(start, p.burn[0].t) : start;
    var end = Math.max(Date.parse(p.deadline) || 0, p.exhaustAt || 0, now.getTime() + 14 * 86400000);
    var maxV = nice(Math.max(p.planned * 1.15, p.used * 1.1, p.eac ? Math.min(p.eac, p.planned * 2) : 0, 10));
    var x = function (time) { return L + ((time - first) / (end - first)) * pw; };
    var y = function (v) { return T + ph - (clamp(v, 0, maxV) / maxV) * ph; };
    var svg = svgRoot(W, H, 'Spalanie godzin projektu ' + p.code, 'ch--burn');
    var defs = s('defs', {}, [s('linearGradient', { id: 'burn-fill', x1: 0, y1: 0, x2: 0, y2: 1 }, [s('stop', { offset: '0%', class: 'ch-stop-a' }), s('stop', { offset: '100%', class: 'ch-stop-b' })])]);
    svg.appendChild(defs);
    for (var g = 0; g <= maxV; g += maxV / 4) {
      svg.appendChild(s('line', { class: 'ch-grid', x1: L, y1: y(g), x2: L + pw, y2: y(g) }));
      svg.appendChild(t(L - 8, y(g) + 4, F.number(g), 'ch-axis', 'end'));
    }
    // oś czasu: miesiące
    var d = new Date(first); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + 1);
    var months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    var guard = 0;
    while (d.getTime() < end && guard < 40) {
      svg.appendChild(t(x(d.getTime()), H - 14, months[d.getMonth()], 'ch-axis', 'middle'));
      d.setMonth(d.getMonth() + 1); guard += 1;
    }
    // plan liniowy wg czasu umowy
    var dl = Date.parse(p.deadline);
    if (Number.isFinite(dl) && dl > start) svg.appendChild(s('line', { class: 'ch-plan', x1: x(start), y1: y(0), x2: x(dl), y2: y(p.planned) }));
    svg.appendChild(s('line', { class: 'ch-limit', x1: L, y1: y(p.planned), x2: L + pw, y2: y(p.planned) }));
    svg.appendChild(t(L + 6, y(p.planned) - 6, 'budżet ' + F.hours(p.planned), 'ch-note'));
    if (Number.isFinite(dl)) {
      svg.appendChild(s('line', { class: 'ch-deadline', x1: x(dl), y1: T, x2: x(dl), y2: T + ph }));
      svg.appendChild(t(x(dl) - 4, T + 12, 'termin', 'ch-note', 'end'));
    }
    // zużycie (tygodniowe punkty, krok „do tygodnia”)
    if (p.burn.length) {
      var pts = p.burn.map(function (b) { return [x(b.t + 7 * 86400000 > now.getTime() ? now.getTime() : b.t + 7 * 86400000), y(b.used)]; });
      pts.unshift([x(p.burn[0].t), y(0)]);
      var line = pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
      svg.appendChild(s('path', { class: 'ch-area', d: line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + y(0) + ' L' + pts[0][0].toFixed(1) + ' ' + y(0) + ' Z', fill: 'url(#burn-fill)' }));
      svg.appendChild(s('path', { class: 'ch-line', d: line }));
      var last = pts[pts.length - 1];
      // prognoza do wyczerpania budżetu
      if (p.exhaustAt) {
        svg.appendChild(s('line', { class: 'ch-forecast', x1: last[0], y1: last[1], x2: x(p.exhaustAt), y2: y(p.planned) }));
        svg.appendChild(s('circle', { class: 'ch-exhaust', cx: x(p.exhaustAt), cy: y(p.planned), r: 5 }));
        var ed = new Date(p.exhaustAt);
        svg.appendChild(t(clamp(x(p.exhaustAt), L + 60, L + pw - 4), y(p.planned) - 14, 'budżet wyczerpany ~' + ed.getDate() + ' ' + months[ed.getMonth()], 'ch-note ch-note--bad', clamp(x(p.exhaustAt), L + 60, L + pw - 4) > L + pw - 70 ? 'end' : 'middle'));
      }
      svg.appendChild(s('circle', { class: 'ch-now', cx: last[0], cy: last[1], r: 6 }));
      svg.appendChild(t(last[0] - 10, last[1] - 12, F.hours(p.used), 'ch-note ch-note--strong', 'end'));
    }
    svg.appendChild(s('line', { class: 'ch-today', x1: x(now.getTime()), y1: T, x2: x(now.getTime()), y2: T + ph }));
    return svg;
  }

  /** Słupki tygodniowe, warstwowo wg projektów. */
  function weekly(data, options) {
    var o = options || {};
    var W = 640, H = 260, L = 44, R = 12, T = 14, B = 34;
    var pw = W - L - R, ph = H - T - B;
    var n = data.labels.length;
    var maxV = nice(Math.max.apply(null, data.totals.concat([10])));
    var bw = pw / n;
    var y = function (v) { return T + ph - (v / maxV) * ph; };
    var svg = svgRoot(W, H, 'Godziny zapisane w kolejnych tygodniach', 'ch--weekly');
    for (var g = 0; g <= maxV; g += maxV / 4) {
      svg.appendChild(s('line', { class: 'ch-grid', x1: L, y1: y(g), x2: L + pw, y2: y(g) }));
      svg.appendChild(t(L - 8, y(g) + 4, F.number(g), 'ch-axis', 'end'));
    }
    data.labels.forEach(function (label, i) {
      var acc = 0;
      data.series.forEach(function (serie, k) {
        var v = serie.values[i];
        if (!v) return;
        var rect = s('rect', { class: 'ch-bar ch-c' + (k % 8), x: L + i * bw + bw * 0.16, width: bw * 0.68, y: y(acc + v), height: Math.max(0, y(acc) - y(acc + v) - 1), rx: 2, 'data-tooltip': serie.code + ': ' + F.hours(v) });
        svg.appendChild(rect);
        acc += v;
      });
      var d = new Date(label);
      if (i % 2 === (n - 1) % 2) svg.appendChild(t(L + i * bw + bw / 2, H - 14, d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0'), 'ch-axis', 'middle'));
      if (data.totals[i]) svg.appendChild(t(L + i * bw + bw / 2, y(data.totals[i]) - 5, F.number(data.totals[i]), 'ch-val', 'middle'));
    });
    return svg;
  }

  /** Pierścień z wartością w środku. */
  function ring(percent, options) {
    var o = options || {};
    var size = o.size || 96, stroke = o.stroke || 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var shown = clamp(percent, 0, 100);
    var svg = svgRoot(size, size, o.label || ('Zużycie ' + Math.round(percent) + '%'), 'ch--ring' + (o.tone ? ' ch-tone-' + o.tone : ''));
    svg.appendChild(s('circle', { class: 'ch-ring-track', cx: size / 2, cy: size / 2, r: r, 'stroke-width': stroke }));
    svg.appendChild(s('circle', { class: 'ch-ring-fill', cx: size / 2, cy: size / 2, r: r, 'stroke-width': stroke, 'stroke-dasharray': (c * shown / 100).toFixed(1) + ' ' + c.toFixed(1), transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')', 'stroke-linecap': 'round' }));
    svg.appendChild(t(size / 2, size / 2 + 6, Math.round(percent) + '%', 'ch-ring-t', 'middle'));
    return svg;
  }

  /** Minimalny wykres liniowy (sparkline) z wypełnieniem. */
  function spark(values, options) {
    var W = 120, H = 36, pad = 3;
    var max = Math.max.apply(null, values.concat([1]));
    var svg = svgRoot(W, H, (options && options.label) || 'Trend', 'ch--spark');
    var pts = values.map(function (v, i) { return [pad + (i / Math.max(1, values.length - 1)) * (W - pad * 2), H - pad - (v / max) * (H - pad * 2)]; });
    var line = pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
    svg.appendChild(s('path', { class: 'ch-area', d: line + ' L' + pts[pts.length - 1][0] + ' ' + H + ' L' + pts[0][0] + ' ' + H + ' Z' }));
    svg.appendChild(s('path', { class: 'ch-line', d: line }));
    var last = pts[pts.length - 1];
    svg.appendChild(s('circle', { class: 'ch-now', cx: last[0], cy: last[1], r: 3 }));
    return svg;
  }

  /** Pierścień podziałowy z legendą nie jest tu rysowany — legendę składa ekran. */
  function donut(items, options) {
    var size = 150, stroke = 22, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var total = items.reduce(function (acc, i) { return acc + i.value; }, 0) || 1;
    var svg = svgRoot(size, size, (options && options.label) || 'Podział godzin', 'ch--donut');
    svg.appendChild(s('circle', { class: 'ch-ring-track', cx: size / 2, cy: size / 2, r: r, 'stroke-width': stroke }));
    var offset = 0;
    items.forEach(function (item, k) {
      var len = (item.value / total) * c;
      svg.appendChild(s('circle', { class: 'ch-seg ch-s' + (k % 6), cx: size / 2, cy: size / 2, r: r, 'stroke-width': stroke, 'stroke-dasharray': Math.max(0, len - 2).toFixed(1) + ' ' + c.toFixed(1), 'stroke-dashoffset': (-offset).toFixed(1), transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')', 'data-tooltip': item.label + ': ' + F.hours(item.value) }));
      offset += len;
    });
    svg.appendChild(t(size / 2, size / 2 - 2, F.number(total), 'ch-ring-t', 'middle'));
    svg.appendChild(t(size / 2, size / 2 + 16, 'godzin', 'ch-note', 'middle'));
    return svg;
  }

  root.ETROM.Charts = { scatter: scatter, burn: burn, weekly: weekly, ring: ring, spark: spark, donut: donut };
})(typeof globalThis !== 'undefined' ? globalThis : this);
