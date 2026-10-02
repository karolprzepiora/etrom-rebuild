/* ETROM — przestrzeń robocza projektu.
   Hierarchia: rzędna postępu na profilu przebiegu (dominuje), stan projektu
   z powodami, fakty drugiego planu, ludzie. Pod spodem zakładki z adresem:
   Przebieg (rail etapów), Zadania, Zespół. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Model = E.Model;
  var Progress = E.Progress;
  var Team = E.Team;
  var Tasks = E.Tasks;
  var Avatar = E.Avatar;
  var Insight = E.Insight;
  var Sig = E.Sig;
  var Icons = E.Icons;
  var F = E.Format;

  var TABS = [
    { value: 'etapy', label: 'Przebieg' },
    { value: 'zadania', label: 'Zadania' },
    { value: 'zespol', label: 'Zespół' }
  ];

  var EVENT_KIND = { project: 'Termin umowy', stage: 'Termin etapu', task: 'Termin zadania' };

  function statusControl(project, ctx) {
    var btn = UI.statusButton('project', project.status, {
      subject: 'Projekt ' + project.code, menu: true, class: 'detail__status',
      attrs: { 'data-fk': 'project-status' }
    });
    Menu.bind(btn, function () {
      return {
        label: 'Status projektu',
        items: Object.keys(Model.PROJECT_STATUS).map(function (key) {
          return {
            type: 'radio', label: Model.PROJECT_STATUS[key], checked: project.status === key, value: key,
            leading: UI.statusGlyph('project', key),
            onSelect: function () { ctx.actions.setProjectStatus([project.id], key); }
          };
        })
      };
    });
    return btn;
  }

  /** Akcje projektu trafiają do paska górnego arkusza — kontekst, nie dekoracja. */
  function topbarActions(project, ctx) {
    if (!project) return [];
    var pinned = ctx.actions.isPinned(project.id);
    var more = UI.iconButton({ icon: 'more', label: 'Więcej działań', attrs: { 'data-fk': 'project-more' } });
    Menu.bind(more, function () {
      return {
        label: 'Działania projektu', align: 'end',
        items: [
          { label: 'Usuń projekt', icon: 'trash', tone: 'danger', onSelect: function () { ctx.actions.deleteProjects([project.id]); } }
        ]
      };
    });
    return [
      UI.iconButton({
        icon: pinned ? 'pinOff' : 'pin', label: pinned ? 'Odepnij z panelu' : 'Przypnij w panelu',
        attrs: { 'aria-pressed': String(pinned), id: 'action-pin' },
        onClick: function () { ctx.actions.togglePin(project.id); }
      }),
      UI.button({
        label: 'Edytuj', icon: 'edit', variant: 'secondary', size: 'sm', kbd: 'E',
        attrs: { id: 'action-edit-project' },
        onClick: function () { ctx.actions.editProject(project.id); }
      }),
      more
    ];
  }

  function healthPanel(project, health, next) {
    var lead = health.reasons[0];
    var others = health.reasons.slice(1);
    return D.el('section', { class: 'health health--' + health.level, attrs: { 'aria-label': 'Stan projektu' } }, [
      D.el('div', { class: 'health__head' }, [
        Sig.datum(health.level, { size: 18, label: false }),
        D.el('span', { class: 'health__label', text: health.label })
      ]),
      lead && health.level !== 'closed'
        ? D.el('p', { class: 'health__lead', text: lead.text })
        : D.el('p', { class: 'health__lead health__lead--calm', text: health.level === 'closed' ? 'Projekt zakończony i zamknięty.' : 'Terminy i zadania bez zaległości.' }),
      others.length ? D.el('ul', { class: 'health__more' }, others.map(function (r) {
        return D.el('li', { class: 'reason--' + r.level, text: r.text });
      })) : null,
      next ? D.el('div', { class: 'health__next' }, [
        D.el('span', { class: 'health__next-label', text: 'Najbliżej' }),
        D.el('span', { class: 'health__next-what' }, [
          D.el('span', { class: 'health__next-when t-num', text: next.days === 0 ? 'Dziś' : (next.days === 1 ? 'Jutro' : 'Za ' + next.days + ' dni') }),
          D.el('span', { class: 'truncate', text: EVENT_KIND[next.kind] + (next.kind === 'project' ? '' : ': ' + next.label) })
        ])
      ]) : null
    ]);
  }

  function fact(label, value, sub, tone) {
    return D.el('div', { class: 'fact' + (tone ? ' fact--' + tone : '') }, [
      D.el('dt', { class: 'fact__label', text: label }),
      D.el('dd', { class: 'fact__value' }, typeof value === 'string' ? [D.el('span', { text: value })] : value),
      sub ? D.el('dd', { class: 'fact__sub', text: sub }) : null
    ]);
  }

  function facts(project, now) {
    var stats = Progress.projectProgress(project);
    var tasks = Tasks.projectTaskStats(project, now);
    var active = Progress.activeStage(project);
    var info = Progress.deadlineInfo(project.deadline, now);
    var done = project.status === 'done';
    return D.el('dl', { class: 'facts' }, [
      fact('Bieżący etap',
        [D.el('span', { class: 'fact__text clamp-2', text: active ? Model.describeStage(active).name : (project.stages.length ? 'Wszystkie zakończone' : 'Brak etapów') })],
        active ? 'etap ' + (project.stages.indexOf(active) + 1) + ' z ' + project.stages.length + (active.status === 'working' ? ', w toku' : ', do rozpoczęcia') : ''),
      fact('Godziny', [D.el('span', { class: 't-num', text: F.number(stats.hoursDone) }), D.el('span', { class: 'fact__of t-num', text: ' / ' + F.hours(stats.hoursTotal) })], stats.done + ' z ' + stats.total + ' etapów zakończonych'),
      fact('Zadania otwarte', [D.el('span', { class: 't-num', text: String(tasks.open) })],
        tasks.overdue ? 'w tym ' + tasks.overdue + ' po terminie' : (tasks.total ? 'z ' + tasks.total + ' w projekcie' : 'brak zadań'),
        tasks.overdue ? 'alarm' : ''),
      fact('Termin umowy', project.deadline ? [D.el('span', { class: 't-num', text: F.date(project.deadline, { year: 'always' }) })] : 'Bez terminu',
        project.deadline && !done ? info.text.toLowerCase() : (done ? 'projekt zakończony' : ''),
        !done && info.tone === 'overdue' ? 'alarm' : (!done && info.tone === 'urgent' ? 'warn' : ''))
    ]);
  }

  function signatures(project, ctx) {
    var team = project.team || Team.emptyTeam();
    var rows = Team.FUNCTIONS.map(function (fn) {
      var person = Team.findPerson(ctx.people, team[fn.key]);
      if (!person) return null;
      return D.el('li', null, [D.el('button', {
        class: 'signature',
        attrs: { type: 'button', 'aria-label': fn.label + ': ' + Team.fullName(person) + '. Pokaż szczegóły osoby.' },
        on: { click: function () { ctx.actions.inspect({ kind: 'person', personId: person.id }); } }
      }, [
        Avatar.avatar(person, { size: 'sm', tooltip: false }),
        D.el('span', { class: 'signature__text' }, [
          D.el('span', { class: 'signature__role', text: fn.label }),
          D.el('span', { class: 'signature__name truncate', text: Team.fullName(person) })
        ])
      ])]);
    }).filter(Boolean);
    var members = (team.members || []).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
    if (!rows.length && !members.length) {
      return D.el('div', { class: 'signatures signatures--empty' }, [
        D.el('p', { class: 't-meta', text: 'Zespół nie jest przypisany.' }),
        UI.button({ label: 'Przypisz zespół', variant: 'tertiary', size: 'sm', onClick: function () { ctx.actions.editProject(project.id); } })
      ]);
    }
    return D.el('div', { class: 'signatures' }, [
      D.el('ul', { class: 'signatures__list' }, rows),
      members.length ? D.el('div', { class: 'signatures__members' }, [
        Avatar.avatarStack(members, { max: 5, size: 'sm' }),
        D.el('span', { class: 't-meta', text: '+ ' + F.count(members.length, 'osoba w zespole', 'osoby w zespole', 'osób w zespole') })
      ]) : null
    ]);
  }

  function header(project, ctx, now) {
    var health = Insight.health(project, now);
    var next = Insight.nextEvent(project, now);
    var from = ctx.motion && ctx.motion.progressFrom;

    return D.el('header', { class: 'workspace-head level-' + health.level }, [
      D.el('div', { class: 'workspace-head__id' }, [
        D.el('span', { class: 'code workspace-head__code', text: project.code }),
        statusControl(project, ctx)
      ]),
      D.el('h1', { class: 'workspace-head__title t-display', text: project.name, attrs: { id: 'project-title' } }),
      D.el('p', { class: 'workspace-head__client', text: project.client || 'Bez zamawiającego' }),
      D.el('div', { class: 'workspace-head__grid' }, [
        D.el('section', { class: 'course', attrs: { 'aria-label': 'Przebieg projektu' } }, [
          Sig.profile(project, {
            size: 'macro', now: now, from: typeof from === 'number' ? from : undefined,
            onSegment: function (stageId) { ctx.actions.revealStage(project.id, stageId); }
          }),
          Sig.timeRuler(project, now),
          facts(project, now),
          signatures(project, ctx)
        ]),
        D.el('aside', { class: 'workspace-head__side' }, [
          healthPanel(project, health, next)
        ])
      ])
    ]);
  }

  /* ---------- zakładka Zadania ---------- */

  function tasksTab(project, ctx) {
    var filter = ctx.state.taskFilter || 'open';
    var stats = Tasks.projectTaskStats(project);
    var withTasks = project.stages.filter(function (stage) { return (stage.tasks || []).length; });

    var toolbar = D.el('div', { class: 'section__head' }, [
      D.el('div', { class: 'section__titles' }, [
        D.el('h2', { class: 'section__title', text: 'Zadania' }),
        D.el('span', { class: 'section__meta', text: stats.total ? 'otwarte ' + stats.open + ' z ' + stats.total : 'brak zadań' })
      ]),
      stats.total ? UI.segmented({
        label: 'Które zadania pokazać',
        value: filter,
        items: [{ value: 'open', label: 'Otwarte' }, { value: 'all', label: 'Wszystkie' }],
        onChange: ctx.actions.setTaskFilter
      }).node : null
    ]);

    if (!stats.total) {
      return D.el('section', { class: 'section' }, [toolbar, D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'checklist',
        title: 'Nie ma jeszcze zadań',
        text: project.stages.length
          ? 'Zadania rozpisuje się w etapach. Otwórz etap na zakładce Przebieg i dodaj zadanie z realizatorami oraz terminem.'
          : 'Najpierw dodaj etapy — zadania należą zawsze do któregoś z nich.',
        actions: [UI.button({ label: 'Przejdź do przebiegu', variant: 'secondary', icon: 'layers', onClick: function () { ctx.actions.openProject(project.id, 'etapy'); } })]
      })])]);
    }

    var groups = withTasks.map(function (stage) {
      var info = Model.describeStage(stage);
      var visible = (stage.tasks || []).filter(function (t) { return filter === 'all' || t.status !== 'done'; });
      if (!visible.length) return null;
      return D.el('section', { class: 'task-group' }, [
        D.el('div', { class: 'task-group__head' }, [
          UI.statusGlyph('stage', stage.status),
          D.el('span', { class: 'task-group__no t-num', text: String(project.stages.indexOf(stage) + 1) }),
          D.el('h3', { class: 'task-group__title truncate', text: info.name }),
          D.el('span', { class: 't-meta t-num', text: String(visible.length) }),
          D.el('span', { class: 'toolbar__spacer' }),
          UI.button({ label: 'Dodaj zadanie', icon: 'plus', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.addTask(project.id, stage.id); } })
        ]),
        E.TaskList.taskList(project, stage, ctx.actions, ctx.people, ctx.motion, { filter: filter, hideHead: true })
      ]);
    }).filter(Boolean);

    return D.el('section', { class: 'section' }, [
      toolbar,
      groups.length
        ? D.el('div', { class: 'task-groups' }, groups)
        : D.el('div', { class: 'card' }, [UI.emptyState({
            icon: 'checkCircle', compact: true,
            title: 'Wszystkie zadania zamknięte',
            text: 'Nie ma otwartych zadań. Przełącz na „Wszystkie”, żeby zobaczyć zakończone.'
          })])
    ]);
  }

  /* ---------- zakładka Zespół ---------- */

  function teamTab(project, ctx) {
    var team = project.team || Team.emptyTeam();
    var everyone = Team.projectPeople(team);
    var now = new Date();

    if (!everyone.length) {
      return D.el('section', { class: 'section' }, [D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'people',
        title: 'Zespół nie jest przypisany',
        text: ctx.people.length
          ? 'Wskaż Lidera, Koordynatora i Pełnomocników. Tylko osoby z zespołu mogą realizować zadania w tym projekcie.'
          : 'Najpierw dodaj osoby do katalogu na ekranie Zespół, potem przypisz im funkcje w projekcie.',
        actions: ctx.people.length
          ? [UI.button({ label: 'Przypisz zespół', variant: 'primary', onClick: function () { ctx.actions.editProject(project.id); } })]
          : [UI.button({ label: 'Przejdź do Zespołu', variant: 'secondary', onClick: function () { ctx.actions.goTo('team'); } })]
      })])]);
    }

    function personRow(person, roleLabel) {
      var load = Insight.workload(person.id, [project], now);
      return D.el('li', { class: 'kv row' }, [
        D.el('span', { class: 'kv__key', text: roleLabel }),
        D.el('button', {
          class: 'person person--button',
          attrs: { type: 'button', 'aria-label': Team.fullName(person) + ', ' + roleLabel + '. Pokaż szczegóły.' },
          on: { click: function () { ctx.actions.inspect({ kind: 'person', personId: person.id }); } }
        }, [
          Avatar.avatar(person, { size: 'md', tooltip: false }),
          D.el('span', { class: 'person__text' }, [
            D.el('span', { class: 'person__name', text: Team.fullName(person) }),
            D.el('span', { class: 'person__meta', text: person.position || 'Bez stanowiska' })
          ])
        ]),
        D.el('span', { class: 'kv__load' + (load.overdue ? ' t-alarm' : ' t-muted'), text: load.open ? F.count(load.open, 'zadanie', 'zadania', 'zadań') + (load.overdue ? ', ' + load.overdue + ' po terminie' : '') : 'bez zadań' })
      ]);
    }

    var rows = [];
    Team.FUNCTIONS.forEach(function (fn) {
      var person = Team.findPerson(ctx.people, team[fn.key]);
      if (person) rows.push(personRow(person, fn.label));
    });
    (team.members || []).forEach(function (id) {
      var person = Team.findPerson(ctx.people, id);
      if (person) rows.push(personRow(person, 'Członek zespołu'));
    });

    return D.el('section', { class: 'section' }, [
      D.el('div', { class: 'section__head' }, [
        D.el('div', { class: 'section__titles' }, [
          D.el('h2', { class: 'section__title', text: 'Zespół projektu' }),
          D.el('span', { class: 'section__meta', text: F.count(everyone.length, 'osoba', 'osoby', 'osób') })
        ]),
        UI.button({ label: 'Edytuj zespół', icon: 'edit', variant: 'secondary', size: 'sm', onClick: function () { ctx.actions.editProject(project.id); } })
      ]),
      D.el('ul', { class: 'kv-list' }, rows)
    ]);
  }

  /* ---------- całość ---------- */

  function notFound(ctx) {
    return D.el('div', { class: 'card' }, [UI.emptyState({
      icon: 'folder',
      title: 'Nie znaleziono projektu',
      text: 'Projekt mógł zostać usunięty albo adres jest nieaktualny.',
      actions: [UI.button({ label: 'Wróć do projektów', variant: 'secondary', icon: 'arrowLeft', onClick: function () { ctx.actions.goTo('projects'); } })]
    })]);
  }

  function projectDetail(project, ctx) {
    if (!project) return [notFound(ctx)];
    var now = new Date();
    var tab = ctx.state.route.tab || 'etapy';
    var stats = Progress.projectProgress(project);
    var tasks = Tasks.projectTaskStats(project);
    var counts = { etapy: stats.total, zadania: tasks.open, zespol: Team.projectPeople(project.team).length };

    var body;
    if (tab === 'zadania') body = tasksTab(project, ctx);
    else if (tab === 'zespol') body = teamTab(project, ctx);
    else body = E.StageList.stageList(project, ctx);

    var tabs = UI.tabs({
      label: 'Sekcje projektu',
      value: tab,
      class: 'detail__tabs',
      items: TABS.map(function (t) {
        return { value: t.value, label: t.label, count: counts[t.value], href: E.ProjectList.projectHref(project, t.value === 'etapy' ? '' : t.value) };
      })
    });

    return [
      header(project, ctx, now),
      D.el('div', { class: 'detail__work' }, [tabs, D.el('div', { class: 'detail__body', attrs: { 'data-tab': tab } }, [body])])
    ];
  }

  root.ETROM.ProjectDetail = { projectDetail: projectDetail, topbarActions: topbarActions, TABS: TABS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
