/* ETROM — oznaczenie etapu dla zespołu: „budżet na wyczerpaniu” / „budżet przekroczony”.
   Ustawia je lider projektu albo zarząd (jedno kliknięcie przy etapie w Planie); pracownik widzi
   tylko stan i komunikat od człowieka — bez liczb, procentów i bez reakcji na własne wpisy czasu. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;

  var LABEL = { warn: 'Budżet na wyczerpaniu', over: 'Budżet przekroczony' };
  var SHORT = { warn: 'na wyczerpaniu', over: 'przekroczony' };

  function authorOf(flag, people) {
    var p = flag && flag.by != null ? Team.findPerson(people || [], flag.by) : null;
    return p ? Team.fullName(p) : '';
  }
  function dayOf(flag) {
    var m = flag && /^(\d{4})-(\d{2})-(\d{2})/.exec(flag.at || '');
    return m ? m[3] + '.' + m[2] : '';
  }

  /** Treść dymku: stan, kto ustawił, komunikat. */
  function tip(flag, people) {
    if (!flag) return '';
    var who = authorOf(flag, people);
    var when = dayOf(flag);
    return LABEL[flag.state] + (who ? ' · ustawił: ' + who + (when ? ', ' + when : '') : '') + (flag.note ? ' · „' + flag.note + '”' : '');
  }

  /** Mała flaga przy zadaniu (pracownik i lider). */
  function badge(flag, people, options) {
    if (!flag) return null;
    var withText = options && options.text;
    return D.el('span', {
      class: 'bflag bflag--' + flag.state + (withText ? ' bflag--text' : ''),
      attrs: { 'data-tooltip': tip(flag, people), 'aria-label': tip(flag, people), role: 'img', 'data-bflag': flag.state }
    }, [E.Icons.icon('flag', 13), withText ? D.el('span', { text: withText === true ? SHORT[flag.state] : withText }) : null]);
  }

  /** Okienko oznaczania etapu: dwa stany, komunikat, zapis / zdjęcie oznaczenia. */
  function openForm(anchor, project, stage, flag, actions) {
    var state = flag ? flag.state : 'warn';
    var radios = ['warn', 'over'].map(function (key) {
      var input = D.el('input', { attrs: { type: 'radio', name: 'bflag-' + stage.id, value: key, checked: state === key ? 'checked' : null, 'data-fk': 'bflag-' + key } });
      input.addEventListener('change', function () { state = key; });
      return D.el('label', { class: 'bflagform__opt' }, [input, D.el('span', { text: LABEL[key] })]);
    });
    var note = D.el('textarea', { class: 'bflagform__note', attrs: { rows: '3', maxlength: '240', placeholder: 'Np. ustalmy zakres przed kolejnymi zmianami', 'data-fk': 'bflag-note', 'aria-label': 'Komunikat dla zespołu' } });
    note.value = flag ? flag.note : '';
    var name = E.Model.describeStage(stage).name;
    var content = D.el('div', { class: 'bflagform' }, [
      D.el('b', { class: 'bflagform__title', text: 'Oznacz dla zespołu' }),
      D.el('p', { class: 'bflagform__sub t-muted', text: 'Etap „' + name + '” · ' + project.code }),
      D.el('div', { class: 'bflagform__opts', attrs: { role: 'radiogroup', 'aria-label': 'Stan budżetu' } }, radios),
      D.el('label', { class: 'bflagform__lbl t-muted', text: 'Komunikat (opcjonalnie)' }, [note]),
      D.el('p', { class: 'bflagform__hint t-muted', text: 'Widzą osoby przypisane do zadań etapu. Bez liczb i procentów.' }),
      D.el('div', { class: 'bflagform__actions' }, [
        flag ? UI.button({ label: 'Zdejmij', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'bflag-clear' }, onClick: function () { E.Menu.close(); actions.setBudgetFlag(project.id, stage.id, null); } }) : null,
        UI.button({ label: 'Anuluj', variant: 'ghost', size: 'sm', onClick: function () { E.Menu.close(); } }),
        UI.button({ label: 'Zapisz', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'bflag-save' }, onClick: function () { E.Menu.close(); actions.setBudgetFlag(project.id, stage.id, { state: state, note: note.value }); } })
      ])
    ]);
    E.Menu.open({ anchor: anchor, content: content, label: 'Oznacz etap dla zespołu', align: 'end', minWidth: '19rem' });
  }

  E.BudgetFlag = { LABEL: LABEL, SHORT: SHORT, tip: tip, badge: badge, openForm: openForm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
