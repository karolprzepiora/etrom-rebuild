/* ETROM — Biblioteka: lista wszystkich typowych zadań biura, pogrupowana wg etapów.
   Plan wstępny podpowiada z niej zadania. Zmiany zapisują się od razu; edytuje zarząd. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var L = E.Library;
  var Catalog = E.Catalog;

  function pct(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

  function taskRow(stage, name, index, editable, a) {
    if (!editable) return D.el('li', { class: 'lb-task' }, [D.el('span', { class: 'truncate', text: name })]);
    var input = UI.input({
      id: 'lb-t-' + stage.id + '-' + index, value: name, maxlength: 120,
      attrs: { 'aria-label': 'Zadanie w etapie ' + stage.name, 'data-fk': 'lb-t-' + stage.id + '-' + index },
      on: { change: function () { a.libRenameTask(stage.id, index, input.value); } }
    });
    return D.el('li', { class: 'lb-task' }, [
      input,
      UI.iconButton({ icon: 'trash', label: 'Usuń z biblioteki: ' + name, size: 'sm', tone: 'danger', attrs: { 'data-fk': 'lb-del-' + stage.id + '-' + index }, onClick: function () { a.libRemoveTask(stage.id, index); } })
    ]);
  }

  function stageTile(stage, editable, a) {
    var names = L.forStage(stage.id).map(function (t) { return t.name; });
    var add = editable ? UI.input({
      id: 'lb-add-' + stage.id, placeholder: 'Dodaj zadanie i naciśnij Enter',
      attrs: { 'aria-label': 'Nowe zadanie w etapie ' + stage.name, 'data-fk': 'lb-add-' + stage.id },
      on: { keydown: function (e) { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); a.libAddTask(stage.id, add.value); } } }
    }) : null;
    return D.el('section', { class: 'lb-stage', dataset: { stageId: stage.id } }, [
      D.el('div', { class: 'lb-stage__head' }, [
        D.el('span', { class: 't-num t-muted', text: stage.number }),
        D.el('h3', { class: 'lb-stage__name truncate', text: stage.name }),
        stage.kind === 'decision' ? D.el('span', { class: 'bp-tag', text: 'postępowanie' }) : null
      ]),
      D.el('ul', { class: 'lb-tasks' }, names.length ? names.map(function (n, i) { return taskRow(stage, n, i, editable, a); }) : [D.el('li', { class: 't-muted', text: 'Brak zadań w standardzie.' })]),
      editable ? D.el('div', { class: 'lb-stage__foot' }, [
        add,
        L.isCustomized(stage.id) && L.defaultTasks(stage.id).map(function (t) { return t.name; }).join('|') !== names.join('|')
          ? UI.button({ label: 'Przywróć zadania standardowe', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'lb-reset-' + stage.id }, onClick: function () { a.libResetTasks(stage.id); } }) : null
      ]) : null
    ]);
  }

  /** @returns {{summary:string, body:Node}} */
  function view(state, ctx) {
    var editable = !!E.Budget.isManagement(state.prefs.me, state.workspace.people || []);
    var a = ctx.actions;
        var total = Catalog.all.reduce(function (t, e) { return t + L.forStage(e.id).length; }, 0);
    var bar = D.el('div', { class: 'lb-bar' }, [
      D.el('span', { class: 'lb-bar__sum' }, [D.el('span', { class: 't-num', text: String(total) }), D.el('span', { class: 't-muted', text: ' zadań w bibliotece' })]),
      !editable ? D.el('span', { class: 't-muted', text: 'Bibliotekę zmienia zarząd.' }) : null
    ]);
    return {
      summary: 'Wszystkie typowe zadania biura wg etapów. Dopisuj nowe, a Plan wstępny je podpowie.',
      body: D.el('div', { class: 'lb' }, [bar, D.el('div', { class: 'lb-grid' }, Catalog.all.map(function (stage) { return stageTile(stage, editable, a); }))])
    };
  }

  root.ETROM.LibraryScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
