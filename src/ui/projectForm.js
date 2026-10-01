/* ETROM — formularz projektu (dodawanie i edycja). */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Model = root.ETROM.Model;

  function field(id, label, control, error, hint) {
    var children = [
      D.el('label', { class: 'field__label', text: label, attrs: { for: id } }),
      control
    ];
    if (hint) children.push(D.el('p', { class: 'field__hint', text: hint }));
    if (error) children.push(D.el('p', { class: 'field__error', text: error, attrs: { role: 'alert' } }));
    return D.el('div', { class: 'field' }, children);
  }

  function input(id, value, error, extra) {
    var attrs = Object.assign({
      id: id,
      type: 'text',
      value: value || '',
      'aria-invalid': error ? 'true' : 'false'
    }, extra || {});
    return D.el('input', { class: 'input', attrs: attrs });
  }

  /**
   * @param {Object} draft wartości pól (code, name, client, status, deadline, id)
   * @param {Object} errors mapa pole → komunikat
   * @param {{onSubmit: Function, onCancel: Function}} handlers
   */
  function projectForm(draft, errors, handlers) {
    var values = draft || {};
    var problems = errors || {};
    var editing = values.id != null;

    var codeInput = input('pf-code', values.code, problems.code, { maxlength: '50', placeholder: 'np. W-2026-014' });
    var nameInput = input('pf-name', values.name, problems.name, { maxlength: '200', placeholder: 'np. Przebudowa przepustu w Lipnicy' });
    var clientInput = input('pf-client', values.client, problems.client, { maxlength: '200', placeholder: 'np. Gmina Lipnica' });
    var deadlineInput = input('pf-deadline', values.deadline, problems.deadline, { type: 'date' });

    var statusSelect = D.el('select', {
      class: 'select',
      attrs: { id: 'pf-status' }
    }, Object.keys(Model.PROJECT_STATUS).map(function (key) {
      return D.el('option', {
        text: Model.PROJECT_STATUS[key],
        attrs: { value: key, selected: (values.status || 'planned') === key }
      });
    }));

    var stagesCheckbox = D.el('input', {
      attrs: { id: 'pf-stages', type: 'checkbox', checked: true }
    });

    function collect() {
      return {
        id: values.id,
        code: codeInput.value,
        name: nameInput.value,
        client: clientInput.value,
        status: statusSelect.value,
        deadline: deadlineInput.value,
        withStages: !editing && stagesCheckbox.checked
      };
    }

    var form = D.el('form', {
      class: 'panel',
      attrs: { novalidate: true, 'aria-labelledby': 'pf-title' },
      on: {
        submit: function (event) {
          event.preventDefault();
          handlers.onSubmit(collect());
        }
      }
    }, [
      D.el('h2', {
        class: 'panel__title',
        text: editing ? 'Edytuj projekt' : 'Nowy projekt',
        attrs: { id: 'pf-title' }
      }),
      D.el('div', { class: 'panel__grid' }, [
        field('pf-code', 'Kod projektu', codeInput, problems.code, 'Musi być niepowtarzalny.'),
        field('pf-name', 'Nazwa', nameInput, problems.name),
        field('pf-client', 'Zamawiający', clientInput, problems.client),
        field('pf-status', 'Status', statusSelect, problems.status),
        field('pf-deadline', 'Termin umowny', deadlineInput, problems.deadline, 'Opcjonalny.')
      ]),
      !editing && D.el('div', { class: 'field field--check' }, [
        stagesCheckbox,
        D.el('label', {
          text: 'Dodaj od razu wszystkie 14 standardowych etapów',
          attrs: { for: 'pf-stages' }
        })
      ]),
      D.el('div', { class: 'panel__actions' }, [
        D.el('button', {
          class: 'btn',
          text: 'Anuluj',
          attrs: { type: 'button' },
          on: { click: function () { handlers.onCancel(); } }
        }),
        D.el('button', {
          class: 'btn btn--primary',
          text: editing ? 'Zapisz zmiany' : 'Dodaj projekt',
          attrs: { type: 'submit' }
        })
      ])
    ]);

    // Fokus na pierwszym polu, żeby dało się pracować z klawiatury.
    window.setTimeout(function () { codeInput.focus(); }, 0);

    return form;
  }

  root.ETROM.ProjectForm = { projectForm: projectForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
