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
   * @param {{edit?: boolean, custom?: boolean, catalogLabel?: string}} [mode]
   *   edit — zmiana istniejącego etapu; custom=false — etap standardowy (nazwa tylko do odczytu)
   */
  function stageForm(values, errors, handlers, mode) {
    var m = mode || { edit: false, custom: true };
    var locked = m.edit && !m.custom;
    var v = values || {};
    var problems = errors || {};

    var name = UI.input({ id: 'cs-name', value: v.name, error: problems.name, maxlength: 200, placeholder: 'np. Uzgodnienie z PKP PLK', attrs: locked ? { readonly: 'true' } : null });
    var domain = UI.select({
      id: 'cs-domain', value: v.domain || 'general', attrs: locked ? { disabled: 'true' } : null,
      options: Object.keys(Catalog.DOMAINS).map(function (key) { return { value: key, label: Catalog.DOMAINS[key].label }; })
    });
    var kind = UI.select({
      id: 'cs-kind', value: v.kind || 'docs', attrs: locked ? { disabled: 'true' } : null,
      options: Catalog.KIND_ORDER.map(function (key) { return { value: key, label: Catalog.KINDS[key].label + ' — ' + Catalog.KINDS[key].hint }; })
    });
    var hours = UI.input({ id: 'cs-hours', type: 'number', value: v.hours || '8', error: problems.hours, attrs: { min: '1', step: '1', inputmode: 'numeric' } });
    var deadline = UI.input({ id: 'cs-deadline', type: 'date', value: v.deadline, error: problems.deadline });

    var form = E.Dialog.drawerForm({
      id: 'custom-stage-form',
      submitLabel: m.edit ? 'Zapisz zmiany' : 'Dodaj etap',
      onCancel: handlers.onCancel,
      onSubmit: function () {
        handlers.onSubmit({ name: name.value, domain: domain.value, kind: kind.value, hours: hours.value, deadline: deadline.value });
      },
      body: [
        UI.field({ id: 'cs-name', label: 'Nazwa etapu', required: !locked, control: name, error: problems.name, hint: locked ? 'Etap standardowy — nazwa, rodzaj pracy i temat wynikają ze standardu ETROM.' : null }),
        UI.field({ id: 'cs-kind', label: 'Rodzaj pracy', control: kind, error: problems.kind, hint: locked ? null : 'Decyzje to etapy postępowań — dostają plakietkę na ikonie.' }),
        UI.field({ id: 'cs-domain', label: 'Temat', control: domain, error: problems.domain, hint: locked ? null : 'Dziedzina sprawy: środowisko, wody, lokalizacja…' }),
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'cs-hours', label: 'Budżet godzin', required: true, control: hours, error: problems.hours, hint: 'Waży postęp projektu.' }),
          UI.field({ id: 'cs-deadline', label: 'Termin', optional: true, control: deadline, error: problems.deadline })
        ])
      ]
    });

    window.setTimeout(function () { (locked ? hours : name).focus(); }, 0);
    return form;
  }

  root.ETROM.StageForm = { stageForm: stageForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
