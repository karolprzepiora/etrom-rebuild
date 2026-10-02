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
    { value: 'korespondencja', label: 'Korespondencja' },
    { value: 'zespol', label: 'Zespół' }
  ];

  var EVENT_KIND = { project: 'Termin umowy', stage: 'Termin zadania', task: 'Termin zadania' };

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

  function fact(label, value, sub, tone, onClick) {
    var nodes = typeof value === 'string' ? [D.el('span', { text: value })] : value;
    return D.el('div', { class: 'fact' + (tone ? ' fact--' + tone : '') + (onClick ? ' fact--link' : '') }, [
      D.el('dt', { class: 'fact__label', text: label }),
      D.el('dd', { class: 'fact__value' }, onClick
        ? [D.el('button', { class: 'fact__hit', attrs: { type: 'button', 'aria-label': label + ': ' + (typeof value === 'string' ? value : nodes.map(function (n) { return n.textContent; }).join('')) + '. Pokaż szczegóły.', 'data-fk': 'fact-' + label }, on: { click: onClick } }, nodes)]
        : nodes),
      sub ? D.el('dd', { class: 'fact__sub', text: sub }) : null
    ]);
  }

  /** Bieżący etap: nazwa jest głównym zdaniem środka cockpitu, bo odpowiada na „gdzie jesteśmy”. */
  function stageNow(project, ctx) {
    var active = Progress.activeStage(project);
    var total = project.stages.length;
    var kicker;
    var name;
    if (active) {
      var info = Model.describeStage(active);
      name = info.name;
      kicker = 'Bieżący etap · ' + (project.stages.indexOf(active) + 1) + ' z ' + total
        + (project.status === 'paused' ? ' · wstrzymany' : (active.status === 'working' ? ' · w toku' : ' · do rozpoczęcia'));
    } else {
      name = total ? 'Wszystkie etapy zakończone' : 'Brak etapów';
      kicker = total ? 'Przebieg' : 'Etapy';
    }
    var body = [
      D.el('span', { class: 'stagenow__kicker', text: kicker }),
      D.el('span', { class: 'stagenow__name', text: name })
    ];
    if (!active) return D.el('div', { class: 'stagenow' }, body);
    return D.el('button', {
      class: 'stagenow stagenow--link',
      attrs: { type: 'button', 'aria-label': 'Przejdź do etapu: ' + name },
      on: { click: function () { ctx.actions.revealStage(project.id, active.id); } }
    }, body);
  }

  function facts(project, now, entries, ctx) {
    var stats = Progress.projectProgress(project);
    var loggedMinutes = E.TimeLog.projectMinutes(entries || [], project.id);
    var tasks = Tasks.projectTaskStats(project, now);
    var v = Insight.variance(project, now, loggedMinutes);
    var done = project.status === 'done';
    var info = Progress.deadlineInfo(project.deadline, now);
    var openPlan = function () { ctx.actions.inspect({ kind: 'plan', projectId: project.id }); };

    // Budżet godzin: wykonane z budżetu; podpis — zapis z zegara względem oczekiwań.
    var hoursSub = v.hours.available
      ? String(v.hours.used).replace('.', ',') + ' h zapisano · ' + (v.hours.variance > 0 ? '+' : (v.hours.variance < 0 ? '−' : '±')) + String(Math.abs(v.hours.variance)).replace('.', ',') + ' h wobec planu'
      : (loggedMinutes ? 'zapisano ' + String(E.TimeLog.hoursOf(loggedMinutes)).replace('.', ',') + ' h' : 'wg budżetu etapów');
    var hoursTone = v.hours.available && stats.hoursTotal && v.hours.variance > 0.1 * stats.hoursTotal ? 'warn' : '';

    // Termin: data umowy; podpis — prognoza, a bez niej odliczanie.
    var deadlineSub;
    var deadlineTone = '';
    if (done) deadlineSub = 'projekt zakończony';
    else if (v.schedule.available) {
      var dd = v.schedule.days;
      deadlineSub = 'Prognoza ' + F.date(v.schedule.forecast) + (dd === 0 ? ' · zgodnie z terminem' : ' · ' + (dd > 0 ? '+' : '−') + Math.abs(dd) + ' ' + (Math.abs(dd) === 1 ? 'dzień' : 'dni'));
      deadlineTone = dd >= 14 ? 'alarm' : (dd > 0 ? 'warn' : '');
    } else if (project.deadline) {
      deadlineSub = Progress.countdown(project.deadline, now).text;
      deadlineTone = info.tone === 'overdue' ? 'alarm' : (info.tone === 'urgent' ? 'warn' : '');
    } else deadlineSub = '';

    return D.el('dl', { class: 'facts' }, [
      fact('Budżet godzin', [D.el('span', { class: 't-num', text: F.number(stats.hoursDone) }), D.el('span', { class: 'fact__of t-num', text: ' / ' + F.hours(stats.hoursTotal) })], hoursSub, hoursTone, openPlan),
      fact('Zadania otwarte', [D.el('span', { class: 't-num', text: String(tasks.open) })],
        tasks.overdue ? 'w tym ' + tasks.overdue + ' po terminie' : (tasks.total ? 'z ' + tasks.total + ' w projekcie' : 'brak zadań'),
        tasks.overdue ? 'alarm' : '', function () { ctx.actions.openProject(project.id, 'zadania'); }),
      fact('Termin umowy', project.deadline ? [D.el('span', { class: 't-num', text: F.date(project.deadline, { year: 'always' }) })] : 'Bez terminu', deadlineSub, deadlineTone, project.deadline ? openPlan : null)
    ]);
  }

  function signatures(project, ctx) {
    var team = project.team || Team.emptyTeam();
    // Jedna osoba w kilku rolach pojawia się raz: „Lider · Koordynator”.
    var order = [];
    var roles = {};
    Team.FUNCTIONS.forEach(function (fn) {
      var person = Team.findPerson(ctx.people, team[fn.key]);
      if (!person) return;
      if (!roles[person.id]) { roles[person.id] = { person: person, labels: [] }; order.push(person.id); }
      roles[person.id].labels.push(fn.label);
    });
    var rows = order.map(function (id) {
      var person = roles[id].person;
      var label = roles[id].labels.join(' · ');
      return D.el('li', null, [D.el('button', {
        class: 'signature',
        attrs: { type: 'button', 'aria-label': label + ': ' + Team.fullName(person) + '. Pokaż szczegóły osoby.', 'data-tooltip': label },
        on: { click: function () { ctx.actions.inspect({ kind: 'person', personId: person.id }); } }
      }, [
        Avatar.avatar(person, { size: 'sm', tooltip: false }),
        D.el('span', { class: 'signature__text' }, [
          D.el('span', { class: 'signature__role', text: label }),
          D.el('span', { class: 'signature__name truncate', text: Team.fullName(person) })
        ])
      ])]);
    });
    var members = (team.members || []).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
    if (!rows.length && !members.length) {
      return D.el('div', { class: 'signatures signatures--empty' }, [
        D.el('p', { class: 't-meta', text: 'Zespół nie jest przypisany.' }),
        UI.button({ label: 'Przypisz zespół', variant: 'tertiary', size: 'sm', onClick: function () { ctx.actions.editProject(project.id); } })
      ]);
    }
    return D.el('div', { class: 'signatures' }, [
      D.el('ul', { class: 'signatures__list' }, rows.concat(members.length ? [D.el('li', { class: 'signatures__members' }, [
        Avatar.avatarStack(members, { max: 5, size: 'sm' }),
        D.el('span', { class: 't-meta', text: '+ ' + F.count(members.length, 'osoba', 'osoby', 'osób') })
      ])] : []))
    ]);
  }

  /** Powód stanu prowadzi tam, gdzie można go usunąć. */
  function reasonTarget(project, reason, ctx) {
    var open = function (tab) { ctx.actions.openProject(project.id, tab); };
    if (reason.rule === 'tasks-late' || reason.rule === 'tasks-returned') { open('zadania'); return; }
    if (reason.rule === 'stages-late') {
      var late = (project.stages || []).filter(function (st) { return st.status !== 'done' && Progress.daysUntil(st.deadline, new Date()) < 0; })[0];
      if (late) { ctx.actions.revealStage(project.id, late.id); return; }
    }
    ctx.actions.inspect({ kind: 'plan', projectId: project.id });
  }

  /** Jedna, najpilniejsza rzecz do zrobienia; przy spokoju — następny termin w projekcie. */
  function nextAction(project, now, ctx) {
    var action = Insight.nextAction(project, now, E.Mail.pending(ctx.state.workspace.mail || [], project.id, now));
    if (!action) {
      var next = project.status === 'done' ? null : Insight.nextEvent(project, now);
      return D.el('div', { class: 'naction naction--calm' }, [
        D.el('span', { class: 'naction__label', text: 'Co teraz zrobić' }),
        D.el('p', { class: 'naction__title', text: project.status === 'done' ? 'Projekt zakończony.' : 'Nic nie wymaga teraz uwagi.' }),
        next ? D.el('p', { class: 'naction__line' }, [
          D.el('span', { class: 'naction__muted', text: 'Następny termin: ' }),
          D.el('span', { text: next.kind === 'project' ? 'termin umowy' : next.label }),
          D.el('span', { class: 'naction__muted t-num', text: ' — ' + F.date(next.date, { year: 'always' }) + ', ' + (next.days === 0 ? 'dziś' : (next.days === 1 ? 'jutro' : 'za ' + next.days + ' dni')) })
        ]) : null
      ]);
    }
    var go = function () {
      if (action.kind === 'mail') ctx.actions.openProject(project.id, 'korespondencja');
      else if (action.kind === 'task') ctx.actions.inspect({ kind: 'task', projectId: project.id, stageId: action.stageId, taskId: action.taskId });
      else ctx.actions.inspect({ kind: 'plan', projectId: project.id });
    };
    return D.el('div', { class: 'naction naction--' + action.tone }, [
      D.el('span', { class: 'naction__label', text: 'Co teraz zrobić' }),
      D.el('p', { class: 'naction__title', text: action.title }),
      D.el('ul', { class: 'naction__lines' }, action.parts.map(function (part, i) {
        return D.el('li', { class: i === 0 ? 'naction__lead' : '', text: part });
      })),
      D.el('button', { class: 'naction__go', attrs: { type: 'button', 'data-fk': 'next-action' }, on: { click: go } }, [
        D.el('span', { text: action.kind === 'task' ? 'Otwórz zadanie' : (action.kind === 'mail' ? 'Otwórz korespondencję' : 'Pokaż szczegóły') }),
        E.Icons.icon('chevronRight', 14)
      ])
    ]);
  }

  function header(project, ctx, now) {
    var health = Insight.health(project, now);
    var from = ctx.motion && ctx.motion.progressFrom;
    var Flow = E.Flow;
    var reveal = function (stageId) { ctx.actions.revealStage(project.id, stageId); };

    return D.el('header', { class: 'workspace-head level-' + health.level }, [
      D.el('div', { class: 'workspace-head__id' }, [
        D.el('span', { class: 'code workspace-head__code', text: project.code }),
        statusControl(project, ctx)
      ]),
      D.el('h1', { class: 'workspace-head__title t-display', text: project.name, attrs: { id: 'project-title' } }),
      D.el('p', { class: 'workspace-head__client', text: project.client || 'Bez zamawiającego' }),
      D.el('div', { class: 'workspace-head__grid' }, [
        D.el('section', { class: 'course', attrs: { 'aria-label': 'Przebieg projektu' } }, [
          D.el('div', { class: 'course__gauge' }, [
            Flow.gauge(project, { now: now, from: typeof from === 'number' ? from : undefined, onStage: reveal, onDetail: function () { ctx.actions.inspect({ kind: 'plan', projectId: project.id }); } })
          ]),
          D.el('div', { class: 'course__body' }, [
            stageNow(project, ctx),
            Flow.flowTrack(project, { now: now, onSegment: reveal }),
            Flow.timeline(project, now),
            facts(project, now, ctx.state && ctx.state.workspace.entries, ctx),
            signatures(project, ctx)
          ])
        ]),
        D.el('aside', { class: 'workspace-head__side' }, [
          Flow.level(project, { now: now, onReason: function (reason) { reasonTarget(project, reason, ctx); } }),
          nextAction(project, now, ctx)
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
    var counts = { etapy: stats.total, zadania: tasks.open, korespondencja: E.Mail.pending(ctx.state.workspace.mail || [], project.id, now).length, zespol: Team.projectPeople(project.team).length };

    var body;
    if (tab === 'zadania') body = tasksTab(project, ctx);
    else if (tab === 'korespondencja') body = E.MailTab.mailTab(project, ctx);
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
