/* ETROM Flow System — Gauge, Flow, Level i Marker.
   Jeden język pomiaru: wspólna grubość linii, wspólne znaczniki, wspólne cyfry.
   Gauge (miernik)  — gdzie jesteśmy między progami etapów, na tle planu.
   Flow  (przebieg) — tor etapów, ich stany i terminy.
   Level (stan)     — kondycja projektu jako poziom względem progów alarmu.
   Marker           — punkt na osi: teraz, plan, termin.
   Dane liczy src/core/insight.js; tu tylko rysujemy. Zasady: docs/DESIGN_SYSTEM.md. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Insight = E.Insight;
  var Model = E.Model;
  var Sig = E.Sig;
  var F = E.Format;

  /* ---------- Marker ---------- */

  var MARKER_SHAPES = {
    now: 'M1 1.5h8L5 8.5Z',            // grot ▽ — bieżące położenie (ten sam kształt co rzędna)
    deadline: 'M5 0.8L9.2 5L5 9.2L0.8 5Z' // romb — termin, kamień milowy
  };

  /**
   * Znacznik punktu na osi. Kształt niesie znaczenie, kolor tylko ostrzega.
   * @param {'now'|'plan'|'deadline'} kind
   * @param {{level?: string, tooltip?: string, filled?: boolean, class?: string, style?: Object}} [options]
   */
  function marker(kind, options) {
    var o = options || {};
    var level = o.level || 'normal';
    var body;
    if (kind === 'plan') {
      body = D.svg('circle', { cx: '5', cy: '5', r: '3.4', fill: 'none', 'stroke-width': '1.5' });
    } else {
      body = D.svg('path', {
        d: MARKER_SHAPES[kind],
        fill: kind === 'deadline' && !o.filled ? 'none' : 'currentColor',
        'stroke-width': kind === 'deadline' ? '1.5' : '1', 'stroke-linejoin': 'round'
      });
    }
    return D.el('span', {
      class: 'marker marker--' + kind + ' marker--' + level + (o.class ? ' ' + o.class : ''),
      style: o.style || null,
      attrs: { 'data-tooltip': o.tooltip || null, 'aria-hidden': 'true' }
    }, [D.svg('svg', { viewBox: '0 0 10 10', width: '10', height: '10', stroke: 'currentColor', focusable: 'false' }, [body])]);
  }

  /* ---------- Flow ---------- */

  // Odcinek węższy niż ~2% toru nie mieści numeru — numer zostaje w podpowiedzi.

  var STATE_TEXT = {
    done: 'zakończony', current: 'w toku', delayed: 'po terminie', blocked: 'wstrzymany',
    warning: 'termin wkrótce', upcoming: 'do wykonania'
  };

  function segmentLabel(seg) {
    var text = (seg.index + 1) + '. ' + seg.name + ' — ' + (seg.status === 'working' && seg.state !== 'delayed' && seg.state !== 'blocked' ? 'w toku' : STATE_TEXT[seg.state]);
    if (seg.status === 'working' && seg.state === 'delayed') text += ', w toku';
    if (seg.deadline && seg.status !== 'done') text += ', najbliższe zadanie ' + F.date(seg.deadline);
    return text + ', ' + F.hours(seg.hours);
  }

  /**
   * Tor przebiegu: etapy jako odcinki ∝ godzinom.
   *   compact — inspektor: tor z odczytem procentu (grot ▽ + liczba),
   *   mini    — sam tor, bez podpisów.
   * @param {Object} project
   * @param {{size?: 'compact'|'mini', now?: Date}} [options]
   */
  function flowTrack(project, options) {
    var o = options || {};
    var size = o.size || 'compact';
    var data = Insight.profile(project, o.now);

    if (!data.segments.length) {
      return D.el('div', { class: 'flow flow--' + size + ' flow--empty' }, [
        D.el('div', { class: 'flow__track' }),
        size !== 'mini' ? D.el('span', { class: 'flow__empty', text: 'Brak etapów' }) : null
      ]);
    }

    var segments = data.segments.map(function (seg) {
      var cls = 'flow__seg flow__seg--' + seg.status + ' flow__seg--' + seg.state + (seg.current ? ' is-current' : '');
      return D.el('span', {
        class: cls,
        style: { 'flex-grow': String(seg.weight), 'flex-basis': '0' },
        attrs: { 'data-tooltip': size === 'mini' ? null : segmentLabel(seg) },
        dataset: { stageId: seg.id }
      });
    });

    var reading = null;
    if (size === 'compact') {
      reading = D.el('span', { class: 'flow__reading', style: { '--at': data.percent + '%' }, attrs: { 'aria-hidden': 'true' } }, [
        D.el('span', { class: 'flow__value', text: data.percent + '%' }),
        marker('now', { class: 'flow__glyph' })
      ]);
    }

    var current = data.current ? Model.describeStage(data.current).name : '';
    var label = 'Przebieg: ' + data.done + ' z ' + data.total + ' etapów zakończonych, postęp ' + data.percent + '%'
      + (current ? ', bieżący etap: ' + current : '');

    return D.el('div', {
      class: 'flow flow--' + size + (data.percent >= 100 ? ' flow--complete' : ''),
      attrs: { role: 'img', 'aria-label': label }
    }, [
      reading,
      D.el('div', { class: 'flow__track' }, segments)
    ]);
  }

  /**
   * Stan projektu jako poziom względem progów. Zawsze: kształt + nazwa + powód, nigdy sam kolor.
   * @param {Object} project
   * @param {{now?: Date, size?: 'hero'|'compact'}} [options] compact — jeden szczebel (inspektor)
   */
  function level(project, options) {
    var o = options || {};
    var compact = o.size === 'compact';
    var l = Insight.ladder(project, o.now);

    if (compact) {
      var active = l.rungs.filter(function (r) { return r.active; })[0];
      return D.el('section', { class: 'level level--compact level--' + l.level, attrs: { 'aria-label': 'Stan projektu: ' + l.label } }, [
        D.el('p', { class: 'rung is-active rung--' + l.level }, [
          D.el('span', { class: 'rung__node' }, [Sig.datum(l.level, { size: 16, label: false })]),
          D.el('span', { class: 'rung__label', text: l.label })
        ]),
        l.reasons.length && !l.closed ? D.el('ul', { class: 'level__more' }, l.reasons.map(function (r) {
          return D.el('li', { class: 'reason--' + r.level, text: r.text });
        })) : (active && l.level === 'normal' ? D.el('p', { class: 'level__lead level__lead--calm', text: 'Terminy i zadania bez zaległości.' }) : null)
      ]);
    }

    return null;
  }

  root.ETROM.Flow = {
    marker: marker, flowTrack: flowTrack, level: level
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
