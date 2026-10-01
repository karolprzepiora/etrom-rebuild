/* ETROM — etapy projektu jako karty dziedzin. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Catalog = root.ETROM.Catalog;
  var Model = root.ETROM.Model;
  var Progress = root.ETROM.Progress;
  var Icons = root.ETROM.Icons;

  var STATUS_TONE = { todo: '', working: 'stage__status--working', done: 'stage__status--done' };
  var DEADLINE_CHIP = {
    overdue: 'chip--danger',
    urgent: 'chip--danger',
    warning: 'chip--warn',
    normal: 'chip--info',
    none: ''
  };

  function fact(label, value) {
    return D.el('div', { class: 'stage__fact' }, [
      D.el('span', { class: 'label', text: label }),
      D.el('span', { class: 'stage__factValue', text: value })
    ]);
  }

  function stageCard(project, stage, handlers) {
    var entry = Catalog.find(stage.id);
    var domain = Catalog.domain(entry.domain);
    var deadline = Progress.deadlineInfo(stage.deadline);

    var deadlineNode = stage.deadline
      ? D.el('span', { class: 'chip ' + DEADLINE_CHIP[deadline.tone], text: deadline.text })
      : D.el('span', { class: 'stage__factValue', text: 'Nie ustalono' });

    return D.el('li', {
      class: 'stage' + (stage.status === 'done' ? ' stage--done' : ''),
      style: { '--stage-color': domain.color }
    }, [
      D.el('div', { class: 'stage__head' }, [
        D.el('span', { class: 'stage__icon' }, [Icons.icon(entry.domain, 20)]),
        D.el('div', { class: 'stage__heading' }, [
          D.el('p', { class: 'stage__no', text: 'Etap ' + entry.number + ' · ' + domain.label }),
          D.el('p', { class: 'stage__name', text: entry.name })
        ]),
        D.el('button', {
          class: 'stage__drop',
          attrs: {
            type: 'button',
            title: 'Usuń etap z projektu',
            'aria-label': 'Usuń etap ' + entry.name + ' z projektu'
          },
          on: { click: function () { handlers.onRemoveStage(project.id, stage.id); } }
        }, [Icons.icon('close', 14)])
      ]),
      D.el('div', { class: 'stage__body' }, [
        D.el('div', { class: 'stage__facts' }, [
          fact('Budżet', stage.hours + ' h'),
          D.el('div', { class: 'stage__fact' }, [
            D.el('span', { class: 'label', text: 'Termin' }),
            deadlineNode
          ])
        ]),
        D.el('button', {
          class: 'stage__status ' + (STATUS_TONE[stage.status] || ''),
          text: Model.STAGE_STATUS[stage.status],
          attrs: {
            type: 'button',
            title: 'Zmień status etapu',
            'aria-label': entry.name + ' — status ' + Model.STAGE_STATUS[stage.status] + '. Kliknij, aby zmienić.'
          },
          on: { click: function () { handlers.onCycleStage(project.id, stage.id); } }
        })
      ])
    ]);
  }

  function addStageControls(project, handlers) {
    var used = {};
    project.stages.forEach(function (stage) { used[stage.id] = true; });
    var available = Catalog.all.filter(function (entry) { return !used[entry.id]; });

    if (!available.length) {
      return D.el('p', { class: 'stages__note', text: 'Projekt ma już wszystkie 14 etapów z katalogu.' });
    }

    var selectId = 'add-stage-' + project.id;
    var select = D.el('select', { class: 'select', attrs: { id: selectId } },
      available.map(function (entry) {
        return D.el('option', {
          text: entry.number + '. ' + entry.name + ' (' + entry.defaultHours + ' h)',
          attrs: { value: entry.id }
        });
      }));

    return D.el('div', { class: 'stage-add' }, [
      D.el('div', { class: 'filters__field', style: { flex: '1 1 260px' } }, [
        D.el('label', { class: 'label', text: 'Dodaj etap z katalogu', attrs: { for: selectId } }),
        select
      ]),
      D.el('button', {
        class: 'btn',
        text: 'Dodaj etap',
        attrs: { type: 'button' },
        on: { click: function () { handlers.onAddStage(project.id, select.value); } }
      })
    ]);
  }

  /** @returns {Node} sekcja etapów wstawiana pod kartę projektu */
  function stageList(project, handlers) {
    var stats = Progress.projectProgress(project);

    var body = project.stages.length
      ? D.el('ul', { class: 'stages__grid' }, project.stages.map(function (stage) {
          return stageCard(project, stage, handlers);
        }))
      : D.el('p', {
          class: 'stages__note',
          text: 'Ten projekt nie ma jeszcze etapów. Dodaj pierwszy z katalogu poniżej.'
        });

    return D.el('section', { class: 'stages' }, [
      D.el('div', { class: 'stages__title' }, [
        D.el('h4', { text: 'Etapy projektu' }),
        D.el('span', {
          class: 'stages__note',
          text: stats.total
            ? stats.done + ' z ' + stats.total + ' zakończonych, ' + stats.hoursTotal + ' h w budżecie'
            : 'Brak etapów'
        })
      ]),
      body,
      addStageControls(project, handlers)
    ]);
  }

  root.ETROM.StageList = { stageList: stageList };
})(typeof globalThis !== 'undefined' ? globalThis : this);
