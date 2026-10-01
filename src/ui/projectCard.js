/* ETROM — karta projektu: okładka z własną barwą, metryki i etapy. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Model = root.ETROM.Model;
  var Catalog = root.ETROM.Catalog;
  var Progress = root.ETROM.Progress;
  var Identity = root.ETROM.Identity;
  var Icons = root.ETROM.Icons;
  var StageList = root.ETROM.StageList;

  function tile(value, label, extraClass) {
    return D.el('div', { class: 'tile ' + (extraClass || '') }, [
      D.el('p', { class: 'tile__value', text: value }),
      D.el('p', { class: 'tile__label', text: label })
    ]);
  }

  /** Opis etapu, na którym stoi projekt — z kropką w kolorze dziedziny. */
  function activeLine(project) {
    var stage = Progress.activeStage(project);
    if (!stage) {
      return D.el('p', { class: 'project__active project__active--idle' }, [
        D.el('span', {
          text: project.stages.length ? 'Wszystkie etapy zakończone' : 'Brak etapów w projekcie'
        })
      ]);
    }
    var entry = Catalog.find(stage.id);
    var domain = Catalog.domain(entry.domain);
    return D.el('p', { class: 'project__active', style: { '--dot': domain.color } }, [
      D.el('span', { class: 'project__dot', attrs: { 'aria-hidden': 'true' } }),
      D.el('span', { class: 'project__activeLabel', text: stage.status === 'working' ? 'W toku' : 'Następny' }),
      D.el('span', { class: 'project__activeName', text: entry.name })
    ]);
  }

  function meter(stats, motion) {
    var fillClass = 'meter__fill' + (stats.percent === 100 ? ' meter__fill--full' : '');
    var style = { width: stats.percent + '%' };

    // Pasek przechodzi z poprzedniej wartości tylko wtedy, gdy liczba
    // naprawdę się zmieniła — nie przy każdym przerysowaniu listy.
    if (motion && typeof motion.progressFrom === 'number' && motion.progressFrom !== stats.percent) {
      fillClass += ' meter__fill--moved';
      style['--meter-from'] = motion.progressFrom + '%';
    }

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
      }, [D.el('div', { class: fillClass, style: style })])
    ]);
  }

  function cover(project, handlers) {
    var stage = Progress.activeStage(project);
    var stripColor = stage ? Catalog.domain(Catalog.find(stage.id).domain).color : 'transparent';
    var deadline = Progress.deadlineInfo(project.deadline);

    var top = [
      D.el('span', { class: 'chip chip--onCover', text: Model.PROJECT_STATUS[project.status] })
    ];
    if (project.deadline) {
      top.push(D.el('span', {
        class: 'chip chip--onCover' + (deadline.tone === 'overdue' || deadline.tone === 'urgent' ? ' chip--coverAlert' : ''),
        text: deadline.text
      }));
    }
    top.push(D.el('button', {
      class: 'project__remove',
      attrs: { type: 'button', title: 'Usuń projekt', 'aria-label': 'Usuń projekt ' + project.name },
      on: { click: function () { handlers.onDelete(project.id); } }
    }, [Icons.icon('close', 16)]));

    return D.el('header', { class: 'project__cover' }, [
      D.el('div', { class: 'project__coverTop' }, top),
      D.el('p', { class: 'project__code', text: project.code }),
      D.el('h3', { class: 'project__name', text: project.name }),
      D.el('span', {
        class: 'project__strip',
        style: { background: stripColor },
        attrs: { 'aria-hidden': 'true' }
      })
    ]);
  }

  /**
   * @param {Object} project
   * @param {{expanded: boolean}} view
   * @param {Object} handlers onToggle, onEdit, onDelete, onCycleStage, onAddStage, onRemoveStage
   * @param {{progressFrom?: number, justExpanded?: boolean, flashStage?: string}} [motion]
   */
  function projectCard(project, view, handlers, motion) {
    var stats = Progress.projectProgress(project);
    var expanded = !!(view && view.expanded);
    var panelId = 'stages-' + project.id;

    var children = [
      cover(project, handlers),
      D.el('div', { class: 'project__body' }, [
        D.el('p', { class: 'project__client', text: project.client || 'Zamawiający nieokreślony' }),
        activeLine(project),
        meter(stats, motion),
        D.el('div', { class: 'tiles' }, [
          tile(stats.done + ' / ' + stats.total, 'etapów zakończonych'),
          tile(stats.hoursDone + '/' + stats.hoursTotal + ' h', 'budżet godzin')
        ]),
        D.el('div', { class: 'project__actions' }, [
          D.el('button', {
            class: 'btn btn--small',
            attrs: { type: 'button', 'aria-expanded': expanded ? 'true' : 'false', 'aria-controls': panelId },
            on: { click: function () { handlers.onToggle(project.id); } }
          }, [
            D.el('span', { text: expanded ? 'Ukryj etapy' : 'Etapy i postęp' }),
            D.el('span', {
              class: 'btn__chev' + (expanded ? ' btn__chev--up' : ''),
              attrs: { 'aria-hidden': 'true' }
            }, [Icons.icon('chevron', 14)])
          ]),
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
      children.push(D.el('div', {
        class: motion && motion.justExpanded ? 'stages-enter' : '',
        attrs: { id: panelId }
      }, [StageList.stageList(project, handlers, motion)]));
    }

    return D.el('article', {
      class: 'project' + (expanded ? ' project--open' : ''),
      style: Identity.coverStyle(project.code),
      dataset: { projectCode: project.code }
    }, children);
  }

  root.ETROM.ProjectCard = { projectCard: projectCard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
