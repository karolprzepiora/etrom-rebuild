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

  /* ---------- Gauge ---------- */

  function lagInfo(g) {
    if (g.lag === null) return null;
    var lag = Math.round(g.lag);
    if (lag >= 1) {
      return {
        text: 'Zaległość ' + lag + ' p.p. wobec planu',
        level: lag >= Insight.LAG_ALARM ? 'alarm' : (lag >= Insight.LAG_WARNING ? 'warning' : 'normal')
      };
    }
    if (lag <= -1) return { text: 'Przed planem o ' + (-lag) + ' p.p.', level: 'normal' };
    return { text: 'Zgodnie z planem', level: 'normal' };
  }

  /**
   * Pas planu: postęp prac na torze etapów, z planem na dziś (czas umowy, który już minął)
   * i odległością od planu. Jedna skala, jedno miejsce na termin umowy — pod torem.
   * @param {Object} project
   * @param {{now?: Date, from?: number, stage?: Node, onStage?: Function, onDetail?: Function}} [options]
   */
  function planBar(project, options) {
    var o = options || {};
    var g = Insight.gauge(project, o.now);
    var from = typeof o.from === 'number' ? o.from : g.percent;
    var lag = lagInfo(g);
    var plan = project.status !== 'done' ? Insight.schedule(project, o.now) : null;

    var track = flowTrack(project, {
      size: 'hero', now: o.now, onSegment: o.onStage,
      plan: g.expected !== null ? { at: g.expected, percent: g.percent, level: lag ? lag.level : 'normal' } : null
    });

    var lagNode = null;
    if (lag) {
      var kids = [
        D.el('span', { class: 'planbar__plan t-num', text: 'Plan na dziś ' + g.expected + '%' }),
        D.el('span', { class: 'planbar__lag-text', text: lag.text })
      ];
      lagNode = typeof o.onDetail === 'function'
        ? D.el('button', {
            class: 'planbar__lag planbar__lag--' + lag.level,
            attrs: { type: 'button', 'aria-label': 'Plan na dziś ' + g.expected + '%, ' + lag.text + '. Pokaż plan i odchylenia.', 'data-tooltip': 'Plan i odchylenia', 'data-fk': 'gauge-detail' },
            on: { click: o.onDetail }
          }, kids)
        : D.el('span', { class: 'planbar__lag planbar__lag--' + lag.level }, kids);
    }

    var axis = null;
    if (plan && project.deadline) {
      var over = plan.daysLeft < 0;
      var start = new Date(project.createdAt);
      var startIso = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');
      var left = over ? 'minął ' + F.count(-plan.daysLeft, 'dzień', 'dni', 'dni') + ' temu'
        : (plan.daysLeft === 0 ? 'dziś' : 'za ' + F.count(plan.daysLeft, 'dzień', 'dni', 'dni'));
      axis = D.el('div', { class: 'planbar__axis planbar__axis--' + (over ? 'alarm' : (plan.daysLeft <= 7 ? 'warning' : 'normal')) }, [
        D.el('span', { class: 'planbar__start t-num', text: 'Start ' + F.date(startIso, { year: 'always' }) }),
        D.el('span', { class: 'planbar__end' }, [
          marker('deadline', { level: over ? 'alarm' : 'normal', filled: over }),
          D.el('span', { class: 't-num', text: 'Termin umowy ' + F.date(project.deadline, { year: 'always' }) + ' · ' + left })
        ])
      ]);
    }

    return D.el('div', {
      class: 'planbar' + (g.percent >= 100 ? ' planbar--complete' : ''),
      attrs: { role: 'group', 'aria-label': 'Postęp ' + g.percent + '%' + (g.expected !== null ? ', plan na dziś ' + g.expected + '% (' + lag.text.toLowerCase() + ')' : '') },
      dataset: { percent: String(g.percent) }
    }, [
      D.el('div', { class: 'planbar__head' }, [
        D.el('div', { class: 'planbar__read' }, [
          D.el('span', { class: 'planbar__value' }, [
            D.el('span', { class: 'planbar__number', text: String(from), dataset: { count: String(g.percent) } }),
            D.el('span', { class: 'planbar__unit', text: '%' })
          ]),
          D.el('span', { class: 'planbar__caption', text: g.stages.length ? 'postępu prac' : 'brak etapów' })
        ]),
        o.stage || null,
        lagNode
      ]),
      track,
      axis
    ]);
  }

  /** Po wstawieniu do DOM liczba postępu dojeżdża ze starej wartości do nowej. */
  function settle(container) {
    var bars = container.querySelectorAll('.planbar[data-percent]');
    Array.prototype.forEach.call(bars, function (el) {
      var to = Number(el.dataset.percent);
      var number = el.querySelector('[data-count]');
      var from = number ? Number(number.textContent) : to;
      if (!number || from === to || E.Motion.prefersReducedMotion()) {
        if (number) number.textContent = String(to);
        return;
      }
      window.requestAnimationFrame(function () { E.Motion.countTo(number, from, to); });
    });
  }

  /* ---------- Flow ---------- */

  // Odcinek węższy niż ~2% toru nie mieści numeru — numer zostaje w podpowiedzi.
  var TINY = 0.022;

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
   *   hero    — nagłówek projektu: numery, znaczniki terminów, odcinki są przyciskami,
   *   compact — karta i inspektor: tor z odczytem procentu (grot ▽ + liczba),
   *   mini    — wiersz listy: sam tor, bez podpisów.
   * @param {Object} project
   * @param {{size?: 'hero'|'compact'|'mini', now?: Date, onSegment?: Function}} [options]
   */
  function flowTrack(project, options) {
    var o = options || {};
    var size = o.size || 'hero';
    var hero = size === 'hero';
    var data = Insight.profile(project, o.now);
    var interactive = hero && typeof o.onSegment === 'function';

    if (!data.segments.length) {
      return D.el('div', { class: 'flow flow--' + size + ' flow--empty' }, [
        D.el('div', { class: 'flow__track' }),
        size !== 'mini' ? D.el('span', { class: 'flow__empty', text: 'Brak etapów' }) : null
      ]);
    }

    var marks = [];
    var segments = data.segments.map(function (seg) {
      if (hero && seg.deadline && (seg.state === 'delayed' || seg.state === 'warning' || seg.overdue)) {
        marks.push(marker('deadline', {
          level: seg.overdue ? 'alarm' : 'warning', filled: seg.overdue,
          style: { left: Math.min(100, (seg.start + seg.weight) * 100) + '%' },
          tooltip: (seg.overdue ? 'Zadanie w etapie po terminie: ' : 'Najbliższe zadanie w etapie: ') + F.date(seg.deadline) + ' — ' + seg.name,
          class: 'flow__mark'
        }));
      }
      var stageObj = (project.stages || []).filter(function (st) { return st.id === seg.id; })[0];
      var late = stageObj && E.Tasks ? E.Tasks.taskStats(stageObj.tasks || [], o.now).overdue : 0;
      var cls = 'flow__seg flow__seg--' + seg.status + ' flow__seg--' + seg.state + (seg.current ? ' is-current' : '') + (hero && late ? ' has-late' : '');
      if (hero) cls += seg.weight < TINY ? (seg.current ? ' is-sliver' : ' is-tiny') : '';
      return D.el(interactive ? 'button' : 'span', {
        class: cls,
        style: { 'flex-grow': String(seg.weight), 'flex-basis': '0' },
        attrs: {
          'data-tooltip': size === 'mini' ? null : segmentLabel(seg) + (late ? ', zadań po terminie: ' + late : ''),
          'aria-label': interactive ? segmentLabel(seg) : null, type: interactive ? 'button' : null,
          'aria-current': hero && seg.current ? 'step' : null
        },
        dataset: { stageId: seg.id },
        on: interactive ? { click: function () { o.onSegment(seg.id); } } : null
      }, hero ? [D.el('span', { class: 'flow__no', text: String(seg.index + 1), attrs: { 'aria-hidden': 'true' } })] : null);
    });

    var reading = null;
    if (size === 'compact') {
      reading = D.el('span', { class: 'flow__reading', style: { '--at': data.percent + '%' }, attrs: { 'aria-hidden': 'true' } }, [
        D.el('span', { class: 'flow__value', text: data.percent + '%' }),
        marker('now', { class: 'flow__glyph' })
      ]);
    }

    // Plan na dziś: znacznik na torze i pasek odległości od postępu (tylko w nagłówku).
    var planNodes = [];
    if (hero && o.plan) {
      var lo = Math.min(o.plan.at, o.plan.percent);
      var hi = Math.max(o.plan.at, o.plan.percent);
      var lvl = o.plan.level || 'normal';
      if (hi - lo >= 1) planNodes.push(D.el('span', { class: 'flow__gap flow__gap--' + lvl, style: { left: lo + '%', width: (hi - lo) + '%' }, attrs: { 'aria-hidden': 'true' } }));
      planNodes.push(D.el('span', {
        class: 'flow__plan flow__plan--' + lvl + (o.plan.at > 96 ? ' is-end' : ''),
        style: { left: Math.min(100, o.plan.at) + '%' },
        attrs: { 'data-tooltip': 'Plan na dziś: ' + o.plan.at + '% — tyle czasu umowy już minęło', 'aria-hidden': 'true' }
      }, [marker('plan', { level: lvl === 'normal' ? undefined : lvl })]));
    }

    var current = data.current ? Model.describeStage(data.current).name : '';
    var label = 'Przebieg: ' + data.done + ' z ' + data.total + ' etapów zakończonych, postęp ' + data.percent + '%'
      + (current ? ', bieżący etap: ' + current : '');

    return D.el('div', {
      class: 'flow flow--' + size + (data.percent >= 100 ? ' flow--complete' : ''),
      attrs: { role: interactive ? 'group' : 'img', 'aria-label': label }
    }, [
      reading,
      marks.length ? D.el('div', { class: 'flow__marks' }, marks) : null,
      D.el('div', { class: 'flow__track' }, segments.concat(planNodes))
    ]);
  }

  /* ---------- Level ---------- */

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

  /**
   * Werdykt projektu: jeden stan, jedno zdanie o powodzie i (opcjonalnie) następny krok.
   * Zawsze kształt + nazwa + powód, nigdy sam kolor.
   * @param {Object} project
   * @param {{now?: Date, next?: Node, onReason?: Function}} [options]
   */
  function verdict(project, options) {
    var o = options || {};
    var l = Insight.ladder(project, o.now);
    var lead = l.reasons[0];
    var others = l.reasons.slice(1);
    var calm = l.closed ? 'Projekt zakończony i zamknięty.' : 'Brak zaległości — terminy i zadania w porządku.';
    var linkable = typeof o.onReason === 'function';

    function reasonNode(r, tag, cls) {
      if (!linkable) return D.el(tag, { class: cls, text: r.text });
      return D.el(tag, { class: cls }, [D.el('button', {
        class: 'verdict__reason', text: r.text,
        attrs: { type: 'button', 'data-tooltip': 'Pokaż, gdzie to naprawić', 'data-fk': 'reason-' + r.rule },
        on: { click: function () { o.onReason(r); } }
      })]);
    }

    return D.el('section', { class: 'verdict verdict--' + l.level, attrs: { 'aria-label': 'Stan projektu: ' + l.label } }, [
      D.el('div', { class: 'verdict__state' }, [
        D.el('p', { class: 'verdict__kicker', text: 'Stan projektu' }),
        D.el('p', { class: 'verdict__label' }, [Sig.datum(l.closed ? 'closed' : l.level, { size: 20, label: false }), D.el('span', { text: l.label })]),
        lead && !l.closed ? reasonNode(lead, 'p', 'verdict__why') : D.el('p', { class: 'verdict__why verdict__why--calm', text: calm }),
        others.length ? D.el('ul', { class: 'verdict__more' }, others.map(function (r) { return reasonNode(r, 'li', 'reason--' + r.level); })) : null
      ]),
      o.next ? D.el('div', { class: 'verdict__next' }, [o.next]) : null
    ]);
  }

  root.ETROM.Flow = {
    marker: marker, planBar: planBar, flowTrack: flowTrack, level: level, verdict: verdict, settle: settle
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
