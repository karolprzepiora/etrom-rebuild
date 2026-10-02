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
  var Toast = E.Toast;
  var Motion = E.Motion;
  var Team = E.Team;
  var Tasks = E.Tasks;

  var storage = E.Storage.createStorage();
  var prefsStore = E.Prefs.createPrefs();

  var store = E.Store.createStore({
    workspace: Model.emptyWorkspace(),
    screen: 'projects',
    filters: { query: '', status: 'all', sort: 'deadline', person: 'all' },
    teamFilters: { query: '', role: 'all', showInactive: false },
    prefs: E.Prefs.defaults(),
    form: null,
    personForm: null,
    stageForm: null,
    taskForm: null,
    expanded: {},
    expandedStages: {},
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

  function updateWorkspace(producer) {
    store.update(function (state) {
      return Object.assign({}, state, { workspace: producer(state.workspace) });
    });
  }

  function setWorkspace(producer) {
    updateWorkspace(function (workspace) {
      return Object.assign({}, workspace, {
        version: Model.WORKSPACE_VERSION,
        projects: producer(workspace.projects)
      });
    });
  }

  function setPeople(producer) {
    updateWorkspace(function (workspace) {
      return Object.assign({}, workspace, {
        version: Model.WORKSPACE_VERSION,
        people: producer(workspace.people || [])
      });
    });
  }

  function people() {
    return store.getState().workspace.people || [];
  }

  function findPerson(id) {
    return Team.findPerson(people(), id);
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

  /* ---------- ekrany ---------- */

  var SCREENS = {
    projects: { crumb: 'Projekty', view: 'view-projects' },
    team: { crumb: 'Zespół', view: 'view-team' }
  };

  function goTo(screen) {
    if (!Object.prototype.hasOwnProperty.call(SCREENS, screen)) return;
    if (store.getState().screen === screen) return;
    Motion.withTransition(function () { store.set({ screen: screen }); });
  }

  /* ---------- osoby ---------- */

  function openNewPerson() {
    store.set({ personForm: { draft: { orgRole: 'member', cooperation: 'internal' }, errors: {} } });
  }

  function openEditPerson(id) {
    var person = findPerson(id);
    if (!person) return;
    store.set({
      personForm: {
        draft: {
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          position: person.position,
          orgRole: person.orgRole,
          cooperation: person.cooperation
        },
        errors: {}
      }
    });
  }

  function closePersonForm() {
    store.set({ personForm: null });
  }

  function submitPerson(values) {
    var list = people();
    var editing = values.id != null;
    var check = Team.validatePerson(values, list, editing ? values.id : undefined);

    if (!check.valid) {
      store.set({ personForm: { draft: values, errors: check.errors } });
      return;
    }

    if (editing) {
      setPeople(function (current) {
        return current.map(function (person) {
          return person.id === values.id ? Object.assign({}, person, check.value) : person;
        });
      });
    } else {
      setPeople(function (current) {
        return current.concat([Team.createPerson(check.value, current)]);
      });
    }
    closePersonForm();
  }

  function togglePerson(id) {
    var person = findPerson(id);
    if (!person) return;

    if (person.active === false) {
      setPeople(function (current) {
        return current.map(function (item) {
          return item.id === id ? Object.assign({}, item, { active: true }) : item;
        });
      });
      return;
    }

    var check = Team.canDeactivate(id, store.getState().workspace.projects);
    if (!check.allowed) {
      Toast.show({ message: check.reason, timeout: 9000 });
      return;
    }

    setPeople(function (current) {
      return current.map(function (item) {
        return item.id === id ? Object.assign({}, item, { active: false }) : item;
      });
    });
    Toast.show({
      message: 'Wyłączono z obiegu: ' + Team.fullName(person),
      actionLabel: 'Cofnij',
      onAction: function () {
        setPeople(function (current) {
          return current.map(function (item) {
            return item.id === id ? Object.assign({}, item, { active: true }) : item;
          });
        });
      }
    });
  }

  function deletePerson(id) {
    var list = people();
    var index = list.findIndex(function (person) { return person.id === id; });
    if (index < 0) return;
    var person = list[index];

    var assigned = Team.projectsOfPerson(store.getState().workspace.projects, id);
    if (assigned.length) {
      Toast.show({
        message: 'Nie można usunąć: osoba pełni funkcje w projektach '
          + assigned.map(function (p) { return p.code; }).join(', ')
          + '. Zdejmij ją z nich albo wyłącz z obiegu.',
        timeout: 9000
      });
      return;
    }

    setPeople(function (current) {
      return current.filter(function (item) { return item.id !== id; });
    });

    Toast.show({
      message: 'Usunięto z katalogu: ' + Team.fullName(person),
      actionLabel: 'Cofnij',
      onAction: function () {
        setPeople(function (current) {
          var copy = current.slice();
          copy.splice(Math.min(index, copy.length), 0, person);
          return copy;
        });
      }
    });
  }

  function openProjectFromTeam(project) {
    store.update(function (state) {
      var expanded = Object.assign({}, state.expanded);
      expanded[project.id] = true;
      return Object.assign({}, state, { screen: 'projects', expanded: expanded });
    });
    window.requestAnimationFrame(function () {
      var node = document.querySelector('[data-project-code="' + window.CSS.escape(project.code) + '"]');
      if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
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

    var team = Team.normalizeTeam(values.team, people());

    if (editing) {
      mapProject(values.id, function (project) {
        return Object.assign({}, project, check.value, { team: team });
      });
    } else {
      var picked = Array.isArray(values.stageIds) ? values.stageIds : [];
      var stages = Catalog.all
        .filter(function (entry) { return picked.indexOf(entry.id) >= 0; })
        .map(function (entry) { return Model.createStage(entry.id); });
      setWorkspace(function (list) {
        return list.concat([
          Model.createProject(Object.assign({}, check.value, { stages: stages, team: team }), list)
        ]);
      });
    }
    closeForm();
  }

  /* ---------- projekty i etapy ---------- */

  function deleteProject(id) {
    var projects = store.getState().workspace.projects;
    var index = projects.findIndex(function (p) { return p.id === id; });
    if (index < 0) return;
    var project = projects[index];

    Motion.withTransition(function () {
      setWorkspace(function (list) {
        return list.filter(function (p) { return p.id !== id; });
      });
    });

    Toast.show({
      message: 'Usunięto projekt „' + project.name + '”',
      actionLabel: 'Cofnij',
      onAction: function () {
        setWorkspace(function (list) {
          var copy = list.slice();
          copy.splice(Math.min(index, copy.length), 0, project);
          return copy;
        });
      }
    });
  }

  function toggleExpand(id) {
    // Bez przejścia widoku: rozwinięcie ma własną animację wejścia listy etapów,
    // a startViewTransition odkładałoby zmianę o klatkę i zamrażało stronę.
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
      return Object.assign({}, project, {
        stages: Model.insertCatalogStage(project.stages, Model.createStage(catalogId))
      });
    });
  }

  function removeStage(projectId, stageId) {
    var project = findProject(projectId);
    if (!project) return;
    var index = project.stages.findIndex(function (s) { return s.id === stageId; });
    if (index < 0) return;
    var stage = project.stages[index];
    var entry = Model.describeStage(stage);

    mapProject(projectId, function (current) {
      return Object.assign({}, current, {
        stages: current.stages.filter(function (s) { return s.id !== stageId; })
      });
    });

    Toast.show({
      message: 'Usunięto etap „' + entry.name + '” z projektu ' + project.code,
      actionLabel: 'Cofnij',
      onAction: function () {
        mapProject(projectId, function (current) {
          if (current.stages.some(function (s) { return s.id === stageId; })) return current;
          var copy = current.stages.slice();
          copy.splice(Math.min(index, copy.length), 0, stage);
          return Object.assign({}, current, { stages: copy });
        });
      }
    });
  }

  function moveStage(projectId, stageId, delta) {
    mapProject(projectId, function (project) {
      return Object.assign({}, project, { stages: Model.moveStage(project.stages, stageId, delta) });
    });
  }

  function openCustomStage(projectId) {
    store.set({ stageForm: { projectId: projectId, values: { domain: 'general', hours: '8' }, errors: {} } });
  }

  function cancelCustomStage() {
    store.set({ stageForm: null });
  }

  function submitCustomStage(projectId, values) {
    var project = findProject(projectId);
    if (!project) return;
    var made = Model.createCustomStage(values, project.stages);
    if (!made.valid) {
      store.set({ stageForm: { projectId: projectId, values: values, errors: made.errors } });
      return;
    }
    pendingFlash = { projectId: projectId, stageId: made.stage.id };
    mapProject(projectId, function (current) {
      return Object.assign({}, current, { stages: current.stages.concat([made.stage]) });
    });
    store.set({ stageForm: null });
  }

  /* ---------- zadania ---------- */

  function stageOf(projectId, stageId) {
    var project = findProject(projectId);
    if (!project) return null;
    return project.stages.filter(function (stage) { return stage.id === stageId; })[0] || null;
  }

  function taskOf(projectId, stageId, taskId) {
    var stage = stageOf(projectId, stageId);
    if (!stage) return null;
    return (stage.tasks || []).filter(function (task) { return task.id === taskId; })[0] || null;
  }

  function mapStage(projectId, stageId, change) {
    mapProject(projectId, function (project) {
      return Object.assign({}, project, {
        stages: project.stages.map(function (stage) {
          return stage.id === stageId ? change(stage) : stage;
        })
      });
    });
  }

  function mapTask(projectId, stageId, taskId, change) {
    mapStage(projectId, stageId, function (stage) {
      return Object.assign({}, stage, {
        tasks: (stage.tasks || []).map(function (task) {
          return task.id === taskId ? change(task) : task;
        })
      });
    });
  }

  function projectRoster(project) {
    return Team.projectPeople(project.team);
  }

  function toggleStage(projectId, stageId) {
    var key = projectId + ':' + stageId;
    store.update(function (state) {
      var expandedStages = Object.assign({}, state.expandedStages);
      if (expandedStages[key]) delete expandedStages[key];
      else expandedStages[key] = true;
      return Object.assign({}, state, { expandedStages: expandedStages });
    });
  }

  function openAddTask(projectId, stageId) {
    store.set({
      taskForm: {
        projectId: projectId, stageId: stageId,
        draft: { workload: 'medium', assignees: [] }, errors: {}
      }
    });
  }

  function openEditTask(projectId, stageId, taskId) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    store.set({
      taskForm: {
        projectId: projectId, stageId: stageId,
        draft: {
          id: task.id, name: task.name, deadline: task.deadline,
          workload: task.workload, important: task.important,
          description: task.description, assignees: (task.assignees || []).slice()
        },
        errors: {}
      }
    });
  }

  function closeTaskForm() {
    store.set({ taskForm: null });
  }

  function submitTask(values) {
    var form = store.getState().taskForm;
    if (!form) return;
    var project = findProject(form.projectId);
    var stage = stageOf(form.projectId, form.stageId);
    if (!project || !stage) return;

    var allowed = projectRoster(project);
    var check = Tasks.validateTask(values, allowed);
    if (!check.valid) {
      store.set({ taskForm: Object.assign({}, form, { draft: values, errors: check.errors }) });
      return;
    }

    if (values.id != null) {
      pendingFlash = { projectId: form.projectId, taskId: values.id };
      mapTask(form.projectId, form.stageId, values.id, function (task) {
        return Tasks.updateTask(task, values, allowed);
      });
    } else {
      var created = Tasks.createTask(values, stage.tasks || [], allowed);
      pendingFlash = { projectId: form.projectId, taskId: created.id };
      mapStage(form.projectId, form.stageId, function (current) {
        return Object.assign({}, current, { tasks: (current.tasks || []).concat([created]) });
      });
    }
    closeTaskForm();
  }

  function applyTaskMove(projectId, stageId, taskId, next, reason) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    var result = Tasks.moveTask(task, next, reason);
    if (!result.ok) {
      Toast.show({ message: result.error });
      return;
    }
    pendingFlash = { projectId: projectId, taskId: taskId };
    mapTask(projectId, stageId, taskId, function () { return result.task; });
  }

  function moveTaskStatus(projectId, stageId, taskId, next) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;

    if (next === 'changes') {
      Dialog.prompt({
        title: 'Zwrot do poprawy',
        message: 'Zadanie: ' + task.name,
        label: 'Co wymaga poprawy?',
        placeholder: 'np. Brakuje przekroju A-A i zestawienia materiałów.',
        confirm: 'Zwróć do poprawy'
      }).then(function (reason) {
        if (reason !== null) applyTaskMove(projectId, stageId, taskId, next, reason);
      });
      return;
    }
    applyTaskMove(projectId, stageId, taskId, next, '');
  }

  function cycleTaskPart(projectId, stageId, taskId, personId) {
    mapTask(projectId, stageId, taskId, function (task) {
      return Tasks.cyclePart(task, personId);
    });
  }

  function deleteTask(projectId, stageId, taskId) {
    var stage = stageOf(projectId, stageId);
    if (!stage) return;
    var list = stage.tasks || [];
    var index = list.findIndex(function (task) { return task.id === taskId; });
    if (index < 0) return;
    var task = list[index];

    mapStage(projectId, stageId, function (current) {
      return Object.assign({}, current, {
        tasks: (current.tasks || []).filter(function (item) { return item.id !== taskId; })
      });
    });

    Toast.show({
      message: 'Usunięto zadanie „' + task.name + '”',
      actionLabel: 'Cofnij',
      onAction: function () {
        mapStage(projectId, stageId, function (current) {
          var copy = (current.tasks || []).slice();
          copy.splice(Math.min(index, copy.length), 0, task);
          return Object.assign({}, current, { tasks: copy });
        });
      }
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

  function applyAccent(accent) {
    if (accent === 'standard') document.documentElement.removeAttribute('data-accent');
    else document.documentElement.setAttribute('data-accent', accent);
  }

  function applyTheme(theme) {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }

  function setPref(patch) {
    store.update(function (state) {
      var prefs = E.Prefs.normalize(Object.assign({}, state.prefs, patch));
      prefsStore.save(prefs);
      applyTheme(prefs.theme);
      applyAccent(prefs.accent);
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

  var DEMO_PEOPLE = [
    { firstName: 'Anna', lastName: 'Testowa', position: 'Dyrektor projektów', orgRole: 'managing', cooperation: 'internal' },
    { firstName: 'Michał', lastName: 'Testowy', position: 'Lider projektów', orgRole: 'managing', cooperation: 'internal' },
    { firstName: 'Ewa', lastName: 'Testowa', position: 'Projektantka hydrotechniczna', orgRole: 'member', cooperation: 'internal' },
    { firstName: 'Jan', lastName: 'Testowy', position: 'Asystent projektanta', orgRole: 'member', cooperation: 'internal' },
    { firstName: 'Olga', lastName: 'Testowa', position: 'Koordynatorka uzgodnień', orgRole: 'member', cooperation: 'external' },
    { firstName: 'Piotr', lastName: 'Testowy', position: 'Kosztorysant', orgRole: 'member', cooperation: 'consultant' }
  ];

  // Indeksy odnoszą się do DEMO_PEOPLE powyżej.
  var DEMO_TEAMS = {
    'DEMO-001': { leader: 0, coordinator: 2, proxyLead: 4, members: [3, 5] },
    'DEMO-002': { leader: 1, coordinator: 3, proxyLead: 2, proxyExtra: 4, members: [5] },
    'DEMO-003': { leader: 0, coordinator: 4, members: [2] },
    'DEMO-004': { leader: 1, coordinator: 2, members: [3, 4] },
    'DEMO-005': { leader: 0, coordinator: 5, members: [1, 2, 3, 4] }
  };

  // Indeksy etapów odnoszą się do katalogu, indeksy osób do DEMO_PEOPLE.
  var DEMO_TASKS = {
    'DEMO-002': [
      { stage: 9, name: 'Skompletować załączniki do wniosku o pozwolenie', status: 'working', workload: 'large', hours: 72, people: [1, 3] },
      { stage: 9, name: 'Uzgodnić kolizję z siecią gazową', status: 'review', workload: 'medium', hours: -36, people: [2] },
      { stage: 11, name: 'Opracować rysunki wykonawcze', status: 'todo', workload: 'veryLarge', hours: 240, people: [3, 4], important: true }
    ],
    'DEMO-001': [
      { stage: 5, name: 'Zebrać warunki od zarządcy drogi', status: 'working', workload: 'medium', hours: 48, people: [0, 2] },
      { stage: 6, name: 'Wystąpić o decyzję lokalizacyjną', status: 'todo', workload: 'small', hours: 120, people: [4] }
    ],
    'DEMO-004': [
      {
        stage: 3, name: 'Przygotować kartę informacyjną przedsięwzięcia',
        status: 'changes', workload: 'medium', hours: -12, people: [1],
        reason: 'Uzupełnić opis oddziaływania na wody powierzchniowe.'
      }
    ]
  };

  // Krótkie ścieżki przejść — dane testowe przechodzą przez model,
  // a nie podstawiają statusu wprost.
  var DEMO_PATHS = {
    todo: [], working: ['working'], review: ['review'],
    changes: ['review', 'changes'], done: ['done']
  };

  var DEMO = [
    { code: 'DEMO-001', name: 'Przebudowa przepustu w Lipnicy', client: 'Gmina Lipnica', status: 'active', deadline: demoDate(21), done: 5, working: 2 },
    { code: 'DEMO-002', name: 'Regulacja rzeki Białka — odcinek III', client: 'Wody Polskie RZGW', status: 'active', deadline: demoDate(-6), done: 9, working: 1 },
    { code: 'DEMO-003', name: 'Zbiornik retencyjny Dąbrowa', client: 'Starostwo Powiatowe', status: 'planned', deadline: demoDate(120), done: 0, working: 0 },
    { code: 'DEMO-004', name: 'Modernizacja stacji pomp Rudnik', client: 'Spółka Wodna Rudnik', status: 'paused', deadline: demoDate(60), done: 3, working: 0 },
    { code: 'DEMO-005', name: 'Dokumentacja wałów w Zarzeczu', client: 'Urząd Miasta', status: 'done', deadline: demoDate(-40), done: 14, working: 0 }
  ];

  function loadDemo() {
    // Najpierw katalog osób — projekty odwołują się do ich identyfikatorów.
    var roster = people().slice();
    DEMO_PEOPLE.forEach(function (row) {
      var exists = roster.some(function (person) {
        return Team.fullName(person).toLocaleLowerCase('pl')
          === (row.firstName + ' ' + row.lastName).toLocaleLowerCase('pl');
      });
      if (!exists) roster = roster.concat([Team.createPerson(row, roster)]);
    });

    function demoPersonId(index) {
      var row = DEMO_PEOPLE[index];
      if (!row) return '';
      var found = roster.filter(function (person) {
        return person.firstName === row.firstName && person.lastName === row.lastName;
      })[0];
      return found ? found.id : '';
    }

    function demoTaskDeadline(hoursFromNow) {
      var d = new Date();
      d.setHours(d.getHours() + hoursFromNow, 0, 0, 0);
      var pad = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
        + 'T' + pad(d.getHours()) + ':00';
    }

    function demoTasksFor(code, stages, team) {
      var specs = DEMO_TASKS[code] || [];
      var allowed = Team.projectPeople(team);

      specs.forEach(function (spec) {
        var entry = Catalog.all[spec.stage];
        var stage = entry && stages.filter(function (s) { return s.id === entry.id; })[0];
        if (!stage) return;

        var assignees = (spec.people || []).map(demoPersonId)
          .filter(function (id) { return id && allowed.indexOf(id) >= 0; });

        var task = Tasks.createTask({
          name: spec.name,
          deadline: demoTaskDeadline(spec.hours),
          workload: spec.workload,
          important: spec.important === true,
          assignees: assignees
        }, stage.tasks || [], allowed);

        (DEMO_PATHS[spec.status] || []).forEach(function (step) {
          var moved = Tasks.moveTask(task, step, spec.reason || 'Uzupełnienie');
          if (moved.ok) task = moved.task;
        });

        stage.tasks = (stage.tasks || []).concat([task]);
      });
    }

    function demoTeam(code) {
      var spec = DEMO_TEAMS[code];
      if (!spec) return Team.emptyTeam();
      var team = Team.emptyTeam();
      Team.SINGLE_KEYS.forEach(function (key) {
        if (spec[key] !== undefined) team[key] = demoPersonId(spec[key]);
      });
      team.members = (spec.members || []).map(demoPersonId).filter(Boolean);
      return Team.normalizeTeam(team, roster);
    }

    setPeople(function () { return roster; });

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
        var team = demoTeam(row.code);
        demoTasksFor(row.code, stages, team);
        result = result.concat([Model.createProject({
          code: row.code, name: row.name, client: row.client,
          status: row.status, deadline: row.deadline, stages: stages,
          team: team
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

  /* ---------- paleta poleceń ---------- */

  function revealProject(project) {
    store.update(function (state) {
      var expanded = Object.assign({}, state.expanded);
      expanded[project.id] = true;
      return Object.assign({}, state, { expanded: expanded });
    });
    window.requestAnimationFrame(function () {
      var node = document.querySelector('[data-project-code="' + window.CSS.escape(project.code) + '"]');
      if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function paletteCommands() {
    var state = store.getState();
    var prefs = Object.assign({}, state.prefs, { screen: state.screen });
    return [
      { label: 'Nowy projekt', icon: 'folder', keywords: 'dodaj utwórz', run: openCreate },
      { label: 'Nowa osoba', icon: 'people', keywords: 'zespół pracownik dodaj', run: openNewPerson },
      { label: 'Przejdź do Projektów', icon: 'folder', meta: prefs.screen === 'projects' ? 'teraz' : '', keywords: 'ekran portfel', run: function () { goTo('projects'); } },
      { label: 'Przejdź do Zespołu', icon: 'people', meta: prefs.screen === 'team' ? 'teraz' : '', keywords: 'ekran osoby katalog', run: function () { goTo('team'); } },
      { label: 'Dodaj dane testowe', icon: 'board', keywords: 'demo przykład', run: loadDemo },
      { label: 'Pobierz kopię JSON', icon: 'auto', keywords: 'eksport zapis backup', run: exportJson },
      { label: 'Wczytaj kopię JSON', icon: 'auto', keywords: 'import przywróć', run: function () { nodes.fileInput.click(); } },
      { label: 'Wyczyść dane programu', icon: 'alert', keywords: 'skasuj usuń wszystko', run: clearAll },
      { label: 'Widok kart', icon: 'cards', meta: prefs.view === 'cards' ? 'teraz' : '', keywords: 'kafelki', run: function () { setView('cards'); } },
      { label: 'Widok listy', icon: 'rows', meta: prefs.view === 'list' ? 'teraz' : '', keywords: 'tabela wiersze', run: function () { setView('list'); } },
      { label: 'Motyw jasny', icon: 'sun', meta: prefs.theme === 'light' ? 'teraz' : '', run: function () { setPref({ theme: 'light' }); } },
      { label: 'Motyw ciemny', icon: 'moon', meta: prefs.theme === 'dark' ? 'teraz' : '', run: function () { setPref({ theme: 'dark' }); } },
      { label: 'Motyw jak w systemie', icon: 'auto', meta: prefs.theme === 'system' ? 'teraz' : '', run: function () { setPref({ theme: 'system' }); } },
      { label: 'Barwy: standard', icon: 'cards', meta: prefs.accent === 'standard' ? 'teraz' : '', keywords: 'malinowy', run: function () { setPref({ accent: 'standard' }); } },
      { label: 'Barwy: hydro', icon: 'water', meta: prefs.accent === 'hydro' ? 'teraz' : '', keywords: 'turkus morski', run: function () { setPref({ accent: 'hydro' }); } },
      { label: 'Barwy: topo', icon: 'location', meta: prefs.accent === 'topo' ? 'teraz' : '', keywords: 'ziemiste mapowe', run: function () { setPref({ accent: 'topo' }); } }
    ];
  }

  function openPalette() {
    var state = store.getState();
    E.Palette.open({
      projects: state.workspace.projects,
      people: state.workspace.people || [],
      commands: paletteCommands(),
      onProject: revealProject,
      onPerson: function (person) {
        store.update(function (current) {
          return Object.assign({}, current, {
            screen: 'team',
            teamFilters: Object.assign({}, current.teamFilters, {
              query: Team.fullName(person),
              showInactive: true
            })
          });
        });
        nodes.teamSearch.value = Team.fullName(person);
      }
    });
  }

  function setView(view) {
    if (store.getState().prefs.view === view) return;
    Motion.withTransition(function () { setPref({ view: view }); });
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
      if (pendingFlash && pendingFlash.projectId === project.id) {
        motion.flashStage = pendingFlash.stageId;
        motion.flashTask = pendingFlash.taskId;
      }
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
    onMoveStage: moveStage,
    onOpenCustomStage: openCustomStage,
    onCancelCustomStage: cancelCustomStage,
    onSubmitCustomStage: submitCustomStage,
    onToggleStage: toggleStage,
    onAddTask: openAddTask,
    onEditTask: openEditTask,
    onDeleteTask: deleteTask,
    onMoveTask: moveTaskStatus,
    onCyclePart: cycleTaskPart,
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
    nodes.railNav = {};
    nodes.railCounts = {};

    function item(options) {
      var children = [Icons.icon(options.icon, 18), D.el('span', { text: options.label })];

      if (options.screen) {
        var count = D.el('span', { class: 'rail__count', text: '0' });
        nodes.railCounts[options.screen] = count;
        children.push(count);
        var button = D.el('button', {
          class: 'rail__item rail__item--nav',
          attrs: { type: 'button' },
          dataset: { screen: options.screen },
          on: { click: function () { goTo(options.screen); } }
        }, children);
        nodes.railNav[options.screen] = button;
        return button;
      }

      children.push(D.el('span', { class: 'rail__soon', text: 'wkrótce' }));
      return D.el('p', { class: 'rail__item rail__item--muted' }, children);
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

    var accent = segmented({
      label: 'Barwy',
      items: [
        { value: 'standard', icon: 'cards', title: 'Barwy standardowe' },
        { value: 'hydro', icon: 'water', title: 'Barwy hydro' },
        { value: 'topo', icon: 'location', title: 'Barwy topo' }
      ],
      onPick: function (value) { setPref({ accent: value }); }
    });
    nodes.accentButtons = accent.buttons;

    D.render(nodes.rail, [
      D.el('div', { class: 'rail__brand' }, [
        D.el('p', { class: 'rail__mark', text: 'ETROM' }),
        D.el('p', { class: 'rail__title', text: 'Centrum projektów' }),
        D.el('p', { class: 'rail__subtitle', text: 'Planowanie · realizacja · kontrola' })
      ]),
      section('Portfel', [item({ icon: 'folder', label: 'Projekty', screen: 'projects' })]),
      section('Twoja praca', [
        item({ icon: 'board', label: 'Moje' }),
        item({ icon: 'calendar', label: 'Plan pracy' })
      ]),
      section('Zarządzanie', [
        item({ icon: 'alert', label: 'Nadzór' }),
        item({ icon: 'people', label: 'Zespół', screen: 'team' })
      ]),
      D.el('div', { class: 'rail__foot' }, [
        D.el('div', { class: 'rail__themeRow' }, [
          D.el('span', { class: 'rail__legend', text: 'Motyw' }),
          theme.node
        ]),
        D.el('div', { class: 'rail__themeRow' }, [
          D.el('span', { class: 'rail__legend', text: 'Barwy' }),
          accent.node
        ]),
        D.el('p', { class: 'rail__hintRow' }, [
          D.el('kbd', { class: 'kbd', text: 'Ctrl' }),
          D.el('kbd', { class: 'kbd', text: 'K' }),
          D.el('span', { text: 'paleta poleceń' })
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

    nodes.personSelect = D.el('select', {
      class: 'select',
      attrs: { id: 'tb-person' },
      on: {
        change: function () {
          store.update(function (state) {
            return Object.assign({}, state, {
              filters: Object.assign({}, state.filters, { person: nodes.personSelect.value })
            });
          });
        }
      }
    });

    var view = segmented({
      label: 'Sposób wyświetlania',
      items: [
        { value: 'cards', icon: 'cards', title: 'Widok kart' },
        { value: 'list', icon: 'rows', title: 'Widok listy' }
      ],
      onPick: setView
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
        D.el('label', { class: 'label', text: 'Osoba', attrs: { for: 'tb-person' } }),
        nodes.personSelect
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

  function buildTeamFilters() {
    nodes.teamSearch = D.el('input', {
      class: 'input input--search',
      attrs: { id: 'tf-search', type: 'search', placeholder: 'Imię, nazwisko lub stanowisko' },
      on: {
        input: function () {
          store.update(function (state) {
            return Object.assign({}, state, {
              teamFilters: Object.assign({}, state.teamFilters, { query: nodes.teamSearch.value })
            });
          });
        }
      }
    });

    var roleSelect = D.el('select', {
      class: 'select',
      attrs: { id: 'tf-role' },
      on: {
        change: function () {
          store.update(function (state) {
            return Object.assign({}, state, {
              teamFilters: Object.assign({}, state.teamFilters, { role: roleSelect.value })
            });
          });
        }
      }
    }, [D.el('option', { text: 'Wszystkie role', attrs: { value: 'all' } })].concat(
      Object.keys(Team.ORG_ROLES).map(function (key) {
        return D.el('option', { text: Team.ORG_ROLES[key], attrs: { value: key } });
      })
    ));

    nodes.inactiveBox = D.el('input', {
      attrs: { id: 'tf-inactive', type: 'checkbox' },
      on: {
        change: function () {
          store.update(function (state) {
            return Object.assign({}, state, {
              teamFilters: Object.assign({}, state.teamFilters, { showInactive: nodes.inactiveBox.checked })
            });
          });
        }
      }
    });

    nodes.teamTallyValue = D.el('b', { text: '0' });
    nodes.teamTallyLabel = D.el('span', { text: 'osób' });

    D.render(nodes.teamFilters, [
      D.el('div', { class: 'filters__field', style: { flex: '1 1 280px' } }, [
        D.el('label', { class: 'label', text: 'Szukaj', attrs: { for: 'tf-search' } }),
        D.el('div', { class: 'searchbox' }, [
          nodes.teamSearch,
          D.el('kbd', { class: 'kbd kbd--inField', text: '/' })
        ])
      ]),
      D.el('div', { class: 'filters__field' }, [
        D.el('label', { class: 'label', text: 'Rola', attrs: { for: 'tf-role' } }),
        roleSelect
      ]),
      D.el('div', { class: 'filters__field field--check' }, [
        nodes.inactiveBox,
        D.el('label', { attrs: { for: 'tf-inactive' }, text: 'Pokaż wyłączone' })
      ]),
      D.el('div', { class: 'filters__tally' }, [nodes.teamTallyValue, nodes.teamTallyLabel])
    ]);
  }

  /** Lista osób w filtrze projektów zmienia się razem z katalogiem. */
  function refreshPersonOptions(state) {
    var roster = state.workspace.people || [];
    var signature = roster.map(function (p) { return p.id + ':' + Team.fullName(p); }).join('|');
    if (signature === nodes.personSignature) {
      nodes.personSelect.value = state.filters.person;
      return;
    }
    nodes.personSignature = signature;

    D.render(nodes.personSelect, [D.el('option', { text: 'Wszystkie osoby', attrs: { value: 'all' } })].concat(
      roster.slice().sort(function (a, b) {
        return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' });
      }).map(function (person) {
        return D.el('option', { text: Team.fullName(person), attrs: { value: person.id } });
      })
    ));
    nodes.personSelect.value = roster.some(function (p) { return p.id === state.filters.person; })
      ? state.filters.person : 'all';
  }

  function renderChrome(state) {
    Object.keys(nodes.themeButtons || {}).forEach(function (key) {
      nodes.themeButtons[key].setAttribute('aria-pressed', String(state.prefs.theme === key));
    });
    Object.keys(nodes.viewButtons || {}).forEach(function (key) {
      nodes.viewButtons[key].setAttribute('aria-pressed', String(state.prefs.view === key));
    });
    Object.keys(nodes.accentButtons || {}).forEach(function (key) {
      nodes.accentButtons[key].setAttribute('aria-pressed', String(state.prefs.accent === key));
    });

    Object.keys(nodes.railNav || {}).forEach(function (key) {
      var active = state.screen === key;
      nodes.railNav[key].classList.toggle('rail__item--active', active);
      nodes.railNav[key].setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (nodes.railCounts.projects) {
      nodes.railCounts.projects.textContent = String(state.workspace.projects.length);
    }
    if (nodes.railCounts.team) {
      nodes.railCounts.team.textContent = String((state.workspace.people || []).length);
    }

    nodes.crumb.textContent = SCREENS[state.screen].crumb;
    Object.keys(SCREENS).forEach(function (key) {
      nodes.views[key].hidden = state.screen !== key;
    });

    refreshPersonOptions(state);
  }

  function renderTeam(state) {
    var roster = state.workspace.people || [];
    var visible = E.TeamScreen.visiblePeople(roster, state.teamFilters);

    nodes.teamTallyValue.textContent = roster.length === visible.length
      ? String(roster.length)
      : visible.length + ' / ' + roster.length;
    nodes.teamTallyLabel.textContent = roster.length === visible.length ? 'osób' : 'pasujących';

    D.render(nodes.teamList, [
      E.TeamScreen.teamList(roster, state.workspace.projects, state.teamFilters, {
        onEditPerson: openEditPerson,
        onTogglePerson: togglePerson,
        onDeletePerson: deletePerson,
        onOpenProject: openProjectFromTeam,
        onNewPerson: openNewPerson
      })
    ]);
  }

  function renderNotice(state) {
    var has = !!state.notice;
    nodes.notice.className = 'notice' + (has ? '' : ' notice--hidden');
    nodes.notice.textContent = state.notice || '';
  }

  function renderDrawer(state) {
    var current = state.form || state.personForm || state.taskForm || null;
    if (current === lastForm) return;
    lastForm = current;

    if (!current) {
      if (drawerEl) Dialog.closeDrawer();
      return;
    }

    var kind = current === state.personForm ? 'person'
      : (current === state.taskForm ? 'task' : 'project');
    var content;
    var title;

    if (kind === 'person') {
      content = E.PersonForm.personForm(current.draft, current.errors, {
        onSubmit: submitPerson,
        onCancel: closePersonForm
      });
      title = current.draft.id != null ? 'Edytuj osobę' : 'Nowa osoba';
    } else if (kind === 'task') {
      var project = findProject(current.projectId);
      var roster = project
        ? projectRoster(project).map(function (id) { return Team.findPerson(state.workspace.people, id); }).filter(Boolean)
        : [];
      content = E.TaskForm.taskForm(current.draft, current.errors, {
        onSubmit: submitTask,
        onCancel: closeTaskForm
      }, roster);
      var stage = stageOf(current.projectId, current.stageId);
      var stageName = stage ? Model.describeStage(stage).name : '';
      title = (current.draft.id != null ? 'Edytuj zadanie' : 'Nowe zadanie')
        + (stageName ? ' · ' + stageName : '');
    } else {
      content = E.ProjectForm.projectForm(current.draft, current.errors, {
        onSubmit: submitForm,
        onCancel: closeForm
      }, state.workspace.people || []);
      title = current.draft.id != null ? 'Edytuj projekt' : 'Nowy projekt';
    }

    if (drawerEl) {
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
        var live = store.getState();
        if (live.form || live.personForm || live.taskForm) {
          store.set({ form: null, personForm: null, taskForm: null });
        }
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

    function stageFormFor(project) {
      return state.stageForm && state.stageForm.projectId === project.id ? state.stageForm : null;
    }

    if (state.prefs.view === 'list') {
      D.render(nodes.list, [
        E.ProjectTable.projectTable(
          visible,
          Object.assign({}, state, {
            people: state.workspace.people || [],
            expandedStages: state.expandedStages
          }),
          handlers,
          function (project) { return motionMap[project.id] || {}; },
          stageFormFor
        )
      ]);
    } else {
      D.render(nodes.list, [
        D.el('div', { class: 'projects' }, visible.map(function (project) {
          return E.ProjectCard.projectCard(
            project,
            {
              expanded: !!state.expanded[project.id],
              stageForm: stageFormFor(project),
              expandedStages: state.expandedStages,
              people: state.workspace.people || []
            },
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
    renderDrawer(state);
    renderList(state);
    renderTeam(state);
    persist(state);
  }

  /* ---------- klawiatura ---------- */

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function onKeydown(event) {
    if (event.defaultPrevented) return;

    if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      if (!Dialog.anyOpen() && !E.Palette.isOpen()) openPalette();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event.target)) return;

    var onTeam = store.getState().screen === 'team';

    if (event.key === '/') {
      event.preventDefault();
      var box = onTeam ? nodes.teamSearch : nodes.search;
      box.focus();
      box.select();
      return;
    }
    if (event.key === 'n' || event.key === 'N') {
      if (Dialog.anyOpen() || E.Palette.isOpen()) return;
      event.preventDefault();
      if (onTeam) openNewPerson();
      else openCreate();
    }
  }

  /* ---------- start ---------- */

  function init() {
    nodes.rail = D.byId('rail');
    nodes.crumb = D.byId('crumb');
    nodes.views = { projects: D.byId('view-projects'), team: D.byId('view-team') };
    nodes.notice = D.byId('notice');
    nodes.filters = D.byId('filters');
    nodes.list = D.byId('project-list');
    nodes.teamFilters = D.byId('team-filters');
    nodes.teamList = D.byId('team-list');
    nodes.summary = D.byId('summary');
    nodes.save = D.byId('save-state');
    nodes.fileInput = D.byId('import-file');

    D.byId('action-new').addEventListener('click', openCreate);
    D.byId('action-new-person').addEventListener('click', openNewPerson);
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
    buildTeamFilters();

    var prefs = prefsStore.load();
    applyTheme(prefs.theme);
    applyAccent(prefs.accent);

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
  E.app = {
    store: store,
    loadDemo: loadDemo,
    openCreate: openCreate,
    openNewPerson: openNewPerson,
    openPalette: openPalette,
    goTo: goTo
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
