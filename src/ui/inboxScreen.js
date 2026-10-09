/* ETROM — Skrzynka: jedno miejsce na to, czego czekają ode mnie inni.
   Zbiera zatwierdzenia zadań, zlecenia do mnie, wnioski urlopowe do decyzji lub opinii,
   pisma czekające na odpowiedź i projekty w alarmie. Moja praca to to, co robię ja; Skrzynka to to, co na mnie czeka.
   Pozycje wynikają ze stanu aplikacji (core/inbox.js) — nie ma „oznacz jako przeczytane”:
   pozycja znika, gdy człowiek zrobi to, czego od niej oczekuje. Można ją odłożyć do jutra.
   Każdą pozycję da się załatwić w wierszu; pełny widok (zlecenie, wpływ wniosku na plan) jest o jedno kliknięcie dalej. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Icons = E.Icons;
  var Inbox = E.Inbox;
  var Team = E.Team;

  var ICONS = { approve: 'checkCircle', order: 'checklist', leave: 'leave', mail: 'mail', project: 'alertCircle', returned: 'alert' };
  var TABS = [
    { value: 'all', label: 'Wszystko' },
    { value: 'approve', label: 'Zatwierdzenia' },
    { value: 'order', label: 'Zlecenia' },
    { value: 'leave', label: 'Urlopy' },
    { value: 'mail', label: 'Pisma' },
    { value: 'project', label: 'Projekty' }
  ];
  var RAIL_IDS = ['ib-filters', 'ib-later'];

  /** Stan widoku: rodzaj, projekt, tylko pilne. Nie zapisuje się — po odświeżeniu Skrzynka pokazuje wszystko. */
  function filterOf(state) {
    var f = state.inbox || {};
    return { kind: TABS.some(function (t) { return t.value === f.kind; }) ? f.kind : 'all', project: f.project == null ? 'all' : String(f.project), urgent: f.urgent === true };
  }

  /** Jeden model dla ekranu, licznika w menu, Pulpitu i palety poleceń. */
  function model(state, now) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me) return null;
    var raw = Inbox.build(me.id, state.workspace.projects, state.workspace.mail, now, state.prefs.snoozed, state.workspace.entries, {
      orders: state.workspace.orders || [], people: state.workspace.people || [], absences: state.workspace.absences || []
    });
    var screen = Inbox.forScreen(raw);
    return { me: me, items: screen.items, snoozed: screen.snoozed, counts: screen.counts, total: screen.total, urgent: screen.urgent };
  }

  /** Liczba w menu i na Pulpicie: { total, urgent } albo null, gdy nie wiadomo, kim jesteś. */
  function count(state, now) {
    var m = model(state, now || new Date());
    return m ? { total: m.total, urgent: m.urgent } : null;
  }

  function applyFilter(items, f) {
    return items.filter(function (i) {
      if (f.kind !== 'all' && i.kind !== f.kind) return false;
      if (f.project !== 'all' && (!i.project || String(i.project.id) !== f.project)) return false;
      if (f.urgent && !i.urgent) return false;
      return true;
    });
  }

  function openItem(item, actions) {
    if (item.kind === 'order') { actions.setOrders({ tab: 'mine' }); root.location.hash = '#/zlecenia'; return; }
    if (item.kind === 'leave') { actions.setLeave({ tab: 'inbox' }); root.location.hash = '#/urlopy'; return; }
    if (item.task) actions.inspect({ kind: 'task', projectId: item.project.id, stageId: item.stage.id, taskId: item.task.id });
    else if (item.kind === 'mail') actions.openMailCard(item.entry.id);
    else actions.openProject(item.project.id, 'etapy');
  }

  function primaryActions(item, actions) {
    if (item.kind === 'approve') {
      return [
        UI.button({ label: 'Zatwierdź', icon: 'check', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'inbox-approve-' + item.task.id }, onClick: function () { actions.moveTask(item.project.id, item.stage.id, item.task.id, 'done'); } }),
        UI.button({ label: 'Zwróć', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-return-' + item.task.id }, onClick: function () { actions.moveTask(item.project.id, item.stage.id, item.task.id, 'changes'); } })
      ];
    }
    if (item.kind === 'mail') {
      var mid = item.entry.id;
      var mb = function (label, fk, fn, variant, icon) { return UI.button({ label: label, icon: icon || null, variant: variant || 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-' + fk + '-' + mid }, onClick: fn }); };
      if (item.handling === 'finished') {
        return [
          mb('Zarejestruj odpowiedź', 'reply', function () { actions.replyMail(mid); }, 'secondary', 'reply'),
          mb('Odpowiedź niepotrzebna', 'none', function () { actions.mailDecide(mid, 'none'); })
        ];
      }
      if (item.handling === 'atrisk') {
        return [
          mb('Napisz odpowiedź', 'reply', function () { actions.replyMail(mid); }, 'secondary', 'reply'),
          mb('Otwórz pismo', 'open', function () { openItem(item, actions); })
        ];
      }
      return [
        mb('Do akt', 'file', function () { actions.mailDecide(mid, 'file'); }, 'secondary'),
        mb('Wymaga odpowiedzi', 'needsreply', function () { actions.mailDecide(mid, 'reply'); }, 'secondary', 'flag'),
        mb('Dołącz do sprawy', 'tocase', function () { actions.mailDecide(mid, 'case'); }),
        mb('Przekaż', 'pass', function () { actions.mailDecide(mid, 'reassign'); })
      ];
    }
    if (item.kind === 'order') {
      return [UI.button({ label: 'Otwórz zlecenie', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'inbox-order-' + item.order.id }, onClick: function () { openItem(item, actions); } })];
    }
    if (item.kind === 'leave') {
      var id = item.absence.id;
      var look = UI.button({ label: 'Wpływ na plan', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-leave-view-' + id }, onClick: function () { openItem(item, actions); } });
      if (item.management) {
        return [
          UI.button({ label: 'Zaakceptuj', icon: 'check', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'inbox-leave-ok-' + id }, onClick: function () { actions.decideLeave(id, 'approve', ''); } }),
          UI.button({ label: 'Odrzuć', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-leave-no-' + id }, onClick: function () { actions.decideLeave(id, 'reject', ''); } }),
          look
        ];
      }
      return [
        UI.button({ label: 'Bez zastrzeżeń', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'inbox-leave-ok-' + id }, onClick: function () { actions.opinionLeave(id, 'ok', ''); } }),
        UI.button({ label: 'Mam zastrzeżenia', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-leave-no-' + id }, onClick: function () { actions.opinionLeave(id, 'concern', ''); } }),
        look
      ];
    }
    return [UI.button({ label: item.kind === 'project' ? 'Otwórz projekt' : 'Otwórz', variant: 'secondary', size: 'sm', onClick: function () { openItem(item, actions); } })];
  }

  function linkedChips(item, actions) {
    if (item.kind !== 'mail' || !(item.linked || []).length) return null;
    return D.el('span', { class: 'ibx__linked' }, item.linked.map(function (row) {
      return D.el('button', {
        class: 'mrow2__task', attrs: { type: 'button', 'data-tooltip': 'Otwórz zadanie' },
        on: { click: function () { actions.inspect({ kind: 'task', projectId: item.project.id, stageId: row.stage.id, taskId: row.task.id }); } }
      }, [Icons.icon('checklist', 13), D.el('span', { class: 'truncate', text: row.task.name }), D.el('span', { class: 'mrow2__task-meta t-num', text: E.Tasks.TASK_STATUS[row.task.status] + ' · ' + E.Format.hours(row.hours) })]);
    }));
  }

  function row(item, ctx, now) {
    var date = item.task ? item.task.deadline : (item.kind === 'mail' && item.entry ? item.entry.responseDue : '');
    var context = [
      item.project ? UI.projectTag(item.project, { href: E.ProjectList.projectHref(item.project), stage: item.stage ? E.Model.describeStage(item.stage).name : '' }) : null,
      item.detail ? D.el('span', { class: 'truncate ibx__detail', text: item.detail }) : null
    ];
    return D.el('li', { class: 'ibx__row' + (item.urgent ? ' is-urgent' : ''), style: item.project ? E.Identity.hueStyle(item.project.code) : null, dataset: { inboxKey: item.key, kind: item.kind } }, [
      D.el('span', { class: 'ibx__kind', attrs: { 'data-tooltip': Inbox.KINDS[item.kind].label } }, [Icons.icon(ICONS[item.kind], 16)]),
      D.el('div', { class: 'ibx__body' }, [
        D.el('span', { class: 'ibx__titleline' }, [
          D.el('button', { class: 'ibx__title trow__name', text: item.title, attrs: { type: 'button', 'data-fk': 'inbox-open-' + item.key }, on: { click: function () { openItem(item, ctx.actions); } } }),
          D.el('span', { class: 'ibx__info', attrs: { tabindex: '0', role: 'img', 'aria-label': item.why, 'data-tooltip': item.why } }, [Icons.icon('info', 14)])
        ]),
        D.el('span', { class: 'mrow__ctxwrap' }, context.filter(Boolean)),
        linkedChips(item, ctx.actions)
      ]),
      D.el('span', { class: 'ibx__when' }, [date ? UI.countdown(String(date).slice(0, 10), { now: now }) : null]),
      D.el('div', { class: 'ibx__actions' }, primaryActions(item, ctx.actions).concat([
        UI.iconButton({ icon: 'clock', label: 'Odłóż do jutra', size: 'sm', attrs: { 'data-fk': 'inbox-snooze-' + item.key }, onClick: function () { ctx.actions.snoozeInbox(item.key, item.title); } })
      ]))
    ]);
  }

  function section(title, items, ctx, now, tone) {
    if (!items.length) return null;
    return D.el('section', { class: 'msec' + (tone ? ' msec--' + tone : ''), attrs: { 'aria-label': title } }, [
      D.el('div', { class: 'msec__head' }, [D.el('h2', { class: 'msec__title', text: title }), D.el('span', { class: 'msec__count t-num', text: String(items.length) })]),
      D.el('ul', { class: 'ibx__list', attrs: { 'aria-label': title } }, items.map(function (item) { return row(item, ctx, now); }))
    ]);
  }

  function tabs(m, f, actions) {
    return D.el('div', { class: 'pf-views ibx__views', attrs: { role: 'tablist', 'aria-label': 'Rodzaje pozycji' } }, TABS.filter(function (t) {
      return t.value === 'all' || t.value === f.kind || m.counts[t.value] > 0;
    }).map(function (t) {
      var active = t.value === f.kind;
      var n = t.value === 'all' ? m.total : m.counts[t.value];
      return D.el('button', {
        class: 'pf-view' + (active ? ' is-active' : ''),
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(active), 'data-fk': 'inbox-view-' + t.value },
        on: { click: function () { actions.setInbox({ kind: t.value }); } }
      }, [D.el('span', { text: t.label }), D.el('span', { class: 'pf-view__count t-num', text: String(n) })]);
    }));
  }

  function filtersPanel(m, f, actions) {
    var seen = {};
    var projects = [];
    m.items.forEach(function (i) { if (i.project && !seen[i.project.id]) { seen[i.project.id] = true; projects.push(i.project); } });
    var select = UI.select({
      id: 'ib-project', value: f.project,
      options: [{ value: 'all', label: 'Wszystkie projekty' }].concat(projects.map(function (p) { return { value: String(p.id), label: p.code + ' · ' + p.name }; })),
      attrs: { 'data-fk': 'inbox-project', 'aria-label': 'Projekt' }
    });
    select.addEventListener('change', function () { actions.setInbox({ project: select.value }); });
    var urgent = UI.checkbox({ id: 'ib-urgent', label: 'Tylko pilne', checked: f.urgent, attrs: { 'data-fk': 'inbox-urgent' }, on: { change: function (ev) { actions.setInbox({ urgent: ev.target.checked }); } } });
    return [D.el('div', { class: 'ibx__filters' }, [
      D.el('label', { class: 't-meta', attrs: { for: 'ib-project' }, text: 'Projekt' }), select, urgent,
      f.kind !== 'all' || f.project !== 'all' || f.urgent
        ? UI.button({ label: 'Wyczyść filtry', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-clear' }, onClick: function () { actions.setInbox({ kind: 'all', project: 'all', urgent: false }); } })
        : null
    ])];
  }

  function laterPanel(list, actions) {
    if (!list.length) return [D.el('p', { class: 't-meta', text: 'Nic nie jest odłożone. Pozycję możesz odłożyć do jutra zegarem w jej wierszu.' })];
    return [D.el('ul', { class: 'ibx__list ibx__list--later' }, list.map(function (item) {
      return D.el('li', { class: 'ibx__row ibx__row--later', dataset: { inboxKey: item.key } }, [
        D.el('span', { class: 'ibx__kind' }, [Icons.icon(ICONS[item.kind], 16)]),
        D.el('div', { class: 'ibx__body' }, [
          D.el('span', { class: 'ibx__title', text: item.title }),
          D.el('span', { class: 'mrow__context' }, [item.project ? D.el('span', { class: 'code', text: item.project.code }) : null, D.el('span', { text: 'wróci ' + E.Format.date(item.until) })].filter(Boolean))
        ]),
        D.el('div', { class: 'ibx__actions' }, [UI.button({ label: 'Przywróć', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-restore-' + item.key }, onClick: function () { actions.unsnoozeInbox(item.key); } })])
      ]);
    }))];
  }

  function summaryText(m) {
    if (!m.total) return 'Nic na Ciebie nie czeka.';
    var s = E.Format.count(m.total, 'pozycja czeka', 'pozycje czekają', 'pozycji czeka') + ' na Ciebie';
    return m.urgent ? s + ' · ' + m.urgent + ' pilne' : s;
  }

  /** Treść ekranu: { summary, body }. Nagłówek składa aplikacja. */
  function view(state, ctx) {
    var now = new Date();
    var m = model(state, now);
    if (!m) return { summary: 'To, na co czekają inni: zatwierdzenia, zlecenia, wnioski i pisma.', body: E.Welcome.card(state, ctx, 'Skrzynka zbiera rzeczy, na które czekają inni. Wybierz w „Mojej pracy”, kim jesteś.') };
    var f = filterOf(state);
    var shown = applyFilter(m.items, f);
    var urgent = shown.filter(function (i) { return i.urgent; });
    var rest = shown.filter(function (i) { return !i.urgent; });
    var main = [tabs(m, f, ctx.actions)];
    if (urgent.length && rest.length) main.push(section('Pilne', urgent, ctx, now, 'alarm'), section('Do załatwienia', rest, ctx, now));
    else if (shown.length) main.push(section(urgent.length ? 'Pilne' : 'Czeka na Ciebie', shown, ctx, now, urgent.length ? 'alarm' : ''));
    else if (!m.items.length) {
      main.push(UI.emptyState({ icon: 'checkCircle', title: 'Skrzynka jest pusta', text: 'Nic na Ciebie nie czeka. Zatwierdzenia, zlecenia, wnioski urlopowe i pisma pojawią się tu same.' }));
    } else main.push(D.el('p', { class: 'ibx__empty', text: 'Nic w tym widoku.' }));

    var active = (f.kind !== 'all' ? 1 : 0) + (f.project !== 'all' ? 1 : 0) + (f.urgent ? 1 : 0);
    var items = [
      { id: 'ib-filters', title: 'Filtry', label: 'Filtry Skrzynki', icon: 'filter', tone: 'accent', badge: active ? String(active) : '', side: filtersPanel(m, f, ctx.actions) },
      { id: 'ib-later', title: 'Odłożone do jutra', label: 'Odłożone', icon: 'clock', tone: 'violet', badge: m.snoozed.length ? String(m.snoozed.length) : '', side: laterPanel(m.snoozed, ctx.actions) }
    ];
    return {
      summary: summaryText(m),
      body: UI.railLayout({
        id: 'inbox', cls: 'ibx-rl', mainCls: 'ibx__main', items: items, active: UI.railActive(state.prefs, RAIL_IDS, null), main: main,
        onSelect: function (id) { ctx.actions.openRail(RAIL_IDS, id); }
      }),
      model: m
    };
  }

  root.ETROM.InboxScreen = { view: view, model: model, count: count, filterOf: filterOf, applyFilter: applyFilter, TABS: TABS, ICONS: ICONS, openItem: openItem };
})(typeof globalThis !== 'undefined' ? globalThis : this);
