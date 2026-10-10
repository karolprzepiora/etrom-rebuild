/* ETROM — Portfel: widok projektów na osi czasu.
   Każdy projekt to jeden wiersz: pasek postępu, a w miejscu końca umowy jego numer.
   Rok z numeru (2601 → 26) dzieli wiersze na sekcje, najwyższy numer na górze.
   Po najechaniu na numer widać nazwę, po kliknięciu wiersz rozwija właściwości. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Progress = E.Progress;
  var Insight = E.Insight;
  var Team = E.Team;
  var Avatar = E.Avatar;
  var F = E.Format;
  var DAY = 864e5;
  var MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

  var openId = null;

  function year2(project) {
    var m = /^(\d{2})\d{2}/.exec(String(project.code || ''));
    if (m) return m[1];
    var t = Date.parse(project.createdAt || '');
    return Number.isFinite(t) ? String(new Date(t).getFullYear()).slice(-2) : '—';
  }

  function split(project) {
    var code = String(project.code || '');
    var m = /^(\d{2})(\d{2})$/.exec(code);
    return m ? [m[1], m[2]] : ['', code];
  }

  function plural(n) { return n + ' ' + (n === 1 ? 'projekt' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'projekty' : 'projektów'); }

  function fmtDate(iso) {
    var t = Date.parse(iso || '');
    return Number.isFinite(t) ? F.date(new Date(t).toISOString().slice(0, 10)) : '—';
  }

  function details(project, ctx, now, health, pct, elapsed) {
    var risk = health.level === 'alarm' || health.level === 'warning';
    var team = Team.projectPeople(project.team).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
    return D.el('div', { class: 'hy-det' }, [D.el('div', { class: 'hy-det__in' }, [
      D.el('div', { class: 'hy-det__main' }, [
        D.el('h3', { class: 'hy-det__name' }, [D.el('a', { class: 'project-link', text: project.name, attrs: { href: E.ProjectList.projectHref(project), 'data-fk': 'open-' + project.id }, dataset: { projectTitle: project.id } })]),
        D.el('p', { class: 'hy-det__client', text: project.client || 'Bez zamawiającego' }),
        risk ? E.Flow.stateButton(project, ctx, { text: health.reasons[0].text + (health.reasons.length > 1 ? ' · +' + (health.reasons.length - 1) : ''), className: 'pf-reason pf-reason--' + health.level }) : null,
        D.el('div', { class: 'hy-det__act' }, [
          UI.button({ label: 'Otwórz projekt', variant: 'primary', size: 'sm', onClick: function () { ctx.actions.openProject(project.id); } }),
          team.length ? Avatar.avatarStack(team, { max: 5, size: 'sm' }) : D.el('span', { class: 't-muted', text: 'Bez zespołu' }),
          E.ProjectList.moreButton(project, ctx.actions)
        ])
      ]),
      D.el('div', { class: 'hy-fact' }, [
        D.el('div', { class: 'hy-fact__k', text: 'Postęp prac' }),
        D.el('div', { class: 'hy-fact__v t-num', text: pct + '%' }),
        D.el('div', { class: 'hy-fact__s', text: elapsed === null ? '' : 'upłynęło ' + Math.round(elapsed) + '% czasu umowy' }),
        D.el('div', { class: 'hy-mini' }, [D.el('u', { style: { width: pct + '%' } }), elapsed === null ? null : D.el('s', { style: { left: Math.min(100, elapsed) + '%' } })])
      ]),
      D.el('div', { class: 'hy-fact' }, [
        D.el('div', { class: 'hy-fact__k', text: 'Umowa' }),
        D.el('div', { class: 'hy-fact__v t-num', text: fmtDate(project.deadline) }),
        D.el('div', { class: 'hy-fact__s', text: 'start ' + fmtDate(project.createdAt) })
      ]),
      D.el('div', { class: 'hy-fact' }, [
        D.el('div', { class: 'hy-fact__k', text: 'Najbliższy termin' }),
        D.el('div', { class: 'hy-fact__v' }, [E.ProjectList.dueCell(project, ctx, now)]),
        D.el('div', { class: 'hy-fact__s' }, [E.ProjectList.signalsCell(project, ctx, now)])
      ])
    ])]);
  }

  function row(project, ctx, now, P, tn) {
    var health = Insight.health(project, now);
    var pct = Math.max(0, Math.min(100, Math.round(Progress.projectProgress(project).percent)));
    var start = Date.parse(project.createdAt || '');
    var end = Date.parse(project.deadline || '');
    var done = project.status === 'done';
    var hasSpan = Number.isFinite(start) && Number.isFinite(end) && end > start;
    var s = hasSpan ? P(start) : 0;
    var e = Number.isFinite(end) ? P(end) : tn;
    var w = Math.max(.8, e - s);
    var elapsed = hasSpan ? Math.max(0, Math.min(100, (now.getTime() - start) / (end - start) * 100)) : null;
    var fillEnd = s + w * pct / 100;
    var behind = hasSpan && elapsed - pct > 1.5 && !done && tn > fillEnd;
    var parts = split(project);
    var open = openId === project.id;
    var risk = health.level === 'alarm' || health.level === 'warning';
    var tipLines = [project.name];
    var meta = [];
    if (Number.isFinite(end)) meta.push('umowa do ' + fmtDate(project.deadline));
    meta.push('postęp ' + pct + '%');
    if (!done && Number.isFinite(end) && end < now.getTime()) {
      var late = Math.max(1, Math.round((now.getTime() - end) / DAY));
      meta.push('po terminie o ' + late + ' ' + (late === 1 ? 'dzień' : 'dni'));
    }
    var chip = D.el('button', {
      class: 'hy-n',
      attrs: { type: 'button', 'aria-expanded': String(open), 'aria-label': 'Projekt ' + project.code + ': ' + project.name + ', ' + meta.join(', ') + '. ' + (open ? 'Zwiń właściwości' : 'Rozwiń właściwości'), 'data-fk': 'hy-' + project.id },
      style: { left: e + '%' }
    }, [
      risk ? D.el('span', { class: 'hy-n__ic', attrs: { 'aria-hidden': 'true' }, text: '!' }) : null,
      parts[0] ? D.el('i', { text: parts[0] }) : null,
      D.el('b', { class: 't-num', text: parts[1] }),
      D.el('span', { class: 'hy-tip' }, [D.el('strong', { text: project.name }), D.el('span', { text: meta.join(' · ') })])
    ]);
    var node = D.el('div', {
      class: 'hy-r level-' + health.level + (done ? ' is-closed' : '') + (open ? ' is-open' : ''),
      dataset: { projectCode: project.code, projectId: project.id },
      style: E.Identity.hueStyle(project.code)
    }, [
      D.el('div', { class: 'hy-line' }, [
        hasSpan ? D.el('span', { class: 'hy-cap', style: { left: s + '%', width: w + '%' } }, [
          pct > 0 ? D.el('span', { class: 'hy-cap__fill', style: { width: pct + '%' } }) : null,
          behind ? D.el('span', { class: 'hy-cap__gap', style: { left: pct + '%', width: ((Math.min(tn, e) - fillEnd) / w * 100) + '%' } }) : null
        ]) : null,
        chip
      ]),
      details(project, ctx, now, health, pct, elapsed)
    ]);
    function toggle() {
      var was = node.classList.contains('is-open');
      var prev = node.parentNode && node.parentNode.parentNode ? node.parentNode.parentNode.querySelector('.hy-r.is-open') : null;
      if (prev && prev !== node) { prev.classList.remove('is-open'); var pb = prev.querySelector('.hy-n'); if (pb) pb.setAttribute('aria-expanded', 'false'); }
      node.classList.toggle('is-open', !was);
      chip.setAttribute('aria-expanded', String(!was));
      openId = was ? null : project.id;
    }
    chip.addEventListener('click', function (event) { event.stopPropagation(); toggle(); });
    node.querySelector('.hy-line').addEventListener('click', function (event) { if (event.target.closest('button')) return; toggle(); });
    return node;
  }

  /** @param {Array} visible projekty po filtrach @param {object} ctx {state, people, actions} */
  function view(visible, ctx) {
    var now = new Date();
    var ends = visible.map(function (p) { return Date.parse(p.deadline || ''); }).filter(Number.isFinite);
    var starts = visible.map(function (p) { return Date.parse(p.createdAt || ''); }).filter(Number.isFinite);
    var mn = Math.min.apply(null, [now.getTime() - 190 * DAY].concat(starts.length ? [Math.min.apply(null, starts) - 20 * DAY] : [], ends.map(function (t) { return t - 40 * DAY; })));
    var mx = Math.max.apply(null, [now.getTime() + 215 * DAY].concat(ends.map(function (t) { return t + 40 * DAY; })));
    mn = Math.max(mn, now.getTime() - 5 * 365 * DAY);
    function P(t) { return 2 + Math.max(0, Math.min(1, (t - mn) / (mx - mn))) * 93; }
    var tn = P(now.getTime());

    var sorted = visible.slice().sort(function (a, b) { return String(b.code).localeCompare(String(a.code), 'pl', { numeric: true }); });
    var years = [];
    var by = {};
    sorted.forEach(function (p) { var y = year2(p); if (!by[y]) { by[y] = []; years.push(y); } by[y].push(p); });

    var grid = [];
    var labels = [];
    var cur = new Date(mn); cur.setDate(1);
    for (var guard = 0; guard < 80; guard += 1) {
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      if (cur.getTime() >= mx) break;
      if (cur.getMonth() % 3) continue;
      var x = P(cur.getTime());
      grid.push(D.el('span', { class: 'hy-gl', style: { left: x + '%' } }));
      if (Math.abs(x - tn) > 2.6) labels.push(D.el('span', { class: 'hy-gt' + (cur.getMonth() === 0 ? ' is-year' : ''), style: { left: 'calc(' + x + '% + 5px)' }, text: cur.getMonth() === 0 ? String(cur.getFullYear()) : MONTHS[cur.getMonth()] }));
    }

    var alarms = visible.filter(function (p) { return Insight.health(p, now).level === 'alarm'; }).length;
    var warns = visible.filter(function (p) { return Insight.health(p, now).level === 'warning'; }).length;

    var body = [];
    years.forEach(function (y) {
      body.push(D.el('div', { class: 'hy-yh' }, [D.el('b', { text: y }), D.el('em', { text: plural(by[y].length) })]));
      by[y].forEach(function (p) { body.push(row(p, ctx, now, P, tn)); });
    });

    return D.el('section', { class: 'hy', attrs: { 'aria-label': 'Portfel projektów na osi czasu' } }, [
      D.el('div', { class: 'hy-head' }, [
        D.el('p', { class: 'hy-sub', text: plural(visible.length) + ' · ' + alarms + ' w alarmie · ' + warns + ' z ostrzeżeniem' })
      ]),
      D.el('div', { class: 'hy-stage' }, [
        D.el('div', { class: 'hy-axis', attrs: { 'aria-hidden': 'true' } }, grid.concat([D.el('span', { class: 'hy-today', style: { left: tn + '%' } })])),
        D.el('div', { class: 'hy-ruler', attrs: { title: 'Numer projektu stoi w miejscu końca umowy; różowa kreska to dziś; kreskowanie pokazuje, ile pracy brakuje do upływu czasu umowy.' } }, labels.concat([D.el('span', { class: 'hy-tpill', style: { left: tn + '%' }, text: 'dziś' })])),
        D.el('div', { class: 'hy-body' }, body)
      ])
    ]);
  }

  E.PortfolioMap = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
