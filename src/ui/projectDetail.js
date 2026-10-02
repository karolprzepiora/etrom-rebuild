/* ETROM — szczegóły projektu.
   Nagłówek (kod, status, nazwa, zamawiający, termin), pasek kluczowych
   liczb i trzy zakładki z własnym adresem: Etapy, Zadania, Zespół.
   Wszystko, co wcześniej rozwijało się w karcie na liście, ma tu miejsce. */
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
  var F = E.Format;
  var Icons = E.Icons;

  var TABS = [
    { value: 'etapy', label: 'Etapy', icon: 'layers' },
    { value: 'zadania', label: 'Zadania', icon: 'checklist' },
    { value: 'zespol', label: 'Zespół', icon: 'people' }
  ];

  function header(project, ctx) {
    var statusBtn = UI.statusButton('project', project.status, {
      subject: 'Projekt ' + project.code, menu: true, class: 'detail__status',
      attrs: { 'data-fk': 'project-status' }
    });
    Menu.bind(statusBtn, function () {
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

    var more = UI.iconButton({ icon: 'more', label: 'Więcej działań', attrs: { 'data-fk': 'project-more' } });
    Menu.bind(more, function () {
      return {
        label: 'Działania projektu', align: 'end',
        items: [
          { label: 'Usuń projekt', icon: 'trash', tone: 'danger', onSelect: function () { ctx.actions.deleteProjects([project.id]); } }
        ]
      };
    });

    var info = Progress.deadlineInfo(project.deadline);
    var description = [D.el('span', { text: project.client || 'Bez zamawiającego' })];
    if (project.deadline) {
      description.push(D.el('span', { class: 'detail__dot', text: '·', attrs: { 'aria-hidden': 'true' } }));
      description.push(D.el('span', { class: 't-muted detail__label', text: 'Termin umowy' }));
      description.push(UI.due(project.deadline, info, { done: project.status === 'done', label: 'Termin umowy' }));
    }

    return UI.pageHeader({
      title: project.name,
      titleId: 'project-title',
      class: 'detail__header',
      eyebrow: [
        D.el('span', { class: 'pcode' }, [UI.swatch(project.code), D.el('span', { class: 't-mono', text: project.code })]),
        statusBtn
      ],
      description: description,
      actions: [
        UI.button({
          label: 'Edytuj', icon: 'edit', variant: 'secondary', kbd: 'E',
          attrs: { id: 'action-edit-project', 'data-fk': 'project-edit' },
          onClick: function () { ctx.actions.editProject(project.id); }
        }),
        more
      ]
    });
  }

  function stat(label, value, sub, extra) {
    return D.el('div', { class: 'stat' }, [
      D.el('p', { class: 'stat__label', text: label }),
      D.el('p', { class: 'stat__value' }, typeof value === 'string' ? [value] : value),
      sub ? D.el('p', { class: 'stat__sub' }, typeof sub === 'string' ? [sub] : sub) : null,
      extra || null
    ]);
  }

  function summary(project) {
    var stats = Progress.projectProgress(project);
    var tasks = Tasks.projectTaskStats(project);
    var active = Progress.activeStage(project);

    return D.el('section', { class: 'summary', attrs: { 'aria-label': 'Podsumowanie projektu' } }, [
      stat('Postęp rzeczowy', stats.percent + '%', 'ważony godzinami etapów',
        UI.progress(stats.percent, { hideValue: true, size: 'lg', label: 'Postęp projektu', class: 'stat__bar' })),
      stat('Etapy', [D.el('span', { text: String(stats.done) }), D.el('span', { class: 'stat__of', text: ' / ' + stats.total })], 'zakończonych'),
      stat('Budżet godzin', [D.el('span', { text: F.number(stats.hoursDone) }), D.el('span', { class: 'stat__of', text: ' / ' + F.hours(stats.hoursTotal) })], 'w zakończonych etapach'),
      stat('Zadania otwarte', String(tasks.open),
        tasks.overdue
          ? [D.el('span', { class: 't-danger stat__alert' }, [Icons.icon('alertCircle', 14), D.el('span', { text: tasks.overdue + ' po terminie' })])]
          : (tasks.total ? 'z ' + tasks.total + ' w projekcie' : 'brak zadań')),
      stat('Bieżący etap',
        [D.el('span', { class: 'stat__text clamp-2', text: active ? Model.describeStage(active).name : (project.stages.length ? 'Wszystkie zakończone' : '—') })],
        active ? (active.status === 'working' ? 'w toku' : 'następny do rozpoczęcia') : '')
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
          ? 'Zadania rozpisuje się w etapach: rozwiń etap i dodaj zadanie z realizatorami oraz terminem.'
          : 'Najpierw dodaj etapy — zadania należą zawsze do któregoś z nich.',
        actions: [UI.button({
          label: 'Przejdź do etapów', variant: 'secondary', icon: 'layers',
          onClick: function () { ctx.actions.openProject(project.id, 'etapy'); }
        })]
      })])]);
    }

    var groups = withTasks.map(function (stage) {
      var info = Model.describeStage(stage);
      var visible = (stage.tasks || []).filter(function (t) { return filter === 'all' || t.status !== 'done'; });
      if (!visible.length) return null;
      return D.el('section', { class: 'task-group' }, [
        D.el('div', { class: 'task-group__head' }, [
          UI.statusGlyph('stage', stage.status),
          D.el('h3', { class: 'task-group__title truncate', text: info.name }),
          D.el('span', { class: 't-meta', text: String(visible.length) }),
          D.el('span', { class: 'toolbar__spacer' }),
          UI.button({
            label: 'Dodaj zadanie', icon: 'plus', variant: 'ghost', size: 'sm',
            onClick: function () { ctx.actions.addTask(project.id, stage.id); }
          })
        ]),
        E.TaskList.taskList(project, stage, ctx.actions, ctx.people, ctx.motion, { filter: filter, hideHead: true })
      ]);
    }).filter(Boolean);

    return D.el('section', { class: 'section' }, [
      toolbar,
      groups.length
        ? D.el('div', { class: 'list task-groups' }, groups)
        : D.el('div', { class: 'card' }, [UI.emptyState({
            icon: 'checkCircle', compact: true,
            title: 'Wszystkie zadania zamknięte',
            text: 'Nie ma otwartych zadań. Przełącz na „Wszystkie”, żeby zobaczyć zakończone.'
          })])
    ]);
  }

  /* ---------- zakładka Zespół ---------- */

  function personLine(person, detail) {
    return D.el('span', { class: 'person' }, [
      Avatar.avatar(person, { size: 'md', tooltip: false }),
      D.el('span', { class: 'person__text' }, [
        D.el('span', { class: 'person__name', text: Team.fullName(person) }),
        D.el('span', { class: 'person__meta', text: detail || person.position || 'Bez stanowiska' })
      ])
    ]);
  }

  function teamTab(project, ctx) {
    var team = project.team || Team.emptyTeam();
    var members = (team.members || []).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
    var everyone = Team.projectPeople(team);

    var edit = UI.button({
      label: 'Edytuj zespół', icon: 'edit', variant: 'secondary', size: 'sm',
      onClick: function () { ctx.actions.editProject(project.id); }
    });

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

    var functions = Team.FUNCTIONS.map(function (fn) {
      var person = Team.findPerson(ctx.people, team[fn.key]);
      return D.el('li', { class: 'kv' }, [
        D.el('span', { class: 'kv__key', text: fn.label }),
        person ? personLine(person) : D.el('span', { class: 't-muted', text: 'Nie przypisano' })
      ]);
    });

    return D.el('div', { class: 'team-tab' }, [
      D.el('section', { class: 'section' }, [
        D.el('div', { class: 'section__head' }, [
          D.el('h2', { class: 'section__title', text: 'Funkcje w projekcie' }),
          edit
        ]),
        D.el('ul', { class: 'list' }, functions)
      ]),
      D.el('section', { class: 'section' }, [
        D.el('div', { class: 'section__head' }, [
          D.el('div', { class: 'section__titles' }, [
            D.el('h2', { class: 'section__title', text: 'Członkowie zespołu' }),
            D.el('span', { class: 'section__meta', text: F.count(everyone.length, 'osoba', 'osoby', 'osób') + ' w projekcie' })
          ])
        ]),
        members.length
          ? D.el('ul', { class: 'list' }, members.map(function (person) {
              return D.el('li', { class: 'kv' }, [
                personLine(person),
                D.el('span', { class: 't-meta', text: Team.COOPERATION[person.cooperation] || '' })
              ]);
            }))
          : D.el('p', { class: 't-secondary', text: 'Poza osobami pełniącymi funkcje nikt nie jest dopisany.' })
      ])
    ]);
  }

  /* ---------- całość ---------- */

  function notFound(ctx) {
    return D.el('div', { class: 'card' }, [UI.emptyState({
      icon: 'folder',
      title: 'Nie znaleziono projektu',
      text: 'Projekt mógł zostać usunięty albo adres jest nieaktualny.',
      actions: [UI.button({ label: 'Wróć do listy projektów', variant: 'secondary', icon: 'arrowLeft', onClick: function () { ctx.actions.goTo('projects'); } })]
    })]);
  }

  /**
   * @param {Object|null} project
   * @param {{state, people, actions, motion}} ctx
   */
  function projectDetail(project, ctx) {
    if (!project) return [notFound(ctx)];
    var tab = ctx.state.route.tab || 'etapy';
    var stats = Progress.projectProgress(project);
    var tasks = Tasks.projectTaskStats(project);
    var counts = { etapy: stats.total, zadania: tasks.open, zespol: Team.projectPeople(project.team).length };

    var body;
    if (tab === 'zadania') body = tasksTab(project, ctx);
    else if (tab === 'zespol') body = teamTab(project, ctx);
    else body = E.StageList.stageList(project, ctx);

    return [
      header(project, ctx),
      summary(project),
      UI.tabs({
        label: 'Sekcje projektu',
        value: tab,
        class: 'detail__tabs',
        items: TABS.map(function (t) {
          return { value: t.value, label: t.label, count: counts[t.value], href: E.ProjectList.projectHref(project, t.value === 'etapy' ? '' : t.value) };
        })
      }),
      D.el('div', { class: 'detail__body', attrs: { 'data-tab': tab } }, [body])
    ];
  }

  root.ETROM.ProjectDetail = { projectDetail: projectDetail, TABS: TABS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
