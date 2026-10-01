/* ETROM — uruchomienie aplikacji i obsługa zdarzeń.
   Ten plik łączy stan z widokiem. Liczenie siedzi w src/core. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Model = E.Model;
  var Query = E.Query;
  var Catalog = E.Catalog;
  var Progress = E.Progress;
  var Icons = E.Icons;
  var Dialog = E.Dialog;

  var storage = E.Storage.createStorage();
  var prefsStore = E.Prefs.createPrefs();

  var store = E.Store.createStore({
    workspace: Model.emptyWorkspace(),
    filters: { query: '', status: 'all', sort: 'deadline' },
    prefs: E.Prefs.defaults(),
    form: null,
    expanded: {},
    notice: ''
  });

  var nodes = {};
  var lastForm = null;
  var lastWorkspace = null;
  var drawerEl = null;

  /* Pamięć poprzedniego widoku — dzięki niej ruch pokazuje zmianę,
     a nie powtarza się przy każdym przerysowaniu listy. */
  var lastPercent = {};
  var lastExpanded = {};
  var pendingFlash = null;

  /* ---------- operacje na danych ---------- */

  function setWorkspace(producer) {
    store.update(function (state) {
      return Object.assign({}, state, {
        workspace: { version: Model.WORKSPACE_VERSION, projects: producer(state.workspace.projects) }
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

  function findProject(id) {
    return store.getState().workspace.projects.filter(function (p) { return p.id === id; })[0];
  }

  /* ---------- formularz ---------- */

  function openCreate() {
    store.set({ form: { draft: { status: 'planned' }, errors: {} } });
  }

  function openEdit(id) {
    var project = findProject(id);
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
        return list.concat([Model.createProject(Object.assign({}, check.value, { stages: stages }), list)]);
      });
    }
    closeForm();
  }

  /* ---------- projekty i etapy ---------- */

  function deleteProject(id) {
    var project = findProject(id);
    if (!project) return;
    Dialog.confirm({
      title: 'Usunąć projekt?',
      message: 'Projekt „' + project.name + '” zniknie razem ze wszystkimi etapami. Tej operacji nie można cofnąć.',
      confirm: 'Usuń projekt',
      tone: 'danger'
    }).then(function (accepted) {
      if (!accepted) return;
      setWorkspace(function (projects) {
        return projects.filter(function (p) { return p.id !== id; });
      });
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
    pendingFlash = { projectId: projectId, stageId: stageId };
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
    pendingFlash = { projectId: projectId, stageId: catalogId };
    mapProject(projectId, function (project) {
      if (project.stages.some(function (s) { return s.id === catalogId; })) return project;
      var added = project.stages.concat([Model.createStage(catalogId)]);
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

  function setSort(key) {
    store.update(function (state) {
      return Object.assign({}, state, {
        filters: Object.assign({}, state.filters, { sort: key })
      });
    });
    if (nodes.sortSelect) nodes.sortSelect.value = key;
  }

  /* ---------- preferencje ---------- */

  function applyTheme(theme) {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }

  function setPref(patch) {
    store.update(function (state) {
      var prefs = E.Prefs.normalize(Object.assign({}, state.prefs, patch));
      prefsStore.save(prefs);
      applyTheme(prefs.theme);
      return Object.assign({}, state, { prefs: prefs });
    });
  }

  /* ---------- dane testowe i kopie ---------- */

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
          code: row.code, name: row.name, client: row.client,
          status: row.status, deadline: row.deadline, stages: stages
        }, result)]);
      });
      return result;
    });
  }

  function clearAll() {
    Dialog.confirm({
      title: 'Wyczyścić dane programu?',
      message: 'Z tego urządzenia znikną wszystkie projekty i etapy. Ustawienia wyglądu zostaną zachowane.',
      confirm: 'Wyczyść dane',
      tone: 'danger'
    }).then(function (accepted) {
      if (!accepted) return;
      lastPercent = {};
      lastExpanded = {};
      store.update(function (state) {
        return Object.assign({}, state, {
          workspace: Model.emptyWorkspace(), expanded: {}, form: null
        });
      });
    });
  }

  function exportJson() {
    var data = JSON.stringify(store.getState().workspace, null, 2);
    var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
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
        lastPercent = {};
        lastExpanded = {};
        store.update(function (state) {
          return Object.assign({}, state, {
            workspace: parsed, expanded: {}, form: null,
            notice: 'Wczytano kopię: ' + parsed.projects.length + ' projektów.'
          });
        });
      } catch (error) {
        store.set({ notice: 'Plik nie jest poprawną kopią ETROM.' });
      }
    };
    reader.readAsText(file);
  }

  /* ---------- ruch ---------- */

  function buildMotion(state) {
    var map = {};
    state.workspace.projects.forEach(function (project) {
      var motion = {};
      var percent = Progress.projectProgress(project).percent;
      if (Object.prototype.hasOwnProperty.call(lastPercent, project.id) && lastPercent[project.id] !== percent) {
        motion.progressFrom = lastPercent[project.id];
      }
      if (state.expanded[project.id] && !lastExpanded[project.id]) motion.justExpanded = true;
      if (pendingFlash && pendingFlash.projectId === project.id) motion.flashStage = pendingFlash.stageId;
      map[project.id] = motion;
    });
    return map;
  }

  function commitMotion(state) {
    state.workspace.projects.forEach(function (project) {
      lastPercent[project.id] = Progress.projectProgress(project).percent;
      lastExpanded[project.id] = !!state.expanded[project.id];
    });
    pendingFlash = null;
  }

  /* ---------- widok ---------- */

  var handlers = {
    onToggle: toggleExpand,
    onEdit: openEdit,
    onDelete: deleteProject,
    onCycleStage: cycleStage,
    onAddStage: addStage,
    onRemoveStage: removeStage,
    onSort: setSort
  };

  function segmented(options) {
    var buttons = {};
    var wrap = D.el('div', {
      class: 'segmented',
      attrs: { role: 'group', 'aria-label': options.label }
    }, options.items.map(function (item) {
      var button = D.el('button', {
        class: 'segmented__btn',
        attrs: { type: 'button', title: item.title, 'aria-label': item.title, 'aria-pressed': 'false' },
        on: { click: function () { options.onPick(item.value); } }
      }, [Icons.icon(item.icon, 16)]);
      buttons[item.value] = button;
      return button;
    }));
    return { node: wrap, buttons: buttons };
  }

  function buildRail() {
    function item(options) {
      var children = [Icons.icon(options.icon, 18), D.el('span', { text: options.label })];
      if (options.active) {
        nodes.railCount = D.el('span', { class: 'rail__count', text: '0' });
        children.push(nodes.railCount);
      } else {
        children.push(D.el('span', { class: 'rail__soon', text: 'wkrótce' }));
      }
      return D.el('p', {
        class: 'rail__item' + (options.active ? ' rail__item--active' : ' rail__item--muted')
      }, children);
    }

    function section(legend, items) {
      return D.el('nav', { class: 'rail__section' },
        [D.el('p', { class: 'rail__legend', text: legend })].concat(items));
    }

    var theme = segmented({
      label: 'Motyw',
      items: [
        { value: 'light', icon: 'sun', title: 'Motyw jasny' },
        { value: 'dark', icon: 'moon', title: 'Motyw ciemny' },
        { value: 'system', icon: 'auto', title: 'Jak w systemie' }
      ],
      onPick: function (value) { setPref({ theme: value }); }
    });
    nodes.themeButtons = theme.buttons;

    D.render(nodes.rail, [
      D.el('div', { class: 'rail__brand' }, [
        D.el('p', { class: 'rail__mark', text: 'ETROM' }),
        D.el('p', { class: 'rail__title', text: 'Centrum projektów' }),
        D.el('p', { class: 'rail__subtitle', text: 'Planowanie · realizacja · kontrola' })
      ]),
      section('Portfel', [item({ icon: 'folder', label: 'Projekty', active: true })]),
      section('Twoja praca', [
        item({ icon: 'board', label: 'Moje' }),
        item({ icon: 'calendar', label: 'Plan pracy' })
      ]),
      section('Zarządzanie', [
        item({ icon: 'alert', label: 'Nadzór' }),
        item({ icon: 'people', label: 'Zespół' })
      ]),
      D.el('div', { class: 'rail__foot' }, [
        D.el('div', { class: 'rail__themeRow' }, [
          D.el('span', { class: 'rail__legend', text: 'Motyw' }),
          theme.node
        ]),
        D.el('p', { text: 'Moduły oznaczone „wkrótce” są jeszcze w poprzedniej wersji aplikacji.' })
      ])
    ]);
  }

  function buildFilters() {
    nodes.search = D.el('input', {
      class: 'input input--search',
      attrs: { id: 'tb-search', type: 'search', placeholder: 'Kod, nazwa lub zamawiający' },
      on: {
        input: function () {
          store.update(function (state) {
            return Object.assign({}, state, {
              filters: Object.assign({}, state.filters, { query: nodes.search.value })
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

    nodes.sortSelect = D.el('select', {
      class: 'select',
      attrs: { id: 'tb-sort' },
      on: { change: function () { setSort(nodes.sortSelect.value); } }
    }, Object.keys(Query.SORTS).map(function (key) {
      return D.el('option', { text: Query.SORTS[key], attrs: { value: key } });
    }));

    var view = segmented({
      label: 'Sposób wyświetlania',
      items: [
        { value: 'cards', icon: 'cards', title: 'Widok kart' },
        { value: 'list', icon: 'rows', title: 'Widok listy' }
      ],
      onPick: function (value) { setPref({ view: value }); }
    });
    nodes.viewButtons = view.buttons;

    nodes.tallyValue = D.el('b', { text: '0' });
    nodes.tallyLabel = D.el('span', { text: 'projektów' });

    D.render(nodes.filters, [
      D.el('div', { class: 'filters__field', style: { flex: '1 1 280px' } }, [
        D.el('label', { class: 'label', text: 'Szukaj', attrs: { for: 'tb-search' } }),
        D.el('div', { class: 'searchbox' }, [
          nodes.search,
          D.el('kbd', { class: 'kbd kbd--inField', text: '/' })
        ])
      ]),
      D.el('div', { class: 'filters__field' }, [
        D.el('label', { class: 'label', text: 'Status', attrs: { for: 'tb-status' } }),
        statusSelect
      ]),
      D.el('div', { class: 'filters__field' }, [
        D.el('label', { class: 'label', text: 'Sortowanie', attrs: { for: 'tb-sort' } }),
        nodes.sortSelect
      ]),
      D.el('div', { class: 'filters__field' }, [
        D.el('span', { class: 'label', text: 'Widok' }),
        view.node
      ]),
      D.el('div', { class: 'filters__tally' }, [nodes.tallyValue, nodes.tallyLabel])
    ]);
  }

  function renderChrome(state) {
    Object.keys(nodes.themeButtons || {}).forEach(function (key) {
      nodes.themeButtons[key].setAttribute('aria-pressed', String(state.prefs.theme === key));
    });
    Object.keys(nodes.viewButtons || {}).forEach(function (key) {
      nodes.viewButtons[key].setAttribute('aria-pressed', String(state.prefs.view === key));
    });
  }

  function renderNotice(state) {
    var has = !!state.notice;
    nodes.notice.className = 'notice' + (has ? '' : ' notice--hidden');
    nodes.notice.textContent = state.notice || '';
  }

  function renderForm(state) {
    if (state.form === lastForm) return;
    lastForm = state.form;

    if (!state.form) {
      if (drawerEl) Dialog.closeDrawer();
      return;
    }

    var content = E.ProjectForm.projectForm(state.form.draft, state.form.errors, {
      onSubmit: submitForm,
      onCancel: closeForm
    });
    var title = state.form.draft.id != null ? 'Edytuj projekt' : 'Nowy projekt';

    if (drawerEl) {
      // Panel zostaje otwarty — podmieniamy tylko treść, żeby błędy walidacji
      // nie zamykały i nie otwierały go na nowo.
      drawerEl.querySelector('.drawer__title').textContent = title;
      D.render(drawerEl.querySelector('.drawer__body'), [content]);
      return;
    }

    drawerEl = Dialog.openDrawer({
      title: title,
      content: content,
      onClose: function () {
        drawerEl = null;
        lastForm = null;
        if (store.getState().form) store.set({ form: null });
      }
    });
  }

  function renderList(state) {
    var all = state.workspace.projects;
    var visible = Query.filterAndSort(all, state.filters);
    var motionMap = buildMotion(state);

    nodes.tallyValue.textContent = all.length === visible.length
      ? String(all.length)
      : visible.length + ' / ' + all.length;
    nodes.tallyLabel.textContent = all.length === visible.length ? 'projektów' : 'pasujących';
    if (nodes.railCount) nodes.railCount.textContent = String(all.length);

    var overdue = all.filter(function (p) { return Progress.isOverdue(p); }).length;
    nodes.summary.textContent = overdue
      ? 'Projekty po terminie: ' + overdue
      : 'Żaden projekt nie jest po terminie';

    if (!all.length) {
      D.render(nodes.list, [
        D.el('div', { class: 'empty' }, [
          D.el('p', { class: 'empty__title', text: 'Nie ma jeszcze żadnego projektu' }),
          D.el('p', {
            class: 'empty__text',
            text: 'Załóż pierwszy projekt albo wczytaj zestaw testowy, żeby zobaczyć listę, etapy i postęp na przykładzie.'
          }),
          D.el('div', { class: 'project__actions' }, [
            D.el('button', { class: 'btn btn--primary', text: 'Nowy projekt', attrs: { type: 'button' }, on: { click: openCreate } }),
            D.el('button', { class: 'btn', text: 'Dodaj dane testowe', attrs: { type: 'button' }, on: { click: loadDemo } })
          ])
        ])
      ]);
      commitMotion(state);
      return;
    }

    if (!visible.length) {
      D.render(nodes.list, [
        D.el('div', { class: 'empty' }, [
          D.el('p', { class: 'empty__title', text: 'Nic nie pasuje do filtrów' }),
          D.el('p', { class: 'empty__text', text: 'Zmień wyszukiwaną frazę albo wybierz inny status.' })
        ])
      ]);
      commitMotion(state);
      return;
    }

    if (state.prefs.view === 'list') {
      D.render(nodes.list, [
        E.ProjectTable.projectTable(visible, state, handlers, function (project) {
          return motionMap[project.id] || {};
        })
      ]);
    } else {
      D.render(nodes.list, [
        D.el('div', { class: 'projects' }, visible.map(function (project) {
          return E.ProjectCard.projectCard(
            project,
            { expanded: !!state.expanded[project.id] },
            handlers,
            motionMap[project.id] || {}
          );
        }))
      ]);
    }

    commitMotion(state);
  }

  function persist(state) {
    if (state.workspace === lastWorkspace) return;
    lastWorkspace = state.workspace;
    var result = storage.save(state.workspace);
    nodes.save.textContent = result.ok ? 'Zapisano na tym urządzeniu' : 'Zapis lokalny niedostępny';
  }

  function renderAll(state) {
    renderChrome(state);
    renderNotice(state);
    renderForm(state);
    renderList(state);
    persist(state);
  }

  /* ---------- klawiatura ---------- */

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event.target)) return;

    if (event.key === '/') {
      event.preventDefault();
      nodes.search.focus();
      nodes.search.select();
      return;
    }
    if (event.key === 'n' || event.key === 'N') {
      if (Dialog.anyOpen()) return;
      event.preventDefault();
      openCreate();
    }
  }

  /* ---------- start ---------- */

  function init() {
    nodes.rail = D.byId('rail');
    nodes.notice = D.byId('notice');
    nodes.filters = D.byId('filters');
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
    document.addEventListener('keydown', onKeydown);

    buildRail();
    buildFilters();

    var prefs = prefsStore.load();
    applyTheme(prefs.theme);

    var loaded = storage.load();
    lastWorkspace = loaded.workspace;
    store.subscribe(renderAll);
    store.update(function (state) {
      return Object.assign({}, state, {
        workspace: loaded.workspace,
        prefs: prefs,
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
  E.app = { store: store, loadDemo: loadDemo, openCreate: openCreate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
