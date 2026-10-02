/* ETROM — formularz zadania. Mieszka w panelu bocznym. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Tasks = root.ETROM.Tasks;
  var Team = root.ETROM.Team;

  function field(id, label, control, error, hint) {
    var children = [
      D.el('label', { class: 'field__label', text: label, attrs: { for: id } }),
      control
    ];
    if (hint) children.push(D.el('p', { class: 'field__hint', text: hint }));
    if (error) children.push(D.el('p', { class: 'field__error', text: error, attrs: { role: 'alert' } }));
    return D.el('div', { class: 'field' }, children);
  }

  /**
   * @param {Object} draft wartości pól
   * @param {Object} errors mapa pole → komunikat
   * @param {{onSubmit: Function, onCancel: Function}} handlers
   * @param {Array} roster osoby z zespołu projektu
   */
  function taskForm(draft, errors, handlers, roster) {
    var values = draft || {};
    var problems = errors || {};
    var editing = values.id != null;
    var people = roster || [];

    var nameInput = D.el('input', {
      class: 'input',
      attrs: {
        id: 'tk-name', type: 'text', maxlength: '200',
        value: values.name || '', placeholder: 'np. Opracować rysunki wykonawcze',
        'aria-invalid': problems.name ? 'true' : 'false'
      }
    });

    var deadlineInput = D.el('input', {
      class: 'input',
      attrs: {
        id: 'tk-deadline', type: 'datetime-local',
        value: values.deadline || '',
        'aria-invalid': problems.deadline ? 'true' : 'false'
      }
    });

    var workloadSelect = D.el('select', { class: 'select', attrs: { id: 'tk-workload' } },
      Object.keys(Tasks.WORKLOAD).map(function (key) {
        return D.el('option', {
          text: Tasks.WORKLOAD[key],
          attrs: { value: key, selected: (values.workload || 'medium') === key }
        });
      }));

    var importantBox = D.el('input', {
      attrs: Object.assign({ id: 'tk-important', type: 'checkbox' }, values.important ? { checked: true } : {})
    });

    var descriptionInput = D.el('textarea', {
      class: 'input',
      attrs: { id: 'tk-description', rows: '3', placeholder: 'Opcjonalny opis, ustalenia, zakres.' },
      text: values.description || ''
    });

    var assigneeBoxes = {};
    var picked = values.assignees || [];

    var assigneeSection = people.length
      ? D.el('div', { class: 'picker', attrs: { id: 'tk-assignees' } }, [
          D.el('div', { class: 'picker__head' }, [
            D.el('span', { class: 'label', text: 'Realizatorzy' })
          ]),
          D.el('ul', { class: 'picker__list' }, people.map(function (person) {
            var id = 'tk-person-' + person.id;
            var box = D.el('input', {
              attrs: Object.assign(
                { id: id, type: 'checkbox', value: person.id },
                picked.indexOf(person.id) >= 0 ? { checked: true } : {}
              )
            });
            assigneeBoxes[person.id] = box;
            return D.el('li', { class: 'picker__item' }, [
              box,
              D.el('label', { attrs: { for: id } }, [
                D.el('span', { class: 'picker__name', text: Team.fullName(person) }),
                D.el('span', { class: 'picker__hours', text: person.position || '' })
              ])
            ]);
          })),
          problems.assignees
            ? D.el('p', { class: 'field__error', text: problems.assignees, attrs: { role: 'alert' } })
            : D.el('p', {
                class: 'field__hint',
                text: 'Zespół etapu wyznacza pulę osób; realizatorzy zadania to jawny podzbiór.'
              })
        ])
      : D.el('p', {
          class: 'field__hint',
          text: 'Projekt nie ma jeszcze zespołu. Przypisz osoby w edycji projektu, żeby wskazać realizatorów.'
        });

    function collect() {
      return {
        id: values.id,
        name: nameInput.value,
        deadline: deadlineInput.value,
        workload: workloadSelect.value,
        important: importantBox.checked,
        description: descriptionInput.value,
        assignees: Object.keys(assigneeBoxes).filter(function (id) { return assigneeBoxes[id].checked; })
      };
    }

    var form = D.el('form', {
      class: 'form',
      attrs: { id: 'task-form', novalidate: true },
      on: {
        submit: function (event) {
          event.preventDefault();
          handlers.onSubmit(collect());
        }
      }
    }, [
      D.el('div', { class: 'form__grid' }, [
        field('tk-name', 'Nazwa zadania', nameInput, problems.name),
        field('tk-deadline', 'Termin', deadlineInput, problems.deadline, 'Data i godzina. Pole opcjonalne.'),
        field('tk-workload', 'Nakład pracy', workloadSelect, problems.workload),
        field('tk-description', 'Opis', descriptionInput)
      ]),
      D.el('div', { class: 'field field--check' }, [
        importantBox,
        D.el('label', { text: 'Zadanie ważne', attrs: { for: 'tk-important' } })
      ]),
      assigneeSection,
      D.el('div', { class: 'form__actions' }, [
        D.el('button', {
          class: 'btn', text: 'Anuluj', attrs: { type: 'button' },
          on: { click: function () { handlers.onCancel(); } }
        }),
        D.el('button', {
          class: 'btn btn--primary',
          text: editing ? 'Zapisz zmiany' : 'Dodaj zadanie',
          attrs: { type: 'submit' }
        })
      ])
    ]);

    window.setTimeout(function () { nameInput.focus(); }, 0);
    return form;
  }

  root.ETROM.TaskForm = { taskForm: taskForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
