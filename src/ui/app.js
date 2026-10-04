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

  var SORT_LABEL = { deadline: 'Termin', name: 'Nazwa', code: 'Numer' };

  var store = E.Store.createStore({
    workspace: Model.emptyWorkspace(),
    route: { name: 'projects' },
    screen: 'projects',
    filters: { query: '', status: 'all', sort: 'code', dir: 'asc', person: 'all', health: 'all', horizon: 0 },
    teamFilters: { query: '', role: 'all', showInactive: false },
    prefs: E.Prefs.defaults(),
    selection: {},
    page: 0,
    taskFilter: 'open',
    kanban: { stage: 'all', person: 'all', mine: false, group: 'none' },
    form: null,
    personForm: null,
    stageForm: null,
    timeForm: null,
    mailForm: null,
    mailView: { direction: 'all', waiting: false, query: '' },
    analysisProject: null,
    timeTab: 'sheet',
    timeMode: 'week',
    timeOffset: 0,
    timePerson: null,
    timeOpen: {},
    planCell: null,
    analysisTab: 'overview',
    feedEditing: null,
    feedFilter: 'all',
    feedLimit: 20,
    feedOpen: [],
    myView: 'all',
    taskForm: null,
    expandedStages: {},
    showDone: {},
    stageGroup: false,
    inspector: null,
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

  var TABS = ['etapy', 'budzet', 'zadania', 'korespondencja', 'zespol', 'czas', 'analiza', 'aktywnosc'];

  function parseRoute(hash) {
    var parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'zespol') return { name: 'team' };
    if (parts[0] === 'biblioteka') return { name: 'library' };
    if (parts[0] === 'moja-praca') return { name: 'mywork' };
    if (parts[0] === 'skrzynka') return { name: 'mywork' }; // stare linki: Skrzynka jest teraz częścią „Mojej pracy”
    if (parts[0] === 'aktualnosci') return { name: 'feed' };
    if (parts[0] === 'analiza') return { name: 'analysis' };
    if (parts[0] === 'czas') return { name: 'time' };
    if (parts[0] === 'projekty' && parts[1] && /^\d+$/.test(parts[1])) {
      return { name: 'project', projectId: Number(parts[1]), tab: TABS.indexOf(parts[2]) >= 0 ? parts[2] : 'etapy' };
    }
    if (parts[0] === 'projekty') return { name: 'projects' };
    return { name: 'mywork' };
  }

  function screenOf(route) {
    return route.name === 'library' ? 'library' : route.name === 'team' ? 'team' : (route.name === 'mywork' ? 'mywork' : (route.name === 'time' ? 'time' : (route.name === 'feed' ? 'feed' : (route.name === 'analysis' ? 'analysis' : 'projects'))));
  }

  function routeHash(route) {
    if (route.name === 'team') return '#/zespol';
    if (route.name === 'library') return '#/biblioteka';
    if (route.name === 'mywork') return '#/moja-praca';
    if (route.name === 'feed') return '#/aktualnosci';
    if (route.name === 'analysis') return '#/analiza';
    if (route.name === 'time') return '#/czas';
    if (route.name === 'project') return '#/projekty/' + route.projectId + (route.tab && route.tab !== 'etapy' ? '/' + route.tab : '');
    return '#/projekty';
  }

  function navigate(route) {
    var hash = routeHash(route);
    if (location.hash === hash) { applyRoute(route); return; }
    location.hash = hash;
  }

  // Element, z którego otwarto projekt — jego nazwa płynnie przechodzi w tytuł przestrzeni roboczej.
  var titleSource = null;
  var titleReturn = null;

  function clearTitleNames() {
    var named = document.querySelectorAll('[data-project-title]');
    for (var i = 0; i < named.length; i += 1) named[i].style.removeProperty('view-transition-name');
    titleReturn = null;
  }

  function applyRoute(route) {
    var state = store.getState();
    var changedScreen = state.route.name !== route.name || state.route.projectId !== route.projectId;
    var changedTab = !changedScreen && state.route.tab !== route.tab;
    var patch = {
      route: route,
      screen: screenOf(route),
      navOpen: false,
      selection: changedScreen ? {} : state.selection
    };
    if (route.name === 'project' && changedScreen) {
      patch.prefs = E.Prefs.touchRecent(state.prefs, route.projectId);
      prefsStore.save(patch.prefs);
      patch.inspector = null;
    } else if (changedScreen) {
      patch.inspector = null;
    }
    // Powrót z projektu na listę: nazwa wraca do swojego wiersza.
    if (state.route.name === 'project' && route.name === 'projects') titleReturn = state.route.projectId;

    var commit = function () {
      store.set(patch);
      if (changedScreen) nodes.scroller.scrollTop = 0;
    };
    if (changedScreen || changedTab) {
      if (titleSource && route.name === 'project') {
        titleSource.style.setProperty('view-transition-name', 'project-title');
      }
      titleSource = null;
      var transition = Motion.withTransition(commit);
      if (transition) transition.finished.then(clearTitleNames, clearTitleNames);
      else clearTitleNames();
    } else {
      commit();
    }
  }

  function onHashChange() {
    applyRoute(parseRoute(location.hash));
    // Po zmianie ekranu fokus trafia na jego nagłówek — czytnik ekranu ogłasza nowe miejsce.
    // Zwłoka: przejście widoku podmienia treść dopiero w następnej klatce.
    var wanted = 'view-' + (parseRoute(location.hash).name === 'projects' ? 'projects' : parseRoute(location.hash).name);
    var tries = 0;
    var focusHeading = function () {
      if (Dialog.anyOpen()) return;
      var view = document.getElementById(wanted);
      // Przejście widoku może jeszcze trwać: czekamy, aż docelowy ekran będzie widoczny.
      if ((!view || view.hidden) && tries < 30) { tries += 1; window.setTimeout(focusHeading, 60); return; }
      var heading = view && view.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    };
    window.setTimeout(focusHeading, 80);
  }

  function goTo(screen) {
    navigate({ name: screen === 'library' ? 'library' : screen === 'team' ? 'team' : (screen === 'mywork' ? 'mywork' : (screen === 'time' ? 'time' : (screen === 'feed' ? 'feed' : (screen === 'analysis' ? 'analysis' : 'projects')))) });
  }

  function openProject(id, tab) {
    var source = document.querySelector('.view:not([hidden]) [data-project-title="' + id + '"]');
    titleSource = source || null;
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
          position: person.position, orgRole: person.orgRole, cooperation: person.cooperation,
          hourlyCost: person.hourlyCost ? String(person.hourlyCost) : ''
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
    // Stawkę godzinową ustawia tylko zarząd; inni nie nadpisują jej przy edycji osoby.
    if (!E.Budget.isManagement(store.getState().prefs.me, list)) {
      var kept = editing ? findPerson(values.id) : null;
      check.value.hourlyCost = kept && kept.hourlyCost ? kept.hourlyCost : 0;
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
    store.set({ form: { draft: { status: 'planned', code: Model.nextProjectCode(store.getState().workspace.projects, new Date()) }, errors: {} } });
  }

  function openEdit(id) {
    var project = findProject(id);
    if (!project) return;
    store.set({
      form: {
        draft: {
          id: project.id, code: project.code, name: project.name, client: project.client,
          status: project.status, deadline: project.deadline, contractValue: project.contractValue, color: project.color, kind: project.kind, scope: project.scope,
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
      .map(function (entry) { return Model.createStage(entry.id, { hours: values.stageHours && values.stageHours[entry.id], weight: values.stageWeights && values.stageWeights[entry.id] }); });
    var created = null;
    setWorkspace(function (list) {
      created = Model.createProject(Object.assign({}, check.value, { stages: stages, team: team }), list);
      return list.concat([created]);
    });
    store.set({ form: null });
    Toast.show({
      message: 'Utworzono projekt ' + created.code,
      tone: 'success',
      actionLabel: stages.length ? 'Zaplanuj' : 'Otwórz',
      onAction: function () { openProject(created.id, stages.length && canPlan(created) ? 'budzet' : undefined); },
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

    // Dane zmieniają się od razu — animacja nigdy nie opóźnia skutku działania.
    setWorkspace(function (list) { return list.filter(function (p) { return ids.indexOf(p.id) < 0; }); });
    store.update(function (state) {
      var selection = Object.assign({}, state.selection);
      ids.forEach(function (id) { delete selection[id]; });
      return Object.assign({}, state, { selection: selection });
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
    store.set({ stageForm: { projectId: projectId, stageId: null, custom: true, draft: { domain: 'general', kind: 'docs', hours: '8' }, errors: {} } });
  }

  /** Zmiana nazwy (etap własny), godzin i terminu istniejącego etapu. */
  function openEditStage(projectId, stageId) {
    var stage = stageOf(projectId, stageId);
    if (!stage) return;
    var info = Model.describeStage(stage);
    store.set({ stageForm: {
      projectId: projectId, stageId: stageId, custom: info.isCustom,
      draft: { name: info.name, domain: info.domain, kind: info.kind, hours: String(stage.hours) },
      errors: {}
    } });
  }

  function submitCustomStage(values) {
    var form = store.getState().stageForm;
    var project = form && findProject(form.projectId);
    if (!project) return;

    if (form.stageId) {
      var current = stageOf(project.id, form.stageId);
      var updated = Model.updateStage(current, values);
      if (updated.valid && String(values.adjustHours || '').trim() !== '') {
        if (!E.Budget.canAdjust(currentMe(), people())) {
          updated = { valid: false, errors: { adjustHours: 'Korekty dodaje tylko zarząd.' }, stage: null };
        } else {
          var adjusted = E.Budget.addAdjustment(updated.stage, { hours: values.adjustHours, note: values.adjustNote }, currentMe(), new Date());
          updated = adjusted.valid ? { valid: true, errors: {}, stage: adjusted.stage } : { valid: false, errors: { adjustHours: adjusted.errors.hours || adjusted.errors.note }, stage: null };
        }
      }
      if (!updated.valid) {
        store.set({ stageForm: Object.assign({}, form, { draft: values, errors: updated.errors }) });
        return;
      }
      pendingFlash = { projectId: project.id, stageId: form.stageId };
      mapStage(project.id, form.stageId, function () { return updated.stage; });
      store.set({ stageForm: null });
      return;
    }

    var made = Model.createCustomStage(values, project.stages);
    if (!made.valid) {
      store.set({ stageForm: Object.assign({}, form, { draft: values, errors: made.errors }) });
      return;
    }
    pendingFlash = { projectId: project.id, stageId: made.stage.id };
    mapProject(project.id, function (current) {
      return Object.assign({}, current, { stages: current.stages.concat([made.stage]) });
    });
    store.set({ stageForm: null });
  }

  function removeAdjustment(projectId, stageId, adjustmentId) {
    if (!E.Budget.canAdjust(currentMe(), people())) return;
    mapStage(projectId, stageId, function (stage) { return E.Budget.removeAdjustment(stage, adjustmentId); });
    // Nowy obiekt formularza wymusza ponowne narysowanie panelu z aktualną listą korekt.
    var open = store.getState().stageForm;
    if (open) store.set({ stageForm: Object.assign({}, open) });
  }

  function toggleStage(projectId, stageId) {
    var key = projectId + ':' + stageId;
    var project = findProject(projectId);
    var stage = stageOf(projectId, stageId);
    if (!project || !stage) return;
    store.update(function (state) {
      var expandedStages = Object.assign({}, state.expandedStages);
      expandedStages[key] = !E.StageList.isOpen(state.expandedStages, project, stage);
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

  function taskFormMeta(projectId, stageId) {
    var stage = stageOf(projectId, stageId);
    return { procedure: !!stage && E.Planning.isProcedure(stage), dayHours: E.Planning.getRules().dayHours };
  }

  function openAddTask(projectId, stageId) {
    store.set({ taskForm: { projectId: projectId, stageId: stageId, draft: Object.assign({ workload: 'medium', assignees: [] }, taskFormMeta(projectId, stageId)), errors: {} } });
  }

  function openEditTask(projectId, stageId, taskId) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    store.set({
      taskForm: {
        projectId: projectId, stageId: stageId,
        draft: {
          id: task.id, name: task.name, deadline: task.deadline, workload: task.workload, estimate: task.estimate || '',
          important: task.important, description: task.description, assignees: (task.assignees || []).slice(), mailId: task.mailId || '',
          draft: task.draft === true, fromReserve: task.fromReserve === true,
          procedure: taskFormMeta(projectId, stageId).procedure, dayHours: E.Planning.getRules().dayHours
        },
        errors: {}
      }
    });
  }

  function submitTask(values) {
    var form = store.getState().taskForm;
    if (!form) return;
    var project = findProject(form.projectId);
    if (values.id == null && values.stageId && stageOf(form.projectId, values.stageId)) form = Object.assign({}, form, { stageId: values.stageId });
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
      // Pismo przerobione na zadanie przestaje wymagać reakcji: sprawę prowadzi zadanie.
      if (created.mailId) setMail(function (current) { return current.map(function (e) { return e.id === created.mailId ? Object.assign({}, e, { needsAction: false }) : e; }); });
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
    var result = Tasks.moveTask(task, next, reason, currentMe() || '');
    if (!result.ok) {
      Toast.show({ message: result.error, tone: 'danger' });
      return;
    }
    pendingFlash = { projectId: projectId, taskId: taskId };
    mapTask(projectId, stageId, taskId, function () { return result.task; });
  }


  /* =========================================================
     Dziennik korespondencji
     ========================================================= */

  var Mail = E.Mail;

  function mailList() {
    return store.getState().workspace.mail || [];
  }

  function setMail(producer) {
    updateWorkspace(function (workspace) {
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, mail: producer(workspace.mail || []) });
    });
  }

  function openAddMail(projectId, direction, preset) {
    var draft = Object.assign({ direction: direction || 'in', kind: direction === 'out' ? 'reply' : 'other', registeredDate: Mail.todayKey(new Date()) }, preset || {});
    store.set({ mailForm: { mode: 'new', projectId: projectId, draft: draft, errors: {} } });
  }

  function openEditMail(id) {
    var entry = mailList().filter(function (e) { return e.id === id; })[0];
    if (!entry) return;
    var locked = mailList().some(function (e) { return e.replyTo === id; });
    store.set({ mailForm: { mode: 'edit', projectId: entry.projectId, locked: locked, draft: Object.assign({}, entry), errors: {} } });
  }

  /** Odpowiedź na pismo przychodzące: wychodzące z adresatem i tematem z oryginału. */
  function replyToMail(id) {
    var entry = mailList().filter(function (e) { return e.id === id; })[0];
    if (!entry) return;
    openAddMail(entry.projectId, 'out', {
      kind: 'reply', counterparty: entry.counterparty,
      subject: /^Odp\./i.test(entry.subject) ? entry.subject : 'Odp.: ' + entry.subject,
      number: entry.number, replyTo: entry.id
    });
  }

  /** Otwarte zadania powstałe z pisma (do zaproponowania zamknięcia po odpowiedzi). */
  function openMailTasks(projectId, mailId) {
    var project = findProject(projectId);
    return project ? Mail.linkedTasks(project, mailId, [], new Date()).filter(function (r) { return r.task.status !== 'done'; })
      .map(function (r) { return { projectId: projectId, stageId: r.stage.id, taskId: r.task.id }; }) : [];
  }

  function submitMail(values) {
    var form = store.getState().mailForm;
    if (!form) return;
    var list = mailList();
    var meta = { personId: currentMe() || '', now: new Date() };
    var result = values.id
      ? Mail.update(list, values.id, values, meta)
      : Mail.create(list, form.projectId, values, meta);
    if (!result.valid) {
      store.set({ mailForm: Object.assign({}, form, { draft: values, errors: result.errors }) });
      return;
    }
    setMail(function () { return result.entries; });
    store.set({ mailForm: null });
    var saved = result.entry;
    var message = (values.id ? 'Zapisano ' : 'Wpisano do dziennika: ') + saved.regNo + '.';
    // Odpowiedź załatwia pismo — jeśli zostały po nim otwarte zadania, proponujemy ich zamknięcie.
    var open = !values.id && saved.direction === 'out' && saved.replyTo ? openMailTasks(saved.projectId, saved.replyTo) : [];
    if (open.length) {
      Toast.show({
        message: message + ' Zadań z pisma otwartych: ' + open.length + '.', tone: 'success', timeout: 9000,
        actionLabel: open.length === 1 ? 'Zamknij zadanie' : 'Zamknij zadania',
        onAction: function () { open.forEach(function (row) { moveTaskStatus(row.projectId, row.stageId, row.taskId, 'done'); }); }
      });
    } else {
      Toast.show({ message: message, tone: 'success', timeout: 3500 });
    }
  }

  function toggleMailAction(id) {
    setMail(function (current) { return current.map(function (e) { return e.id === id ? Object.assign({}, e, { needsAction: !e.needsAction }) : e; }); });
  }

  /* ---------- biblioteka ---------- */

  function setLibrary(producer) {
    updateWorkspace(function (workspace) {
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, library: producer(E.Library.normalize(workspace.library)) });
    });
  }
  function canEditLibrary() {
    var st = store.getState();
    return E.Budget.isManagement(st.prefs.me, st.workspace.people || []);
  }
  function libraryChange(compute) {
    if (!canEditLibrary()) { Toast.show({ message: 'Bibliotekę zmienia zarząd. Wybierz siebie w Zespole.', tone: 'danger' }); return; }
    var error = '';
    setLibrary(function (lib) { var r = compute(lib); if (r && r.error !== undefined) { error = r.error; return r.library; } return r; });
    if (error) Toast.show({ message: error, tone: 'danger' });
  }
  function libAddTask(stageId, name) { libraryChange(function (lib) { return E.Library.addTask(lib, stageId, name); }); }
  function libRenameTask(stageId, index, name) { libraryChange(function (lib) { return E.Library.renameTask(lib, stageId, index, name); }); }
  function libRemoveTask(stageId, index) { libraryChange(function (lib) { return E.Library.removeTask(lib, stageId, index); }); }
  function libResetTasks(stageId) { libraryChange(function (lib) { return E.Library.resetTasks(lib, stageId); }); }

  function deleteMail(id) {
    var list = mailList();
    var index = list.findIndex(function (e) { return e.id === id; });
    if (index < 0) return;
    var removed = list[index];
    var linked = list.filter(function (e) { return e.replyTo === id; }).map(function (e) { return e.id; });
    setMail(function (current) { return Mail.remove(current, id); });
    Toast.show({
      message: 'Usunięto wpis ' + removed.regNo + '.',
      actionLabel: 'Cofnij',
      onAction: function () {
        setMail(function (current) {
          var copy = current.map(function (e) { return linked.indexOf(e.id) >= 0 ? Object.assign({}, e, { replyTo: id }) : e; });
          copy.splice(Math.min(index, copy.length), 0, removed);
          return copy;
        });
      }
    });
  }

  /** Zadanie z terminem odpowiedzi: w pierwszym etapie w toku (albo pierwszym), przypisane do lidera. */
  /** Otwiera formularz zadania wypełniony danymi pisma; zadanie zapamięta pismo (task.mailId). */
  function mailToTask(id) {
    var entry = mailList().filter(function (e) { return e.id === id; })[0];
    var project = entry && findProject(entry.projectId);
    if (!project) return;
    if (!project.stages.length) { Toast.show({ message: 'Projekt nie ma jeszcze etapów — dodaj etap, w którym zapiszesz pracę nad pismem.', tone: 'info', timeout: 5000 }); return; }
    var stage = project.stages.filter(function (s) { return s.status === 'working'; })[0]
      || project.stages.filter(function (s) { return s.status !== 'done'; })[0] || project.stages[0];
    var allowed = projectRoster(project);
    var assignees = project.team && project.team.leader && allowed.indexOf(project.team.leader) >= 0 ? [project.team.leader] : [];
    var verb = entry.direction === 'in' ? 'Odpowiedź na pismo ' : 'Pismo ';
    store.set({ taskForm: {
      projectId: project.id, stageId: stage.id, fromMail: { id: entry.id, regNo: entry.regNo, subject: entry.subject, counterparty: entry.counterparty },
      draft: {
        name: verb + entry.regNo + ': ' + entry.subject,
        deadline: '', workload: 'medium', important: entry.kind === 'summons',
        description: (entry.direction === 'in' ? 'Pismo od: ' : 'Pismo do: ') + entry.counterparty + (entry.number ? ' (' + entry.number + ')' : '') + '.',
        assignees: assignees, mailId: entry.id, stageId: stage.id
      },
      errors: {}
    } });
  }

  function mailReplyOptions(projectId, direction, selfId) {
    var other = direction === 'out' ? 'in' : 'out';
    return mailList().filter(function (e) { return e.projectId === projectId && e.direction === other && e.id !== selfId; })
      .sort(function (a, b) { return a.registeredDate < b.registeredDate ? 1 : -1; })
      .map(function (e) { return { value: e.id, label: e.regNo + ' · ' + (e.subject.length > 48 ? e.subject.slice(0, 47) + '…' : e.subject) }; });
  }

  /* =========================================================
     Zegar rejestracji czasu
     ========================================================= */

  var TL = E.TimeLog;

  function entries() {
    return store.getState().workspace.entries || [];
  }

  function setEntries(producer) {
    updateWorkspace(function (workspace) {
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, entries: producer(workspace.entries || []) });
    });
  }

  function currentMe() {
    var id = store.getState().prefs.me;
    return Team.findPerson(people(), id) ? id : null;
  }

  function runningTimer() {
    var me = currentMe();
    return me ? TL.running(entries(), me) : null;
  }

  function isTiming(projectId, stageId, taskId) {
    var run = runningTimer();
    return !!run && run.projectId === projectId && run.stageId === stageId && run.taskId === taskId;
  }

  /** Projekt, etap i zadanie wpisu; null dla elementów, które już usunięto. */
  function locateEntry(entry) {
    var project = findProject(entry.projectId);
    var stage = project && project.stages.filter(function (st) { return st.id === entry.stageId; })[0];
    var task = stage && (stage.tasks || []).filter(function (t) { return t.id === entry.taskId; })[0];
    return { project: project, stage: stage || null, task: task || null };
  }

  function requireMe() {
    var me = currentMe();
    if (me) return me;
    Toast.show({ message: 'Najpierw wybierz, kim jesteś — czas zapisuje się na osobę.', tone: 'info', timeout: 5000 });
    goTo('mywork');
    return null;
  }

  function toggleTimer(projectId, stageId, taskId) {
    if (isTiming(projectId, stageId, taskId)) { stopTimer(); return; }
    var me = requireMe();
    if (!me) return;
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    if (task.status === 'done') {
      Toast.show({ message: 'Zadanie jest zakończone. Cofnij je do „Do wykonania”, żeby dalej zapisywać czas.', tone: 'info', timeout: 5000 });
      return;
    }
    var result = TL.start(entries(), { personId: me, projectId: projectId, stageId: stageId, taskId: taskId, label: task.name }, new Date());
    setEntries(function () { return result.entries; });
    // Praca nad zadaniem oznacza, że jest w toku.
    if (task.status === 'todo' || task.status === 'changes') applyTaskMove(projectId, stageId, taskId, 'working', '');
    Toast.show({ message: 'Zegar włączony o ' + E.Timer.hm(new Date()) + ' · „' + task.name + '”.', tone: 'success', timeout: 4000 });
    window.setTimeout(checkBudget, 300);
    if (result.stopped) {
      var before = locateEntry(result.stopped);
      Toast.show({ message: 'Poprzedni zegar zatrzymany: ' + TL.duration(TL.minutes(result.stopped)) + ' na „' + (before.task ? before.task.name : result.stopped.label) + '”.', tone: 'info', timeout: 4000 });
    }
  }

  function stopTimer() {
    var me = currentMe();
    var run = me && TL.running(entries(), me);
    if (!run) return;
    if (TL.isForgotten(run)) { reminderSnooze[run.id] = 0; checkTimerReminder(); return; }
    var result = TL.stop(entries(), me, new Date());
    setEntries(function () { return result.entries; });
    var where = locateEntry(result.stopped);
    Toast.show({ message: 'Zakończono o ' + E.Timer.hm(new Date()) + ' (start ' + E.Timer.hm(result.stopped.start) + ') · ' + TL.duration(TL.minutes(result.stopped)) + ' na „' + (where.task ? where.task.name : result.stopped.label) + '”.', tone: 'success', timeout: 4000 });
  }

  /** Ostatnio zatrzymane zadanie osoby, które nadal jest otwarte. */
  function lastTimedTask() {
    var me = currentMe();
    if (!me) return null;
    var list = entries().filter(function (e) { return e.personId === me && e.end && e.taskId; })
      .sort(function (a, b) { return Date.parse(b.end) - Date.parse(a.end); });
    for (var i = 0; i < list.length; i += 1) {
      var found = locateEntry(list[i]);
      if (found && found.task && found.task.status !== 'done') return list[i];
    }
    return null;
  }

  function resumeLast() {
    var entry = lastTimedTask();
    if (!entry) return;
    toggleTimer(entry.projectId, entry.stageId, entry.taskId);
  }

  function toggleTimerKey() {
    var me = currentMe();
    if (!me) { requireMe(); return; }
    if (TL.running(entries(), me)) { stopTimer(); return; }
    if (lastTimedTask()) { resumeLast(); return; }
    Toast.show({ message: 'Zacznij od ▶ przy zadaniu — potem T wznawia ostatnie.', tone: 'info', timeout: 4000 });
  }

  function openTimeForm(spec) {
    var me = currentMe();
    var draft;
    var title = '';
    var hint = '';
    if (spec.mode === 'stop') {
      var run = entries().filter(function (e) { return e.id === spec.entryId; })[0];
      if (!run) return;
      var elapsed = TL.minutes(run);
      draft = { hours: String(Math.min(8, TL.hoursOf(elapsed))).replace('.', ','), note: '' };
      hint = 'Zegar chodzi od ' + F.dateTime(run.start.slice(0, 16)) + ' (' + TL.duration(elapsed) + '). Wpisz, ile godzin z tego naprawdę dotyczyło zadania.';
      store.set({ timeForm: { mode: 'stop', entryId: run.id, projectId: run.projectId, stageId: run.stageId, taskId: run.taskId, draft: draft, errors: {}, hint: hint } });
      return;
    }
    if (spec.mode === 'edit') {
      var entry = entries().filter(function (e) { return e.id === spec.entryId; })[0];
      if (!entry) return;
      var sameDay = TL.dayKey(entry.start) === TL.dayKey(entry.end);
      draft = { hours: sameDay ? '' : String(TL.hoursOf(TL.minutes(entry))).replace('.', ','), from: sameDay ? TL.clockOf(Date.parse(entry.start)) : '', to: sameDay ? TL.clockOf(Date.parse(entry.end)) : '', note: entry.note || '' };
      store.set({ timeForm: { mode: 'edit', entryId: entry.id, projectId: entry.projectId, stageId: entry.stageId, taskId: entry.taskId, draft: draft, errors: {} } });
      return;
    }
    if (!me && !requireMe()) return;
    var now = new Date();
    var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var day = spec.date || today;
    store.set({ timeForm: {
      mode: 'manual', projectId: spec.projectId, stageId: spec.stageId, taskId: spec.taskId,
      draft: { date: day, hours: '', from: spec.from || '', to: spec.to || '', note: '' }, errors: {},
      choices: spec.needsTask ? taskChoices(me) : null
    } });
  }

  /** Otwarte zadania osoby do listy wyboru: ostatnio używane na górze. */
  function taskChoices(personId) {
    var recent = {};
    entries().filter(function (e) { return e.personId === personId && e.taskId; })
      .sort(function (a, b) { return Date.parse(b.start) - Date.parse(a.start); })
      .forEach(function (e, i) { var k = e.projectId + '|' + e.stageId + '|' + e.taskId; if (!(k in recent)) recent[k] = i; });
    var out = [];
    (store.getState().workspace.projects || []).forEach(function (project) {
      (project.stages || []).forEach(function (stage) {
        (stage.tasks || []).forEach(function (task) {
          if (task.status === 'done' || (task.assignees || []).indexOf(personId) < 0) return;
          var key = project.id + '|' + stage.id + '|' + task.id;
          out.push({ value: key, label: project.code + ' · ' + task.name + ' (' + Model.describeStage(stage).name + ')', rank: key in recent ? recent[key] : 1e6 });
        });
      });
    });
    return out.sort(function (a, b) { return a.rank - b.rank; });
  }

  function submitTime(values) {
    var form = store.getState().timeForm;
    if (!form) return;
    var now = new Date();
    var me = currentMe();
    var fail = function (errors) { store.set({ timeForm: Object.assign({}, form, { draft: Object.assign({}, values, values.task !== undefined ? { task: values.task } : {}), errors: errors }) }); };

    if (form.mode === 'stop') {
      var hours = Number(String(values.hours).replace(',', '.'));
      if (!Number.isFinite(hours) || hours < 0) { fail({ hours: 'Podaj liczbę godzin (może być 0).' }); return; }
      var result = TL.stop(entries(), me, now, { minutes: Math.round(hours * 60) });
      var noted = values.note ? TL.update(result.entries, result.stopped.id, { note: values.note }, now) : null;
      setEntries(function () { return noted && noted.valid ? noted.entries : result.entries; });
      store.set({ timeForm: null });
      Toast.show({ message: 'Zapisano ' + TL.duration(Math.round(hours * 60)) + '.', tone: 'success', timeout: 4000 });
      return;
    }
    if (form.mode === 'edit') {
      var patch = values.from || values.to ? { from: values.from, to: values.to, note: values.note } : { hours: values.hours, note: values.note };
      var upd = TL.update(entries(), form.entryId, patch, now);
      if (!upd.valid) { fail(upd.errors); return; }
      setEntries(function () { return upd.entries; });
      store.set({ timeForm: null });
      return;
    }
    var target = { projectId: form.projectId, stageId: form.stageId, taskId: form.taskId };
    if (form.choices) {
      var parts = String(values.task || '').split('|');
      if (parts.length !== 3) { fail({ time: 'Wybierz zadanie.' }); return; }
      target = { projectId: Number(parts[0]), stageId: parts[1], taskId: parts[2] };
    }
    var task = taskOf(target.projectId, target.stageId, target.taskId);
    var added = TL.addManual(entries(), {
      personId: me, projectId: target.projectId, stageId: target.stageId, taskId: target.taskId,
      label: task ? task.name : '', date: values.date, hours: values.hours, from: values.from, to: values.to, note: values.note
    }, now);
    if (!added.valid) { fail(added.errors); return; }
    setEntries(function () { return added.entries; });
    store.set({ timeForm: null });
    Toast.show({ message: 'Dopisano ' + TL.duration(TL.minutes(added.entry)) + '.', tone: 'success', timeout: 3500 });
  }

  function deleteEntry(entryId) {
    var list = entries();
    var index = list.findIndex(function (e) { return e.id === entryId; });
    if (index < 0) return;
    var removed = list[index];
    setEntries(function (current) { return TL.remove(current, entryId); });
    Toast.show({
      message: 'Usunięto wpis ' + TL.duration(TL.minutes(removed)) + '.',
      actionLabel: 'Cofnij',
      onAction: function () {
        setEntries(function (current) {
          var copy = current.slice();
          copy.splice(Math.min(index, copy.length), 0, removed);
          return copy;
        });
      }
    });
  }


  /** Budżet etapu, na którym chodzi zegar (widok zgodny z zasadą: godziny tylko lider i zarząd). */
  function timerBudget(entry) {
    var found = entry && locateEntry(entry);
    if (!found || !found.project || !found.stage || !(Number(found.stage.hours) > 0)) return null;
    var v = E.Budget.view(found.project, found.stage, entries(), currentMe(), people(), new Date());
    var stageName = Model.describeStage(found.stage).name;
    var tip = 'Etap „' + stageName + '”: ' + v.percent + '% budżetu godzin' + (v.exact ? ' (' + String(Math.round(v.used * 10) / 10).replace('.', ',') + ' z ' + String(v.planned).replace('.', ',') + ' h)' : '');
    return { percent: v.percent, state: v.state, tip: tip, stage: stageName, code: found.project.code, key: found.project.id + '|' + found.stage.id };
  }

  /** Jednorazowe ostrzeżenie przy 80% i 100% budżetu etapu, na którym pracuje zegar. */
  var BUDGET_KEY = 'etrom.budgetWarned';
  function checkBudget() {
    var run = runningTimer();
    var b = run && timerBudget(run);
    if (!b || b.state === 'ok') return;
    var map = {};
    try { map = JSON.parse(localStorage.getItem(BUDGET_KEY) || '{}') || {}; } catch (e) { map = {}; }
    var mark = b.key + '|' + b.state;
    if (map[mark]) return;
    map[mark] = Date.now();
    try { localStorage.setItem(BUDGET_KEY, JSON.stringify(map)); } catch (e) { /* tryb prywatny */ }
    Toast.show({
      message: b.state === 'over'
        ? b.code + ' · etap „' + b.stage + '” przekroczył budżet godzin (' + b.percent + '%).'
        : b.code + ' · etap „' + b.stage + '” zużył już ' + b.percent + '% budżetu godzin.',
      tone: 'warning', timeout: 9000
    });
  }

  /* Ostatnia aktywność przy komputerze: do propozycji „zatrzymaj o…”. Zapisywana lokalnie,
     żeby po powrocie następnego dnia było wiadomo, kiedy człowiek faktycznie skończył. */
  var ACTIVE_KEY = 'etrom.lastActive';
  var lastActiveAt = Date.now();
  var previousActiveAt = 0;
  var sessionTouched = false;
  try { previousActiveAt = Number(localStorage.getItem(ACTIVE_KEY)) || 0; } catch (e) { previousActiveAt = 0; }
  function noteActivity() {
    var n = Date.now();
    sessionTouched = true;
    if (n - lastActiveAt < 15000) return;
    lastActiveAt = n;
    try { localStorage.setItem(ACTIVE_KEY, String(n)); } catch (e) { /* tryb prywatny */ }
  }
  function effectiveActivity() { return sessionTouched ? lastActiveAt : (previousActiveAt || lastActiveAt); }

  /**
   * Zegar, który chodzi po końcu dnia pracy albo od zbyt dawna: pytamy, kiedy faktycznie skończyła się praca.
   * Propozycje: ostatnia aktywność przy komputerze, koniec dnia, teraz, zostaw (ponów za 30 min).
   */
  var reminderSnooze = {};
  var reminderOpen = false;
  function checkTimerReminder() {
    var run = runningTimer();
    if (!run || reminderOpen || Dialog.anyOpen()) return;
    var now = Date.now();
    if (reminderSnooze[run.id] && reminderSnooze[run.id] > now) return;
    var prefs = store.getState().prefs;
    var endMin = TL.parseClock(prefs.dayEnd);
    var d = new Date(now);
    var nowMin = d.getHours() * 60 + d.getMinutes();
    var startMs = Date.parse(run.start);
    var sameDay = TL.dayKey(startMs) === TL.dayKey(now);
    var pastEnd = sameDay ? (endMin !== null && nowMin >= endMin && startMs < new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + endMin * 60000) : true;
    var forgotten = TL.isForgotten(run);
    if (!pastEnd && !forgotten) return;

    var found = locateEntry(run);
    var name = (found.task && found.task.name) || run.label || 'zadanie';
    var dayEndMs = endMin !== null ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + endMin * 60000 : null;
    var activity = effectiveActivity();
    var idle = now - activity >= 10 * 60000;
    var options = [];
    if (idle && activity > startMs + 60000) options.push({ value: 'activity', label: 'Zatrzymaj o ' + E.Timer.hm(activity) + ' (ostatnia aktywność)', at: activity });
    if (sameDay && dayEndMs && dayEndMs > startMs + 60000 && dayEndMs < now && !(options.length && options[0].at <= dayEndMs)) options.push({ value: 'dayend', label: 'Zatrzymaj o ' + prefs.dayEnd + ' (koniec dnia)', at: dayEndMs });
    options.push({ value: 'now', label: 'Zatrzymaj teraz (' + E.Timer.hm(now) + ')', at: now });
    if (forgotten) options.push({ value: 'manual', label: 'Rozlicz ręcznie…' });
    options.push({ value: 'keep', label: 'Zostaw włączony', variant: 'secondary' });
    options.forEach(function (o, i) { if (!o.variant) o.variant = i === 0 ? 'primary' : 'secondary'; });

    reminderOpen = true;
    Dialog.choose({
      title: sameDay ? 'Koniec dnia pracy — zegar nadal chodzi' : 'Zegar chodzi od wczoraj',
      message: (found.project ? found.project.code + ' · ' : '') + name + ' · od ' + (sameDay ? '' : F.dateTime(run.start.slice(0, 16)).split(',')[0] + ' ') + E.Timer.hm(startMs) + ' (' + TL.duration(TL.minutes(run)) + '). Kiedy naprawdę skończyłeś pracę?',
      options: options
    }).then(function (value) {
      reminderOpen = false;
      var live = runningTimer();
      if (!live || live.id !== run.id) return;
      var picked = options.filter(function (o) { return o.value === value; })[0];
      if (!picked || picked.value === 'keep') { reminderSnooze[run.id] = Date.now() + 30 * 60000; return; }
      if (picked.value === 'manual') { openTimeForm({ mode: 'stop', entryId: run.id }); return; }
      var minutes = Math.max(0, Math.round((picked.at - startMs) / 60000));
      var result = TL.stop(entries(), currentMe(), new Date(), { minutes: minutes });
      setEntries(function () { return result.entries; });
      Toast.show({ message: 'Zakończono o ' + E.Timer.hm(picked.at) + ' · ' + TL.duration(minutes) + ' na „' + name + '”.', tone: 'success', timeout: 5000 });
    });
  }

  function checkForgotten() { checkTimerReminder(); }

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

  /* ---------- inspektor ---------- */

  var inspectorReturn = null;

  function inspect(ref) {
    if (!store.getState().inspector) inspectorReturn = document.activeElement;
    store.set({ inspector: ref });
    window.setTimeout(function () {
      var title = document.getElementById('inspector-title');
      if (title) title.focus({ preventScroll: true });
    }, 30);
  }

  function closeInspector() {
    if (!store.getState().inspector) return;
    store.set({ inspector: null });
    // Wiersz mógł zostać przerysowany — szukamy jego następcy po kluczu fokusu.
    var target = inspectorReturn;
    if (target && !document.contains(target)) {
      var key = target.getAttribute && target.getAttribute('data-fk');
      target = key ? document.querySelector('[data-fk="' + key.replace(/["\\]/g, '\\$&') + '"]') : null;
    }
    if (target) target.focus({ preventScroll: true });
    inspectorReturn = null;
  }

  function isInspected(kind, id) {
    var ref = store.getState().inspector;
    if (!ref || ref.kind !== kind) return false;
    return (kind === 'task' && ref.taskId === id) || (kind === 'person' && ref.personId === id) || (kind === 'project' && ref.projectId === id);
  }

  /* ---------- panel boczny: przypięte, zwijanie ---------- */

  function isPinned(id) {
    return store.getState().prefs.pinned.indexOf(id) >= 0;
  }

  function togglePin(id) {
    var project = findProject(id);
    var pinned = store.getState().prefs.pinned;
    var on = pinned.indexOf(id) < 0;
    setPref({ pinned: on ? pinned.concat([id]) : pinned.filter(function (x) { return x !== id; }) });
    if (project) Toast.show({ message: (on ? 'Przypięto w panelu: ' : 'Odpięto z panelu: ') + project.name, timeout: 3000 });
  }

  function toggleSidebar() {
    Motion.withTransition(function () { setPref({ sidebarCollapsed: !store.getState().prefs.sidebarCollapsed }); });
  }

  function toggleStageGroup() {
    store.update(function (state) { return Object.assign({}, state, { stageGroup: !state.stageGroup }); });
  }

  function toggleDone(projectId) {
    store.update(function (state) {
      var showDone = Object.assign({}, state.showDone);
      if (showDone[projectId]) delete showDone[projectId];
      else showDone[projectId] = true;
      return Object.assign({}, state, { showDone: showDone });
    });
  }

  /** Klik w odcinek profilu: rozwija etap na liście i przewija do niego. */
  function revealStage(projectId, stageId) {
    var state = store.getState();
    var project = findProject(projectId);
    if (!project) return;
    var index = project.stages.findIndex(function (s) { return s.id === stageId; });
    var leading = 0;
    while (leading < project.stages.length && project.stages[leading].status === 'done') leading += 1;
    var expandedStages = Object.assign({}, state.expandedStages);
    expandedStages[projectId + ':' + stageId] = true;
    var showDone = Object.assign({}, state.showDone);
    if (index < leading) showDone[projectId] = true;
    pendingFlash = { projectId: projectId, stageId: stageId };
    var route = Object.assign({}, state.route, { tab: 'etapy' });
    if (state.route.tab !== 'etapy') navigate(route);
    store.set({ expandedStages: expandedStages, showDone: showDone });
    window.setTimeout(function () {
      var row = document.querySelector('.srow-wrap[data-stage-id="' + window.CSS.escape(String(stageId)) + '"]');
      if (row) {
        row.scrollIntoView({ behavior: Motion.prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
        var expand = row.querySelector('.srow__expand');
        if (expand) expand.focus({ preventScroll: true });
      }
    }, 120);
  }

  /* ---------- skróty ---------- */

  var SHORTCUTS = [
    ['Ctrl K', 'Szukaj projektu, osoby albo działania'],
    ['N', 'Nowy projekt (na Zespole: nowa osoba)'],
    ['E', 'Edytuj otwarty projekt'],
    ['/', 'Przejdź do wyszukiwarki listy'],
    ['G P', 'Przejdź do projektów'],
    ['G Z', 'Przejdź do zespołu'],
    ['G M', 'Przejdź do mojej pracy'],
    ['J K', 'Następny / poprzedni wiersz (projekty, moja praca)'],
    ['V', 'Zmień widok: tabela ↔ karty (na zadaniach: lista ↔ kanban)'],
    ['T', 'Zegar: zatrzymaj albo wznów ostatnie zadanie'],
    ['[', 'Zwiń lub rozwiń panel boczny (menu)'],
    ['Esc', 'Zamknij podgląd, menu albo panel; odznacz wiersze'],
    ['Ctrl Enter', 'Zapisz formularz'],
    ['?', 'Ta lista']
  ];

  function showShortcuts() {
    if (Dialog.anyOpen()) return;
    var dialog = D.el('dialog', { class: 'dialog dialog--wide', attrs: { 'aria-labelledby': 'shortcuts-title' } }, [
      D.el('div', { class: 'dialog__card' }, [
        D.el('div', { class: 'dialog__head' }, [
          D.el('h2', { class: 'dialog__title', text: 'Skróty klawiszowe', attrs: { id: 'shortcuts-title' } }),
          D.el('p', { class: 'dialog__text', text: 'Działają wszędzie poza polami tekstowymi.' })
        ]),
        D.el('dl', { class: 'shortcuts' }, SHORTCUTS.map(function (row) {
          return D.el('div', { class: 'shortcuts__row' }, [
            D.el('dt', null, row[0].split(' ').map(function (k) { return UI.kbd(k); })),
            D.el('dd', { text: row[1] })
          ]);
        })),
        D.el('div', { class: 'dialog__actions' }, [UI.button({ label: 'Zamknij', variant: 'secondary', onClick: function () { dialog.close(); } })])
      ])
    ]);
    dialog.addEventListener('close', function () { dialog.remove(); });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  /* ---------- zdarzenia projektowe do Aktualności ---------- */

  var eventSnap = null;
  var eventsQuiet = 0;
  var eventsBusy = false;

  /** Porównuje stan z poprzednim odciskiem i dopisuje zdarzenia (etap zakończony, zmiana stanu, status projektu). */
  function observeEvents() {
    if (eventsBusy) return;
    var ws = store.getState().workspace;
    if (!ws || !Array.isArray(ws.projects)) return;
    var social = ws.social || E.Social.empty();
    var res = E.Events.detect(eventSnap, ws.projects, new Date(), { actorId: currentMe() || '', health: social.health, recent: social.events });
    eventSnap = res.snapshot;
    var events = eventsQuiet ? [] : res.events;
    var stored = social.health || {};
    var healthDiffers = Object.keys(res.health).some(function (id) { return stored[id] !== res.health[id]; });
    if (!events.length && !healthDiffers) return;
    eventsBusy = true;
    try {
      updateWorkspace(function (workspace) {
        return Object.assign({}, workspace, { social: E.Social.recordEvents(workspace.social, events, res.health) });
      });
    } finally { eventsBusy = false; }
  }

  /** Wykonuje zmianę hurtową (dane przykładowe, wczytanie kopii, czyszczenie) bez generowania zdarzeń. */
  function quietly(fn) {
    eventsQuiet += 1;
    try { fn(); } finally { eventsQuiet -= 1; observeEvents(); }
  }

  function loadDemo() { quietly(loadDemoNow); }

  /* ---------- filtry i preferencje ---------- */

  function setFilters(patch) {
    store.update(function (state) {
      return Object.assign({}, state, { filters: Object.assign({}, state.filters, patch), page: 0 });
    });
  }

  // Ta sama kolumna drugi raz odwraca kolejność; nowa zaczyna rosnąco.
  function setSort(key) {
    var f = store.getState().filters;
    setFilters({ sort: key, dir: f.sort === key && f.dir !== 'desc' ? 'desc' : 'asc' });
  }

  function clearFilters() {
    nodes.search.value = '';
    setFilters({ query: '', status: 'all', person: 'all', health: 'all', horizon: 0 });
    if (store.getState().prefs.projectView !== 'all') setPref({ projectView: 'all' });
  }

  /* ---------- zapisane widoki listy projektów ---------- */

  function findView(id) {
    return E.ProjectList.allViews(store.getState().prefs).filter(function (v) { return v.id === id; })[0] || null;
  }

  function applyViewFilters(view, silent) {
    var prefs = store.getState().prefs;
    if (view.mine && !prefs.me) {
      if (!silent) Toast.show({ message: 'Wybierz, kim jesteś, w „Moja praca” — wtedy „Moje” pokaże Twoje projekty.', tone: 'warning', timeout: 6000 });
      return false;
    }
    var f = E.ProjectList.viewFilters(view, prefs);
    if (nodes.search) nodes.search.value = f.query || '';
    setFilters({ health: f.health, status: f.status, person: f.person, query: f.query || '', horizon: 0 });
    return true;
  }

  function applyView(id) {
    var view = findView(id);
    if (!view || !applyViewFilters(view, false)) return;
    setPref({ projectView: id });
  }

  function saveView() {
    var state = store.getState();
    if ((state.prefs.customViews || []).length >= E.Prefs.MAX_VIEWS) {
      Toast.show({ message: 'Można zapisać najwyżej ' + E.Prefs.MAX_VIEWS + ' własnych widoków. Usuń któryś, żeby dodać nowy.', tone: 'warning', timeout: 6000 });
      return;
    }
    Dialog.prompt({
      title: 'Zapisz widok', message: 'Bieżące filtry (stan, osoba, status, fraza) będą dostępne jako zakładka.',
      label: 'Nazwa widoku', placeholder: 'np. Wodociągi — moje', confirm: 'Zapisz widok'
    }).then(function (name) {
      var clean = String(name || '').trim();
      if (!clean) return;
      var f = store.getState().filters;
      var max = (store.getState().prefs.customViews || []).reduce(function (m, v) { return Math.max(m, Number(v.id.slice(2))); }, 0);
      var id = 'c-' + (max + 1);
      setPref({
        customViews: store.getState().prefs.customViews.concat([{ id: id, name: clean, filters: { health: f.health, status: f.status, person: f.person, query: f.query } }]),
        projectView: id
      });
    });
  }

  function removeView(id) {
    var prefs = store.getState().prefs;
    var wasActive = prefs.projectView === id;
    setPref({ customViews: prefs.customViews.filter(function (v) { return v.id !== id; }), projectView: wasActive ? 'all' : prefs.projectView });
    if (wasActive) applyViewFilters(findView('all'), true);
  }

  function setProjectDeadline(projectId, value) {
    var project = store.getState().workspace.projects.filter(function (p) { return p.id === projectId; })[0];
    if (!project || !Model.isDate(value) || project.deadline === value) return;
    var before = project.deadline;
    setWorkspace(function (list) {
      return list.map(function (p) { return p.id === projectId ? Object.assign({}, p, { deadline: value }) : p; });
    });
    Toast.show({
      message: 'Termin umowy ' + project.code + ': ' + F.date(value, { year: 'always' }),
      actionLabel: 'Cofnij', timeout: 6000,
      onAction: function () {
        setWorkspace(function (list) {
          return list.map(function (p) { return p.id === projectId ? Object.assign({}, p, { deadline: before }) : p; });
        });
      }
    });
  }

  function setLeader(projectId, personId) {
    var project = store.getState().workspace.projects.filter(function (p) { return p.id === projectId; })[0];
    if (!project) return;
    var before = project.team && project.team.leader || '';
    if (before === personId) return;
    setWorkspace(function (list) {
      return list.map(function (p) { return p.id === projectId ? Object.assign({}, p, { team: Object.assign({}, p.team, { leader: personId }) }) : p; });
    });
    var person = Team.findPerson(people(), personId);
    Toast.show({
      message: 'Lider projektu ' + project.code + ': ' + (person ? Team.fullName(person) : ''),
      actionLabel: 'Cofnij', timeout: 6000,
      onAction: function () {
        setWorkspace(function (list) {
          return list.map(function (p) { return p.id === projectId ? Object.assign({}, p, { team: Object.assign({}, p.team, { leader: before }) }) : p; });
        });
      }
    });
  }

  /**
   * Przegląd portfela działa jak filtr: klik w stan albo w „terminy” zawęża
   * listę poniżej, drugi klik zdejmuje zawężenie. Lista przewija się do widoku,
   * żeby skutek był widoczny od razu.
   */
  function filterPortfolio(patch) {
    var current = store.getState().filters;
    var next = {};
    if (patch.health !== undefined) next.health = current.health === patch.health ? 'all' : patch.health;
    if (patch.horizon !== undefined) {
      next.horizon = current.horizon === patch.horizon ? 0 : patch.horizon;
      if (next.horizon) next.sort = 'deadline';
    }
    setFilters(next);
    window.requestAnimationFrame(function () {
      var bar = nodes.filters;
      var rect = bar.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.6 || rect.top < 0) {
        bar.scrollIntoView({ behavior: Motion.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
    });
  }

  /** Etap z przeglądu portfela: otwiera projekt i pokazuje etap na osi przebiegu. */
  function openStage(projectId, stageId) {
    var state = store.getState();
    if (state.route.name === 'project' && state.route.projectId === projectId) {
      revealStage(projectId, stageId);
      return;
    }
    openProject(projectId, 'etapy');
    window.setTimeout(function () { revealStage(projectId, stageId); }, 320);
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
    document.documentElement.setAttribute('data-density', prefs.density || 'comfortable');
    applyLook(prefs);
    applyRules(prefs);
    if (E.Timer && E.Timer.setTarget) E.Timer.setTarget(prefs.dayTarget);
  }

  /** Zasady postępu i prognozy z ustawień trafiają do wspólnej logiki (Postęp, Analiza). */
  function applyRules(prefs) {
    E.Progress.setRules({ method: prefs.progressMethod, workingWeight: (prefs.workingWeight || 0) / 100 });
    E.Planning.configure({ dayHours: (prefs.dayTarget || 480) / 60, reservePct: prefs.reservePct });
    E.Analysis.configure({ warn: prefs.forecastWarn / 100, alarm: prefs.forecastAlarm / 100, minProgress: prefs.minProgress, rate: prefs.hourlyCost });
  }

  /* ---------- budżet i plan etapów ---------- */

  function canPlan(project) {
    var state = store.getState();
    return !!project && E.Budget.canSeeHours(state.prefs.me, project, state.workspace.people || []);
  }

  /** Szkice zadań widzi tylko zarząd i lider projektu; pozostałym ekranom podajemy stan bez nich. */
  var draftViewCache = { ws: null, me: null, out: null };
  function visibleState(state) {
    var ws = state.workspace;
    if (!ws || !(ws.projects || []).length) return state;
    var hasDraft = ws.projects.some(function (p) { return p.stages.some(function (st) { return (st.tasks || []).some(function (t) { return t.draft; }); }); });
    if (!hasDraft) return state;
    if (draftViewCache.ws !== ws || draftViewCache.me !== state.prefs.me) {
      var people = ws.people || [];
      var projects = ws.projects.map(function (p) {
        if (E.Budget.canSeeHours(state.prefs.me, p, people)) return p;
        return Object.assign({}, p, { stages: p.stages.map(function (st) {
          return (st.tasks || []).some(function (t) { return t.draft; }) ? Object.assign({}, st, { tasks: st.tasks.filter(function (t) { return !t.draft; }) }) : st;
        }) });
      });
      draftViewCache = { ws: ws, me: state.prefs.me, out: Object.assign({}, ws, { projects: projects }) };
    }
    return Object.assign({}, state, { workspace: draftViewCache.out });
  }

  function withUndo(projectId, message, change) {
    var before = findProject(projectId);
    if (!before || !canPlan(before)) return;
    setWorkspace(function (list) { return list.map(function (p) { return p.id === projectId ? change(p) : p; }); });
    Toast.show({
      message: message, actionLabel: 'Cofnij', timeout: 6000,
      onAction: function () { setWorkspace(function (list) { return list.map(function (p) { return p.id === projectId ? before : p; }); }); }
    });
  }

  /** Rozdziela całość budżetu (godziny) na etapy wg wag; zablokowane i zakończone zostają. */
  function distributeBudget(projectId, totalHours) {
    var project = findProject(projectId);
    if (!project) return;
    var result = E.Planning.distribute(project, totalHours);
    if (result.overLocked) { Toast.show({ message: 'Zablokowane etapy mają już więcej niż cały budżet.', tone: 'danger' }); return; }
    withUndo(projectId, 'Budżet rozdzielony: ' + F.hours(result.total) + ' (' + E.Planning.round1(E.Planning.toDays(result.total)) + ' dni)', function (p) {
      return Object.assign({}, p, { stages: p.stages.map(function (st) { return result.hours[st.id] > 0 ? Object.assign({}, st, { hours: result.hours[st.id] }) : st; }) });
    });
  }

  function patchStage(projectId, stageId, patch, message) {
    var project = findProject(projectId);
    if (!project || !canPlan(project)) return;
    if (message) {
      withUndo(projectId, message, function (p) { return Object.assign({}, p, { stages: p.stages.map(function (st) { return st.id === stageId ? Object.assign({}, st, patch) : st; }) }); });
    } else {
      mapStage(projectId, stageId, function (st) { return Object.assign({}, st, patch); });
    }
  }

  function toggleBudgetStage(projectId, stageId) {
    store.update(function (state) {
      var open = Object.assign({}, state.expandedStages);
      var key = 'bp:' + projectId + ':' + stageId;
      open[key] = open[key] === false;
      return Object.assign({}, state, { expandedStages: open });
    });
  }

  /** Akceptacja planu wstępnego: zamraża budżet bazowy i zamyka zakładkę. Dalej projekt żyje w Planie i Zadaniach. */
  function acceptPlan(projectId) {
    var project = findProject(projectId);
    if (!project || !canPlan(project)) return;
    var state = store.getState();
    var base = E.Analysis.makeBaseline(project, state.workspace.people || [], new Date(), state.prefs.hourlyCost);
    withUndo(projectId, 'Plan wstępny ' + project.code + ' zaakceptowany', function (p) { return Object.assign({}, p, { baseline: base, planAcceptedAt: new Date().toISOString() }); });
  }

  function reopenPlan(projectId) {
    var project = findProject(projectId);
    if (!project || !canPlan(project)) return;
    withUndo(projectId, 'Plan wstępny odblokowany', function (p) { return Object.assign({}, p, { planAcceptedAt: null }); });
  }

  function addDraftTask(projectId, stageId, name) {
    var project = findProject(projectId);
    var stage = stageOf(projectId, stageId);
    if (!project || !stage || !canPlan(project)) return;
    var check = Tasks.validateTask({ name: name, draft: true }, projectRoster(project));
    if (!check.valid) { Toast.show({ message: check.errors.name || 'Podaj nazwę zadania.', tone: 'danger' }); return; }
    var created = Tasks.createTask({ name: name, draft: true }, stage.tasks || [], projectRoster(project));
    mapStage(projectId, stageId, function (st) { return Object.assign({}, st, { tasks: (st.tasks || []).concat([created]) }); });
  }

  /** Dodaje typowe zadania z biblioteki jako szkice (jeden etap albo wszystkie); pomija te, które już są. */
  function addLibraryTasks(projectId, stageId, names) {
    var project = findProject(projectId);
    if (!project || !canPlan(project)) return;
    var roster = projectRoster(project);
    var added = 0;
    var next = Object.assign({}, project, { stages: project.stages.map(function (st) {
      if ((stageId && st.id !== stageId) || (!stageId && st.status === 'done')) return st;
      var tasks = (st.tasks || []).slice();
      E.Library.missing(Object.assign({}, st, { tasks: tasks })).forEach(function (item) {
        if (names && names.indexOf(item.name) < 0) return;
        tasks.push(Tasks.createTask({ name: item.name, draft: true, fromReserve: item.reserve }, tasks, roster));
        added += 1;
      });
      return Object.assign({}, st, { tasks: tasks });
    }) });
    if (!added) { Toast.show({ message: 'Wszystkie typowe zadania już są w tym projekcie.' }); return; }
    withUndo(projectId, 'Dodano ' + added + ' szkiców z biblioteki', function () { return next; });
  }

  function setTaskHours(projectId, stageId, taskId, hours) {
    var project = findProject(projectId);
    if (!project || !canPlan(project)) return;
    var n = Number(hours);
    mapTask(projectId, stageId, taskId, function (t) {
      var next = Object.assign({}, t);
      if (Number.isFinite(n) && n > 0) next.estimate = Math.round(n * 10) / 10; else delete next.estimate;
      return next;
    });
  }

  function fillStageHours(projectId, stageId) {
    var stage = stageOf(projectId, stageId);
    if (!stage) return;
    var shares = E.Planning.fillShares(stage);
    if (!Object.keys(shares).length) { Toast.show({ message: 'Brak wolnej puli albo wszystkie zadania mają już czas.' }); return; }
    withUndo(projectId, 'Wolna pula rozdzielona między ' + Object.keys(shares).length + ' zadań', function (p) {
      return Object.assign({}, p, { stages: p.stages.map(function (st) {
        return st.id !== stageId ? st : Object.assign({}, st, { tasks: st.tasks.map(function (t) { return shares[t.id] ? Object.assign({}, t, { estimate: shares[t.id] }) : t; }) });
      }) });
    });
  }

  function removeDraftTask(projectId, stageId, taskId) {
    var project = findProject(projectId);
    if (!project || !canPlan(project)) return;
    withUndo(projectId, 'Usunięto szkic zadania', function (p) {
      return Object.assign({}, p, { stages: p.stages.map(function (st) { return st.id !== stageId ? st : Object.assign({}, st, { tasks: st.tasks.filter(function (t) { return t.id !== taskId; }) }); }) });
    });
  }

  /** Zamraża plan bazowy projektu (godziny etapów i koszt wg stawek zespołu). */
  function freezeBaseline(projectId) {
    var state = store.getState();
    var project = findProject(projectId);
    if (!project || !E.Budget.canSeeHours(state.prefs.me, project, state.workspace.people || [])) return;
    var before = project.baseline || null;
    var base = E.Analysis.makeBaseline(project, state.workspace.people || [], new Date(), state.prefs.hourlyCost);
    setWorkspace(function (list) { return list.map(function (p) { return p.id === projectId ? Object.assign({}, p, { baseline: base }) : p; }); });
    Toast.show({
      message: 'Plan bazowy ' + project.code + ' zamrożony: ' + F.hours(base.hours),
      actionLabel: 'Cofnij', timeout: 6000,
      onAction: function () { setWorkspace(function (list) { return list.map(function (p) { return p.id === projectId ? Object.assign({}, p, { baseline: before }) : p; }); }); }
    });
  }

  /** Wygląd: paleta, HDR, intensywność i kontrast jako atrybuty i zmienne CSS (podgląd na żywo bez zapisu). */
  function applyLook(look) {
    var el = document.documentElement;
    if (!look.palette || look.palette === 'ocean') el.removeAttribute('data-palette');
    else el.setAttribute('data-palette', look.palette);
    if (E.Identity && E.Identity.setMode) E.Identity.setMode(look.colorBy);
    if (look.tilesFull) el.setAttribute('data-tiles', 'full');
    else el.removeAttribute('data-tiles');
    if (look.hdr === false) el.setAttribute('data-hdr', 'off');
    else el.removeAttribute('data-hdr');
    var vivid = typeof look.vivid === 'number' ? look.vivid : 100;
    var contrast = typeof look.contrast === 'number' ? look.contrast : 50;
    el.style.setProperty('--vivid', String(vivid / 100));
    el.style.setProperty('--ctr', String((contrast - 50) / 50));
  }

  function toggleRail(id) {
    var list = store.getState().prefs.collapsedRails || [];
    setPref({ collapsedRails: list.indexOf(id) >= 0 ? list.filter(function (x) { return x !== id; }) : list.concat([id]) });
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
    { firstName: 'Piotr', lastName: 'Testowy', position: 'Kosztorysant', orgRole: 'member', cooperation: 'consultant' },
    { firstName: 'Marta', lastName: 'Testowa', position: 'Hydrolożka', orgRole: 'member', cooperation: 'internal' },
    { firstName: 'Tomasz', lastName: 'Testowy', position: 'Geodeta', orgRole: 'member', cooperation: 'external' }
  ];

  // Indeksy odnoszą się do DEMO_PEOPLE powyżej.
  var DEMO_TEAMS = {
    '2601': { leader: 0, coordinator: 2, proxyLead: 4, members: [3, 5] },
    '2602': { leader: 1, coordinator: 3, proxyLead: 2, proxyExtra: 4, members: [5] },
    '2603': { leader: 0, coordinator: 4, members: [2] },
    '2604': { leader: 1, coordinator: 2, members: [3, 4] },
    '2605': { leader: 0, coordinator: 5, members: [1, 2, 3, 4] },
    '2606': { leader: 1, coordinator: 6, members: [2, 3, 7] },
    '2607': { leader: 0, coordinator: 6, members: [3, 4, 7] }
  };

  // Indeksy etapów odnoszą się do katalogu, indeksy osób do DEMO_PEOPLE.
  var DEMO_TASKS = {
    '2601': [
      { stage: 5, name: 'Zebrać warunki od zarządcy drogi', status: 'working', workload: 'medium', hours: 48, people: [0, 2] },
      { stage: 6, name: 'Wystąpić o decyzję lokalizacyjną', status: 'todo', workload: 'small', hours: 120, people: [4] },
      { stage: 0, name: 'Zebrać dane wyjściowe od gminy', status: 'done', workload: 'small', hours: -200, people: [2] },
      { stage: 1, name: 'Koncepcja przebudowy przepustu — wariant A i B', status: 'done', workload: 'large', hours: -120, people: [0, 2] },
      { stage: 2, name: 'Inwentaryzacja przyrodnicza', status: 'review', workload: 'medium', hours: 20, people: [3] },
      { stage: 3, name: 'Raport o oddziaływaniu na środowisko', status: 'working', workload: 'large', hours: 90, people: [3, 5], important: true, description: 'Wymaga danych z inwentaryzacji przyrodniczej i opinii RDOŚ.' },
      { stage: 4, name: 'Zamówić mapę do celów projektowych', status: 'todo', workload: 'small', hours: -30, people: [5] },
      { stage: 6, name: 'Uzupełnić wniosek o pozwolenie wodnoprawne', status: 'working', workload: 'veryLarge', hours: 96, people: [2, 0], important: true, mail: 'Wezwanie do uzupełnienia wniosku', work: 34, description: 'Zadanie z wezwania RZGW: uzupełnić operat, mapy i obliczenia hydrauliczne.' }
    ],
    '2602': [
      { stage: 9, name: 'Skompletować załączniki do wniosku o pozwolenie', status: 'working', workload: 'large', hours: 72, people: [1, 3] },
      { stage: 9, name: 'Uzgodnić kolizję z siecią gazową', status: 'review', workload: 'medium', hours: -36, people: [2] },
      { stage: 11, name: 'Opracować rysunki wykonawcze', status: 'todo', workload: 'veryLarge', hours: 240, people: [3, 4], important: true },
      { stage: 11, name: 'Zestawienie przekrojów odcinka III', status: 'done', workload: 'medium', hours: -50, people: [3] },
      { stage: 7, name: 'Odpowiedzieć na wezwanie w sprawie pozwolenia', status: 'changes', workload: 'medium', hours: 3, people: [2], reason: 'Dopisać analizę wpływu na brzegi.' },
      { stage: 12, name: 'Przedmiar i kosztorys inwestorski', status: 'todo', workload: 'large', hours: 150, people: [5, 3] },
      { stage: 13, name: 'Skompletować egzemplarze do przekazania', status: 'todo', workload: 'small', hours: 60, people: [3] }
    ],
    '2603': [
      { stage: 0, name: 'Ustalić zakres prac z inwestorem', status: 'todo', workload: 'small', hours: 48, people: [0] },
      { stage: 1, name: 'Wstępna koncepcja zbiornika', status: 'todo', workload: 'veryLarge', hours: 300, people: [2], important: true }
    ],
    '2604': [
      {
        stage: 3, name: 'Przygotować kartę informacyjną przedsięwzięcia',
        status: 'changes', workload: 'medium', hours: -12, people: [1],
        reason: 'Uzupełnić opis oddziaływania na wody powierzchniowe.'
      },
      { stage: 3, name: 'Analiza wariantów pompowni', status: 'working', workload: 'medium', hours: 30, people: [2, 4] },
      { stage: 2, name: 'Pomiary hałasu i wibracji', status: 'todo', workload: 'small', hours: 240, people: [4] },
      { stage: 3, name: 'Uzupełnić kartę informacyjną wg opinii RDOŚ', status: 'done', workload: 'large', hours: 120, people: [1, 2], mail: 'Opinia do karty informacyjnej', work: 18, description: 'Uwagi RDOŚ do oddziaływania na wody powierzchniowe i siedliska.' }
    ],
    '2605': [
      { stage: 13, name: 'Przekazanie dokumentacji zamawiającemu', status: 'done', workload: 'small', hours: -900, people: [1] }
    ],
    '2606': [
      { stage: 0, name: 'Przygotować program prac', status: 'done', workload: 'small', hours: -400, people: [6] },
      { stage: 4, name: 'Pomiary batymetryczne zbiornika', status: 'done', workload: 'medium', hours: -250, people: [7] },
      { stage: 6, name: 'Operat wodnoprawny', status: 'working', workload: 'large', hours: 70, people: [6, 2], important: true },
      { stage: 5, name: 'Wniosek o decyzję lokalizacyjną', status: 'review', workload: 'medium', hours: 10, people: [3] },
      { stage: 9, name: 'Projekt zagospodarowania osadów', status: 'todo', workload: 'large', hours: 200, people: [2] },
      { stage: 6, name: 'Uzupełnić dane hydrologiczne', status: 'changes', workload: 'small', hours: -4, people: [6], reason: 'Brakuje przepływów z ostatnich 10 lat.' },
      { stage: 9, name: 'Uzupełnić dane o osadach (wezwanie gminy)', status: 'todo', workload: 'medium', hours: 60, people: [2, 6], mail: 'Wezwanie do uzupełnienia danych o osadach' }
    ],
    '2607': [
      { stage: 0, name: 'Zebrać wytyczne od zarządcy drogi', status: 'done', workload: 'small', hours: -150, people: [3] },
      { stage: 1, name: 'Wstępny przekrój przepustu', status: 'working', workload: 'medium', hours: 24, people: [3, 6] },
      { stage: 4, name: 'Pomiary geodezyjne dojazdu', status: 'working', workload: 'small', hours: 36, people: [7] },
      { stage: 6, name: 'Obliczenia hydrauliczne', status: 'todo', workload: 'medium', hours: 96, people: [6] },
      { stage: 7, name: 'Złożyć wniosek o pozwolenie wodnoprawne', status: 'todo', workload: 'small', hours: 400, people: [4] }
    ]
  };

  // Krótkie ścieżki przejść — dane przykładowe przechodzą przez model, a nie podstawiają statusu wprost.
  // Liczby w DEMO_TASKS to numery etapów w dawnym, 14-etapowym standardzie.
  var DEMO_STAGE_IDS = ['preparation', 'concept', 'environment-docs', 'environment-process', 'location-docs', 'location-process',
    'water-docs', 'water-process', 'land', 'building-docs', 'building-process', 'technical', 'estimates', 'handover'];
  var DEMO_PATHS = { todo: [], working: ['working'], review: ['review'], changes: ['review', 'changes'], done: ['done'] };

  /** Projekty przykładowe to pełne projekty: standard z procedurami, bez etapu ekspertyzy. */
  function demoCatalog() {
    var ids = Catalog.stagesFor('full', Catalog.defaultProcedures('full'));
    return Catalog.all.filter(function (entry) { return ids.indexOf(entry.id) >= 0; });
  }

  var DEMO = [
    { code: '2601', name: 'Przebudowa przepustu w Lipnicy', client: 'Gmina Lipnica', status: 'active', deadline: demoDate(21), done: 7, working: 2 },
    { code: '2602', name: 'Regulacja rzeki Białka — odcinek III', client: 'Wody Polskie RZGW', status: 'active', deadline: demoDate(-6), done: 11, working: 1 },
    { code: '2603', name: 'Zbiornik retencyjny Dąbrowa', client: 'Starostwo Powiatowe', status: 'planned', deadline: demoDate(120), done: 0, working: 0 },
    { code: '2604', name: 'Modernizacja stacji pomp Rudnik', client: 'Spółka Wodna Rudnik', status: 'paused', deadline: demoDate(60), done: 5, working: 0 },
    { code: '2605', name: 'Dokumentacja wałów w Zarzeczu', client: 'Urząd Miasta', status: 'done', deadline: demoDate(-40), done: 16, working: 0 },
    { code: '2606', name: 'Odmulenie zbiornika Wąwolnica', client: 'Gmina Wąwolnica', status: 'active', deadline: demoDate(75), done: 6, working: 2, scale: 1.25, age: 70 },
    { code: '2607', name: 'Przepust drogowy Klonów — pozwolenie wodnoprawne', client: 'Zarząd Dróg Powiatowych', status: 'active', deadline: demoDate(150), done: 3, working: 1, scale: 0.7, age: 20 }
  ];

  var DEMO_RATES = { 'Anna Testowa': 220, 'Michał Testowy': 190, 'Ewa Testowa': 150, 'Jan Testowy': 90, 'Olga Testowa': 120, 'Piotr Testowy': 130, 'Marta Testowa': 160, 'Tomasz Testowy': 110 };

  // Docelowe obciążenie tygodniowe osób w danych przykładowych (h): od wolnej przepustowości po pełne obłożenie.
  var DEMO_WEEK_HOURS = [38, 46, 41, 39, 32, 36, 30, 24];
  var DEMO_BEFORE_START_MS = 40 * 86400000; // przykładowa praca może sięgać do ~6 tygodni przed założeniem projektu w systemie (prace wstępne)

  /**
   * Wyrównuje obciążenie osób w danych przykładowych: nadmiar godzin z przeładowanego tygodnia
   * przesuwa na wcześniejsze tygodnie (nie wcześniej niż początek projektu), zachowując sumy godzin projektów.
   * Dzisiejsze wpisy zostają. Wpis, dla którego nie ma miejsca, jest pomijany.
   */
  function levelDemoLoad(list, projects, roster, now) {
    var byProject = {};
    projects.forEach(function (p) { byProject[p.id] = p; });
    var index = {};
    roster.forEach(function (p, i) { index[p.id] = i; });
    var todayKey = E.TimeLog.dayKey(now.getTime());
    function monday(date) {
      var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    var load = {};
    var out = [];
    var keep = list.filter(function (e) { return E.TimeLog.dayKey(Date.parse(e.start)) === todayKey; });
    keep.forEach(function (e) {
      var wk = monday(new Date(e.start));
      var l = load[e.personId] || (load[e.personId] = {});
      l[wk] = (l[wk] || 0) + (Date.parse(e.end) - Date.parse(e.start)) / 3600000;
    });
    out = keep.slice();
    list.filter(function (e) { return keep.indexOf(e) < 0; })
      .sort(function (a, b) { return Date.parse(b.start) - Date.parse(a.start); })
      .forEach(function (e) {
        var hours = (Date.parse(e.end) - Date.parse(e.start)) / 3600000;
        var target = DEMO_WEEK_HOURS[index[e.personId] === undefined ? 0 : index[e.personId] % DEMO_WEEK_HOURS.length];
        var l = load[e.personId] || (load[e.personId] = {});
        var created = byProject[e.projectId] && byProject[e.projectId].createdAt ? Date.parse(byProject[e.projectId].createdAt) : 0;
        for (var shift = 0; shift <= 20; shift += 1) {
          var start = new Date(Date.parse(e.start) - shift * 7 * 86400000);
          if (start.getTime() < created - 86400000 - DEMO_BEFORE_START_MS) break;
          var wk = monday(start);
          if ((l[wk] || 0) + hours <= target + 0.01) {
            l[wk] = (l[wk] || 0) + hours;
            out.push(shift ? Object.assign({}, e, { start: start.toISOString(), end: new Date(start.getTime() + hours * 3600000).toISOString(), updatedAt: start.toISOString() }) : e);
            return;
          }
        }
      });
    return out;
  }

  function loadDemoNow() {
    var roster = people().slice();
    DEMO_PEOPLE.forEach(function (row) {
      var exists = roster.some(function (person) {
        return Team.fullName(person).toLocaleLowerCase('pl') === (row.firstName + ' ' + row.lastName).toLocaleLowerCase('pl');
      });
      if (!exists) roster = roster.concat([Team.createPerson(row, roster)]);
    });
    roster = roster.map(function (person) {
      var rate = DEMO_RATES[Team.fullName(person)];
      return rate && !person.hourlyCost ? Object.assign({}, person, { hourlyCost: rate }) : person;
    });

    /** Zdjęcie przykładowe rysowane na płótnie (krajobraz z rzeką), żeby galeria miała co pokazać. */
  function demoPhoto(variant) {
    try {
      var palettes = [
        ['#9cc8e8', '#e8f1f5', '#5f8f58', '#3f6f4a', '#2c7ca0'],
        ['#f2c48d', '#fbe9d0', '#7d8f4c', '#546b3a', '#3d7f9a'],
        ['#a8b9c9', '#dfe6ec', '#6f8a6a', '#49644d', '#4c7f98'],
        ['#cfd8c2', '#f1f0e4', '#8a9a5b', '#5d7142', '#5b8aa0']
      ];
      var c = palettes[variant % palettes.length];
      var canvas = document.createElement('canvas');
      canvas.width = 960; canvas.height = 600;
      var g = canvas.getContext('2d');
      var sky = g.createLinearGradient(0, 0, 0, 340);
      sky.addColorStop(0, c[0]); sky.addColorStop(1, c[1]);
      g.fillStyle = sky; g.fillRect(0, 0, 960, 600);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(150 + variant * 160, 110, 46, 0, 7); g.fill();
      [[c[2], 330, 70], [c[3], 390, 50]].forEach(function (layer, i) {
        g.fillStyle = layer[0]; g.beginPath(); g.moveTo(0, 600);
        for (var x = 0; x <= 960; x += 40) g.lineTo(x, layer[1] + Math.sin((x + variant * 90 + i * 140) / 120) * layer[2] * 0.5);
        g.lineTo(960, 600); g.closePath(); g.fill();
      });
      g.fillStyle = c[4]; g.beginPath(); g.moveTo(300 + variant * 40, 600);
      g.bezierCurveTo(380, 520, 620, 500, 560 + variant * 30, 430); g.lineTo(600 + variant * 30, 430);
      g.bezierCurveTo(700, 510, 520, 560, 560 + variant * 60, 600); g.closePath(); g.fill();
      g.fillStyle = 'rgba(40,50,56,.85)'; g.fillRect(250, 470, 330, 14); g.fillRect(280, 484, 10, 40); g.fillRect(540, 484, 10, 40);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (error) { return null; }
  }

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

    var demoSeq = 0;
    function demoTasksFor(code, stages, team) {
      var allowed = Team.projectPeople(team);
      (DEMO_TASKS[code] || []).forEach(function (spec) {
        var stageId = DEMO_STAGE_IDS[spec.stage];
        var stage = stageId && stages.filter(function (s) { return s.id === stageId; })[0];
        if (!stage) return;
        var dupe = stages.some(function (st) { return (st.tasks || []).some(function (t) { return t.name === spec.name; }); });
        if (dupe) return;
        var assignees = (spec.people || []).map(demoPersonId).filter(function (id) { return id && allowed.indexOf(id) >= 0; });
        var task = Tasks.createTask({
          name: spec.name, deadline: demoTaskDeadline(spec.hours), workload: spec.workload, description: spec.description || '',
          important: spec.important === true, assignees: assignees
        }, stage.tasks || [], allowed);
        var path = DEMO_PATHS[spec.status] || [];
        var actor = assignees[0] || team.leader || '';
        path.forEach(function (step, stepIndex) {
          var moved = Tasks.moveTask(task, step, spec.reason || 'Uzupełnienie', (step === 'done' || step === 'changes') ? (team.leader || actor) : actor);
          if (!moved.ok) return;
          task = moved.task;
          // Historia rozłożona na ostatnie dni, żeby strumień wyglądał jak prawdziwa praca.
          var hoursAgo = (demoSeq * 5 + 2) + (path.length - 1 - stepIndex) * 4;
          var last = task.history[task.history.length - 1];
          if (last) last.at = new Date(Date.now() - hoursAgo * 3600000).toISOString();
        });
        demoSeq += 1;
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
    var freshCodes = {};
    setWorkspace(function (projects) {
      var result = projects.slice();
      DEMO.forEach(function (row) {
        if (result.some(function (p) { return p.code.toUpperCase() === row.code; })) return;
        var stages = demoCatalog().map(function (entry, index) {
          var stage = Model.createStage(entry.id, { deadline: demoDate(index * 10 - 20), hours: row.scale ? Math.round(entry.defaultHours * row.scale) : undefined });
          if (index < row.done) stage.status = 'done';
          else if (index < row.done + row.working) stage.status = 'working';
          return stage;
        });
        var team = demoTeam(row.code);
        demoTasksFor(row.code, stages, team);
        var created = Model.createProject({
          code: row.code, name: row.name, client: row.client, status: row.status,
          deadline: row.deadline, stages: stages, team: team, scope: 'full'
        }, result);
        created.createdAt = new Date(Date.now() - (row.age != null ? row.age : 14 + added * 11) * 86400000).toISOString();
        freshCodes[row.code] = true;
        result = result.concat([created]);
        added += 1;
      });
      // Wcześniej wczytane projekty przykładowe dostają brakujące zadania (po nazwie, więc bez dublowania).
      return result.map(function (project) {
        if (freshCodes[project.code] || !DEMO_TASKS[project.code] || !DEMO.some(function (r) { return r.code === project.code; })) return project;
        var stages = (project.stages || []).map(function (st) { return Object.assign({}, st, { tasks: (st.tasks || []).slice() }); });
        demoTasksFor(project.code, stages, project.team || Team.emptyTeam());
        return Object.assign({}, project, { stages: stages });
      });
    });
    // Przykładowa korespondencja: wpisy do projektów demonstracyjnych (po kodzie, bo id nadaje model).
    var iso = function (offset) {
      var d = new Date();
      d.setDate(d.getDate() + offset);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    var demoMail = {
      '2601': [
        { direction: 'in', kind: 'summons', counterparty: 'RZGW Kraków', number: 'KR.ZZ.2.4210.12.2026', subject: 'Wezwanie do uzupełnienia wniosku o pozwolenie wodnoprawne', registeredDate: iso(-9), needsAction: true },
        { direction: 'in', kind: 'opinion', counterparty: 'Starostwo Powiatowe', subject: 'Opinia w sprawie lokalizacji przepustu', registeredDate: iso(-20), needsAction: true },
        { direction: 'out', kind: 'application', counterparty: 'Gmina Lipnica', subject: 'Wniosek o udostępnienie map do celów projektowych', registeredDate: iso(-14) }
      ],
      '2602': [
        { direction: 'in', kind: 'decision', counterparty: 'Wody Polskie RZGW', number: 'DO.ZUZ.1.421.8.2026', subject: 'Decyzja o warunkach zabudowy odcinka III', registeredDate: iso(-30) },
        { direction: 'in', kind: 'inquiry', counterparty: 'Wody Polskie RZGW', subject: 'Zapytanie o harmonogram robót', registeredDate: iso(-3) },
        { direction: 'out', kind: 'application', counterparty: 'Starostwo Powiatowe', subject: 'Wniosek o pozwolenie wodnoprawne — odcinek III', registeredDate: iso(-12) }
      ],
      '2604': [
        { direction: 'in', kind: 'opinion', counterparty: 'Regionalna Dyrekcja Ochrony Środowiska', subject: 'Opinia do karty informacyjnej przedsięwzięcia', registeredDate: iso(-6) },
        { direction: 'out', kind: 'inquiry', counterparty: 'Spółka Wodna Rudnik', subject: 'Prośba o dane eksploatacyjne pomp', registeredDate: iso(-15) }
      ],
      '2605': [
        { direction: 'in', kind: 'decision', counterparty: 'Urząd Miasta', number: 'GK.6740.4.2026', subject: 'Decyzja zatwierdzająca dokumentację', registeredDate: iso(-45) }
      ],
      '2606': [
        { direction: 'out', kind: 'application', counterparty: 'Wody Polskie RZGW', subject: 'Wniosek o uzgodnienie operatu wodnoprawnego', registeredDate: iso(-4) },
        { direction: 'in', kind: 'summons', counterparty: 'Gmina Wąwolnica', subject: 'Wezwanie do uzupełnienia danych o osadach', registeredDate: iso(-2), needsAction: true }
      ],
      '2607': [
        { direction: 'in', kind: 'inquiry', counterparty: 'Zarząd Dróg Powiatowych', subject: 'Zapytanie o przepustowość istniejącego przepustu', registeredDate: iso(-5) }
      ]
    };
    updateWorkspace(function (workspace) {
      var list = (workspace.mail || []).slice();
      workspace.projects.forEach(function (project) {
        var rows = demoMail[project.code];
        if (!rows || list.some(function (e) { return e.projectId === project.id; })) return;
        rows.forEach(function (row) {
          var res = Mail.create(list, project.id, row, { now: new Date() });
          if (res.valid) {
            list = res.entries;
            var made = list[list.length - 1];
            if (made && row.registeredDate) made.createdAt = row.registeredDate + 'T09:00:00.000Z';
          }
        });
      });
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, mail: list });
    });
    // Zadania wywołane pismami: łączymy po temacie pisma (task.mailId), żeby widać było pismo → zadanie → czas.
    updateWorkspace(function (workspace) {
      var changed = false;
      var projects = workspace.projects.map(function (project) {
        var specs = (DEMO_TASKS[project.code] || []).filter(function (sp) { return sp.mail; });
        if (!specs.length) return project;
        var stages = project.stages.map(function (stage) {
          var tasks = (stage.tasks || []).map(function (task) {
            var spec = specs.filter(function (sp) { return sp.name === task.name; })[0];
            if (!spec || task.mailId) return task;
            var entry = (workspace.mail || []).filter(function (m) { return m.projectId === project.id && m.subject.indexOf(spec.mail) === 0; })[0];
            if (!entry) return task;
            changed = true;
            return Object.assign({}, task, { mailId: entry.id });
          });
          return Object.assign({}, stage, { tasks: tasks });
        });
        return Object.assign({}, project, { stages: stages });
      });
      return changed ? Object.assign({}, workspace, { projects: projects }) : workspace;
    });
    // Demonstracyjne wartości umów i czas pracy z ostatnich tygodni (do Analizy).
    var demoValues = { '2601': 180000, '2602': 420000, '2603': 260000, '2604': 310000, '2605': 150000, '2606': 240000, '2607': 95000 };
    var demoFactor = { '2601': 0.88, '2602': 1.38, '2603': 0.55, '2604': 1.04, '2605': 1.02, '2606': 0.84, '2607': 1.1 };
    updateWorkspace(function (workspace) {
      // Wpisy przykładowe (id e-demo-*) generujemy na nowo; wpisy użytkownika zostają.
      var ownEntries = (workspace.entries || []).filter(function (e) { return String(e.id).indexOf('e-demo-') !== 0; });
      var entriesOut = [];
      var notes = ['', '', 'Rozmowa z inwestorem', 'Poprawki po uwagach', 'Wizja lokalna', 'Uzgodnienia telefoniczne', '', 'Obliczenia i zestawienia', '', 'Przegląd dokumentacji'];
      var projectsOut = workspace.projects.map(function (project) {
        if (demoValues[project.code] === undefined) return project;
        return Object.assign({}, project, { contractValue: project.contractValue == null ? demoValues[project.code] : project.contractValue });
      });
      var workdays = [];
      for (var back = 1; workdays.length < 52; back += 1) {
        var day = new Date(); day.setDate(day.getDate() - back); day.setHours(8, 0, 0, 0);
        if (day.getDay() !== 0 && day.getDay() !== 6) workdays.unshift(new Date(day));
      }
      var counter = 0;
      projectsOut.forEach(function (project) {
        var factor = demoFactor[project.code];
        if (factor === undefined) return;
        var team = Team.projectPeople(project.team);
        if (!team.length) return;
        var plan = [];
        project.stages.forEach(function (stage) {
          var share = stage.status === 'done' ? factor : (stage.status === 'working' ? 0.45 * factor : 0);
          if (share > 0) plan.push({ stage: stage, hours: Math.round((Number(stage.hours) || 0) * share) });
        });
        var perDay = 6 * Math.min(3, team.length);
        var needDays = plan.reduce(function (t, row) { return t + Math.max(1, Math.ceil(row.hours / perDay)); }, 0);
        var cursor = Math.max(0, workdays.length - needDays);
        plan.forEach(function (row) {
          var days = Math.max(1, Math.ceil(row.hours / perDay));
          var left = row.hours;
          for (var d = 0; d < days && cursor < workdays.length; d += 1, cursor += 1) {
            var todayHours = Math.min(left, perDay);
            var persons = Math.min(team.length, Math.max(1, Math.round(todayHours / 6)));
            for (var k = 0; k < persons && todayHours > 0; k += 1) {
              var hours = Math.min(6, todayHours / (persons - k));
              hours = Math.round(hours * 4) / 4;
              if (hours <= 0) continue;
              var start = new Date(workdays[cursor]); start.setHours(8 + k, 0, 0, 0);
              var end = new Date(start.getTime() + hours * 3600000);
              counter += 1;
              entriesOut.push({
                id: 'e-demo-' + counter, personId: team[(k + d) % team.length], projectId: project.id, stageId: row.stage.id, taskId: (row.stage.tasks || []).length && counter % 2 === 0 ? row.stage.tasks[counter % row.stage.tasks.length].id : '',
                label: Model.describeStage(row.stage).name, start: start.toISOString(), end: end.toISOString(), note: notes[counter % notes.length], source: 'manual',
                updatedAt: start.toISOString()
              });
              left -= hours; todayHours -= hours;
            }
          }
        });
      });
      // Praca nad zadaniami z pism (kilkadziesiąt godzin): wpisy przypięte do zadania.
      projectsOut.forEach(function (project) {
        (DEMO_TASKS[project.code] || []).filter(function (sp) { return sp.work; }).forEach(function (spec) {
          var found = null;
          project.stages.forEach(function (stage) { (stage.tasks || []).forEach(function (task) { if (task.name === spec.name) found = { stage: stage, task: task }; }); });
          if (!found) return;
          var chunks = Math.ceil(spec.work / 4);
          for (var c = 0; c < chunks; c += 1) {
            var day = workdays[Math.max(0, workdays.length - 1 - Math.floor(c * 0.6))];
            var who = found.task.assignees[c % found.task.assignees.length];
            if (!who) continue;
            var st = new Date(day); st.setHours(13 + (c % 2) * 2, 0, 0, 0);
            counter += 1;
            entriesOut.push({ id: 'e-demo-t-' + counter, personId: who, projectId: project.id, stageId: found.stage.id, taskId: found.task.id, label: found.task.name, start: st.toISOString(), end: new Date(st.getTime() + Math.min(4, spec.work - c * 4) * 3600000).toISOString(), note: c % 3 === 0 ? 'Poprawki po wezwaniu' : '', source: 'manual', updatedAt: st.toISOString() });
          }
        });
      });
      // Dzisiejszy czas pracy kilku osób — żeby „Moja praca” i Aktualności miały co pokazać.
      var nowDate = new Date();
      if (nowDate.getHours() >= 3) {
        projectsOut.filter(function (p) { return p.status === 'active' && demoFactor[p.code] !== undefined; }).slice(0, 3).forEach(function (project, k) {
          var team = Team.projectPeople(project.team);
          var stage = (project.stages || []).filter(function (st) { return st.status === 'working'; })[0];
          if (!team.length || !stage) return;
          var start = new Date(nowDate.getTime() - (2 + k) * 3600000);
          counter += 1;
          entriesOut.push({ id: 'e-demo-' + counter, personId: team[k % team.length], projectId: project.id, stageId: stage.id, taskId: '', label: Model.describeStage(stage).name, start: start.toISOString(), end: new Date(start.getTime() + (1.5 + k * 0.25) * 3600000).toISOString(), note: 'Praca nad dokumentacją', source: 'manual', updatedAt: start.toISOString() });
        });
      }
      entriesOut = levelDemoLoad(entriesOut, projectsOut, workspace.people || [], nowDate);
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, projects: projectsOut, entries: ownEntries.concat(entriesOut) });
    });
    // Korekty godzin zarządu (np. dodatkowe uzgodnienia) — widać je w budżecie etapu i w Analizie.
    var demoAdjust = [
      { code: '2602', stage: 'concept', hours: 24, note: 'Dodatkowe uzgodnienia wariantów z RZGW' },
      { code: '2604', stage: 'environment-docs', hours: 12, note: 'Rozszerzony zakres karty informacyjnej' },
      { code: '2606', stage: 'water-docs', hours: 16, note: 'Dodatkowa analiza osadów' }
    ];
    updateWorkspace(function (workspace) {
      var boss = demoPersonId(0);
      var changed = false;
      var projects = workspace.projects.map(function (project) {
        var rows = demoAdjust.filter(function (r) { return r.code === project.code; });
        if (!rows.length) return project;
        var stages = project.stages.map(function (stage) {
          var row = rows.filter(function (r) { return r.stage === stage.id; })[0];
          if (!row || (stage.adjustments || []).some(function (a) { return a.note === row.note; })) return stage;
          var res = E.Budget.addAdjustment(stage, { hours: row.hours, note: row.note }, boss, new Date(Date.now() - 6 * 86400000));
          if (!res.valid) return stage;
          changed = true;
          return res.stage;
        });
        return Object.assign({}, project, { stages: stages });
      });
      return changed ? Object.assign({}, workspace, { projects: projects }) : workspace;
    });
    updateWorkspace(function (workspace) {
      var social = workspace.social || E.Social.empty();
      var byCode = {};
      workspace.projects.forEach(function (project) { byCode[project.code] = project; });
      var P = function (i) { return demoPersonId(i); };
      // Każdy wpis ma odcisk (początek tekstu), więc ponowne wczytanie niczego nie dubluje.
      var posts = [
        { who: P(0), code: '', type: 'announcement', pinned: true, text: 'W piątek o 14:00 spotkanie całego biura — omówimy obłożenie na listopad i plan szkoleń. Kawa i ciasto od zarządu.', ago: 30,
          reactions: { like: [1, 2, 3], eyes: [4] }, comments: [{ who: 2, text: 'Będę! Mam kilka pytań o urlopy.', ago: 28 }, { who: 1, text: 'Przygotuję zestawienie obłożenia.', ago: 26 }] },
        { who: P(1), code: '2602', text: 'Mamy decyzję o warunkach zabudowy odcinka III. Można ruszać z przekrojami.', ago: 20, reactions: { party: [0, 2, 3, 5], like: [4] } },
        { who: P(2), code: '2601', text: 'Wizja lokalna przy przepuście zrobiona. Stan lepszy, niż zakładaliśmy w inwentaryzacji — zdjęcia poniżej.', ago: 8, photos: [0, 1, 2],
          reactions: { like: [0, 1], heart: [3] }, comments: [{ who: 0, text: 'Świetnie, to skraca etap inwentaryzacji.', ago: 7 }, { who: 3, text: 'Mogę zająć się opisem zdjęć do raportu.', ago: 6 }] },
        { who: P(1), code: '', type: 'poll', text: 'Gdzie robimy firmowy wyjazd integracyjny w tym roku?', options: ['Mazury', 'Bieszczady', 'Kazimierz Dolny', 'Zostajemy w Warszawie'], votes: { 0: 0, 1: 1, 2: 0, 3: 3, 4: 1, 5: 2 }, ago: 5 },
        { who: P(0), code: '', type: 'kudos', to: P(2), text: 'Za nocne domknięcie dokumentacji środowiskowej przed terminem. Dziękujemy!', ago: 3, reactions: { heart: [1, 3, 4, 5], party: [6] } },
        { who: P(2), code: '2601', text: 'Mapy z gminy dotarły — wrzuciłam je do folderu projektu.', ago: 2, photos: [3] },
        { who: P(0), code: '', type: 'announcement', text: 'Od poniedziałku czas pracy wpisujemy codziennie do 16:00. Dzięki temu Analiza pokazuje aktualne obłożenie, a lider widzi, gdzie potrzeba wsparcia.', ago: 50, reactions: { like: [1, 2, 3, 6] }, comments: [{ who: 5, text: 'Czy wpisy z zegara liczą się tak samo jak ręczne?', ago: 48 }, { who: 0, text: 'Tak, oba są w rejestrze czasu.', ago: 47 }] },
        { who: P(1), code: '2606', text: 'Odmulenie zbiornika: pomiary batymetryczne skończone. Geodeta oddał dane wcześniej, niż planowaliśmy.', ago: 26, photos: [1], reactions: { like: [0, 6, 7], party: [2] } },
        { who: P(0), code: '', type: 'poll', text: 'Kiedy robimy szkolenie z nowego programu do obliczeń hydraulicznych?', options: ['Wtorek rano', 'Środa po południu', 'Czwartek rano'], votes: { 0: 0, 1: 0, 2: 1, 3: 2, 6: 0, 7: 1 }, ago: 14 },
        { who: P(1), code: '', type: 'kudos', to: P(3), text: 'Za świetnie przygotowane zestawienie przekrojów dla odcinka III — oszczędziło nam pół dnia.', ago: 12, reactions: { heart: [0, 2], like: [5] } },
        { who: P(6), code: '2607', text: 'Pierwsze wyniki hydrologii dla Klonowa: przepływ miarodajny niższy niż w założeniach — przepust można zmniejszyć. Szczegóły w obliczeniach.', ago: 6, reactions: { eyes: [0, 3], like: [1] }, comments: [{ who: 0, text: 'Super, to zmienia kosztorys. Piotr, zobacz proszę.', ago: 5 }] },
        { who: P(2), code: '2604', text: 'Pompy w Rudniku po przeglądzie — dokumentacja zdjęciowa stanu istniejącego.', ago: 4, photos: [2, 0] },
        { who: P(5), code: '', text: 'Zaktualizowałem cenniki kosztorysowe na IV kwartał. Plik w folderze Kosztorysy — proszę korzystać z nowej wersji.', ago: 1, reactions: { like: [0, 1, 2] } }
      ];
      var comments = [];
      posts.forEach(function (row) {
        var stamp = row.text.slice(0, 40);
        if (social.posts.some(function (post) { return post.text.slice(0, 40) === stamp; })) return;
        var project = row.code ? byCode[row.code] : null;
        var res = E.Social.addPost(social, {
          personId: row.who, projectId: project ? project.id : null, text: row.text, type: row.type, to: row.to, pinned: row.pinned, options: row.options,
          images: (row.photos || []).map(demoPhoto).filter(Boolean)
        }, new Date());
        if (!res.valid) return;
        res.post.at = new Date(Date.now() - row.ago * 3600000).toISOString();
        if (row.votes && res.post.poll) {
          Object.keys(row.votes).forEach(function (n) { if (P(Number(n)) && res.post.poll.options[row.votes[n]]) res.post.poll.votes[P(Number(n))] = res.post.poll.options[row.votes[n]].id; });
        }
        social = res.social;
        social.posts[social.posts.length - 1] = res.post;
        var key = 'post:' + res.post.id;
        Object.keys(row.reactions || {}).forEach(function (rid) {
          row.reactions[rid].forEach(function (who) { if (P(who)) social = E.Social.toggleReaction(social, key, rid, P(who)); });
        });
        (row.comments || []).forEach(function (c) {
          var made = E.Social.addComment(social, key, P(c.who), c.text, new Date(Date.now() - c.ago * 3600000));
          if (made.valid) social = made.social;
        });
      });
      // Zdarzenia projektowe z bieżącego stanu przykładowych projektów (odświeżane przy każdym wczytaniu).
      var demoEvents = [];
      var seenLevels = {};
      var nowDate = new Date();
      Object.keys(byCode).filter(function (code) { return /^26\d\d$/.test(code); }).sort().forEach(function (code, i) {
        var project = byCode[code];
        var done = project.stages.filter(function (st) { return st.status === 'done'; });
        done.slice(-2).reverse().forEach(function (st, n) {
          var following = E.Events.nextStageName(project, st.id);
          demoEvents.push({ id: 'ev-demo-' + code + '-s' + n, event: 'stage-done', projectId: project.id, stageId: st.id, level: 'normal',
            at: new Date(Date.now() - (0.5 + i * 0.35 + n * 3) * 3600000).toISOString(), actorId: (project.team && project.team.leader) || '',
            title: 'Etap zakończony', text: E.Events.stageName(project, st.id), detail: following ? 'Następny etap: ' + following : 'To był ostatni etap' });
        });
        var health = E.Insight.health(project, nowDate);
        seenLevels[project.id] = health.level === 'closed' ? 'normal' : health.level;
        if (health.level === 'warning' || health.level === 'alarm') {
          demoEvents.push({ id: 'ev-demo-' + code + '-h', event: 'health', projectId: project.id, level: health.level,
            at: new Date(Date.now() - (0.2 + i * 0.25) * 3600000).toISOString(), title: E.Events.HEALTH_TITLE[health.level],
            text: health.reasons[0] ? health.reasons[0].text : '', detail: health.reasons.length > 1 ? 'Powodów: ' + health.reasons.length : '' });
        }
      });
      social = Object.assign({}, social, { events: (social.events || []).filter(function (e) { return String(e.id).indexOf('ev-demo-') !== 0; }) });
      social = E.Social.recordEvents(social, demoEvents, seenLevels);
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, social: social });
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

  /** Eksport karty czasu do CSV: podsumowanie okresu albo lista wpisów. */
  function exportTime(kind, personId) {
    var state = store.getState();
    var now = new Date();
    var pid = personId || state.prefs.me;
    var options = { mode: state.timeMode, offset: state.timeOffset, target: state.prefs.dayTarget };
    var projectOf = function (id) { var p = findProject(id); return p ? { code: p.code, name: p.name } : { code: String(id), name: '' }; };
    var rows = kind === 'entries'
      ? E.Timesheet.entryRows(state.workspace.entries || [], pid, now, options, function (entry) {
          var found = locateEntry(entry);
          return { project: projectOf(entry.projectId), stage: found.stage ? Model.describeStage(found.stage).name : '', task: (found.task && found.task.name) || entry.label || '' };
        })
      : E.Timesheet.summaryRows(E.Timesheet.build(state.workspace.entries || [], pid, now, options), projectOf);
    var period = E.Timesheet.period(now, state.timeMode, state.timeOffset);
    var name = (kind === 'entries' ? 'wpisy-czasu-' : 'karta-czasu-') + TL.dayKey(period.from.getTime()) + '_' + TL.dayKey(period.to.getTime()) + '.csv';
    var url = URL.createObjectURL(new Blob([E.Timesheet.csv(rows)], { type: 'text/csv;charset=utf-8' }));
    var link = D.el('a', { attrs: { href: url, download: name } });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    Toast.show({ message: 'Pobrano ' + name, tone: 'success', timeout: 4000 });
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = Model.normalizeWorkspace(JSON.parse(String(reader.result)));
        lastPercent = {};
        quietly(function () {
          store.update(function (state) {
            return Object.assign({}, state, { workspace: parsed, expandedStages: {}, selection: {}, form: null, notice: '' });
          });
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
      { label: 'Przejdź do karty czasu', icon: 'clock', meta: now(state.route.name === 'time'), keywords: 'czas godziny tydzień miesiąc eksport csv plan obciążenia', run: function () { goTo('time'); } },
      { label: 'Przejdź do analizy', icon: 'chart', meta: now(state.route.name === 'analysis'), keywords: 'opłacalność budżet godziny prognoza marża zużycie', run: function () { goTo('analysis'); } },
      { label: 'Przejdź do aktualności', icon: 'sparkle', meta: now(state.route.name === 'feed'), keywords: 'strumień wpisy reakcje komentarze media', run: function () { goTo('feed'); } },
      { label: 'Przejdź do mojej pracy', icon: 'checklist', meta: now(state.route.name === 'mywork'), keywords: 'moje zadania zatwierdzenia pisma skrzynka reakcje dziś', run: function () { goTo('mywork'); } },
      { label: 'Przejdź do zespołu', icon: 'people', meta: now(state.route.name === 'team'), keywords: 'ekran osoby katalog', run: function () { goTo('team'); } },
      { label: 'Widok: tabela', icon: 'list', meta: now(prefs.view === 'list'), keywords: 'lista wiersze', run: function () { goTo('projects'); setView('list'); } },
      { label: 'Widok: karty', icon: 'grid', meta: now(prefs.view === 'cards'), keywords: 'kafelki', run: function () { goTo('projects'); setView('cards'); } },
      { label: 'Motyw jasny', icon: 'sun', meta: now(prefs.theme === 'light'), run: function () { setPref({ theme: 'light' }); } },
      { label: 'Motyw ciemny', icon: 'moon', meta: now(prefs.theme === 'dark'), run: function () { setPref({ theme: 'dark' }); } },
      { label: 'Motyw jak w systemie', icon: 'monitor', meta: now(prefs.theme === 'system'), run: function () { setPref({ theme: 'system' }); } },
      { label: 'Kolor pracy w toku: nurt', icon: 'water', meta: now(prefs.accent === 'standard'), keywords: 'akcent barwy kolor standard morski hydro turkus', run: function () { setPref({ accent: 'standard' }); } },
      { label: 'Kolor pracy w toku: grafit', icon: 'datum', meta: now(prefs.accent === 'graphite'), keywords: 'akcent barwy kolor szary topo', run: function () { setPref({ accent: 'graphite' }); } },
      { label: 'Skróty klawiszowe', icon: 'keyboard', meta: '?', keywords: 'pomoc klawiatura', run: showShortcuts },
      { label: (prefs.sidebarCollapsed ? 'Rozwiń' : 'Zwiń') + ' panel boczny', icon: 'sidebar', meta: '[', keywords: 'nawigacja menu', run: toggleSidebar },
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
    setPage: function (page) { store.set({ page: page }); nodes.scroller.scrollTop = 0; },
    cycleStage: cycleStage,
    addStage: addStage,
    removeStage: removeStage,
    moveStage: moveStage,
    openCustomStage: openCustomStage,
    editStage: openEditStage,
    toggleStage: toggleStage,
    addTask: openAddTask,
    editTask: openEditTask,
    deleteTask: deleteTask,
    moveTask: moveTaskStatus,
    toggleTimer: toggleTimer,
    resumeLast: resumeLast,
    openMyWork: function () { goTo('mywork'); },
    toggleRail: toggleRail,
    setTime: function (patch) { store.set(patch); },
    toggleTimeProject: function (id) {
      var open = Object.assign({}, store.getState().timeOpen || {});
      if (open[id]) delete open[id]; else open[id] = true;
      store.set({ timeOpen: open });
    },
    exportTime: exportTime,
    setAnalysisProject: function (id) { store.set({ analysisProject: id }); },
    setAnalysisTab: function (tab) { store.set({ analysisTab: tab }); },
    openAnalysisProject: function (id) { store.set({ analysisProject: id, analysisTab: 'projects' }); },
    setFeedFilter: function (value) { store.set({ feedFilter: value, feedLimit: 20 }); },
    loadMoreFeed: function () { store.set({ feedLimit: (store.getState().feedLimit || 20) + 20 }); },
    toggleFeedComments: function (key) {
      var open = (store.getState().feedOpen || []).slice();
      var at = open.indexOf(key);
      if (at >= 0) open.splice(at, 1); else open.push(key);
      store.set({ feedOpen: open });
    },
    toggleReaction: function (key, reactionId) {
      var me = currentMe();
      if (!me) { Toast.show({ message: 'Wybierz w „Mojej pracy”, kim jesteś.', tone: 'danger' }); return; }
      updateWorkspace(function (ws) { return Object.assign({}, ws, { social: E.Social.toggleReaction(ws.social, key, reactionId, me) }); });
    },
    addComment: function (key, body) {
      var result = E.Social.addComment(store.getState().workspace.social, key, currentMe(), body, new Date());
      if (!result.valid) { Toast.show({ message: result.error, tone: 'danger' }); return false; }
      updateWorkspace(function (ws) { return Object.assign({}, ws, { social: result.social }); });
      return true;
    },
    removeComment: function (id) {
      updateWorkspace(function (ws) { return Object.assign({}, ws, { social: E.Social.removeComment(ws.social, id) }); });
    },
    addPost: function (body, projectId, extra) {
      var meId = currentMe();
      var more = extra || {};
      if ((more.type === 'announcement') && !E.Budget.isManagement(meId, store.getState().workspace.people || [])) {
        Toast.show({ message: 'Ogłoszenia publikuje zarząd.', tone: 'danger' }); return false;
      }
      var result = E.Social.addPost(store.getState().workspace.social, Object.assign({ personId: meId, projectId: projectId, text: body }, more), new Date());
      if (!result.valid) { Toast.show({ message: result.error, tone: 'danger' }); return false; }
      updateWorkspace(function (ws) { return Object.assign({}, ws, { social: result.social }); });
      return true;
    },
    editPost: function (id, body) {
      var result = E.Social.editPost(store.getState().workspace.social, id, body);
      if (!result.valid) { Toast.show({ message: result.error, tone: 'danger' }); return false; }
      updateWorkspace(function (ws) { return Object.assign({}, ws, { social: result.social }); });
      store.set({ feedEditing: null });
      return true;
    },
    setFeedEditing: function (id) { store.set({ feedEditing: id }); },
    votePoll: function (postId, optionId) {
      var meId = currentMe();
      if (!meId) { Toast.show({ message: 'Wybierz w „Mojej pracy”, kim jesteś.', tone: 'danger' }); return; }
      updateWorkspace(function (ws) { return Object.assign({}, ws, { social: E.Social.vote(ws.social, postId, meId, optionId) }); });
    },
    togglePin: function (postId) {
      updateWorkspace(function (ws) { return Object.assign({}, ws, { social: E.Social.togglePin(ws.social, postId) }); });
    },
    removePost: function (id) {
      updateWorkspace(function (ws) { return Object.assign({}, ws, { social: E.Social.removePost(ws.social, id) }); });
    },
    setMyView: function (value) { store.set({ myView: value }); },
    snoozeInbox: snoozeInbox,
    unsnoozeInbox: unsnoozeInbox,
    lastTimedTask: lastTimedTask,
    taskMinutes: function (taskId) { return TL.sum(entries().filter(function (e) { return e.taskId === taskId; }), new Date()); },
    stopTimer: stopTimer,
    isTiming: isTiming,
    logTime: function (projectId, stageId, taskId) { openTimeForm({ mode: 'manual', projectId: projectId, stageId: stageId, taskId: taskId }); },
    editEntry: function (id) { openTimeForm({ mode: 'edit', entryId: id }); },
    addTimeEntry: function () { openTimeForm({ mode: 'manual', needsTask: true }); },
    logTimeRange: function (fromMs, toMs) {
      openTimeForm({ mode: 'manual', needsTask: true, date: TL.dayKey(fromMs), from: TL.clockOf(fromMs), to: TL.clockOf(toMs) });
    },
    deleteEntry: deleteEntry,
    addMail: openAddMail,
    editMail: openEditMail,
    replyMail: replyToMail,
    deleteMail: deleteMail,
    toggleMailAction: toggleMailAction,
    libAddTask: libAddTask, libRenameTask: libRenameTask, libRemoveTask: libRemoveTask, libResetTasks: libResetTasks,
    mailTask: mailToTask,
    setMailView: function (patch) { store.update(function (state) { return Object.assign({}, state, { mailView: Object.assign({}, state.mailView, patch) }); }); },
    cyclePart: cycleTaskPart,
    setTaskFilter: function (value) { store.set({ taskFilter: value }); },
    setKanban: function (patch) { store.update(function (state) { return Object.assign({}, state, { kanban: Object.assign({}, state.kanban, patch) }); }); },
    editPerson: openEditPerson,
    togglePerson: togglePerson,
    deletePerson: deletePerson,
    newPerson: openNewPerson,
    openCreate: openCreate,
    clearTeamFilters: clearTeamFilters,
    goTo: goTo,
    setMe: setMe,
    setPref: setPref,
    previewLook: applyLook,
    inspect: inspect,
    closeInspector: closeInspector,
    isInspected: isInspected,
    isPinned: isPinned,
    togglePin: togglePin,
    toggleDone: toggleDone,
    toggleStageGroup: toggleStageGroup,
    revealStage: revealStage,
    openStage: openStage,
    loadDemo: function () { loadDemo(); },
    filterPortfolio: filterPortfolio,
    applyView: applyView,
    saveView: saveView,
    removeView: removeView,
    setLeader: setLeader,
    setProjectDeadline: setProjectDeadline,
    freezeBaseline: freezeBaseline,
    distributeBudget: distributeBudget,
    patchStage: patchStage,
    acceptPlan: acceptPlan,
    reopenPlan: reopenPlan,
    addDraftTask: addDraftTask,
    addLibraryTasks: addLibraryTasks,
    toggleBudgetStage: toggleBudgetStage,
    setTaskHours: setTaskHours,
    fillStageHours: fillStageHours,
    removeDraftTask: removeDraftTask
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
          return { type: 'radio', label: Query.SORTS[key], value: key, checked: current === key, onSelect: function () { setFilters({ sort: key, dir: 'asc' }); } };
        })).concat([{ type: 'separator' }, { type: 'checkbox', label: 'Od najnowszych (malejąco)', checked: store.getState().filters.dir === 'desc', onSelect: function () { setFilters({ dir: store.getState().filters.dir === 'desc' ? 'asc' : 'desc' }); } }])
      };
    });

    nodes.groupButton = UI.button({ label: 'Stan', icon: 'layers', variant: 'ghost', size: 'sm', attrs: { id: 'tb-group' } });
    Menu.bind(nodes.groupButton, function () {
      var current = store.getState().prefs.groupBy;
      var labels = { health: 'Stan projektu', status: 'Status', none: 'Bez grupowania' };
      return {
        label: 'Grupowanie', align: 'end',
        items: [{ type: 'label', label: 'Grupuj według' }].concat(E.Prefs.GROUPS.map(function (key) {
          return { type: 'radio', label: labels[key], value: key, checked: current === key, onSelect: function () { Motion.withTransition(function () { setPref({ groupBy: key }); }); } };
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

    nodes.clearFilters = UI.button({ label: 'Wyczyść', variant: 'ghost', size: 'sm', icon: 'close', onClick: clearFilters, attrs: { id: 'tb-clear', title: 'Wyczyść wszystkie filtry' } });
    // Zawężenie ustawione z przeglądu portfela — widoczne w pasku i zdejmowane jednym kliknięciem.
    nodes.scopeChip = D.el('button', {
      class: 'filter-btn filter-btn--active filter-btn--scope',
      attrs: { type: 'button', id: 'tb-scope', hidden: true },
      on: { click: function () { setFilters({ health: 'all', horizon: 0 }); } }
    });
    nodes.saveView = UI.button({ label: 'Zapisz widok', icon: 'plus', variant: 'ghost', size: 'sm', onClick: saveView, attrs: { id: 'tb-save-view', hidden: true } });
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
      nodes.scopeChip,
      nodes.clearFilters,
      nodes.saveView,
      D.el('span', { class: 'toolbar__spacer' }),
      nodes.tally,
      nodes.groupButton,
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

  function scopeLabel(filters) {
    // Stan (health) pokazują zakładki widoków; znacznik zostaje tylko dla zawężenia terminami.
    return filters.horizon ? { text: 'Terminy w ' + filters.horizon + ' dniach', level: null } : null;
  }

  function renderProjects(state) {
    var all = state.workspace.projects;
    var visible = Query.filterAndSort(all, Object.assign({}, state.filters, { mail: state.workspace.mail }));
    var scope = scopeLabel(state.filters);
    var filtered = state.filters.query.trim() || state.filters.status !== 'all' || state.filters.person !== 'all' || !!scope;
    var overdue = all.filter(function (p) { return Progress.isOverdue(p); }).length;
    var running = all.filter(function (p) { return p.status === 'active'; }).length;

    D.render(nodes.projectsSummary, all.length
      ? [D.el('span', { text: all.length + ' w portfelu · ' + running + ' w realizacji' + (overdue ? ' · ' + overdue + ' po terminie umowy' : '') })]
      : [D.el('span', { text: 'Portfel projektów biura: terminy umów, przebieg etapów i zespół.' })]);

    var person = Team.findPerson(people(), state.filters.person);
    nodes.statusFilter.set(state.filters.status === 'all' ? 'Wszystkie' : Model.PROJECT_STATUS[state.filters.status], state.filters.status !== 'all');
    nodes.personFilter.set(person ? Team.fullName(person) : 'Wszystkie', state.filters.person !== 'all');
    nodes.clearFilters.hidden = !filtered;
    nodes.scopeChip.hidden = !scope;
    if (scope) {
      D.render(nodes.scopeChip, [
        scope.level ? E.Sig.datum(scope.level, { size: 12, label: false }) : E.Icons.icon('calendar', 14),
        D.el('span', { text: scope.text }),
        E.Icons.icon('close', 12)
      ]);
      nodes.scopeChip.setAttribute('aria-label', 'Zawężenie: ' + scope.text + '. Usuń zawężenie');
    }
    nodes.tally.textContent = filtered ? visible.length + ' z ' + all.length : '';
    nodes.tally.title = filtered ? 'Pasuje ' + visible.length + ' z ' + all.length + ' projektów' : '';
    nodes.sortButton.querySelector('span').textContent = (SORT_LABEL[state.filters.sort] || 'Numer') + (state.filters.dir === 'desc' ? ' ↓' : ' ↑');
    nodes.sortButton.setAttribute('aria-label', 'Sortowanie: ' + (Query.SORTS[state.filters.sort] || ''));
    nodes.columnsButton.hidden = state.prefs.view !== 'list';
    nodes.groupButton.hidden = state.prefs.view !== 'list';
    nodes.groupButton.querySelector('span').textContent = { health: 'Stan', status: 'Status', none: 'Bez grup' }[state.prefs.groupBy];
    nodes.groupButton.setAttribute('aria-label', 'Grupowanie: ' + { health: 'stan projektu', status: 'status', none: 'bez grupowania' }[state.prefs.groupBy]);

    nodes.portfolio.hidden = true;
    nodes.railWrap.hidden = !all.length;
    nodes.railWrap.parentNode.classList.toggle('is-rail-collapsed', !!state.prefs.railCollapsed);
    nodes.viewsBar.hidden = !all.length;
    var pctx = { state: state, people: people(), actions: actions };
    if (all.length) {
      D.patch(nodes.rail, E.ProjectList.rail(all, pctx));
      D.patch(nodes.viewsBar, E.ProjectList.views(all, pctx));
    }
    var matchesView = E.ProjectList.allViews(state.prefs).some(function (v) {
      var f = E.ProjectList.viewFilters(v, state.prefs);
      return state.prefs.projectView === v.id && f.health === state.filters.health && f.person === state.filters.person && f.status === state.filters.status && (f.query || '') === state.filters.query.trim() && !state.filters.horizon;
    });
    nodes.saveView.hidden = !filtered || matchesView;
    nodes.view.set(state.prefs.view);
    nodes.filters.hidden = !all.length;
    nodes.newProject.hidden = !all.length;

    var ctx = { state: state, people: people(), actions: actions, motion: { flashProject: pendingFlash && !pendingFlash.stageId && !pendingFlash.taskId ? pendingFlash.projectId : null } };

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
      content = E.ProjectList.onboarding({
        create: openCreate,
        demo: loadDemo,
        importCopy: function () { nodes.fileInput.click(); },
        people: people().length
      });
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
    if (titleReturn != null) {
      var back = nodes.list.querySelector('[data-project-title="' + titleReturn + '"]');
      if (back) back.style.setProperty('view-transition-name', 'project-title');
    }
  }

  function renderProject(state, project) {
    var motion = buildMotion(state, project);
    var ctx = { state: state, people: people(), actions: actions, motion: motion };
    D.patch(nodes.projectView, E.ProjectDetail.projectDetail(project, ctx));
    D.patch(nodes.topbarActions, E.ProjectDetail.topbarActions(project, ctx));
    commitMotion(project);
  }

  /** Pojemność osób (średnia godzin z 4 tygodni wobec 40 h) — tylko dla zarządu, który widzi godziny wszystkich. */
  function teamCapacity(state) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me || !E.Budget.isManagement(me.id, state.workspace.people || [])) return null;
    var pf = E.Analysis.portfolio(state.workspace, me.id, new Date());
    var map = {};
    pf.team.forEach(function (t) { map[t.personId] = { utilization: t.utilization, avg4: t.avg4, capacity: pf.capacity }; });
    (state.workspace.people || []).forEach(function (p) { if (!map[p.id]) map[p.id] = { utilization: 0, avg4: 0, capacity: pf.capacity }; });
    return map;
  }

  function renderTeam(state) {
    var roster = state.workspace.people || [];
    var visible = E.TeamScreen.visiblePeople(roster, state.teamFilters);
    var activeCount = roster.filter(function (p) { return p.active !== false; }).length;
    var filtered = state.teamFilters.query.trim() || state.teamFilters.role !== 'all';

    var team = E.TeamScreen.summary(roster, state.workspace.projects);
    nodes.teamSummary.textContent = roster.length
      ? F.count(activeCount, 'osoba', 'osoby', 'osób') + ' w zespole, ' + team.busy + ' w czynnych projektach'
        + (team.top ? '. Najwięcej otwartych zadań: ' + Team.fullName(team.top.person) + ' (' + team.top.load.open + ')' : '')
        + (team.late ? '. Po terminie: ' + F.count(team.late, 'zadanie', 'zadania', 'zadań') : '') + '.'
      : 'Katalog osób biura: role w organizacji, obciążenie i funkcje w projektach.';
    nodes.roleFilter.set(state.teamFilters.role === 'all' ? 'Wszystkie' : Team.ORG_ROLES[state.teamFilters.role], state.teamFilters.role !== 'all');
    nodes.teamTally.textContent = filtered ? visible.length + ' z ' + roster.length : '';
    nodes.teamTally.title = filtered ? 'Pasuje ' + visible.length + ' z ' + roster.length + ' osób' : '';
    nodes.teamFilters.hidden = !roster.length;
    nodes.newPerson.hidden = !roster.length;

    D.patch(nodes.teamList, [E.TeamScreen.teamList(roster, state.workspace.projects, state.teamFilters, actions, teamCapacity(state))]);
  }

  function renderLibrary(state) {
    var screen = E.LibraryScreen.view(state, { actions: actions });
    nodes.librarySummary.textContent = screen.summary;
    D.patch(nodes.libraryBody, [screen.body]);
  }

  function renderMyWork(state) {
    var screen = E.MyWork.view(state, { actions: actions, find: locateEntry });
    var meNow = Team.findPerson(people(), state.prefs.me);
    var hour = new Date().getHours();
    var hello = hour >= 5 && hour < 18 ? 'Dzień dobry' : 'Dobry wieczór';
    document.getElementById('mywork-title').textContent = meNow ? hello + ', ' + (meNow.firstName || Team.fullName(meNow)) : 'Moja praca';
    nodes.myworkSummary.textContent = screen.summary;
    D.render(nodes.myworkWho, screen.who ? [screen.who] : []);
    D.patch(nodes.myworkBody, [screen.body]);
  }

  function renderFeed(state) {
    var screen = E.FeedScreen.view(state, { actions: actions });
    nodes.feedSummary.textContent = screen.summary;
    D.patch(nodes.feedBody, [screen.body]);
  }

  function renderTime(state) {
    var screen = E.TimeScreen.view(state, { actions: actions, find: locateEntry });
    nodes.timeSummary.textContent = screen.summary;
    D.render(nodes.timeTools, screen.tools ? [screen.tools] : []);
    D.patch(nodes.timeBody, [screen.body]);
  }

  function renderAnalysis(state) {
    var screen = E.AnalysisScreen.view(state, { actions: actions });
    nodes.analysisSummary.textContent = screen.summary;
    D.render(nodes.analysisTools, screen.tools ? [screen.tools] : []);
    D.patch(nodes.analysisBody, [screen.body]);
  }

  function snoozeInbox(key, title) {
    var next = E.Inbox.snooze(store.getState().prefs.snoozed, key, new Date(), 1);
    setPref({ snoozed: next });
    Toast.show({
      message: 'Odłożono do jutra: ' + title,
      actionLabel: 'Cofnij',
      onAction: function () { setPref({ snoozed: E.Inbox.unsnooze(store.getState().prefs.snoozed, key) }); }
    });
  }

  function unsnoozeInbox(key) {
    setPref({ snoozed: E.Inbox.unsnooze(store.getState().prefs.snoozed, key) });
  }

  function setMe(personId) {
    setPref({ me: personId });
    var person = Team.findPerson(people(), personId);
    if (person) Toast.show({ message: 'Pracujesz jako ' + Team.fullName(person) + '.', tone: 'info', timeout: 3000 });
  }

  function renderNotice(state) {
    if (!state.notice) { D.clear(nodes.notice); return; }
    D.render(nodes.notice, [UI.alert({ tone: 'info', text: state.notice, onDismiss: function () { store.set({ notice: '' }); } })]);
  }

  function renderDrawer(state) {
    var current = state.form || state.personForm || state.taskForm || state.stageForm || state.timeForm || state.mailForm || null;
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
      settings.content = E.PersonForm.personForm(current.draft, current.errors, { onSubmit: submitPerson, onCancel: function () { store.set({ personForm: null }); } }, { management: E.Budget.isManagement(state.prefs.me, state.workspace.people || []) });
    } else if (current === state.taskForm) {
      var project = findProject(current.projectId);
      var stage = stageOf(current.projectId, current.stageId);
      var roster = project
        ? projectRoster(project).map(function (id) { return Team.findPerson(state.workspace.people, id); }).filter(Boolean)
        : [];
      settings.title = current.draft.id != null ? 'Edytuj zadanie' : 'Nowe zadanie';
      settings.subtitle = (project ? project.code : '') + (stage ? ' · ' + Model.describeStage(stage).name : '');
      settings.content = E.TaskForm.taskForm(current.draft, current.errors, { onSubmit: submitTask, onCancel: function () { store.set({ taskForm: null }); } }, roster, current.fromMail ? { mail: current.fromMail, stageId: current.stageId, stages: (project ? project.stages : []).map(function (st) { return { value: st.id, label: Model.describeStage(st).name }; }) } : null);
    } else if (current === state.timeForm) {
      var logged = findProject(current.projectId);
      var loggedTask = taskOf(current.projectId, current.stageId, current.taskId);
      settings.title = current.mode === 'stop' ? 'Rozlicz zegar' : (current.mode === 'edit' ? 'Zmień wpis czasu' : 'Dopisz czas');
      settings.subtitle = current.choices ? 'Wybierz zadanie, na które pracowałeś' : (logged ? logged.code + ' · ' : '') + (loggedTask ? loggedTask.name : 'Zadanie');
      settings.content = E.Timer.timeForm({ mode: current.mode, draft: current.draft, errors: current.errors, hint: current.hint, choices: current.choices },
        { onSubmit: submitTime, onCancel: function () { store.set({ timeForm: null }); } });
    } else if (current === state.mailForm) {
      var mailProject = findProject(current.projectId);
      settings.title = current.mode === 'edit' ? 'Edytuj wpis w dzienniku' : (current.draft.direction === 'out' ? 'Pismo wychodzące' : 'Pismo przychodzące');
      settings.subtitle = mailProject ? mailProject.code + ' · ' + mailProject.name : '';
      settings.content = E.MailTab.mailForm({
        mode: current.mode, draft: current.draft, errors: current.errors, locked: current.locked,
        replies: mailReplyOptions(current.projectId, current.draft.direction, current.draft.id)
      }, {
        onSubmit: submitMail,
        onRedraft: function (draft) { store.set({ mailForm: Object.assign({}, current, { draft: draft, errors: {} }) }); },
        onCancel: function () { store.set({ mailForm: null }); }
      });
    } else if (current === state.stageForm) {
      var owner = findProject(current.projectId);
      var editingStage = !!current.stageId;
      settings.title = editingStage ? 'Edytuj etap' : 'Etap spoza standardu';
      settings.subtitle = owner ? owner.code + ' · ' + owner.name : '';
      var editedStage = editingStage ? stageOf(current.projectId, current.stageId) : null;
      settings.content = E.StageForm.stageForm(current.draft, current.errors, {
        onSubmit: submitCustomStage,
        onCancel: function () { store.set({ stageForm: null }); },
        onRemoveAdjustment: function (id) { removeAdjustment(current.projectId, current.stageId, id); }
      }, { edit: editingStage, custom: current.custom !== false, management: E.Budget.canAdjust(currentMe(), people()), adjustments: editedStage ? editedStage.adjustments || [] : [] });
    } else {
      var editing = current.draft.id != null;
      settings.title = editing ? 'Edytuj projekt' : 'Nowy projekt';
      settings.subtitle = editing ? current.draft.code : 'Dane umowy, zespół i etapy ze standardu.';
      settings.content = E.ProjectForm.projectForm(current.draft, current.errors, { onSubmit: submitForm, onCancel: function () { store.set({ form: null }); } }, state.workspace.people || [], { management: E.Budget.isManagement(state.prefs.me, state.workspace.people || []) });
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
        if (live.form || live.personForm || live.taskForm || live.stageForm || live.timeForm || live.mailForm) {
          store.set({ form: null, personForm: null, taskForm: null, stageForm: null, timeForm: null, mailForm: null });
        }
      }
    }));
  }

  function renderScreen(state) {
    var route = state.route;
    nodes.views.projects.hidden = route.name !== 'projects';
    nodes.views.project.hidden = route.name !== 'project';
    nodes.views.team.hidden = route.name !== 'team';
    nodes.views.library.hidden = route.name !== 'library';
    E.Library.configure(state.workspace.library);
    nodes.views.mywork.hidden = route.name !== 'mywork';
    nodes.views.feed.hidden = route.name !== 'feed';
    nodes.views.analysis.hidden = route.name !== 'analysis';
    nodes.views.time.hidden = route.name !== 'time';

    var project = route.name === 'project' ? (state.workspace.projects.filter(function (p) { return p.id === route.projectId; })[0] || null) : null;
    E.Shell.render(state, project);
    nodes.app.classList.toggle('app--nav-open', !!state.navOpen);
    nodes.navToggle.setAttribute('aria-expanded', String(!!state.navOpen));

    nodes.app.classList.toggle('app--collapsed', !!state.prefs.sidebarCollapsed);
    if (route.name !== 'project') D.clear(nodes.topbarActions);
    var meCurrent = currentMe();
    var todays = meCurrent ? TL.forDay(state.workspace.entries || [], meCurrent, new Date()) : [];
    D.render(nodes.timerSlot, [
      E.Timer.nowClock(),
      meCurrent ? E.Timer.dayMeter(todays, { find: locateEntry, actions: actions }) : null,
      E.Timer.pill(runningTimer(), { find: locateEntry, actions: actions, budget: timerBudget })
    ]);

    if (route.name === 'time') {
      document.title = 'Czas · ETROM';
      renderTime(state);
    } else if (route.name === 'analysis') {
      document.title = 'Analiza · ETROM';
      renderAnalysis(state);
    } else if (route.name === 'feed') {
      document.title = 'Aktualności · ETROM';
      renderFeed(state);
    } else if (route.name === 'mywork') {
      document.title = 'Moja praca · ETROM';
      renderMyWork(state);
    } else if (route.name === 'library') {
      document.title = 'Biblioteka · ETROM';
      renderLibrary(state);
    } else if (route.name === 'team') {
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
    E.Shell.setSaved(storage.save(state.workspace).ok, true);
  }

  function renderInspector(state) {
    E.Inspector.render(nodes.inspector, state.inspector, {
      people: people(),
      projects: state.workspace.projects,
      entries: state.workspace.entries || [],
      me: state.prefs.me,
      findProject: findProject,
      mailOf: function (id) { return mailList().filter(function (e) { return e.id === id; })[0] || null; },
      actions: actions
    });
  }

  function renderAll(state) {
    E.Identity.setColors(state.workspace && state.workspace.projects);
    renderNotice(state);
    renderScreen(visibleState(state));
    renderInspector(state);
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

  var pendingG = false;

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
      if (state.inspector) { closeInspector(); return; }
      if (state.navOpen) { store.set({ navOpen: false }); return; }
      if (Object.keys(state.selection).length) { clearSelection(); return; }
      return;
    }
    if (pendingG) {
      pendingG = false;
      if (event.key === 'p' || event.key === 'P') { event.preventDefault(); goTo('projects'); return; }
      if (event.key === 'z' || event.key === 'Z') { event.preventDefault(); goTo('team'); return; }
      if (event.key === 'm' || event.key === 'M') { event.preventDefault(); goTo('mywork'); return; }
      if (event.key === 'a' || event.key === 'A') { event.preventDefault(); goTo('feed'); return; }
      if (event.key === 'n' || event.key === 'N') { event.preventDefault(); goTo('analysis'); return; }
    }
    if ((event.key === 't' || event.key === 'T') && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); toggleTimerKey(); return; }
    if (event.key === 'g' || event.key === 'G') {
      pendingG = true;
      window.setTimeout(function () { pendingG = false; }, 900);
      return;
    }
    if (event.key === ' ' && event.target && event.target.classList && event.target.classList.contains('project-link')) {
      // Spacja na projekcie: szybki podgląd w inspektorze, bez opuszczania listy.
      var row = event.target.closest('[data-project-id]');
      if (row) {
        event.preventDefault();
        if (state.inspector && state.inspector.kind === 'project' && state.inspector.projectId === Number(row.dataset.projectId)) closeInspector();
        else inspect({ kind: 'project', projectId: Number(row.dataset.projectId) });
        return;
      }
    }
    if ((route === 'mywork') && (event.key === 'j' || event.key === 'J' || event.key === 'k' || event.key === 'K')) {
      var rows = Array.prototype.slice.call(document.querySelectorAll('#view-mywork .trow__name'));
      if (rows.length) {
        event.preventDefault();
        var cur = rows.indexOf(document.activeElement);
        var fwd = event.key === 'j' || event.key === 'J';
        var target = cur < 0 ? (fwd ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, cur + (fwd ? 1 : -1)));
        rows[target].focus();
        rows[target].scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    if (route === 'projects' && (event.key === 'j' || event.key === 'J' || event.key === 'k' || event.key === 'K')) {
      var links = Array.prototype.slice.call(nodes.list.querySelectorAll('.project-link'));
      if (links.length) {
        event.preventDefault();
        var at = links.indexOf(document.activeElement);
        var down = event.key === 'j' || event.key === 'J';
        var to = at < 0 ? (down ? 0 : links.length - 1) : Math.max(0, Math.min(links.length - 1, at + (down ? 1 : -1)));
        links[to].focus();
        links[to].scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    if (event.key === 'v' || event.key === 'V') {
      if (route === 'projects') { event.preventDefault(); setView(state.prefs.view === 'list' ? 'cards' : 'list'); return; }
      if (route === 'project' && state.route.tab === 'zadania') { event.preventDefault(); setPref({ taskView: state.prefs.taskView === 'kanban' ? 'list' : 'kanban' }); return; }
    }
    if (event.key === '[') { event.preventDefault(); toggleSidebar(); return; }
    if (event.key === '?') { event.preventDefault(); showShortcuts(); return; }
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
    // Stan projektu wszędzie uwzględnia pisma po terminie (jedno źródło prawdy).
    E.Insight.setMailSource(function () { return store.getState().workspace.mail || []; });
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
    nodes.timerSlot = D.byId('timer-slot');
    nodes.myworkSummary = D.byId('mywork-summary');
    nodes.librarySummary = D.byId('library-summary');
    nodes.libraryBody = D.byId('library-body');
    nodes.myworkWho = D.byId('mywork-who');
    nodes.myworkBody = D.byId('mywork-body');
    nodes.feedSummary = D.byId('feed-summary');
    nodes.feedBody = D.byId('feed-body');
    nodes.analysisSummary = D.byId('analysis-summary');
    nodes.analysisTools = D.byId('analysis-tools');
    nodes.analysisBody = D.byId('analysis-body');
    nodes.timeSummary = D.byId('time-summary');
    nodes.timeTools = D.byId('time-tools');
    nodes.timeBody = D.byId('time-body');
    nodes.fileInput = D.byId('import-file');
    nodes.views = { projects: D.byId('view-projects'), project: D.byId('view-project'), team: D.byId('view-team'), library: D.byId('view-library'), mywork: D.byId('view-mywork'), feed: D.byId('view-feed'), analysis: D.byId('view-analysis'), time: D.byId('view-time') };
    nodes.portfolio = D.byId('portfolio');
    nodes.rail = D.byId('rail');
    nodes.railWrap = D.byId('rail-wrap');
    nodes.viewsBar = D.byId('views-bar');
    nodes.scroller = D.byId('scroller');
    nodes.sheet = D.byId('sheet');
    nodes.inspector = D.byId('inspector');
    nodes.topbarActions = D.byId('topbar-actions');
    nodes.scroller.addEventListener('scroll', function () {
      nodes.sheet.classList.toggle('is-scrolled', nodes.scroller.scrollTop > 4);
    }, { passive: true });

    E.Shell.build({
      sidebar: D.byId('sidebar'),
      crumb: D.byId('crumb'),
      getState: store.getState,
      actions: {
        openPalette: openPalette,
        newProject: function () { if (store.getState().route.name === 'team') goTo('projects'); openCreate(); },
        newPerson: function () { goTo('team'); openNewPerson(); },
        showShortcuts: showShortcuts,
        toggleSidebar: toggleSidebar,
        setPref: setPref,
        previewLook: applyLook,
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
    store.subscribe(observeEvents);
    window.setInterval(observeEvents, 5 * 60 * 1000);
    store.update(function (state) {
      return Object.assign({}, state, {
        workspace: loaded.workspace,
        route: route,
        screen: screenOf(route),
        notice: loaded.importedFromLegacy
          ? 'Wczytano dane ze starszej wersji ETROM (' + F.count(loaded.workspace.projects.length, 'projekt', 'projekty', 'projektów') + '). Stary zapis pozostał nietknięty.'
          : (loaded.warning || '')
      });
    });
    var startView = findView(store.getState().prefs.projectView);
    if (startView && startView.id !== 'all') applyViewFilters(startView, true);
    renderAll(store.getState());
    E.Shell.setSaved(true);

    // Zegar tyka bez przerysowywania aplikacji; po powrocie do karty sprawdzamy zapomniany zegar.
    window.setInterval(E.Timer.tick, 500);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { E.Timer.tick(); checkForgotten(); }
    });
    window.setTimeout(checkForgotten, 600);
    window.setInterval(function () { checkTimerReminder(); checkBudget(); }, 60000);
    window.setTimeout(checkBudget, 900);
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (name) { document.addEventListener(name, noteActivity, { passive: true, capture: true }); });
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
    goTo: goTo,
    actions: actions
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
