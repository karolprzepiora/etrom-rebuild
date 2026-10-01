/* ETROM — lista etapów projektu. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Catalog = root.ETROM.Catalog;
  var Model = root.ETROM.Model;
  var Progress = root.ETROM.Progress;

  var STATUS_TONE = { todo: '', working: 'stage__status--working', done: 'stage__status--done' };
  var TONE_CLASS = {
    overdue: 'badge--danger',
    urgent: 'badge--danger',
    warning: 'badge--warn',
    normal: '',
    none: ''
  };

  function stageRow(project, stage, handlers) {
    var entry = Catalog.find(stage.id);
    var domain = Catalog.domain(entry.domain);
    var deadline = Progress.deadlineInfo(stage.deadline);

    var meta = [
      D.el('span', { text: domain.label }),
      D.el('span', { text: stage.hours + ' h' })
    ];
    if (stage.deadline) {
      meta.push(D.el('span', {
        class: 'badge ' + (TONE_CLASS[deadline.tone] || ''),
        text: deadline.text
      }));
    }

    return D.el('li', {
      class: 'stage' + (stage.status === 'done' ? ' stage--done' : ''),
      style: { '--stage-color': domain.color }
    }, [
      D.el('span', { class: 'stage__number', text: entry.number, attrs: { 'aria-hidden': 'true' } }),
      D.el('div', { class: 'stage__body' }, [
        D.el('p', { class: 'stage__name', text: entry.name }),
        D.el('p', { class: 'stage__meta' }, meta)
      ]),
      D.el('div', { class: 'stage__actions' }, [
        D.el('button', {
          class: 'stage__status ' + (STATUS_TONE[stage.status] || ''),
          text: Model.STAGE_STATUS[stage.status],
          attrs: {
            type: 'button',
            title: 'Zmień status etapu',
            'aria-label': 'Etap ' + entry.name + ' — status ' + Model.STAGE_STATUS[stage.status] + ', kliknij aby zmienić'
          },
          on: { click: function () { handlers.onCycleStage(project.id, stage.id); } }
        }),
        D.el('button', {
          class: 'btn btn--icon',
          text: '✕',
          attrs: {
            type: 'button',
            title: 'Usuń etap z projektu',
            'aria-label': 'Usuń etap ' + entry.name
          },
          on: { click: function () { handlers.onRemoveStage(project.id, stage.id); } }
        })
      ])
    ]);
  }

  function addStageControls(project, handlers) {
    var used = {};
    project.stages.forEach(function (stage) { used[stage.id] = true; });
    var available = Catalog.all.filter(function (entry) { return !used[entry.id]; });

    if (!available.length) {
      return D.el('p', { class: 'stages__empty', text: 'Wszystkie 14 etapów są już w projekcie.' });
    }

    var selectId = 'add-stage-' + project.id;
    var select = D.el('select', {
      class: 'select',
      attrs: { id: selectId }
    }, available.map(function (entry) {
      return D.el('option', {
        text: entry.number + '. ' + entry.name + ' (' + entry.defaultHours + ' h)',
        attrs: { value: entry.id }
      });
    }));

    return D.el('div', { class: 'stage-add' }, [
      D.el('div', { class: 'toolbar__field', style: { flex: '1 1 240px' } }, [
        D.el('label', { class: 'toolbar__label', text: 'Dodaj etap', attrs: { for: selectId } }),
        select
      ]),
      D.el('button', {
        class: 'btn',
        text: 'Dodaj',
        attrs: { type: 'button' },
        on: { click: function () { handlers.onAddStage(project.id, select.value); } }
      })
    ]);
  }

  /** @returns {Node} sekcja etapów gotowa do wstawienia w kartę projektu */
  function stageList(project, handlers) {
    var rows = project.stages.length
      ? D.el('ul', { class: 'stages' }, project.stages.map(function (stage) {
          return stageRow(project, stage, handlers);
        }))
      : D.el('p', { class: 'stages__empty', text: 'Brak etapów. Dodaj pierwszy etap z katalogu.' });

    return D.el('div', { class: 'stages-panel' }, [rows, addStageControls(project, handlers)]);
  }

  root.ETROM.StageList = { stageList: stageList };
})(typeof globalThis !== 'undefined' ? globalThis : this);
