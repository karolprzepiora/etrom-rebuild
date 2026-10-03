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
  function projectForm(draft, errors, handlers, people, options) {
    var management = !!(options && options.management);
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
    var contract = management ? UI.input({ id: 'pf-contract', value: values.contractValue == null ? '' : String(values.contractValue), error: problems.contractValue, placeholder: 'np. 120000', attrs: { inputmode: 'decimal' } }) : null;
    var status = UI.select({
      id: 'pf-status', value: values.status || 'planned',
      options: Object.keys(Model.PROJECT_STATUS).map(function (key) { return { value: key, label: Model.PROJECT_STATUS[key] }; })
    });

    /* --- rodzaj projektu: z nazwy albo wybrany ręcznie --- */
    var kindSelect = UI.select({
      id: 'pf-kind', value: E.Kinds.isKey(values.kind) ? values.kind : '',
      options: [{ value: '', label: 'Rozpoznaj z nazwy' }].concat(E.Kinds.KINDS.map(function (k) { return { value: k.key, label: k.label }; }))
    });
    var kindHint = D.el('span', { class: 't-meta' });
    function paintKind() { kindHint.textContent = kindSelect.value ? '' : 'Teraz: ' + E.Kinds.label(E.Kinds.detect(name.value)); }
    name.addEventListener('input', paintKind);
    kindSelect.addEventListener('change', paintKind);
    paintKind();

    /* --- kolor projektu: 40 próbek albo automatyczny (z numeru projektu) --- */
    var Id = E.Identity;
    var chosenColor = Id.validIndex(values.color) ? values.color : null;
    var swatchEls = [];
    var autoBtn;
    function paintPicker() {
      var effective = chosenColor === null ? Id.autoIndex(code.value) : chosenColor;
      swatchEls.forEach(function (el, i) {
        var on = chosenColor === i;
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-checked', String(on));
        el.classList.toggle('is-auto', chosenColor === null && i === effective);
      });
      autoBtn.classList.toggle('is-on', chosenColor === null);
      autoBtn.setAttribute('aria-checked', String(chosenColor === null));
    }
    autoBtn = D.el('button', { class: 'colorpick__auto', attrs: { type: 'button', role: 'radio', 'data-fk': 'color-auto' }, text: 'Automatyczny', on: { click: function () { chosenColor = null; paintPicker(); } } });
    var colorPicker = D.el('div', { class: 'colorpick', attrs: { role: 'radiogroup', 'aria-label': 'Kolor projektu' } }, [
      D.el('div', { class: 'colorpick__grid' }, Id.swatches().map(function (sw) {
        var el = D.el('button', {
          class: 'colorpick__sw', style: { '--hue': String(sw.hue), '--tone': String(sw.tone) },
          attrs: { type: 'button', role: 'radio', 'aria-label': 'Kolor ' + (sw.index + 1), 'data-fk': 'color-' + sw.index },
          on: { click: function () { chosenColor = sw.index; paintPicker(); } }
        });
        swatchEls[sw.index] = el;
        return el;
      })),
      autoBtn
    ]);
    code.addEventListener('input', paintPicker);
    paintPicker();

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

    /* --- etapy i budżet godzin (tylko nowy projekt) --- */
    var stageBoxes = {};
    var hourInputs = {};
    var pickedCount = D.el('span', { class: 'grow', attrs: { 'aria-live': 'polite' } });
    var budget = UI.input({ id: 'pf-budget', type: 'number', value: values.budgetHours == null ? '' : String(values.budgetHours), placeholder: 'np. 500', attrs: { min: '0', step: '10', inputmode: 'numeric' } });
    var budgetNote = D.el('div', { class: 'pf-budget__note', attrs: { 'aria-live': 'polite' } });

    function picked() { return Catalog.all.filter(function (entry) { return stageBoxes[entry.id] && stageBoxes[entry.id].checked; }); }
    function hoursOf(id) { var n = Number(String(hourInputs[id].value).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; }

    function refreshCount() {
      var list = picked();
      var sum = list.reduce(function (t, entry) { return t + hoursOf(entry.id); }, 0);
      var total = Number(budget.value);
      pickedCount.textContent = 'Wybrano ' + list.length + ' z ' + Catalog.all.length + (list.length ? ' · ' + F.hours(sum) : '');
      Catalog.all.forEach(function (entry) { hourInputs[entry.id].disabled = !stageBoxes[entry.id].checked; });
      budgetNote.className = 'pf-budget__note';
      if (!list.length) budgetNote.textContent = 'Zaznacz etapy, a podzielę na nie budżet godzin.';
      else if (total > 0 && Math.round(sum) !== Math.round(total)) {
        budgetNote.classList.add('is-off');
        budgetNote.textContent = 'Suma etapów: ' + F.hours(sum) + ' — ' + (sum > total ? 'o ' + F.hours(sum - total) + ' więcej' : 'o ' + F.hours(total - sum) + ' mniej') + ' niż budżet projektu.';
      } else if (total > 0) budgetNote.textContent = 'Suma etapów zgadza się z budżetem projektu: ' + F.hours(sum) + '.';
      else budgetNote.textContent = 'Wpisz budżet projektu, a podzielę go na etapy proporcjonalnie do standardu. Godziny każdego etapu możesz zmienić.';
    }

    /** Dzieli budżet na zaznaczone etapy wg godzin standardu; bez budżetu przywraca wartości standardu. */
    function distribute() {
      var list = picked();
      var total = Number(budget.value);
      if (total > 0 && list.length) {
        var split = Model.distributeHours(total, list.map(function (entry) { return { id: entry.id, weight: entry.defaultHours }; }));
        list.forEach(function (entry) { hourInputs[entry.id].value = String(split[entry.id]); });
      } else list.forEach(function (entry) { hourInputs[entry.id].value = String(entry.defaultHours); });
      refreshCount();
    }

    function setAll(value) {
      Object.keys(stageBoxes).forEach(function (id) { stageBoxes[id].checked = value; });
      distribute();
    }

    budget.addEventListener('input', function () { if (Number(budget.value) > 0) distribute(); else refreshCount(); });

    var stagePicker = D.el('div', { class: 'choice-list', attrs: { id: 'pf-stage-picker' } }, [
      D.el('div', { class: 'choice-list__head' }, [
        pickedCount,
        UI.button({ label: 'Zaznacz wszystkie', variant: 'ghost', size: 'sm', onClick: function () { setAll(true); } }),
        UI.button({ label: 'Wyczyść', variant: 'ghost', size: 'sm', onClick: function () { setAll(false); } })
      ]),
      D.el('div', { class: 'choice-list__items', attrs: { role: 'group', 'aria-label': 'Etapy ze standardu' } }, Catalog.all.map(function (entry) {
        var id = 'pf-stage-' + entry.id;
        var box = UI.checkbox({ id: id, value: entry.id, on: { change: distribute } });
        stageBoxes[entry.id] = box;
        var hours = D.el('input', { class: 'input choice-list__hours', attrs: { type: 'number', min: '0', step: '1', value: String(entry.defaultHours), disabled: 'disabled', 'aria-label': 'Godziny etapu: ' + entry.name, inputmode: 'decimal' }, on: { input: refreshCount, click: function (e) { e.stopPropagation(); } } });
        hourInputs[entry.id] = hours;
        return D.el('label', { class: 'choice-list__item choice-list__item--hours', attrs: { for: id } }, [
          box,
          D.el('span', { class: 'truncate' }, [D.el('span', { class: 'choice-list__no', text: entry.number }), entry.name]),
          D.el('span', { class: 'choice-list__meta' }, [hours, ' h'])
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
        contractValue: contract ? contract.value : undefined,
        color: chosenColor === null ? '' : chosenColor,
        kind: kindSelect.value,
        stageIds: editing ? [] : Object.keys(stageBoxes).filter(function (id) { return stageBoxes[id].checked; }),
        stageHours: editing ? {} : Object.keys(stageBoxes).reduce(function (acc, id) { if (stageBoxes[id].checked) acc[id] = hoursOf(id); return acc; }, {}),
        budgetHours: editing ? undefined : budget.value,
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
        UI.field({ id: 'pf-kind', label: 'Rodzaj projektu', optional: true, control: kindSelect, error: problems.kind, hint: 'Decyduje o grafice na kaflu (jaz, zapora, pompownia…). Domyślnie wynika z nazwy.' }),
        UI.field({ id: 'pf-color', label: 'Kolor projektu', optional: true, control: colorPicker, error: problems.color, hint: 'Ten kolor mają kafel projektu, paski czasu i znaczki. Automatyczny wynika z numeru projektu.' }),
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'pf-client', label: 'Zamawiający', required: true, control: client, error: problems.client }),
          UI.field({ id: 'pf-deadline', label: 'Termin umowy', optional: true, control: deadline, error: problems.deadline })
        ]),
        contract ? UI.field({ id: 'pf-contract', label: 'Wartość umowy, zł netto', optional: true, control: contract, error: problems.contractValue, hint: 'Widoczna tylko dla zarządu; służy do oceny opłacalności w Analizie.' }) : null
      ]),
      D.el('hr', { class: 'form__divider' }),
      section('Zespół', 'Osoba pełniąca funkcję należy do zespołu z urzędu. Tylko zespół może realizować zadania.', teamBody)
    ];

    if (!editing) {
      body.push(D.el('hr', { class: 'form__divider' }));
      body.push(section('Etapy i budżet godzin', 'Wpisz budżet projektu, a podzielę go na wybrane etapy. Etapy spoza standardu dopiszesz po założeniu projektu.', [UI.field({ id: 'pf-budget', label: 'Budżet godzin projektu', optional: true, control: budget, hint: 'Łącznie na wszystkie etapy, np. 500 h.' }), budgetNote, stagePicker]));
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
