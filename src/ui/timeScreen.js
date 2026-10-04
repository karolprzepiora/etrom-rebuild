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

  // Jak w Analizie: jedna skala barw (spokojna → bursztyn → czerwień) i całe godziny w gęstym widoku miesiąca.
  var compact = false;
  function cellText(minutes) { return minutes ? (compact ? String(Math.round(minutes / 60)) : h(minutes)) : ''; }

  function heatCell(minutes, hue, tone, target, day, label) {
    return D.el('span', {
      class: 'an-hm__c ts-hm__c' + (day.today ? ' is-today' : '') + (day.weekend ? ' is-weekend' : ''),
      style: minutes ? { background: 'color-mix(in srgb, var(--flow) ' + Math.round(14 + Math.min(1, minutes / (target || 480)) * 22) + '%, transparent)' } : null,
      attrs: { role: 'cell', 'data-tooltip': minutes ? label + ': ' + TL.duration(minutes) : null }
    }, [cellText(minutes)]);
  }

  function sumCell(minutes, share, bad, state) {
    return D.el('span', { class: 'an-hm__sum t-num' + (state && state !== 'off' ? ' is-' + state : ''), attrs: { role: 'cell' } }, [
      D.el('b', { text: minutes ? TL.duration(minutes) : '—' }),
      share !== null ? D.el('span', { class: 'an-hm__pct' + (bad ? ' is-bad' : ''), text: share + '%' }) : null
    ]);
  }

  function sheetTable(sheet, state, ctx) {
    var open = state.timeOpen || {};
    var a = ctx.actions;
    var n = sheet.days.length;
    compact = n > 10;
    var cols = 'minmax(10rem, 15rem) repeat(' + n + ', minmax(' + (n > 10 ? '1.35rem' : '2.4rem') + ', 1fr)) 6.5rem';
    var rowStyle = { '--cols': cols, minWidth: (n > 10 ? 10 + n * 1.5 + 6.5 : 34) + 'rem' };

    var head = D.el('div', { class: 'an-hm__row an-hm__row--head ts-hm__head', style: rowStyle, attrs: { role: 'row' } }, [D.el('span', { class: 'an-hm__who' })]
      .concat(sheet.days.map(function (d) {
        return D.el('span', { class: 'an-hm__wk ts-hm__day' + (d.today ? ' is-today' : '') + (d.weekend ? ' is-weekend' : ''), text: n > 10 ? String(d.number) : d.label + ' ' + d.number, attrs: { role: 'columnheader', 'aria-label': d.label + ' ' + d.number } });
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
        var verdict = { ok: 'Cel dnia osiągnięty', warn: 'Do celu brakuje mniej niż godziny', bad: 'Poniżej celu dnia', run: 'Dzień w trakcie: jeszcze ' + TL.duration(Math.max(0, sheet.dayTarget - d.minutes)) }[d.state] || '';
        return D.el('span', {
          class: 'an-hm__c ts-hm__c ts-hm__total is-' + d.state + (d.today ? ' is-today' : '') + (d.weekend ? ' is-weekend' : ''),
          attrs: { role: 'cell', 'data-tooltip': (d.minutes ? d.label + ' ' + d.number + ': ' + TL.duration(d.minutes) + ' z ' + TL.duration(sheet.dayTarget) + (over ? ' (+' + TL.duration(d.minutes - sheet.dayTarget) + ')' : '') : d.label + ' ' + d.number + ': brak zapisanego czasu') + (verdict ? ' · ' + verdict : '') }
        }, [d.state === 'run' ? TL.hoursOf(d.minutes).toString().replace('.', ',') + ' / ' + TL.hoursOf(sheet.dayTarget).toString().replace('.', ',') : (d.state === 'bad' || d.state === 'warn' || d.minutes ? cellText(d.minutes) || '0' : '')]);
      }), [sumCell(sheet.total, targetPct, false, sheet.state)]));

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
        ? card('Godziny w okresie', 'wiersz „Razem”: zielony od ' + TL.duration(sheet.dayTarget) + ', żółty do godziny poniżej, czerwony niżej', sheetTable(sheet, state, ctx))
        : UI.emptyState({ icon: 'clock', title: 'Brak zapisanego czasu w tym okresie', text: 'Włącz zegar przy zadaniu (▶), dopisz czas z menu zadania albo zaznacz przedział na osi dnia w Mojej pracy.' })
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
      UI.button({ label: 'Pobierz CSV', icon: 'download', variant: 'secondary', attrs: { 'data-fk': 'ts-export-menu' }, class: 'ts-export__btn' })
    ]);
    E.Menu.bind(tools.firstChild, function () {
      return {
        label: 'Eksport karty czasu', items: [
          { label: 'Podsumowanie okresu (projekty i zadania × dni)', icon: 'download', onSelect: function () { ctx.actions.exportTime('summary', personId); } },
          { label: 'Wszystkie wpisy okresu (do rozliczeń)', icon: 'download', onSelect: function () { ctx.actions.exportTime('entries', personId); } }
        ]
      };
    });
    var todays = TL.forDay(state.workspace.entries || [], me.id, now);
    var minutes = TL.sum(todays, now);
    var main = D.el('div', { class: 'ts' }, part.body.filter(Boolean));
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
