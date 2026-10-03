/* ETROM — wykresy w czystym SVG (bez bibliotek). Wykresy o zmiennej szerokości (scatter, burn,
   weekly, …) są rysowane w prawdziwych pikselach kontenera (fit + ResizeObserver), więc
   czcionki mają zawsze stały rozmiar, a nie skalują się razem z ekranem. Kolory przez klasy (styles/analysis.css),
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
    var node = s('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, class: 'ch ' + (cls || ''), role: 'img', 'aria-label': label });
    return node;
  }
  /** Hostuje wykres rysowany dla aktualnej szerokości kontenera; przerysowuje przy zmianie rozmiaru. */
  function fit(draw) {
    var host = D.el('div', { class: 'ch-host' });
    var last = 0;
    function paint() {
      var w = Math.round(host.getBoundingClientRect().width);
      if (!w || w === last) return;
      last = w;
      while (host.firstChild) host.removeChild(host.firstChild);
      host.appendChild(draw(w));
    }
    if (typeof ResizeObserver !== 'undefined') {
      var pending = 0;
      var ro = new ResizeObserver(function () {
        if (pending) return;
        pending = window.requestAnimationFrame(function () { pending = 0; paint(); });
      });
      ro.observe(host);
    } else window.addEventListener('resize', paint);
    window.requestAnimationFrame(paint);
    return host;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function nice(max) {
    var steps = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 2000, 2500, 5000, 10000];
    for (var i = 0; i < steps.length; i += 1) if (max <= steps[i] * 4) return steps[i] * 4;
    return Math.ceil(max / 4 / 1000) * 4000;
  }

  /** Mapa projektów: oś X — postęp rzeczowy, oś Y — zużycie budżetu; powyżej przekątnej wydajemy szybciej niż robimy. */
  function scatter(projects, options) { return fit(function (W) { return drawScatter(projects, options, W); }); }
  function drawScatter(projects, options, W) {
    var o = options || {};
    var H = Math.round(clamp(W * 0.62, 280, 420)), L = 44, R = 34, T = 14, B = 40;
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
    svg.appendChild(t(L + 6, y(100) - 6, 'budżet 100%', 'ch-note'));
    if (pw > 300) svg.appendChild(t(L + 8, T + 14, 'wydajemy szybciej, niż robimy', 'ch-note ch-note--bad'));
    svg.appendChild(t(L + pw / 2, H - 4, 'Postęp rzeczowy →', 'ch-label', 'middle'));
    svg.appendChild(t(L - 8, T - 2, 'budżet', 'ch-label', 'end'));

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
  function burn(p, now) { return fit(function (W) { return drawBurn(p, now, W); }); }
  function drawBurn(p, now, W) {
    var H = Math.round(clamp(W * 0.42, 230, 320)), L = 44, R = 14, T = 16, B = 32;
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
  function weekly(data, options) { return fit(function (W) { return drawWeekly(data, options, W); }); }
  function drawWeekly(data, options, W) {
    var o = options || {};
    var H = Math.round(clamp(W * 0.34, 190, 250)), L = 38, R = 8, T = 16, B = 30;
    var pw = W - L - R, ph = H - T - B;
    var n = data.labels.length;
    var maxV = nice(Math.max.apply(null, data.totals.concat([10])));
    var bw = pw / n;
    var step = bw >= 36 ? 1 : (bw >= 22 ? 2 : 3);
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
      if ((n - 1 - i) % step === 0) svg.appendChild(t(L + i * bw + bw / 2, H - 14, d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0'), 'ch-axis', 'middle'));
      if (bw >= 26 && data.totals[i]) svg.appendChild(t(L + i * bw + bw / 2, y(data.totals[i]) - 5, F.number(data.totals[i]), 'ch-val', 'middle'));
    });
    if (o.average !== false && n >= 5) {
      var pts = data.totals.map(function (v, i) {
        var from = Math.max(0, i - 3), cnt = i - from + 1, acc = 0;
        for (var k = from; k <= i; k += 1) acc += data.totals[k];
        return [L + i * bw + bw / 2, y(acc / cnt)];
      });
      svg.appendChild(s('path', { class: 'ch-avg', d: pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ') }));
      svg.appendChild(t(L + pw - 2, T - 4, 'średnia krocząca 4 tyg.', 'ch-note', 'end'));
    }
    return svg;
  }

  /** Oś czasu projektów: od założenia do terminu umowy, wypełnienie = postęp rzeczowy, linia = dziś. */
  function timeline(projects, now, options) { return fit(function (W) { return drawTimeline(projects, now, options, W); }); }
  function drawTimeline(projects, now, options, W) {
    var o = options || {};
    var narrow = W < 520;
    var rowH = narrow ? 40 : 30, T = 22, B = 6, L = narrow ? 6 : 168, R = 10;
    var rows = projects.filter(function (p) { return p.start !== null && p.end !== null && p.end > p.start; });
    var H = T + B + rows.length * rowH;
    var pw = W - L - R;
    var nowMs = now.getTime();
    var min = Math.min.apply(null, rows.map(function (p) { return p.start; }).concat([nowMs - 14 * 86400000]));
    var max = Math.max.apply(null, rows.map(function (p) { return p.end; }).concat([nowMs + 21 * 86400000]));
    var x = function (time) { return L + ((time - min) / (max - min)) * pw; };
    var svg = svgRoot(W, Math.max(H, 60), 'Oś czasu projektów', 'ch--timeline');
    var months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    var d = new Date(min); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + 1);
    var span = (max - min) / 86400000 / 30, every = span > 20 ? 3 : (span > 10 ? 2 : 1), n = 0, guard = 0;
    while (d.getTime() < max && guard < 60) {
      if (n % every === 0) {
        svg.appendChild(s('line', { class: 'ch-grid', x1: x(d.getTime()), y1: T - 4, x2: x(d.getTime()), y2: H - B }));
        svg.appendChild(t(x(d.getTime()) + 3, 12, months[d.getMonth()] + (d.getMonth() === 0 ? ' ' + d.getFullYear() : ''), 'ch-axis'));
      }
      d.setMonth(d.getMonth() + 1); n += 1; guard += 1;
    }
    rows.forEach(function (p, i) {
      var y0 = T + i * rowH;
      var barY = narrow ? y0 + 20 : y0 + 8, barH = 12;
      var label = p.code + ' ' + p.name;
      var maxChars = narrow ? Math.floor(pw / 6.2) : 26;
      var g = s('g', { class: 'ch-row ch-v-' + p.verdict, tabindex: '0', role: 'button', 'data-tooltip': p.code + ' ' + p.name + ' — postęp ' + Math.round(p.earnedPct) + '%, budżet ' + Math.round(p.usagePct) + '%', 'aria-label': p.code + ' ' + p.name + ', postęp ' + Math.round(p.earnedPct) + ' procent' });
      g.appendChild(s('rect', { class: 'ch-row-hit', x: 0, y: y0, width: W, height: rowH }));
      g.appendChild(t(narrow ? L : 4, narrow ? y0 + 13 : barY + 10, label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label, 'ch-note ch-note--strong'));
      g.appendChild(s('rect', { class: 'ch-tl-track', x: x(p.start), y: barY, width: Math.max(2, x(p.end) - x(p.start)), height: barH, rx: 6 }));
      g.appendChild(s('rect', { class: 'ch-tl-fill', x: x(p.start), y: barY, width: Math.max(0, (x(p.end) - x(p.start)) * clamp(p.earnedPct, 0, 100) / 100), height: barH, rx: 6 }));
      if (p.end < nowMs && p.status !== 'done') g.appendChild(s('rect', { class: 'ch-tl-late', x: x(p.end), y: barY, width: Math.max(2, x(nowMs) - x(p.end)), height: barH, rx: 3 }));
      var ed = new Date(p.end);
      g.appendChild(t(Math.min(W - 4, x(Math.max(p.end, p.end < nowMs ? nowMs : p.end)) + 6), barY + 10, ed.getDate() + ' ' + months[ed.getMonth()], 'ch-note', x(p.end) + 40 > W ? 'end' : 'start'));
      g.addEventListener('click', function () { if (o.onPick) o.onPick(p.id); });
      g.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && o.onPick) { e.preventDefault(); o.onPick(p.id); } });
      svg.appendChild(g);
    });
    svg.appendChild(s('line', { class: 'ch-today', x1: x(nowMs), y1: T - 4, x2: x(nowMs), y2: H - B }));
    svg.appendChild(t(x(nowMs), H + 10, 'dziś', 'ch-note ch-note--strong', 'middle'));
    svg.setAttribute('height', H + 16); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (H + 16));
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

  root.ETROM.Charts = { fit: fit, clamp: clamp, nice: nice, s: s, t: t, svgRoot: svgRoot, scatter: scatter, burn: burn, weekly: weekly, timeline: timeline, ring: ring, spark: spark, donut: donut };
})(typeof globalThis !== 'undefined' ? globalThis : this);
