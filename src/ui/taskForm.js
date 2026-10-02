/* ETROM — formularz zadania w panelu bocznym. Realizatorami mogą być
   wyłącznie osoby z zespołu projektu. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Tasks = E.Tasks;
  var Team = E.Team;
  var Avatar = E.Avatar;

  /**
   * @param {Object} draft wartości pól
   * @param {Object} errors mapa pole → komunikat
   * @param {{onSubmit: Function, onCancel: Function, onEditTeam?: Function}} handlers
   * @param {Array} roster osoby z zespołu projektu
   */
  function taskForm(draft, errors, handlers, roster) {
    var values = draft || {};
    var problems = errors || {};
    var editing = values.id != null;
    var people = roster || [];
    var picked = values.assignees || [];

    var name = UI.input({ id: 'tk-name', value: values.name, error: problems.name, maxlength: 200, placeholder: 'np. Opracować rysunki wykonawcze' });
    var deadline = UI.input({ id: 'tk-deadline', type: 'datetime-local', value: values.deadline, error: problems.deadline });
    var workload = UI.select({
      id: 'tk-workload', value: values.workload || 'medium',
      options: Object.keys(Tasks.WORKLOAD).map(function (key) { return { value: key, label: Tasks.WORKLOAD[key] }; })
    });
    var description = UI.textarea({ id: 'tk-description', value: values.description, placeholder: 'Zakres, ustalenia, odnośniki do rysunków…' });
    var important = UI.checkbox({ id: 'tk-important', checked: !!values.important, label: 'Zadanie ważne', hint: 'Wyróżnia zadanie na liście etapu.' });

    var boxes = {};
    var assignees = people.length
      ? D.el('div', { class: 'choice-list', attrs: { id: 'tk-assignees' } }, [
          D.el('div', { class: 'choice-list__items', attrs: { role: 'group', 'aria-label': 'Realizatorzy' } }, people.map(function (person) {
            var id = 'tk-person-' + person.id;
            var box = UI.checkbox({ id: id, value: person.id, checked: picked.indexOf(person.id) >= 0 });
            boxes[person.id] = box;
            return D.el('label', { class: 'choice-list__item', attrs: { for: id } }, [
              box,
              D.el('span', { class: 'person' }, [
                Avatar.avatar(person, { size: 'sm', tooltip: false }),
                D.el('span', { class: 'truncate', text: Team.fullName(person) })
              ]),
              D.el('span', { class: 'choice-list__meta', text: person.position || '' })
            ]);
          }))
        ])
      : UI.alert({ tone: 'info', text: 'Projekt nie ma jeszcze zespołu. Przypisz osoby w edycji projektu, żeby wskazać realizatorów.' });

    var form = E.Dialog.drawerForm({
      id: 'task-form',
      submitLabel: editing ? 'Zapisz zmiany' : 'Dodaj zadanie',
      onCancel: handlers.onCancel,
      onSubmit: function () {
        handlers.onSubmit({
          id: values.id,
          name: name.value,
          deadline: deadline.value,
          workload: workload.value,
          important: important.querySelector('input').checked,
          description: description.value,
          assignees: Object.keys(boxes).filter(function (id) { return boxes[id].checked; })
        });
      },
      body: [
        D.el('section', { class: 'form__section' }, [
          UI.field({ id: 'tk-name', label: 'Nazwa zadania', required: true, control: name, error: problems.name }),
          D.el('div', { class: 'form__row' }, [
            UI.field({ id: 'tk-deadline', label: 'Termin', optional: true, control: deadline, error: problems.deadline }),
            UI.field({ id: 'tk-workload', label: 'Nakład pracy', control: workload, error: problems.workload })
          ]),
          important
        ]),
        D.el('hr', { class: 'form__divider' }),
        D.el('section', { class: 'form__section' }, [
          D.el('div', { class: 'form__section-head' }, [
            D.el('h3', { class: 'form__section-title', text: 'Realizatorzy' }),
            D.el('p', { class: 'form__section-text', text: 'Każdy realizator domyka własną część; zadanie zamyka się dopiero przez zmianę statusu.' })
          ]),
          assignees,
          problems.assignees ? D.el('p', { class: 'field__error', attrs: { role: 'alert' } }, [E.Icons.icon('alertCircle', 14), D.el('span', { text: problems.assignees })]) : null
        ]),
        D.el('hr', { class: 'form__divider' }),
        UI.field({ id: 'tk-description', label: 'Opis', optional: true, control: description })
      ]
    });

    window.setTimeout(function () { name.focus(); }, 0);
    return form;
  }

  root.ETROM.TaskForm = { taskForm: taskForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
