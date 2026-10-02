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
    { value: 'etapy', label: 'Plan' },
    { value: 'zadania', label: 'Zadania' },
    { value: 'korespondencja', label: 'Korespondencja' },
    { value: 'zespol', label: 'Zespół' },
    { value: 'czas', label: 'Czas' },
    { value: 'aktywnosc', label: 'Aktywność' }
  ];

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

  var PL = E.ProjectList;

  /* ---------- nagłówek: tożsamość + jeden rząd właściwości ---------- */

  function prop(label, body, options) {
    var o = options || {};
    return D.el('div', { class: 'pd-prop' + (o.tone ? ' pd-prop--' + o.tone : '') }, [
      D.el('dt', { class: 'pd-prop__label', text: label }),
      D.el('dd', { class: 'pd-prop__value' }, body)
    ]);
  }

  /** Termin umowy: klik otwiera natywny wybór daty; zmiana zapisuje się od razu. */
  function deadlineProp(project, ctx, now) {
    var done = project.status === 'done';
    var days = project.deadline ? Progress.daysUntil(project.deadline, now) : null;
    var overdue = !done && days !== null && days < 0;
    var input = D.el('input', { class: 'pd-date', attrs: { type: 'date', tabindex: '-1', 'aria-hidden': 'true', value: project.deadline || '' } });
    input.addEventListener('change', function () { if (input.value) ctx.actions.setProjectDeadline(project.id, input.value); });
    var btn = D.el('button', {
      class: 'pd-edit' + (overdue ? ' is-overdue' : ''),
      attrs: { type: 'button', 'data-fk': 'project-deadline', 'aria-label': 'Termin umowy: ' + (project.deadline ? F.dateLong(project.deadline) : 'brak') + '. Zmień datę' },
      on: { click: function () { if (input.showPicker) { try { input.showPicker(); return; } catch (e) { /* wpadamy do formularza */ } } ctx.actions.editProject(project.id); } }
    }, [
      D.el('span', { class: 't-num', text: project.deadline ? F.date(project.deadline, { year: 'always' }) : 'Ustaw termin' }),
      !done && days !== null ? D.el('span', { class: 'pd-prop__sub', text: PL.relDays(days).replace('po terminie', 'po terminie') }) : null
    ]);
    return [btn, input];
  }

  function propertyRow(project, ctx, now, health) {
    var gauge = Insight.gauge(project, now);
    var level = PL.lagLevel(gauge);
    var done = project.status === 'done';
    var stats = Progress.projectProgress(project);
    var logged = E.TimeLog.projectMinutes((ctx.state && ctx.state.workspace.entries) || [], project.id);
    var attention = health.level === 'alarm' || health.level === 'warning';
    var stateLabel = health.level === 'closed' ? 'Zakończony' : (attention ? 'Wymaga uwagi' : 'W normie');

    return D.el('dl', { class: 'pd-props' }, [
      prop('Stan', [D.el('span', { class: 'pd-state', attrs: { 'data-tooltip': health.reasons.map(function (r) { return r.text; }).join('; ') || null } }, [Sig.datum(attention ? health.level : health.level, { label: false }), D.el('span', { text: stateLabel })])]),
      prop('Postęp', [D.el('button', {
        class: 'pd-edit pd-progress', attrs: { type: 'button', 'data-tooltip': done ? null : PL.lagTip(gauge), 'aria-label': 'Postęp ' + gauge.percent + '%. Pokaż plan.' },
        on: { click: function () { ctx.actions.inspect({ kind: 'plan', projectId: project.id }); } }
      }, [
        PL.planMeter(gauge, done ? '' : level),
        D.el('span', { class: 'pd-progress__num t-num' }, [
          D.el('b', { text: gauge.percent + '%' }),
          !done && gauge.expected !== null ? D.el('span', { class: 'pd-prop__sub' + (level ? ' is-' + level : ''), text: level ? 'zaległość ' + Math.round(gauge.lag) + ' p.p.' : 'plan ' + Math.round(gauge.expected) + '%' }) : null
        ])
      ])], { tone: level }),
      prop('Termin umowy', deadlineProp(project, ctx, now)),
      prop('Godziny', [D.el('span', { class: 'pd-hours t-num' }, [
        D.el('b', { text: F.number(stats.hoursDone) }), D.el('span', { class: 't-muted', text: ' / ' + F.number(stats.hoursTotal) + ' h' }),
        logged ? D.el('span', { class: 'pd-prop__sub', text: 'zapisano ' + String(E.TimeLog.hoursOf(logged)).replace('.', ',') + ' h' }) : null
      ])]),
      prop('Lider', [PL.leaderCell(project, ctx)])
    ]);
  }

  /* ---------- „Wymaga uwagi”: lista z działaniami ---------- */

  function attentionBlock(project, ctx, now) {
    var waiting = E.Mail.pending((ctx.state && ctx.state.workspace.mail) || [], project.id, now);
    var items = Insight.attentionItems(project, now, waiting);
    if (!items.length) return null;
    var act = ctx.actions;
    var run = {
      deadline: function () { var el = document.querySelector('[data-fk="project-deadline"]'); if (el) el.click(); else act.editProject(project.id); },
      close: function () { act.setProjectStatus([project.id], 'done'); },
      resume: function () { act.setProjectStatus([project.id], 'active'); },
      plan: function () { act.inspect({ kind: 'plan', projectId: project.id }); },
      tasks: function () { act.openProject(project.id, 'zadania'); },
      mail: function () { act.openProject(project.id, 'korespondencja'); }
    };
    return D.el('section', { class: 'pd-attention', attrs: { 'aria-label': 'Wymaga uwagi' } }, [
      D.el('h2', { class: 'pd-attention__title' }, [D.el('span', { text: 'Wymaga uwagi' }), D.el('span', { class: 'pd-attention__n t-num', text: String(items.length) })]),
      D.el('ul', { class: 'pd-attention__list' }, items.map(function (item) {
        return D.el('li', { class: 'pd-attention__item pd-attention__item--' + item.level }, [
          D.el('span', { class: 'pd-attention__mark', attrs: { 'aria-hidden': 'true' } }),
          D.el('span', { class: 'pd-attention__text', text: item.text }),
          D.el('span', { class: 'pd-attention__actions' }, item.actions.map(function (a, index) {
            return UI.button({
              label: a.label, variant: index === 0 ? 'secondary' : 'ghost', size: 'sm',
              attrs: { 'data-fk': 'attn-' + item.rule + '-' + a.id },
              onClick: function () {
                if (a.id === 'addTasks') act.addTask(project.id, item.stageId);
                else run[a.id]();
              }
            });
          }))
        ]);
      }))
    ]);
  }

  function header(project, ctx, now) {
    var health = Insight.health(project, now);
    return D.el('header', { class: 'pd-head' }, [
      D.el('div', { class: 'pd-head__id' }, [
        D.el('span', { class: 'code', text: project.code }),
        statusControl(project, ctx)
      ]),
      D.el('h1', { class: 'pd-head__title', text: project.name, attrs: { id: 'project-title' } }),
      D.el('p', { class: 'pd-head__client', text: project.client || 'Bez zamawiającego' }),
      propertyRow(project, ctx, now, health)
    ]);
  }

  /* ---------- panel szczegółów (po prawej, zwijany) ---------- */

  function detailsPanel(project, ctx, now) {
    var team = project.team || Team.emptyTeam();
    var entries = (ctx.state.workspace.entries) || [];
    var budget = Insight.budgetByKind(project);
    var recent = Insight.activity(project, ctx.state.workspace.mail || [], 4);
    var roles = Team.FUNCTIONS.map(function (fn) {
      var person = Team.findPerson(ctx.people, team[fn.key]);
      return person ? D.el('li', { class: 'pd-kv' }, [
        D.el('span', { class: 'pd-kv__k', text: fn.label }),
        D.el('button', { class: 'pd-kv__v pd-link', attrs: { type: 'button' }, text: Team.fullName(person), on: { click: function () { ctx.actions.inspect({ kind: 'person', personId: person.id }); } } })
      ]) : null;
    }).filter(Boolean);
    var members = (team.members || []).length;

    function section(title, children) {
      return D.el('section', { class: 'pd-side__sec' }, [D.el('h3', { class: 'pd-side__h', text: title })].concat(children));
    }
    return D.el('aside', { class: 'pd-side', attrs: { 'aria-label': 'Szczegóły projektu' } }, [
      section('Szczegóły', [D.el('ul', { class: 'pd-side__list' }, [
        D.el('li', { class: 'pd-kv' }, [D.el('span', { class: 'pd-kv__k', text: 'Kod' }), D.el('span', { class: 'pd-kv__v code', text: project.code })]),
        D.el('li', { class: 'pd-kv' }, [D.el('span', { class: 'pd-kv__k', text: 'Zamawiający' }), D.el('span', { class: 'pd-kv__v', text: project.client || '—' })]),
        D.el('li', { class: 'pd-kv' }, [D.el('span', { class: 'pd-kv__k', text: 'Utworzono' }), D.el('span', { class: 'pd-kv__v t-num', text: project.createdAt ? F.date(project.createdAt.slice(0, 10), { year: 'always' }) : '—' })]),
        D.el('li', { class: 'pd-kv' }, [D.el('span', { class: 'pd-kv__k', text: 'Etapy' }), D.el('span', { class: 'pd-kv__v t-num', text: String(project.stages.length) })])
      ])]),
      section('Zespół', roles.length || members
        ? [D.el('ul', { class: 'pd-side__list' }, roles.concat(members ? [D.el('li', { class: 'pd-kv' }, [D.el('span', { class: 'pd-kv__k', text: 'Członkowie' }), D.el('span', { class: 'pd-kv__v t-num', text: String(members) })])] : []))]
        : [D.el('p', { class: 'pd-side__empty', text: 'Zespół nie jest przypisany.' })]),
      section('Godziny według rodzaju', [D.el('ul', { class: 'pd-side__list' }, budget.map(function (b) {
        return D.el('li', { class: 'pd-kv' }, [D.el('span', { class: 'pd-kv__k', text: b.label }), D.el('span', { class: 'pd-kv__v t-num', text: F.hours(b.hours) + ' · ' + Math.round(b.share * 100) + '%' })]);
      }))]),
      section('Ostatnia aktywność', recent.length
        ? [D.el('ul', { class: 'pd-side__list pd-side__list--act' }, recent.map(function (a) {
            return D.el('li', { class: 'pd-act' }, [D.el('span', { class: 'pd-act__text', text: a.text }), D.el('span', { class: 'pd-act__at t-num', text: F.dateTime(String(a.at).slice(0, 16)) })]);
          }))]
        : [D.el('p', { class: 'pd-side__empty', text: 'Jeszcze nic się nie wydarzyło.' })])
    ]);
  }

  /* ---------- zakładka Zadania ---------- */

  function tasksTab(project, ctx) {
    var filter = ctx.state.taskFilter || 'open';
    var stats = Tasks.projectTaskStats(project);
    var withTasks = project.stages.filter(function (stage) { return (stage.tasks || []).length; });

    var view = ctx.state.prefs.taskView === 'kanban' ? 'kanban' : 'list';
    var viewToggle = UI.segmented({
      label: 'Widok zadań', value: view,
      items: [{ value: 'list', label: 'Lista', icon: 'list' }, { value: 'kanban', label: 'Kanban', icon: 'columns' }],
      onChange: function (value) { ctx.actions.setPref({ taskView: value }); }
    });
    var toolbar = D.el('div', { class: 'section__head' }, [
      D.el('div', { class: 'section__titles' }, [
        D.el('h2', { class: 'section__title', text: 'Zadania' }),
        D.el('span', { class: 'section__meta', text: stats.total ? 'otwarte ' + stats.open + ' z ' + stats.total : 'brak zadań' })
      ]),
      D.el('div', { class: 'section__actions' }, [
        stats.total && view === 'list' ? UI.segmented({
          label: 'Które zadania pokazać',
          value: filter,
          items: [{ value: 'open', label: 'Otwarte' }, { value: 'all', label: 'Wszystkie' }],
          onChange: ctx.actions.setTaskFilter
        }).node : null,
        stats.total ? viewToggle.node : null
      ])
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

    if (view === 'kanban') {
      return D.el('section', { class: 'section' }, [toolbar, E.Kanban.toolbar(project, ctx), E.Kanban.board(project, ctx)]);
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

  /* ---------- zakładki Czas i Aktywność ---------- */

  function timeTab(project, ctx) {
    var entries = (ctx.state.workspace.entries || []).filter(function (e) { return e.projectId === project.id; });
    var byStage = E.TimeLog.byStage(entries, project.id);
    var total = E.TimeLog.projectMinutes(entries, project.id);
    var rows = project.stages.map(function (stage, index) {
      var minutes = byStage[stage.id] || 0;
      return { stage: stage, index: index, minutes: minutes, budget: Number(stage.hours) || 0 };
    }).filter(function (r) { return r.minutes || r.budget; });

    if (!total && !rows.length) {
      return D.el('section', { class: 'section' }, [D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'clock', title: 'Brak zapisanego czasu', text: 'Czas zapisuje się zegarem przy zadaniu (▶) albo ręcznie. Tu zobaczysz go w podziale na etapy.'
      })])]);
    }
    return D.el('section', { class: 'section' }, [
      D.el('div', { class: 'section__head' }, [D.el('div', { class: 'section__titles' }, [
        D.el('h2', { class: 'section__title', text: 'Czas pracy' }),
        D.el('span', { class: 'section__meta t-num', text: total ? 'zapisano ' + E.TimeLog.duration(total) : 'nic jeszcze nie zapisano' })
      ])]),
      D.el('table', { class: 'table pd-time', attrs: { 'aria-label': 'Czas pracy według etapów' } }, [
        D.el('thead', null, [D.el('tr', null, [D.el('th', { text: 'Etap' }), D.el('th', { class: 'cell--num', text: 'Zapisano' }), D.el('th', { class: 'cell--num', text: 'Budżet etapu' })])]),
        D.el('tbody', null, rows.map(function (r) {
          var over = r.budget && E.TimeLog.hoursOf(r.minutes) > r.budget;
          return D.el('tr', null, [
            D.el('td', null, [D.el('span', { class: 't-num t-muted', text: (r.index + 1) + '  ' }), D.el('span', { text: Model.describeStage(r.stage).name })]),
            D.el('td', { class: 'cell--num t-num' + (over ? ' t-alarm' : '') }, [D.el('span', { text: r.minutes ? E.TimeLog.duration(r.minutes) : '—' })]),
            D.el('td', { class: 'cell--num t-num t-muted', text: r.budget ? F.hours(r.budget) : '—' })
          ]);
        }))
      ])
    ]);
  }

  function activityTab(project, ctx) {
    var list = Insight.activity(project, ctx.state.workspace.mail || [], 60);
    if (!list.length) {
      return D.el('section', { class: 'section' }, [D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'history', title: 'Jeszcze nic się nie wydarzyło', text: 'Zmiany statusów zadań i pisma w dzienniku pojawią się tu w kolejności od najnowszych.'
      })])]);
    }
    return D.el('section', { class: 'section' }, [
      D.el('div', { class: 'section__head' }, [D.el('div', { class: 'section__titles' }, [D.el('h2', { class: 'section__title', text: 'Aktywność' }), D.el('span', { class: 'section__meta t-num', text: String(list.length) })])]),
      D.el('ol', { class: 'pd-feed' }, list.map(function (a) {
        return D.el('li', { class: 'pd-feed__item' }, [
          D.el('span', { class: 'pd-feed__icon', attrs: { 'aria-hidden': 'true' } }, [Icons.icon(a.kind === 'mail' ? 'mail' : 'checklist', 14)]),
          D.el('span', { class: 'pd-feed__text', text: a.text }),
          D.el('span', { class: 'pd-feed__at t-num', text: F.dateTime(String(a.at).slice(0, 16)) })
        ]);
      }))
    ]);
  }

  function projectDetail(project, ctx) {
    if (!project) return [notFound(ctx)];
    var now = new Date();
    var tab = ctx.state.route.tab || 'etapy';
    var stats = Progress.projectProgress(project);
    var tasks = Tasks.projectTaskStats(project);
    var counts = { etapy: stats.total, zadania: tasks.open, korespondencja: E.Mail.pending(ctx.state.workspace.mail || [], project.id, now).length, zespol: Team.projectPeople(project.team).length };

    var body;
    if (tab === 'zadania') body = tasksTab(project, ctx);
    else if (tab === 'korespondencja') body = E.MailTab.mailTab(project, ctx);
    else if (tab === 'zespol') body = teamTab(project, ctx);
    else if (tab === 'czas') body = timeTab(project, ctx);
    else if (tab === 'aktywnosc') body = activityTab(project, ctx);
    else body = E.StageList.stageList(project, ctx);

    var tabs = UI.tabs({
      label: 'Sekcje projektu',
      value: tab,
      class: 'detail__tabs',
      items: TABS.map(function (t) {
        return { value: t.value, label: t.label, count: counts[t.value], href: E.ProjectList.projectHref(project, t.value === 'etapy' ? '' : t.value) };
      })
    });
    // Tablica zadań potrzebuje całej szerokości: panel szczegółów chowa się, dopóki jest na ekranie.
    var board = tab === 'zadania' && ctx.state.prefs.taskView === 'kanban';
    var open = ctx.state.prefs.detailsOpen !== false && !board;
    var toggle = UI.iconButton({
      icon: 'sidebar', label: open ? 'Ukryj szczegóły' : 'Pokaż szczegóły', size: 'sm',
      attrs: { 'aria-pressed': String(open), 'data-fk': 'details-toggle' },
      onClick: function () { ctx.actions.setPref({ detailsOpen: !open }); }
    });

    return [
      header(project, ctx, now),
      attentionBlock(project, ctx, now),
      D.el('div', { class: 'pd-layout' + (open ? '' : ' is-wide') }, [
        D.el('div', { class: 'detail__work' }, [
          D.el('div', { class: 'pd-tabsrow' }, [tabs, board ? null : toggle]),
          D.el('div', { class: 'detail__body', attrs: { 'data-tab': tab } }, [body])
        ]),
        open ? detailsPanel(project, ctx, now) : null
      ])
    ];
  }

  root.ETROM.ProjectDetail = { projectDetail: projectDetail, topbarActions: topbarActions, TABS: TABS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
