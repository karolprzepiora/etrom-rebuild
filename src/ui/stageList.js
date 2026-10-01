/* ETROM — etapy projektu jako wyrównane wiersze.
   Kolor dziedziny niesie tylko kafelek ikony; ciężar wizualny należy
   do stanu etapu, a barwa semantyczna wyłącznie do terminów, które
   naprawdę tego wymagają. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Catalog = root.ETROM.Catalog;
  var Model = root.ETROM.Model;
  var Progress = root.ETROM.Progress;
  var Icons = root.ETROM.Icons;

  var STATUS_TONE = { todo: '', working: 'srow__status--working', done: 'srow__status--done' };
  // Kolor tylko dla terminów, na które trzeba zareagować. Reszta zwykłym
  // tekstem — przy czternastu wierszach bursztyn dla miesięcznego zapasu
  // robił szum, a nie informację.
  var DEADLINE_CHIP = { overdue: 'chip--danger', urgent: 'chip--danger' };

  function deadlineCell(stage) {
    if (!stage.deadline) {
      return D.el('span', { class: 'srow__quiet', text: 'bez terminu' });
    }
    var info = Progress.deadlineInfo(stage.deadline);
    var chipClass = DEADLINE_CHIP[info.tone];
    // Spokojne terminy zostają zwykłym tekstem — kolor rezerwujemy dla pilnych.
    return chipClass
      ? D.el('span', { class: 'chip ' + chipClass, text: info.text })
      : D.el('span', { class: 'srow__quiet', text: info.text });
  }

  function stageRow(project, stage, position, handlers, motion, count) {
    var info = Model.describeStage(stage);
    var flash = motion && motion.flashStage === stage.id;

    var meta = info.domainLabel + (info.isCustom ? ' · własny' : ' · standard ' + info.catalogNumber);

    return D.el('li', {
      class: 'srow srow--' + stage.status + (flash ? ' srow--flash' : ''),
      style: { '--stage-color': info.color }
    }, [
      D.el('span', { class: 'srow__no', text: String(position + 1) }),
      D.el('span', { class: 'srow__icon' }, [Icons.icon(info.domain, 16)]),
      D.el('div', { class: 'srow__body' }, [
        D.el('p', { class: 'srow__name', text: info.name }),
        D.el('p', { class: 'srow__meta', text: meta })
      ]),
      D.el('span', { class: 'srow__hours', text: stage.hours + ' h' }),
      D.el('span', { class: 'srow__deadline' }, [deadlineCell(stage)]),
      D.el('button', {
        class: 'srow__status ' + (STATUS_TONE[stage.status] || ''),
        text: Model.STAGE_STATUS[stage.status],
        attrs: {
          type: 'button',
          title: 'Zmień status etapu',
          'aria-label': info.name + ' — status ' + Model.STAGE_STATUS[stage.status] + '. Kliknij, aby zmienić.'
        },
        on: { click: function () { handlers.onCycleStage(project.id, stage.id); } }
      }),
      D.el('div', { class: 'srow__tools' }, [
        D.el('button', {
          class: 'btn btn--icon btn--quiet',
          attrs: {
            type: 'button', title: 'Przesuń wyżej',
            'aria-label': 'Przesuń etap ' + info.name + ' wyżej',
            disabled: position === 0
          },
          on: { click: function () { handlers.onMoveStage(project.id, stage.id, -1); } }
        }, [Icons.icon('chevron', 14)]),
        D.el('button', {
          class: 'btn btn--icon btn--quiet srow__down',
          attrs: {
            type: 'button', title: 'Przesuń niżej',
            'aria-label': 'Przesuń etap ' + info.name + ' niżej',
            disabled: position === count - 1
          },
          on: { click: function () { handlers.onMoveStage(project.id, stage.id, 1); } }
        }, [Icons.icon('chevron', 14)]),
        D.el('button', {
          class: 'btn btn--icon',
          attrs: { type: 'button', title: 'Usuń etap', 'aria-label': 'Usuń etap ' + info.name },
          on: { click: function () { handlers.onRemoveStage(project.id, stage.id); } }
        }, [Icons.icon('close', 14)])
      ])
    ]);
  }

  function field(id, label, control, error) {
    var children = [
      D.el('label', { class: 'label', text: label, attrs: { for: id } }),
      control
    ];
    if (error) children.push(D.el('p', { class: 'field__error', text: error, attrs: { role: 'alert' } }));
    return D.el('div', { class: 'filters__field' }, children);
  }

  function customStageForm(project, handlers, ui) {
    var values = (ui && ui.values) || {};
    var errors = (ui && ui.errors) || {};

    var name = D.el('input', {
      class: 'input',
      attrs: {
        id: 'cs-name', type: 'text', maxlength: '200',
        value: values.name || '', placeholder: 'np. Uzgodnienie z PKP',
        'aria-invalid': errors.name ? 'true' : 'false'
      }
    });
    var domain = D.el('select', { class: 'select', attrs: { id: 'cs-domain' } },
      Object.keys(Catalog.DOMAINS).map(function (key) {
        return D.el('option', {
          text: Catalog.DOMAINS[key].label,
          attrs: { value: key, selected: (values.domain || 'general') === key }
        });
      }));
    var hours = D.el('input', {
      class: 'input',
      attrs: {
        id: 'cs-hours', type: 'number', min: '1', step: '1',
        value: values.hours || '8',
        'aria-invalid': errors.hours ? 'true' : 'false'
      }
    });
    var deadline = D.el('input', {
      class: 'input',
      attrs: { id: 'cs-deadline', type: 'date', value: values.deadline || '' }
    });

    return D.el('form', {
      class: 'stage-add stage-add--custom',
      attrs: { id: 'custom-stage-form', novalidate: true },
      on: {
        submit: function (event) {
          event.preventDefault();
          handlers.onSubmitCustomStage(project.id, {
            name: name.value, domain: domain.value,
            hours: hours.value, deadline: deadline.value
          });
        }
      }
    }, [
      field('cs-name', 'Nazwa etapu', name, errors.name),
      field('cs-domain', 'Dziedzina', domain, errors.domain),
      field('cs-hours', 'Budżet godzin', hours, errors.hours),
      field('cs-deadline', 'Termin', deadline, errors.deadline),
      D.el('div', { class: 'stage-add__buttons' }, [
        D.el('button', {
          class: 'btn', text: 'Anuluj', attrs: { type: 'button' },
          on: { click: handlers.onCancelCustomStage }
        }),
        D.el('button', { class: 'btn btn--primary', text: 'Dodaj etap', attrs: { type: 'submit' } })
      ])
    ]);
  }

  function catalogPicker(project, handlers) {
    var used = {};
    project.stages.forEach(function (stage) { used[stage.id] = true; });
    var available = Catalog.all.filter(function (entry) { return !used[entry.id]; });

    var children = [];

    if (available.length) {
      var select = D.el('select', { class: 'select', attrs: { id: 'add-stage-' + project.id } },
        available.map(function (entry) {
          return D.el('option', {
            text: entry.number + '. ' + entry.name + ' (' + entry.defaultHours + ' h)',
            attrs: { value: entry.id }
          });
        }));
      children.push(
        D.el('div', { class: 'filters__field', style: { flex: '1 1 260px' } }, [
          D.el('label', { class: 'label', text: 'Dodaj etap ze standardu', attrs: { for: 'add-stage-' + project.id } }),
          select
        ]),
        D.el('button', {
          class: 'btn', text: 'Dodaj', attrs: { type: 'button' },
          on: { click: function () { handlers.onAddStage(project.id, select.value); } }
        })
      );
    } else {
      children.push(D.el('p', {
        class: 'stages__note',
        text: 'Wszystkie etapy ze standardu są już w projekcie.'
      }));
    }

    children.push(D.el('button', {
      class: 'btn btn--ghost btn--small',
      text: 'Dopisz własny etap',
      attrs: { type: 'button' },
      on: { click: function () { handlers.onOpenCustomStage(project.id); } }
    }));

    return D.el('div', { class: 'stage-add' }, children);
  }

  /**
   * @param {Object} project
   * @param {Object} handlers
   * @param {Object} [motion]
   * @param {{values: Object, errors: Object}} [ui] otwarty formularz etapu własnego
   */
  function stageList(project, handlers, motion, ui) {
    var stats = Progress.projectProgress(project);
    var count = project.stages.length;

    var body = count
      ? D.el('ul', { class: 'srows' }, project.stages.map(function (stage, index) {
          return stageRow(project, stage, index, handlers, motion, count);
        }))
      : D.el('p', {
          class: 'stages__note',
          text: 'Ten projekt nie ma jeszcze etapów. Wybierz je ze standardu albo dopisz własne.'
        });

    var custom = ui ? customStageForm(project, handlers, ui) : catalogPicker(project, handlers);

    return D.el('section', { class: 'stages' }, [
      D.el('div', { class: 'stages__title' }, [
        D.el('h4', { text: 'Etapy projektu' }),
        D.el('span', {
          class: 'stages__note',
          text: count
            ? stats.done + ' z ' + count + ' zakończonych, ' + stats.hoursTotal + ' h w budżecie'
            : 'Brak etapów'
        })
      ]),
      body,
      custom
    ]);
  }

  root.ETROM.StageList = { stageList: stageList };
})(typeof globalThis !== 'undefined' ? globalThis : this);
