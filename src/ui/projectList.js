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
      D.el('span', { class: 'stack__main t-num', text: F.date(project.deadline) }),
      D.el('span', { class: 'stack__sub', text: done ? 'zamknięty' : info.text.toLowerCase().replace(/^pozostało /, 'za ') })
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
        Sig.profile(project, { size: 'micro', now: now }),
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
      Sig.profile(project, { size: 'card', now: now }),
      D.el('div', { class: 'pcard__foot' }, [
        project.deadline
          ? D.el('span', { class: 'pcard__due' + (project.status !== 'done' && info.tone === 'overdue' ? ' t-alarm' : '') }, [D.el('span', { class: 't-num', text: F.date(project.deadline) })])
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

  function cockpit(projects, ctx) {
    var now = new Date();
    var view = Insight.portfolio(projects, now, 60);
    var attention = view.byLevel.alarm.concat(view.byLevel.warning);
    var open = view.total - view.counts.closed;

    // A — wymaga uwagi (największa waga)
    var zoneA;
    if (attention.length) {
      zoneA = D.el('div', { class: 'cockpit__zone cockpit__attention' }, [
        D.el('div', { class: 'cockpit__lead' }, [
          D.el('span', { class: 'cockpit__number t-num', text: String(attention.length) }),
          D.el('span', { class: 'cockpit__lead-text' }, [
            D.el('span', { class: 'cockpit__title', text: attention.length === 1 ? 'projekt wymaga uwagi' : (F.plural(attention.length, 'projekt wymaga', 'projekty wymagają', 'projektów wymaga') + ' uwagi') }),
            D.el('span', { class: 'cockpit__sub', text: 'z ' + F.count(open, 'czynnego', 'czynnych', 'czynnych') })
          ])
        ]),
        D.el('ul', { class: 'attention' }, attention.slice(0, 3).map(function (entry) {
          return D.el('li', null, [D.el('a', {
            class: 'attention__item',
            attrs: { href: projectHref(entry.project) },
            dataset: { projectTitle: entry.project.id }
          }, [
            Sig.datum(entry.health.level),
            D.el('span', { class: 'attention__text' }, [
              D.el('span', { class: 'attention__name truncate', text: entry.project.name }),
              D.el('span', { class: 'attention__reason reason--' + entry.health.level, text: entry.health.reasons[0].text })
            ])
          ])]);
        })),
        attention.length > 3 ? D.el('p', { class: 't-meta', text: 'i ' + (attention.length - 3) + ' więcej w grupach poniżej' }) : null
      ]);
    } else {
      zoneA = D.el('div', { class: 'cockpit__zone cockpit__attention cockpit__attention--calm' }, [
        D.el('div', { class: 'cockpit__lead' }, [
          Sig.datum('normal', { size: 34, label: false }),
          D.el('span', { class: 'cockpit__lead-text' }, [
            D.el('span', { class: 'cockpit__title cockpit__title--big', text: 'Wszystko w normie' }),
            D.el('span', { class: 'cockpit__sub', text: 'Żaden projekt nie przekracza terminu ani nie ma zaległości.' })
          ])
        ])
      ]);
    }

    // B — stan portfela: proporcje i godziny
    var levels = ['alarm', 'warning', 'normal', 'closed'];
    var zoneB = D.el('div', { class: 'cockpit__zone cockpit__mix' }, [
      D.el('p', { class: 'cockpit__label', text: 'Stan portfela' }),
      D.el('div', { class: 'mixbar', attrs: { role: 'img', 'aria-label': levels.map(function (l) { return Insight.LEVELS[l].label + ': ' + view.counts[l]; }).join(', ') } },
        levels.filter(function (l) { return view.counts[l]; }).map(function (l) {
          return D.el('span', { class: 'mixbar__seg mixbar__seg--' + l, style: { 'flex-grow': String(view.counts[l]) } });
        })),
      D.el('ul', { class: 'mixlegend' }, levels.map(function (l) {
        return D.el('li', { class: view.counts[l] ? '' : 'is-zero' }, [
          Sig.datum(l, { label: false }),
          D.el('span', { class: 'mixlegend__label', text: Insight.LEVELS[l].label }),
          D.el('span', { class: 'mixlegend__value t-num', text: String(view.counts[l]) })
        ]);
      })),
      view.hoursTotal ? D.el('p', { class: 'cockpit__hours' }, [
        D.el('span', { class: 't-num cockpit__hours-value', text: F.number(view.hoursDone) }),
        D.el('span', { class: 't-muted t-num', text: ' z ' + F.hours(view.hoursTotal) + ' wykonane w czynnych projektach' })
      ]) : null
    ]);

    // C — oś najbliższych terminów
    var ahead = view.upcoming.filter(function (u) { return u.days >= 0; });
    var axis = D.el('div', { class: 'timeline', attrs: { role: 'img', 'aria-label': 'Terminy w najbliższych 60 dniach: ' + ahead.length } }, [
      D.el('div', { class: 'timeline__axis' }, [0, 15, 30, 45, 60].map(function (d) {
        return D.el('span', { class: 'timeline__tick', style: { left: (d / 60 * 100) + '%' } });
      }).concat(ahead.map(function (u) {
        var label = (u.kind === 'project' ? 'Termin umowy' : Model.describeStage(u.stage).name) + ' — ' + u.project.code + ', ' + F.date(u.date);
        return u.kind === 'project'
          ? D.el('span', { class: 'timeline__mark timeline__mark--project datum--' + u.level, style: { left: (u.days / 60 * 100) + '%' }, attrs: { 'data-tooltip': label } }, [Sig.datum(u.level, { size: 12, label: false })])
          : D.el('span', { class: 'timeline__mark timeline__mark--stage', style: { left: (u.days / 60 * 100) + '%' }, attrs: { 'data-tooltip': label } });
      }))),
      D.el('div', { class: 'timeline__scale' }, [D.el('span', { text: 'dziś' }), D.el('span', { text: '30 dni' }), D.el('span', { text: '60 dni' })])
    ]);
    var zoneC = D.el('div', { class: 'cockpit__zone cockpit__upcoming' }, [
      D.el('p', { class: 'cockpit__label', text: 'Najbliższe terminy' }),
      axis,
      ahead.length
        ? D.el('ol', { class: 'upcoming' }, ahead.slice(0, 3).map(function (u) {
            return D.el('li', null, [D.el('a', { class: 'upcoming__item', attrs: { href: projectHref(u.project) } }, [
              D.el('span', { class: 'upcoming__date t-num', text: F.date(u.date) }),
              D.el('span', { class: 'upcoming__what' }, [
                D.el('span', { class: 'truncate', text: u.kind === 'project' ? 'Termin umowy' : Model.describeStage(u.stage).name }),
                D.el('span', { class: 'code', text: u.project.code })
              ]),
              D.el('span', { class: 'upcoming__in t-num', text: u.days === 0 ? 'dziś' : 'za ' + u.days + ' d' })
            ])]);
          }))
        : D.el('p', { class: 't-meta', text: 'Brak terminów w najbliższych 60 dniach.' })
    ]);

    return [zoneA, zoneB, zoneC];
  }

  root.ETROM.ProjectList = {
    table: table,
    cards: cards,
    cockpit: cockpit,
    COLUMNS: COLUMNS,
    projectHref: projectHref,
    projectMenuItems: projectMenuItems,
    PAGE_SIZE: PAGE_SIZE
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
