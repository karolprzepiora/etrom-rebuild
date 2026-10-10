/* ETROM — „Moja praca”: ekran, który otwiera się rano.
   Jedno miejsce na „co sam mam zrobić”: zadania jednej osoby według czasu (po terminie, dziś,
   ten tydzień, później), sprawy w toku oraz projekty, w których ma funkcję.
   To, czego czekają ode mnie inni (zatwierdzenia, zlecenia, wnioski, pisma), jest w osobnej Skrzynce.
   Kim jest osoba przy tym urządzeniu, zapisuje preferencja „ja” — bez logowania, do czasu wspólnych kont. */
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

  /**
   * Dwie szyny po prawej („Czekam na odpowiedź” i „Zegar i projekty”) otwierają się zamiennie:
   * rozwinięcie jednej zwija drugą. Bez zapisanego wyboru otwarty jest zegar, a sprawy
   * pokazują licznik (czerwony, gdy coś czeka na dopytanie lub decyzję).
   */
  function dockState(prefs, hasCases) {
    var list = (prefs && prefs.collapsedRails) || [];
    var zegar = list.indexOf('mywork') >= 0;
    var cases = list.indexOf('mycases') >= 0;
    if (hasCases && !zegar && !cases) cases = true;
    return { zegar: zegar, cases: cases };
  }
  function setDock(actions, prefs, open) {
    var list = ((prefs && prefs.collapsedRails) || []).filter(function (id) { return id !== 'mywork' && id !== 'mycases'; });
    if (open !== 'zegar') list.push('mywork');
    if (open !== 'cases') list.push('mycases');
    actions.setPref({ collapsedRails: list });
  }

  function inspectRef(row) {
    return { kind: 'task', projectId: row.project.id, stageId: row.stage.id, taskId: row.task.id };
  }

  /** Kontekst zadania: projekt i etap, link do projektu. */
  function context(row) {
    return UI.projectTag(row.project, { href: E.ProjectList.projectHref(row.project, 'zadania'), stage: E.Model.describeStage(row.stage).name });
  }

  /** Termin w jednej gramatyce: „po terminie 1 d · śr 7.10”, „dziś 17:00”, „jutro 20:00”, „sob 10.10 · 14:00”. */
  var DOW = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];
  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function deadlineChip(task, info) {
    if (task.status === 'done' || !task.deadline || Number.isNaN(Date.parse(task.deadline))) return E.TaskList.deadlineBlock(task, info);
    var d = new Date(task.deadline);
    var now = new Date();
    var days = Math.round((dayStart(d) - dayStart(now)) / 86400000);
    var hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    var dm = d.getDate() + '.' + (d.getMonth() + 1);
    var text; var tone;
    if (d.getTime() < now.getTime()) {
      tone = 'late';
      text = days < 0 ? 'po terminie ' + (-days) + ' d · ' + DOW[d.getDay()] + ' ' + dm : 'po terminie ' + Math.max(1, Math.floor((now.getTime() - d.getTime()) / 3600000)) + ' h';
    } else if (days === 0) { tone = 'today'; text = 'dziś ' + hh; }
    else if (days === 1) { tone = 'soon'; text = 'jutro ' + hh; }
    else { tone = 'later'; text = DOW[d.getDay()] + ' ' + dm + ' · ' + hh; }
    return D.el('span', { class: 'tdue dchip dchip--' + tone, attrs: { 'data-tooltip': 'Termin: ' + E.Format.dateLong(task.deadline.slice(0, 10)) + ', ' + hh + ' — ' + info.text } }, [D.el('span', { class: 'tdue__date t-num', text: text })]);
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
        task.important ? UI.badge('Ważne', 'warning', { icon: 'flag' }) : null,
        (function () { var cs = E.Cases.byTask((ctx.state && ctx.state.workspace.cases) || ctx.cases || [], task.id); return cs ? E.CaseUI.chip(cs, { actions: ctx.actions, projects: ctx.state ? ctx.state.workspace.projects : [] }) : null; })(),
        row.stage.budgetFlag && row.stage.status !== 'done' && task.status !== 'done' ? E.BudgetFlag.badge(row.stage.budgetFlag, ctx.people || (ctx.state && ctx.state.workspace.people)) : null
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
      : D.el('span', { class: 'trow__deadline' }, [deadlineChip(task, info)]);

    var ref = { projectId: row.project.id, stageId: row.stage.id };
    var li = null;
    function toggleList() {
      var open = E.Checklist.toggle(task.id);
      var cur = li.querySelector('.chk');
      if (cur) cur.remove();
      if (open) { li.appendChild(E.Checklist.panel(task, ref, ctx)); var f = li.querySelector('.chk__input'); if (f) f.focus(); }
      var old = li.querySelector('.chk-ind');
      if (old) old.replaceWith(E.Checklist.indicator(task, toggleList, ctx, ref));
    }
    var withList = !settings.approve && ctx.meId;
    if (withList) body[0].appendChild(E.Checklist.indicator(task, toggleList, ctx, ref));
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
    if (!active.length) return E.Welcome.card(state, { actions: actions }, 'Moja praca pokazuje zadania przypisane do jednej osoby.');
    return D.el('div', { class: 'mpick' }, [
      D.el('h2', { class: 'mpick__title', text: 'Kim jesteś?' }),
      D.el('p', { class: 'mpick__text', text: 'Wybierz siebie — ekran pokaże Twoje zadania. Wybór zapamiętuje się na tym urządzeniu i można go zmienić w każdej chwili.' }),
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

  // Widoki listy: które przedziały czasu i zadania do poprawy.
  var VIEWS = [
    { value: 'all', label: 'Wszystko' },
    { value: 'today', label: 'Dziś' },
    { value: 'week', label: 'Ten tydzień' },
    { value: 'weeks', label: 'Tygodnie' },
    { value: 'returned', label: 'Do poprawy' }
  ];

  /**
   * Jeden model dla ekranu i licznika w menu: zadania osoby (po terminie, dziś, tydzień, później),
   * zadania zwrócone do poprawy i projekty, w których ma funkcję.
   */
  function model(state, now) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me) return null;
    var work = Insight.myWork(me.id, state.workspace.projects, now);
    return {
      me: me, work: work, buckets: work.buckets, open: work.open,
      overdue: work.buckets.overdue.length,
      returned: work.returned
    };
  }

  /** Liczba w menu: otwarte zadania. Sprawy do załatwienia dla innych liczy Skrzynka. */
  function count(state, now) {
    var m = model(state, now || new Date());
    if (!m) return null;
    return { total: m.open, overdue: m.overdue };
  }

  function viewCount(key, m) {
    var b = m.buckets;
    if (key === 'all') return m.open;
    if (key === 'today') return b.overdue.length + b.today.length;
    if (key === 'week') return b.overdue.length + b.today.length + b.week.length;
    if (key === 'weeks') return m.open;
    return m.returned.length;
  }

  /** Które sekcje i które wiersze pokazuje wybrany widok. */
  function pick(key, m) {
    var b = m.buckets;
    var out = { groups: {} };
    GROUPS.forEach(function (g) { out.groups[g.key] = b[g.key]; });
    if (key === 'today') out.groups = { overdue: b.overdue, today: b.today };
    else if (key === 'week') out.groups = { overdue: b.overdue, today: b.today, week: b.week };
    else if (key === 'returned') {
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
    if (!m.open) return 'Nic nie czeka na ' + (person.firstName || Team.fullName(person)) + '. Czysty stół.';
    var parts = [F.count(m.open, 'otwarte zadanie', 'otwarte zadania', 'otwartych zadań')];
    if (m.overdue) parts.push(m.overdue + ' po terminie');
    if (m.returned.length) parts.push(m.returned.length + ' do poprawy');
    return parts.join(' · ');
  }

  /**
   * Treść ekranu. Zwraca { summary, actions, body } — nagłówek składa aplikacja.
   */
  function view(state, ctx) {
    var people = state.workspace.people || [];
    var now = new Date();
    var m = model(state, now);
    if (!m) return { summary: 'Twoje zadania w jednym miejscu.', who: null, body: picker(people, ctx.actions, state) };
    var me = m.me;
    ctx = Object.assign({}, ctx, { people: people, meId: me.id, state: state });
    var nothing = !m.open && !m.work.projects.length;

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
      shown = { groups: {} };
    }
    var caseEl = (current === 'all' || current === 'today' || current === 'week') ? E.CaseUI.section(state, ctx, current) : null;
    var rest = [];
    GROUPS.forEach(function (g) {
      var rows = shown.groups[g.key] || [];
      rest.push(section(g.label, rows.length, g.tone, rows, ctx));
    });
    var visible = rest.filter(Boolean);
    var dock = dockState(state.prefs, !!caseEl);
    if (caseEl) {
      // Sprawy w zwijanej szynie obok listy; karty zaczynają się na wysokości zakładek, tak jak „Zegar i projekty”.
      main = main.concat(visible);
    } else main = main.concat(visible);
    if (current !== 'all' && current !== 'weeks' && !visible.length && !caseEl) main.push(D.el('p', { class: 'ibx__empty', text: 'Nic w tym widoku.' }));
    if (current === 'all' && !m.open) {
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
        var zegarSide = [
            D.el('div', { class: 'mywork__aside' }, [
              D.el('div', { class: 'maside__projects' }, [
                D.el('h2', { class: 'msec__title', text: 'Moje projekty' }),
                projectsAside(m.work, now)
              ])
            ])
          ];
        var items = [];
        if (caseEl) items.push({ id: 'mycases', title: caseEl.dataset.title, label: 'Sprawy w toku', icon: 'history', tone: 'warn', badge: caseEl.dataset.count, late: Number(caseEl.dataset.attention) > 0, side: [caseEl] });
        items.push({ id: 'mywork', title: 'Moje projekty', label: 'Projekty', icon: 'folder', tone: 'accent', badge: '', side: zegarSide });
        var openId = caseEl ? (!dock.cases ? 'mycases' : (!dock.zegar ? 'mywork' : null)) : (dock.zegar ? null : 'mywork');
        return UI.railLayout({
          id: 'mywork', cls: 'mywork', mainCls: 'mywork__main', items: items, active: openId, main: main,
          onSelect: function (id) { if (caseEl) setDock(ctx.actions, state.prefs, id === 'mycases' ? 'cases' : (id === 'mywork' ? 'zegar' : null)); else ctx.actions.toggleRail('mywork'); }
        });
      })(),
      work: m.work
    };
  }

  /** Sekcje list zadań (po terminie, dziś, kolejne dni) dla Pulpitu. */
  function listSections(state, ctx, key, now) {
    var m = model(state, now);
    if (!m) return { m: null, nodes: [] };
    var c = Object.assign({}, ctx, { people: state.workspace.people || [], meId: m.me.id, state: state });
    var shown = pick(key, m);
    var out = [];
    GROUPS.forEach(function (g) { var rows = shown.groups[g.key] || []; out.push(section(g.label, rows.length, g.tone, rows, c)); });
    return { m: m, nodes: out.filter(Boolean) };
  }

  root.ETROM.MyWork = { view: view, count: count, model: model, VIEWS: VIEWS, listSections: listSections };
})(typeof globalThis !== 'undefined' ? globalThis : this);
