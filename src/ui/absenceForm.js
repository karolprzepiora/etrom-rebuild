/* ETROM — formularz nieobecności osoby w panelu bocznym. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;

  /**
   * @param {Object} draft {id?, personId, from, to, kind, note}
   * @param {Object} errors pole → komunikat
   * @param {{onSubmit: Function, onCancel: Function, onDelete?: Function}} handlers
   * @param {Array} people osoby do wyboru
   */
  function absenceForm(draft, errors, handlers, people) {
    var v = draft || {};
    var problems = errors || {};
    var editing = !!v.id;
    var person = UI.select({ id: 'ab-person', value: v.personId || '', options: [{ value: '', label: 'Wybierz osobę' }].concat((people || []).map(function (p) { return { value: p.id, label: Team.fullName(p) }; })) });
    var kind = UI.select({ id: 'ab-kind', value: v.kind || 'leave', options: Object.keys(E.Absences.KINDS).map(function (k) { return { value: k, label: E.Absences.KINDS[k] }; }) });
    var from = UI.input({ id: 'ab-from', type: 'date', value: v.from || '', error: problems.from });
    var to = UI.input({ id: 'ab-to', type: 'date', value: v.to || '', error: problems.to });
    var note = UI.input({ id: 'ab-note', value: v.note || '', maxlength: 200, placeholder: 'np. wyjazd rodzinny' });
    var count = D.el('p', { class: 't-meta', attrs: { 'data-fk': 'ab-days', 'aria-live': 'polite' } });
    function recount() {
      var n = from.value && to.value ? E.Calendar.workdaysIn(from.value, to.value) : 0;
      count.textContent = from.value && to.value ? E.Format.count(n, 'dzień roboczy', 'dni robocze', 'dni roboczych') + ' (bez weekendów i świąt)' : '';
    }
    from.addEventListener('change', function () { if (!to.value || to.value < from.value) to.value = from.value; recount(); });
    to.addEventListener('change', recount);
    recount();

    var form = E.Dialog.drawerForm({
      id: 'absence-form',
      submitLabel: editing ? 'Zapisz zmiany' : 'Dodaj nieobecność',
      onCancel: handlers.onCancel,
      onSubmit: function () {
        handlers.onSubmit({ id: v.id || '', personId: person.value, from: from.value, to: to.value, kind: kind.value, note: note.value });
      },
      body: [
        UI.field({ id: 'ab-person', label: 'Osoba', control: person, error: problems.personId }),
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'ab-from', label: 'Od', control: from, error: problems.from }),
          UI.field({ id: 'ab-to', label: 'Do (włącznie)', control: to, error: problems.to })
        ]),
        count,
        UI.field({ id: 'ab-kind', label: 'Rodzaj', control: kind, error: problems.kind }),
        UI.field({ id: 'ab-note', label: 'Notatka', optional: true, control: note }),
        editing && handlers.onDelete ? UI.button({ label: 'Usuń nieobecność', variant: 'ghost', size: 'sm', attrs: { type: 'button', 'data-fk': 'ab-delete' }, onClick: handlers.onDelete }) : null
      ]
    });
    window.setTimeout(function () { (editing ? from : person).focus(); }, 0);
    return form;
  }

  E.AbsenceForm = { absenceForm: absenceForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
