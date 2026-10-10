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
  var Cal = E.Calendar;
  var WL = E.WeekLock;
  var Team = E.Team;
  var Budget = E.Budget;
  var Identity = E.Identity;

  var MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

  var DAYS_FULL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function keyOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  /** Dzień oglądany w widoku Dzień: dziś przesunięte o `offset` dni (0 = dziś, ujemne = wstecz). */
  function shownDay(now, offset) { return new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.min(0, Number(offset) || 0), 12); }
  /** Przesunięcie okresu (dni, tygodnie albo miesiące od dziś) potrzebne, by pokazać wskazany dzień. */
  function offsetFor(mode, iso) {
    var now = new Date();
    var d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12);
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    if (mode === 'month') return (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth();
    if (mode === 'day') return Math.min(0, Math.round((d - today) / 86400000));
    var mon = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate() - ((x.getDay() + 6) % 7), 12); };
    return Math.round((mon(d) - mon(today)) / (7 * 86400000));
  }
  function dayTitle(d, offset) { return (offset ? '' : 'Dziś · ') + DAYS_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + (offset ? ' ' + d.getFullYear() : ''); }

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
    if (mode === 'day') {
      var dOff = Math.min(0, offset);
      var shown = shownDay(new Date(), dOff);
      return D.el('div', { class: 'ts-bar' }, [seg.node,
        D.el('div', { class: 'ts-nav', attrs: { role: 'group', 'aria-label': 'Przesuń dzień' } }, [
          UI.iconButton({ icon: 'chevronLeft', label: 'Poprzedni dzień', attrs: { 'data-fk': 'ts-prev' }, onClick: function () { a.setTime({ timeOffset: dOff - 1 }); } }),
          D.el('h2', { class: 'ts-title', attrs: { 'data-fk': 'ts-day-title' } }, [E.CalBars.dateJump({ text: dayTitle(shown, dOff), value: keyOf(shown), fk: 'ts-jump', onPick: function (v) { a.setTime({ timeOffset: offsetFor('day', v) }); } })]),
          UI.iconButton({ icon: 'chevronRight', label: 'Następny dzień', disabled: dOff >= 0, attrs: { 'data-fk': 'ts-next' }, onClick: function () { a.setTime({ timeOffset: Math.min(0, dOff + 1) }); } }),
          dOff !== 0 ? UI.button({ label: 'Dziś', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'ts-today' }, onClick: function () { a.setTime({ timeOffset: 0 }); } }) : null
        ])
      ]);
    }
    var title = sheet.period.title;
    var bar = [
      seg.node,
      select,
      D.el('div', { class: 'ts-nav', attrs: { role: 'group', 'aria-label': 'Przesuń okres' } }, [
        UI.iconButton({ icon: 'chevronLeft', label: mode === 'month' ? 'Poprzedni miesiąc' : 'Poprzedni tydzień', attrs: { 'data-fk': 'ts-prev' }, onClick: function () { a.setTime({ timeOffset: offset - 1 }); } }),
        D.el('h2', { class: 'ts-title' }, [E.CalBars.dateJump({ text: title, value: keyOf(new Date()), fk: 'ts-jump', onPick: function (v) { a.setTime({ timeOffset: offsetFor(mode, v) }); } })]),
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

  var ABS_TAG = { leave: 'U', sick: 'L4', training: 'Szk', other: 'OP', childcare: 'OD', occasional: 'UO', unpaid: 'UB' };
  var ABS_NAME = { leave: 'Urlop', sick: 'Zwolnienie lekarskie', training: 'Szkolenie', other: 'Inna nieobecność', childcare: 'Opieka nad dzieckiem', occasional: 'Urlop okolicznościowy', unpaid: 'Urlop bezpłatny' };

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
    if (d.trip) {
      tip += ' · wyjazd: ' + d.trip.place + ' (' + d.trip.from + '–' + d.trip.to + (d.trip.credited ? ', doliczono ' + TL.duration(d.trip.credited) : '') + ')';
      if (!tag) children.push(D.el('span', { class: 'ts-day__trip truncate', text: 'Wyjazd · ' + d.trip.place }));
    }
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
      E.CalBars.legendBar('time')
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
    var offset = Math.min(0, Number(state.timeOffset) || 0);
    var date = shownDay(now, offset);
    var key = keyOf(date);
    var past = offset !== 0;
    var todays = TL.forDay(state.workspace.entries || [], me.id, now, key);
    var base = TL.sum(todays, now);
    /* Arkusz tygodnia, w którym leży oglądany dzień: z niego bierzemy wyjazd i normę dnia. */
    var mon = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12); };
    var weekOffset = Math.round((mon(date) - mon(now)) / (7 * 86400000));
    var todaySheet = TS.build(state.workspace.entries || [], me.id, now, { mode: 'week', offset: weekOffset, target: state.prefs.dayTarget, absences: state.workspace.absences || [], trips: state.workspace.trips || [] });
    var today = todaySheet.days.filter(function (d) { return d.key === key; })[0];
    var trip = today && today.trip ? today.trip : null;
    var minutes = base + (trip ? trip.credited : 0);
    var seg = controls(Object.assign({}, state, { timeMode: 'day' }), ctx, false, [], me.id, null);
    var target = past && today && typeof today.norm === 'number' ? today.norm : (state.prefs.dayTarget || 480);
    var left = Math.max(0, target - minutes);
    var pct = target ? Math.round(minutes / target * 100) : 0;
    var codes = {};
    todays.forEach(function (e) { codes[e.projectId || e.code || e.taskId] = 1; });
    var nProj = Object.keys(codes).length;
    var stats = D.el('div', { class: 'ts-stats' }, [
      stat(past ? 'Przepracowano' : 'Przepracowano dziś', TL.duration(minutes), target ? 'z normy ' + TL.duration(target) + ' · ' + pct + '%' : 'dzień bez normy', D.el('span', { class: 'ts-meter' }, [D.el('i', { style: { width: Math.min(100, pct) + '%' } })])),
      stat(minutes > target ? 'Nadwyżka' : 'Do celu dnia', TL.duration(Math.abs(target - minutes)), minutes > target ? 'ponad normę dnia' : (left ? 'zostało do normy' : (target ? 'norma wypełniona' : 'dzień wolny od pracy'))),
      stat('Wpisy', String(todays.length), todays.length ? 'zapisanych odcinków czasu' : 'brak zapisu'),
      stat('Projekty', String(nProj), nProj ? F2(nProj, 'projekt', 'projekty', 'projektów') + (past ? '' : ' dziś') : 'brak zapisu')
    ]);
    var tripCard = trip ? D.el('section', { class: 'an-card ts-trip', attrs: { 'data-fk': 'ts-trip' } }, [
      D.el('div', { class: 'ts-trip__t' }, [
        D.el('b', { text: 'Wyjazd · ' + trip.place }),
        D.el('span', { class: 't-meta', text: trip.from + '–' + trip.to + ' · ' + TL.duration(trip.planned || trip.minutes) + (trip.credited ? ' (doliczone do czasu pracy: ' + TL.duration(trip.credited) + (trip.planned && trip.credited < trip.planned && !todays.length ? ', reszta po godzinie ' + trip.to : '') + ')' : (todays.length ? ' (pokrywa je rejestrator)' : (trip.planned && !trip.minutes ? ' (jeszcze się nie zaczął)' : ''))) })
      ]),
      D.el('p', { class: 't-meta', text: todays.length ? 'Dziś działa też pomiar czasu. Ustaw godziny wyjazdu, a reszta dnia policzy się z rejestratora.' : 'Bez pomiaru czasu wyjazd liczy się jako pełny dzień pracy. Jeśli jechałeś krócej, ustaw godziny wyjazdu.' }),
      UI.button({ label: 'Zmień godziny wyjazdu', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'ts-trip-edit' }, onClick: function () { ctx.actions.openTrip(trip.tripId); } })
    ]) : null;
    var repeat = !todays.length && !(today && (today.weekend || today.holiday)) && key <= keyOf(now)
      ? UI.button({ label: 'Powtórz wpisy z poprzedniego dnia', icon: 'plus', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'ts-repeat' }, onClick: function () { ctx.actions.repeatDay(key); } }) : null;
    var side = D.el('section', { class: 'an-card ts-calcard ts-day-view' }, [
      D.el('div', { class: 'ts-day-view__main' }, [
        E.Timer.todayBlock(todays, { find: ctx.find, actions: ctx.actions, entries: state.workspace.entries || [], meId: me.id, pending: null, noLive: true, noShares: true, noResume: true, openLog: true, date: past ? key : null, title: past ? 'Zapisane tego dnia' : null, target: target })
      ])
    ]);
    return { body: [seg, stats, tripCard, repeat ? D.el('div', { class: 'ts-repeat' }, [repeat]) : null, side].filter(Boolean), summary: (past ? dayTitle(date, offset) : 'Dziś') + ' · ' + TL.duration(minutes) + (target ? ' z ' + TL.duration(target) : '') };
  }

  var MARK = { ok: ['✓', 'norma'], warn: ['!', 'brakuje do godziny'], bad: ['✕', 'brakuje więcej niż godziny'], off: ['–', 'brak oceny'], run: ['…', 'dzień trwa'] };
  var DAYS5 = ['pn', 'wt', 'śr', 'cz', 'pt'];

  /** Pasek zamknięcia tygodnia: status, zamknięcie, zatwierdzenie lub zwrot. Blokada edycji działa w akcjach czasu. */
  function weekBar(state, ctx, sheet, me, personId, now) {
    var monday = Cal.isoOf(sheet.period.from);
    if (monday > Cal.isoOf(now)) return null;
    var locks = state.workspace.timeLocks || [];
    var lock = WL.find(locks, personId, monday);
    var projects = state.workspace.projects || [];
    var mgmt = Budget.isManagement(me.id, state.workspace.people || []);
    var own = personId === me.id;
    var canDecide = WL.canDecide(me.id, personId, projects, mgmt);
    var status = lock ? WL.STATUS[lock.status] : 'otwarty';
    var parts = [D.el('span', { class: 'ts-wk__t' }, [D.el('b', { text: 'Tydzień: ' }), D.el('span', { class: 'ts-wk__s is-' + (lock ? lock.status : 'open'), text: status })])];
    if (lock && lock.status === 'returned' && lock.note) parts.push(D.el('span', { class: 't-meta', text: lock.note }));
    var btn = function (label, fk, variant, fn) { return UI.button({ label: label, variant: variant, size: 'sm', attrs: { 'data-fk': fk }, onClick: fn }); };
    var a = ctx.actions;
    if (!lock || lock.status === 'returned') { if (own || mgmt) parts.push(btn(lock ? 'Zamknij ponownie' : 'Zamknij tydzień', 'ts-wk-close', 'secondary', function () { a.closeWeek(monday, personId); })); }
    else if (lock.status === 'submitted') {
      if (own) parts.push(btn('Cofnij zgłoszenie', 'ts-wk-reopen', 'ghost', function () { a.reopenWeek(personId, monday); }));
      if (canDecide) { parts.push(btn('Zatwierdź', 'ts-wk-approve', 'primary', function () { a.decideWeek(personId, monday, 'approve'); })); parts.push(btn('Zwróć do poprawy', 'ts-wk-return', 'ghost', function () { a.decideWeek(personId, monday, 'return'); })); }
    } else if (canDecide) parts.push(btn('Otwórz ponownie', 'ts-wk-reopen', 'ghost', function () { a.reopenWeek(personId, monday); }));
    return D.el('div', { class: 'ts-wk', attrs: { 'data-fk': 'ts-week-bar', role: 'status' } }, parts);
  }

  /** Mapa kompletności tygodnia dla zarządu i liderów: kto uzupełnił czas, kto czeka na zatwierdzenie. */
  function completenessCard(state, ctx, sheet, me, now) {
    var people = (state.workspace.people || []).filter(function (p) { return p.active !== false; });
    var projects = state.workspace.projects || [];
    var mgmt = Budget.isManagement(me.id, state.workspace.people || []);
    var led = {};
    projects.forEach(function (p) { if (p.team && p.team.leader === me.id) (p.stages || []).forEach(function (st) { (st.tasks || []).forEach(function (t) { (t.assignees || []).forEach(function (id) { led[id] = 1; }); }); }); });
    var list = people.filter(function (p) { return p.id !== me.id && (mgmt || led[p.id]); });
    if (!list.length) return null;
    var monday = Cal.isoOf(sheet.period.from);
    if (monday > Cal.isoOf(now)) return null;
    var rows = WL.completeness(state.workspace.entries || [], list, monday, now, { target: state.prefs.dayTarget, absences: state.workspace.absences || [], trips: state.workspace.trips || [], locks: state.workspace.timeLocks || [] });
    var head = D.el('div', { class: 'ts-cm__row ts-cm__head' }, [D.el('span', { text: 'Osoba' })].concat(DAYS5.map(function (d) { return D.el('span', { text: d }); }), [D.el('span', { text: 'Razem' }), D.el('span', { text: 'Tydzień' })]));
    var body = rows.map(function (r) {
      var person = Team.findPerson(state.workspace.people || [], r.personId);
      var lock = r.lock;
      var can = lock && lock.status === 'submitted' && WL.canDecide(me.id, r.personId, projects, mgmt);
      return D.el('div', { class: 'ts-cm__row', dataset: { id: r.personId } }, [
        D.el('span', { class: 'truncate', text: person ? Team.fullName(person) : r.personId })
      ].concat(r.days.map(function (d) {
        var key = d.absent ? 'off' : (d.state in MARK ? d.state : 'off');
        var label = d.absent ? (d.absent === 'sick' ? 'L4' : 'U') : (d.holiday ? 'Ś' : MARK[key][0]);
        return D.el('span', { class: 'ts-cm__c is-' + (d.absent ? (d.absent === 'sick' ? 'sick' : 'leave') : (d.holiday ? 'hol' : key)), text: label, attrs: { 'data-tooltip': d.key + ' · ' + (d.absent ? (d.absent === 'sick' ? 'zwolnienie' : 'urlop') : (d.holiday ? 'święto' : MARK[key][1] + ' · ' + TL.duration(d.minutes))), 'aria-label': d.key + ': ' + (d.absent ? 'nieobecność' : (d.holiday ? 'święto' : MARK[key][1])) } });
      }), [
        D.el('span', { class: 't-num', text: TL.duration(r.total) }),
        D.el('span', { class: 'ts-cm__st' }, [
          D.el('span', { class: 'ts-wk__s is-' + (lock ? lock.status : 'open'), text: lock ? WL.STATUS[lock.status] : 'otwarty' }),
          can ? UI.button({ label: 'Zatwierdź', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'ts-cm-approve' }, onClick: function () { ctx.actions.decideWeek(r.personId, monday, 'approve'); } }) : null,
          can ? UI.button({ label: 'Zwróć', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'ts-cm-return' }, onClick: function () { ctx.actions.decideWeek(r.personId, monday, 'return'); } }) : null
        ])
      ]));
    });
    return card('Kompletność czasu · ' + sheet.period.title, 'Kto uzupełnił tydzień. Znaki: ✓ norma, ! brakuje do godziny, ✕ brakuje więcej, – bez oceny.', D.el('div', { class: 'ts-cm', attrs: { 'data-fk': 'ts-completeness' } }, [head].concat(body)));
  }

  function sheetView(state, ctx, person, now) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    var people = state.workspace.people || [];
    var canPick = Budget.isManagement(me.id, people);
    var personId = canPick && state.timePerson && Team.findPerson(people, state.timePerson) ? state.timePerson : me.id;
    var who = Team.findPerson(people, personId);
    if (state.timeMode === 'day') return dayView(state, ctx, me, now);
    var sheet = TS.build(state.workspace.entries || [], personId, now, { mode: state.timeMode, offset: state.timeOffset, target: state.prefs.dayTarget, absences: state.workspace.absences || [], trips: state.workspace.trips || [] });
    var pct = sheet.target ? Math.round(sheet.total / sheet.target * 100) : 0;
    var avg = sheet.activeDays ? Math.round(sheet.total / sheet.activeDays) : 0;
    var counts = sheet.counts;
    var absentTotal = sheet.absentDays + counts.holidays;
    var balance = sheet.balance;
    var year = TS.cumulative(state.workspace.entries || [], personId, now, { target: state.prefs.dayTarget, absences: state.workspace.absences || [], trips: state.workspace.trips || [] });
    var planText = '';
    if (state.timeMode === 'week' && !(Number(state.timeOffset) || 0)) {
      try {
        var pl = E.Plan.build({ projects: state.workspace.projects || [], people: [who], entries: state.workspace.entries || [], now: now, target: state.prefs.dayTarget, weeks: 1, offsetWeeks: 0, absences: state.workspace.absences || [], trips: state.workspace.trips || [] });
        var prow = pl.rows[0];
        var pcell = prow && prow.weeks[0];
        if (pcell && pcell.start === sheet.period.from.getTime() && pcell.planned) planText = ' · plan: jeszcze ' + String(Math.round(pcell.planned * 10) / 10).replace('.', ',') + ' h zadań';
      } catch (err) { planText = ''; }
    }
    var body = [
      controls(state, ctx, canPick, people, personId, sheet),
      D.el('div', { class: 'ts-stats' }, [
        stat('Przepracowano', TL.duration(sheet.total), (sheet.target ? 'z normy ' + TL.duration(sheet.target) + ' · ' + pct + '%' : 'bez normy w tym okresie') + planText, sheet.target ? D.el('span', { class: 'ts-meter' }, [D.el('i', { style: { width: Math.min(100, pct) + '%' } })]) : null),
        stat('Bilans minut', balance ? signedLong(balance) : '0 min', (balance < 0 ? 'brakuje do normy' : (balance > 0 ? 'nadwyżka' : 'norma co do minuty')) + ' · od stycznia: ' + (year ? signedLong(year) : '0 min')),
        stat('Dni z zapisem', sheet.activeDays + ' z ' + (sheet.workdays - sheet.absentDays), 'średnio ' + (avg ? TL.duration(avg) : '—') + ' dziennie'),
        stat('Nieobecności', absentTotal ? absentTotal + (absentTotal === 1 ? ' dzień' : ' dni') : 'brak', sheet.rows.length ? F2(sheet.rows.length, 'projekt', 'projekty', 'projektów') + ' w okresie' : 'brak zapisu', absencePills(counts))
      ]),
      state.timeMode === 'week' ? weekBar(state, ctx, sheet, me, personId, now) : null,
      D.el('section', { class: 'an-card ts-calcard' }, [calendar(sheet, ctx)]),
      state.timeMode === 'week' ? completenessCard(state, ctx, sheet, me, now) : null,
      sheet.rows.length ? card('Projekty w okresie', 'Kliknij strzałkę, aby zobaczyć zadania.', projectList(sheet, state, ctx)) : UI.emptyState({ icon: 'clock', title: 'Brak zapisanego czasu w tym okresie', text: 'Włącz zegar przy zadaniu (▶), dopisz czas z menu zadania albo zaznacz przedział na osi dnia w Mojej pracy.' })
    ];
    body = body.filter(Boolean);
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
