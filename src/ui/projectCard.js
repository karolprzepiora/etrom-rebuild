/* ETROM — karta projektu: okładka z własną barwą, metryki i etapy. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Model = root.ETROM.Model;
  var Progress = root.ETROM.Progress;
  var Identity = root.ETROM.Identity;
  var Icons = root.ETROM.Icons;
  var StageList = root.ETROM.StageList;

  var STATUS_CHIP = {
    planned: 'chip--onCover',
    active: 'chip--onCover',
    paused: 'chip--onCover',
    done: 'chip--onCover'
  };

  var DEADLINE_TONE = {
    overdue: 'tile--alert',
    urgent: '',
    warning: '',
    normal: '',
    none: ''
  };

  function tile(value, label, extraClass) {
    return D.el('div', { class: 'tile ' + (extraClass || '') }, [
      D.el('p', { class: 'tile__value', text: value }),
      D.el('p', { class: 'tile__label', text: label })
    ]);
  }

  function meter(stats) {
    return D.el('div', { class: 'meter' }, [
      D.el('div', { class: 'meter__top' }, [
        D.el('span', { class: 'label', text: 'Postęp rzeczowy' }),
        D.el('span', { class: 'meter__value', text: stats.percent + '%' })
      ]),
      D.el('div', {
        class: 'meter__track',
        attrs: {
          role: 'progressbar',
          'aria-valuenow': stats.percent,
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-label': 'Postęp rzeczowy'
        }
      }, [
        D.el('div', {
          class: 'meter__fill' + (stats.percent === 100 ? ' meter__fill--full' : ''),
          style: { width: stats.percent + '%' }
        })
      ])
    ]);
  }

  function cover(project, handlers) {
    return D.el('header', { class: 'project__cover' }, [
      D.el('div', { class: 'project__coverTop' }, [
        D.el('span', {
          class: 'chip ' + STATUS_CHIP[project.status],
          text: Model.PROJECT_STATUS[project.status]
        }),
        D.el('button', {
          class: 'project__remove',
          attrs: { type: 'button', title: 'Usuń projekt', 'aria-label': 'Usuń projekt ' + project.name },
          on: { click: function () { handlers.onDelete(project.id); } }
        }, [Icons.icon('close', 16)])
      ]),
      D.el('p', { class: 'project__code', text: project.code }),
      D.el('h3', { class: 'project__name', text: project.name })
    ]);
  }

  /**
   * @param {Object} project
   * @param {{expanded: boolean}} view
   * @param {Object} handlers onToggle, onEdit, onDelete, onCycleStage, onAddStage, onRemoveStage
   */
  function projectCard(project, view, handlers) {
    var stats = Progress.projectProgress(project);
    var deadline = Progress.deadlineInfo(project.deadline);
    var expanded = !!(view && view.expanded);
    var panelId = 'stages-' + project.id;

    var children = [
      cover(project, handlers),
      D.el('div', { class: 'project__body' }, [
        D.el('p', { class: 'project__client', text: project.client || 'Zamawiający nieokreślony' }),
        meter(stats),
        D.el('div', { class: 'tiles' }, [
          tile(stats.done + ' / ' + stats.total, 'etapów zakończonych'),
          tile(stats.hoursDone + ' / ' + stats.hoursTotal + ' h', 'budżet godzin'),
          tile(
            deadline.days === null ? 'Brak' : (deadline.days < 0 ? Math.abs(deadline.days) : deadline.days),
            deadline.days === null ? 'terminu umowy'
              : (deadline.days < 0 ? 'dni po terminie' : 'dni do końca umowy'),
            DEADLINE_TONE[deadline.tone]
          )
        ]),
        D.el('div', { class: 'project__actions' }, [
          D.el('button', {
            class: 'btn btn--small',
            text: expanded ? 'Ukryj etapy' : 'Etapy i postęp',
            attrs: { type: 'button', 'aria-expanded': expanded ? 'true' : 'false', 'aria-controls': panelId },
            on: { click: function () { handlers.onToggle(project.id); } }
          }),
          D.el('button', {
            class: 'btn btn--small btn--ghost',
            text: 'Edytuj',
            attrs: { type: 'button' },
            on: { click: function () { handlers.onEdit(project.id); } }
          })
        ])
      ])
    ];

    if (expanded) {
      children.push(D.el('div', { attrs: { id: panelId } }, [StageList.stageList(project, handlers)]));
    }

    return D.el('article', {
      class: 'project' + (expanded ? ' project--open' : ''),
      style: Identity.coverStyle(project.code),
      dataset: { projectCode: project.code }
    }, children);
  }

  root.ETROM.ProjectCard = { projectCard: projectCard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
