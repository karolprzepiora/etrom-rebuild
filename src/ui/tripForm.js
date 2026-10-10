/* ETROM — formularz wyjazdu (teren / spotkanie) w panelu bocznym. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;

  /**
   * @param {Object} draft {id?, personIds, kind, from, to, place, projectId, note, notify}
   * @param {Object} errors pole → komunikat
   * @param {{onSubmit: Function, onCancel: Function, onDelete?: Function}} handlers
   * @param {{people: Array, projects: Array}} opts osoby, którym wolno dodać wyjazd, i projekty do wyboru
   */
  function tripForm(draft, errors, handlers, opts) {
    var v = draft || {};
    var problems = errors || {};
    var editing = !!v.id;
    var people = (opts && opts.people) || [];
    var projects = (opts && opts.projects) || [];
    var chosen = {};
    (v.personIds || []).forEach(function (id) { chosen[id] = true; });

    var kindSel = UI.select({ id: 'tr-kind', value: v.kind || 'field', options: Object.keys(E.Trips.KINDS).map(function (k) { return { value: k, label: E.Trips.KINDS[k] }; }) });
    var from = UI.input({ id: 'tr-from', type: 'date', value: v.from || '', error: problems.from });
    var to = UI.input({ id: 'tr-to', type: 'date', value: v.to || '', error: problems.to });
    var place = UI.input({ id: 'tr-place', value: v.place || '', maxlength: 120, placeholder: 'np. Lipnica, urząd gminy', error: problems.place });
    var project = UI.select({ id: 'tr-project', value: v.projectId || '', options: [{ value: '', label: 'Bez projektu' }].concat(projects.map(function (p) { return { value: p.id, label: p.code + ' · ' + p.name }; })) });
    var tFrom = UI.input({ id: 'tr-tfrom', type: 'time', value: v.timeFrom || '', error: problems.timeTo });
    var tTo = UI.input({ id: 'tr-tto', type: 'time', value: v.timeTo || '' });
    var note = UI.input({ id: 'tr-note', value: v.note || '', maxlength: 300, placeholder: 'np. pomiary, odbiór' });
    var notify = UI.checkbox({ id: 'tr-notify', label: 'Powiadom Lidera projektu', checked: v.notify === true });
    from.addEventListener('change', function () { if (!to.value || to.value < from.value) to.value = from.value; });

    var boxes = people.map(function (p) {
      var cb = UI.checkbox({ id: 'tr-p-' + p.id, label: Team.fullName(p), checked: !!chosen[p.id] });
      return { id: p.id, node: cb };
    });
    function picked() {
      return boxes.filter(function (b) { var i = b.node.querySelector ? b.node.querySelector('input') : b.node; return i && i.checked; }).map(function (b) { return b.id; });
    }
    var who = people.length > 1
      ? UI.field({ id: 'tr-who', label: 'Kto jedzie', control: D.el('div', { class: 'tr-who', attrs: { 'data-fk': 'tr-who' } }, boxes.map(function (b) { return b.node; })), error: problems.personIds })
      : null;

    var form = E.Dialog.drawerForm({
      id: 'trip-form',
      submitLabel: editing ? 'Zapisz zmiany' : 'Dodaj wyjazd',
      onCancel: handlers.onCancel,
      onSubmit: function () {
        handlers.onSubmit({
          id: v.id || '', personIds: people.length > 1 ? picked() : people.map(function (p) { return p.id; }),
          kind: kindSel.value, from: from.value, to: to.value, place: place.value, projectId: project.value || null, timeFrom: tFrom.value, timeTo: tTo.value, note: note.value,
          notify: !!(notify.querySelector ? notify.querySelector('input').checked : notify.checked)
        });
      },
      body: [
        UI.field({ id: 'tr-kind', label: 'Rodzaj', control: kindSel, error: problems.kind }),
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'tr-from', label: 'Od', control: from, error: problems.from }),
          UI.field({ id: 'tr-to', label: 'Do (włącznie)', control: to, error: problems.to })
        ]),
        UI.field({ id: 'tr-place', label: 'Miejsce', control: place, error: problems.place }),
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'tr-tfrom', label: 'Godziny od', optional: true, control: tFrom, error: problems.timeTo }),
          UI.field({ id: 'tr-tto', label: 'Godziny do', optional: true, control: tTo })
        ]),
        who,
        UI.field({ id: 'tr-project', label: 'Projekt', optional: true, control: project }),
        UI.field({ id: 'tr-note', label: 'Notatka', optional: true, control: note }),
        notify,
        D.el('p', { class: 't-meta', text: 'Bez rejestratora wyjazd liczy się w Czasie jako 8 godzin (8:00–16:00). Gdy włączysz też pomiar czasu, ustaw tu godziny wyjazdu, a pozostały czas policzy rejestrator.' }),
        editing && handlers.onDelete ? UI.button({ label: 'Usuń wyjazd', variant: 'ghost', size: 'sm', attrs: { type: 'button', 'data-fk': 'tr-delete' }, onClick: handlers.onDelete }) : null
      ]
    });
    window.setTimeout(function () { place.focus(); }, 0);
    return form;
  }

  E.TripForm = { tripForm: tripForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
