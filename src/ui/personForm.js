/* ETROM — formularz osoby w panelu bocznym. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;

  function options(map) {
    return Object.keys(map).map(function (key) { return { value: key, label: map[key] }; });
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

    var firstName = UI.input({ id: 'pe-first', value: values.firstName, error: problems.firstName, maxlength: 80, placeholder: 'np. Anna', autocomplete: 'given-name' });
    var lastName = UI.input({ id: 'pe-last', value: values.lastName, error: problems.lastName, maxlength: 80, placeholder: 'np. Kowalska', autocomplete: 'family-name' });
    var position = UI.input({ id: 'pe-position', value: values.position, error: problems.position, maxlength: 120, placeholder: 'np. Projektantka hydrotechniczna' });
    var orgRole = UI.select({ id: 'pe-role', options: options(Team.ORG_ROLES), value: values.orgRole || 'member' });
    var cooperation = UI.select({ id: 'pe-coop', options: options(Team.COOPERATION), value: values.cooperation || 'internal' });

    var form = E.Dialog.drawerForm({
      id: 'person-form',
      submitLabel: editing ? 'Zapisz zmiany' : 'Dodaj osobę',
      onCancel: handlers.onCancel,
      onSubmit: function () {
        handlers.onSubmit({
          id: values.id,
          firstName: firstName.value,
          lastName: lastName.value,
          position: position.value,
          orgRole: orgRole.value,
          cooperation: cooperation.value
        });
      },
      body: [
        D.el('section', { class: 'form__section' }, [
          D.el('div', { class: 'form__row' }, [
            UI.field({ id: 'pe-first', label: 'Imię', required: true, control: firstName, error: problems.firstName }),
            UI.field({ id: 'pe-last', label: 'Nazwisko', required: true, control: lastName, error: problems.lastName })
          ]),
          UI.field({ id: 'pe-position', label: 'Stanowisko', optional: true, control: position, error: problems.position })
        ]),
        D.el('hr', { class: 'form__divider' }),
        D.el('section', { class: 'form__section' }, [
          UI.field({ id: 'pe-role', label: 'Rola w organizacji', control: orgRole, error: problems.orgRole, hint: 'Zarządzający widzi wszystkie projekty i nadzór.' }),
          UI.field({ id: 'pe-coop', label: 'Forma współpracy', control: cooperation, error: problems.cooperation })
        ])
      ]
    });

    var target = problems.lastName && !problems.firstName ? lastName : firstName;
    window.setTimeout(function () { target.focus(); }, 0);
    return form;
  }

  root.ETROM.PersonForm = { personForm: personForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
