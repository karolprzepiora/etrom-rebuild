/* ETROM — sprawy w toku (UI): formularz, karta w Mojej pracy, okno szczegółów z historią i „Zapytałem”.
   Dane i reguły: src/core/cases.js. Pokazujemy tylko dni od złożenia i przypomnienia, bez terminów ustawowych. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Cases = E.Cases;

  var REMIND_LABEL = { 3: 'co 3 dni', 7: 'co 7 dni', 14: 'co 14 dni', 30: 'co 30 dni' };

  function today() { return Cases.isoOf(new Date()); }
  function shortDay(iso) { return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) : ''; }
  function plural(n) { return n === 1 ? 'dzień' : 'dni'; }

  function findTask(projects, taskId) {
    for (var i = 0; i < (projects || []).length; i += 1) {
      var p = projects[i];
      for (var j = 0; j < (p.stages || []).length; j += 1) {
        var t = (p.stages[j].tasks || []).filter(function (x) { return x.id === taskId; })[0];
        if (t) return { project: p, stage: p.stages[j], task: t };
      }
    }
    return null;
  }

  /** Opis przypomnienia: „dopytaj dziś”, „za 5 dni” albo „zaległe 3 dni”. */
  function remindInfo(c, day) {
    var d = Cases.diffDays(day, c.remindAt);
    if (d < 0) return { due: true, text: 'dopytaj dziś · zaległe ' + (-d) + ' ' + plural(-d) };
    if (d === 0) return { due: true, text: 'dopytaj dziś' };
    return { due: false, text: 'przypomnienie za ' + d + ' ' + plural(d) };
  }

  /* ---------- formularz nowej sprawy ---------- */
  function form(draft, errors, handlers, projects) {
    var v = draft || {};
    var problems = errors || {};
    var project = UI.select({ id: 'cs-project', value: v.projectId === '' || v.projectId == null ? '' : String(v.projectId), options: [{ value: '', label: 'Wybierz projekt' }].concat((projects || []).map(function (p) { return { value: String(p.id), label: p.code + ' · ' + p.name }; })) });
    var name = UI.input({ id: 'cs-name', value: v.name || '', maxlength: 120, placeholder: 'np. Decyzja środowiskowa', error: problems.name });
    var org = UI.input({ id: 'cs-org', value: v.org || '', maxlength: 120, placeholder: 'np. RDOŚ Kraków, nr OO.4210.12' });
    var at = UI.input({ id: 'cs-start', type: 'date', value: v.startedAt || '', error: problems.startedAt });
    var every = UI.select({ id: 'cs-every', value: String(v.remindEvery || 7), options: Cases.REMIND.map(function (n) { return { value: String(n), label: 'Dopytuj ' + REMIND_LABEL[n] }; }) });
    var f = E.Dialog.drawerForm({
      id: 'case-form',
      submitLabel: 'Śledź sprawę',
      onCancel: handlers.onCancel,
      onSubmit: function () {
        handlers.onSubmit({ projectId: project.value, stageId: v.stageId || '', name: name.value, org: org.value, startedAt: at.value, remindEvery: Number(every.value), sourceTaskId: v.sourceTaskId || '' });
      },
      body: [
        UI.field({ id: 'cs-project', label: 'Projekt', control: project, error: problems.projectId }),
        UI.field({ id: 'cs-name', label: 'Nazwa sprawy', control: name, error: problems.name }),
        UI.field({ id: 'cs-org', label: 'Organ i numer sprawy', optional: true, control: org }),
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'cs-start', label: 'Złożono / zamówiono', control: at, error: problems.startedAt }),
          UI.field({ id: 'cs-every', label: 'Przypomnienia', control: every })
        ]),
        D.el('p', { class: 't-meta', text: 'Licznik liczy dni od dnia złożenia. Sprawa zostaje widoczna w Planie i w Mojej pracy, aż ją zakończysz.' })
      ]
    });
    window.setTimeout(function () { (v.projectId ? name : project).focus(); }, 0);
    return f;
  }

  /* ---------- historia sprawy ---------- */
  function glyph(kind, filled) {
    return D.el('span', { class: 'case-glyph case-glyph--' + kind + (filled ? ' is-filled' : ''), attrs: { 'aria-hidden': 'true' }, text: kind === 'call' ? '✆' : '' });
  }
  function history(c, ctx) {
    var items = c.events.map(function (e) {
      var linked = e.taskId ? findTask(ctx.projects, e.taskId) : null;
      var filled = e.kind === 'letter' && linked && linked.task.status === 'done';
      var title = e.kind === 'filed' ? 'Złożono' : e.kind === 'call' ? 'Dopytano' : e.kind === 'filled' ? 'Uzupełniono' : (filled ? 'Uzupełniono: ' : 'Pismo od organu: ') + (e.note || '');
      if (e.kind === 'filed') title = 'Złożono' + (c.org ? ' · ' + c.org : '');
      var sub = e.kind === 'call' ? e.note : (e.kind === 'letter' && linked ? 'zadanie: ' + linked.task.name + (linked.task.deadline ? ', termin ' + shortDay(linked.task.deadline) : '') + (filled ? ' · zamknięte' : ' · w toku') : (e.kind === 'filed' ? '' : ''));
      return D.el('li', { class: 'case-hist__i' }, [glyph(e.kind === 'letter' ? 'letter' : e.kind, filled), D.el('div', null, [D.el('b', { text: title }), D.el('small', { class: 't-muted', text: shortDay(e.at) + (sub ? ' · ' + sub : '') })])]);
    });
    if (c.status === 'closed') items.push(D.el('li', { class: 'case-hist__i' }, [glyph('end'), D.el('div', null, [D.el('b', { text: 'Sprawa zakończona' }), D.el('small', { class: 't-muted', text: shortDay(c.closedAt) + (c.closedNote ? ' · ' + c.closedNote : '') })])]));
    return D.el('ol', { class: 'case-hist' }, items);
  }

  /* ---------- okno szczegółów sprawy ---------- */
  function openDetail(anchor, c, ctx) {
    var day = today();
    var info = remindInfo(c, day);
    var note = D.el('textarea', { class: 'bflagform__note', attrs: { rows: '2', maxlength: '300', placeholder: 'Np. rozmowa z Anną N., wpływ pisma potwierdzony', 'data-fk': 'case-note', 'aria-label': 'Notatka z rozmowy' } });
    var project = (ctx.projects || []).filter(function (p) { return p.id === c.projectId; })[0];
    var content = D.el('div', { class: 'bflagform case-detail', attrs: { 'data-fk': 'case-detail' } }, [
      D.el('b', { class: 'bflagform__title', text: c.name }),
      D.el('p', { class: 'bflagform__sub t-muted', text: (project ? project.code + ' · ' : '') + (c.org || 'sprawa w toku') + ' · złożono ' + shortDay(c.startedAt) }),
      D.el('div', { class: 'case-detail__count' }, [D.el('b', { class: 't-num', text: String(Cases.daysSince(c, day)) }), D.el('span', { text: ' ' + plural(Cases.daysSince(c, day)) + ' od złożenia' }), D.el('small', { class: info.due ? 'is-due' : 't-muted', text: info.text })]),
      history(c, ctx),
      c.status === 'open' ? D.el('label', { class: 'bflagform__lbl t-muted', text: 'Notatka (opcjonalnie)' }, [note]) : null,
      c.status === 'open' ? D.el('div', { class: 'bflagform__actions case-detail__acts' }, [
        UI.button({ label: 'Dodaj pismo', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'case-letter' }, onClick: function () { E.Menu.close(); ctx.actions.openCaseLetter(c.id); } }),
        UI.button({ label: 'Zakończ sprawę', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'case-close' }, onClick: function () { E.Menu.close(); ctx.actions.closeCase(c.id, note.value); } }),
        UI.button({ label: 'Zapytałem', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'case-call' }, onClick: function () { E.Menu.close(); ctx.actions.caseCall(c.id, note.value); } })
      ]) : D.el('div', { class: 'bflagform__actions' }, [UI.button({ label: 'Wznów sprawę', variant: 'ghost', size: 'sm', onClick: function () { E.Menu.close(); ctx.actions.reopenCase(c.id); } })])
    ]);
    E.Menu.open({ anchor: anchor, content: content, label: 'Sprawa: ' + c.name, align: 'end', minWidth: '22rem' });
  }

  /** Znacznik przy zadaniu: „◇ sprawa: …” (zadanie jest źródłem sprawy albo pismem do niej). */
  function chip(c, ctx) {
    var b = D.el('button', { class: 'case-chip', attrs: { type: 'button', 'data-fk': 'case-chip-' + c.id, 'data-tooltip': 'Sprawa w toku: ' + c.name + ' · ' + Cases.daysSince(c, today()) + ' dni od złożenia' } }, [D.el('i', { class: 'case-glyph case-glyph--letter', attrs: { 'aria-hidden': 'true' } }), D.el('span', { class: 'truncate', text: 'sprawa: ' + c.name })]);
    b.addEventListener('click', function (e) { e.stopPropagation(); openDetail(b, c, ctx); });
    return b;
  }

  /* ---------- Moja praca: „Czekam na odpowiedź” + „Do rozstrzygnięcia” ---------- */
  function card(c, ctx) {
    var day = today();
    var days = Cases.daysSince(c, day);
    var info = remindInfo(c, day);
    var project = (ctx.projects || []).filter(function (p) { return p.id === c.projectId; })[0];
    var last = Cases.lastCall(c);
    var det = D.el('button', { class: 'btn btn--ghost btn--sm', attrs: { type: 'button', 'data-fk': 'case-open-' + c.id }, text: 'Otwórz' });
    det.addEventListener('click', function () { openDetail(det, c, ctx); });
    var ask = D.el('button', { class: 'btn btn--secondary btn--sm', attrs: { type: 'button', 'data-fk': 'case-ask-' + c.id }, text: 'Zapytałem' });
    ask.addEventListener('click', function () { openDetail(ask, c, ctx); });
    return D.el('div', { class: 'case-card' + (info.due ? ' is-due' : ''), dataset: { caseId: c.id } }, [
      D.el('span', { class: 'mrow__project', style: project ? E.Identity.hueStyle(project.code) : null, text: project ? project.code : '' }),
      D.el('div', { class: 'case-card__txt' }, [D.el('b', { text: c.name }), D.el('small', { class: 't-muted truncate', text: (c.org ? c.org + ' · ' : '') + 'złożono ' + shortDay(c.startedAt) + (last ? ' · dopytano ' + shortDay(last.at) : '') })]),
      D.el('div', { class: 'case-card__days' }, [D.el('b', { class: 't-num', text: String(days) }), D.el('span', { text: ' ' + plural(days) }), D.el('small', { class: info.due ? 'is-due' : 't-muted', text: info.text })]),
      D.el('div', { class: 'case-card__btns' }, [ask, det])
    ]);
  }

  function pendingRow(p, ctx) {
    var project = (ctx.projects || []).filter(function (x) { return x.id === p.projectId; })[0];
    return D.el('div', { class: 'case-card case-card--ask', dataset: { taskId: p.taskId } }, [
      D.el('span', { class: 'mrow__project', style: project ? E.Identity.hueStyle(project.code) : null, text: project ? project.code : '' }),
      D.el('div', { class: 'case-card__txt' }, [D.el('b', { text: 'Czy czekasz na odpowiedź po: „' + p.name + '”?' }), D.el('small', { class: 't-muted', text: 'zamknięto ' + shortDay(p.at) + ' · bez decyzji sprawa nie będzie śledzona' })]),
      D.el('div', { class: 'case-card__btns' }, [
        UI.button({ label: 'Nie', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'case-no-' + p.taskId }, onClick: function () { ctx.actions.skipTaskCase(p.projectId, p.stageId, p.taskId); } }),
        UI.button({ label: 'Tak, śledź', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'case-yes-' + p.taskId }, onClick: function () { ctx.actions.openCaseFromTask(p.projectId, p.stageId, p.taskId); } })
      ])
    ]);
  }

  /** Sekcja w Mojej pracy: własne sprawy w toku i zadania czekające na decyzję. */
  function section(state, ctx) {
    var me = ctx.meId;
    var day = today();
    var projects = state.workspace.projects || [];
    var cases = state.workspace.cases || [];
    var c2 = Object.assign({}, ctx, { projects: projects });
    var mine = Cases.open(cases).filter(function (c) { return c.ownerId === me; }).sort(function (a, b) { return a.remindAt < b.remindAt ? -1 : 1; });
    var pend = Cases.pendingDecisions(projects, cases, day, 30).filter(function (p) { return p.assignees.indexOf(me) >= 0; });
    if (!mine.length && !pend.length) return null;
    var due = mine.filter(function (c) { return Cases.remindDue(c, day); }).length;
    return D.el('section', { class: 'case-sec', attrs: { 'data-fk': 'my-cases', 'aria-label': 'Sprawy w toku' } }, [
      D.el('div', { class: 'case-sec__head' }, [
        D.el('h2', { class: 'case-sec__t', text: 'Czekam na odpowiedź' }),
        D.el('span', { class: 'case-sec__n t-num', text: String(mine.length) }),
        due ? D.el('span', { class: 'case-sec__due', text: due + ' do dopytania' }) : null,
        D.el('span', { class: 'case-sec__sp' }),
        UI.button({ label: '+ Sprawa', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'case-add' }, onClick: function () { ctx.actions.openCase({}); } })
      ]),
      D.el('div', { class: 'case-sec__list' }, pend.map(function (p) { return pendingRow(p, c2); }).concat(mine.map(function (c) { return card(c, c2); })))
    ]);
  }

  E.CaseUI = { form: form, history: history, openDetail: openDetail, chip: chip, card: card, section: section, remindInfo: remindInfo, findTask: findTask };
})(typeof globalThis !== 'undefined' ? globalThis : this);
