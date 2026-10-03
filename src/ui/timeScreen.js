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

  function controls(state, ctx, canPick, people, personId) {
    var a = ctx.actions;
    var mode = state.timeMode === 'month' ? 'month' : 'week';
    var seg = UI.segmented({
      label: 'Okres', value: mode,
      items: [{ value: 'week', label: 'Tydzień' }, { value: 'month', label: 'Miesiąc' }],
      onChange: function (value) { a.setTime({ timeMode: value, timeOffset: 0 }); }
    });
    var offset = state.timeOffset || 0;
    var bar = [
      seg.node,
      D.el('div', { class: 'ts-nav', attrs: { role: 'group', 'aria-label': 'Przesuń okres' } }, [
        UI.iconButton({ icon: 'chevronLeft', label: mode === 'month' ? 'Poprzedni miesiąc' : 'Poprzedni tydzień', attrs: { 'data-fk': 'ts-prev' }, onClick: function () { a.setTime({ timeOffset: offset - 1 }); } }),
        UI.iconButton({ icon: 'chevronRight', label: mode === 'month' ? 'Następny miesiąc' : 'Następny tydzień', attrs: { 'data-fk': 'ts-next' }, onClick: function () { a.setTime({ timeOffset: offset + 1 }); } }),
        offset !== 0 ? UI.button({ label: mode === 'month' ? 'Ten miesiąc' : 'Ten tydzień', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'ts-today' }, onClick: function () { a.setTime({ timeOffset: 0 }); } }) : null
      ])
    ];
    if (canPick) {
      var select = UI.select({
        id: 'ts-person', value: personId,
        options: people.filter(function (p) { return p.active !== false; }).map(function (p) { return { value: p.id, label: Team.fullName(p) }; }),
        on: { change: function () { a.setTime({ timePerson: select.value }); } }, attrs: { 'aria-label': 'Osoba', 'data-fk': 'ts-person' }
      });
      bar.push(select);
    }
    return D.el('div', { class: 'ts-bar' }, bar);
  }

  /* Karta jak mapa cieplna w Analizie: karta z tytułem, siatka zaokrąglonych komórek, podsumowanie po prawej. */
  function card(title, subtitle, body, cls) {
    return D.el('section', { class: 'an-card ' + (cls || '') }, [
      D.el('header', { class: 'an-card__head' }, [D.el('h3', { class: 'an-card__title', text: title }), subtitle ? D.el('p', { class: 't-meta', text: subtitle }) : null]),
      body
    ]);
  }

  /** Barwa komórki obciążenia: spokojna → bursztyn → czerwień (jak w Analizie). */
  function loadStyle(ratio) {
    if (!ratio) return null;
    var tone = ratio > 1.05 ? 'var(--alarm)' : (ratio > 0.85 ? 'var(--warn)' : 'var(--flow)');
    return { background: 'color-mix(in srgb, ' + tone + ' ' + Math.round(14 + Math.min(1, ratio) * 62) + '%, transparent)' };
  }

  function heatCell(minutes, hue, tone, target, day, label) {
    var t = Math.max(0, Math.min(1, minutes / (target || 480)));
    return D.el('span', {
      class: 'an-hm__c ts-hm__c' + (minutes ? ' has-time' : '') + (day.today ? ' is-today' : '') + (day.weekend ? ' is-weekend' : '') + (t > 0.6 ? ' is-strong' : ''),
      style: minutes ? { '--hue': String(hue), '--tone': String(tone), '--t': String(t) } : null,
      attrs: { role: 'cell', 'data-tooltip': minutes ? label + ': ' + TL.duration(minutes) : null }
    }, [minutes ? h(minutes) : '']);
  }

  function sumCell(minutes, share, bad) {
    return D.el('span', { class: 'an-hm__sum t-num', attrs: { role: 'cell' } }, [
      D.el('b', { text: minutes ? TL.duration(minutes) : '—' }),
      share !== null ? D.el('span', { class: 'an-hm__pct' + (bad ? ' is-bad' : ''), text: share + '%' }) : null
    ]);
  }

  function sheetTable(sheet, state, ctx) {
    var open = state.timeOpen || {};
    var a = ctx.actions;
    var n = sheet.days.length;
    var cols = 'minmax(10rem, 15rem) repeat(' + n + ', minmax(' + (n > 10 ? '1.35rem' : '2.4rem') + ', 1fr)) 6.5rem';
    var rowStyle = { '--cols': cols, minWidth: (n > 10 ? 10 + n * 1.5 + 6.5 : 34) + 'rem' };

    var head = D.el('div', { class: 'an-hm__row an-hm__row--head ts-hm__head', style: rowStyle, attrs: { role: 'row' } }, [D.el('span', { class: 'an-hm__who' })]
      .concat(sheet.days.map(function (d) {
        return D.el('span', { class: 'an-hm__wk ts-hm__day' + (d.today ? ' is-today' : '') + (d.weekend ? ' is-weekend' : ''), attrs: { role: 'columnheader', 'aria-label': d.label + ' ' + d.number } }, [
          D.el('small', { text: n > 10 ? '' : d.label }), D.el('span', { class: 'ts-hm__num t-num', text: String(d.number) })
        ]);
      }), [D.el('span', { class: 'an-hm__sum', text: 'Razem' })]));

    var body = [];
    sheet.rows.forEach(function (row) {
      var project = projectInfo(ctx, row.projectId);
      var code = project ? project.code : String(row.projectId);
      var hue = Identity.tileHue(code);
      var tone = Identity.tileTone(code);
      var isOpen = !!open[row.projectId];
      var share = sheet.total ? Math.round(row.minutes / sheet.total * 100) : 0;
      body.push(D.el('div', { class: 'an-hm__row ts-hm__row' + (isOpen ? ' is-open' : ''), style: rowStyle, attrs: { role: 'row' } }, [
        D.el('span', { class: 'an-hm__who ts-hm__who', attrs: { role: 'rowheader' } }, [
          D.el('button', { class: 'ts-toggle', attrs: { type: 'button', 'aria-expanded': String(isOpen), 'aria-label': (isOpen ? 'Zwiń zadania projektu ' : 'Rozwiń zadania projektu ') + (project ? project.code : ''), 'data-fk': 'ts-toggle-' + row.projectId }, on: { click: function () { a.toggleTimeProject(row.projectId); } } }, [
            Icons.icon(isOpen ? 'chevronDown' : 'chevronRight', 14)
          ]),
          codePill(project, row.projectId),
          D.el('span', { class: 'ts-pname truncate', text: project ? project.name : 'Usunięty projekt' })
        ])
      ].concat(row.cells.map(function (m, i) { return heatCell(m, hue, tone, sheet.dayTarget, sheet.days[i], (project ? project.code : '') + ' · ' + sheet.days[i].label + ' ' + sheet.days[i].number); }), [
        sumCell(row.minutes, share, false)
      ])));
      if (isOpen) {
        row.tasks.forEach(function (task) {
          body.push(D.el('div', { class: 'an-hm__row ts-hm__row ts-hm__row--task', style: rowStyle, attrs: { role: 'row' } }, [
            D.el('span', { class: 'an-hm__who ts-hm__who', attrs: { role: 'rowheader' } }, [D.el('span', { class: 'ts-tname truncate', text: task.label || 'Zadanie', attrs: { 'data-tooltip': task.label || '' } })])
          ].concat(task.cells.map(function (m, i) { return heatCell(m, hue, tone, sheet.dayTarget, sheet.days[i], (task.label || 'Zadanie') + ' · ' + sheet.days[i].label + ' ' + sheet.days[i].number); }), [
            sumCell(task.minutes, null, false)
          ])));
        });
      }
    });

    var targetPct = sheet.target ? Math.round(sheet.total / sheet.target * 100) : null;
    var foot = D.el('div', { class: 'an-hm__row ts-hm__row ts-hm__foot', style: rowStyle, attrs: { role: 'row' } }, [D.el('span', { class: 'an-hm__who ts-hm__who', attrs: { role: 'rowheader' } }, [D.el('b', { text: 'Razem' })])]
      .concat(sheet.days.map(function (d) {
        var over = d.minutes > sheet.dayTarget;
        return D.el('span', {
          class: 'an-hm__c ts-hm__c ts-hm__total' + (d.today ? ' is-today' : '') + (d.weekend ? ' is-weekend' : ''),
          style: loadStyle(d.weekend ? 0 : d.minutes / sheet.dayTarget) || (d.minutes ? loadStyle(d.minutes / sheet.dayTarget) : null),
          attrs: { role: 'cell', 'data-tooltip': d.minutes ? d.label + ' ' + d.number + ': ' + TL.duration(d.minutes) + ' z ' + TL.duration(sheet.dayTarget) + (over ? ' (+' + TL.duration(d.minutes - sheet.dayTarget) + ')' : '') : null }
        }, [d.minutes ? h(d.minutes) : '']);
      }), [sumCell(sheet.total, targetPct, targetPct !== null && targetPct > 105)]));

    return D.el('div', { class: 'an-hm ts-hm', attrs: { role: 'table', 'aria-label': 'Karta czasu', tabindex: '0' } }, [head].concat(body, [foot]));
  }

  function stat(label, value, sub) {
    return D.el('div', { class: 'ts-stat' }, [
      D.el('span', { class: 'ts-stat__l', text: label }),
      D.el('span', { class: 'ts-stat__v t-num', text: value }),
      sub ? D.el('span', { class: 'ts-stat__s', text: sub }) : null
    ]);
  }

  function sheetView(state, ctx, person, now) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    var people = state.workspace.people || [];
    var canPick = Budget.isManagement(me.id, people);
    var personId = canPick && state.timePerson && Team.findPerson(people, state.timePerson) ? state.timePerson : me.id;
    var who = Team.findPerson(people, personId);
    var sheet = TS.build(state.workspace.entries || [], personId, now, { mode: state.timeMode, offset: state.timeOffset, target: state.prefs.dayTarget });
    var pct = sheet.target ? Math.round(sheet.total / sheet.target * 100) : 0;
    var avg = sheet.activeDays ? Math.round(sheet.total / sheet.activeDays) : 0;
    var body = [
      controls(state, ctx, canPick, people, personId),
      D.el('h2', { class: 'ts-title' }, [D.el('span', { text: sheet.period.title }), personId !== me.id ? D.el('span', { class: 'ts-title__who', text: ' · ' + Team.fullName(who) }) : null]),
      D.el('div', { class: 'ts-stats' }, [
        stat('Zapisano', TL.duration(sheet.total), sheet.rows.length ? F2(sheet.rows.length, 'projekt', 'projekty', 'projektów') : 'brak zapisu'),
        stat('Cel okresu', TL.duration(sheet.target), sheet.target ? pct + '% celu' : ''),
        stat('Dni z zapisem', sheet.activeDays + ' z ' + sheet.days.length, sheet.workdays + ' roboczych'),
        stat('Średnio na dzień', avg ? TL.duration(avg) : '—', 'w dniach z zapisem')
      ]),
      sheet.rows.length
        ? card('Godziny w okresie', 'barwa = projekt, nasycenie = udział w dniu pracy (' + TL.duration(sheet.dayTarget) + '); w wierszu „Razem” barwa = obciążenie dnia', sheetTable(sheet, state, ctx))
        : UI.emptyState({ icon: 'clock', title: 'Brak zapisanego czasu w tym okresie', text: 'Włącz zegar przy zadaniu (▶), dopisz czas z menu zadania albo zaznacz przedział na osi dnia w Mojej pracy.' })
    ];
    return { body: body, sheet: sheet, summary: sheet.period.title + ' · ' + TL.duration(sheet.total) + (sheet.target ? ' z ' + TL.duration(sheet.target) : '') };
  }

  function F2(n, one, few, many) { return E.Format.count(n, one, few, many); }

  /* ---------- Plan obciążenia ---------- */

  function weekLabel(start) {
    var s = new Date(start);
    var e = new Date(start + 6 * 86400000);
    return s.getDate() + (s.getMonth() === e.getMonth() ? '' : ' ' + MONTHS_SHORT[s.getMonth()]) + '–' + e.getDate() + ' ' + MONTHS_SHORT[e.getMonth()];
  }

  function planCell(cell, week, personId, index, selected, ctx) {
    var ratio = cell.capacity > 0 ? cell.planned / cell.capacity : (cell.planned > 0 ? 2 : 0);
    var isSel = selected && selected.personId === personId && selected.week === index;
    return D.el('button', {
      class: 'an-hm__c pl-btn pl-btn--' + cell.state + (cell.planned ? '' : ' is-empty') + (isSel ? ' is-selected' : ''),
      style: loadStyle(ratio),
      attrs: { type: 'button', role: 'cell', 'aria-pressed': String(!!isSel), 'data-fk': 'pl-cell-' + personId + '-' + index, 'data-tooltip': cell.planned ? hh(cell.planned) + ' h planu przy pojemności ' + hh(cell.capacity) + ' h' + (cell.state === 'over' ? ' — przeciążenie' : '') : 'Brak zaplanowanej pracy' },
      on: { click: function () { ctx.actions.setTime({ planCell: isSel ? null : { personId: personId, week: index } }); } }
    }, [cell.planned ? D.el('span', { class: 'pl-btn__txt t-num' }, [D.el('b', { text: hh(cell.planned) }), D.el('small', { text: ' / ' + hh(cell.capacity) })]) : '']);
  }

  function planDetail(selected, plan, people, ctx) {
    if (!selected) return null;
    var row = plan.rows.filter(function (r) { return r.personId === selected.personId; })[0];
    if (!row) return null;
    var isFree = selected.week === 'free';
    var list = isFree ? row.unscheduled.tasks : (row.weeks[selected.week] ? row.weeks[selected.week].tasks : []);
    var person = Team.findPerson(people, selected.personId);
    var title = (person ? Team.fullName(person) : '') + ' · ' + (isFree ? 'zadania bez terminu' : 'tydzień ' + weekLabel(plan.weeks[selected.week].start));
    return D.el('section', { class: 'pl-detail', attrs: { 'aria-label': title } }, [
      D.el('h3', { class: 'pl-detail__title', text: title }),
      list.length ? D.el('ul', { class: 'pl-tasks' }, list.map(function (t) {
        var project = projectInfo(ctx, t.projectId);
        return D.el('li', { class: 'pl-task' }, [
          codePill(project, t.projectId),
          D.el('button', { class: 'pl-task__name truncate', attrs: { type: 'button' }, text: t.name, on: { click: function () { ctx.actions.inspect({ kind: 'task', projectId: t.projectId, stageId: t.stageId, taskId: t.taskId }); } } }),
          D.el('span', { class: 'pl-task__late', text: t.overdue ? 'po terminie' : '' }),
          D.el('span', { class: 'pl-task__h t-num', text: hh(t.hours) + ' h' })
        ]);
      })) : D.el('p', { class: 'pl-detail__empty', text: 'Brak zadań w tym okresie.' })
    ]);
  }

  function planView(state, ctx, now) {
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    var management = Budget.isManagement(me.id, people);
    var plan = Plan.build({
      projects: state.workspace.projects, people: people, entries: state.workspace.entries || [], now: now,
      target: state.prefs.dayTarget, weeks: 6, personIds: management ? null : [me.id]
    });
    var selected = state.planCell || null;
    var overCount = plan.rows.filter(function (r) { return r.weeks.some(function (c) { return c.state === 'over'; }); }).length;
    var rowStyle = { '--cols': 'minmax(10rem, 14rem) repeat(' + (plan.weeks.length + 1) + ', minmax(4.2rem, 1fr))', minWidth: '44rem' };
    var head = D.el('div', { class: 'an-hm__row an-hm__row--head', style: rowStyle, attrs: { role: 'row' } }, [D.el('span', { class: 'an-hm__who' })]
      .concat(plan.weeks.map(function (w) {
        return D.el('span', { class: 'an-hm__wk pl-week' + (w.current ? ' is-current' : ''), attrs: { role: 'columnheader' } }, [D.el('span', { text: weekLabel(w.start) }), D.el('small', { text: w.current ? 'bieżący' : (w.workdays + ' dni rob.') })]);
      }), [D.el('span', { class: 'an-hm__wk pl-week', attrs: { role: 'columnheader' } }, [D.el('span', { text: 'Bez terminu' }), D.el('small', { text: 'nie wliczone' })])]));
    var body = plan.rows.map(function (row) {
      var person = Team.findPerson(people, row.personId);
      var freeOn = selected && selected.personId === row.personId && selected.week === 'free';
      return D.el('div', { class: 'an-hm__row', style: rowStyle, attrs: { role: 'row' } }, [D.el('span', { class: 'an-hm__who truncate', attrs: { role: 'rowheader' } }, [E.Avatar.avatar(person, { size: 'sm', tooltip: false }), D.el('span', { class: 'truncate', text: Team.fullName(person) })])]
        .concat(row.weeks.map(function (cell, i) { return planCell(cell, plan.weeks[i], row.personId, i, selected, ctx); }), [
          D.el('button', {
            class: 'an-hm__c pl-btn pl-btn--free' + (row.unscheduled.hours ? '' : ' is-empty') + (freeOn ? ' is-selected' : ''), attrs: { type: 'button', role: 'cell', 'data-fk': 'pl-free-' + row.personId, 'aria-pressed': String(!!freeOn) },
            on: { click: function () { ctx.actions.setTime({ planCell: freeOn ? null : { personId: row.personId, week: 'free' } }); } }
          }, [row.unscheduled.hours ? D.el('span', { class: 'pl-btn__txt t-num' }, [D.el('b', { text: hh(row.unscheduled.hours) }), D.el('small', { text: ' h' })]) : ''])
        ]));
    });
    var grid = D.el('div', { class: 'an-hm pl-hm', attrs: { role: 'table', 'aria-label': 'Plan obciążenia', tabindex: '0' } }, [head].concat(body));
    return {
      summary: management ? (overCount ? F2(overCount, 'osoba przeciążona', 'osoby przeciążone', 'osób przeciążonych') + ' w najbliższych tygodniach' : 'Nikt nie jest przeciążony w najbliższych tygodniach') : 'Twój plan na najbliższe tygodnie',
      body: [
        D.el('p', { class: 'pl-intro', text: 'Plan liczy godziny z otwartych zadań (szacunek albo wartość z nakładu pracy, pomniejszone o zapisany już czas) i rozkłada je na dni robocze do terminu. Kliknij komórkę, żeby zobaczyć zadania.' + (management ? '' : ' Plan całego zespołu widzi zarząd.') }),
        plan.rows.length
          ? card('Obciążenie tydzień po tygodniu', 'godziny do zrobienia z otwartych zadań; barwa = udział w pojemności tygodnia (' + hh((state.prefs.dayTarget || 480) / 60) + ' h na dzień)', grid)
          : UI.emptyState({ icon: 'people', title: 'Brak osób w planie', text: 'Dodaj osoby do zespołu i przypisz im zadania z terminami.' }),
        planDetail(selected, plan, people, ctx),
        D.el('div', { class: 'pl-legend', attrs: { 'aria-hidden': 'true' } }, [
          D.el('span', { class: 'pl-legend__i pl-legend__i--ok', text: 'do 85% pojemności' }),
          D.el('span', { class: 'pl-legend__i pl-legend__i--tight', text: '85–100%: napięty' }),
          D.el('span', { class: 'pl-legend__i pl-legend__i--over', text: 'ponad 100%: przeciążenie' })
        ])
      ]
    };
  }

  /* ---------- Całość ---------- */

  function tabsBar(tab, ctx) {
    var items = [['sheet', 'Karta czasu'], ['plan', 'Plan obciążenia']];
    return D.el('div', { class: 'an-tabs', attrs: { role: 'tablist', 'aria-label': 'Widoki czasu' } }, items.map(function (it) {
      var on = tab === it[0];
      return D.el('button', { class: 'an-tabs__tab' + (on ? ' is-active' : ''), attrs: { type: 'button', role: 'tab', 'aria-selected': String(on), 'data-fk': 'time-tab-' + it[0] }, on: { click: function () { ctx.actions.setTime({ timeTab: it[0] }); } } }, [D.el('span', { text: it[1] })]);
    }));
  }

  function view(state, ctx) {
    var now = new Date();
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me) {
      return { summary: 'Karta czasu i plan obciążenia.', tools: null, body: E.Welcome.card(state, ctx, 'Karta czasu zbiera godziny zapisane przez Ciebie, a plan obciążenia pokazuje, ile pracy czeka w kolejnych tygodniach.') };
    }
    var tab = state.timeTab === 'plan' ? 'plan' : 'sheet';
    var tools = null;
    var part;
    if (tab === 'plan') {
      part = planView(state, ctx, now);
    } else {
      part = sheetView(state, ctx, me, now);
      var sheet = part.sheet;
      var personId = Budget.isManagement(me.id, state.workspace.people || []) && state.timePerson && Team.findPerson(state.workspace.people || [], state.timePerson) ? state.timePerson : me.id;
      tools = D.el('div', { class: 'ts-export' }, [
        UI.button({ label: 'Pobierz CSV', icon: 'download', variant: 'secondary', attrs: { 'data-fk': 'ts-export-menu' }, class: 'ts-export__btn' })
      ]);
      var trigger = tools.firstChild;
      E.Menu.bind(trigger, function () {
        return {
          label: 'Eksport karty czasu', items: [
            { label: 'Podsumowanie okresu (projekty i zadania × dni)', icon: 'download', onSelect: function () { ctx.actions.exportTime('summary', personId); } },
            { label: 'Wszystkie wpisy okresu (do rozliczeń)', icon: 'download', onSelect: function () { ctx.actions.exportTime('entries', personId); } }
          ]
        };
      });
      void sheet;
    }
    var todays = TL.forDay(state.workspace.entries || [], me.id, now);
    var minutes = TL.sum(todays, now);
    var main = D.el('div', { class: 'ts' }, [tabsBar(tab, ctx)].concat(part.body.filter(Boolean)));
    return {
      summary: part.summary, tools: tools,
      body: UI.railLayout({
        id: 'time', title: 'Panel dnia', cls: 'rl--time',
        collapsed: (state.prefs.collapsedRails || []).indexOf('time') >= 0,
        onToggle: function () { ctx.actions.toggleRail('time'); },
        badge: minutes ? (TL.hoursOf(minutes) + " h").replace(".", ",") : '',
        main: [main],
        side: [D.el('div', { class: 'mywork__aside' }, [E.Timer.todayBlock(todays, { find: ctx.find, actions: ctx.actions, entries: state.workspace.entries || [], meId: me.id })])]
      })
    };
  }

  E.TimeScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
