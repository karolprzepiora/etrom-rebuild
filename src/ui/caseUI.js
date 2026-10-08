/* ETROM — sprawy w toku (UI): formularz, karta w Mojej pracy, okno szczegółów z historią i „Zapytałem”.
   Dane i reguły: src/core/cases.js. Pokazujemy tylko dni od złożenia i przypomnienia, bez terminów ustawowych. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Cases = E.Cases;

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

  /* ---------- formularz nowej sprawy ---------- */
  function form(draft, errors, handlers, projects, Model) {
    var v = draft || {};
    var problems = errors || {};
    var project = UI.select({ id: 'cs-project', value: v.projectId === '' || v.projectId == null ? '' : String(v.projectId), options: [{ value: '', label: 'Wybierz projekt' }].concat((projects || []).map(function (p) { return { value: String(p.id), label: p.code + ' · ' + p.name }; })) });
    var chosen = (projects || []).filter(function (p) { return String(p.id) === String(project.value); })[0];
    var tasks = Cases.projectTasks(chosen, function (st) { return Model && Model.describeStage ? Model.describeStage(st).name : ''; });
    var taskSel = UI.select({ id: 'cs-task', value: v.sourceTaskId || '', options: [{ value: '', label: chosen ? 'Bez zadania' : 'Najpierw wybierz projekt' }].concat(tasks.map(function (t) { return { value: t.taskId, label: t.label }; })) });
    if (!chosen) taskSel.disabled = true;
    var name = UI.input({ id: 'cs-name', value: v.name || '', maxlength: 120, placeholder: 'np. Decyzja środowiskowa', error: problems.name });
    var org = UI.input({ id: 'cs-org', value: v.org || '', maxlength: 120, placeholder: 'np. RDOŚ Kraków, nr OO.4210.12' });
    var at = UI.input({ id: 'cs-start', type: 'date', value: v.startedAt || '', error: problems.startedAt });
    function values() {
      var t = tasks.filter(function (x) { return x.taskId === taskSel.value; })[0];
      return { projectId: project.value, stageId: t ? t.stageId : (v.stageId || ''), name: name.value, org: org.value, startedAt: at.value, sourceTaskId: t ? t.taskId : '' };
    }
    // Zmiana projektu odświeża listę zadań; wybór zadania podpowiada nazwę sprawy, jeśli jej jeszcze nie ma.
    project.addEventListener('change', function () { if (handlers.onDraft) handlers.onDraft(Object.assign(values(), { sourceTaskId: '', stageId: '' })); });
    taskSel.addEventListener('change', function () {
      var t = tasks.filter(function (x) { return x.taskId === taskSel.value; })[0];
      if (t && !name.value.trim() && handlers.nameFromTask) {
        var task = chosen.stages.reduce(function (found, st) { return found || (st.tasks || []).filter(function (x) { return x.id === t.taskId; })[0]; }, null);
        if (task) name.value = handlers.nameFromTask(task.name);
      }
    });
    var f = E.Dialog.drawerForm({
      id: 'case-form',
      submitLabel: 'Śledź sprawę',
      onCancel: handlers.onCancel,
      onSubmit: function () { handlers.onSubmit(values()); },
      body: [
        UI.field({ id: 'cs-project', label: 'Projekt', control: project, error: problems.projectId }),
        UI.field({ id: 'cs-task', label: 'Zadanie, którego dotyczy sprawa', optional: true, control: taskSel }),
        UI.field({ id: 'cs-name', label: 'Nazwa sprawy', control: name, error: problems.name }),
        UI.field({ id: 'cs-org', label: 'Organ i numer sprawy', optional: true, control: org }),
        UI.field({ id: 'cs-start', label: 'Złożono / zamówiono', control: at, error: problems.startedAt }),
        D.el('p', { class: 't-meta', text: 'Licznik liczy dni od dnia złożenia. Sprawa zostaje widoczna w Planie, w Mojej pracy i w projekcie, aż ją zakończysz. Przypięte zadanie dostaje znacznik „sprawa”.' })
      ]
    });
    window.setTimeout(function () { (v.projectId ? name : project).focus(); }, 0);
    return f;
  }

  /* ---------- historia sprawy ---------- */
  function glyph(kind, filled) {
    return D.el('span', { class: 'case-glyph case-glyph--' + kind + (filled ? ' is-filled' : ''), attrs: { 'aria-hidden': 'true' }, text: kind === 'call' ? '✆' : kind === 'note' ? '✎' : '' });
  }
  function history(c, ctx) {
    var items = c.events.map(function (e) {
      var linked = e.taskId ? findTask(ctx.projects, e.taskId) : null;
      var filled = e.kind === 'letter' && linked && linked.task.status === 'done';
      var title = e.kind === 'filed' ? 'Złożono' : e.kind === 'call' ? 'Dopytano' : e.kind === 'note' ? 'Notatka' : e.kind === 'filled' ? 'Uzupełniono' : (filled ? 'Uzupełniono: ' : 'Pismo od organu: ') + (e.note || '');
      if (e.kind === 'filed') title = 'Złożono' + (c.org ? ' · ' + c.org : '');
      var sub = (e.kind === 'call' || e.kind === 'note') ? e.note : (e.kind === 'letter' && linked ? 'zadanie: ' + linked.task.name + (linked.task.deadline ? ', termin ' + shortDay(linked.task.deadline) : '') + (filled ? ' · zamknięte' : ' · w toku') : (e.kind === 'filed' ? '' : ''));
      return D.el('li', { class: 'case-hist__i' }, [glyph(e.kind === 'letter' ? 'letter' : e.kind, filled), D.el('div', null, [D.el('b', { text: title }), D.el('small', { class: 't-muted', text: shortDay(e.at) + (sub ? ' · ' + sub : '') })])]);
    });
    if (c.status === 'closed') items.push(D.el('li', { class: 'case-hist__i' }, [glyph('end'), D.el('div', null, [D.el('b', { text: 'Sprawa zakończona' }), D.el('small', { class: 't-muted', text: shortDay(c.closedAt) + (c.closedNote ? ' · ' + c.closedNote : '') })])]));
    return D.el('ol', { class: 'case-hist' }, items);
  }

  /* ---------- okno szczegółów sprawy ---------- */
  function openDetail(anchor, c, ctx) {
    var day = today();
    var note = D.el('textarea', { class: 'bflagform__note', attrs: { rows: '2', maxlength: '300', placeholder: 'Np. rozmowa z Anną N., wpływ pisma potwierdzony', 'data-fk': 'case-note', 'aria-label': 'Notatka lub informacja' } });
    var project = (ctx.projects || []).filter(function (p) { return p.id === c.projectId; })[0];
    var content = D.el('div', { class: 'bflagform case-detail', attrs: { 'data-fk': 'case-detail' } }, [
      D.el('b', { class: 'bflagform__title', text: c.name }),
      D.el('p', { class: 'bflagform__sub t-muted', text: (project ? project.code + ' · ' : '') + (c.org || 'sprawa w toku') + ' · złożono ' + shortDay(c.startedAt) }),
      D.el('div', { class: 'case-detail__count' }, [D.el('b', { class: 't-num', text: String(Cases.daysSince(c, day)) }), D.el('span', { text: ' ' + plural(Cases.daysSince(c, day)) + ' od złożenia' })]),
      history(c, ctx),
      c.status === 'open' ? D.el('label', { class: 'bflagform__lbl t-muted', text: 'Notatka lub informacja (opcjonalnie)' }, [note]) : null,
      c.status === 'open' ? D.el('div', { class: 'bflagform__actions case-detail__acts' }, [
        UI.button({ label: 'Dodaj notatkę', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'case-note-add' }, onClick: function () { if (!note.value.trim()) { note.focus(); return; } E.Menu.close(); ctx.actions.caseNote(c.id, note.value); } }),
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
    var project = (ctx.projects || []).filter(function (p) { return p.id === c.projectId; })[0];
    var last = Cases.lastCall(c);
    var det = D.el('button', { class: 'case-card__ask', attrs: { type: 'button', 'data-fk': 'case-open-' + c.id }, text: 'Otwórz' });
    det.addEventListener('click', function () { openDetail(det, c, ctx); });
    var owner = c.ownerId && c.ownerId !== ctx.meId && ctx.people ? E.Team.findPerson(ctx.people, c.ownerId) : null;
    return D.el('div', { class: 'case-card', style: project ? E.Identity.hueStyle(project.code) : null, dataset: { caseId: c.id } }, [
      D.el('div', { class: 'case-card__days' }, [D.el('b', { class: 't-num', text: String(days) }), D.el('span', { text: plural(days) })]),
      D.el('div', { class: 'case-card__txt' }, [
        D.el('b', { text: c.name }),
        D.el('small', { class: 'truncate', text: (project ? project.code + ' · ' : '') + (owner ? E.Team.fullName(owner) + ' · ' : '') + (c.org ? c.org + ' · ' : '') + 'złożono ' + shortDay(c.startedAt) + (last ? ' · dopytano ' + shortDay(last.at) : '') }),
        D.el('div', { class: 'case-card__foot' }, [det])
      ])
    ]);
  }

  function pendingRow(p, ctx) {
    var project = (ctx.projects || []).filter(function (x) { return x.id === p.projectId; })[0];
    return D.el('div', { class: 'case-ask', dataset: { taskId: p.taskId } }, [
      D.el('div', { class: 'case-ask__txt' }, [D.el('b', { text: 'Czy czekasz na odpowiedź po: „' + p.name + '”?' }), D.el('small', { class: 't-muted', text: (project ? project.code + ' · ' : '') + 'zamknięto ' + shortDay(p.at) + ' · bez decyzji sprawa nie będzie śledzona' })]),
      D.el('div', { class: 'case-card__btns' }, [
        UI.button({ label: 'Nie', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'case-no-' + p.taskId }, onClick: function () { ctx.actions.skipTaskCase(p.projectId, p.stageId, p.taskId); } }),
        UI.button({ label: 'Tak, śledź', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'case-yes-' + p.taskId }, onClick: function () { ctx.actions.openCaseFromTask(p.projectId, p.stageId, p.taskId); } })
      ])
    ]);
  }

  /** Wszystkie otwarte sprawy są widoczne w każdym widoku; nie ma przypomnień, więc zakres nie zawęża listy. */
  function inRange() { return true; }

  /** Sekcja w Mojej pracy: własne sprawy w toku i zadania czekające na decyzję (zależnie od widoku). */
  function section(state, ctx, mode) {
    var me = ctx.meId;
    var day = today();
    var scope = mode || 'all';
    var projects = state.workspace.projects || [];
    var cases = state.workspace.cases || [];
    var c2 = Object.assign({}, ctx, { projects: projects });
    var allMine = Cases.visible(cases, projects).filter(function (c) { return c.ownerId === me; });
    var mine = allMine.slice().sort(function (a, b) { return a.startedAt < b.startedAt ? -1 : 1; });
    var pend = Cases.pendingDecisions(projects, cases, day, 30).filter(function (p) {
      if (p.assignees.indexOf(me) < 0) return false;
      if (scope === 'today') return p.at >= Cases.addDays(day, -1);
      if (scope === 'week') return p.at >= Cases.addDays(day, -7);
      return true;
    });
    if (!mine.length && !pend.length) return null;
    var title = 'Czekam na odpowiedź';
    var el = D.el('section', { class: 'case-sec', attrs: { 'data-fk': 'my-cases', 'data-scope': scope, 'aria-label': 'Sprawy w toku' } }, [
      D.el('div', { class: 'case-sec__head' }, [
        D.el('span', { class: 'case-sec__sp' }),
        UI.button({ label: 'Dodaj sprawę', icon: 'plus', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'case-add' }, onClick: function () { ctx.actions.openCase({}); } })
      ]),
      D.el('div', { class: 'case-sec__list' }, pend.map(function (p) { return pendingRow(p, c2); }).concat(mine.map(function (c) { return card(c, c2); })))
    ]);
    // Dane dla zwijanej szyny: tytuł, liczba pozycji i to, co wymaga uwagi (zwinięcie niczego nie chowa bez śladu).
    el.dataset.title = title;
    el.dataset.count = String(mine.length + pend.length);
    el.dataset.attention = String(pend.length);
    return el;
  }

  /** Sekcja w Przeglądzie: sprawy w toku (zakres zarządu albo lidera), najstarsze na górze. */
  function reviewRows(state, ctx, projectIds) {
    var day = today();
    var people = state.workspace.people || [];
    var projects = state.workspace.projects || [];
    var c2 = Object.assign({}, ctx, { projects: projects });
    var list = Cases.visible(state.workspace.cases || [], projects).filter(function (c) { return !projectIds || projectIds.indexOf(c.projectId) >= 0; })
      .sort(function (a, b) { return a.startedAt < b.startedAt ? -1 : 1; });
    return list.map(function (c) {
      var project = projects.filter(function (p) { return p.id === c.projectId; })[0];
      var owner = c.ownerId ? E.Team.findPerson(people, c.ownerId) : null;
      var days = Cases.daysSince(c, day);
      var btn = D.el('button', { class: 'rv-row', attrs: { type: 'button', 'data-fk': 'rv-case-' + c.id } }, [
        D.el('span', { class: 'rv-row__code', style: project ? E.Identity.hueStyle(project.code) : null, text: project ? project.code : '' }),
        D.el('span', { class: 'rv-row__main truncate', text: c.name + (c.org ? ' · ' + c.org : '') + (owner ? ' · ' + E.Team.fullName(owner) : ' · bez osoby') }),
        D.el('span', { class: 'rv-row__side t-num', text: days + ' ' + plural(days) })
      ]);
      btn.addEventListener('click', function () { openDetail(btn, c, c2); });
      return D.el('li', null, [btn]);
    });
  }

  /** Zakładka „Sprawy” w projekcie: otwarte jako kafelki, zakończone jako spokojna lista. */
  function projectTab(project, ctx) {
    var day = today();
    var all = (ctx.state.workspace.cases || []).filter(function (c) { return c.projectId === project.id && c.status !== 'skipped'; });
    var opened = all.filter(function (c) { return c.status === 'open'; }).sort(function (a, b) { return a.startedAt < b.startedAt ? -1 : 1; });
    var closed = all.filter(function (c) { return c.status === 'closed'; }).sort(function (a, b) { return a.closedAt < b.closedAt ? 1 : -1; });
    var c2 = { actions: ctx.actions, projects: [project], people: ctx.state.workspace.people || [], meId: ctx.state.prefs.me };
    var head = D.el('div', { class: 'section__head' }, [
      D.el('div', { class: 'section__titles' }, [D.el('h2', { class: 'section__title', text: 'Sprawy' }), D.el('span', { class: 'section__meta', text: opened.length ? 'w toku ' + opened.length : 'brak spraw w toku' })]),
      D.el('div', { class: 'section__actions' }, [UI.button({ label: 'Dodaj sprawę', icon: 'plus', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'project-case-add' }, onClick: function () { ctx.actions.openCase({ projectId: project.id }); } })])
    ]);
    if (!all.length) {
      return D.el('section', { class: 'section' }, [head, D.el('div', { class: 'card' }, [UI.emptyState({ icon: 'mail', title: 'Nic nie czeka na odpowiedź', text: 'Wniosek złożony w urzędzie albo zamówiony materiał dodaj jako sprawę. Zostanie widoczna z licznikiem dni, aż ją zakończysz.' })])]);
    }
    return D.el('section', { class: 'section', attrs: { 'data-fk': 'project-cases' } }, [
      head,
      opened.length ? D.el('div', { class: 'case-grid' }, opened.map(function (c) { return card(c, c2); })) : null,
      closed.length ? D.el('div', { class: 'case-done' }, [
        D.el('h3', { class: 'case-done__t', text: 'Zakończone ' + closed.length }),
        D.el('ul', { class: 'case-done__list' }, closed.map(function (c) {
          var btn = D.el('button', { class: 'case-done__row', attrs: { type: 'button', 'data-fk': 'case-done-' + c.id } }, [
            D.el('b', { text: c.name }),
            D.el('span', { class: 't-muted truncate', text: (c.org ? c.org + ' · ' : '') + 'złożono ' + shortDay(c.startedAt) + ', zakończono ' + shortDay(c.closedAt) + (c.closedNote ? ' · ' + c.closedNote : '') }),
            D.el('span', { class: 't-num t-muted', text: Cases.diffDays(c.startedAt, c.closedAt) + ' ' + plural(Cases.diffDays(c.startedAt, c.closedAt)) })
          ]);
          btn.addEventListener('click', function () { openDetail(btn, c, c2); });
          return D.el('li', null, [btn]);
        }))
      ]) : null
    ]);
  }

  E.CaseUI = { projectTab: projectTab, form: form, history: history, openDetail: openDetail, chip: chip, card: card, section: section, findTask: findTask, reviewRows: reviewRows, inRange: inRange };
})(typeof globalThis !== 'undefined' ? globalThis : this);
