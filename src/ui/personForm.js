/* ETROM — formularz osoby w panelu bocznym. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDay(iso) { return iso === '1970-01-01' ? 'początku' : iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4); }

  function options(map) {
    return Object.keys(map).map(function (key) { return { value: key, label: map[key] }; });
  }

  /**
   * @param {Object} draft wartości pól (id, firstName, lastName, position, orgRole, cooperation)
   * @param {Object} errors mapa pole → komunikat
   * @param {{onSubmit: Function, onCancel: Function}} handlers
   */
  function personForm(draft, errors, handlers, opts) {
    var management = !!(opts && opts.management);
    var values = draft || {};
    var problems = errors || {};
    var editing = values.id != null;

    var firstName = UI.input({ id: 'pe-first', value: values.firstName, error: problems.firstName, maxlength: 80, placeholder: 'np. Anna', autocomplete: 'given-name' });
    var lastName = UI.input({ id: 'pe-last', value: values.lastName, error: problems.lastName, maxlength: 80, placeholder: 'np. Kowalska', autocomplete: 'family-name' });
    var position = UI.input({ id: 'pe-position', value: values.position, error: problems.position, maxlength: 120, placeholder: 'np. Projektantka hydrotechniczna' });
    var orgRole = UI.select({ id: 'pe-role', options: options(Team.ORG_ROLES), value: values.orgRole || 'member' });
    var cooperation = UI.select({ id: 'pe-coop', options: options(Team.COOPERATION), value: values.cooperation || 'internal' });

    var email = management ? UI.input({ id: 'pe-email', type: 'email', value: values.email, error: problems.email, maxlength: 120, placeholder: 'imie.nazwisko@firma.pl', autocomplete: 'off' }) : null;
    var leave = management ? UI.input({ id: 'pe-leave', type: 'number', value: values.leaveDays == null ? '' : String(values.leaveDays), error: problems.leaveDays, placeholder: '26', attrs: { min: '1', max: '60', step: '1', inputmode: 'numeric' } }) : null;
    var hired = management ? UI.input({ id: 'pe-hired', type: 'date', value: values.hiredAt || '', error: problems.hiredAt }) : null;
    var carry = management ? UI.input({ id: 'pe-carry', type: 'number', value: values.leaveCarryDays == null ? '' : String(values.leaveCarryDays), error: problems.leaveCarryDays, placeholder: '0', attrs: { min: '0', max: '60', step: '1', inputmode: 'numeric' } }) : null;
    var newRate = management ? UI.input({ id: 'pe-rate', type: 'number', value: values.newRate == null ? '' : String(values.newRate), error: problems.newRate, placeholder: 'np. 140', attrs: { min: '0', max: '10000', step: '5', inputmode: 'decimal' } }) : null;
    var rateFrom = management ? UI.input({ id: 'pe-rate-from', type: 'date', value: values.rateFrom || todayIso(), error: problems.rateFrom }) : null;
    var history = (values.rates || []).slice().reverse();
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
          cooperation: cooperation.value,
          email: email ? email.value : values.email,
          leaveDays: leave ? leave.value : values.leaveDays,
          hiredAt: hired ? hired.value : values.hiredAt,
          leaveCarryDays: carry ? carry.value : values.leaveCarryDays,
          newRate: newRate ? newRate.value : '',
          rateFrom: rateFrom ? rateFrom.value : ''
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
          UI.field({ id: 'pe-role', label: 'Rola w organizacji', control: orgRole, error: problems.orgRole, hint: 'Dyrekcja widzi wszystkie projekty, stawki i wnioski urlopowe.' }),
          UI.field({ id: 'pe-coop', label: 'Forma współpracy', control: cooperation, error: problems.cooperation }),
          email ? UI.field({ id: 'pe-email', label: 'E-mail (login)', optional: true, control: email, error: problems.email, hint: 'Pod ten adres założysz konto w zakładce „Konta i role”.' }) : null,
          leave ? UI.field({ id: 'pe-leave', label: 'Wymiar urlopu, dni w roku', optional: true, control: leave, error: problems.leaveDays, hint: 'Puste = 26 dni.' }) : null,
          hired ? UI.field({ id: 'pe-hired', label: 'Data zatrudnienia', optional: true, control: hired, error: problems.hiredAt, hint: 'W roku zatrudnienia wymiar urlopu liczy się proporcjonalnie (1/12 za miesiąc).' }) : null,
          carry ? UI.field({ id: 'pe-carry', label: 'Urlop zaległy na ' + new Date().getFullYear() + ', dni', optional: true, control: carry, error: problems.leaveCarryDays, hint: 'Dni z poprzedniego roku, do wykorzystania do 30 września.' }) : null
        ]),
        management ? D.el('hr', { class: 'form__divider' }) : null,
        management ? D.el('section', { class: 'form__section' }, [
          D.el('div', { class: 'ac-rates' }, [
            D.el('span', { class: 'ac-rates__title', text: 'Stawka godzinowa, widzi tylko dyrekcja' }),
            history.length
              ? D.el('ul', { class: 'ac-rates__list' }, history.map(function (r, i) {
                return D.el('li', null, [D.el('span', { text: 'od ' + fmtDay(r.from) + (i === 0 ? ' (obowiązuje)' : '') }), D.el('b', { class: 't-num', text: String(r.rate).replace('.', ',') + ' zł/h' })]);
              }))
              : D.el('p', { class: 't-meta', text: values.hourlyCost ? 'Stawka bieżąca: ' + String(values.hourlyCost).replace('.', ',') + ' zł/h (bez historii).' : 'Nie ustawiono jeszcze stawki.' })
          ]),
          D.el('div', { class: 'form__row' }, [
            UI.field({ id: 'pe-rate', label: 'Nowa stawka, zł/h', optional: true, control: newRate, error: problems.newRate }),
            UI.field({ id: 'pe-rate-from', label: 'Obowiązuje od', control: rateFrom, error: problems.rateFrom })
          ]),
          D.el('p', { class: 't-meta', text: 'Zapisujemy stawkę z datą, więc wcześniejsze stawki zostają w historii.' })
        ]) : null
      ]
    });

    var target = problems.lastName && !problems.firstName ? lastName : firstName;
    window.setTimeout(function () { target.focus(); }, 0);
    return form;
  }

  var STEPS = ['Dane', 'Rola i rozliczenia', 'Hasło'];

  function stepper(step) {
    return D.el('ol', { class: 'ac-steps', attrs: { 'aria-label': 'Kroki' } }, STEPS.map(function (label, i) {
      var n = i + 1;
      return D.el('li', { class: 'ac-step' + (n === step ? ' is-on' : '') + (n < step ? ' is-done' : ''), attrs: n === step ? { 'aria-current': 'step' } : {} }, [
        D.el('span', { class: 'ac-step__n', text: String(n) }), D.el('span', { text: label })
      ]);
    }));
  }

  function roleCard(value, title, text, on, onPick) {
    return D.el('button', { class: 'ac-role' + (on ? ' is-on' : ''), attrs: { type: 'button', 'aria-pressed': String(on), 'data-role': value }, on: { click: onPick } }, [
      D.el('b', { text: title }), D.el('span', { text: text })
    ]);
  }

  /**
   * Kreator nowej osoby z kontem: dane, rola i rozliczenia, hasło tymczasowe.
   * @param {Object} draft pola osoby + rate (stawka)
   * @param {{step: number, password: string, errors: Object}} state
   * @param {{onBack: Function, onNext: Function, onRegenerate: Function, onSubmit: Function, onCancel: Function}} h
   */
  function wizard(draft, state, h) {
    var v = draft || {};
    var er = state.errors || {};
    var step = state.step || 1;
    var body;
    var read;

    if (step === 1) {
      var fi = UI.input({ id: 'pw-first', value: v.firstName, error: er.firstName, maxlength: 80, placeholder: 'np. Anna', autocomplete: 'off' });
      var la = UI.input({ id: 'pw-last', value: v.lastName, error: er.lastName, maxlength: 80, placeholder: 'np. Kowalska', autocomplete: 'off' });
      var po = UI.input({ id: 'pw-pos', value: v.position, error: er.position, maxlength: 120, placeholder: 'np. Projektantka hydrotechniczna' });
      var em = UI.input({ id: 'pw-email', type: 'email', value: v.email, error: er.email, maxlength: 120, placeholder: 'imie.nazwisko@firma.pl' });
      read = function () { return Object.assign({}, v, { firstName: fi.value, lastName: la.value, position: po.value, email: em.value }); };
      body = [
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'pw-first', label: 'Imię', required: true, control: fi, error: er.firstName }),
          UI.field({ id: 'pw-last', label: 'Nazwisko', required: true, control: la, error: er.lastName })
        ]),
        UI.field({ id: 'pw-pos', label: 'Stanowisko', optional: true, control: po, error: er.position }),
        UI.field({ id: 'pw-email', label: 'E-mail (login)', required: true, control: em, error: er.email, hint: 'Na ten adres zakładamy konto. Osoba loguje się nim w aplikacji.' })
      ];
      window.setTimeout(function () { (er.lastName && !er.firstName ? la : fi).focus(); }, 0);
    } else if (step === 2) {
      var role = v.orgRole || 'member';
      var co = UI.select({ id: 'pw-coop', options: options(Team.COOPERATION), value: v.cooperation || 'internal' });
      var lv = UI.input({ id: 'pw-leave', type: 'number', value: v.leaveDays == null ? '' : String(v.leaveDays), error: er.leaveDays, placeholder: '26', attrs: { min: '1', max: '60', step: '1', inputmode: 'numeric' } });
      var rt = UI.input({ id: 'pw-rate', type: 'number', value: v.newRate == null ? '' : String(v.newRate), error: er.newRate, placeholder: 'np. 140', attrs: { min: '0', max: '10000', step: '5', inputmode: 'decimal' } });
      var cards = D.el('div', { class: 'ac-roles', attrs: { role: 'group', 'aria-label': 'Rola w organizacji' } });
      function paint() {
        D.render(cards, [
          roleCard('member', 'Pracownik', 'Swoje zadania, własny czas, terminy i sprawy. Bez godzin planu, budżetów i stawek.', role === 'member', function () { role = 'member'; paint(); }),
          roleCard('managing', 'Dyrekcja', 'Pełny dostęp do wszystkich projektów, budżetów, stawek i wniosków urlopowych.', role === 'managing', function () { role = 'managing'; paint(); })
        ]);
      }
      paint();
      read = function () { return Object.assign({}, v, { orgRole: role, cooperation: co.value, leaveDays: lv.value, newRate: rt.value }); };
      body = [
        cards,
        D.el('div', { class: 'form__row' }, [
          UI.field({ id: 'pw-coop', label: 'Forma współpracy', control: co }),
          UI.field({ id: 'pw-leave', label: 'Wymiar urlopu, dni w roku', optional: true, control: lv, error: er.leaveDays, hint: 'Puste = 26 dni.' })
        ]),
        UI.field({ id: 'pw-rate', label: 'Stawka godzinowa, zł/h', optional: true, control: rt, error: er.newRate, hint: 'Widzi tylko dyrekcja. Obowiązuje od dziś, kolejne zmiany zapiszesz z datą.' }),
        D.el('p', { class: 't-meta', text: 'Lider i koordynator to funkcje w projekcie. Przypiszesz je przy zespole projektu, nie tutaj.' })
      ];
    } else {
      read = function () { return v; };
      body = [
        D.el('div', { class: 'secret secret--inline' }, [
          D.el('span', { class: 'secret__label', text: 'Hasło tymczasowe (widoczne tylko teraz)' }),
          D.el('div', { class: 'secret__row' }, [
            D.el('code', { class: 'secret__value', text: state.password, attrs: { 'data-secret': '' } }),
            UI.button({ label: 'Kopiuj', variant: 'secondary', size: 'sm', onClick: function () { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(state.password).catch(function () {}); } }),
            UI.button({ label: 'Nowe', variant: 'secondary', size: 'sm', attrs: { 'data-regenerate': '' }, onClick: h.onRegenerate })
          ])
        ]),
        D.el('p', { class: 'ac-note' }, [
          D.el('b', { text: (v.firstName || 'Osoba') + ' zmieni hasło przy pierwszym logowaniu. ' }),
          document.createTextNode('Po zamknięciu tego panelu nie zobaczysz już hasła. W razie potrzeby ustawisz nowe tymczasowe w zakładce „Konta i role”.')
        ]),
        D.el('p', { class: 't-meta', text: 'Konto: ' + (v.email || '') + '. Dane logowania przekaż osobie sam. Wysyłka e-mailem pojawi się po przejściu na serwer.' })
      ];
    }

    var foot = [
      D.el('span', { class: 'drawer__foot-hint' }, [D.el('span', { text: 'Krok ' + step + ' z 3' })]),
      step === 1 ? UI.button({ label: 'Anuluj', variant: 'secondary', onClick: h.onCancel }) : UI.button({ label: 'Wstecz', variant: 'secondary', attrs: { 'data-wiz-back': '' }, onClick: function () { h.onBack(read()); } }),
      step < 3
        ? UI.button({ label: 'Dalej', variant: 'primary', type: 'submit', attrs: { 'data-wiz-next': '' } })
        : UI.button({ label: 'Utwórz konto', variant: 'primary', type: 'submit', attrs: { 'data-wiz-create': '' } })
    ];
    return D.el('form', {
      class: 'drawer__form', attrs: { id: 'person-wizard', novalidate: true },
      on: { submit: function (e) { e.preventDefault(); if (step < 3) h.onNext(read()); else h.onSubmit(read()); } }
    }, [
      D.el('div', { class: 'drawer__body' }, [D.el('div', { class: 'form' }, [stepper(step)].concat(body))]),
      D.el('div', { class: 'drawer__foot' }, foot)
    ]);
  }

  root.ETROM.PersonForm = { personForm: personForm, wizard: wizard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
