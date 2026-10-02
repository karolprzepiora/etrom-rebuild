/* ETROM — inspektor: drugi arkusz z podglądem obiektu (zadanie, osoba, projekt)
   bez opuszczania miejsca pracy. Nie zasłania strony tłem i nie blokuje jej;
   Escape zamyka, fokus wraca tam, skąd przyszedł. */
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

  var KIND = { task: 'Zadanie', person: 'Osoba', project: 'Podgląd projektu' };

  function prop(label, value) {
    return D.el('div', { class: 'prop' }, [
      D.el('dt', { class: 'prop__label', text: label }),
      D.el('dd', { class: 'prop__value' }, Array.isArray(value) ? value : [value])
    ]);
  }

  function block(title, children) {
    return D.el('section', { class: 'insp-block' }, [D.el('h3', { class: 'insp-block__title', text: title })].concat(children));
  }

  /* ---------- Zadanie ---------- */

  function taskView(ref, ctx) {
    var project = ctx.findProject(ref.projectId);
    var stage = project && project.stages.filter(function (s) { return s.id === ref.stageId; })[0];
    var task = stage && (stage.tasks || []).filter(function (t) { return t.id === ref.taskId; })[0];
    if (!task) return null;
    var info = Tasks.deadlineInfo(task);
    var actions = ctx.actions;

    var status = UI.statusButton('task', task.status, { subject: task.name, menu: true, class: 'insp-status', attrs: { 'data-fk': 'insp-status' } });
    Menu.bind(status, function () {
      var next = Tasks.nextStatuses(task.status);
      return {
        label: 'Zmień status zadania',
        items: [{ type: 'label', label: 'Przenieś do' }].concat(next.map(function (key) {
          return { label: Tasks.TASK_STATUS[key], value: key, leading: UI.statusGlyph('task', key), hint: key === 'changes' ? 'wymaga powodu' : '', onSelect: function () { actions.moveTask(project.id, stage.id, task.id, key); } };
        }))
      };
    });

    var people = (task.assignees || []).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
    var history = (task.history || []).slice().reverse();

    return {
      title: task.name,
      body: [
        D.el('div', { class: 'insp-title' }, [
          status,
          D.el('h2', { class: 'insp-title__text', text: task.name, attrs: { id: 'inspector-title', tabindex: '-1' } }),
          D.el('a', { class: 'insp-title__context', attrs: { href: E.ProjectList.projectHref(project) } }, [
            D.el('span', { class: 'code', text: project.code }),
            D.el('span', { class: 'truncate', text: Model.describeStage(stage).name })
          ])
        ]),
        task.status === 'changes' && task.feedback
          ? D.el('div', { class: 'alert alert--warning' }, [Icons.icon('alert'), D.el('div', { class: 'alert__body' }, [D.el('strong', { text: 'Do poprawy. ' }), D.el('span', { text: task.feedback })])])
          : null,
        D.el('dl', { class: 'props' }, [
          prop('Termin', task.deadline ? UI.due(task.deadline, info, { done: task.status === 'done' }) : D.el('span', { class: 't-muted', text: 'Bez terminu' })),
          prop('Nakład pracy', D.el('span', { text: Tasks.WORKLOAD[task.workload] })),
          task.important ? prop('Priorytet', UI.badge('Ważne', 'warning', { icon: 'flag' })) : null
        ]),
        block('Realizatorzy', [people.length
          ? D.el('ul', { class: 'parts' }, people.map(function (person) {
              var state = Tasks.partStatus(task, person.id);
              return D.el('li', null, [D.el('button', {
                class: 'parts__item',
                attrs: { type: 'button', 'aria-label': Team.fullName(person) + ': ' + Tasks.PART_STATUS[state] + '. Kliknij, aby przestawić.', 'data-fk': 'insp-part-' + person.id },
                on: { click: function () { actions.cyclePart(project.id, stage.id, task.id, person.id); } }
              }, [
                Avatar.avatar(person, { size: 'sm', tooltip: false }),
                D.el('span', { class: 'truncate', text: Team.fullName(person) }),
                UI.status('stage', state, { label: Tasks.PART_STATUS[state] })
              ])]);
            }))
          : D.el('p', { class: 't-meta', text: 'Bez realizatora. Wskaż osoby w edycji zadania.' })]),
        task.description ? block('Opis', [D.el('p', { class: 'insp-text', text: task.description })]) : null,
        block('Historia', [history.length
          ? D.el('ol', { class: 'history' }, history.map(function (entry) {
              var at = new Date(entry.at);
              var stamp = at.getFullYear() + '-' + String(at.getMonth() + 1).padStart(2, '0') + '-' + String(at.getDate()).padStart(2, '0') + 'T' + String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0');
              return D.el('li', { class: 'history__item' }, [
                UI.statusGlyph('task', entry.to),
                D.el('span', { class: 'history__text' }, [D.el('span', { text: Tasks.TASK_STATUS[entry.to] }), entry.reason ? D.el('span', { class: 't-meta', text: entry.reason }) : null]),
                D.el('span', { class: 't-meta t-num', text: F.dateTime(stamp) })
              ]);
            }))
          : D.el('p', { class: 't-meta', text: 'Status nie był jeszcze zmieniany.' })])
      ],
      foot: [
        UI.button({ label: 'Edytuj', icon: 'edit', variant: 'secondary', size: 'sm', onClick: function () { actions.editTask(project.id, stage.id, task.id); } }),
        UI.button({ label: 'Usuń', icon: 'trash', variant: 'ghost', size: 'sm', onClick: function () { actions.closeInspector(); actions.deleteTask(project.id, stage.id, task.id); } })
      ]
    };
  }

  /* ---------- Osoba ---------- */

  function personView(ref, ctx) {
    var person = Team.findPerson(ctx.people, ref.personId);
    if (!person) return null;
    var load = Insight.workload(person.id, ctx.projects);
    var now = new Date();
    var inactive = person.active === false;

    return {
      title: Team.fullName(person),
      body: [
        D.el('div', { class: 'insp-person' }, [
          Avatar.avatar(person, { size: 'lg', tooltip: false }),
          D.el('div', { class: 'insp-person__text' }, [
            D.el('h2', { class: 'insp-title__text', text: Team.fullName(person), attrs: { id: 'inspector-title', tabindex: '-1' } }),
            D.el('p', { class: 't-secondary', text: [person.position || 'Bez stanowiska', Team.COOPERATION[person.cooperation]].filter(Boolean).join(', ') }),
            D.el('div', { class: 'insp-person__badges' }, [
              UI.badge(Team.ORG_ROLES[person.orgRole]),
              inactive ? UI.badge('Wyłączona z obiegu', 'warning') : null
            ])
          ])
        ]),
        D.el('div', { class: 'load-summary' }, [
          D.el('div', { class: 'load-summary__item' }, [D.el('span', { class: 'load-summary__value t-num', text: String(load.open) }), D.el('span', { class: 't-meta', text: F.plural(load.open, 'otwarte zadanie', 'otwarte zadania', 'otwartych zadań') })]),
          D.el('div', { class: 'load-summary__item' + (load.overdue ? ' t-alarm' : '') }, [D.el('span', { class: 'load-summary__value t-num', text: String(load.overdue) }), D.el('span', { class: 't-meta', text: 'po terminie' })]),
          D.el('div', { class: 'load-summary__item' }, [D.el('span', { class: 'load-summary__value t-num', text: String(load.projects) }), D.el('span', { class: 't-meta', text: F.plural(load.projects, 'czynny projekt', 'czynne projekty', 'czynnych projektów') })])
        ]),
        block('Funkcje w projektach', [load.functions.length
          ? D.el('ul', { class: 'insp-list' }, load.functions.map(function (entry) {
              var h = Insight.health(entry.project, now);
              return D.el('li', null, [D.el('a', { class: 'insp-list__item', attrs: { href: E.ProjectList.projectHref(entry.project) } }, [
                Sig.datum(h.level),
                D.el('span', { class: 'insp-list__main' }, [D.el('span', { class: 'truncate', text: entry.project.name }), D.el('span', { class: 'code', text: entry.project.code })]),
                D.el('span', { class: 't-meta', text: entry.fn.label })
              ])]);
            }))
          : D.el('p', { class: 't-meta', text: 'Nie pełni funkcji w żadnym projekcie.' })]),
        block('Otwarte zadania', [load.tasks.length
          ? D.el('ul', { class: 'insp-list' }, load.tasks.slice(0, 8).map(function (entry) {
              return D.el('li', null, [D.el('button', {
                class: 'insp-list__item',
                attrs: { type: 'button' },
                on: { click: function () { ctx.actions.inspect({ kind: 'task', projectId: entry.project.id, stageId: entry.stage.id, taskId: entry.task.id }); } }
              }, [
                UI.statusGlyph('task', entry.task.status),
                D.el('span', { class: 'insp-list__main' }, [D.el('span', { class: 'truncate', text: entry.task.name }), D.el('span', { class: 'code', text: entry.project.code })]),
                entry.task.deadline ? D.el('span', { class: 't-meta t-num' + (entry.overdue ? ' t-alarm' : ''), text: F.date(entry.task.deadline.slice(0, 10)) }) : null
              ])]);
            }))
          : D.el('p', { class: 't-meta', text: 'Brak otwartych zadań.' })])
      ],
      foot: [
        UI.button({ label: 'Edytuj', icon: 'edit', variant: 'secondary', size: 'sm', onClick: function () { ctx.actions.editPerson(person.id); } }),
        UI.button({ label: inactive ? 'Przywróć do obiegu' : 'Wyłącz z obiegu', icon: 'power', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.togglePerson(person.id); } })
      ]
    };
  }

  /* ---------- Projekt ---------- */

  function projectView(ref, ctx) {
    var project = ctx.findProject(ref.projectId);
    if (!project) return null;
    var now = new Date();
    var health = Insight.health(project, now);
    var next = Insight.nextEvent(project, now);
    var stage = Progress.activeStage(project);
    var people = Team.projectPeople(project.team).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);

    return {
      title: project.name,
      body: [
        D.el('div', { class: 'insp-title' }, [
          D.el('div', { class: 'insp-title__row' }, [Sig.datum(health.level), D.el('span', { class: 'code', text: project.code }), UI.status('project', project.status)]),
          D.el('h2', { class: 'insp-title__text insp-title__text--big', text: project.name, attrs: { id: 'inspector-title', tabindex: '-1' } }),
          D.el('p', { class: 't-secondary', text: project.client })
        ]),
        Sig.profile(project, { size: 'card', now: now }),
        D.el('div', { class: 'health health--' + health.level + ' health--compact' }, [
          D.el('div', { class: 'health__head' }, [Sig.datum(health.level, { label: false }), D.el('span', { class: 'health__label', text: health.label })]),
          health.reasons.length && health.level !== 'closed'
            ? D.el('ul', { class: 'health__more' }, health.reasons.map(function (r) { return D.el('li', { class: 'reason--' + r.level, text: r.text }); }))
            : null
        ]),
        D.el('dl', { class: 'props' }, [
          prop('Bieżący etap', D.el('span', { text: stage ? Model.describeStage(stage).name : 'Brak' })),
          prop('Termin umowy', project.deadline ? UI.due(project.deadline, Progress.deadlineInfo(project.deadline, now), { done: project.status === 'done' }) : D.el('span', { class: 't-muted', text: 'Bez terminu' })),
          next ? prop('Najbliżej', D.el('span', { text: (next.days === 0 ? 'dziś' : 'za ' + next.days + ' d') + ', ' + next.label })) : null,
          prop('Zespół', people.length ? Avatar.avatarStack(people, { max: 6, size: 'sm' }) : D.el('span', { class: 't-muted', text: 'Nie przypisano' }))
        ])
      ],
      foot: [
        UI.button({ label: 'Otwórz projekt', icon: 'arrowUpRight', variant: 'primary', size: 'sm', onClick: function () { ctx.actions.openProject(project.id); } }),
        UI.button({ label: 'Edytuj', icon: 'edit', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.editProject(project.id); } })
      ]
    };
  }

  var VIEWS = { task: taskView, person: personView, project: projectView };
  var lastKey = null;

  /**
   * Rysuje inspektor albo go chowa.
   * @param {Element} host
   * @param {Object|null} ref {kind, ...identyfikatory}
   * @param {Object} ctx {people, projects, findProject, actions}
   */
  function render(host, ref, ctx) {
    var view = ref && VIEWS[ref.kind] ? VIEWS[ref.kind](ref, ctx) : null;
    if (!view) {
      host.hidden = true;
      D.clear(host);
      lastKey = null;
      return false;
    }
    var key = JSON.stringify(ref);
    var fresh = host.hidden || key !== lastKey;
    host.hidden = false;
    D.patch(host, [
      D.el('div', { class: 'inspector__head' }, [
        D.el('span', { class: 'inspector__kind', text: KIND[ref.kind] }),
        UI.iconButton({ icon: 'close', label: 'Zamknij podgląd', kbd: 'Esc', size: 'sm', attrs: { 'data-fk': 'insp-close', id: 'inspector-close' }, onClick: ctx.actions.closeInspector })
      ]),
      D.el('div', { class: 'inspector__body' + (fresh ? '' : ' is-still') }, view.body),
      D.el('div', { class: 'inspector__foot' }, view.foot)
    ]);
    host.setAttribute('aria-labelledby', 'inspector-title');
    lastKey = key;
    return fresh;
  }

  root.ETROM.Inspector = { render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
