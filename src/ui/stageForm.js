/* ETROM — etap spoza standardu: krótki formularz w panelu bocznym
   (ten sam wzorzec co projekt, osoba i zadanie). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Catalog = E.Catalog;

  /**
   * @param {Object} values {name, domain, hours, deadline}
   * @param {Object} errors
   * @param {{onSubmit: Function, onCancel: Function}} handlers
   */
  function stageForm(values, errors, handlers) {
    var v = values || {};
    var problems = errors || {};

    var name = UI.input({ id: 'cs-name', value: v.name, error: problems.name, maxlength: 200, placeholder: 'np. Uzgodnienie z PKP PLK' });
    var domain = UI.select({
      id: 'cs-domain', value: v.domain || 'general',
      options: Object.keys(Catalog.DOMAINS).map(function (key) { return { value: key, label: Catalog.DOMAINS[key].label }; })
    });
    var hours = UI.input({ id: 'cs-hours', type: 'number', value: v.hours || '8', error: problems.hours, attrs: { min: '1', step: '1', inputmode: 'numeric' } });
    var deadline = UI.input({ id: 'cs-deadline', type: 'date', value: v.deadline, error: problems.deadline });

    var form = E.Dialog.drawerForm({
      id: 'custom-stage-form',
      submitLabel: 'Dodaj etap',
      onCancel: handlers.onCancel,
      onSubmit: function () {
        handlers.onSubmit({ name: name.value, domain: domain.value, hours: hours.value, deadline: deadline.value });
      },
      body: [
        UI.field({ id: 'cs-name', label: 'Nazwa etapu', required: true, control: name, error: problems.name }),
        UI.field({ id: 'cs-domain', label: 'Dziedzina', control: domain, error: problems.domain, hint: 'Decyduje o ikonie etapu na liście.' }),
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'cs-hours', label: 'Budżet godzin', required: true, control: hours, error: problems.hours, hint: 'Waży postęp projektu.' }),
          UI.field({ id: 'cs-deadline', label: 'Termin', optional: true, control: deadline, error: problems.deadline })
        ])
      ]
    });

    window.setTimeout(function () { name.focus(); }, 0);
    return form;
  }

  root.ETROM.StageForm = { stageForm: stageForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
