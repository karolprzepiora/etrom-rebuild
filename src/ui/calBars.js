/* ETROM — wspólne elementy kalendarzy (Kalendarz i Urlopy): tydzień jako wiersz kafli z ciągłymi paskami nieobecności
   (jeden pasek na cały zakres, z podpisem), pasy tygodnia w widoku Tydzień oraz paski dni w widoku Rok.
   Rodzaje nieobecności: leave (urlop), req (wniosek czeka na decyzję), sick (L4), other (szkolenie, inna). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Cal = E.Calendar;

  var TEXT = { leave: 'urlop', req: 'wniosek (czeka)', sick: 'L4', other: 'nieobecność' };

  /** Rodzaj paska z danych nieobecności: pending → req, urlop → leave, zwolnienie → sick, reszta → other. */
  function kindOf(absKind, pending) {
    if (pending) return 'req';
    if (absKind === 'leave') return 'leave';
    if (absKind === 'sick') return 'sick';
    return 'other';
  }

  /** Układa paski w pasach (lanes): zwraca liczbę pasów, każdemu paskowi nadaje lane. */
  function layout(segs) {
    var lanes = [];
    segs.sort(function (a, b) { return a.c1 - b.c1 || b.c2 - a.c2; }).forEach(function (s) {
      var i = 0;
      while (lanes[i] && lanes[i].some(function (o) { return !(s.c2 <= o.c1 || s.c1 >= o.c2); })) i += 1;
      (lanes[i] = lanes[i] || []).push(s);
      s.lane = i;
    });
    return lanes.length;
  }

  /** Paski przycięte do tygodnia (7 kluczy dat): [{ b, c1, c2, cutL, cutR }]. */
  function clip(bars, keys) {
    var first = keys[0];
    var last = keys[6];
    var out = [];
    (bars || []).forEach(function (b) {
      var f = b.from > first ? b.from : first;
      var t = b.to < last ? b.to : last;
      if (f > t) return;
      out.push({ b: b, c1: keys.indexOf(f) + 1, c2: keys.indexOf(t) + 2, cutL: b.from < first, cutR: b.to > last });
    });
    return out;
  }

  function barNode(s, lane) {
    var b = s.b;
    var kids = [D.el('span', { class: 'cb-bar__t truncate', text: b.label })];
    if (b.sub && !s.cutL) kids.push(D.el('small', { class: 'cb-bar__s truncate', text: b.sub }));
    var attrs = { 'data-tooltip': b.tip || null, 'aria-label': b.tip || b.label, 'data-fk': b.fk || null, type: b.onClick ? 'button' : null };
    return D.el(b.onClick ? 'button' : 'div', {
      class: 'cb-bar cv-ev is-' + b.kind + (s.cutL ? ' is-cutL' : '') + (s.cutR ? ' is-cutR' : ''),
      style: { 'grid-column': s.c1 + ' / ' + s.c2, 'grid-row': String(lane + 2) },
      attrs: attrs, on: b.onClick ? { click: function (e) { e.stopPropagation(); b.onClick(); } } : null
    }, kids);
  }

  /** Jeden tydzień miesiąca: kafle dni (tło + numer), pod numerem paski nieobecności, niżej karteczki wydarzeń.
      o: { days: [{ key, day, out, weekend, holiday, today }], bars, tile(day) → { cls, attrs, onClick }, events(day) → [node], minH } */
  function weekRow(o) {
    var days = o.days;
    var keys = days.map(function (d) { return d.key; });
    var segs = clip(o.bars, keys);
    var L = layout(segs);
    var row = D.el('div', { class: 'cb-wk', style: { 'grid-template-rows': 'auto ' + (L ? 'repeat(' + L + ', 24px) ' : '') + 'minmax(' + (o.minH || '3.6rem') + ', auto)' } });
    days.forEach(function (d, i) {
      var t = o.tile ? o.tile(d) || {} : {};
      row.appendChild(D.el('div', {
        class: 'cb-bg' + (d.out ? ' is-out' : '') + (d.weekend ? ' is-weekend' : '') + (d.holiday ? ' is-hol' : '') + (d.today ? ' is-today' : '') + (t.cls ? ' ' + t.cls : ''),
        style: { 'grid-column': String(i + 1), 'grid-row': '1 / ' + (L + 3) },
        attrs: d.out ? { 'aria-hidden': 'true' } : (t.attrs || {}), on: d.out ? null : (t.on || (t.onClick ? { click: t.onClick } : null))
      }));
      if (d.out) return;
      row.appendChild(D.el('div', { class: 'cb-num' + (d.weekend ? ' is-weekend' : '') + (d.today ? ' is-today' : ''), style: { 'grid-column': String(i + 1) } }, [
        D.el('span', { text: String(d.day) }), d.holiday ? D.el('small', { class: 'cb-hol truncate', text: d.holiday }) : null
      ]));
    });
    segs.forEach(function (s) { row.appendChild(barNode(s, s.lane)); });
    days.forEach(function (d, i) {
      if (d.out || !o.events) return;
      var nodes = o.events(d);
      if (nodes && nodes.length) row.appendChild(D.el('div', { class: 'cb-evs', style: { 'grid-column': String(i + 1), 'grid-row': String(L + 2) } }, nodes));
    });
    return row;
  }

  /** Pasy nieobecności nad kolumnami tygodnia (widok Tydzień). */
  function lanes(bars, keys) {
    var segs = clip(bars, keys);
    if (!segs.length) return null;
    layout(segs);
    var box = D.el('div', { class: 'cb-lanes' });
    segs.forEach(function (s) { box.appendChild(barNode(s, s.lane - 1)); });
    return box;
  }

  /** Klasy paska dni w siatce roku: kindAt(key) → rodzaj albo null. Zwraca ' is-k-X is-s is-e' (początek i koniec ciągu). */
  function stripCls(kindAt, key) {
    var k = kindAt(key);
    if (!k) return '';
    var prev = kindAt(Cal.addDays(key, -1));
    var next = kindAt(Cal.addDays(key, 1));
    return ' is-strip is-k-' + k + (prev === k ? '' : ' is-s') + (next === k ? '' : ' is-e');
  }

  /** Najważniejszy rodzaj spośród kilku (L4 przed urlopem, urlop przed wnioskiem). */
  function top(kinds) {
    var order = ['sick', 'leave', 'req', 'other'];
    for (var i = 0; i < order.length; i += 1) if (kinds.indexOf(order[i]) >= 0) return order[i];
    return null;
  }

  /** Jedna linia objaśnień pod rokiem: [[klasa, tekst], …]. */
  function legend(items) {
    return D.el('ul', { class: 'cb-legend' }, items.map(function (x) {
      return D.el('li', null, [D.el('i', { class: 'cb-sw ' + x[0], attrs: { 'aria-hidden': 'true' } }), D.el('span', { text: x[1] })]);
    }));
  }

  E.CalBars = { kindOf: kindOf, weekRow: weekRow, lanes: lanes, stripCls: stripCls, top: top, legend: legend, TEXT: TEXT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
