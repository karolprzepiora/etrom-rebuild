/* ETROM — formularz osoby. Mieszka w panelu bocznym. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
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

  function input(id, value, error, extra) {
    return D.el('input', {
      class: 'input',
      attrs: Object.assign({
        id: id, type: 'text', value: value || '',
        'aria-invalid': error ? 'true' : 'false'
      }, extra || {})
    });
  }

  function select(id, options, value) {
    return D.el('select', { class: 'select', attrs: { id: id } },
      Object.keys(options).map(function (key) {
        return D.el('option', {
          text: options[key],
          attrs: { value: key, selected: value === key }
        });
      }));
  }

  /**
   * @param {Object} draft wartości pól (id, firstName, lastName, position, orgRole, cooperation)
   * @param {Object} errors mapa pole → komunikat
   * @param {{onSubmit: Function, onCancel: Function}} handlers
   */
  function personForm(draft, errors, handlers) {
    var values = draft || {};
    var problems = errors || {};
    var editing = values.id != null;

    var firstName = input('pe-first', values.firstName, problems.firstName, { maxlength: '80', placeholder: 'np. Anna' });
    var lastName = input('pe-last', values.lastName, problems.lastName, { maxlength: '80', placeholder: 'np. Kowalska' });
    var position = input('pe-position', values.position, problems.position, { maxlength: '120', placeholder: 'np. Projektantka hydrotechniczna' });
    var orgRole = select('pe-role', Team.ORG_ROLES, values.orgRole || 'member');
    var cooperation = select('pe-coop', Team.COOPERATION, values.cooperation || 'internal');

    function collect() {
      return {
        id: values.id,
        firstName: firstName.value,
        lastName: lastName.value,
        position: position.value,
        orgRole: orgRole.value,
        cooperation: cooperation.value
      };
    }

    var form = D.el('form', {
      class: 'form',
      attrs: { id: 'person-form', novalidate: true },
      on: {
        submit: function (event) {
          event.preventDefault();
          handlers.onSubmit(collect());
        }
      }
    }, [
      D.el('div', { class: 'form__grid' }, [
        field('pe-first', 'Imię', firstName, problems.firstName),
        field('pe-last', 'Nazwisko', lastName, problems.lastName),
        field('pe-position', 'Stanowisko', position, problems.position, 'Pole opcjonalne.'),
        field('pe-role', 'Rola w organizacji', orgRole, problems.orgRole,
          'Zarządzający widzi wszystkie projekty i nadzór.'),
        field('pe-coop', 'Forma współpracy', cooperation, problems.cooperation)
      ]),
      D.el('div', { class: 'form__actions' }, [
        D.el('button', {
          class: 'btn', text: 'Anuluj', attrs: { type: 'button' },
          on: { click: function () { handlers.onCancel(); } }
        }),
        D.el('button', {
          class: 'btn btn--primary',
          text: editing ? 'Zapisz zmiany' : 'Dodaj osobę',
          attrs: { type: 'submit' }
        })
      ])
    ]);

    window.setTimeout(function () { firstName.focus(); }, 0);
    return form;
  }

  root.ETROM.PersonForm = { personForm: personForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
