/* ETROM — ekran „Skrzynka”: wszystko, co wymaga reakcji zalogowanej osoby.
   Pozycje wynikają ze stanu pracy (core/inbox.js) — nie ma „oznacz jako przeczytane”:
   pozycja znika, gdy człowiek zrobi to, czego od niej oczekuje. Można ją odłożyć do jutra. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Icons = E.Icons;
  var Inbox = E.Inbox;
  var Team = E.Team;

  var FILTERS = [
    { value: 'all', label: 'Wszystko' },
    { value: 'approve', label: 'Do zatwierdzenia' },
    { value: 'returned', label: 'Do poprawy' },
    { value: 'mail', label: 'Pisma' },
    { value: 'project', label: 'Projekty' }
  ];
  var ICONS = { approve: 'checkCircle', returned: 'alert', mail: 'mail', project: 'alertCircle' };

  function dateOf(item) {
    if (item.kind === 'mail') return item.entry.replyDue;
    if (item.task) return item.task.deadline;
    return '';
  }

  function openItem(item, actions) {
    if (item.task) actions.inspect({ kind: 'task', projectId: item.project.id, stageId: item.stage.id, taskId: item.task.id });
    else if (item.kind === 'mail') actions.openProject(item.project.id, 'korespondencja');
    else actions.openProject(item.project.id, 'etapy');
  }

  function primaryActions(item, actions) {
    if (item.kind === 'approve') {
      return [
        UI.button({ label: 'Zatwierdź', icon: 'check', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'inbox-approve-' + item.task.id }, onClick: function () { actions.moveTask(item.project.id, item.stage.id, item.task.id, 'done'); } }),
        UI.button({ label: 'Zwróć', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-return-' + item.task.id }, onClick: function () { actions.moveTask(item.project.id, item.stage.id, item.task.id, 'changes'); } })
      ];
    }
    var label = item.kind === 'mail' ? 'Otwórz pismo' : (item.kind === 'project' ? 'Otwórz projekt' : 'Otwórz zadanie');
    return [UI.button({ label: label, variant: 'secondary', size: 'sm', onClick: function () { openItem(item, actions); } })];
  }

  function row(item, ctx, now) {
    var date = dateOf(item);
    var context = [
      D.el('a', { class: 'mrow__project', text: item.project.code, attrs: { href: E.ProjectList.projectHref(item.project), 'data-tooltip': item.project.name } }),
      item.stage ? D.el('span', { class: 'truncate', text: E.Model.describeStage(item.stage).name }) : null,
      item.detail ? D.el('span', { class: 'truncate ibx__detail', text: item.detail }) : null
    ];
    return D.el('li', { class: 'ibx__row' + (item.urgent ? ' is-urgent' : ''), dataset: { inboxKey: item.key, kind: item.kind } }, [
      D.el('span', { class: 'ibx__kind', attrs: { 'data-tooltip': Inbox.KINDS[item.kind].label } }, [Icons.icon(ICONS[item.kind], 16)]),
      D.el('div', { class: 'ibx__body' }, [
        D.el('button', {
          class: 'ibx__title trow__name',
          text: item.title,
          attrs: { type: 'button', 'data-fk': 'inbox-open-' + item.key },
          on: { click: function () { openItem(item, ctx.actions); } }
        }),
        D.el('span', { class: 'mrow__context' }, context.filter(Boolean))
      ]),
      D.el('span', { class: 'ibx__kindlabel t-meta', text: Inbox.KINDS[item.kind].label }),
      D.el('span', { class: 'ibx__when' }, [date ? UI.countdown(String(date).slice(0, 10), { now: now }) : null]),
      D.el('div', { class: 'ibx__actions' }, primaryActions(item, ctx.actions).concat([
        UI.iconButton({ icon: 'clock', label: 'Odłóż do jutra', size: 'sm', attrs: { 'data-fk': 'inbox-snooze-' + item.key }, onClick: function () { ctx.actions.snoozeInbox(item.key, item.title); } })
      ]))
    ]);
  }

  function filterBar(result, filter, actions) {
    return D.el('div', { class: 'pf-views ibx__filters', attrs: { role: 'tablist', 'aria-label': 'Rodzaj pozycji' } }, FILTERS.map(function (f) {
      var count = f.value === 'all' ? result.total : result.counts[f.value];
      var active = f.value === filter;
      return D.el('button', {
        class: 'pf-view' + (active ? ' is-active' : ''),
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(active), 'data-fk': 'inbox-filter-' + f.value },
        on: { click: function () { actions.setInboxFilter(f.value); } }
      }, [D.el('span', { text: f.label }), D.el('span', { class: 'pf-view__count t-num', text: String(count) })]);
    }));
  }

  function snoozedBlock(list, actions) {
    if (!list.length) return null;
    return D.el('details', { class: 'ibx__later' }, [
      D.el('summary', null, [Icons.icon('clock', 14), D.el('span', { text: 'Odłożone (' + list.length + ')' })]),
      D.el('ul', { class: 'ibx__list' }, list.map(function (item) {
        return D.el('li', { class: 'ibx__row ibx__row--later', dataset: { inboxKey: item.key } }, [
          D.el('span', { class: 'ibx__kind' }, [Icons.icon(ICONS[item.kind], 16)]),
          D.el('div', { class: 'ibx__body' }, [
            D.el('span', { class: 'ibx__title', text: item.title }),
            D.el('span', { class: 'mrow__context' }, [D.el('span', { class: 'code', text: item.project.code }), D.el('span', { text: 'wróci ' + E.Format.date(item.until) })])
          ]),
          D.el('span'), D.el('span'),
          D.el('div', { class: 'ibx__actions' }, [UI.button({ label: 'Przywróć', variant: 'ghost', size: 'sm', onClick: function () { actions.unsnoozeInbox(item.key); } })])
        ]);
      }))
    ]);
  }

  function summary(me, result) {
    if (!me) return 'Wybierz w „Mojej pracy”, kim jesteś — Skrzynka pokaże, co czeka na Ciebie.';
    if (!result.total) return 'Nic nie czeka na ' + (me.firstName || Team.fullName(me)) + '. Skrzynka jest pusta.';
    var parts = [E.Format.count(result.total, 'pozycja czeka', 'pozycje czekają', 'pozycji czeka')];
    if (result.urgent) parts.push(result.urgent + ' pilne');
    return parts.join(' · ');
  }

  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    var now = new Date();
    if (!me) {
      return { summary: summary(null), body: E.Welcome.card(state, ctx, 'Skrzynka zbiera rzeczy, które wymagają Twojej reakcji: zatwierdzenia, poprawki i pisma bez odpowiedzi.') };
    }
    var result = Inbox.build(me.id, state.workspace.projects, state.workspace.mail, now, state.prefs.snoozed);
    var filter = state.inboxFilter || 'all';
    var shown = filter === 'all' ? result.items : result.items.filter(function (i) { return i.kind === filter; });
    var body;
    if (!result.total && !result.snoozed.length) {
      body = UI.emptyState({ icon: 'checkCircle', title: 'Wszystko załatwione', text: 'Zatwierdzenia, zadania do poprawy i pisma czekające na odpowiedź pojawią się tutaj, gdy będą wymagały Twojej reakcji.' });
    } else {
      body = D.el('div', { class: 'ibx' }, [
        filterBar(result, filter, ctx.actions),
        shown.length
          ? D.el('ul', { class: 'ibx__list', attrs: { 'aria-label': 'Pozycje do reakcji' } }, shown.map(function (item) { return row(item, ctx, now); }))
          : D.el('p', { class: 'ibx__empty', text: result.total ? 'Nic w tej kategorii.' : 'Skrzynka jest pusta — zostały tylko odłożone pozycje.' }),
        snoozedBlock(result.snoozed, ctx.actions)
      ]);
    }
    return { summary: summary(me, result), body: body, result: result };
  }

  /** Liczba pozycji dla paska bocznego. */
  function count(state, now) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me) return null;
    return Inbox.build(me.id, state.workspace.projects, state.workspace.mail, now || new Date(), state.prefs.snoozed);
  }

  root.ETROM.InboxScreen = { view: view, count: count, FILTERS: FILTERS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
