/* ETROM — „Moja praca”: ekran, który otwiera się rano.
   Zadania jednej osoby według czasu (po terminie, dziś, ten tydzień, później),
   to, co wymaga jej decyzji (zadania do zatwierdzenia, zwroty do poprawy),
   oraz projekty, w których ma funkcję. Kim jest osoba przy tym urządzeniu,
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
    { key: 'today', label: 'Dziś', tone: 'flow' },
    { key: 'week', label: 'W tym tygodniu', tone: '' },
    { key: 'later', label: 'Później', tone: '' },
    { key: 'none', label: 'Bez terminu', tone: '' }
  ];

  function inspectRef(row) {
    return { kind: 'task', projectId: row.project.id, stageId: row.stage.id, taskId: row.task.id };
  }

  /** Kontekst zadania: projekt i etap, link do projektu. */
  function context(row) {
    return D.el('span', { class: 'mrow__context' }, [
      D.el('a', {
        class: 'mrow__project',
        text: row.project.code,
        attrs: { href: E.ProjectList.projectHref(row.project, 'zadania'), 'data-tooltip': row.project.name }
      }),
      D.el('span', { class: 'truncate', text: E.Model.describeStage(row.stage).name })
    ]);
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
    if (task.status === 'changes' && task.feedback) {
      body.push(D.el('p', { class: 'trow__feedback' }, [Icons.icon('alert', 14), D.el('span', { text: 'Do poprawy: ' + task.feedback })]));
    }

    var last = settings.approve
      ? D.el('div', { class: 'mrow__decide' }, [
          UI.button({ label: 'Zatwierdź', icon: 'check', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'approve-' + task.id }, onClick: function () { ctx.actions.moveTask(row.project.id, row.stage.id, task.id, 'done'); } }),
          UI.button({ label: 'Zwróć', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'return-' + task.id }, onClick: function () { ctx.actions.moveTask(row.project.id, row.stage.id, task.id, 'changes'); } })
        ])
      : D.el('span', { class: 'trow__deadline' }, [
          task.deadline
            ? UI.due(task.deadline, info, { done: task.status === 'done', relativeOnly: info.tone === 'overdue' || info.tone === 'urgent' })
            : D.el('span', { class: 'due due--none', text: 'Bez terminu' })
        ]);

    return D.el('li', { class: 'mrow row trow--' + task.status + (settings.approve ? ' mrow--approve' : ''), dataset: { taskId: task.id } }, [
      settings.approve ? UI.status('task', task.status) : E.TaskList.statusControl(row.project, row.stage, task, ctx.actions),
      D.el('div', { class: 'mrow__body' }, body),
      D.el('span', { class: 'mrow__load t-meta', text: Tasks.WORKLOAD[task.workload] || '' }),
      last,
      settings.approve ? null : E.Timer.timerButton(row.project, row.stage, task, ctx.actions)
    ]);
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
            D.el('span', { class: 'code', text: project.code }),
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
  function picker(people, actions) {
    var active = (people || []).filter(function (p) { return p.active !== false; })
      .sort(function (a, b) { return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' }); });
    if (!active.length) {
      return UI.emptyState({
        icon: 'people',
        title: 'Najpierw dodaj osoby do zespołu',
        text: 'Moja praca pokazuje zadania przypisane do jednej osoby. Dodaj ludzi w zakładce Zespół, a potem wybierz, kim jesteś.',
        actions: [UI.button({ label: 'Przejdź do zespołu', icon: 'people', variant: 'primary', onClick: function () { actions.goTo('team'); } })]
      });
    }
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

  function summaryText(person, work) {
    if (!work.open && !work.toApprove.length) return 'Nic nie czeka na ' + (person.firstName || Team.fullName(person)) + '. Czysty stół.';
    var parts = [F.count(work.open, 'otwarte zadanie', 'otwarte zadania', 'otwartych zadań')];
    if (work.overdue) parts.push(work.overdue + ' po terminie');
    if (work.returned.length) parts.push(work.returned.length + ' do poprawy');
    if (work.toApprove.length) parts.push(work.toApprove.length + ' do Twojej decyzji');
    return parts.join(' · ');
  }

  /**
   * Treść ekranu. Zwraca { summary, actions, body } — nagłówek składa aplikacja.
   */
  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    var now = new Date();
    if (!me) return { summary: 'Twoje zadania, zatwierdzenia i projekty w jednym miejscu.', who: null, body: picker(people, ctx.actions) };

    var work = Insight.myWork(me.id, state.workspace.projects, now);
    var nothing = !work.open && !work.toApprove.length && !work.projects.length;

    var main = [];
    main.push(section('Czeka na Twoją decyzję', work.toApprove.length, 'flow', work.toApprove, ctx, { approve: true }));
    GROUPS.forEach(function (g) {
      main.push(section(g.label, work.buckets[g.key].length, g.tone, work.buckets[g.key], ctx));
    });
    if (!work.open && !work.toApprove.length) {
      main.push(UI.emptyState({
        icon: 'checkCircle',
        title: 'Brak otwartych zadań',
        text: nothing ? 'Nie jesteś jeszcze przypisany do żadnego zadania ani projektu.' : 'Wszystko, co było przypisane do Ciebie, jest zakończone.'
      }));
    }

    return {
      summary: summaryText(me, work),
      who: whoButton(me, people, ctx.actions),
      body: D.el('div', { class: 'mywork' }, [
        D.el('div', { class: 'mywork__main' }, main),
        D.el('aside', { class: 'mywork__aside', attrs: { 'aria-label': 'Czas i projekty' } }, [
          E.Timer.todayBlock(TL.forDay(state.workspace.entries || [], me.id, now), { find: ctx.find, actions: ctx.actions }),
          D.el('div', { class: 'maside__projects' }, [
            D.el('h2', { class: 'msec__title', text: 'Moje projekty' }),
            projectsAside(work, now)
          ])
        ])
      ]),
      work: work
    };
  }

  root.ETROM.MyWork = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
