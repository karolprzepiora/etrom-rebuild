/* ETROM — ekran „Czas”: karta czasu (tydzień i miesiąc, rozbicie na projekty i zadania, eksport CSV)
   oraz plan obciążenia (ile godzin czeka na osoby w kolejnych tygodniach).
   Liczą core/timesheet.js i core/plan.js; tu tylko wygląd. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Icons = E.Icons;
  var TL = E.TimeLog;
  var TS = E.Timesheet;
  var Plan = E.Plan;
  var Team = E.Team;
  var Budget = E.Budget;
  var Identity = E.Identity;

  var MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

  function h(minutes) { return minutes ? TS.hours(minutes) : ''; }
  function hh(hours) { return String(Math.round(hours * 10) / 10).replace('.', ','); }

  function projectInfo(ctx, projectId) {
    var found = ctx.find({ projectId: projectId });
    return found && found.project ? found.project : null;
  }

  function codePill(project, projectId) {
    var code = project ? project.code : '—';
    return D.el('span', { class: 'ts-code', style: Identity.hueStyle(code), text: code, attrs: { 'aria-label': 'Projekt ' + code } });
  }

  /* ---------- Karta czasu ---------- */

  function controls(state, ctx, canPick, people, personId, sheet) {
    var a = ctx.actions;
    var mode = state.timeMode === 'month' ? 'month' : (state.timeMode === 'day' ? 'day' : 'week');
    var seg = UI.segmented({
      label: 'Okres', value: mode,
      items: [{ value: 'day', label: 'Dzień' }, { value: 'week', label: 'Tydzień' }, { value: 'month', label: 'Miesiąc' }],
      onChange: function (value) { a.setTime({ timeMode: value, timeOffset: 0 }); }
    });
    var offset = state.timeOffset || 0;
    var select = null;
    if (canPick) {
      select = UI.select({
        id: 'ts-person', value: personId,
        options: people.filter(function (p) { return p.active !== false; }).map(function (p) { return { value: p.id, label: Team.fullName(p) }; }),
        on: { change: function () { a.setTime({ timePerson: select.value }); } }, attrs: { 'aria-label': 'Osoba', 'data-fk': 'ts-person' }
      });
    }
    if (mode === 'day') return D.el('div', { class: 'ts-bar' }, [seg.node]);
    var title = sheet.period.title;
    var bar = [
      seg.node,
      select,
      D.el('div', { class: 'ts-nav', attrs: { role: 'group', 'aria-label': 'Przesuń okres' } }, [
        UI.iconButton({ icon: 'chevronLeft', label: mode === 'month' ? 'Poprzedni miesiąc' : 'Poprzedni tydzień', attrs: { 'data-fk': 'ts-prev' }, onClick: function () { a.setTime({ timeOffset: offset - 1 }); } }),
        D.el('h2', { class: 'ts-title', text: title }),
        UI.iconButton({ icon: 'chevronRight', label: mode === 'month' ? 'Następny miesiąc' : 'Następny tydzień', attrs: { 'data-fk': 'ts-next' }, onClick: function () { a.setTime({ timeOffset: offset + 1 }); } }),
        offset !== 0 ? UI.button({ label: mode === 'month' ? 'Ten miesiąc' : 'Ten tydzień', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'ts-today' }, onClick: function () { a.setTime({ timeOffset: 0 }); } }) : null
      ])
    ].filter(Boolean);
    return D.el('div', { class: 'ts-bar' }, bar);
  }

  /* ---------- Czas co do minuty ---------- */

  /** „7:50” – zapis zwarty do komórek kalendarza. */
  function hm(minutes) { var n = Math.max(0, Math.round(minutes)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
  /** „+0:20” / „−0:10” – różnica względem normy dnia. */
  function signed(minutes) { return (minutes < 0 ? '−' : '+') + hm(Math.abs(minutes)); }
  function signedLong(minutes) { return (minutes < 0 ? '−' : '+') + TL.duration(Math.abs(minutes)); }

  var ABS_TAG = { leave: 'U', sick: 'L4', training: 'Szk', other: 'OP' };
  var ABS_NAME = { leave: 'Urlop', sick: 'Zwolnienie lekarskie', training: 'Szkolenie', other: 'Inna nieobecność' };

  function card(title, subtitle, body, cls) {
    return D.el('section', { class: 'an-card ' + (cls || '') }, [
      D.el('header', { class: 'an-card__head' }, [D.el('h3', { class: 'an-card__title', text: title }), subtitle ? D.el('p', { class: 't-meta', text: subtitle }) : null]),
      body
    ]);
  }

  function dayCell(sheet, i, ctx, week) {
    var d = sheet.days[i];
    var cls = 'ts-day';
    var tag = null;
    var tip = d.label + ' ' + d.number;
    if (d.absentKind) {
      cls += d.absentKind === 'sick' ? ' is-sick' : ' is-vac';
      var code = d.absentKind === 'leave' && d.onDemand ? 'UŻ' : ABS_TAG[d.absentKind];
      tag = D.el('span', { class: 'ts-day__tag' }, [code, D.el('small', { text: d.onDemand ? 'na żądanie' : ABS_NAME[d.absentKind].toLowerCase() })]);
      tip += ' · ' + ABS_NAME[d.absentKind] + (d.onDemand ? ' (na żądanie)' : '');
    } else if (d.holidayName && !d.weekend) {
      cls += ' is-hol';
      tag = D.el('span', { class: 'ts-day__tag' }, ['Ś', D.el('small', { text: d.holidayName })]);
      tip += ' · ' + d.holidayName;
    } else if (d.weekend) cls += ' is-weekend';
    else if (d.future) cls += ' is-future';
    if (d.today) cls += ' is-today';
    if (d.state === 'ok' || d.state === 'warn' || d.state === 'bad') cls += ' is-' + d.state;
    var segs = [];
    sheet.rows.forEach(function (row) {
      var m = row.cells[i];
      if (!m) return;
      var project = projectInfo(ctx, row.projectId);
      segs.push({ m: m, code: project ? project.code : String(row.projectId), name: project ? project.name : '' });
    });
    var children = [D.el('span', { class: 'ts-day__n', text: String(d.number) + (week ? ' ' + d.label : '') })];
    if (d.minutes) {
      children.push(D.el('span', { class: 'ts-day__h t-num' }, [hm(d.minutes), D.el('small', { text: ' h' })]));
      if (d.diff !== null && d.diff !== 0) children.push(D.el('span', { class: 'ts-day__diff t-num ' + (d.diff < 0 ? 'is-minus' : 'is-plus'), text: signed(d.diff) }));
      tip += ' · ' + TL.duration(d.minutes) + (d.norm ? ' z ' + TL.duration(d.norm) : '');
      if (d.diff) tip += ' (' + (d.diff < 0 ? 'brakuje ' + TL.duration(-d.diff) : 'nadwyżka ' + TL.duration(d.diff)) + ')';
      var track = D.el('span', { class: 'ts-day__track', attrs: { 'aria-hidden': 'true' } }, segs.map(function (g) {
        return D.el('i', { class: 'ts-seg', style: Object.assign({ width: Math.min(100, g.m / (sheet.dayTarget || 480) * 100) + '%' }, Identity.hueStyle(g.code)) });
      }));
      children.push(track);
      if (week) children.push(D.el('span', { class: 'ts-day__list' }, segs.map(function (g) {
        return D.el('span', { class: 'ts-day__p' }, [D.el('span', { class: 'ts-code', style: Identity.hueStyle(g.code), text: g.code }), D.el('b', { class: 't-num', text: hm(g.m) })]);
      })));
    } else if (!tag && !d.weekend && !d.future && !d.today && d.state !== 'off') {
      children.push(D.el('span', { class: 'ts-day__h t-num is-none', text: '—' }));
      tip += ' · brak zapisu' + (d.norm ? ', brakuje ' + TL.duration(d.norm) : '');
    } else if (d.today && !d.minutes) tip += ' · dziś jeszcze bez zapisu';
    if (tag) children.push(tag);
    return D.el('div', { class: cls, attrs: { role: 'cell', 'data-tooltip': tip, 'data-day': d.key } }, children);
  }

  function weekAside(sheet, w) {
    var pct = w.norm ? Math.min(100, Math.round(w.minutes / w.norm * 100)) : 0;
    return D.el('div', { class: 'ts-wk', attrs: { role: 'cell' } }, [
      D.el('span', { class: 'ts-wk__l', text: 'Tydz. ' + w.number }),
      D.el('b', { class: 't-num', text: w.minutes ? TL.duration(w.minutes) : '—' }),
      w.norm ? D.el('span', { class: 'ts-wk__n', text: 'norma ' + TL.duration(w.norm) }) : D.el('span', { class: 'ts-wk__n', text: 'bez normy' }),
      w.norm ? D.el('span', { class: 'ts-meter' }, [D.el('i', { style: { width: pct + '%' } })]) : null
    ]);
  }

  /** Kalendarz okresu: miesiąc (tygodnie w wierszach + suma tygodnia) albo jeden tydzień (większe komórki z podziałem na projekty). */
  function calendar(sheet, ctx) {
    var week = sheet.period.mode === 'week';
    var head = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map(function (l) { return D.el('span', { class: 'ts-cal__dh', text: l, attrs: { role: 'columnheader' } }); }).concat([D.el('span', { class: 'ts-cal__dh ts-cal__dh--wk', text: 'Tydzień', attrs: { role: 'columnheader' } })]);
    var cells = [];
    sheet.weeks.forEach(function (w) {
      var first = sheet.days[w.indices[0]];
      var lead = (new Date(first.date).getDay() + 6) % 7;
      for (var k = 0; k < lead; k += 1) cells.push(D.el('div', { class: 'ts-day is-out', attrs: { 'aria-hidden': 'true' } }));
      w.indices.forEach(function (i) { cells.push(dayCell(sheet, i, ctx, week)); });
      for (var t = lead + w.indices.length; t < 7; t += 1) cells.push(D.el('div', { class: 'ts-day is-out', attrs: { 'aria-hidden': 'true' } }));
      cells.push(weekAside(sheet, w));
    });
    return D.el('div', { class: 'ts-cal' + (week ? ' is-week' : ' is-month'), attrs: { role: 'table', 'aria-label': 'Kalendarz czasu pracy' } }, [
      D.el('div', { class: 'ts-cal__grid', attrs: { role: 'rowgroup' } }, head.concat(cells)),
      D.el('div', { class: 'ts-legend' }, [
        D.el('span', { class: 'ts-legend__i is-vac', text: 'urlop (U, UŻ)' }),
        D.el('span', { class: 'ts-legend__i is-sick', text: 'zwolnienie lekarskie (L4)' }),
        D.el('span', { class: 'ts-legend__i is-hol', text: 'święto' })
      ])
    ]);
  }

  function projectList(sheet, state, ctx) {
    var open = state.timeOpen || {};
    var a = ctx.actions;
    var max = sheet.rows.reduce(function (m, r) { return Math.max(m, r.minutes); }, 0) || 1;
    var rows = [];
    sheet.rows.forEach(function (row) {
      var project = projectInfo(ctx, row.projectId);
      var isOpen = !!open[row.projectId];
      var share = sheet.total ? Math.round(row.minutes / sheet.total * 100) : 0;
      var code = project ? project.code : String(row.projectId);
      rows.push(D.el('div', { class: 'ts-pr' + (isOpen ? ' is-open' : ''), attrs: { role: 'row' } }, [
        D.el('button', { class: 'ts-toggle', attrs: { type: 'button', 'aria-expanded': String(isOpen), 'aria-label': (isOpen ? 'Zwiń zadania projektu ' : 'Rozwiń zadania projektu ') + code, 'data-fk': 'ts-toggle-' + row.projectId }, on: { click: function () { a.toggleTimeProject(row.projectId); } } }, [Icons.icon(isOpen ? 'chevronDown' : 'chevronRight', 14)]),
        codePill(project, row.projectId),
        D.el('span', { class: 'ts-pname truncate', text: project ? project.name : 'Usunięty projekt' }),
        D.el('span', { class: 'ts-pbar' }, [D.el('i', { class: 'ts-seg', style: Object.assign({ width: Math.max(2, row.minutes / max * 100) + '%' }, Identity.hueStyle(code)) })]),
        D.el('span', { class: 'ts-pv t-num' }, [D.el('b', { text: TL.duration(row.minutes) }), D.el('small', { text: share + '% czasu' })])
      ]));
      if (isOpen) row.tasks.forEach(function (task) {
        rows.push(D.el('div', { class: 'ts-pr ts-pr--task', attrs: { role: 'row' } }, [
          D.el('span'), D.el('span'),
          D.el('span', { class: 'ts-tname truncate', text: task.label || 'Zadanie', attrs: { 'data-tooltip': task.label || '' } }),
          D.el('span', { class: 'ts-pbar ts-pbar--thin' }, [D.el('i', { class: 'ts-seg', style: Object.assign({ width: Math.max(2, task.minutes / max * 100) + '%' }, Identity.hueStyle(code)) })]),
          D.el('span', { class: 'ts-pv t-num' }, [D.el('b', { text: TL.duration(task.minutes) })])
        ]));
      });
    });
    return D.el('div', { class: 'ts-prlist', attrs: { role: 'table', 'aria-label': 'Czas według projektów' } }, rows);
  }

  function stat(label, value, sub, extra) {
    return D.el('div', { class: 'ts-stat' }, [
      D.el('span', { class: 'ts-stat__l', text: label }),
      D.el('span', { class: 'ts-stat__v t-num', text: value }),
      sub ? D.el('span', { class: 'ts-stat__s', text: sub }) : null,
      extra || null
    ]);
  }

  function absencePills(c) {
    var out = [];
    if (c.leave) out.push(D.el('span', { class: 'ts-pill is-vac', text: c.leave + ' U' + (c.onDemand ? ' (' + c.onDemand + ' UŻ)' : '') }));
    if (c.sick) out.push(D.el('span', { class: 'ts-pill is-sick', text: c.sick + ' L4' }));
    if (c.training) out.push(D.el('span', { class: 'ts-pill is-vac', text: c.training + ' szkol.' }));
    if (c.other) out.push(D.el('span', { class: 'ts-pill is-vac', text: c.other + ' inne' }));
    if (c.holidays) out.push(D.el('span', { class: 'ts-pill is-hol', text: c.holidays + (c.holidays === 1 ? ' święto' : ' święta') }));
    return out.length ? D.el('span', { class: 'ts-pills' }, out) : null;
  }

  /** Dzień: wszystko, co zapisano dziś (oś dnia, luki, wpisy, podsumowanie). Zegar włącza się paskiem na dole. */
  function dayView(state, ctx, me, now) {
    var todays = TL.forDay(state.workspace.entries || [], me.id, now);
    var minutes = TL.sum(todays, now);
    var seg = controls(Object.assign({}, state, { timeMode: 'day' }), ctx, false, [], me.id, null);
    var target = state.prefs.dayTarget || 480;
    var left = Math.max(0, target - minutes);
    var pct = target ? Math.round(minutes / target * 100) : 0;
    var codes = {};
    todays.forEach(function (e) { codes[e.projectId || e.code || e.taskId] = 1; });
    var nProj = Object.keys(codes).length;
    var stats = D.el('div', { class: 'ts-stats' }, [
      stat('Przepracowano dziś', TL.duration(minutes), 'z normy ' + TL.duration(target) + ' · ' + pct + '%', D.el('span', { class: 'ts-meter' }, [D.el('i', { style: { width: Math.min(100, pct) + '%' } })])),
      stat(minutes > target ? 'Nadwyżka' : 'Do celu dnia', TL.duration(Math.abs(target - minutes)), minutes > target ? 'ponad normę dnia' : (left ? 'zostało do normy' : 'norma wypełniona')),
      stat('Wpisy', String(todays.length), todays.length ? 'zapisanych odcinków czasu' : 'brak zapisu'),
      stat('Projekty', String(nProj), nProj ? F2(nProj, 'projekt', 'projekty', 'projektów') + ' dziś' : 'brak zapisu')
    ]);
    var side = D.el('section', { class: 'an-card ts-calcard ts-day-view' }, [
      D.el('div', { class: 'ts-day-view__main' }, [
        E.Timer.todayBlock(todays, { find: ctx.find, actions: ctx.actions, entries: state.workspace.entries || [], meId: me.id, pending: null, noLive: true, noShares: true, noResume: true, openLog: true })
      ])
    ]);
    return { body: [seg, stats, side], summary: 'Dziś · ' + TL.duration(minutes) + ' z ' + TL.duration(state.prefs.dayTarget || 480) };
  }

  function sheetView(state, ctx, person, now) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    var people = state.workspace.people || [];
    var canPick = Budget.isManagement(me.id, people);
    var personId = canPick && state.timePerson && Team.findPerson(people, state.timePerson) ? state.timePerson : me.id;
    var who = Team.findPerson(people, personId);
    if (state.timeMode === 'day') return dayView(state, ctx, me, now);
    var sheet = TS.build(state.workspace.entries || [], personId, now, { mode: state.timeMode, offset: state.timeOffset, target: state.prefs.dayTarget, absences: state.workspace.absences || [] });
    var pct = sheet.target ? Math.round(sheet.total / sheet.target * 100) : 0;
    var avg = sheet.activeDays ? Math.round(sheet.total / sheet.activeDays) : 0;
    var counts = sheet.counts;
    var absentTotal = sheet.absentDays + counts.holidays;
    var balance = sheet.balance;
    var body = [
      controls(state, ctx, canPick, people, personId, sheet),
      D.el('div', { class: 'ts-stats' }, [
        stat('Przepracowano', TL.duration(sheet.total), sheet.target ? 'z normy ' + TL.duration(sheet.target) + ' · ' + pct + '%' : 'bez normy w tym okresie', sheet.target ? D.el('span', { class: 'ts-meter' }, [D.el('i', { style: { width: Math.min(100, pct) + '%' } })]) : null),
        stat('Bilans minut', balance ? signedLong(balance) : '0 min', balance < 0 ? 'brakuje do normy w rozliczonych dniach' : (balance > 0 ? 'nadwyżka w rozliczonych dniach' : 'norma wypełniona co do minuty')),
        stat('Dni z zapisem', sheet.activeDays + ' z ' + (sheet.workdays - sheet.absentDays), 'średnio ' + (avg ? TL.duration(avg) : '—') + ' dziennie'),
        stat('Nieobecności', absentTotal ? absentTotal + (absentTotal === 1 ? ' dzień' : ' dni') : 'brak', sheet.rows.length ? F2(sheet.rows.length, 'projekt', 'projekty', 'projektów') + ' w okresie' : 'brak zapisu', absencePills(counts))
      ]),
      D.el('section', { class: 'an-card ts-calcard' }, [calendar(sheet, ctx)]),
      sheet.rows.length ? card('Projekty w okresie', 'Kliknij strzałkę, aby zobaczyć zadania.', projectList(sheet, state, ctx)) : UI.emptyState({ icon: 'clock', title: 'Brak zapisanego czasu w tym okresie', text: 'Włącz zegar przy zadaniu (▶), dopisz czas z menu zadania albo zaznacz przedział na osi dnia w Mojej pracy.' })
    ];
    return { body: body, sheet: sheet, summary: sheet.period.title + ' · ' + TL.duration(sheet.total) + (sheet.target ? ' z ' + TL.duration(sheet.target) : '') };
  }

  function F2(n, one, few, many) { return E.Format.count(n, one, few, many); }

  /* ---------- Plan obciążenia ---------- */

  /* ---------- Całość ---------- */

  function view(state, ctx) {
    var now = new Date();
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me) {
      return { summary: 'Karta czasu i plan obciążenia.', tools: null, body: E.Welcome.card(state, ctx, 'Karta czasu zbiera godziny zapisane przez Ciebie, a plan obciążenia pokazuje, ile pracy czeka w kolejnych tygodniach.') };
    }
    var part = sheetView(state, ctx, me, now);
    var personId = Budget.isManagement(me.id, state.workspace.people || []) && state.timePerson && Team.findPerson(state.workspace.people || [], state.timePerson) ? state.timePerson : me.id;
    var tools = D.el('div', { class: 'ts-export' }, [
      UI.button({ label: 'Eksport', icon: 'download', iconRight: 'chevronDown', variant: 'secondary', attrs: { 'data-fk': 'ts-export-menu' }, class: 'ts-export__btn' })
    ]);
    E.Menu.bind(tools.firstChild, function () {
      return {
        label: 'Eksport czasu pracy', items: [
          { type: 'label', label: 'Ewidencja za miesiąc' }
        ].concat(Budget.isManagement(me.id, state.workspace.people || []) ? [
          { label: 'Rzeczywisty czas – wydruk', icon: 'download', onSelect: function () { ctx.actions.exportRecord(1, 'print', personId); } },
          { label: 'Rzeczywisty czas – Excel (CSV)', icon: 'download', onSelect: function () { ctx.actions.exportRecord(1, 'csv', personId); } }
        ] : []).concat([
          { label: 'Ewidencja czasu pracy – wydruk', icon: 'download', onSelect: function () { ctx.actions.exportRecord(2, 'print', personId); } },
          { label: 'Ewidencja czasu pracy – Excel (CSV)', icon: 'download', onSelect: function () { ctx.actions.exportRecord(2, 'csv', personId); } }
        ])
      };
    });
    var main = D.el('div', { class: 'ts' }, part.body.filter(Boolean));
    return { summary: part.summary, tools: tools, body: main };
  }

  E.TimeScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
