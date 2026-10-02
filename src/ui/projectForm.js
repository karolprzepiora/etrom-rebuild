/* ETROM — formularz projektu w panelu bocznym.
   Trzy sekcje: dane umowy, zespół, etapy (tylko przy zakładaniu).
   Pola wymagane oznaczone gwiazdką, błędy przy polu, akcje w stopce panelu. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Model = E.Model;
  var Catalog = E.Catalog;
  var Team = E.Team;
  var F = E.Format;

  function section(title, text, children) {
    return D.el('section', { class: 'form__section' }, [
      D.el('div', { class: 'form__section-head' }, [
        D.el('h3', { class: 'form__section-title', text: title }),
        text ? D.el('p', { class: 'form__section-text', text: text }) : null
      ])
    ].concat(children));
  }

  /**
   * @param {Object} draft wartości pól (id, code, name, client, status, deadline, team)
   * @param {Object} errors mapa pole → komunikat
   * @param {{onSubmit: Function, onCancel: Function}} handlers
   * @param {Array} people katalog osób
   */
  function projectForm(draft, errors, handlers, people) {
    var values = draft || {};
    var problems = errors || {};
    var editing = values.id != null;
    var roster = (people || []).filter(function (person) {
      // Osoba wyłączona zostaje na liście tylko wtedy, gdy już pełni funkcję.
      return person.active !== false || Team.projectPeople(values.team).indexOf(person.id) >= 0;
    });

    var code = UI.input({ id: 'pf-code', value: values.code, error: problems.code, maxlength: 50, placeholder: 'np. 2601', attrs: { spellcheck: 'false' } });
    var name = UI.input({ id: 'pf-name', value: values.name, error: problems.name, maxlength: 200, placeholder: 'np. Przebudowa przepustu w Lipnicy' });
    var client = UI.input({ id: 'pf-client', value: values.client, error: problems.client, maxlength: 200, placeholder: 'np. Gmina Lipnica' });
    var deadline = UI.input({ id: 'pf-deadline', type: 'date', value: values.deadline, error: problems.deadline });
    var status = UI.select({
      id: 'pf-status', value: values.status || 'planned',
      options: Object.keys(Model.PROJECT_STATUS).map(function (key) { return { value: key, label: Model.PROJECT_STATUS[key] }; })
    });

    /* --- zespół --- */
    var team = values.team || Team.emptyTeam();
    var functionSelects = {};
    var memberBoxes = {};

    var teamBody;
    if (roster.length) {
      var personOptions = [{ value: '', label: 'Nie przypisano' }].concat(roster.map(function (person) {
        return { value: person.id, label: Team.fullName(person) + (person.position ? ' — ' + person.position : '') };
      }));
      teamBody = [
        D.el('div', { class: 'form__row', attrs: { id: 'pf-team-picker' } }, Team.FUNCTIONS.map(function (fn) {
          var id = 'pf-fn-' + fn.key;
          var control = UI.select({ id: id, options: personOptions, value: team[fn.key] || '' });
          functionSelects[fn.key] = control;
          return UI.field({ id: id, label: fn.label, control: control });
        })),
        D.el('div', { class: 'choice-list' }, [
          D.el('div', { class: 'choice-list__head' }, [D.el('span', { class: 'grow', text: 'Pozostali członkowie zespołu' })]),
          D.el('div', { class: 'choice-list__items', attrs: { role: 'group', 'aria-label': 'Pozostali członkowie zespołu' } }, roster.map(function (person) {
            var id = 'pf-member-' + person.id;
            var box = UI.checkbox({ id: id, value: person.id, checked: (team.members || []).indexOf(person.id) >= 0 });
            memberBoxes[person.id] = box;
            return D.el('label', { class: 'choice-list__item', attrs: { for: id } }, [
              box,
              D.el('span', { class: 'truncate', text: Team.fullName(person) }),
              D.el('span', { class: 'choice-list__meta', text: person.position || Team.ORG_ROLES[person.orgRole] })
            ]);
          }))
        ])
      ];
    } else {
      teamBody = [UI.alert({ tone: 'info', text: 'Katalog osób jest pusty. Dodaj osoby na ekranie Zespół, a potem przypisz im funkcje.' })];
    }

    /* --- etapy (tylko nowy projekt) --- */
    var stageBoxes = {};
    var pickedCount = D.el('span', { class: 'grow', attrs: { 'aria-live': 'polite' } });

    function refreshCount() {
      var picked = Object.keys(stageBoxes).filter(function (id) { return stageBoxes[id].checked; });
      var hours = Catalog.all.filter(function (entry) { return stageBoxes[entry.id] && stageBoxes[entry.id].checked; })
        .reduce(function (sum, entry) { return sum + entry.defaultHours; }, 0);
      pickedCount.textContent = 'Wybrano ' + picked.length + ' z ' + Catalog.all.length + (picked.length ? ' · ' + F.hours(hours) : '');
    }

    function setAll(value) {
      Object.keys(stageBoxes).forEach(function (id) { stageBoxes[id].checked = value; });
      refreshCount();
    }

    var stagePicker = D.el('div', { class: 'choice-list', attrs: { id: 'pf-stage-picker' } }, [
      D.el('div', { class: 'choice-list__head' }, [
        pickedCount,
        UI.button({ label: 'Zaznacz wszystkie', variant: 'ghost', size: 'sm', onClick: function () { setAll(true); } }),
        UI.button({ label: 'Wyczyść', variant: 'ghost', size: 'sm', onClick: function () { setAll(false); } })
      ]),
      D.el('div', { class: 'choice-list__items', attrs: { role: 'group', 'aria-label': 'Etapy ze standardu' } }, Catalog.all.map(function (entry) {
        var id = 'pf-stage-' + entry.id;
        var box = UI.checkbox({ id: id, value: entry.id, on: { change: refreshCount } });
        stageBoxes[entry.id] = box;
        return D.el('label', { class: 'choice-list__item', attrs: { for: id } }, [
          box,
          D.el('span', { class: 'truncate' }, [D.el('span', { class: 'choice-list__no', text: entry.number }), entry.name]),
          D.el('span', { class: 'choice-list__meta', text: F.hours(entry.defaultHours) })
        ]);
      }))
    ]);
    refreshCount();

    function collect() {
      var resultTeam = Team.emptyTeam();
      Object.keys(functionSelects).forEach(function (key) { resultTeam[key] = functionSelects[key].value; });
      resultTeam.members = Object.keys(memberBoxes).filter(function (id) { return memberBoxes[id].checked; });
      return {
        id: values.id,
        code: code.value,
        name: name.value,
        client: client.value,
        status: status.value,
        deadline: deadline.value,
        stageIds: editing ? [] : Object.keys(stageBoxes).filter(function (id) { return stageBoxes[id].checked; }),
        team: resultTeam
      };
    }

    var body = [
      section('Dane umowy', null, [
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'pf-code', label: 'Kod projektu', required: true, control: code, error: problems.code, hint: 'Numer roczny: rok i kolejny numer (2601, 2602…). Niepowtarzalny w biurze.' }),
          UI.field({ id: 'pf-status', label: 'Status', control: status, error: problems.status })
        ]),
        UI.field({ id: 'pf-name', label: 'Nazwa', required: true, control: name, error: problems.name }),
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'pf-client', label: 'Zamawiający', required: true, control: client, error: problems.client }),
          UI.field({ id: 'pf-deadline', label: 'Termin umowy', optional: true, control: deadline, error: problems.deadline })
        ])
      ]),
      D.el('hr', { class: 'form__divider' }),
      section('Zespół', 'Osoba pełniąca funkcję należy do zespołu z urzędu. Tylko zespół może realizować zadania.', teamBody)
    ];

    if (!editing) {
      body.push(D.el('hr', { class: 'form__divider' }));
      body.push(section('Etapy', 'Niewiele projektów obejmuje cały standard. Etapy spoza standardu dopiszesz po założeniu projektu.', [stagePicker]));
    }

    var form = E.Dialog.drawerForm({
      id: 'project-form',
      body: body,
      submitLabel: editing ? 'Zapisz zmiany' : 'Utwórz projekt',
      onSubmit: function () { handlers.onSubmit(collect()); },
      onCancel: handlers.onCancel
    });

    var firstError = ['code', 'name', 'client', 'deadline'].filter(function (key) { return problems[key]; })[0];
    var focusTarget = { code: code, name: name, client: client, deadline: deadline }[firstError] || code;
    window.setTimeout(function () { focusTarget.focus(); }, 0);
    return form;
  }

  root.ETROM.ProjectForm = { projectForm: projectForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
