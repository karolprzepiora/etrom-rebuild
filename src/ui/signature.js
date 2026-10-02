/* ETROM — sygnatury języka wizualnego.
   Rzędna ▽ (znak stanu), profil przebiegu (etapy ważone godzinami)
   i linijka czasu umowy. Każdy element występuje w kilku skalach,
   zawsze z tym samym znaczeniem. Zasady: docs/ART_DIRECTION.md. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Insight = E.Insight;
  var Model = E.Model;
  var F = E.Format;

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

  /* ---------- Profil przebiegu ---------- */

  function segmentLabel(seg) {
    return (seg.index + 1) + '. ' + seg.name + ' — ' + Model.STAGE_STATUS[seg.status]
      + (seg.overdue ? ', po terminie' : '') + ', ' + F.hours(seg.hours);
  }

  /**
   * @param {Object} project
   * @param {{size?: 'micro'|'card'|'macro', now?: Date, onSegment?: Function, from?: number}} [options]
   */
  function profile(project, options) {
    var settings = options || {};
    var size = settings.size || 'micro';
    var data = Insight.profile(project, settings.now);
    var interactive = typeof settings.onSegment === 'function';

    if (!data.segments.length) {
      return D.el('div', { class: 'profile profile--' + size + ' profile--empty' }, [
        D.el('div', { class: 'profile__track' }),
        size !== 'micro' ? D.el('span', { class: 'profile__empty', text: 'Brak etapów' }) : null
      ]);
    }

    var segments = data.segments.map(function (seg) {
      var cls = 'profile__seg profile__seg--' + seg.status
        + (seg.overdue ? ' profile__seg--overdue' : '')
        + (seg.current ? ' profile__seg--current' : '');
      var attrs = {
        'data-tooltip': size === 'micro' ? null : segmentLabel(seg),
        'aria-label': interactive ? segmentLabel(seg) : null,
        type: interactive ? 'button' : null
      };
      var children = size === 'macro' ? [D.el('span', { class: 'profile__no', text: String(seg.index + 1), attrs: { 'aria-hidden': 'true' } })] : null;
      return D.el(interactive ? 'button' : 'span', {
        class: cls,
        style: { 'flex-grow': String(seg.weight), 'flex-basis': '0' },
        attrs: attrs,
        dataset: { stageId: seg.id },
        on: interactive ? { click: function () { settings.onSegment(seg.id); } } : null
      }, children);
    });

    var percent = data.percent;
    var marker = null;
    if (size !== 'micro') {
      var from = typeof settings.from === 'number' ? settings.from : percent;
      marker = D.el('span', {
        class: 'profile__marker',
        style: { '--at': from + '%' },
        dataset: { to: String(percent) },
        attrs: { 'aria-hidden': 'true' }
      }, [
        size === 'macro'
          ? D.el('span', { class: 'profile__value' }, [D.el('span', { class: 'profile__number', text: String(from), dataset: { count: String(percent) } }), D.el('span', { class: 'profile__unit', text: '%' })])
          : D.el('span', { class: 'profile__value', text: percent + '%' }),
        D.el('span', { class: 'profile__glyph' }, [D.svg('svg', { viewBox: '0 0 12 10', width: '12', height: '10' }, [D.svg('path', { d: 'M1 1h10L6 9Z' })])])
      ]);
    }

    var current = data.current ? Model.describeStage(data.current).name : '';
    var description = 'Przebieg: ' + data.done + ' z ' + data.total + ' etapów zakończonych, postęp ' + percent + '%'
      + (current ? ', bieżący etap: ' + current : '');

    return D.el('div', {
      class: 'profile profile--' + size + (percent >= 100 ? ' profile--complete' : ''),
      attrs: { role: interactive ? 'group' : 'img', 'aria-label': description },
      style: { '--percent': percent + '%' }
    }, [
      marker,
      D.el('div', { class: 'profile__track' }, segments)
    ]);
  }

  /** Po wstawieniu do DOM przesuwa znacznik i liczbę ze starej wartości na nową. */
  function settle(container) {
    var markers = container.querySelectorAll('.profile__marker[data-to]');
    Array.prototype.forEach.call(markers, function (marker) {
      var to = Number(marker.dataset.to);
      var number = marker.querySelector('[data-count]');
      var from = number ? Number(number.textContent) : to;
      if (from === to || E.Motion.prefersReducedMotion()) {
        marker.style.setProperty('--at', to + '%');
        if (number) number.textContent = String(to);
        return;
      }
      window.requestAnimationFrame(function () {
        marker.style.setProperty('--at', to + '%');
        if (number) E.Motion.countTo(number, from, to);
      });
    });
  }

  /* ---------- Linijka czasu umowy ---------- */

  /**
   * Od założenia projektu do terminu umowy, z kreską „dziś”.
   * Leży pod profilem w tej samej skali: rozjazd znacznika i kreski to opóźnienie.
   */
  function timeRuler(project, now) {
    var plan = Insight.schedule(project, now);
    if (!plan || project.status === 'done') return null;
    var at = Math.min(1, plan.elapsed) * 100;
    var over = plan.daysLeft < 0;
    var start = new Date(project.createdAt);
    var startIso = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');

    return D.el('div', {
      class: 'ruler' + (over ? ' ruler--over' : '') + (plan.lag >= 15 && !over ? ' ruler--lag' : ''),
      style: { '--at': at + '%' },
      attrs: { role: 'img', 'aria-label': 'Czas umowy: minęło ' + Math.round(plan.elapsed * 100) + '%, ' + (over ? 'termin minął' : 'do terminu ' + plan.daysLeft + ' dni') }
    }, [
      D.el('div', { class: 'ruler__line' }, [D.el('span', { class: 'ruler__elapsed' }), D.el('span', { class: 'ruler__today' })]),
      D.el('div', { class: 'ruler__labels' }, [
        D.el('span', { text: F.date(startIso) }),
        over ? null : D.el('span', { class: 'ruler__now', text: 'Dziś, ' + Math.round(plan.elapsed * 100) + '% czasu' }),
        D.el('span', { class: 'ruler__end', text: over ? 'Termin minął ' + F.date(project.deadline) : 'Termin ' + F.date(project.deadline) })
      ])
    ]);
  }

  root.ETROM.Sig = { datum: datum, profile: profile, settle: settle, timeRuler: timeRuler };
})(typeof globalThis !== 'undefined' ? globalThis : this);
