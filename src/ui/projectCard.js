/* ETROM — karta projektu. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Model = root.ETROM.Model;
  var Progress = root.ETROM.Progress;
  var StageList = root.ETROM.StageList;

  var STATUS_BADGE = {
    planned: '',
    active: 'badge--accent',
    paused: 'badge--warn',
    done: 'badge--ok'
  };

  var STATUS_ACCENT = {
    planned: 'var(--border-strong)',
    active: 'var(--accent)',
    paused: 'var(--warn)',
    done: 'var(--ok)'
  };

  var DEADLINE_BADGE = {
    overdue: 'badge--danger',
    urgent: 'badge--danger',
    warning: 'badge--warn',
    normal: '',
    none: ''
  };

  function progressBlock(project) {
    var stats = Progress.projectProgress(project);
    var label = stats.total
      ? stats.done + ' z ' + stats.total + ' etapów · ' + stats.hoursDone + '/' + stats.hoursTotal + ' h'
      : 'Brak etapów';

    return D.el('div', { class: 'progress' }, [
      D.el('div', { class: 'progress__row' }, [
        D.el('span', { text: 'Postęp rzeczowy' }),
        D.el('span', { text: stats.percent + '%' })
      ]),
      D.el('div', {
        class: 'progress__track',
        attrs: {
          role: 'progressbar',
          'aria-valuenow': stats.percent,
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-label': 'Postęp projektu ' + project.name
        }
      }, [
        D.el('div', {
          class: 'progress__fill' + (stats.percent === 100 ? ' progress__fill--complete' : ''),
          style: { width: stats.percent + '%' }
        })
      ]),
      D.el('p', { class: 'progress__row' }, [D.el('span', { text: label })])
    ]);
  }

  /**
   * @param {Object} project
   * @param {{expanded: boolean}} view
   * @param {Object} handlers onToggle, onEdit, onDelete, onCycleStage, onAddStage, onRemoveStage
   */
  function projectCard(project, view, handlers) {
    var deadline = Progress.deadlineInfo(project.deadline);
    var expanded = !!(view && view.expanded);
    var panelId = 'stages-panel-' + project.id;

    var meta = [
      D.el('span', {
        class: 'badge ' + STATUS_BADGE[project.status],
        text: Model.PROJECT_STATUS[project.status]
      })
    ];
    if (project.deadline) {
      meta.push(D.el('span', {
        class: 'badge ' + (DEADLINE_BADGE[deadline.tone] || ''),
        text: deadline.text
      }));
    }

    var children = [
      D.el('div', { class: 'project-card__head' }, [
        D.el('div', { class: 'project-card__titles' }, [
          D.el('p', { class: 'project-card__code', text: project.code }),
          D.el('h3', { class: 'project-card__name', text: project.name }),
          D.el('p', { class: 'project-card__client', text: project.client || 'Zamawiający nieokreślony' })
        ]),
        D.el('button', {
          class: 'btn btn--icon',
          text: '✕',
          attrs: {
            type: 'button',
            title: 'Usuń projekt',
            'aria-label': 'Usuń projekt ' + project.name
          },
          on: { click: function () { handlers.onDelete(project.id); } }
        })
      ]),
      D.el('div', { class: 'project-card__meta' }, meta),
      progressBlock(project),
      D.el('div', { class: 'project-card__actions' }, [
        D.el('button', {
          class: 'btn btn--small',
          text: expanded ? 'Ukryj etapy' : 'Etapy i postęp',
          attrs: {
            type: 'button',
            'aria-expanded': expanded ? 'true' : 'false',
            'aria-controls': panelId
          },
          on: { click: function () { handlers.onToggle(project.id); } }
        }),
        D.el('button', {
          class: 'btn btn--small',
          text: 'Edytuj',
          attrs: { type: 'button' },
          on: { click: function () { handlers.onEdit(project.id); } }
        })
      ])
    ];

    if (expanded) {
      children.push(D.el('div', { attrs: { id: panelId } }, [StageList.stageList(project, handlers)]));
    }

    return D.el('article', {
      class: 'project-card' + (expanded ? ' project-card--open' : ''),
      style: { '--card-accent': STATUS_ACCENT[project.status] },
      dataset: { projectCode: project.code }
    }, children);
  }

  root.ETROM.ProjectCard = { projectCard: projectCard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
