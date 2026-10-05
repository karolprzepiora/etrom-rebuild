/* ETROM — ekran „Kalendarz”: miesiąc z terminami (projekty, etapy, własne zadania), nieobecnościami i świętami.
   Kolor to projekt. Klik w dzień otwiera jego listę obok, klik w termin otwiera projekt albo zadanie.
   Dane: core/calview.js (zakres wg roli). Bez godzin i obciążenia. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;
  var Cal = E.Calendar;

  var DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  var DOW_FULL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var MAX_CHIPS = 3;

  function longDay(key) { var d = Cal.parse(key); return DOW_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    if (!me) return { summary: 'Terminy i nieobecności w kalendarzu.', body: E.Welcome.card(state, ctx, 'Kalendarz pokazuje terminy i nieobecności. Wybierz, kim jesteś.') };
    var now = new Date();
    var offset = Number(state.calOffset) || 0;
    var base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    var data = E.CalView.build({
      projects: state.workspace.projects || [], people: people, absences: state.workspace.absences || [],
      meId: me.id, now: now, year: base.getFullYear(), month: base.getMonth()
    });
    var management = E.Budget.isManagement(me.id, people);
    var selected = state.calDay && data.cells.some(function (c) { return c.key === state.calDay; }) ? state.calDay : (offset === 0 ? Cal.isoOf(now) : base.getFullYear() + '-' + (base.getMonth() < 9 ? '0' : '') + (base.getMonth() + 1) + '-01');
    var selCell = data.cells.filter(function (c) { return c.key === selected; })[0];

    function openEvent(ev) {
      if (ev.kind === 'task') ctx.actions.inspect({ kind: 'task', projectId: ev.projectId, stageId: ev.stageId, taskId: ev.taskId });
      else if (ev.kind === 'absence') { if (management) ctx.actions.openAbsence(ev.personId, ev.absenceId); }
      else ctx.actions.openProject(ev.projectId, 'etapy');
    }

    function chip(ev) {
      var cls = 'cv-ev cv-ev--' + ev.kind;
      var tip = (ev.kind === 'absence' ? ev.sub + ' · ' + ev.title : ev.code + ' · ' + ev.title + ' · ' + ev.sub);
      var kids = ev.kind === 'absence'
        ? [D.el('span', { class: 'truncate', text: ev.title + ' · ' + ev.sub.toLowerCase() })]
        : [D.el('span', { class: 'cv-ev__code', text: ev.code }), D.el('span', { class: 'truncate', text: ev.title })];
      return D.el('button', {
        class: cls, style: ev.kind === 'absence' ? null : E.Identity.hueStyle(ev.code),
        attrs: { type: 'button', 'data-tooltip': tip, 'aria-label': tip, 'data-fk': 'cv-ev-' + ev.kind },
        on: { click: function (e) { e.stopPropagation(); openEvent(ev); } }
      }, kids);
    }

    var grid = D.el('div', { class: 'cv-grid', attrs: { role: 'grid', 'aria-label': data.title } });
    grid.appendChild(D.el('span', { class: 'cv-h cv-wk' }));
    DOW.forEach(function (n) { grid.appendChild(D.el('span', { class: 'cv-h', text: n })); });
    data.cells.forEach(function (c, i) {
      if (i % 7 === 0) grid.appendChild(D.el('span', { class: 'cv-wk', text: String(Cal.weekNumber(c.key)), attrs: { 'aria-hidden': 'true' } }));
      var shown = c.events.slice(0, MAX_CHIPS);
      var extra = c.events.length - shown.length;
      var cls = 'cv-c' + (c.out ? ' is-out' : '') + (c.weekend ? ' is-we' : '') + (c.holiday ? ' is-hol' : '') + (c.today ? ' is-today' : '') + (c.key === selected ? ' is-sel' : '');
      grid.appendChild(D.el('div', {
        class: cls, attrs: { role: 'gridcell', tabindex: c.key === selected ? '0' : '-1', 'data-k': c.key, 'aria-label': longDay(c.key) + (c.holiday ? ', ' + c.holiday : '') + (c.events.length ? ', ' + c.events.length + ' wpisów' : ''), 'aria-selected': String(c.key === selected) },
        on: { click: function () { ctx.actions.setTime({ calDay: c.key }); } }
      }, [
        D.el('div', { class: 'cv-num' }, [D.el('span', { class: 'cv-num__d', text: String(c.day) }), c.holiday ? D.el('span', { class: 'cv-num__hol truncate', text: c.holiday }) : null]),
        D.el('div', { class: 'cv-evs' }, shown.map(chip).concat(extra > 0 ? [D.el('span', { class: 'cv-more', text: '+' + extra + ' więcej' })] : []))
      ]));
    });
    grid.addEventListener('keydown', function (e) {
      var cur = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-k');
      if (!cur) return;
      var next = null;
      if (e.key === 'ArrowLeft') next = Cal.addDays(cur, -1);
      else if (e.key === 'ArrowRight') next = Cal.addDays(cur, 1);
      else if (e.key === 'ArrowUp') next = Cal.addDays(cur, -7);
      else if (e.key === 'ArrowDown') next = Cal.addDays(cur, 7);
      if (!next) return;
      e.preventDefault();
      var monthDiff = (Number(next.slice(0, 4)) - base.getFullYear()) * 12 + (Number(next.slice(5, 7)) - 1 - base.getMonth());
      ctx.actions.setTime({ calDay: next, calOffset: offset + monthDiff });
      window.setTimeout(function () { var el = document.querySelector('.cv-c[data-k="' + next + '"]'); if (el) el.focus(); }, 30);
    });

    var toolbar = D.el('div', { class: 'cv-bar' }, [
      UI.iconButton({ icon: 'chevronLeft', label: 'Poprzedni miesiąc', size: 'sm', attrs: { 'data-fk': 'cv-prev' }, onClick: function () { ctx.actions.setTime({ calOffset: offset - 1, calDay: null }); } }),
      UI.iconButton({ icon: 'chevronRight', label: 'Następny miesiąc', size: 'sm', attrs: { 'data-fk': 'cv-next' }, onClick: function () { ctx.actions.setTime({ calOffset: offset + 1, calDay: null }); } }),
      D.el('h2', { class: 'cv-title', text: data.title }),
      UI.button({ label: 'Dziś', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'cv-today' }, onClick: function () { ctx.actions.setTime({ calOffset: 0, calDay: null }); } }),
      data.projects.length ? D.el('div', { class: 'cv-legend', attrs: { 'aria-hidden': 'true' } }, data.projects.slice(0, 8).map(function (p) { return D.el('span', { class: 'cv-legend__i', style: E.Identity.hueStyle(p.code), text: p.code, attrs: { 'data-tooltip': p.name } }); })) : null
    ]);

    function sideRow(ev) {
      return D.el('li', null, [D.el('button', { class: 'cv-row' + (ev.kind === 'absence' ? ' is-abs' : ''), style: ev.kind === 'absence' ? null : E.Identity.hueStyle(ev.code), attrs: { type: 'button' }, on: { click: function () { openEvent(ev); } } }, [
        D.el('i', { class: 'cv-row__bar', attrs: { 'aria-hidden': 'true' } }),
        D.el('span', { class: 'cv-row__txt' }, [D.el('b', { class: 'truncate', text: ev.title }), D.el('small', { class: 'truncate', text: (ev.code ? ev.code + ' · ' : '') + (ev.project ? ev.project + ' · ' : '') + ev.sub })])
      ])]);
    }
    var dayList = selCell && selCell.events.length
      ? D.el('ul', { class: 'cv-list' }, selCell.events.map(sideRow))
      : D.el('p', { class: 'cv-empty', text: selCell && selCell.holiday ? selCell.holiday : 'Nic nie jest zaplanowane.' });
    var upcoming = data.upcoming.length ? D.el('ul', { class: 'cv-list' }, data.upcoming.map(function (ev) {
      var days = Math.round((Cal.parse(ev.key) - Cal.parse(Cal.isoOf(now))) / 86400000);
      var row = sideRow(ev);
      row.querySelector('small').textContent = (ev.code ? ev.code + ' · ' : '') + (ev.project ? ev.project + ' · ' : '') + ev.sub + ' · ' + (days === 0 ? 'dziś' : (days === 1 ? 'jutro' : 'za ' + days + ' dni'));
      return row;
    })) : D.el('p', { class: 'cv-empty', text: 'Brak nadchodzących terminów.' });

    var side = D.el('aside', { class: 'cv-side', attrs: { 'aria-label': 'Wybrany dzień' } }, [
      D.el('div', { class: 'cv-side__sec' }, [D.el('span', { class: 'cv-side__k', text: 'Wybrany dzień' }), D.el('h3', { class: 'cv-side__t', text: selected ? longDay(selected) : '' }), dayList]),
      D.el('div', { class: 'cv-side__sec' }, [D.el('span', { class: 'cv-side__k', text: 'Najbliższe terminy' }), upcoming])
    ]);

    var total = data.cells.reduce(function (n, c) { return n + (c.out ? 0 : c.events.filter(function (e) { return e.kind !== 'absence'; }).length); }, 0);
    return {
      summary: management ? 'Terminy projektów i etapów oraz nieobecności zespołu.' : 'Twoje terminy i nieobecności.',
      body: D.el('div', { class: 'cv' }, [toolbar, D.el('div', { class: 'cv-body' }, [D.el('div', { class: 'cv-wrap' }, [grid]), side]), D.el('p', { class: 'sr-only', text: total + ' terminów w miesiącu', attrs: { 'aria-live': 'polite' } })])
    };
  }

  E.CalendarScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
