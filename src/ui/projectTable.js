/* ETROM — gęsty widok listy: wiersz na projekt, sortowanie po kolumnach. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Model = root.ETROM.Model;
  var Progress = root.ETROM.Progress;
  var Icons = root.ETROM.Icons;
  var StageList = root.ETROM.StageList;
  var Team = root.ETROM.Team;
  var Avatar = root.ETROM.Avatar;

  var STATUS_CHIP = {
    planned: '',
    active: 'chip--accent',
    paused: 'chip--warn',
    done: 'chip--ok'
  };

  var DEADLINE_CHIP = {
    overdue: 'chip--danger',
    urgent: 'chip--danger',
    warning: 'chip--warn',
    normal: '',
    none: ''
  };

  // Kolumny, po których da się sortować, i odpowiadające im klucze sortowania.
  var COLUMNS = [
    { key: 'code', label: 'Kod', sort: 'code' },
    { key: 'name', label: 'Projekt', sort: 'name' },
    { key: 'status', label: 'Status' },
    { key: 'progress', label: 'Postęp', sort: 'progress' },
    { key: 'stages', label: 'Etapy' },
    { key: 'deadline', label: 'Termin umowy', sort: 'deadline' },
    { key: 'team', label: 'Zespół' },
    { key: 'actions', label: 'Działania' }
  ];

  function head(currentSort, handlers) {
    return D.el('thead', {}, [
      D.el('tr', {}, COLUMNS.map(function (column) {
        var active = column.sort && column.sort === currentSort;
        if (!column.sort) {
          return D.el('th', {
            class: 'table__th',
            attrs: { scope: 'col' },
            text: column.label
          });
        }
        return D.el('th', {
          class: 'table__th',
          attrs: { scope: 'col', 'aria-sort': active ? 'ascending' : 'none' }
        }, [
          D.el('button', {
            class: 'table__sort' + (active ? ' table__sort--active' : ''),
            attrs: { type: 'button' },
            on: { click: function () { handlers.onSort(column.sort); } }
          }, [
            D.el('span', { text: column.label }),
            active ? Icons.icon('chevron', 12) : null
          ].filter(Boolean))
        ]);
      }))
    ]);
  }

  function row(project, expanded, handlers, people) {
    var stats = Progress.projectProgress(project);
    var deadline = Progress.deadlineInfo(project.deadline);
    var stage = Progress.activeStage(project);
    var stripColor = stage ? Model.describeStage(stage).color : 'transparent';

    return D.el('tr', {
      class: 'table__row' + (expanded ? ' table__row--open' : ''),
      style: { 'view-transition-name': 'project-' + project.id },
      dataset: { projectCode: project.code }
    }, [
      D.el('td', { class: 'table__td' }, [
        D.el('span', { class: 'table__stripe', style: { background: stripColor }, attrs: { 'aria-hidden': 'true' } }),
        D.el('span', { class: 'table__code', text: project.code })
      ]),
      D.el('td', { class: 'table__td' }, [
        D.el('p', { class: 'table__name', text: project.name }),
        D.el('p', { class: 'table__client', text: project.client || 'Zamawiający nieokreślony' })
      ]),
      D.el('td', { class: 'table__td' }, [
        D.el('span', { class: 'chip ' + STATUS_CHIP[project.status], text: Model.PROJECT_STATUS[project.status] })
      ]),
      D.el('td', { class: 'table__td' }, [
        D.el('div', { class: 'table__meter' }, [
          D.el('div', { class: 'meter__track' }, [
            D.el('div', {
              class: 'meter__fill' + (stats.percent === 100 ? ' meter__fill--full' : ''),
              style: { width: stats.percent + '%' }
            })
          ]),
          D.el('span', { class: 'table__percent', text: stats.percent + '%' })
        ])
      ]),
      D.el('td', { class: 'table__td table__td--num', text: stats.done + ' / ' + stats.total }),
      D.el('td', { class: 'table__td' }, [
        project.deadline
          ? D.el('span', { class: 'chip ' + DEADLINE_CHIP[deadline.tone], text: deadline.text })
          : D.el('span', { class: 'table__client', text: 'Nie ustalono' })
      ]),
      D.el('td', { class: 'table__td' }, [
        Avatar.avatarStack(
          Team.projectPeople(project.team)
            .map(function (id) { return Team.findPerson(people, id); })
            .filter(Boolean),
          { max: 3 }
        )
      ]),
      D.el('td', { class: 'table__td' }, [
        D.el('div', { class: 'table__actions' }, [
          D.el('button', {
            class: 'btn btn--small',
            attrs: {
              type: 'button',
              'aria-expanded': expanded ? 'true' : 'false',
              title: expanded ? 'Ukryj etapy' : 'Pokaż etapy'
            },
            on: { click: function () { handlers.onToggle(project.id); } }
          }, [D.el('span', { text: expanded ? 'Ukryj' : 'Etapy' })]),
          D.el('button', {
            class: 'btn btn--small btn--ghost',
            text: 'Edytuj',
            attrs: { type: 'button' },
            on: { click: function () { handlers.onEdit(project.id); } }
          }),
          D.el('button', {
            class: 'btn btn--icon',
            attrs: { type: 'button', title: 'Usuń projekt', 'aria-label': 'Usuń projekt ' + project.name },
            on: { click: function () { handlers.onDelete(project.id); } }
          }, [Icons.icon('close', 15)])
        ])
      ])
    ]);
  }

  function detailRow(project, handlers, motion, stageForm) {
    return D.el('tr', { class: 'table__detail' }, [
      D.el('td', { attrs: { colspan: String(COLUMNS.length) } }, [
        StageList.stageList(project, handlers, motion, stageForm)
      ])
    ]);
  }

  /**
   * @param {Array} projects już przefiltrowane i posortowane
   * @param {Object} state widok: expanded, filters
   * @param {Object} handlers onToggle, onEdit, onDelete, onSort + obsługa etapów
   * @param {Function} motionFor zwraca dane ruchu dla projektu
   */
  function projectTable(projects, state, handlers, motionFor, stageFormFor) {
    var body = [];
    projects.forEach(function (project) {
      var expanded = !!state.expanded[project.id];
      body.push(row(project, expanded, handlers, state.people || []));
      if (expanded) {
        body.push(detailRow(project, handlers, motionFor(project),
          stageFormFor ? stageFormFor(project) : null));
      }
    });

    return D.el('div', { class: 'table-wrap' }, [
      D.el('table', { class: 'table' }, [
        D.el('caption', { class: 'sr-only', text: 'Lista projektów z postępem i terminami' }),
        head(state.filters.sort, handlers),
        D.el('tbody', {}, body)
      ])
    ]);
  }

  root.ETROM.ProjectTable = { projectTable: projectTable };
})(typeof globalThis !== 'undefined' ? globalThis : this);
