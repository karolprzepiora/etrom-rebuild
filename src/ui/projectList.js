/* ETROM — portfel projektów: kokpit stanu, lista grupowana według stanu i karty.
   Lista czyta się od lewej: znak stanu → projekt → profil przebiegu → termin → ludzie. */
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

  var PAGE_SIZE = 50;

  // Kolumny, które można ukryć w opcjach widoku (klucze zgodne z Prefs.COLUMNS).
  var COLUMNS = [
    { key: 'code', label: 'Kod', sort: 'code' },
    { key: 'name', label: 'Projekt', sort: 'name' },
    { key: 'client', label: 'Zamawiający', optional: true },
    { key: 'status', label: 'Status' },
    { key: 'progress', label: 'Przebieg', sort: 'progress', optional: true },
    { key: 'stages', label: 'Bieżący etap', optional: true },
    { key: 'tasks', label: 'Zadania', optional: true, num: true },
    { key: 'deadline', label: 'Termin', sort: 'deadline', optional: true },
    { key: 'team', label: 'Zespół', optional: true }
  ];

  var SORT_DIRECTION = { code: 'ascending', name: 'ascending', deadline: 'ascending', progress: 'descending' };
  var GROUP_ORDER = {
    health: ['alarm', 'warning', 'normal', 'closed'],
    status: ['active', 'planned', 'paused', 'done']
  };

  function projectHref(project, tab) {
    return '#/projekty/' + project.id + (tab ? '/' + tab : '');
  }

  function people(ctx, project) {
    var ids = Team.projectPeople(project.team);
    return ids.map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
  }

  function projectMenuItems(project, actions, options) {
    var settings = options || {};
    var pinned = actions.isPinned && actions.isPinned(project.id);
    var items = [];
    if (!settings.inDetail) {
      items.push({ label: 'Otwórz', icon: 'arrowUpRight', onSelect: function () { actions.openProject(project.id); } });
      items.push({ label: 'Podgląd', icon: 'inspector', hint: 'Spacja', onSelect: function () { actions.inspect({ kind: 'project', projectId: project.id }); } });
    }
    items.push({ label: 'Edytuj dane i zespół', icon: 'edit', onSelect: function () { actions.editProject(project.id); } });
    if (actions.togglePin) items.push({ label: pinned ? 'Odepnij z panelu' : 'Przypnij w panelu', icon: pinned ? 'pinOff' : 'pin', onSelect: function () { actions.togglePin(project.id); } });
    items.push({ type: 'separator' }, { type: 'label', label: 'Status projektu' });
    Object.keys(Model.PROJECT_STATUS).forEach(function (key) {
      items.push({
        type: 'radio', label: Model.PROJECT_STATUS[key], checked: project.status === key, value: key,
        leading: UI.statusGlyph('project', key),
        onSelect: function () { actions.setProjectStatus([project.id], key); }
      });
    });
    items.push({ type: 'separator' });
    items.push({ label: 'Usuń projekt', icon: 'trash', tone: 'danger', onSelect: function () { actions.deleteProjects([project.id]); } });
    return items;
  }

  function moreButton(project, actions, extraClass) {
    var btn = UI.iconButton({
      icon: 'more', label: 'Działania: ' + project.code, size: 'sm',
      class: UI.cx('row-actions', extraClass),
      attrs: { 'data-fk': 'more-' + project.id }
    });
    Menu.bind(btn, function () {
      return { label: 'Działania projektu ' + project.code, align: 'end', items: projectMenuItems(project, actions) };
    });
    return btn;
  }

  function tasksCell(project, now) {
    var stats = Tasks.projectTaskStats(project, now);
    if (!stats.total) return D.el('span', { class: 't-muted', text: '—', attrs: { 'aria-label': 'Brak zadań' } });
    return D.el('span', {
      class: 'tasks-count' + (stats.overdue ? ' tasks-count--alert' : ''),
      attrs: {
        'data-tooltip': F.count(stats.open, 'otwarte zadanie', 'otwarte zadania', 'otwartych zadań') + ' z ' + stats.total + (stats.overdue ? ', po terminie ' + stats.overdue : ''),
        'aria-label': 'Otwarte zadania: ' + stats.open + ' z ' + stats.total + (stats.overdue ? ', po terminie: ' + stats.overdue : '')
      }
    }, [
      D.el('span', { class: 'tasks-count__open', text: String(stats.open) }),
      stats.overdue ? D.el('span', { class: 'tasks-count__late' }, [Icons.icon('alertCircle', 12), D.el('span', { text: String(stats.overdue) })]) : null
    ]);
  }

  function deadlineCell(project, now) {
    if (!project.deadline) return D.el('span', { class: 'due due--none', text: 'Bez terminu' });
    var info = Progress.deadlineInfo(project.deadline, now);
    var done = project.status === 'done';
    var tone = done ? '' : (info.tone === 'overdue' ? 'is-overdue' : (info.tone === 'urgent' ? 'is-urgent' : ''));
    return D.el('div', {
      class: 'stack deadline-cell ' + tone,
      attrs: { 'data-tooltip': 'Termin umowy: ' + F.dateLong(project.deadline) }
    }, [
      D.el('span', { class: 'stack__main t-num', text: F.date(project.deadline, { year: 'always' }) }),
      D.el('span', { class: 'stack__sub' }, [UI.countdown(project.deadline, { done: done, now: now })])
    ]);
  }

  function nameCell(project, hidden, health) {
    var sub = [D.el('span', { class: 'code', text: project.code })];
    if (hidden.indexOf('client') < 0 && project.client) sub.push(D.el('span', { class: 'truncate', text: project.client }));
    if (health.level === 'alarm' || health.level === 'warning') {
      sub = [D.el('span', { class: 'code', text: project.code }), D.el('span', { class: 'truncate reason reason--' + health.level, text: health.reasons[0].text })];
    }
    return D.el('div', { class: 'stack' }, [
      D.el('a', {
        class: 'project-link stack__main truncate',
        text: project.name,
        attrs: { href: projectHref(project), 'data-fk': 'open-' + project.id },
        dataset: { projectTitle: project.id }
      }),
      D.el('span', { class: 'stack__sub stack__sub--row' }, sub)
    ]);
  }

  function progressCell(project, hidden, now) {
    var stage = Progress.activeStage(project);
    var stats = Progress.projectProgress(project);
    return D.el('div', { class: 'stack progress-cell' }, [
      D.el('div', { class: 'progress-cell__line' }, [
        E.Flow.flowTrack(project, { size: 'mini', now: now }),
        D.el('span', { class: 'progress-cell__value t-num', text: stats.percent + '%' })
      ]),
      hidden.indexOf('stages') < 0
        ? D.el('span', { class: 'stack__sub truncate', text: stage ? (project.stages.indexOf(stage) + 1) + '/' + project.stages.length + ' ' + Model.describeStage(stage).name : (project.stages.length ? 'Wszystkie etapy zakończone' : 'Brak etapów') })
        : null
    ]);
  }

  function header(column, ctx) {
    var sort = ctx.state.filters.sort;
    var className = UI.cx(column.num ? 'cell--num' : '', 'col-' + column.key);
    if (!column.sort) return D.el('th', { class: className, attrs: { scope: 'col' }, text: column.label });
    var active = sort === column.sort;
    return D.el('th', { class: className, attrs: { scope: 'col', 'aria-sort': active ? SORT_DIRECTION[column.sort] : null } }, [
      D.el('button', {
        class: 'table__sort',
        attrs: { type: 'button', 'aria-sort': active ? SORT_DIRECTION[column.sort] : null, 'aria-label': 'Sortuj: ' + column.label + (active ? ' (aktywne)' : '') },
        dataset: { sort: column.sort },
        on: { click: function () { ctx.actions.setSort(column.sort); } }
      }, [D.el('span', { text: column.label }), Icons.icon(SORT_DIRECTION[column.sort] === 'descending' ? 'arrowDown' : 'arrowUp', 12)])
    ]);
  }

  /** Kolumny tabeli po uwzględnieniu ukrytych. Kod i zamawiający są w drugiej linii nazwy. */
  function visibleColumns(hidden) {
    return [
      { key: 'name', label: 'Projekt', sort: 'name' },
      hidden.indexOf('progress') < 0 ? { key: 'progress', label: 'Przebieg', sort: 'progress' } : null,
      { key: 'status', label: 'Status' },
      hidden.indexOf('deadline') < 0 ? { key: 'deadline', label: 'Termin', sort: 'deadline' } : null,
      hidden.indexOf('tasks') < 0 ? { key: 'tasks', label: 'Zadania', num: true } : null,
      hidden.indexOf('team') < 0 ? { key: 'team', label: 'Zespół' } : null
    ].filter(Boolean);
  }

  function row(project, columns, ctx, now) {
    var hidden = ctx.state.prefs.hiddenColumns || [];
    var selected = !!(ctx.state.selection || {})[project.id];
    var health = Insight.health(project, now);
    var box = UI.checkbox({
      id: 'select-' + project.id,
      checked: selected,
      attrs: { 'aria-label': 'Zaznacz projekt ' + project.code, 'data-fk': 'select-' + project.id },
      on: { change: function (event) { ctx.actions.selectProjects([project.id], event.target.checked); } }
    });

    var cells = { name: nameCell(project, hidden, health), progress: progressCell(project, hidden, now) };
    cells.status = UI.status('project', project.status);
    cells.deadline = deadlineCell(project, now);
    cells.tasks = tasksCell(project, now);
    var team = people(ctx, project);
    cells.team = team.length ? Avatar.avatarStack(team, { max: 3, size: 'sm' }) : D.el('span', { class: 't-muted', text: '—' });

    return D.el('tr', {
      class: 'table__row prow-project level-' + health.level + (ctx.motion && ctx.motion.flashProject === project.id ? ' is-flash' : ''),
      attrs: { 'aria-selected': selected ? 'true' : null },
      dataset: { projectCode: project.code, projectId: project.id },
      on: {
        click: function (event) {
          if (event.target.closest('a, button, input, label, [role="menu"]')) return;
          if (window.getSelection && String(window.getSelection())) return;
          ctx.actions.openProject(project.id);
        }
      }
    }, [
      D.el('td', { class: 'cell--check' }, [
        D.el('span', { class: 'pick' }, [Sig.datum(health.level, { label: health.label + (health.reasons[0] ? ': ' + health.reasons[0].text : '') }), box])
      ])
    ].concat(columns.map(function (column) {
      return D.el('td', { class: UI.cx(column.num ? 'cell--num' : '', 'col-' + column.key) }, [cells[column.key]]);
    })).concat([D.el('td', { class: 'cell--actions' }, [moreButton(project, ctx.actions)])]));
  }

  function groupKey(project, groupBy, now) {
    if (groupBy === 'status') return project.status;
    if (groupBy === 'health') return Insight.health(project, now).level;
    return 'all';
  }

  function groupHeader(key, groupBy, count, colspan) {
    var label = groupBy === 'status' ? Model.PROJECT_STATUS[key] : Insight.LEVELS[key].label;
    var glyph = groupBy === 'status' ? UI.statusGlyph('project', key) : Sig.datum(key, { label: false });
    return D.el('tr', { class: 'group-row' }, [
      D.el('th', { attrs: { colspan: String(colspan), scope: 'rowgroup' } }, [
        D.el('span', { class: 'group-row__inner' }, [glyph, D.el('span', { class: 'group-row__label', text: label }), D.el('span', { class: 'group-row__count', text: String(count) })])
      ])
    ]);
  }

  /**
   * @param {Array} visible przefiltrowane i posortowane projekty
   * @param {{state, people, actions, motion}} ctx
   */
  function table(visible, ctx) {
    var now = new Date();
    var hidden = ctx.state.prefs.hiddenColumns || [];
    var columns = visibleColumns(hidden);
    var selection = ctx.state.selection || {};
    var groupBy = ctx.state.prefs.groupBy || 'health';
    var page = Math.min(ctx.state.page || 0, Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1));
    var rows = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    var selectedVisible = visible.filter(function (p) { return selection[p.id]; }).length;
    var all = UI.checkbox({
      id: 'select-all',
      checked: selectedVisible > 0 && selectedVisible === visible.length,
      attrs: { 'aria-label': 'Zaznacz wszystkie widoczne projekty' },
      on: { change: function (event) { ctx.actions.selectProjects(visible.map(function (p) { return p.id; }), event.target.checked); } }
    });
    all.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;

    var head = D.el('thead', null, [D.el('tr', null, [D.el('th', { class: 'cell--check', attrs: { scope: 'col' } }, [all])]
      .concat(columns.map(function (column) { return header(column, ctx); }))
      .concat([D.el('th', { class: 'cell--actions', attrs: { scope: 'col' } }, [D.el('span', { class: 'sr-only', text: 'Działania' })])]))]);

    var colspan = columns.length + 2;
    var bodies = [];
    if (groupBy === 'none') {
      bodies.push(D.el('tbody', null, rows.map(function (p) { return row(p, columns, ctx, now); })));
    } else {
      var groups = {};
      rows.forEach(function (p) {
        var key = groupKey(p, groupBy, now);
        (groups[key] = groups[key] || []).push(p);
      });
      GROUP_ORDER[groupBy].forEach(function (key) {
        if (!groups[key]) return;
        bodies.push(D.el('tbody', { class: 'group group--' + key }, [groupHeader(key, groupBy, groups[key].length, colspan)]
          .concat(groups[key].map(function (p) { return row(p, columns, ctx, now); }))));
      });
    }

    return D.el('div', { class: 'table-wrap project-table' + (selectedVisible ? ' is-selecting' : '') }, [
      D.el('table', { class: 'table', attrs: { 'aria-label': 'Projekty' } }, [head].concat(bodies)),
      visible.length > PAGE_SIZE ? UI.pagination({ page: page, pageSize: PAGE_SIZE, total: visible.length, onPage: ctx.actions.setPage }) : null
    ]);
  }

  /* ---------- Karty: arkusze z profilem ---------- */

  function card(project, ctx, now) {
    var health = Insight.health(project, now);
    var team = people(ctx, project);
    var active = Progress.activeStage(project);
    var info = Progress.deadlineInfo(project.deadline, now);
    var risk = health.level === 'alarm' || health.level === 'warning';

    return D.el('article', {
      class: 'pcard project level-' + health.level,
      dataset: { projectCode: project.code, projectId: project.id }
    }, [
      D.el('div', { class: 'pcard__top' }, [
        Sig.datum(health.level),
        D.el('span', { class: 'code', text: project.code }),
        UI.status('project', project.status, { class: 'pcard__status' }),
        D.el('span', { class: 'pcard__spacer' }),
        moreButton(project, ctx.actions, 'pcard__more')
      ]),
      D.el('div', { class: 'pcard__titles' }, [
        D.el('h3', { class: 'pcard__name' }, [
          D.el('a', { class: 'project-link clamp-2', text: project.name, attrs: { href: projectHref(project), 'data-fk': 'open-' + project.id }, dataset: { projectTitle: project.id } })
        ]),
        D.el('p', { class: 'pcard__client truncate', text: project.client || 'Bez zamawiającego' })
      ]),
      risk
        ? D.el('p', { class: 'reason reason--' + health.level + ' pcard__reason' }, [D.el('span', { text: health.reasons[0].text }), health.reasons.length > 1 ? D.el('span', { class: 't-muted', text: ' i ' + (health.reasons.length - 1) + ' więcej' }) : null])
        : D.el('p', { class: 'pcard__stage truncate' }, [D.el('span', { text: active ? Model.describeStage(active).name : (project.stages.length ? 'Wszystkie etapy zakończone' : 'Brak etapów') })]),
      E.Flow.flowTrack(project, { size: 'compact', now: now }),
      D.el('div', { class: 'pcard__foot' }, [
        project.deadline
          ? D.el('span', { class: 'pcard__due' }, [
            D.el('span', { class: 't-num', text: F.date(project.deadline, { year: 'always' }) }),
            UI.countdown(project.deadline, { done: project.status === 'done', now: now })
          ])
          : D.el('span', { class: 't-muted', text: 'Bez terminu' }),
        D.el('span', { class: 'pcard__spacer' }),
        team.length ? Avatar.avatarStack(team, { max: 4, size: 'sm' }) : null
      ])
    ]);
  }

  function cards(visible, ctx) {
    var now = new Date();
    return D.el('div', { class: 'pcard-grid' }, visible.map(function (project) { return card(project, ctx, now); }));
  }

  /* ---------- Kokpit portfela ---------- */

  var HORIZON = 60;

  /** Przycisk przeglądu: przełącza zawężenie listy; stan wciśnięcia widać i słychać. */
  function scopeButton(className, pressed, label, onClick, children, fk) {
    return D.el('button', {
      class: className + (pressed ? ' is-active' : ''),
      attrs: { type: 'button', 'aria-pressed': String(pressed), 'aria-label': label, 'data-fk': fk },
      on: { click: onClick }
    }, children);
  }

  /** Terminy tego samego projektu w tym samym dniu łączą się w jedną pozycję. */
  function groupAhead(list) {
    var seen = {};
    var out = [];
    list.forEach(function (u) {
      var key = u.project.id + '|' + u.days;
      if (seen[key]) { seen[key].more += 1; return; }
      var copy = Object.assign({}, u, { more: 0 });
      seen[key] = copy;
      out.push(copy);
    });
    return out;
  }

  /**
   * Biuro dziś: ile czasu zapisano i ile osób pracuje teraz — w podziale na projekty,
   * bez nazwisk (czas konkretnych osób widzi tylko lider projektu i dyrekcja).
   */
  function liveNow(projects, ctx) {
    var all = (ctx.state.workspace && ctx.state.workspace.entries) || [];
    var now = new Date();
    var today = all.filter(function (e) { return E.TimeLog.dayKey(e.start) === E.TimeLog.dayKey(now.getTime()); });
    var people = {};
    var byProject = {};
    var order = [];
    var live = 0;
    today.forEach(function (e) {
      people[e.personId] = true;
      if (!byProject[e.projectId]) { byProject[e.projectId] = { minutes: 0, live: {} }; order.push(e.projectId); }
      byProject[e.projectId].minutes += E.TimeLog.minutes(e, now);
      if (!e.end) { byProject[e.projectId].live[e.personId] = true; live += 1; }
    });
    var total = today.reduce(function (sum, e) { return sum + E.TimeLog.minutes(e, now); }, 0);
    var header = D.el('p', { class: 'cockpit__label', text: 'Biuro dziś' });
    if (!today.length) {
      return D.el('div', { class: 'livenow' }, [header, D.el('p', { class: 'cockpit__empty', text: 'Nikt jeszcze nie zapisał czasu. Zegar włączysz przy zadaniu (▶).' })]);
    }
    order.sort(function (a, b) { return byProject[b].minutes - byProject[a].minutes; });
    return D.el('div', { class: 'livenow' }, [
      header,
      D.el('p', { class: 'livenow__stats' }, [
        D.el('span', { class: 'livenow__big t-num', text: E.TimeLog.duration(total) }),
        D.el('span', { class: 'livenow__sub', text: 'zapisano · ' + F.count(Object.keys(people).length, 'osoba', 'osoby', 'osób') + (live ? ' · teraz pracuje ' + live : '') })
      ]),
      D.el('ul', { class: 'livenow__list' }, order.slice(0, 3).map(function (id) {
        var project = projects.filter(function (p) { return p.id === id; })[0];
        var row = byProject[id];
        var working = Object.keys(row.live).length;
        return D.el('li', { class: 'livenow__item' }, [
          D.el('span', { class: 'code', text: project ? project.code : '—' }),
          D.el('span', { class: 'livenow__what truncate', text: project ? project.name : 'Usunięty projekt' }),
          D.el('span', { class: 'livenow__since t-num', text: (working ? '● ' : '') + E.TimeLog.duration(row.minutes) })
        ]);
      }))
    ]);
  }

  function cockpit(projects, ctx) {
    var now = new Date();
    var view = Insight.portfolio(projects, now, HORIZON);
    var attention = view.byLevel.alarm.concat(view.byLevel.warning);
    var open = view.total - view.counts.closed;
    var filters = ctx.state.filters || {};
    var act = ctx.actions;

    // A — wymaga uwagi (największa waga)
    var zoneA;
    if (attention.length) {
      var leadPressed = filters.health === 'attention';
      var titleText = attention.length === 1 ? 'projekt wymaga uwagi' : (F.plural(attention.length, 'projekt wymaga', 'projekty wymagają', 'projektów wymaga') + ' uwagi');
      zoneA = D.el('div', { class: 'cockpit__zone cockpit__attention' }, [
        scopeButton('cockpit__lead cockpit__hit', leadPressed,
          (leadPressed ? 'Pokaż wszystkie projekty' : 'Pokaż tylko projekty wymagające uwagi') + ' (' + attention.length + ')',
          function () { act.filterPortfolio({ health: 'attention' }); }, [
            D.el('span', { class: 'cockpit__number t-num', text: String(attention.length) }),
            D.el('span', { class: 'cockpit__lead-text' }, [
              D.el('span', { class: 'cockpit__title', text: titleText }),
              D.el('span', { class: 'cockpit__sub' }, [
                D.el('span', { text: 'z ' + F.count(open, 'czynnego', 'czynnych', 'czynnych') }),
                D.el('span', { class: 'cockpit__action', text: leadPressed ? 'Pokaż wszystkie' : 'Pokaż na liście' })
              ])
            ])
          ], 'cockpit-attention'),
        D.el('ul', { class: 'attention' }, attention.slice(0, 3).map(function (entry) {
          return D.el('li', null, [D.el('a', {
            class: 'attention__item',
            attrs: { href: projectHref(entry.project), 'data-fk': 'attention-' + entry.project.id },
            dataset: { projectTitle: entry.project.id }
          }, [
            Sig.datum(entry.health.level),
            D.el('span', { class: 'attention__text' }, [
              D.el('span', { class: 'attention__name truncate', text: entry.project.name }),
              D.el('span', { class: 'attention__reason reason--' + entry.health.level, text: entry.health.reasons[0].text })
            ]),
            D.el('span', { class: 'attention__go', attrs: { 'aria-hidden': 'true' } }, [E.Icons.icon('chevronRight', 14)])
          ])]);
        })),
        attention.length > 3
          ? D.el('button', {
              class: 'cockpit__more',
              attrs: { type: 'button' },
              text: 'i ' + (attention.length - 3) + ' więcej — pokaż wszystkie',
              on: { click: function () { act.filterPortfolio({ health: 'attention' }); } }
            })
          : null
      ]);
    } else {
      zoneA = D.el('div', { class: 'cockpit__zone cockpit__attention cockpit__attention--calm' }, [
        D.el('div', { class: 'cockpit__lead' }, [
          Sig.datum('normal', { size: 34, label: false }),
          D.el('span', { class: 'cockpit__lead-text' }, [
            D.el('span', { class: 'cockpit__title cockpit__title--big', text: 'Wszystko w normie' }),
            D.el('span', { class: 'cockpit__sub', text: 'Żaden projekt nie przekracza terminu ani nie ma zaległości.' })
          ])
        ]),
        liveNow(projects, ctx)
      ]);
    }

    // B — stan portfela: każdy stan zawęża listę
    var levels = ['alarm', 'warning', 'normal', 'closed'];
    var zoneB = D.el('div', { class: 'cockpit__zone cockpit__mix' }, [
      D.el('p', { class: 'cockpit__label', text: 'Stan portfela' }),
      D.el('ul', { class: 'mixlegend', attrs: { 'aria-label': 'Projekty według stanu' } }, levels.map(function (l) {
        var pressed = filters.health === l;
        var on = pressed || (filters.health === 'attention' && (l === 'alarm' || l === 'warning'));
        var dim = filters.health && filters.health !== 'all' && !on;
        var count = view.counts[l];
        var share = view.total ? Math.round(count / view.total * 100) : 0;
        return D.el('li', null, [scopeButton('mixlegend__item cockpit__hit mixlegend__item--' + l + (count ? '' : ' is-zero') + (dim ? ' is-dim' : ''), pressed,
          Insight.LEVELS[l].label + ': ' + count + (pressed ? '. Pokaż wszystkie projekty' : '. Pokaż na liście'),
          function () { act.filterPortfolio({ health: l }); }, [
            Sig.datum(l, { label: false }),
            D.el('span', { class: 'mixlegend__label', text: Insight.LEVELS[l].label }),
            D.el('span', { class: 'mixlegend__value t-num', text: String(count) }),
            D.el('span', { class: 'mixlegend__measure', style: { '--share': share + '%' }, attrs: { 'aria-hidden': 'true' } })
          ], 'mix-' + l)]);
      })),
      view.hoursTotal && view.hoursDone ? D.el('p', { class: 'cockpit__hours' }, [
        D.el('span', { class: 't-num cockpit__hours-value', text: F.number(view.hoursDone) }),
        D.el('span', { class: 'cockpit__hours-of t-num', text: ' z ' + F.hours(view.hoursTotal) }),
        D.el('span', { class: 'cockpit__hours-label', text: 'wykonane w czynnych projektach' })
      ]) : null
    ]);

    // C — oś najbliższych terminów: znaczniki i pozycje prowadzą do etapu albo projektu
    function goTo(u) {
      if (u.kind === 'stage') act.openStage(u.project.id, u.stage.id);
      else act.openProject(u.project.id);
    }
    function whatOf(u) { return u.kind === 'project' ? 'Termin umowy' : Model.describeStage(u.stage).name; }

    var ahead = view.upcoming.filter(function (u) { return u.days >= 0; });
    var horizonOn = filters.horizon === HORIZON;
    var aheadProjects = ahead.reduce(function (set, u) { set[u.project.id] = true; return set; }, {});
    var aheadCount = Object.keys(aheadProjects).length;
    var axis = D.el('div', { class: 'timeline', attrs: { role: 'group', 'aria-label': 'Terminy w najbliższych ' + HORIZON + ' dniach' } }, [
      D.el('div', { class: 'timeline__axis' }, [0, 15, 30, 45, 60].map(function (d) {
        return D.el('span', { class: 'timeline__tick', style: { left: (d / HORIZON * 100) + '%' }, attrs: { 'aria-hidden': 'true' } });
      }).concat(ahead.map(function (u, index) {
        var label = whatOf(u) + ' — ' + u.project.code + ', ' + F.date(u.date) + (u.days === 0 ? ' (dziś)' : ' (za ' + F.count(u.days, 'dzień', 'dni', 'dni') + ')');
        return D.el('button', {
          class: 'timeline__mark ' + (u.kind === 'project' ? 'timeline__mark--project' : 'timeline__mark--stage'),
          style: { left: (u.days / HORIZON * 100) + '%' },
          attrs: { type: 'button', 'data-tooltip': label, 'aria-label': 'Otwórz: ' + label, tabindex: index < 6 ? null : '-1' },
          on: { click: function () { goTo(u); } }
        }, u.kind === 'project' ? [E.Flow.marker('deadline', { level: u.level === 'alarm' ? 'alarm' : (u.level === 'warning' ? 'warning' : 'normal'), filled: u.level === 'alarm' })] : null);
      }))),
      D.el('div', { class: 'timeline__scale', attrs: { 'aria-hidden': 'true' } }, [D.el('span', { text: 'dziś' }), D.el('span', { text: '30 dni' }), D.el('span', { text: '60 dni' })])
    ]);
    var zoneC = D.el('div', { class: 'cockpit__zone cockpit__upcoming' }, [
      D.el('div', { class: 'cockpit__label-row' }, [
        D.el('p', { class: 'cockpit__label', text: 'Najbliższe terminy' }),
        ahead.length ? scopeButton('cockpit__link', horizonOn,
          horizonOn ? 'Pokaż wszystkie projekty' : 'Pokaż na liście projekty z terminem w ' + HORIZON + ' dniach',
          function () { act.filterPortfolio({ horizon: HORIZON }); },
          [D.el('span', { text: horizonOn ? 'Pokaż wszystkie' : 'Pokaż ' + F.count(aheadCount, 'projekt', 'projekty', 'projektów') })], 'cockpit-horizon') : null
      ]),
      axis,
      ahead.length
        ? D.el('ol', { class: 'upcoming' }, groupAhead(ahead).slice(0, 3).map(function (u) {
            return D.el('li', null, [D.el('button', {
              class: 'upcoming__item',
              attrs: { type: 'button', 'aria-label': 'Otwórz: ' + whatOf(u) + ', ' + u.project.code + ', ' + F.date(u.date), 'data-fk': 'up-' + u.project.id + '-' + (u.kind === 'stage' ? u.stage.id : 'p') },
              on: { click: function () { goTo(u); } }
            }, [
              D.el('span', { class: 'upcoming__date t-num', text: F.date(u.date) }),
              D.el('span', { class: 'upcoming__what' }, [
                D.el('span', { class: 'upcoming__name truncate', text: whatOf(u) + (u.more ? ' · +' + F.count(u.more, 'etap', 'etapy', 'etapów') : '') }),
                D.el('span', { class: 'code', text: u.project.code })
              ]),
              D.el('span', { class: 'upcoming__in t-num' + (u.days <= 7 ? ' is-soon' : ''), text: u.days === 0 ? 'dziś' : (u.days === 1 ? 'jutro' : 'za ' + u.days + ' dni') })
            ])]);
          }))
        : D.el('p', { class: 'cockpit__empty', text: 'Brak terminów w najbliższych ' + HORIZON + ' dniach.' })
    ]);

    return [zoneA, zoneB, zoneC];
  }

  /* ---------- Pierwsze uruchomienie ---------- */

  function projectsPreview() {
    // Profil z zaślepek: zakończone, w toku, przed nami — język ekranu przed pierwszymi danymi.
    function track(done, working, todo) {
      var segs = [];
      for (var i = 0; i < done; i += 1) segs.push(D.el('span', { class: 'flow__seg flow__seg--done', style: { 'flex-grow': String(2 + (i % 3)) } }));
      for (var j = 0; j < working; j += 1) segs.push(D.el('span', { class: 'flow__seg flow__seg--working is-current', style: { 'flex-grow': '3' } }));
      for (var k = 0; k < todo; k += 1) segs.push(D.el('span', { class: 'flow__seg flow__seg--todo', style: { 'flex-grow': String(2 + (k % 2)) } }));
      return D.el('div', { class: 'flow flow--mini' }, [D.el('div', { class: 'flow__track' }, segs)]);
    }
    var rows = [
      { level: 'alarm', w: ['11rem', '7rem'], t: [6, 1, 4], d: '3.5rem' },
      { level: 'warning', w: ['9rem', '8.5rem'], t: [3, 1, 7], d: '3rem' },
      { level: 'normal', w: ['12rem', '6rem'], t: [8, 1, 2], d: '4rem' },
      { level: 'closed', w: ['8rem', '7.5rem'], t: [11, 0, 0], d: '3.25rem' }
    ];
    return D.el('div', { class: 'preview preview--projects' }, [
      D.el('div', { class: 'preview__head' }, [D.el('span', { text: 'Projekt' }), D.el('span', { text: 'Przebieg' }), D.el('span', { text: 'Termin' })])
    ].concat(rows.map(function (r, index) {
      return D.el('div', { class: 'preview__row' + (index === 0 ? ' preview__row--lit' : '') }, [
        D.el('span', { class: 'preview__person' }, [
          Sig.datum(r.level, { size: 14, label: false }),
          D.el('span', { class: 'preview__lines' }, [UI.ghost(r.w[0]), UI.ghost(r.w[1])])
        ]),
        track(r.t[0], r.t[1], r.t[2]),
        UI.ghost(r.d)
      ]);
    })));
  }

  /**
   * @param {{create: Function, demo: Function, importCopy: Function, people: number}} o
   */
  function onboarding(o) {
    return UI.onboarding({
      id: 'projects-onboard-title',
      class: 'onboard--projects',
      title: 'Załóż pierwszy projekt',
      text: 'Projekt łączy umowę, etapy ze standardu ETROM, zadania i zespół. Z tych danych ETROM sam liczy postęp, pilnuje terminów i ostrzega, gdy coś jest zagrożone.',
      steps: [
        { title: 'Dane umowy', text: 'Kod, nazwa, zamawiający i termin umowy.' },
        { title: 'Etapy ze standardu', text: 'Wybierasz tylko te, które dotyczą projektu; budżet godzin waży postęp.' },
        { title: 'Zespół i zadania', text: o.people ? 'Przypisujesz osoby z katalogu i rozpisujesz pracę w etapach.' : 'Najpierw dodaj osoby na ekranie Zespół, potem rozpisz pracę w etapach.' }
      ],
      actions: [
        UI.button({ label: 'Nowy projekt', icon: 'plus', variant: 'primary', kbd: 'N', attrs: { id: 'empty-new' }, onClick: o.create }),
        UI.button({ label: 'Dodaj dane przykładowe', icon: 'sparkle', variant: 'secondary', attrs: { id: 'empty-demo' }, onClick: o.demo })
      ],
      note: D.el('span', null, [
        D.el('span', { text: 'Masz kopię z innego komputera? ' }),
        D.el('button', { class: 'link-btn', text: 'Wczytaj kopię zapasową', attrs: { type: 'button' }, on: { click: o.importCopy } })
      ]),
      preview: projectsPreview(),
      previewLabel: 'Tak wygląda portfel z danymi: stan, przebieg etapów i termin każdego projektu w jednym wierszu.'
    });
  }

  root.ETROM.ProjectList = {
    onboarding: onboarding,
    table: table,
    cards: cards,
    cockpit: cockpit,
    COLUMNS: COLUMNS,
    projectHref: projectHref,
    projectMenuItems: projectMenuItems,
    PAGE_SIZE: PAGE_SIZE
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
