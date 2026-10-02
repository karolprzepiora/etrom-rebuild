/* ETROM — uruchomienie aplikacji: stan, adresy, działania i rysowanie.
   Liczenie siedzi w src/core, wygląd w komponentach (src/ui/components.js).
   Ten plik łączy jedno z drugim. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Model = E.Model;
  var Query = E.Query;
  var Catalog = E.Catalog;
  var Progress = E.Progress;
  var Dialog = E.Dialog;
  var Toast = E.Toast;
  var Motion = E.Motion;
  var Team = E.Team;
  var Tasks = E.Tasks;
  var F = E.Format;

  var storage = E.Storage.createStorage();
  var prefsStore = E.Prefs.createPrefs();

  var SORT_LABEL = { deadline: 'Termin', name: 'Nazwa', code: 'Kod', progress: 'Postęp' };

  var store = E.Store.createStore({
    workspace: Model.emptyWorkspace(),
    route: { name: 'projects' },
    screen: 'projects',
    filters: { query: '', status: 'all', sort: 'deadline', person: 'all' },
    teamFilters: { query: '', role: 'all', showInactive: false },
    prefs: E.Prefs.defaults(),
    selection: {},
    page: 0,
    taskFilter: 'open',
    form: null,
    personForm: null,
    stageForm: null,
    taskForm: null,
    expandedStages: {},
    navOpen: false,
    notice: ''
  });

  var nodes = {};
  var lastForm = null;
  var lastWorkspace = null;
  var drawerEl = null;

  // Pamięć poprzedniego stanu — ruch pokazuje zmianę, a nie powtarza się przy każdym rysowaniu.
  var lastPercent = {};
  var pendingFlash = null;

  /* =========================================================
     Adresy (hash) — działają z file://, Wstecz w przeglądarce działa
     ========================================================= */

  var TABS = ['etapy', 'zadania', 'zespol'];

  function parseRoute(hash) {
    var parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'zespol') return { name: 'team' };
    if (parts[0] === 'projekty' && parts[1] && /^\d+$/.test(parts[1])) {
      return { name: 'project', projectId: Number(parts[1]), tab: TABS.indexOf(parts[2]) >= 0 ? parts[2] : 'etapy' };
    }
    return { name: 'projects' };
  }

  function routeHash(route) {
    if (route.name === 'team') return '#/zespol';
    if (route.name === 'project') return '#/projekty/' + route.projectId + (route.tab && route.tab !== 'etapy' ? '/' + route.tab : '');
    return '#/projekty';
  }

  function navigate(route) {
    var hash = routeHash(route);
    if (location.hash === hash) { applyRoute(route); return; }
    location.hash = hash;
  }

  function applyRoute(route) {
    var state = store.getState();
    var changedScreen = state.route.name !== route.name || state.route.projectId !== route.projectId;
    var commit = function () {
      store.set({
        route: route,
        screen: route.name === 'team' ? 'team' : 'projects',
        navOpen: false,
        selection: changedScreen ? {} : state.selection
      });
    };
    if (changedScreen) {
      Motion.withTransition(commit);
      window.scrollTo(0, 0);
    } else {
      commit();
    }
  }

  function onHashChange() {
    applyRoute(parseRoute(location.hash));
    // Po zmianie ekranu fokus trafia na jego nagłówek — czytnik ekranu ogłasza nowe miejsce.
    // Zwłoka: przejście widoku podmienia treść dopiero w następnej klatce.
    window.setTimeout(function () {
      if (Dialog.anyOpen()) return;
      var heading = document.querySelector('.view:not([hidden]) h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }, 80);
  }

  function goTo(screen) {
    navigate({ name: screen === 'team' ? 'team' : 'projects' });
  }

  function openProject(id, tab) {
    navigate({ name: 'project', projectId: id, tab: tab || 'etapy' });
  }

  /* =========================================================
     Operacje na danych
     ========================================================= */

  function updateWorkspace(producer) {
    store.update(function (state) {
      return Object.assign({}, state, { workspace: producer(state.workspace) });
    });
  }

  function setWorkspace(producer) {
    updateWorkspace(function (workspace) {
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, projects: producer(workspace.projects) });
    });
  }

  function setPeople(producer) {
    updateWorkspace(function (workspace) {
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, people: producer(workspace.people || []) });
    });
  }

  function people() {
    return store.getState().workspace.people || [];
  }

  function findPerson(id) {
    return Team.findPerson(people(), id);
  }

  function findProject(id) {
    return store.getState().workspace.projects.filter(function (p) { return p.id === id; })[0] || null;
  }

  function mapProject(id, change) {
    setWorkspace(function (projects) {
      return projects.map(function (project) { return project.id === id ? change(project) : project; });
    });
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
          id: person.id, firstName: person.firstName, lastName: person.lastName,
          position: person.position, orgRole: person.orgRole, cooperation: person.cooperation
        },
        errors: {}
      }
    });
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
      Toast.show({ message: 'Zapisano zmiany: ' + check.value.firstName + ' ' + check.value.lastName, tone: 'success', timeout: 4000 });
    } else {
      setPeople(function (current) { return current.concat([Team.createPerson(check.value, current)]); });
      Toast.show({ message: 'Dodano do katalogu: ' + check.value.firstName + ' ' + check.value.lastName, tone: 'success', timeout: 4000 });
    }
    store.set({ personForm: null });
  }

  function setPersonActive(id, active) {
    setPeople(function (current) {
      return current.map(function (item) { return item.id === id ? Object.assign({}, item, { active: active }) : item; });
    });
  }

  function togglePerson(id) {
    var person = findPerson(id);
    if (!person) return;
    if (person.active === false) {
      setPersonActive(id, true);
      Toast.show({ message: 'Przywrócono do obiegu: ' + Team.fullName(person), tone: 'success', timeout: 4000 });
      return;
    }
    var check = Team.canDeactivate(id, store.getState().workspace.projects);
    if (!check.allowed) {
      Toast.show({ message: check.reason, tone: 'danger', timeout: 9000 });
      return;
    }
    setPersonActive(id, false);
    Toast.show({
      message: 'Wyłączono z obiegu: ' + Team.fullName(person),
      actionLabel: 'Cofnij',
      onAction: function () { setPersonActive(id, true); }
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
        message: 'Nie można usunąć: ' + Team.fullName(person) + ' pełni funkcje w projektach '
          + assigned.map(function (p) { return p.code; }).join(', ') + '. Zdejmij ją z nich albo wyłącz z obiegu.',
        tone: 'danger',
        timeout: 9000
      });
      return;
    }
    setPeople(function (current) { return current.filter(function (item) { return item.id !== id; }); });
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

  /* ---------- projekty ---------- */

  function openCreate() {
    store.set({ form: { draft: { status: 'planned' }, errors: {} } });
  }

  function openEdit(id) {
    var project = findProject(id);
    if (!project) return;
    store.set({
      form: {
        draft: {
          id: project.id, code: project.code, name: project.name, client: project.client,
          status: project.status, deadline: project.deadline,
          team: Object.assign(Team.emptyTeam(), project.team)
        },
        errors: {}
      }
    });
  }

  function submitForm(values) {
    var projects = store.getState().workspace.projects;
    var editing = values.id != null;
    var check = Model.validateProject(values, projects, editing ? values.id : undefined);
    if (!check.valid) {
      store.set({ form: { draft: values, errors: check.errors } });
      return;
    }
    var team = Team.normalizeTeam(values.team, people());

    if (editing) {
      mapProject(values.id, function (project) { return Object.assign({}, project, check.value, { team: team }); });
      store.set({ form: null });
      Toast.show({ message: 'Zapisano zmiany w projekcie ' + check.value.code, tone: 'success', timeout: 4000 });
      return;
    }

    var picked = Array.isArray(values.stageIds) ? values.stageIds : [];
    var stages = Catalog.all
      .filter(function (entry) { return picked.indexOf(entry.id) >= 0; })
      .map(function (entry) { return Model.createStage(entry.id); });
    var created = null;
    setWorkspace(function (list) {
      created = Model.createProject(Object.assign({}, check.value, { stages: stages, team: team }), list);
      return list.concat([created]);
    });
    store.set({ form: null });
    Toast.show({
      message: 'Utworzono projekt ' + created.code,
      tone: 'success',
      actionLabel: 'Otwórz',
      onAction: function () { openProject(created.id); },
      timeout: 6000
    });
  }

  /** Usuwa projekty od razu, z możliwością cofnięcia na to samo miejsce listy. */
  function deleteProjects(ids) {
    var projects = store.getState().workspace.projects;
    var removed = projects
      .map(function (project, index) { return { project: project, index: index }; })
      .filter(function (entry) { return ids.indexOf(entry.project.id) >= 0; });
    if (!removed.length) return;

    var route = store.getState().route;
    if (route.name === 'project' && ids.indexOf(route.projectId) >= 0) navigate({ name: 'projects' });

    Motion.withTransition(function () {
      setWorkspace(function (list) { return list.filter(function (p) { return ids.indexOf(p.id) < 0; }); });
      store.update(function (state) {
        var selection = Object.assign({}, state.selection);
        ids.forEach(function (id) { delete selection[id]; });
        return Object.assign({}, state, { selection: selection });
      });
    });

    Toast.show({
      message: removed.length === 1
        ? 'Usunięto projekt „' + removed[0].project.name + '”'
        : 'Usunięto ' + F.count(removed.length, 'projekt', 'projekty', 'projektów'),
      actionLabel: 'Cofnij',
      onAction: function () {
        setWorkspace(function (list) {
          var copy = list.slice();
          removed.forEach(function (entry) {
            if (copy.some(function (p) { return p.id === entry.project.id; })) return;
            copy.splice(Math.min(entry.index, copy.length), 0, entry.project);
          });
          return copy;
        });
      }
    });
  }

  function setProjectStatus(ids, status) {
    var before = {};
    store.getState().workspace.projects.forEach(function (p) { if (ids.indexOf(p.id) >= 0) before[p.id] = p.status; });
    var changed = Object.keys(before).filter(function (id) { return before[id] !== status; });
    if (!changed.length) return;
    setWorkspace(function (list) {
      return list.map(function (p) { return ids.indexOf(p.id) >= 0 ? Object.assign({}, p, { status: status }) : p; });
    });
    Toast.show({
      message: (changed.length === 1 ? 'Status projektu' : 'Status ' + F.count(changed.length, 'projektu', 'projektów', 'projektów'))
        + ': ' + Model.PROJECT_STATUS[status],
      actionLabel: 'Cofnij',
      timeout: 6000,
      onAction: function () {
        setWorkspace(function (list) {
          return list.map(function (p) {
            return Object.prototype.hasOwnProperty.call(before, p.id) ? Object.assign({}, p, { status: before[p.id] }) : p;
          });
        });
      }
    });
  }

  function selectProjects(ids, on) {
    store.update(function (state) {
      var selection = Object.assign({}, state.selection);
      ids.forEach(function (id) { if (on) selection[id] = true; else delete selection[id]; });
      return Object.assign({}, state, { selection: selection });
    });
  }

  function clearSelection() {
    store.set({ selection: {} });
  }

  /* ---------- etapy ---------- */

  function cycleStage(projectId, stageId) {
    pendingFlash = { projectId: projectId, stageId: stageId };
    mapProject(projectId, function (project) {
      return Object.assign({}, project, {
        stages: project.stages.map(function (stage) {
          return stage.id === stageId ? Object.assign({}, stage, { status: Model.cycleStageStatus(stage.status) }) : stage;
        })
      });
    });
  }

  function addStage(projectId, catalogId) {
    if (!catalogId) return;
    pendingFlash = { projectId: projectId, stageId: catalogId };
    mapProject(projectId, function (project) {
      if (project.stages.some(function (s) { return s.id === catalogId; })) return project;
      return Object.assign({}, project, { stages: Model.insertCatalogStage(project.stages, Model.createStage(catalogId)) });
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
      return Object.assign({}, current, { stages: current.stages.filter(function (s) { return s.id !== stageId; }) });
    });
    var taskCount = (stage.tasks || []).length;
    Toast.show({
      message: 'Usunięto etap „' + entry.name + '”' + (taskCount ? ' razem z ' + F.count(taskCount, 'zadaniem', 'zadaniami', 'zadaniami') : ''),
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
    pendingFlash = { projectId: projectId, stageId: stageId };
    mapProject(projectId, function (project) {
      return Object.assign({}, project, { stages: Model.moveStage(project.stages, stageId, delta) });
    });
  }

  function openCustomStage(projectId) {
    store.set({ stageForm: { projectId: projectId, draft: { domain: 'general', hours: '8' }, errors: {} } });
  }

  function submitCustomStage(values) {
    var form = store.getState().stageForm;
    var project = form && findProject(form.projectId);
    if (!project) return;
    var made = Model.createCustomStage(values, project.stages);
    if (!made.valid) {
      store.set({ stageForm: { projectId: project.id, draft: values, errors: made.errors } });
      return;
    }
    pendingFlash = { projectId: project.id, stageId: made.stage.id };
    mapProject(project.id, function (current) {
      return Object.assign({}, current, { stages: current.stages.concat([made.stage]) });
    });
    store.set({ stageForm: null });
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
        stages: project.stages.map(function (stage) { return stage.id === stageId ? change(stage) : stage; })
      });
    });
  }

  function mapTask(projectId, stageId, taskId, change) {
    mapStage(projectId, stageId, function (stage) {
      return Object.assign({}, stage, {
        tasks: (stage.tasks || []).map(function (task) { return task.id === taskId ? change(task) : task; })
      });
    });
  }

  function projectRoster(project) {
    return Team.projectPeople(project.team);
  }

  function openAddTask(projectId, stageId) {
    store.set({ taskForm: { projectId: projectId, stageId: stageId, draft: { workload: 'medium', assignees: [] }, errors: {} } });
  }

  function openEditTask(projectId, stageId, taskId) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    store.set({
      taskForm: {
        projectId: projectId, stageId: stageId,
        draft: {
          id: task.id, name: task.name, deadline: task.deadline, workload: task.workload,
          important: task.important, description: task.description, assignees: (task.assignees || []).slice()
        },
        errors: {}
      }
    });
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
      mapTask(form.projectId, form.stageId, values.id, function (task) { return Tasks.updateTask(task, values, allowed); });
    } else {
      var created = Tasks.createTask(values, stage.tasks || [], allowed);
      pendingFlash = { projectId: form.projectId, taskId: created.id };
      mapStage(form.projectId, form.stageId, function (current) {
        return Object.assign({}, current, { tasks: (current.tasks || []).concat([created]) });
      });
      // Nowe zadanie ma być widoczne: rozwijamy jego etap.
      store.update(function (state) {
        var expandedStages = Object.assign({}, state.expandedStages);
        expandedStages[form.projectId + ':' + form.stageId] = true;
        return Object.assign({}, state, { expandedStages: expandedStages });
      });
    }
    store.set({ taskForm: null });
  }

  function applyTaskMove(projectId, stageId, taskId, next, reason) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    var result = Tasks.moveTask(task, next, reason);
    if (!result.ok) {
      Toast.show({ message: result.error, tone: 'danger' });
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
        message: task.name,
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
    mapTask(projectId, stageId, taskId, function (task) { return Tasks.cyclePart(task, personId); });
  }

  function deleteTask(projectId, stageId, taskId) {
    var stage = stageOf(projectId, stageId);
    if (!stage) return;
    var list = stage.tasks || [];
    var index = list.findIndex(function (task) { return task.id === taskId; });
    if (index < 0) return;
    var task = list[index];
    mapStage(projectId, stageId, function (current) {
      return Object.assign({}, current, { tasks: (current.tasks || []).filter(function (item) { return item.id !== taskId; }) });
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

  /* ---------- filtry i preferencje ---------- */

  function setFilters(patch) {
    store.update(function (state) {
      return Object.assign({}, state, { filters: Object.assign({}, state.filters, patch), page: 0 });
    });
  }

  function setSort(key) {
    setFilters({ sort: key });
  }

  function clearFilters() {
    nodes.search.value = '';
    setFilters({ query: '', status: 'all', person: 'all' });
  }

  function setTeamFilters(patch) {
    store.update(function (state) {
      return Object.assign({}, state, { teamFilters: Object.assign({}, state.teamFilters, patch) });
    });
  }

  function clearTeamFilters() {
    nodes.teamSearch.value = '';
    nodes.inactiveSwitch.checked = false;
    setTeamFilters({ query: '', role: 'all', showInactive: false });
  }

  function applyPrefs(prefs) {
    if (prefs.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', prefs.theme);
    if (prefs.accent === 'standard') document.documentElement.removeAttribute('data-accent');
    else document.documentElement.setAttribute('data-accent', prefs.accent);
  }

  function setPref(patch) {
    store.update(function (state) {
      var prefs = E.Prefs.normalize(Object.assign({}, state.prefs, patch));
      prefsStore.save(prefs);
      applyPrefs(prefs);
      return Object.assign({}, state, { prefs: prefs });
    });
  }

  function setView(view) {
    if (store.getState().prefs.view === view) return;
    Motion.withTransition(function () { setPref({ view: view }); });
  }

  function toggleColumn(key, visible) {
    var hidden = store.getState().prefs.hiddenColumns.filter(function (k) { return k !== key; });
    if (!visible) hidden.push(key);
    setPref({ hiddenColumns: hidden });
  }

  /* =========================================================
     Dane przykładowe, kopia zapasowa, czyszczenie
     ========================================================= */

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

  // Krótkie ścieżki przejść — dane przykładowe przechodzą przez model, a nie podstawiają statusu wprost.
  var DEMO_PATHS = { todo: [], working: ['working'], review: ['review'], changes: ['review', 'changes'], done: ['done'] };

  var DEMO = [
    { code: 'DEMO-001', name: 'Przebudowa przepustu w Lipnicy', client: 'Gmina Lipnica', status: 'active', deadline: demoDate(21), done: 5, working: 2 },
    { code: 'DEMO-002', name: 'Regulacja rzeki Białka — odcinek III', client: 'Wody Polskie RZGW', status: 'active', deadline: demoDate(-6), done: 9, working: 1 },
    { code: 'DEMO-003', name: 'Zbiornik retencyjny Dąbrowa', client: 'Starostwo Powiatowe', status: 'planned', deadline: demoDate(120), done: 0, working: 0 },
    { code: 'DEMO-004', name: 'Modernizacja stacji pomp Rudnik', client: 'Spółka Wodna Rudnik', status: 'paused', deadline: demoDate(60), done: 3, working: 0 },
    { code: 'DEMO-005', name: 'Dokumentacja wałów w Zarzeczu', client: 'Urząd Miasta', status: 'done', deadline: demoDate(-40), done: 14, working: 0 }
  ];

  function loadDemo() {
    var roster = people().slice();
    DEMO_PEOPLE.forEach(function (row) {
      var exists = roster.some(function (person) {
        return Team.fullName(person).toLocaleLowerCase('pl') === (row.firstName + ' ' + row.lastName).toLocaleLowerCase('pl');
      });
      if (!exists) roster = roster.concat([Team.createPerson(row, roster)]);
    });

    function demoPersonId(index) {
      var row = DEMO_PEOPLE[index];
      if (!row) return '';
      var found = roster.filter(function (person) { return person.firstName === row.firstName && person.lastName === row.lastName; })[0];
      return found ? found.id : '';
    }

    function demoTaskDeadline(hoursFromNow) {
      var d = new Date();
      d.setHours(d.getHours() + hoursFromNow, 0, 0, 0);
      var pad = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':00';
    }

    function demoTasksFor(code, stages, team) {
      var allowed = Team.projectPeople(team);
      (DEMO_TASKS[code] || []).forEach(function (spec) {
        var entry = Catalog.all[spec.stage];
        var stage = entry && stages.filter(function (s) { return s.id === entry.id; })[0];
        if (!stage) return;
        var assignees = (spec.people || []).map(demoPersonId).filter(function (id) { return id && allowed.indexOf(id) >= 0; });
        var task = Tasks.createTask({
          name: spec.name, deadline: demoTaskDeadline(spec.hours), workload: spec.workload,
          important: spec.important === true, assignees: assignees
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
      var team = Team.emptyTeam();
      if (!spec) return team;
      Team.SINGLE_KEYS.forEach(function (key) { if (spec[key] !== undefined) team[key] = demoPersonId(spec[key]); });
      team.members = (spec.members || []).map(demoPersonId).filter(Boolean);
      return Team.normalizeTeam(team, roster);
    }

    setPeople(function () { return roster; });

    var added = 0;
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
          code: row.code, name: row.name, client: row.client, status: row.status,
          deadline: row.deadline, stages: stages, team: team
        }, result)]);
        added += 1;
      });
      return result;
    });
    Toast.show({
      message: added ? 'Dodano ' + F.count(added, 'projekt przykładowy', 'projekty przykładowe', 'projektów przykładowych') : 'Dane przykładowe są już w programie',
      tone: added ? 'success' : 'info',
      timeout: 4000
    });
  }

  function clearAll() {
    Dialog.confirm({
      title: 'Usunąć wszystkie dane?',
      message: 'Z tej przeglądarki znikną wszystkie projekty, etapy, zadania i osoby. Tego nie można cofnąć — jeśli dane mogą się przydać, najpierw pobierz kopię zapasową. Ustawienia wyglądu zostaną.',
      confirm: 'Usuń wszystkie dane',
      tone: 'danger'
    }).then(function (accepted) {
      if (!accepted) return;
      lastPercent = {};
      store.update(function (state) {
        return Object.assign({}, state, { workspace: Model.emptyWorkspace(), expandedStages: {}, selection: {}, form: null });
      });
      navigate({ name: 'projects' });
    });
  }

  function exportJson() {
    var data = JSON.stringify(store.getState().workspace, null, 2);
    var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    var stamp = new Date().toISOString().slice(0, 10);
    var link = D.el('a', { attrs: { href: url, download: 'etrom-kopia-' + stamp + '.json' } });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    Toast.show({ message: 'Pobrano kopię zapasową', tone: 'success', timeout: 4000 });
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = Model.normalizeWorkspace(JSON.parse(String(reader.result)));
        lastPercent = {};
        store.update(function (state) {
          return Object.assign({}, state, { workspace: parsed, expandedStages: {}, selection: {}, form: null, notice: '' });
        });
        navigate({ name: 'projects' });
        Toast.show({
          message: 'Wczytano kopię: ' + F.count(parsed.projects.length, 'projekt', 'projekty', 'projektów')
            + ', ' + F.count((parsed.people || []).length, 'osoba', 'osoby', 'osób'),
          tone: 'success'
        });
      } catch (error) {
        Toast.show({ message: 'Ten plik nie jest kopią zapasową ETROM. Wybierz plik .json pobrany z programu.', tone: 'danger', timeout: 9000 });
      }
    };
    reader.readAsText(file);
  }

  /* =========================================================
     Paleta poleceń
     ========================================================= */

  function paletteCommands() {
    var state = store.getState();
    var prefs = state.prefs;
    var now = function (on) { return on ? 'teraz' : ''; };
    return [
      { label: 'Nowy projekt', icon: 'plus', meta: 'N', keywords: 'dodaj utwórz', run: openCreate },
      { label: 'Nowa osoba', icon: 'person', keywords: 'zespół pracownik dodaj', run: function () { goTo('team'); openNewPerson(); } },
      { label: 'Przejdź do projektów', icon: 'folder', meta: now(state.route.name === 'projects'), keywords: 'ekran lista portfel', run: function () { goTo('projects'); } },
      { label: 'Przejdź do zespołu', icon: 'people', meta: now(state.route.name === 'team'), keywords: 'ekran osoby katalog', run: function () { goTo('team'); } },
      { label: 'Widok: tabela', icon: 'list', meta: now(prefs.view === 'list'), keywords: 'lista wiersze', run: function () { goTo('projects'); setView('list'); } },
      { label: 'Widok: karty', icon: 'grid', meta: now(prefs.view === 'cards'), keywords: 'kafelki', run: function () { goTo('projects'); setView('cards'); } },
      { label: 'Motyw jasny', icon: 'sun', meta: now(prefs.theme === 'light'), run: function () { setPref({ theme: 'light' }); } },
      { label: 'Motyw ciemny', icon: 'moon', meta: now(prefs.theme === 'dark'), run: function () { setPref({ theme: 'dark' }); } },
      { label: 'Motyw jak w systemie', icon: 'monitor', meta: now(prefs.theme === 'system'), run: function () { setPref({ theme: 'system' }); } },
      { label: 'Akcent: malinowy', icon: 'settings', meta: now(prefs.accent === 'standard'), keywords: 'barwy kolor standard etrom', run: function () { setPref({ accent: 'standard' }); } },
      { label: 'Akcent: morski', icon: 'water', meta: now(prefs.accent === 'hydro'), keywords: 'barwy kolor hydro turkus', run: function () { setPref({ accent: 'hydro' }); } },
      { label: 'Akcent: grafitowy', icon: 'settings', meta: now(prefs.accent === 'graphite'), keywords: 'barwy kolor szary topo', run: function () { setPref({ accent: 'graphite' }); } },
      { label: 'Dodaj dane przykładowe', icon: 'sparkle', keywords: 'demo testowe przykład', run: loadDemo },
      { label: 'Pobierz kopię zapasową', icon: 'download', keywords: 'eksport json backup zapis', run: exportJson },
      { label: 'Wczytaj kopię zapasową', icon: 'upload', keywords: 'import json przywróć', run: function () { nodes.fileInput.click(); } },
      { label: 'Usuń wszystkie dane', icon: 'trash', keywords: 'wyczyść skasuj', run: clearAll }
    ];
  }

  function openPalette() {
    if (E.Palette.isOpen() || Dialog.anyOpen()) return;
    Menu.close({ restoreFocus: false });
    var state = store.getState();
    E.Palette.open({
      projects: state.workspace.projects,
      people: state.workspace.people || [],
      commands: paletteCommands(),
      onProject: function (project) { openProject(project.id); },
      onPerson: function (person) {
        goTo('team');
        nodes.teamSearch.value = Team.fullName(person);
        setTeamFilters({ query: Team.fullName(person), showInactive: true });
        nodes.inactiveSwitch.checked = true;
      }
    });
  }

  /* =========================================================
     Ruch
     ========================================================= */

  function buildMotion(state, project) {
    var motion = {};
    if (!project) return motion;
    var percent = Progress.projectProgress(project).percent;
    if (Object.prototype.hasOwnProperty.call(lastPercent, project.id) && lastPercent[project.id] !== percent) {
      motion.progressFrom = lastPercent[project.id];
    }
    if (pendingFlash && pendingFlash.projectId === project.id) {
      motion.flashStage = pendingFlash.stageId;
      motion.flashTask = pendingFlash.taskId;
    }
    return motion;
  }

  function commitMotion(project) {
    if (project) lastPercent[project.id] = Progress.projectProgress(project).percent;
    pendingFlash = null;
  }

  /* =========================================================
     Widok
     ========================================================= */

  var actions = {
    openProject: openProject,
    editProject: openEdit,
    deleteProjects: deleteProjects,
    setProjectStatus: setProjectStatus,
    selectProjects: selectProjects,
    setSort: setSort,
    setPage: function (page) { store.set({ page: page }); window.scrollTo(0, 0); },
    cycleStage: cycleStage,
    addStage: addStage,
    removeStage: removeStage,
    moveStage: moveStage,
    openCustomStage: openCustomStage,
    toggleStage: toggleStage,
    addTask: openAddTask,
    editTask: openEditTask,
    deleteTask: deleteTask,
    moveTask: moveTaskStatus,
    cyclePart: cycleTaskPart,
    setTaskFilter: function (value) { store.set({ taskFilter: value }); },
    editPerson: openEditPerson,
    togglePerson: togglePerson,
    deletePerson: deletePerson,
    newPerson: openNewPerson,
    clearTeamFilters: clearTeamFilters,
    goTo: goTo
  };

  /** Przycisk filtra z bieżącą wartością i menu wyboru. */
  function filterButton(id, label, icon, build) {
    var value = D.el('span', { class: 'filter-btn__value' });
    var btn = D.el('button', {
      class: 'filter-btn',
      attrs: { type: 'button', id: id }
    }, [E.Icons.icon(icon, 14), D.el('span', { text: label }), D.el('span', { class: 'filter-btn__sep', attrs: { 'aria-hidden': 'true' } }), value]);
    Menu.bind(btn, build);
    return {
      node: btn,
      set: function (text, active) {
        value.textContent = text;
        btn.classList.toggle('filter-btn--active', !!active);
        btn.setAttribute('aria-label', label + ': ' + text);
      }
    };
  }

  function buildProjectsToolbar() {
    var search = UI.searchInput({
      id: 'tb-search', placeholder: 'Szukaj projektów', label: 'Szukaj projektów po kodzie, nazwie lub zamawiającym', kbd: '/',
      class: 'toolbar__search',
      on: { input: function () { setFilters({ query: nodes.search.value }); } }
    });
    nodes.search = search.input;
    nodes.search.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nodes.search.value) {
        event.preventDefault();
        nodes.search.value = '';
        setFilters({ query: '' });
      }
    });

    nodes.statusFilter = filterButton('tb-status', 'Status', 'filter', function () {
      var current = store.getState().filters.status;
      return {
        label: 'Filtr statusu',
        items: [{ type: 'radio', label: 'Wszystkie statusy', value: 'all', checked: current === 'all', onSelect: function () { setFilters({ status: 'all' }); } }, { type: 'separator' }]
          .concat(Object.keys(Model.PROJECT_STATUS).map(function (key) {
            return {
              type: 'radio', label: Model.PROJECT_STATUS[key], value: key, checked: current === key,
              leading: UI.statusGlyph('project', key),
              onSelect: function () { setFilters({ status: key }); }
            };
          }))
      };
    });

    nodes.personFilter = filterButton('tb-person', 'Osoba', 'person', function () {
      var current = store.getState().filters.person;
      var roster = people().slice().sort(function (a, b) {
        return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' });
      });
      var items = [{ type: 'radio', label: 'Wszystkie osoby', value: 'all', checked: current === 'all', onSelect: function () { setFilters({ person: 'all' }); } }];
      if (roster.length) items.push({ type: 'separator' });
      roster.forEach(function (person) {
        items.push({
          type: 'radio', label: Team.fullName(person), value: person.id, checked: current === person.id,
          hint: person.active === false ? 'wyłączona' : '',
          leading: E.Avatar.avatar(person, { size: 'xs', tooltip: false }),
          onSelect: function () { setFilters({ person: person.id }); }
        });
      });
      if (!roster.length) items.push({ type: 'note', label: 'Katalog osób jest pusty.' });
      return { label: 'Filtr osoby', items: items };
    });

    nodes.sortButton = UI.button({ label: 'Termin', icon: 'sort', variant: 'ghost', size: 'sm', attrs: { id: 'tb-sort' } });
    Menu.bind(nodes.sortButton, function () {
      var current = store.getState().filters.sort;
      return {
        label: 'Sortowanie', align: 'end',
        items: [{ type: 'label', label: 'Sortuj według' }].concat(Object.keys(Query.SORTS).map(function (key) {
          return { type: 'radio', label: Query.SORTS[key], value: key, checked: current === key, onSelect: function () { setSort(key); } };
        }))
      };
    });

    nodes.columnsButton = UI.iconButton({ icon: 'columns', label: 'Widoczne kolumny', attrs: { id: 'tb-columns' } });
    Menu.bind(nodes.columnsButton, function () {
      var hidden = store.getState().prefs.hiddenColumns;
      return {
        label: 'Widoczne kolumny', align: 'end',
        items: [{ type: 'label', label: 'Pokaż kolumny' }].concat(E.ProjectList.COLUMNS.filter(function (c) { return c.optional; }).map(function (column) {
          return {
            type: 'checkbox', label: column.label, value: column.key, checked: hidden.indexOf(column.key) < 0, keepOpen: true,
            onSelect: function (checked) { toggleColumn(column.key, checked); }
          };
        }))
      };
    });

    nodes.clearFilters = UI.button({ label: 'Wyczyść filtry', variant: 'ghost', size: 'sm', icon: 'close', onClick: clearFilters, attrs: { id: 'tb-clear' } });
    nodes.tally = D.el('span', { class: 'toolbar__count', attrs: { 'aria-live': 'polite' } });

    nodes.view = UI.segmented({
      label: 'Sposób wyświetlania',
      iconsOnly: true,
      value: store.getState().prefs.view,
      items: [{ value: 'list', icon: 'list', title: 'Widok tabeli' }, { value: 'cards', icon: 'grid', title: 'Widok kart' }],
      onChange: setView
    });

    D.render(nodes.filters, [
      search.node,
      nodes.statusFilter.node,
      nodes.personFilter.node,
      nodes.clearFilters,
      D.el('span', { class: 'toolbar__spacer' }),
      nodes.tally,
      nodes.sortButton,
      nodes.columnsButton,
      nodes.view.node
    ]);
  }

  function buildTeamToolbar() {
    var search = UI.searchInput({
      id: 'tf-search', placeholder: 'Szukaj osób', label: 'Szukaj osób po imieniu, nazwisku lub stanowisku', kbd: '/',
      class: 'toolbar__search',
      on: { input: function () { setTeamFilters({ query: nodes.teamSearch.value }); } }
    });
    nodes.teamSearch = search.input;

    nodes.roleFilter = filterButton('tf-role', 'Rola', 'filter', function () {
      var current = store.getState().teamFilters.role;
      return {
        label: 'Filtr roli',
        items: [{ type: 'radio', label: 'Wszystkie role', value: 'all', checked: current === 'all', onSelect: function () { setTeamFilters({ role: 'all' }); } }, { type: 'separator' }]
          .concat(Object.keys(Team.ORG_ROLES).map(function (key) {
            return { type: 'radio', label: Team.ORG_ROLES[key], value: key, checked: current === key, onSelect: function () { setTeamFilters({ role: key }); } };
          }))
      };
    });

    var inactive = UI.switchControl({
      id: 'tf-inactive', label: 'Pokaż wyłączone',
      onChange: function (checked) { setTeamFilters({ showInactive: checked }); }
    });
    nodes.inactiveSwitch = inactive.input;
    nodes.teamTally = D.el('span', { class: 'toolbar__count', attrs: { 'aria-live': 'polite' } });

    D.render(nodes.teamFilters, [
      search.node,
      nodes.roleFilter.node,
      inactive.node,
      D.el('span', { class: 'toolbar__spacer' }),
      nodes.teamTally
    ]);
  }

  /* ---------- rysowanie ekranów ---------- */

  function renderProjects(state) {
    var all = state.workspace.projects;
    var visible = Query.filterAndSort(all, state.filters);
    var filtered = state.filters.query.trim() || state.filters.status !== 'all' || state.filters.person !== 'all';
    var overdue = all.filter(function (p) { return Progress.isOverdue(p); }).length;
    var running = all.filter(function (p) { return p.status === 'active'; }).length;

    D.render(nodes.projectsSummary, all.length ? [
      D.el('span', { text: F.count(all.length, 'projekt', 'projekty', 'projektów') }),
      D.el('span', { class: 'detail__dot', text: '·', attrs: { 'aria-hidden': 'true' } }),
      D.el('span', { text: 'w realizacji ' + running }),
      overdue ? D.el('span', { class: 'detail__dot', text: '·', attrs: { 'aria-hidden': 'true' } }) : null,
      overdue ? D.el('span', { class: 't-danger' }, [D.el('span', { text: 'po terminie ' + overdue })]) : null
    ] : [D.el('span', { text: 'Portfel projektów biura: terminy umów, postęp i zespół.' })]);

    var person = Team.findPerson(people(), state.filters.person);
    nodes.statusFilter.set(state.filters.status === 'all' ? 'Wszystkie' : Model.PROJECT_STATUS[state.filters.status], state.filters.status !== 'all');
    nodes.personFilter.set(person ? Team.fullName(person) : 'Wszystkie', state.filters.person !== 'all');
    nodes.clearFilters.hidden = !filtered;
    nodes.tally.textContent = filtered ? 'Pasuje ' + visible.length + ' z ' + all.length : '';
    nodes.sortButton.querySelector('span').textContent = SORT_LABEL[state.filters.sort] || 'Termin';
    nodes.sortButton.setAttribute('aria-label', 'Sortowanie: ' + (Query.SORTS[state.filters.sort] || ''));
    nodes.columnsButton.hidden = state.prefs.view !== 'list';
    nodes.view.set(state.prefs.view);
    nodes.filters.hidden = !all.length;
    nodes.newProject.hidden = !all.length;

    var ctx = { state: state, people: people(), actions: actions };

    // Pasek akcji zbiorczych
    var selectedIds = visible.filter(function (p) { return state.selection[p.id]; }).map(function (p) { return p.id; });
    if (selectedIds.length && state.prefs.view === 'list') {
      var statusBtn = UI.button({ label: 'Zmień status', variant: 'ghost', size: 'sm', iconRight: 'chevronDown' });
      Menu.bind(statusBtn, function () {
        return {
          label: 'Zmień status zaznaczonych',
          items: Object.keys(Model.PROJECT_STATUS).map(function (key) {
            return { label: Model.PROJECT_STATUS[key], leading: UI.statusGlyph('project', key), onSelect: function () { setProjectStatus(selectedIds, key); } };
          })
        };
      });
      D.patch(nodes.bulk, [D.el('div', { class: 'bulkbar', attrs: { role: 'region', 'aria-label': 'Działania na zaznaczonych' } }, [
        D.el('span', { class: 'bulkbar__count', text: 'Zaznaczono ' + selectedIds.length }),
        D.el('span', { class: 'bulkbar__sep' }),
        statusBtn,
        UI.button({ label: 'Usuń', icon: 'trash', variant: 'ghost', size: 'sm', attrs: { id: 'bulk-delete' }, onClick: function () { deleteProjects(selectedIds); } }),
        D.el('span', { class: 'toolbar__spacer' }),
        UI.iconButton({ icon: 'close', label: 'Odznacz wszystkie', kbd: 'Esc', size: 'sm', onClick: clearSelection })
      ])]);
    } else {
      D.clear(nodes.bulk);
    }

    var content;
    if (!all.length) {
      content = D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'folder',
        title: 'Nie ma jeszcze żadnego projektu',
        text: 'Projekt łączy umowę, etapy ze standardu ETROM, zadania i zespół. Załóż pierwszy albo dodaj dane przykładowe, żeby zobaczyć program w działaniu.',
        actions: [
          UI.button({ label: 'Nowy projekt', icon: 'plus', variant: 'primary', onClick: openCreate }),
          UI.button({ label: 'Dodaj dane przykładowe', icon: 'sparkle', variant: 'secondary', attrs: { id: 'empty-demo' }, onClick: loadDemo })
        ]
      })]);
    } else if (!visible.length) {
      content = D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'search',
        title: 'Nic nie pasuje do filtrów',
        text: 'Żaden projekt nie spełnia wybranych warunków. Zmień frazę albo wyczyść filtry.',
        actions: [UI.button({ label: 'Wyczyść filtry', variant: 'secondary', onClick: clearFilters })]
      })]);
    } else if (state.prefs.view === 'cards') {
      content = E.ProjectList.cards(visible, ctx);
    } else {
      content = E.ProjectList.table(visible, ctx);
    }
    D.patch(nodes.list, [content]);
  }

  function renderProject(state, project) {
    var motion = buildMotion(state, project);
    var ctx = { state: state, people: people(), actions: actions, motion: motion };
    D.patch(nodes.projectView, E.ProjectDetail.projectDetail(project, ctx));
    if (motion.progressFrom != null) animateProgress(nodes.projectView, motion.progressFrom);
    commitMotion(project);
  }

  /** Pasek postępu startuje od poprzedniej wartości — widać, co zmieniła ostatnia czynność. */
  function animateProgress(container, from) {
    var bar = container.querySelector('.summary .progress');
    if (!bar || Motion.prefersReducedMotion()) return;
    var target = bar.style.getPropertyValue('--value');
    var fill = bar.querySelector('.progress__fill');
    fill.style.transition = 'none';
    bar.style.setProperty('--value', from + '%');
    void fill.offsetWidth;
    fill.style.transition = '';
    bar.style.setProperty('--value', target);
  }

  function renderTeam(state) {
    var roster = state.workspace.people || [];
    var visible = E.TeamScreen.visiblePeople(roster, state.teamFilters);
    var activeCount = roster.filter(function (p) { return p.active !== false; }).length;
    var filtered = state.teamFilters.query.trim() || state.teamFilters.role !== 'all';

    nodes.teamSummary.textContent = roster.length
      ? F.count(activeCount, 'osoba aktywna', 'osoby aktywne', 'osób aktywnych')
        + (roster.length - activeCount ? ' · wyłączone z obiegu ' + (roster.length - activeCount) : '')
      : 'Katalog osób biura: role w organizacji i funkcje w projektach.';
    nodes.roleFilter.set(state.teamFilters.role === 'all' ? 'Wszystkie' : Team.ORG_ROLES[state.teamFilters.role], state.teamFilters.role !== 'all');
    nodes.teamTally.textContent = filtered ? 'Pasuje ' + visible.length + ' z ' + roster.length : '';
    nodes.teamFilters.hidden = !roster.length;
    nodes.newPerson.hidden = !roster.length;

    D.patch(nodes.teamList, [E.TeamScreen.teamList(roster, state.workspace.projects, state.teamFilters, actions)]);
  }

  function renderNotice(state) {
    if (!state.notice) { D.clear(nodes.notice); return; }
    D.render(nodes.notice, [UI.alert({ tone: 'info', text: state.notice, onDismiss: function () { store.set({ notice: '' }); } })]);
  }

  function renderDrawer(state) {
    var current = state.form || state.personForm || state.taskForm || state.stageForm || null;
    if (current === lastForm) return;
    lastForm = current;

    if (!current) {
      if (drawerEl) Dialog.closeDrawer();
      return;
    }

    var settings = {};
    if (current === state.personForm) {
      settings.title = current.draft.id != null ? 'Edytuj osobę' : 'Nowa osoba';
      settings.subtitle = current.draft.id != null ? 'Zmiany widać od razu we wszystkich projektach.' : 'Osoba trafi do katalogu biura.';
      settings.content = E.PersonForm.personForm(current.draft, current.errors, { onSubmit: submitPerson, onCancel: function () { store.set({ personForm: null }); } });
    } else if (current === state.taskForm) {
      var project = findProject(current.projectId);
      var stage = stageOf(current.projectId, current.stageId);
      var roster = project
        ? projectRoster(project).map(function (id) { return Team.findPerson(state.workspace.people, id); }).filter(Boolean)
        : [];
      settings.title = current.draft.id != null ? 'Edytuj zadanie' : 'Nowe zadanie';
      settings.subtitle = (project ? project.code : '') + (stage ? ' · ' + Model.describeStage(stage).name : '');
      settings.content = E.TaskForm.taskForm(current.draft, current.errors, { onSubmit: submitTask, onCancel: function () { store.set({ taskForm: null }); } }, roster);
    } else if (current === state.stageForm) {
      var owner = findProject(current.projectId);
      settings.title = 'Etap spoza standardu';
      settings.subtitle = owner ? owner.code + ' · ' + owner.name : '';
      settings.content = E.StageForm.stageForm(current.draft, current.errors, { onSubmit: submitCustomStage, onCancel: function () { store.set({ stageForm: null }); } });
    } else {
      var editing = current.draft.id != null;
      settings.title = editing ? 'Edytuj projekt' : 'Nowy projekt';
      settings.subtitle = editing ? current.draft.code : 'Dane umowy, zespół i etapy ze standardu.';
      settings.content = E.ProjectForm.projectForm(current.draft, current.errors, { onSubmit: submitForm, onCancel: function () { store.set({ form: null }); } }, state.workspace.people || []);
    }

    if (drawerEl) {
      Dialog.updateDrawer(drawerEl, settings);
      return;
    }

    drawerEl = Dialog.openDrawer(Object.assign({}, settings, {
      onClose: function () {
        drawerEl = null;
        lastForm = null;
        var live = store.getState();
        if (live.form || live.personForm || live.taskForm || live.stageForm) {
          store.set({ form: null, personForm: null, taskForm: null, stageForm: null });
        }
      }
    }));
  }

  function renderScreen(state) {
    var route = state.route;
    nodes.views.projects.hidden = route.name !== 'projects';
    nodes.views.project.hidden = route.name !== 'project';
    nodes.views.team.hidden = route.name !== 'team';

    var project = route.name === 'project' ? findProject(route.projectId) : null;
    E.Shell.render(state, project);
    nodes.app.classList.toggle('app--nav-open', !!state.navOpen);
    nodes.navToggle.setAttribute('aria-expanded', String(!!state.navOpen));

    if (route.name === 'team') {
      document.title = 'Zespół · ETROM';
      renderTeam(state);
    } else if (route.name === 'project') {
      document.title = (project ? project.code + ' ' + project.name : 'Nie znaleziono projektu') + ' · ETROM';
      renderProject(state, project);
    } else {
      document.title = 'Projekty · ETROM';
      renderProjects(state);
    }
  }

  function persist(state) {
    if (state.workspace === lastWorkspace) return;
    lastWorkspace = state.workspace;
    E.Shell.setSaved(storage.save(state.workspace).ok);
  }

  function renderAll(state) {
    renderNotice(state);
    renderScreen(state);
    renderDrawer(state);
    persist(state);
  }

  /* =========================================================
     Klawiatura
     ========================================================= */

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function onKeydown(event) {
    if (event.defaultPrevented) return;

    if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      openPalette();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape' && store.getState().navOpen) {
      store.set({ navOpen: false });
      nodes.navToggle.focus();
      return;
    }
    if (isTyping(event.target)) return;
    if (Dialog.anyOpen() || E.Palette.isOpen() || Menu.isOpen()) return;

    var state = store.getState();
    var route = state.route.name;

    if (event.key === 'Escape') {
      if (state.navOpen) { store.set({ navOpen: false }); return; }
      if (Object.keys(state.selection).length) { clearSelection(); return; }
      return;
    }
    if (event.key === '/') {
      if (route === 'project') return;
      event.preventDefault();
      var box = route === 'team' ? nodes.teamSearch : nodes.search;
      box.focus();
      box.select();
      return;
    }
    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      if (route === 'team') openNewPerson();
      else openCreate();
      return;
    }
    if ((event.key === 'e' || event.key === 'E') && route === 'project' && findProject(state.route.projectId)) {
      event.preventDefault();
      openEdit(state.route.projectId);
    }
  }

  /* =========================================================
     Start
     ========================================================= */

  function init() {
    nodes.app = D.byId('app');
    nodes.notice = D.byId('notice');
    nodes.filters = D.byId('filters');
    nodes.bulk = D.byId('bulk-bar');
    nodes.list = D.byId('project-list');
    nodes.projectsSummary = D.byId('projects-summary');
    nodes.projectView = D.byId('project-view');
    nodes.teamFilters = D.byId('team-filters');
    nodes.teamList = D.byId('team-list');
    nodes.teamSummary = D.byId('team-summary');
    nodes.fileInput = D.byId('import-file');
    nodes.views = { projects: D.byId('view-projects'), project: D.byId('view-project'), team: D.byId('view-team') };

    E.Shell.build({
      sidebar: D.byId('sidebar'),
      crumb: D.byId('crumb'),
      save: D.byId('save-state'),
      getState: store.getState,
      actions: {
        openPalette: openPalette,
        setPref: setPref,
        loadDemo: loadDemo,
        exportJson: exportJson,
        importJson: function () { nodes.fileInput.click(); },
        clearAll: clearAll,
        closeNav: function () { store.set({ navOpen: false }); }
      }
    });

    nodes.newProject = D.byId('action-new');
    nodes.newPerson = D.byId('action-new-person');
    nodes.newProject.addEventListener('click', openCreate);
    nodes.newPerson.addEventListener('click', openNewPerson);
    nodes.navToggle = D.byId('action-nav');
    nodes.navToggle.addEventListener('click', function () {
      store.set({ navOpen: !store.getState().navOpen });
      // Otwarty panel na wąskim ekranie przejmuje fokus — klawiatura nie zostaje pod zasłoną.
      if (store.getState().navOpen) window.setTimeout(function () { D.byId('action-search').focus(); }, 50);
    });
    D.byId('sidebar-scrim').addEventListener('click', function () { store.set({ navOpen: false }); });
    nodes.fileInput.addEventListener('change', function () {
      if (nodes.fileInput.files && nodes.fileInput.files[0]) importJson(nodes.fileInput.files[0]);
      nodes.fileInput.value = '';
    });
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('hashchange', onHashChange);

    var prefs = prefsStore.load();
    applyPrefs(prefs);
    store.set({ prefs: prefs });

    buildProjectsToolbar();
    buildTeamToolbar();

    var loaded = storage.load();
    lastWorkspace = loaded.workspace;
    var route = parseRoute(location.hash);
    store.subscribe(renderAll);
    store.update(function (state) {
      return Object.assign({}, state, {
        workspace: loaded.workspace,
        route: route,
        screen: route.name === 'team' ? 'team' : 'projects',
        notice: loaded.importedFromLegacy
          ? 'Wczytano dane ze starszej wersji ETROM (' + F.count(loaded.workspace.projects.length, 'projekt', 'projekty', 'projektów') + '). Stary zapis pozostał nietknięty.'
          : (loaded.warning || '')
      });
    });
    renderAll(store.getState());
    E.Shell.setSaved(true);
    document.documentElement.classList.add('is-ready');
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
    openProject: openProject,
    goTo: goTo
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
