/* ETROM — „Moja praca”: ekran, który otwiera się rano.
   Jedno miejsce na „co mam zrobić”: to, co wymaga reakcji (zatwierdzenia, pisma),
   zadania jednej osoby według czasu (po terminie, dziś, ten tydzień, później)
   oraz projekty, w których ma funkcję. Dawna Skrzynka jest teraz sekcją tego ekranu. Kim jest osoba przy tym urządzeniu,
   zapisuje preferencja „ja” — bez logowania, do czasu wspólnych kont. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Team = E.Team;
  var Tasks = E.Tasks;
  var Avatar = E.Avatar;
  var Icons = E.Icons;
  var Insight = E.Insight;
  var Sig = E.Sig;
  var F = E.Format;
  var TL = E.TimeLog;

  var GROUPS = [
    { key: 'overdue', label: 'Po terminie', tone: 'alarm' },
    { key: 'today', label: 'Dziś', tone: '' },
    { key: 'week', label: 'W tym tygodniu', tone: '' },
    { key: 'later', label: 'Później', tone: '' },
    { key: 'none', label: 'Bez terminu', tone: '' }
  ];

  function inspectRef(row) {
    return { kind: 'task', projectId: row.project.id, stageId: row.stage.id, taskId: row.task.id };
  }

  /** Kontekst zadania: projekt i etap, link do projektu. */
  function context(row) {
    return UI.projectTag(row.project, { href: E.ProjectList.projectHref(row.project, 'zadania'), stage: E.Model.describeStage(row.stage).name });
  }

  function taskRow(row, ctx, options) {
    var settings = options || {};
    var task = row.task;
    var info = Tasks.deadlineInfo(task);
    var body = [
      D.el('div', { class: 'mrow__title' }, [
        D.el('button', {
          class: 'trow__name',
          text: task.name,
          attrs: { type: 'button', 'aria-label': 'Szczegóły zadania: ' + task.name, 'data-fk': 'my-task-' + task.id },
          on: { click: function () { ctx.actions.inspect(inspectRef(row)); } }
        }),
        task.important ? UI.badge('Ważne', 'warning', { icon: 'flag' }) : null
      ]),
      context(row)
    ];
    var steps = settings.approve ? [] : E.TaskList.stepButtons(row.project, row.stage, task, ctx.actions);
    if (steps.length) body.push(D.el('p', { class: 'trow__meta t-meta' }, steps));
    if (task.status === 'changes' && task.feedback) {
      body.push(D.el('p', { class: 'trow__feedback' }, [Icons.icon('alert', 14), D.el('span', { text: 'Do poprawy: ' + task.feedback })]));
    }

    var last = settings.approve
      ? D.el('div', { class: 'mrow__decide' }, [
          UI.button({ label: 'Zatwierdź', icon: 'check', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'approve-' + task.id }, onClick: function () { ctx.actions.moveTask(row.project.id, row.stage.id, task.id, 'done'); } }),
          UI.button({ label: 'Zwróć', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'return-' + task.id }, onClick: function () { ctx.actions.moveTask(row.project.id, row.stage.id, task.id, 'changes'); } })
        ])
      : D.el('span', { class: 'trow__deadline' }, [E.TaskList.deadlineBlock(task, info)]);

    var ref = { projectId: row.project.id, stageId: row.stage.id };
    var li = null;
    function toggleList() {
      var open = E.Checklist.toggle(task.id);
      var cur = li.querySelector('.chk');
      if (cur) cur.remove();
      if (open) { li.appendChild(E.Checklist.panel(task, ref, ctx)); var f = li.querySelector('.chk__input'); if (f) f.focus(); }
      var old = li.querySelector('.chk-ind');
      if (old) old.replaceWith(E.Checklist.indicator(task, toggleList, ctx));
    }
    var withList = !settings.approve && ctx.meId;
    if (withList) body[0].appendChild(E.Checklist.indicator(task, toggleList, ctx));
    li = D.el('li', { class: 'mrow row trow--' + task.status + (settings.approve ? ' mrow--approve' : ''), dataset: { taskId: task.id } }, [
      settings.approve ? UI.status('task', task.status) : E.TaskList.statusControl(row.project, row.stage, task, ctx.actions),
      D.el('div', { class: 'mrow__body' }, body),
      D.el('span', { class: 'mrow__load' }, [UI.effortMark(task)]),
      last,
      settings.approve ? null : E.Timer.timerButton(row.project, row.stage, task, ctx.actions)
    ]);
    if (withList && E.Checklist.isOpen(task.id)) li.appendChild(E.Checklist.panel(task, ref, ctx));
    return li;
  }

  function section(title, count, tone, rows, ctx, options) {
    if (!rows.length) return null;
    return D.el('section', { class: 'msec' + (tone ? ' msec--' + tone : ''), attrs: { 'aria-label': title } }, [
      D.el('div', { class: 'msec__head' }, [
        D.el('h2', { class: 'msec__title', text: title }),
        D.el('span', { class: 'msec__count t-num', text: String(count) })
      ]),
      D.el('ul', { class: 'mrows' }, rows.map(function (row) { return taskRow(row, ctx, options); }))
    ]);
  }

  function projectsAside(work, now) {
    if (!work.projects.length) {
      return D.el('p', { class: 'maside__empty', text: 'Nie masz jeszcze funkcji w żadnym projekcie.' });
    }
    return D.el('ul', { class: 'mprojects' }, work.projects.map(function (entry) {
      var project = entry.project;
      var h = Insight.health(project, now);
      return D.el('li', null, [D.el('a', { class: 'mproject', attrs: { href: E.ProjectList.projectHref(project) } }, [
        Sig.datum(h.level, { size: 12, label: false }),
        D.el('span', { class: 'mproject__text' }, [
          D.el('span', { class: 'mproject__name truncate', text: project.name }),
          D.el('span', { class: 'mproject__meta truncate' }, [
            D.el('span', { class: 'code pcode', style: E.Identity.hueStyle(project.code), text: project.code }),
            D.el('span', { text: entry.functions.map(function (fn) { return fn.label; }).join(', ') })
          ]),
          project.deadline ? D.el('span', { class: 'mproject__due' }, [
            D.el('span', { class: 't-num', text: F.date(project.deadline, { year: 'always' }) }),
            UI.countdown(project.deadline, { now: now })
          ]) : null
        ])
      ])]);
    }));
  }

  /** Wybór osoby: pierwszy kontakt z ekranem albo zmiana osoby. */
  function picker(people, actions, state) {
    var active = (people || []).filter(function (p) { return p.active !== false; })
      .sort(function (a, b) { return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' }); });
    if (!active.length) return E.Welcome.card(state, { actions: actions }, 'Moja praca pokazuje zadania przypisane do jednej osoby oraz to, co czeka na Twoją decyzję.');
    return D.el('div', { class: 'mpick' }, [
      D.el('h2', { class: 'mpick__title', text: 'Kim jesteś?' }),
      D.el('p', { class: 'mpick__text', text: 'Wybierz siebie — ekran pokaże Twoje zadania i to, co czeka na Twoją decyzję. Wybór zapamiętuje się na tym urządzeniu i można go zmienić w każdej chwili.' }),
      D.el('ul', { class: 'mpick__list' }, active.map(function (person) {
        return D.el('li', null, [D.el('button', {
          class: 'mpick__item',
          attrs: { type: 'button', 'data-fk': 'pick-me-' + person.id },
          on: { click: function () { actions.setMe(person.id); } }
        }, [
          Avatar.avatar(person, { size: 'md', tooltip: false }),
          D.el('span', { class: 'mpick__name', text: Team.fullName(person) }),
          D.el('span', { class: 'mpick__pos t-meta', text: person.position || '' })
        ])]);
      }))
    ]);
  }

  /** Przycisk „jako…” z menu zmiany osoby — trafia do nagłówka ekranu. */
  function whoButton(person, people, actions) {
    var btn = D.el('button', { class: 'mywho', attrs: { type: 'button', 'aria-haspopup': 'menu', 'data-fk': 'my-who', 'data-tooltip': 'Zmień osobę' } }, [
      Avatar.avatar(person, { size: 'sm', tooltip: false }),
      D.el('span', { text: Team.fullName(person) }),
      Icons.icon('chevronDown', 14)
    ]);
    Menu.bind(btn, function () {
      var items = (people || []).filter(function (p) { return p.active !== false; })
        .sort(function (a, b) { return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' }); })
        .map(function (p) {
          return { label: Team.fullName(p), value: p.id, hint: p.id === person.id ? 'Ty' : '', onSelect: function () { actions.setMe(p.id); } };
        });
      return { label: 'Pracuję jako', items: items, align: 'end', minWidth: '16rem' };
    });
    return btn;
  }

  // Widoki listy: które przedziały czasu i co wymaga reakcji.
  var VIEWS = [
    { value: 'all', label: 'Wszystko' },
    { value: 'today', label: 'Dziś' },
    { value: 'week', label: 'Ten tydzień' },
    { value: 'weeks', label: 'Tygodnie' },
    { value: 'react', label: 'Wymaga reakcji' },
    { value: 'returned', label: 'Do poprawy' }
  ];

  /**
   * Jeden model dla ekranu i licznika w menu: zadania osoby, to, co wymaga jej reakcji
   * (zatwierdzenia, pisma), alarmy projektów. Zadanie utworzone z pisma, które jest
   * w sekcji reakcji, nie powtarza się na liście zadań — widać je przy piśmie.
   */
  function model(state, now) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me) return null;
    var work = Insight.myWork(me.id, state.workspace.projects, now);
    var result = E.Inbox.build(me.id, state.workspace.projects, state.workspace.mail, now, state.prefs.snoozed, state.workspace.entries);
    var parts = E.InboxScreen.split(result);
    var buckets = work.buckets;
    var open = work.open;
    return {
      me: me, work: work, result: result, parts: parts, buckets: buckets, open: open,
      overdue: buckets.overdue.length,
      returned: work.returned,
      react: parts.react, alarms: parts.alarms, snoozed: parts.snoozed
    };
  }

  /** Liczba w menu: otwarte zadania + to, co wymaga reakcji. */
  function count(state, now) {
    var m = model(state, now || new Date());
    if (!m) return null;
    return { total: m.open + m.react.length, overdue: m.overdue, urgent: m.parts.urgent };
  }

  function viewCount(key, m) {
    var b = m.buckets;
    if (key === 'all') return m.open + m.react.length;
    if (key === 'today') return b.overdue.length + b.today.length;
    if (key === 'week') return b.overdue.length + b.today.length + b.week.length;
    if (key === 'weeks') return m.open;
    if (key === 'react') return m.react.length;
    return m.returned.length;
  }

  /** Które sekcje i które wiersze pokazuje wybrany widok. */
  function pick(key, m) {
    var b = m.buckets;
    var out = { react: m.react, alarms: m.alarms, snoozed: m.snoozed, groups: {} };
    GROUPS.forEach(function (g) { out.groups[g.key] = b[g.key]; });
    if (key === 'today') { out.react = []; out.alarms = []; out.snoozed = []; out.groups = { overdue: b.overdue, today: b.today }; }
    else if (key === 'week') { out.react = []; out.alarms = []; out.snoozed = []; out.groups = { overdue: b.overdue, today: b.today, week: b.week }; }
    else if (key === 'react') { out.groups = {}; }
    else if (key === 'returned') {
      out.react = []; out.alarms = []; out.snoozed = [];
      GROUPS.forEach(function (g) { out.groups[g.key] = b[g.key].filter(function (r) { return r.task.status === 'changes'; }); });
    }
    return out;
  }

  function viewTabs(m, current, actions) {
    return D.el('div', { class: 'pf-views mywork__views', attrs: { role: 'tablist', 'aria-label': 'Widoki mojej pracy' } }, VIEWS.map(function (v) {
      var active = v.value === current;
      return D.el('button', {
        class: 'pf-view' + (active ? ' is-active' : ''),
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(active), 'data-fk': 'mywork-view-' + v.value },
        on: { click: function () { actions.setMyView(v.value); } }
      }, [D.el('span', { text: v.label }), D.el('span', { class: 'pf-view__count t-num', text: String(viewCount(v.value, m)) })]);
    }));
  }

  function summaryText(m) {
    var person = m.me;
    if (!m.open && !m.react.length) return 'Nic nie czeka na ' + (person.firstName || Team.fullName(person)) + '. Czysty stół.';
    var parts = [F.count(m.open, 'otwarte zadanie', 'otwarte zadania', 'otwartych zadań')];
    if (m.overdue) parts.push(m.overdue + ' po terminie');
    if (m.returned.length) parts.push(m.returned.length + ' do poprawy');
    if (m.react.length) parts.push(m.react.length + ' wymaga reakcji');
    return parts.join(' · ');
  }

  /**
   * Treść ekranu. Zwraca { summary, actions, body } — nagłówek składa aplikacja.
   */
  function view(state, ctx) {
    var people = state.workspace.people || [];
    var now = new Date();
    var m = model(state, now);
    if (!m) return { summary: 'Twoje zadania, zatwierdzenia i pisma w jednym miejscu.', who: null, body: picker(people, ctx.actions, state) };
    var me = m.me;
    ctx = Object.assign({}, ctx, { people: people, meId: me.id });
    var nothing = !m.open && !m.react.length && !m.work.projects.length;

    var current = VIEWS.some(function (v) { return v.value === state.myView; }) ? state.myView : 'all';
    var shown = pick(current, m);
    var main = [viewTabs(m, current, ctx.actions)];
    if (current === 'weeks') {
      var board = E.PlanBoard.view(state, ctx, now, { solo: true });
      var wb = m.buckets;
      function counter(cls, n, text) { return D.el('span', { class: 'pb-counter' + (cls ? ' pb-counter--' + cls : '') + (n ? '' : ' is-zero') }, [D.el('b', { text: String(n) }), D.el('span', { text: text })]); }
      main.push(D.el('div', { class: 'pb-counters', attrs: { 'aria-label': 'Podsumowanie terminów' } }, [
        counter('late', wb.overdue.length, 'po terminie'),
        counter('today', wb.today.length, 'dziś'),
        counter('', wb.week.length, 'w tym tygodniu'),
        counter('', wb.later.length, 'później')
      ]));
      main = main.concat(board.body.filter(Boolean));
      shown = { react: [], alarms: [], snoozed: [], groups: {} };
    }
    var rest = current === 'weeks' ? [] : [
      E.InboxScreen.alarmStrip(shown.alarms, ctx),
      E.InboxScreen.section(shown.react, ctx, now)
    ];
    GROUPS.forEach(function (g) {
      var rows = shown.groups[g.key] || [];
      rest.push(section(g.label, rows.length, g.tone, rows, ctx));
    });
    rest.push(E.InboxScreen.snoozedBlock(shown.snoozed, ctx.actions));
    var visible = rest.filter(Boolean);
    main = main.concat(visible);
    if (current !== 'all' && current !== 'weeks' && !visible.length) main.push(D.el('p', { class: 'ibx__empty', text: 'Nic w tym widoku.' }));
    if (current === 'all' && !m.open && !m.react.length) {
      main.push(UI.emptyState({
        icon: 'checkCircle',
        title: 'Brak otwartych zadań',
        text: nothing ? 'Nie jesteś jeszcze przypisany do żadnego zadania ani projektu.' : 'Wszystko, co było przypisane do Ciebie, jest zakończone.'
      }));
    }

    return {
      summary: summaryText(m),
      who: whoButton(me, people, ctx.actions),
      body: (function () {
        var todays = TL.forDay(state.workspace.entries || [], me.id, now);
        var minutes = TL.sum(todays, now);
        return UI.railLayout({
          id: 'mywork', title: 'Zegar i projekty', label: 'Czas i projekty', cls: 'mywork', mainCls: 'mywork__main',
          collapsed: (state.prefs.collapsedRails || []).indexOf('mywork') >= 0,
          onToggle: function () { ctx.actions.toggleRail('mywork'); },
          badge: minutes ? (TL.hoursOf(minutes) + " h").replace(".", ",") : '',
          main: main,
          side: [
            D.el('div', { class: 'mywork__aside' }, [
              E.Timer.todayBlock(todays, { find: ctx.find, actions: ctx.actions, entries: state.workspace.entries || [], meId: me.id, pending: state.pendingSwitch ? ctx.find(state.pendingSwitch) : null }),
              E.DaySummary.card(E.DaySummary.build({ entries: state.workspace.entries || [], projects: state.workspace.projects || [], personId: me.id, now: now, target: state.prefs.dayTarget, absences: state.workspace.absences || [] }), { actions: ctx.actions }),
              D.el('div', { class: 'maside__projects' }, [
                D.el('h2', { class: 'msec__title', text: 'Moje projekty' }),
                projectsAside(m.work, now)
              ])
            ])
          ]
        });
      })(),
      work: m.work
    };
  }

  root.ETROM.MyWork = { view: view, count: count, model: model, VIEWS: VIEWS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
