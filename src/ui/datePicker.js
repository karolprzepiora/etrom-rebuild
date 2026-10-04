/* ETROM — wybieracz dat: jeden dla całej aplikacji, po polsku, bez bibliotek.
   Pole daty to zwykły <input>, który pokazuje „pt 16 paź 2026”, a jego .value zostaje datą ISO (RRRR-MM-DD),
   więc formularze czytają je jak dawniej. Można wpisać „16.10”, „jutro”, „pn”, „+2t”; klik albo strzałka w dół
   otwiera kalendarz: tydzień od poniedziałku, numery tygodni, święta, skróty, obsługa z klawiatury.
   Obliczenia dat: core/calendar.js. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Cal = E.Calendar;

  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var MON_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  var DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  var DOW_LOW = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  var DOW_FULL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

  function todayIso() { return Cal.isoOf(new Date()); }

  /** „pt 16 paź 2026” — tak pole pokazuje datę. */
  function label(iso) {
    if (!iso) return '';
    var d = Cal.parse(iso);
    return DOW_LOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  }

  function parseText(text, base) { return Cal.parseInput(text, base || todayIso()); }

  /** Zawartość okna z kalendarzem. onPick(iso | '') wywoływane po wyborze. */
  function panelContent(o) {
    var start = o.value || todayIso();
    var view = { y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 };
    var focusKey = o.value || (start.slice(0, 7) === todayIso().slice(0, 7) ? todayIso() : view.y + '-' + (view.m < 9 ? '0' : '') + (view.m + 1) + '-01');
    var wrap = D.el('div', { class: 'dpk' });

    function shift(n) {
      view.m += n;
      while (view.m < 0) { view.m += 12; view.y -= 1; }
      while (view.m > 11) { view.m -= 12; view.y += 1; }
    }

    function pick(iso) { o.onPick(iso); }

    function quick(chip) {
      return D.el('button', { class: 'dpk__chip', attrs: { type: 'button', 'data-fk': 'dpk-q-' + chip.id }, text: chip.label, on: { click: function () { pick(chip.iso); } } });
    }

    function render() {
      var today = todayIso();
      var cells = Cal.monthGrid(view.y, view.m);
      var nextMon = Cal.addDays(Cal.mondayOf(today), 7);
      var chips = [
        { id: 'today', label: 'Dziś', iso: today },
        { id: 'tomorrow', label: 'Jutro', iso: Cal.addDays(today, 1) },
        { id: 'monday', label: 'Pon.', iso: nextMon },
        { id: 'week', label: '+1 tydz.', iso: Cal.addDays(today, 7) },
        { id: 'two', label: '+2 tyg.', iso: Cal.addDays(today, 14) }
      ];
      var nodes = [];
      nodes.push(D.el('div', { class: 'dpk__top' }, [
        D.el('span', { class: 'dpk__title', attrs: { 'aria-live': 'polite' }, text: MONTHS[view.m] + ' ' + view.y }),
        D.el('button', { class: 'dpk__nav', attrs: { type: 'button', 'aria-label': 'Poprzedni miesiąc', 'data-fk': 'dpk-prev' }, text: '‹', on: { click: function () { shift(-1); render(); } } }),
        D.el('button', { class: 'dpk__nav', attrs: { type: 'button', 'aria-label': 'Następny miesiąc', 'data-fk': 'dpk-next' }, text: '›', on: { click: function () { shift(1); render(); } } })
      ]));
      nodes.push(D.el('div', { class: 'dpk__chips' }, chips.map(quick)));
      var grid = D.el('div', { class: 'dpk__grid', attrs: { role: 'grid', 'aria-label': MONTHS[view.m] + ' ' + view.y } });
      grid.appendChild(D.el('span', { class: 'dpk__dow dpk__wk' }));
      DOW.forEach(function (n) { grid.appendChild(D.el('span', { class: 'dpk__dow', text: n })); });
      var monthKey = view.y + '-' + (view.m < 9 ? '0' : '') + (view.m + 1);
      var focusIn = focusKey.slice(0, 7) === monthKey ? focusKey : monthKey + '-01';
      for (var r = 0; r < 6; r += 1) {
        grid.appendChild(D.el('span', { class: 'dpk__wk', text: String(Cal.weekNumber(cells[r * 7])), attrs: { 'aria-hidden': 'true' } }));
        for (var c = 0; c < 7; c += 1) {
          (function (key, col) {
            var hol = Cal.holidayName(key);
            var out = key.slice(0, 7) !== monthKey;
            var cls = 'dpk__d' + (out ? ' is-out' : '') + (col > 4 ? ' is-we' : '') + (hol ? ' is-hol' : '') + (key === today ? ' is-today' : '') + (key === o.value ? ' is-sel' : '');
            var d = Cal.parse(key);
            grid.appendChild(D.el('button', {
              class: cls,
              attrs: {
                type: 'button', role: 'gridcell', tabindex: key === focusIn ? '0' : '-1', 'data-k': key, 'aria-selected': String(key === o.value),
                'aria-label': DOW_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + (hol ? ', ' + hol : ''),
                'data-tooltip': hol || null
              },
              text: String(d.getDate()),
              on: { click: function () { pick(key); } }
            }));
          })(cells[r * 7 + c], c);
        }
      }
      grid.addEventListener('keydown', function (e) {
        var cur = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-k');
        if (!cur) return;
        var next = null;
        if (e.key === 'ArrowLeft') next = Cal.addDays(cur, -1);
        else if (e.key === 'ArrowRight') next = Cal.addDays(cur, 1);
        else if (e.key === 'ArrowUp') next = Cal.addDays(cur, -7);
        else if (e.key === 'ArrowDown') next = Cal.addDays(cur, 7);
        else if (e.key === 'Home') next = Cal.mondayOf(cur);
        else if (e.key === 'End') next = Cal.addDays(Cal.mondayOf(cur), 6);
        else if (e.key === 'PageUp' || e.key === 'PageDown') {
          var dt = Cal.parse(cur);
          var target = new Date(dt.getFullYear(), dt.getMonth() + (e.key === 'PageDown' ? 1 : -1), 1);
          var last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
          next = Cal.isoOf(new Date(target.getFullYear(), target.getMonth(), Math.min(dt.getDate(), last)));
        }
        if (!next) return;
        e.preventDefault();
        e.stopPropagation();
        focusKey = next;
        view.y = Number(next.slice(0, 4));
        view.m = Number(next.slice(5, 7)) - 1;
        render();
        var el = wrap.querySelector('[data-k="' + next + '"]');
        if (el) el.focus();
      });
      nodes.push(grid);
      var hint = o.value ? (Cal.holidayName(o.value) || (Cal.isWeekend(o.value) ? 'Weekend' : 'Dzień roboczy')) : 'Bez terminu';
      nodes.push(D.el('div', { class: 'dpk__foot' }, [
        D.el('span', { class: 'dpk__hint', text: o.value ? label(o.value) + ' · ' + hint : hint }),
        o.allowClear === false ? null : D.el('button', { class: 'dpk__clear', attrs: { type: 'button', 'data-fk': 'dpk-clear' }, text: 'Bez terminu', on: { click: function () { pick(''); } } })
      ]));
      wrap.replaceChildren.apply(wrap, nodes.filter(Boolean));
    }
    render();
    return wrap;
  }

  /** Otwiera kalendarz przy elemencie. opts: {anchor, value, onPick, label, allowClear}. */
  function open(opts) {
    var handle = null;
    var content = panelContent({
      value: opts.value || '', allowClear: opts.allowClear,
      onPick: function (iso) { if (handle) handle.close(); opts.onPick(iso); }
    });
    handle = E.Menu.open({ anchor: opts.anchor, content: content, label: opts.label || 'Wybierz datę', className: 'popover--date', minWidth: '19.5rem' });
    return handle;
  }

  /** Zamienia pole w pole daty z kalendarzem; .value dalej jest ISO. */
  function enhance(input, opts) {
    var o = opts || {};
    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    var iso = '';
    input.setAttribute('type', 'text');
    input.setAttribute('inputmode', 'text');
    input.setAttribute('placeholder', input.getAttribute('placeholder') || 'np. jutro, 16.10, +2t');
    input.classList.add('input--date');
    input.setAttribute('autocomplete', 'off');

    function show() { desc.set.call(input, label(iso)); }
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return iso; },
      set: function (v) {
        var next = parseText(v);
        iso = next === null ? '' : next;
        show();
      }
    });
    var initial = parseText(input.getAttribute('value'));
    iso = initial || '';
    show();

    function commit() {
      var typed = desc.get.call(input);
      if (typed === label(iso)) { input.setAttribute('aria-invalid', input.getAttribute('aria-invalid') === 'true' && !iso ? 'true' : 'false'); return; }
      var parsed = parseText(typed);
      if (parsed === null) {
        input.setAttribute('aria-invalid', 'true');
        show();
        return;
      }
      iso = parsed;
      show();
      input.setAttribute('aria-invalid', 'false');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function openPicker() {
      open({
        anchor: input, value: iso, label: o.label || 'Wybierz datę', allowClear: o.allowClear,
        onPick: function (picked) {
          iso = picked;
          show();
          input.setAttribute('aria-invalid', 'false');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.focus({ preventScroll: true });
        }
      });
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var wasTyped = desc.get.call(input) !== label(iso); commit(); if (wasTyped) e.preventDefault(); }
      else if (e.key === 'ArrowDown' || (e.key === 'F4')) { e.preventDefault(); commit(); openPicker(); }
      else if (e.key === 'ArrowUp' && (e.altKey)) { e.preventDefault(); }
    });
    input.addEventListener('focus', function () { window.setTimeout(function () { try { input.select(); } catch (err) { /* brak */ } }, 0); });
    input.addEventListener('click', function () { openPicker(); });
    input.__openDatePicker = openPicker;
    return input;
  }

  E.DatePicker = { enhance: enhance, open: open, parseText: parseText, label: label };
})(typeof globalThis !== 'undefined' ? globalThis : this);
