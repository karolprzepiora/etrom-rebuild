/* ETROM — uruchomienie aplikacji i obsługa zdarzeń.
   Ten plik łączy stan z widokiem. Cała logika liczenia siedzi w src/core. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Model = E.Model;
  var Query = E.Query;
  var Catalog = E.Catalog;
  var Progress = E.Progress;

  var storage = E.Storage.createStorage();
  var store = E.Store.createStore({
    workspace: Model.emptyWorkspace(),
    filters: { query: '', status: 'all', sort: 'deadline' },
    form: null,
    expanded: {},
    notice: ''
  });

  var nodes = {};
  var lastForm = null;
  var lastWorkspace = null;

  /* ---------- operacje na danych ---------- */

  function setWorkspace(producer) {
    store.update(function (state) {
      var projects = producer(state.workspace.projects);
      return Object.assign({}, state, {
        workspace: { version: Model.WORKSPACE_VERSION, projects: projects }
      });
    });
  }

  function mapProject(id, change) {
    setWorkspace(function (projects) {
      return projects.map(function (project) {
        return project.id === id ? change(project) : project;
      });
    });
  }

  /* ---------- obsługa formularza ---------- */

  function openCreate() {
    store.set({ form: { draft: { status: 'planned' }, errors: {} } });
  }

  function openEdit(id) {
    var project = store.getState().workspace.projects.filter(function (p) { return p.id === id; })[0];
    if (!project) return;
    store.set({
      form: {
        draft: {
          id: project.id,
          code: project.code,
          name: project.name,
          client: project.client,
          status: project.status,
          deadline: project.deadline
        },
        errors: {}
      }
    });
  }

  function closeForm() {
    store.set({ form: null });
  }

  function submitForm(values) {
    var state = store.getState();
    var projects = state.workspace.projects;
    var editing = values.id != null;
    var check = Model.validateProject(values, projects, editing ? values.id : undefined);

    if (!check.valid) {
      store.set({ form: { draft: values, errors: check.errors } });
      return;
    }

    if (editing) {
      mapProject(values.id, function (project) {
        return Object.assign({}, project, check.value);
      });
    } else {
      var stages = values.withStages
        ? Catalog.all.map(function (entry) { return Model.createStage(entry.id); })
        : [];
      setWorkspace(function (list) {
        return list.concat([Model.createProject(
          Object.assign({}, check.value, { stages: stages }),
          list
        )]);
      });
    }

    closeForm();
  }

  /* ---------- projekty i etapy ---------- */

  function deleteProject(id) {
    var project = store.getState().workspace.projects.filter(function (p) { return p.id === id; })[0];
    if (!project) return;
    if (!window.confirm('Usunąć projekt „' + project.name + '” wraz z etapami?')) return;
    setWorkspace(function (projects) {
      return projects.filter(function (p) { return p.id !== id; });
    });
  }

  function toggleExpand(id) {
    store.update(function (state) {
      var expanded = Object.assign({}, state.expanded);
      if (expanded[id]) delete expanded[id];
      else expanded[id] = true;
      return Object.assign({}, state, { expanded: expanded });
    });
  }

  function cycleStage(projectId, stageId) {
    mapProject(projectId, function (project) {
      return Object.assign({}, project, {
        stages: project.stages.map(function (stage) {
          return stage.id === stageId
            ? Object.assign({}, stage, { status: Model.cycleStageStatus(stage.status) })
            : stage;
        })
      });
    });
  }

  function addStage(projectId, catalogId) {
    if (!catalogId) return;
    mapProject(projectId, function (project) {
      if (project.stages.some(function (s) { return s.id === catalogId; })) return project;
      var added = project.stages.concat([Model.createStage(catalogId)]);
      // Kolejność zgodna z katalogiem, nie z kolejnością dodawania.
      added.sort(function (a, b) {
        return Catalog.find(a.id).number.localeCompare(Catalog.find(b.id).number);
      });
      return Object.assign({}, project, { stages: added });
    });
  }

  function removeStage(projectId, stageId) {
    mapProject(projectId, function (project) {
      return Object.assign({}, project, {
        stages: project.stages.filter(function (s) { return s.id !== stageId; })
      });
    });
  }

  /* ---------- dane testowe ---------- */

  function demoDate(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + offsetDays);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  var DEMO = [
    { code: 'DEMO-001', name: 'Przebudowa przepustu w Lipnicy', client: 'Gmina Lipnica', status: 'active', deadline: demoDate(21), done: 5, working: 2 },
    { code: 'DEMO-002', name: 'Regulacja rzeki Białka — odcinek III', client: 'Wody Polskie RZGW', status: 'active', deadline: demoDate(-6), done: 9, working: 1 },
    { code: 'DEMO-003', name: 'Zbiornik retencyjny Dąbrowa', client: 'Starostwo Powiatowe', status: 'planned', deadline: demoDate(120), done: 0, working: 0 },
    { code: 'DEMO-004', name: 'Modernizacja stacji pomp Rudnik', client: 'Spółka Wodna Rudnik', status: 'paused', deadline: demoDate(60), done: 3, working: 0 },
    { code: 'DEMO-005', name: 'Dokumentacja wałów w Zarzeczu', client: 'Urząd Miasta', status: 'done', deadline: demoDate(-40), done: 14, working: 0 }
  ];

  function loadDemo() {
    setWorkspace(function (projects) {
      var result = projects.slice();
      DEMO.forEach(function (row) {
        if (result.some(function (p) { return p.code.toUpperCase() === row.code; })) return;
        var stages = Catalog.all.map(function (entry, index) {
          var stage = Model.createStage(entry.id, { deadline: demoDate(index * 10 - 20) });
          if (index < row.done) stage.status = 'done';
          else if (index < row.done + row.working) stage.status = 'working';
          return stage;
        });
        result = result.concat([Model.createProject({
          code: row.code,
          name: row.name,
          client: row.client,
          status: row.status,
          deadline: row.deadline,
          stages: stages
        }, result)]);
      });
      return result;
    });
  }

  function clearAll() {
    if (!window.confirm('Usunąć wszystkie projekty z tego urządzenia?')) return;
    store.update(function (state) {
      return Object.assign({}, state, {
        workspace: Model.emptyWorkspace(),
        expanded: {},
        form: null
      });
    });
  }

  /* ---------- kopia JSON ---------- */

  function exportJson() {
    var data = JSON.stringify(store.getState().workspace, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = D.el('a', { attrs: { href: url, download: 'etrom-kopia.json' } });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = Model.normalizeWorkspace(JSON.parse(String(reader.result)));
        store.update(function (state) {
          return Object.assign({}, state, {
            workspace: parsed,
            expanded: {},
            form: null,
            notice: 'Wczytano kopię: ' + parsed.projects.length + ' projektów.'
          });
        });
      } catch (error) {
        store.set({ notice: 'Plik nie jest poprawną kopią ETROM.' });
      }
    };
    reader.readAsText(file);
  }

  /* ---------- widok ---------- */

  var handlers = {
    onToggle: toggleExpand,
    onEdit: openEdit,
    onDelete: deleteProject,
    onCycleStage: cycleStage,
    onAddStage: addStage,
    onRemoveStage: removeStage
  };

  function buildToolbar() {
    var search = D.el('input', {
      class: 'input',
      attrs: { id: 'tb-search', type: 'search', placeholder: 'Kod, nazwa lub zamawiający' },
      on: {
        input: function () {
          store.update(function (state) {
            return Object.assign({}, state, {
              filters: Object.assign({}, state.filters, { query: search.value })
            });
          });
        }
      }
    });

    var statusSelect = D.el('select', {
      class: 'select',
      attrs: { id: 'tb-status' },
      on: {
        change: function () {
          store.update(function (state) {
            return Object.assign({}, state, {
              filters: Object.assign({}, state.filters, { status: statusSelect.value })
            });
          });
        }
      }
    }, [D.el('option', { text: 'Wszystkie statusy', attrs: { value: 'all' } })].concat(
      Object.keys(Model.PROJECT_STATUS).map(function (key) {
        return D.el('option', { text: Model.PROJECT_STATUS[key], attrs: { value: key } });
      })
    ));

    var sortSelect = D.el('select', {
      class: 'select',
      attrs: { id: 'tb-sort' },
      on: {
        change: function () {
          store.update(function (state) {
            return Object.assign({}, state, {
              filters: Object.assign({}, state.filters, { sort: sortSelect.value })
            });
          });
        }
      }
    }, Object.keys(Query.SORTS).map(function (key) {
      return D.el('option', { text: Query.SORTS[key], attrs: { value: key } });
    }));

    nodes.count = D.el('p', { class: 'toolbar__count', attrs: { 'data-count': '' } });

    D.render(nodes.toolbar, [
      D.el('div', { class: 'toolbar__field', style: { flex: '1 1 260px' } }, [
        D.el('label', { class: 'toolbar__label', text: 'Szukaj', attrs: { for: 'tb-search' } }),
        search
      ]),
      D.el('div', { class: 'toolbar__field' }, [
        D.el('label', { class: 'toolbar__label', text: 'Status', attrs: { for: 'tb-status' } }),
        statusSelect
      ]),
      D.el('div', { class: 'toolbar__field' }, [
        D.el('label', { class: 'toolbar__label', text: 'Sortowanie', attrs: { for: 'tb-sort' } }),
        sortSelect
      ]),
      nodes.count
    ]);
  }

  function renderNotice(state) {
    var hasNotice = !!state.notice;
    nodes.notice.className = 'notice' + (hasNotice ? '' : ' notice--hidden');
    nodes.notice.textContent = state.notice || '';
  }

  function renderForm(state) {
    if (state.form === lastForm) return;
    lastForm = state.form;
    if (!state.form) {
      D.clear(nodes.form);
      return;
    }
    D.render(nodes.form, [
      E.ProjectForm.projectForm(state.form.draft, state.form.errors, {
        onSubmit: submitForm,
        onCancel: closeForm
      })
    ]);
  }

  function renderList(state) {
    var all = state.workspace.projects;
    var visible = Query.filterAndSort(all, state.filters);

    nodes.count.textContent = all.length === visible.length
      ? 'Projekty: ' + all.length
      : 'Pokazano ' + visible.length + ' z ' + all.length;

    var overdue = all.filter(function (p) { return Progress.isOverdue(p); }).length;
    nodes.summary.textContent = overdue
      ? 'Projekty po terminie: ' + overdue
      : 'Brak projektów po terminie';

    if (!all.length) {
      D.render(nodes.list, [
        D.el('div', { class: 'empty' }, [
          D.el('p', { class: 'empty__title', text: 'Brak projektów' }),
          D.el('p', {
            class: 'empty__text',
            text: 'Dodaj pierwszy projekt albo wczytaj zestaw danych testowych, żeby zobaczyć, jak działa lista, etapy i postęp.'
          }),
          D.el('div', { class: 'project-card__actions' }, [
            D.el('button', {
              class: 'btn btn--primary', text: 'Nowy projekt',
              attrs: { type: 'button' }, on: { click: openCreate }
            }),
            D.el('button', {
              class: 'btn', text: 'Dodaj dane testowe',
              attrs: { type: 'button' }, on: { click: loadDemo }
            })
          ])
        ])
      ]);
      return;
    }

    if (!visible.length) {
      D.render(nodes.list, [
        D.el('div', { class: 'empty' }, [
          D.el('p', { class: 'empty__title', text: 'Brak wyników' }),
          D.el('p', { class: 'empty__text', text: 'Żaden projekt nie odpowiada ustawionym filtrom.' })
        ])
      ]);
      return;
    }

    D.render(nodes.list, [
      D.el('div', { class: 'projects-grid' }, visible.map(function (project) {
        return E.ProjectCard.projectCard(project, { expanded: !!state.expanded[project.id] }, handlers);
      }))
    ]);
  }

  function persist(state) {
    if (state.workspace === lastWorkspace) return;
    lastWorkspace = state.workspace;
    var result = storage.save(state.workspace);
    nodes.save.textContent = result.ok
      ? 'Zapisano na tym urządzeniu'
      : 'Zapis lokalny niedostępny';
  }

  function renderAll(state) {
    renderNotice(state);
    renderForm(state);
    renderList(state);
    persist(state);
  }

  /* ---------- start ---------- */

  function init() {
    nodes.notice = D.byId('notice');
    nodes.toolbar = D.byId('toolbar');
    nodes.form = D.byId('form-slot');
    nodes.list = D.byId('project-list');
    nodes.summary = D.byId('summary');
    nodes.save = D.byId('save-state');
    nodes.fileInput = D.byId('import-file');

    D.byId('action-new').addEventListener('click', openCreate);
    D.byId('action-demo').addEventListener('click', loadDemo);
    D.byId('action-export').addEventListener('click', exportJson);
    D.byId('action-import').addEventListener('click', function () { nodes.fileInput.click(); });
    D.byId('action-clear').addEventListener('click', clearAll);
    nodes.fileInput.addEventListener('change', function () {
      if (nodes.fileInput.files && nodes.fileInput.files[0]) importJson(nodes.fileInput.files[0]);
      nodes.fileInput.value = '';
    });

    buildToolbar();

    var loaded = storage.load();
    lastWorkspace = loaded.workspace;
    store.subscribe(renderAll);
    store.update(function (state) {
      return Object.assign({}, state, {
        workspace: loaded.workspace,
        notice: loaded.importedFromLegacy
          ? 'Wczytano dane ze starszej wersji ETROM (' + loaded.workspace.projects.length + ' projektów). Stary zapis pozostał nietknięty.'
          : loaded.warning
      });
    });
    renderAll(store.getState());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Udostępnione na potrzeby testów przeglądarkowych.
  E.app = { store: store, loadDemo: loadDemo };
})(typeof globalThis !== 'undefined' ? globalThis : this);
