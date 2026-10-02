/* ETROM — formularz projektu. Mieszka w panelu bocznym, więc nagłówek
   zapewnia panel, a formularz zajmuje się wyłącznie polami. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Model = root.ETROM.Model;
  var Catalog = root.ETROM.Catalog;
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
  function projectForm(draft, errors, handlers, people) {
    var values = draft || {};
    var problems = errors || {};
    var editing = values.id != null;
    var roster = (people || []).filter(function (person) {
      // Wyłączona osoba zostaje na liście tylko wtedy, gdy już pełni funkcję.
      return person.active !== false || Team.projectPeople(values.team).indexOf(person.id) >= 0;
    });

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

    // Wybór etapów: domyślnie żaden, bo niewiele projektów obejmuje całość
    // standardu. Jedno kliknięcie zaznacza komplet.
    var stageBoxes = {};
    var pickedCount = D.el('span', { class: 'picker__count' });

    function refreshCount() {
      var picked = Object.keys(stageBoxes).filter(function (id) { return stageBoxes[id].checked; });
      pickedCount.textContent = 'wybrano ' + picked.length + ' z ' + Catalog.all.length;
    }

    function setAll(value) {
      Object.keys(stageBoxes).forEach(function (id) { stageBoxes[id].checked = value; });
      refreshCount();
    }

    var stagePicker = D.el('div', { class: 'picker', attrs: { id: 'pf-stage-picker' } }, [
      D.el('div', { class: 'picker__head' }, [
        D.el('span', { class: 'label', text: 'Etapy projektu' }),
        pickedCount,
        D.el('button', {
          class: 'btn btn--small btn--ghost', text: 'Zaznacz wszystkie',
          attrs: { type: 'button' }, on: { click: function () { setAll(true); } }
        }),
        D.el('button', {
          class: 'btn btn--small btn--ghost', text: 'Wyczyść',
          attrs: { type: 'button' }, on: { click: function () { setAll(false); } }
        })
      ]),
      D.el('ul', { class: 'picker__list' }, Catalog.all.map(function (entry) {
        var box = D.el('input', {
          attrs: { id: 'pf-stage-' + entry.id, type: 'checkbox', value: entry.id },
          on: { change: refreshCount }
        });
        stageBoxes[entry.id] = box;
        return D.el('li', { class: 'picker__item' }, [
          box,
          D.el('label', { attrs: { for: 'pf-stage-' + entry.id } }, [
            D.el('span', { class: 'picker__no', text: entry.number }),
            D.el('span', { class: 'picker__name', text: entry.name }),
            D.el('span', { class: 'picker__hours', text: entry.defaultHours + ' h' })
          ])
        ]);
      })),
      D.el('p', {
        class: 'field__hint',
        text: 'Etapy spoza standardu dopiszesz w projekcie po jego założeniu.'
      })
    ]);

    refreshCount();

    var team = values.team || Team.emptyTeam();
    var functionSelects = {};
    var memberBoxes = {};

    function personOptions(selected) {
      return [D.el('option', { text: '— nie przypisano —', attrs: { value: '' } })].concat(
        roster.map(function (person) {
          return D.el('option', {
            text: Team.fullName(person) + (person.position ? ' · ' + person.position : ''),
            attrs: { value: person.id, selected: selected === person.id }
          });
        })
      );
    }

    var teamSection = roster.length
      ? D.el('div', { class: 'picker', attrs: { id: 'pf-team-picker' } }, [
          D.el('div', { class: 'picker__head' }, [
            D.el('span', { class: 'label', text: 'Funkcje w projekcie' })
          ]),
          D.el('div', { class: 'form__grid' }, Team.FUNCTIONS.map(function (fn) {
            var id = 'pf-fn-' + fn.key;
            var control = D.el('select', { class: 'select', attrs: { id: id } }, personOptions(team[fn.key]));
            functionSelects[fn.key] = control;
            return field(id, fn.label, control);
          })),
          D.el('span', { class: 'label', text: 'Pozostali członkowie zespołu' }),
          D.el('ul', { class: 'picker__list' }, roster.map(function (person) {
            var id = 'pf-member-' + person.id;
            var box = D.el('input', {
              attrs: Object.assign(
                { id: id, type: 'checkbox', value: person.id },
                (team.members || []).indexOf(person.id) >= 0 ? { checked: true } : {}
              )
            });
            memberBoxes[person.id] = box;
            return D.el('li', { class: 'picker__item' }, [
              box,
              D.el('label', { attrs: { for: id } }, [
                D.el('span', { class: 'picker__name', text: Team.fullName(person) }),
                D.el('span', { class: 'picker__hours', text: Team.ORG_ROLES[person.orgRole] })
              ])
            ]);
          })),
          D.el('p', {
            class: 'field__hint',
            text: 'Osoba pełniąca funkcję należy do zespołu z urzędu — nie trzeba jej zaznaczać.'
          })
        ])
      : D.el('p', {
          class: 'field__hint',
          text: 'Katalog osób jest pusty. Dodaj osoby na ekranie Zespół, żeby przypisać funkcje.'
        });

    function collectTeam() {
      var result = Team.emptyTeam();
      Object.keys(functionSelects).forEach(function (key) {
        result[key] = functionSelects[key].value;
      });
      result.members = Object.keys(memberBoxes).filter(function (id) { return memberBoxes[id].checked; });
      return result;
    }

    function collect() {
      return {
        id: values.id,
        code: codeInput.value,
        name: nameInput.value,
        client: clientInput.value,
        status: statusSelect.value,
        deadline: deadlineInput.value,
        stageIds: editing ? [] : Object.keys(stageBoxes).filter(function (id) { return stageBoxes[id].checked; }),
        team: collectTeam()
      };
    }

    var form = D.el('form', {
      class: 'form',
      attrs: { id: 'project-form', novalidate: true },
      on: {
        submit: function (event) {
          event.preventDefault();
          handlers.onSubmit(collect());
        }
      }
    }, [
      D.el('div', { class: 'form__grid' }, [
        field('pf-code', 'Kod projektu', codeInput, problems.code, 'Musi być niepowtarzalny.'),
        field('pf-name', 'Nazwa', nameInput, problems.name),
        field('pf-client', 'Zamawiający', clientInput, problems.client),
        field('pf-status', 'Status', statusSelect, problems.status),
        field('pf-deadline', 'Termin umowy', deadlineInput, problems.deadline, 'Pole opcjonalne.')
      ]),
      teamSection,
      !editing && stagePicker,
      D.el('div', { class: 'form__actions' }, [
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
    ].filter(Boolean));

    window.setTimeout(function () { codeInput.focus(); }, 0);
    return form;
  }

  root.ETROM.ProjectForm = { projectForm: projectForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
