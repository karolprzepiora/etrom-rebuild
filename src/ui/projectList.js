/* ETROM — lista projektów: tabela (domyślnie) i karty.
   Tabela: przyklejony nagłówek, sortowanie z nagłówka, zaznaczanie wierszy,
   akcje zbiorcze, wybór kolumn, stronicowanie. Wiersz prowadzi do
   szczegółów projektu — lista nie rozwija już całych projektów w miejscu. */
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

  var PAGE_SIZE = 50;

  var COLUMNS = [
    { key: 'code', label: 'Kod', sort: 'code' },
    { key: 'name', label: 'Projekt', sort: 'name' },
    { key: 'client', label: 'Zamawiający', optional: true },
    { key: 'status', label: 'Status' },
    { key: 'progress', label: 'Postęp', sort: 'progress', optional: true },
    { key: 'stages', label: 'Etapy', optional: true, num: true },
    { key: 'tasks', label: 'Zadania', optional: true, num: true },
    { key: 'deadline', label: 'Termin', sort: 'deadline', optional: true },
    { key: 'team', label: 'Zespół', optional: true }
  ];

  // Kierunek sortowania wynika z porządku w Query: postęp malejąco, reszta rosnąco.
  var SORT_DIRECTION = { code: 'ascending', name: 'ascending', deadline: 'ascending', progress: 'descending' };

  function projectHref(project, tab) {
    return '#/projekty/' + project.id + (tab ? '/' + tab : '');
  }

  function people(ctx, project) {
    return Team.projectPeople(project.team)
      .map(function (id) { return Team.findPerson(ctx.people, id); })
      .filter(Boolean);
  }

  /** Menu akcji projektu — wspólne dla wiersza, karty i nagłówka szczegółów. */
  function projectMenuItems(project, actions, options) {
    var settings = options || {};
    var items = [];
    if (!settings.inDetail) items.push({ label: 'Otwórz', icon: 'external', onSelect: function () { actions.openProject(project.id); } });
    items.push({ label: 'Edytuj dane i zespół', icon: 'edit', hint: settings.inDetail ? 'E' : '', onSelect: function () { actions.editProject(project.id); } });
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
      dataset: { fk: 'more-' + project.id }
    });
    Menu.bind(btn, function () {
      return { label: 'Działania projektu ' + project.code, align: 'end', items: projectMenuItems(project, actions) };
    });
    return btn;
  }

  function tasksCell(project) {
    var stats = Tasks.projectTaskStats(project);
    if (!stats.total) return D.el('span', { class: 't-muted', text: '—', attrs: { 'aria-label': 'Brak zadań' } });
    return D.el('span', {
      class: 'tasks-count' + (stats.overdue ? ' tasks-count--alert' : ''),
      attrs: {
        'data-tooltip': F.count(stats.open, 'otwarte zadanie', 'otwarte zadania', 'otwartych zadań') + ' z ' + stats.total
          + (stats.overdue ? ' · ' + stats.overdue + ' po terminie' : ''),
        'aria-label': 'Otwarte zadania: ' + stats.open + ' z ' + stats.total + (stats.overdue ? ', po terminie: ' + stats.overdue : '')
      }
    }, [
      stats.overdue ? E.Icons.icon('alertCircle', 14) : null,
      D.el('span', { text: String(stats.open) })
    ]);
  }

  function cell(column, project, ctx) {
    var stats = Progress.projectProgress(project);
    switch (column.key) {
      case 'code':
        return D.el('span', { class: 'pcode' }, [UI.swatch(project.code), D.el('span', { class: 't-mono', text: project.code })]);
      case 'name':
        return D.el('a', {
          class: 'project-link truncate',
          text: project.name,
          attrs: { href: projectHref(project), 'data-fk': 'open-' + project.id }
        });
      case 'client':
        return D.el('span', { class: 'truncate t-secondary-cell', text: project.client || '—' });
      case 'status':
        return UI.status('project', project.status);
      case 'progress':
        return UI.progress(stats.percent, { label: 'Postęp projektu ' + project.code });
      case 'stages':
        return D.el('span', {
          class: 't-num',
          text: stats.total ? stats.done + '/' + stats.total : '—',
          attrs: { 'aria-label': stats.total ? 'Etapy zakończone: ' + stats.done + ' z ' + stats.total : 'Brak etapów' }
        });
      case 'tasks':
        return tasksCell(project);
      case 'deadline':
        return UI.due(project.deadline, Progress.deadlineInfo(project.deadline), { done: project.status === 'done', label: 'Termin umowy' });
      case 'team':
        var team = people(ctx, project);
        return team.length ? Avatar.avatarStack(team, { max: 3, size: 'sm' }) : D.el('span', { class: 't-muted', text: '—' });
      default:
        return null;
    }
  }

  function header(column, ctx) {
    var sort = ctx.state.filters.sort;
    var className = UI.cx(column.num ? 'cell--num' : '', 'col-' + column.key);
    if (!column.sort) return D.el('th', { class: className, attrs: { scope: 'col' }, text: column.label });
    var active = sort === column.sort;
    return D.el('th', {
      class: className,
      attrs: { scope: 'col', 'aria-sort': active ? SORT_DIRECTION[column.sort] : null }
    }, [
      D.el('button', {
        class: 'table__sort',
        attrs: {
          type: 'button',
          'aria-sort': active ? SORT_DIRECTION[column.sort] : null,
          'aria-label': 'Sortuj: ' + column.label + (active ? ' (aktywne)' : '')
        },
        dataset: { sort: column.sort },
        on: { click: function () { ctx.actions.setSort(column.sort); } }
      }, [
        D.el('span', { text: column.label }),
        E.Icons.icon(SORT_DIRECTION[column.sort] === 'descending' ? 'arrowDown' : 'arrowUp', 12)
      ])
    ]);
  }

  /**
   * @param {Array} visible przefiltrowane i posortowane projekty
   * @param {{state, people, actions}} ctx
   */
  function table(visible, ctx) {
    var hidden = ctx.state.prefs.hiddenColumns || [];
    var columns = COLUMNS.filter(function (c) { return hidden.indexOf(c.key) < 0; });
    var selection = ctx.state.selection || {};
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

    var body = D.el('tbody', null, rows.map(function (project) {
      var selected = !!selection[project.id];
      var box = UI.checkbox({
        id: 'select-' + project.id,
        checked: selected,
        attrs: { 'aria-label': 'Zaznacz projekt ' + project.code, 'data-fk': 'select-' + project.id },
        on: { change: function (event) { ctx.actions.selectProjects([project.id], event.target.checked); } }
      });
      return D.el('tr', {
        class: 'table__row' + (Progress.isOverdue(project) ? ' table__row--overdue' : ''),
        attrs: { 'aria-selected': selected ? 'true' : null },
        dataset: { projectCode: project.code, projectId: project.id },
        on: {
          click: function (event) {
            // Klik w wiersz otwiera projekt; elementy interaktywne zachowują własne działanie.
            if (event.target.closest('a, button, input, label, [role="menu"]')) return;
            if (window.getSelection && String(window.getSelection())) return;
            ctx.actions.openProject(project.id);
          }
        }
      }, [D.el('td', { class: 'cell--check' }, [box])]
        .concat(columns.map(function (column) {
          return D.el('td', { class: UI.cx(column.num ? 'cell--num' : '', 'col-' + column.key) }, [cell(column, project, ctx)]);
        }))
        .concat([D.el('td', { class: 'cell--actions' }, [moreButton(project, ctx.actions)])]));
    }));

    return D.el('div', { class: 'table-wrap project-table' }, [
      D.el('table', { class: 'table', attrs: { 'aria-label': 'Projekty', 'aria-rowcount': String(visible.length + 1) } }, [head, body]),
      visible.length > PAGE_SIZE
        ? UI.pagination({ page: page, pageSize: PAGE_SIZE, total: visible.length, onPage: ctx.actions.setPage })
        : null
    ]);
  }

  function card(project, ctx) {
    var stats = Progress.projectProgress(project);
    var taskStats = Tasks.projectTaskStats(project);
    var team = people(ctx, project);
    var active = Progress.activeStage(project);

    return D.el('article', {
      class: 'pcard project',
      dataset: { projectCode: project.code, projectId: project.id }
    }, [
      D.el('div', { class: 'pcard__top' }, [
        D.el('span', { class: 'pcode' }, [UI.swatch(project.code), D.el('span', { class: 't-mono', text: project.code })]),
        UI.status('project', project.status),
        D.el('span', { class: 'pcard__spacer' }),
        moreButton(project, ctx.actions, 'pcard__more')
      ]),
      D.el('div', { class: 'pcard__titles' }, [
        D.el('h3', { class: 'pcard__name' }, [
          D.el('a', { class: 'project-link clamp-2', text: project.name, attrs: { href: projectHref(project), 'data-fk': 'open-' + project.id } })
        ]),
        D.el('p', { class: 'pcard__client truncate', text: project.client || 'Bez zamawiającego' })
      ]),
      D.el('p', { class: 'pcard__stage truncate' }, active
        ? [D.el('span', { class: 't-muted', text: (active.status === 'working' ? 'W toku: ' : 'Następny: ') }), D.el('span', { text: Model.describeStage(active).name })]
        : [D.el('span', { class: 't-muted', text: project.stages.length ? 'Wszystkie etapy zakończone' : 'Brak etapów' })]),
      UI.progress(stats.percent, { label: 'Postęp projektu ' + project.code }),
      D.el('div', { class: 'pcard__foot' }, [
        UI.due(project.deadline, Progress.deadlineInfo(project.deadline), { done: project.status === 'done', label: 'Termin umowy' }),
        taskStats.total ? D.el('span', { class: 'pcard__meta' }, [E.Icons.icon('checklist', 14), tasksCell(project)]) : null,
        D.el('span', { class: 'pcard__spacer' }),
        team.length ? Avatar.avatarStack(team, { max: 3, size: 'sm' }) : null
      ])
    ]);
  }

  function cards(visible, ctx) {
    return D.el('div', { class: 'pcard-grid' }, visible.map(function (project) { return card(project, ctx); }));
  }

  root.ETROM.ProjectList = {
    table: table,
    cards: cards,
    COLUMNS: COLUMNS,
    projectHref: projectHref,
    projectMenuItems: projectMenuItems,
    PAGE_SIZE: PAGE_SIZE
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
