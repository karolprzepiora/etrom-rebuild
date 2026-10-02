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
        text: 'Opóźnienie ' + lag + ' pkt',
        level: lag >= Insight.LAG_ALARM ? 'alarm' : (lag >= Insight.LAG_WARNING ? 'warning' : 'normal')
      };
    }
    if (lag <= -1) return { text: 'Zapas ' + (-lag) + ' pkt', level: 'normal' };
    return { text: 'Zgodnie z planem', level: 'normal' };
  }

  function gaugeLabel(g) {
    var parts = ['Postęp ' + g.percent + '%'];
    if (g.expected !== null) {
      var lag = lagInfo(g);
      parts.push('plan ' + g.expected + '% (' + lag.text.toLowerCase() + ')');
    }
    if (g.current) {
      parts.push('bieżący etap ' + (g.current.index + 1) + ' z ' + g.stages.length + ': ' + g.current.name
        + ', zakres ' + Math.round(g.current.from) + '–' + Math.round(g.current.to) + '%');
    } else if (g.stages.length) {
      parts.push('wszystkie etapy zakończone');
    }
    return parts.join('. ');
  }

  /**
   * Miernik postępu — pionowa łata z progami na granicach etapów.
   * @param {Object} project
   * @param {{now?: Date, from?: number, onStage?: Function}} [options]
   *   from — poprzednia wartość (animacja), onStage(stageId) — przejście do etapu
   */
  function gauge(project, options) {
    var o = options || {};
    var g = Insight.gauge(project, o.now);
    var from = typeof o.from === 'number' ? o.from : g.percent;
    var lag = lagInfo(g);
    var cur = g.current;

    var scale = D.el('div', { class: 'gauge__scale', attrs: { 'aria-hidden': 'true' } });
    var nodes = [D.el('span', { class: 'gauge__axis' })];

    g.majors.forEach(function (m) {
      nodes.push(D.el('span', { class: 'gauge__major', style: { '--at': String(m) } }, [
        D.el('span', { class: 'gauge__major-label', text: String(m) })
      ]));
    });
    g.stages.forEach(function (stage) {
      var hit = D.el('span', {
        class: 'gauge__stage gauge__stage--' + stage.state,
        style: { '--from': String(stage.from), '--to': String(stage.to) },
        attrs: { 'data-tooltip': (stage.index + 1) + '. ' + stage.name + ' — ' + Math.round(stage.from) + '–' + Math.round(stage.to) + '%' },
        dataset: { stageId: stage.id }
      });
      nodes.push(hit);
      if (stage.to < 99.5) nodes.push(D.el('span', { class: 'gauge__tick', style: { '--at': String(stage.to) } }));
    });
    nodes.push(D.el('span', { class: 'gauge__done', style: { '--at': String(from) }, dataset: { to: String(g.percent) } }));
    if (cur) nodes.push(D.el('span', { class: 'gauge__span' + (cur.state === 'blocked' ? ' gauge__span--blocked' : ''), style: { '--from': String(cur.from), '--to': String(cur.to) } }));
    if (g.expected !== null) {
      nodes.push(D.el('span', { class: 'gauge__plan' + (lag && lag.level !== 'normal' ? ' gauge__plan--' + lag.level : ''), style: { '--at': String(g.expected) } }, [
        marker('plan', { tooltip: 'Plan: ' + g.expected + '% — tyle czasu umowy już minęło' })
      ]));
    }
    var now = D.el('span', { class: 'gauge__now', style: { '--at': String(from) }, dataset: { to: String(g.percent) } }, [marker('now')]);
    nodes.push(now);

    var note = null;
    if (cur) {
      note = D.el('button', {
        class: 'gauge__note',
        style: { '--at': String(from) },
        dataset: { to: String(g.percent) },
        attrs: { type: 'button', 'aria-label': 'Przejdź do etapu ' + (cur.index + 1) + ': ' + cur.name }
      }, [
        D.el('span', { class: 'gauge__note-stage', text: 'Etap ' + (cur.index + 1) }),
        D.el('span', { class: 'gauge__note-range t-num', text: Math.round(cur.from) + ' → ' + Math.round(cur.to) + '%' })
      ]);
      if (typeof o.onStage === 'function') note.addEventListener('click', function () { o.onStage(cur.id); });
      nodes.push(note);
    }
    D.render(scale, nodes);

    return D.el('div', {
      class: 'gauge gauge--hero' + (g.percent >= 100 ? ' gauge--complete' : ''),
      attrs: { role: 'img', 'aria-label': gaugeLabel(g) },
      dataset: { percent: String(g.percent) }
    }, [
      D.el('div', { class: 'gauge__read' }, [
        D.el('span', { class: 'gauge__value' }, [
          D.el('span', { class: 'gauge__number', text: String(from), dataset: { count: String(g.percent) } }),
          D.el('span', { class: 'gauge__unit', text: '%' })
        ]),
        D.el('span', { class: 'gauge__caption', text: g.stages.length ? 'postępu prac' : 'brak etapów' }),
        lag ? D.el('span', { class: 'gauge__lag gauge__lag--' + lag.level }, [
          D.el('span', { class: 'gauge__lag-plan t-num', text: 'Plan ' + g.expected + '%' }),
          D.el('span', { class: 'gauge__lag-text', text: lag.text })
        ]) : null
      ]),
      scale
    ]);
  }

  /** Po wstawieniu do DOM przesuwa znaczniki i liczbę ze starej wartości na nową. */
  function settle(container) {
    var gauges = container.querySelectorAll('.gauge[data-percent]');
    Array.prototype.forEach.call(gauges, function (el) {
      var to = Number(el.dataset.percent);
      var number = el.querySelector('[data-count]');
      var from = number ? Number(number.textContent) : to;
      var movers = el.querySelectorAll('[data-to]');
      function apply() {
        Array.prototype.forEach.call(movers, function (m) { m.style.setProperty('--at', m.dataset.to); });
      }
      if (from === to || E.Motion.prefersReducedMotion()) {
        apply();
        if (number) number.textContent = String(to);
        return;
      }
      window.requestAnimationFrame(function () {
        apply();
        if (number) E.Motion.countTo(number, from, to);
      });
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
    if (seg.deadline && seg.status !== 'done') text += ', termin ' + F.date(seg.deadline);
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
          tooltip: (seg.overdue ? 'Termin etapu minął ' : 'Termin etapu ') + F.date(seg.deadline) + ' — ' + seg.name,
          class: 'flow__mark'
        }));
      }
      var cls = 'flow__seg flow__seg--' + seg.status + ' flow__seg--' + seg.state + (seg.current ? ' is-current' : '');
      if (hero) cls += seg.weight < TINY ? (seg.current ? ' is-sliver' : ' is-tiny') : '';
      return D.el(interactive ? 'button' : 'span', {
        class: cls,
        style: { 'flex-grow': String(seg.weight), 'flex-basis': '0' },
        attrs: {
          'data-tooltip': size === 'mini' ? null : segmentLabel(seg),
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

    var current = data.current ? Model.describeStage(data.current).name : '';
    var label = 'Przebieg: ' + data.done + ' z ' + data.total + ' etapów zakończonych, postęp ' + data.percent + '%'
      + (current ? ', bieżący etap: ' + current : '');

    return D.el('div', {
      class: 'flow flow--' + size + (data.percent >= 100 ? ' flow--complete' : ''),
      attrs: { role: interactive ? 'group' : 'img', 'aria-label': label }
    }, [
      reading,
      marks.length ? D.el('div', { class: 'flow__marks' }, marks) : null,
      D.el('div', { class: 'flow__track' }, segments)
    ]);
  }

  /* ---------- Timeline (znaczniki na osi czasu umowy) ---------- */

  function timeline(project, now) {
    var plan = Insight.schedule(project, now);
    if (!plan || project.status === 'done') return null;
    var at = Math.min(1, plan.elapsed) * 100;
    var over = plan.daysLeft < 0;
    var lagging = plan.lag >= Insight.LAG_WARNING && !over;
    var start = new Date(project.createdAt);
    var startIso = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');
    var level = over ? 'alarm' : (lagging ? 'warning' : 'normal');

    return D.el('div', {
      class: 'timeline-axis timeline-axis--' + level,
      style: { '--at': at },
      attrs: { role: 'img', 'aria-label': 'Czas umowy: minęło ' + Math.round(plan.elapsed * 100) + '%, ' + (over ? 'termin minął' : 'do terminu ' + plan.daysLeft + ' dni') }
    }, [
      D.el('div', { class: 'timeline-axis__line' }, [
        D.el('span', { class: 'timeline-axis__elapsed' }),
        D.el('span', { class: 'timeline-axis__today' }, [marker('now', { level: level, tooltip: 'Dziś — ' + Math.round(plan.elapsed * 100) + '% czasu umowy' })]),
        D.el('span', { class: 'timeline-axis__end' }, [marker('deadline', { level: over ? 'alarm' : 'normal', filled: over, tooltip: 'Termin umowy ' + F.date(project.deadline, { year: 'always' }) })])
      ]),
      D.el('div', { class: 'timeline-axis__labels' }, [
        D.el('span', { text: F.date(startIso) }),
        D.el('span', { class: 'timeline-axis__end-label', text: over ? 'Termin minął ' + F.date(project.deadline, { year: 'always' }) : 'Termin ' + F.date(project.deadline, { year: 'always' }) })
      ])
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
    var lead = l.reasons[0];
    var others = l.reasons.slice(1);

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

    var rungs = l.closed
      ? [D.el('li', { class: 'rung rung--closed is-active', attrs: { 'aria-current': 'true' } }, [
          D.el('span', { class: 'rung__node' }, [Sig.datum('closed', { size: 16, label: false })]),
          D.el('span', { class: 'rung__label', text: 'Zakończony' })
        ])]
      : l.rungs.map(function (rung) {
          return D.el('li', {
            class: 'rung rung--' + rung.level + (rung.active ? ' is-active' : ''),
            attrs: { 'aria-current': rung.active ? 'true' : null }
          }, [
            D.el('span', { class: 'rung__node' }, [Sig.datum(rung.level, { size: 16, label: false })]),
            D.el('span', { class: 'rung__label', text: rung.label }),
            rung.active ? D.el('span', { class: 'rung__here', text: 'teraz', attrs: { 'aria-hidden': 'true' } }) : null
          ]);
        });

    var calm = l.closed ? 'Projekt zakończony i zamknięty.' : 'Terminy i zadania bez zaległości.';

    return D.el('section', { class: 'level level--hero level--' + l.level, attrs: { 'aria-label': 'Stan projektu: ' + l.label } }, [
      D.el('p', { class: 'level__kicker', text: 'Stan projektu' }),
      D.el('ol', { class: 'level__ladder' }, rungs),
      lead && !l.closed
        ? D.el('p', { class: 'level__lead', text: lead.text })
        : D.el('p', { class: 'level__lead level__lead--calm', text: calm }),
      others.length ? D.el('ul', { class: 'level__more' }, others.map(function (r) {
        return D.el('li', { class: 'reason--' + r.level, text: r.text });
      })) : null
    ]);
  }

  root.ETROM.Flow = {
    marker: marker, gauge: gauge, flowTrack: flowTrack, timeline: timeline, level: level, settle: settle
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
