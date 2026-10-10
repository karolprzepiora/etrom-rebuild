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
  var StageAuto = E.StageAuto;
  var Dialog = E.Dialog;
  var Toast = E.Toast;
  var Motion = E.Motion;
  var Team = E.Team;
  var Tasks = E.Tasks;
  var F = E.Format;

  var storage = E.Storage.createStorage();
  var prefsStore = E.Prefs.createPrefs();

  var SORT_LABEL = { manual: 'Moja kolejność', deadline: 'Termin', name: 'Nazwa', code: 'Numer' };

  var store = E.Store.createStore({
    workspace: Model.emptyWorkspace(),
    route: { name: 'projects' },
    screen: 'projects',
    filters: { query: '', status: 'all', sort: 'code', dir: 'desc', person: 'all', health: 'all', horizon: 0 },
    teamFilters: { query: '', role: 'all', showInactive: false },
    teamTab: 'board',
    teamStatus: 'all',
    prefs: E.Prefs.defaults(),
    selection: {},
    page: 0,
    taskFilter: 'open',
    kanban: { stage: 'all', person: 'all', mine: false, group: 'none' },
    form: null,
    personForm: null,
    stageForm: null,
    timeForm: null,
    pendingSwitch: null,
    mailForm: null,
    mailView: { direction: 'all', waiting: false, query: '' },
    analysisProject: null,
    timeTab: 'sheet',
    calAnchor: null,
    calDay: null,
    timeMode: 'week',
    timeOffset: 0,
    timePerson: null,
    timeOpen: {},
    timeGaps: false,
    timeDone: false,
    planCell: null,
    analysisTab: 'overview',
    settingsSection: 'look',
    settingsAdvOpen: false,
    feedEditing: null,
    feedFilter: 'all',
    feedLimit: 20,
    feedOpen: [],
    myView: 'all',
    inbox: { kind: 'all', project: 'all', urgent: false },
    taskForm: null,
    absenceForm: null,
    tripForm: null,
    orderForm: null,
    orderPanel: null,
    ordersView: { tab: 'mine' },
    leaveForm: null,
    leave: { tab: 'mine', view: 'cards', year: 0, sel: null, monthOffset: 0 },
    caseForm: null,
    mailStep: null,
    mailCard: null,
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

  var TABS = ['etapy', 'budzet', 'zadania', 'sprawy', 'zlecenia', 'korespondencja', 'zespol', 'czas', 'analiza', 'aktywnosc'];

  function parseRoute(hash) {
    var parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'ustawienia') return { name: 'settings' };
    if (parts[0] === 'zespol') return { name: 'team' };
    if (parts[0] === 'biblioteka') return { name: 'library' };
    if (parts[0] === 'plan') return { name: 'plan' };
    if (parts[0] === 'przeglad') return { name: 'review' };
    if (parts[0] === 'kalendarz') return { name: 'calendar' };
    if (parts[0] === 'urlopy') return { name: 'leave' };
    if (parts[0] === 'pulpit') return { name: 'dashboard' };
    if (parts[0] === 'zlecenia') return { name: 'orders' };
    if (parts[0] === 'moja-praca') return { name: 'mywork' };
    if (parts[0] === 'skrzynka') return { name: 'inbox' };
    if (parts[0] === 'aktualnosci') return { name: 'feed' };
    if (parts[0] === 'analiza') return { name: 'analysis' };
    if (parts[0] === 'czas') return { name: 'time' };
    if (parts[0] === 'projekty' && parts[1] && /^\d+$/.test(parts[1])) {
      return { name: 'project', projectId: Number(parts[1]), tab: TABS.indexOf(parts[2]) >= 0 ? parts[2] : 'etapy' };
    }
    if (parts[0] === 'projekty') return { name: 'projects' };
    return { name: 'dashboard' };
  }

  function screenOf(route) {
    return route.name === 'settings' ? 'settings' : route.name === 'orders' ? 'orders' : route.name === 'dashboard' ? 'dashboard' : route.name === 'leave' ? 'leave' : route.name === 'calendar' ? 'calendar' : route.name === 'review' ? 'review' : route.name === 'plan' ? 'plan' : route.name === 'library' ? 'library' : route.name === 'team' ? 'team' : (route.name === 'inbox' ? 'inbox' : route.name === 'mywork' ? 'mywork' : (route.name === 'time' ? 'time' : (route.name === 'feed' ? 'feed' : (route.name === 'analysis' ? 'analysis' : 'projects'))));
  }

  function routeHash(route) {
    if (route.name === 'settings') return '#/ustawienia';
    if (route.name === 'team') return '#/zespol';
    if (route.name === 'library') return '#/biblioteka';
    if (route.name === 'plan') return '#/plan';
    if (route.name === 'review') return '#/przeglad';
    if (route.name === 'calendar') return '#/kalendarz';
    if (route.name === 'leave') return '#/urlopy';
    if (route.name === 'dashboard') return '#/pulpit';
    if (route.name === 'orders') return '#/zlecenia';
    if (route.name === 'mywork') return '#/moja-praca';
    if (route.name === 'inbox') return '#/skrzynka';
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
    // Wejście do Kalendarza zawsze zaczyna od dnia bieżącego, a nie od ostatnio klikniętego.
    if (changedScreen && route.name === 'calendar') { patch.calAnchor = null; patch.calDay = null; }
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
    navigate({ name: screen === 'settings' ? 'settings' : screen === 'orders' ? 'orders' : screen === 'dashboard' ? 'dashboard' : screen === 'leave' ? 'leave' : screen === 'calendar' ? 'calendar' : screen === 'review' ? 'review' : screen === 'plan' ? 'plan' : screen === 'library' ? 'library' : screen === 'team' ? 'team' : (screen === 'inbox' ? 'inbox' : screen === 'mywork' ? 'mywork' : (screen === 'time' ? 'time' : (screen === 'feed' ? 'feed' : (screen === 'analysis' ? 'analysis' : 'projects')))) });
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
      var next = producer(state.workspace);
      // Automat statusów etapów działa po każdej zmianie zadań i spraw.
      if (next && next.projects) {
        var projects = reconcileProjects(next.projects, next.cases || []);
        if (projects !== next.projects) next = Object.assign({}, next, { projects: projects });
      }
      return Object.assign({}, state, { workspace: next });
    });
  }

  /** Automat statusów etapów: po każdej zmianie projektów start etapu dzieje się sam. */
  function reconcileProjects(projects, cases) {
    var notes = [];
    var next = projects.map(function (project) {
      var r = StageAuto.reconcile(project.stages, {
        decisionOf: function (stage) { return Model.describeStage(stage).decision; },
        casesOf: function (stage) { return (cases || []).filter(function (c) { return c.projectId === project.id && c.stageId === stage.id; }); }
      });
      if (!r.changes.length) return project;
      r.changes.forEach(function (c) {
        var st = project.stages.filter(function (x) { return x.id === c.id; })[0];
        notes.push({ name: st ? Model.describeStage(st).name : '', to: c.to, reason: c.reason });
      });
      return Object.assign({}, project, { stages: r.stages });
    });
    if (notes.length && notes.length <= 2) {
      notes.forEach(function (n) {
        Toast.show({ message: 'Etap „' + n.name + '” ' + (n.reason === 'reopened' ? 'wrócił do „W toku”: doszło otwarte zadanie.' : 'jest teraz w toku.'), tone: 'success', timeout: 4000 });
      });
    }
    return notes.length ? next : projects;
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

  function isMgmt() { return E.Budget.isManagement(store.getState().prefs.me, people()); }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** Zapisuje listę osób razem z wpisami do dziennika zmian (jedna zmiana stanu, jedno cofnięcie). */
  function commitPeople(next, entries) {
    var me = currentMe() || '';
    updateWorkspace(function (workspace) {
      var audit = workspace.audit || [];
      (entries || []).forEach(function (entry) { audit = E.Accounts.addAudit(audit, Object.assign({ by: me }, entry)); });
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, people: next, audit: audit });
    });
  }

  function requireMgmt() {
    if (isMgmt()) return true;
    Toast.show({ message: 'Konta i role zmienia dyrekcja.', tone: 'danger', timeout: 4000 });
    return false;
  }

  function openNewPerson() {
    var draft = { orgRole: 'member', cooperation: 'internal' };
    if (isMgmt()) store.set({ personForm: { draft: draft, errors: {}, wizard: true, step: 1, password: '' } });
    else store.set({ personForm: { draft: draft, errors: {} } });
  }

  function openEditPerson(id) {
    var person = findPerson(id);
    if (!person) return;
    store.set({
      personForm: {
        draft: {
          id: person.id, firstName: person.firstName, lastName: person.lastName,
          position: person.position, orgRole: person.orgRole, cooperation: person.cooperation,
          hourlyCost: person.hourlyCost || 0, rates: person.rates || [], email: person.email || '',
          leaveDays: person.leaveDays || '', hiredAt: person.hiredAt || '',
          leaveCarryDays: person.leaveCarry && person.leaveCarry.year === new Date().getFullYear() ? person.leaveCarry.days : ''
        },
        errors: {}
      }
    });
  }

  /** Stawka z formularza: puste pole = bez zmiany. Zwraca {person?, error?, field?}. */
  function applyRate(person, values) {
    var raw = String(values.newRate == null ? '' : values.newRate).trim().replace(',', '.');
    if (raw === '') return { person: person };
    var res = E.Accounts.addRate(person, raw, values.rateFrom || todayIso(), todayIso());
    if (!res.ok) return { error: res.error, field: /datę/.test(res.error) ? 'rateFrom' : 'newRate' };
    return { person: res.person, added: { rate: Number(raw), from: values.rateFrom || todayIso() } };
  }

  var WIZARD_FIELDS = { 1: ['firstName', 'lastName', 'position', 'email'], 2: ['orgRole', 'cooperation', 'leaveDays'] };

  function wizardErrors(values, step) {
    var check = Team.validatePerson(values, people());
    var errors = {};
    (WIZARD_FIELDS[step] || []).forEach(function (key) { if (check.errors[key]) errors[key] = check.errors[key]; });
    if (step === 1 && !errors.email && !String(values.email || '').trim()) errors.email = 'Podaj adres e-mail, to login osoby.';
    if (step === 2) {
      var raw = String(values.newRate == null ? '' : values.newRate).trim().replace(',', '.');
      if (raw !== '' && !(Number(raw) > 0 && Number(raw) <= 10000)) errors.newRate = 'Podaj stawkę od 0,01 do 10 000 zł.';
    }
    return errors;
  }

  function wizardMove(values, dir) {
    var form = store.getState().personForm;
    if (!form || !form.wizard) return;
    var step = form.step || 1;
    if (dir > 0) {
      var errors = wizardErrors(values, step);
      if (Object.keys(errors).length) { store.set({ personForm: Object.assign({}, form, { draft: values, errors: errors }) }); return; }
    }
    var target = Math.min(3, Math.max(1, step + dir));
    store.set({ personForm: Object.assign({}, form, { draft: values, errors: {}, step: target, password: target === 3 && !form.password ? E.Accounts.generatePassword() : form.password }) });
  }

  function wizardRegenerate() {
    var form = store.getState().personForm;
    if (!form) return;
    store.set({ personForm: Object.assign({}, form, { password: E.Accounts.generatePassword() }) });
  }

  function wizardCreate(values) {
    var form = store.getState().personForm;
    if (!form || !requireMgmt()) return;
    var errors = Object.assign({}, wizardErrors(values, 1), wizardErrors(values, 2));
    if (Object.keys(errors).length) {
      var back = errors.firstName || errors.lastName || errors.position || errors.email ? 1 : 2;
      store.set({ personForm: Object.assign({}, form, { draft: values, errors: errors, step: back }) });
      return;
    }
    var list = people();
    var check = Team.validatePerson(values, list);
    var person = Team.createPerson(check.value, list);
    var rated = applyRate(person, { newRate: values.newRate, rateFrom: todayIso() });
    if (rated.person) person = rated.person;
    person = E.Accounts.createAccount(person, currentMe() || '', new Date());
    var entries = [{ action: 'account.create', target: person.id, detail: person.email }];
    if (rated.added) entries.push({ action: 'rate.change', target: person.id, detail: String(rated.added.rate).replace('.', ',') + ' zł/h' });
    commitPeople(list.concat([person]), entries);
    store.set({ personForm: null });
    Toast.show({ message: 'Założono konto: ' + Team.fullName(person) + '. Przekaż hasło tymczasowe osobie.', tone: 'success', timeout: 6000 });
  }

  function submitPerson(values) {
    var list = people();
    var editing = values.id != null;
    var mgmt = isMgmt();
    var check = Team.validatePerson(values, list, editing ? values.id : undefined);
    var prev = editing ? findPerson(values.id) : null;
    var errors = Object.assign({}, check.errors);
    var next = Object.assign({}, prev || {}, check.value);
    var entries = [];
    var rated = { person: next };

    if (editing && prev) {
      next.hourlyCost = prev.hourlyCost || 0;
      next.rates = prev.rates || [];
      if (!mgmt) {
        next.orgRole = prev.orgRole; next.email = prev.email || ''; next.leaveDays = prev.leaveDays || null; next.hiredAt = prev.hiredAt || ''; next.leaveCarry = prev.leaveCarry || null;
      } else {
        rated = applyRate(next, values);
        if (rated.error) errors[rated.field] = rated.error;
        if (prev.orgRole !== next.orgRole) {
          var sim = E.Accounts.setRole(list, prev.id, next.orgRole);
          if (!sim.ok) errors.orgRole = sim.error;
          else entries.push({ action: 'role.change', target: prev.id, detail: Team.ORG_ROLES[prev.orgRole] + ' → ' + Team.ORG_ROLES[next.orgRole] });
        }
        if ((prev.email || '') !== (next.email || '')) entries.push({ action: 'email.change', target: prev.id, detail: next.email || 'usunięto' });
        if ((prev.leaveDays || null) !== (next.leaveDays || null)) entries.push({ action: 'leave.change', target: prev.id, detail: (next.leaveDays || 26) + ' dni' });
      }
    } else if (!mgmt) {
      next.orgRole = 'member'; next.hourlyCost = 0; next.email = ''; next.leaveDays = null; next.hiredAt = ''; next.leaveCarry = null;
    }
    if (Object.keys(errors).length) {
      store.set({ personForm: { draft: values, errors: errors } });
      return;
    }
    if (rated.added) {
      next = rated.person;
      entries.push({ action: 'rate.change', target: next.id || '', detail: String(rated.added.rate).replace('.', ',') + ' zł/h od ' + rated.added.from });
    }
    if (editing) {
      commitPeople(list.map(function (person) { return person.id === values.id ? next : person; }), entries);
      Toast.show({ message: 'Zapisano zmiany: ' + check.value.firstName + ' ' + check.value.lastName, tone: 'success', timeout: 4000 });
    } else {
      var created = Team.createPerson(check.value, list);
      created.orgRole = 'member';
      setPeople(function (current) { return current.concat([created]); });
      Toast.show({ message: 'Dodano do katalogu: ' + check.value.firstName + ' ' + check.value.lastName, tone: 'success', timeout: 4000 });
    }
    store.set({ personForm: null });
  }

  /* ---------- konta: hasła tymczasowe, wyłączanie ---------- */

  function revealTemp(person, title, message) {
    var password = E.Accounts.generatePassword();
    return { password: password, show: function () {
      return Dialog.reveal({ title: title, message: message, secret: password, note: Team.fullName(person) + ' zmieni hasło przy pierwszym logowaniu. Po zamknięciu tego okna hasło znika. W razie potrzeby ustaw nowe tymczasowe.' });
    } };
  }

  function createAccountFor(id) {
    if (!requireMgmt()) return;
    var person = findPerson(id);
    if (!person) return;
    if (!person.email) {
      Toast.show({ message: 'Najpierw dodaj adres e-mail osoby, to jej login.', tone: 'info', timeout: 5000 });
      openEditPerson(id);
      return;
    }
    var temp = revealTemp(person, 'Konto założone: ' + Team.fullName(person), 'Login: ' + person.email);
    commitPeople(people().map(function (p) { return p.id === id ? E.Accounts.createAccount(p, currentMe() || '', new Date()) : p; }), [{ action: 'account.create', target: id, detail: person.email }]);
    temp.show();
  }

  function resetPasswordFor(id) {
    if (!requireMgmt()) return;
    var person = findPerson(id);
    if (!person) return;
    var temp = revealTemp(person, 'Nowe hasło tymczasowe: ' + Team.fullName(person), 'Login: ' + (person.email || ''));
    commitPeople(people().map(function (p) { return p.id === id ? E.Accounts.resetPassword(p, new Date()) : p; }), [{ action: 'account.reset', target: id }]);
    temp.show();
  }

  function disableAccountFor(id) {
    if (!requireMgmt()) return;
    var person = findPerson(id);
    if (!person) return;
    var res = E.Accounts.disable(people(), id);
    if (!res.ok) { Toast.show({ message: res.error, tone: 'danger', timeout: 7000 }); return; }
    var check = Team.canDeactivate(id, store.getState().workspace.projects);
    if (!check.allowed) { Toast.show({ message: check.reason, tone: 'danger', timeout: 9000 }); return; }
    Dialog.confirm({ title: 'Wyłączyć konto?', message: Team.fullName(person) + ' nie zaloguje się do aplikacji. Wpisy czasu i historia zostają. Konto możesz przywrócić.', confirm: 'Wyłącz konto', tone: 'danger' }).then(function (ok) {
      if (!ok) return;
      commitPeople(res.people, [{ action: 'account.disable', target: id }]);
      Toast.show({ message: 'Wyłączono konto: ' + Team.fullName(person), tone: 'success', timeout: 4000 });
    });
  }

  function enableAccountFor(id) {
    if (!requireMgmt()) return;
    var person = findPerson(id);
    if (!person) return;
    commitPeople(E.Accounts.enable(people(), id), [{ action: 'account.enable', target: id }]);
    Toast.show({ message: 'Przywrócono konto: ' + Team.fullName(person), tone: 'success', timeout: 4000 });
  }

  function setTeamTab(tab) { store.set({ teamTab: tab === 'accounts' ? 'accounts' : (tab === 'people' ? 'people' : 'board') }); }
  function setTeamStatus(value) { store.set({ teamStatus: value || 'all' }); }

  function setPersonActive(id, active) {
    setPeople(function (current) {
      return current.map(function (item) {
        if (item.id !== id) return item;
        var next = Object.assign({}, item, { active: active });
        // Konto idzie za obiegiem: wyłączona osoba nie loguje się, przywrócona wraca do poprzedniego stanu.
        if (item.account) next.account = Object.assign({}, item.account, { status: !active ? 'disabled' : (item.account.lastLoginAt ? 'active' : 'invited') });
        return next;
      });
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
          return stage.id === stageId ? StageAuto.markManual(stage, Model.cycleStageStatus(stage.status)) : stage;
        })
      });
    });
  }

  function confirmStageDone(projectId, stageId) {
    pendingFlash = { projectId: projectId, stageId: stageId };
    mapProject(projectId, function (project) {
      return Object.assign({}, project, { stages: project.stages.map(function (stage) { return stage.id === stageId ? StageAuto.confirmDone(stage) : stage; }) });
    });
  }

  function dismissStageAsk(projectId, stageId) {
    mapProject(projectId, function (project) {
      return Object.assign({}, project, { stages: project.stages.map(function (stage) { return stage.id === stageId ? StageAuto.dismissAsk(stage, Model.describeStage(stage).decision ? caseList().filter(function (c) { return c.projectId === projectId && c.stageId === stageId; }) : null) : stage; }) });
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
    store.set({ taskForm: { projectId: projectId, stageId: stageId, draft: Object.assign({ assignees: [] }, taskFormMeta(projectId, stageId)), errors: {} } });
  }

  function openEditTask(projectId, stageId, taskId) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    store.set({
      taskForm: {
        projectId: projectId, stageId: stageId,
        draft: {
          id: task.id, name: task.name, start: task.start || '', deadline: task.deadline, estimate: task.estimate || '',
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
      if (form.caseId) setCases(function (list) { return Cases.addEvent(list, form.caseId, { kind: 'letter', taskId: created.id, stageId: form.stageId || '', note: created.name, by: currentMe() || '' }, dayNow()); });
      // Pismo przerobione na zadanie przestaje wymagać reakcji: sprawę prowadzi zadanie.
      if (created.mailId) setMail(function (current) { return current.map(function (e) { return e.id === created.mailId ? Object.assign({}, e, { needsAction: false, decision: e.direction === 'in' ? (e.decision && e.decision !== 'reply' ? e.decision : 'reply') : e.decision }) : e; }); });
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
    // Zamknięcie zadania „złożyć / wysłać / zamówić…”: pytamy od razu, a gdy się to pominie, zadanie czeka na liście „Do rozstrzygnięcia”.
    // Pytanie o sprawę tylko w etapach „Decyzje” (postępowania); w pozostałych sprawę dodaje się ręcznie.
    var asked = (function () { var pr = store.getState().workspace.projects.filter(function (x) { return x.id === projectId; })[0]; var st = pr && pr.stages.filter(function (x) { return x.id === stageId; })[0]; return !!st && Model.describeStage(st).decision; })();
    if (next === 'done' && asked && Cases.looksLikeFiling(task.name) && !caseList().some(function (c) { return c.sourceTaskId === taskId && c.projectId === projectId; })) {
      Toast.show({
        message: 'Zamknięto „' + task.name + '”. Czekasz na odpowiedź?', actionLabel: 'Śledź jako sprawę', timeout: 15000,
        onAction: function () { openCaseFromTask(projectId, stageId, taskId); }
      });
    }
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
    store.set({ mailCard: null, mailForm: { mode: 'new', projectId: projectId, draft: draft, errors: {} } });
  }

  function openEditMail(id) {
    var entry = mailList().filter(function (e) { return e.id === id; })[0];
    if (!entry) return;
    var locked = mailList().some(function (e) { return e.replyTo === id; });
    store.set({ mailCard: null, mailForm: { mode: 'edit', projectId: entry.projectId, locked: locked, draft: Object.assign({}, entry), errors: {} } });
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
    var targetProject = values.id ? form.projectId : (findProject(values.projectId) ? findProject(values.projectId).id : form.projectId);
    if (!values.id && values.split && (values.files || []).length > 1) {
      // Każdy plik jako osobne pismo: te same pola, jeden plik w każdym.
      var acc = list;
      var firstErr = null;
      values.files.forEach(function (file) {
        if (firstErr) return;
        var one = Mail.create(acc, targetProject, Object.assign({}, values, { files: [file], split: false }), meta);
        if (!one.valid) firstErr = one.errors; else acc = one.entries.map(function (e) { return e === one.entry ? Mail.withRegistered(e, meta) : e; });
      });
      if (firstErr) { store.set({ mailForm: Object.assign({}, form, { draft: values, errors: firstErr }) }); return; }
      setMail(function () { return acc; });
      store.set({ mailForm: null });
      Toast.show({ message: 'Zarejestrowano ' + values.files.length + ' osobne pisma.', tone: 'success', timeout: 4000 });
      return;
    }
    var result = values.id
      ? Mail.update(list, values.id, values, meta)
      : Mail.create(list, targetProject, values, meta);
    if (result.valid && !values.id) {
      result.entry = Mail.withRegistered(result.entry, meta);
      result.entries = result.entries.map(function (e) { return e.id === result.entry.id ? result.entry : e; });
    }
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

  function mailOwnerOptions(projectId, plain) {
    var project = findProject(projectId);
    if (!project) return [{ value: '', label: 'Lider projektu' }];
    var roster = projectRoster(project).map(function (pid) {
      var person = Team.findPerson(people(), pid);
      return { value: pid, label: person ? Team.fullName(person) : pid };
    });
    var lead = Mail.ownerOf({}, project);
    var leadPerson = lead ? Team.findPerson(people(), lead) : null;
    return plain ? roster : [{ value: '', label: 'Lider projektu' + (leadPerson ? ' (' + Team.fullName(leadPerson) + ')' : '') }].concat(roster);
  }

  /** Decyzja o pismie: „do akt” i „niepotrzebna” od razu, reszta przez krótki formularz. */
  function mailDecide(id, choice) {
    var entry = mailList().filter(function (e) { return e.id === id; })[0];
    if (!entry || entry.direction !== 'in') return;
    var meta = { personId: currentMe() || '', now: new Date() };
    if (choice === 'file' || choice === 'none') {
      var done = Mail.decide(mailList(), id, choice, {}, meta);
      if (done.valid) setMail(function () { return done.entries; });
      store.set({ mailCard: null });
      Toast.show({ message: choice === 'file' ? 'Pismo ' + entry.regNo + ' poszło do akt.' : 'Pismo ' + entry.regNo + ': odpowiedź niepotrzebna.', tone: 'success', timeout: 3500 });
      return;
    }
    var draft = {};
    var suggested = false;
    if (choice === 'reply') draft = { responseDue: entry.responseDue || '', taskDeadline: '' };
    if (choice === 'reassign') draft = { ownerId: Mail.ownerOf(entry, findProject(entry.projectId)) };
    if (choice === 'case') {
      var party = String(entry.counterparty || '').trim().toLowerCase();
      var match = caseList().filter(function (c) { return c.projectId === entry.projectId && c.status === 'open'; })
        .filter(function (c) { return (c.org || '').trim().toLowerCase() === party || (entry.caseRef && (c.name || '').toLowerCase().indexOf(String(entry.caseRef).toLowerCase()) >= 0); })[0];
      if (!caseList().some(function (c) { return c.projectId === entry.projectId && c.status === 'open'; })) {
        Toast.show({ message: 'Projekt nie ma sprawy w toku. Załóż sprawę na liście zadań albo wybierz inną decyzję.', tone: 'info', timeout: 5000 });
        return;
      }
      draft = { caseId: match ? match.id : '' };
      suggested = !!match;
    }
    store.set({ mailCard: null, mailStep: { kind: choice, id: id, draft: draft, errors: {}, suggested: suggested } });
  }

  function submitMailStep(values) {
    var step = store.getState().mailStep;
    if (!step) return;
    var entry = mailList().filter(function (e) { return e.id === step.id; })[0];
    if (!entry) { store.set({ mailStep: null }); return; }
    var meta = { personId: currentMe() || '', now: new Date() };
    var res = Mail.decide(mailList(), step.id, step.kind, values, meta);
    if (!res.valid) { store.set({ mailStep: Object.assign({}, step, { draft: values, errors: res.errors }) }); return; }
    setMail(function () { return res.entries; });
    // Przy odpowiedzi panel zamienia się od razu w formularz zadania (osobne zamknięcie panelu wyczyściłoby nowy formularz).
    if (step.kind !== 'reply') store.set({ mailStep: null });
    if (step.kind === 'reply') {
      Toast.show({ message: 'Zapisano termin odpowiedzi. Uzupełnij zadanie.', tone: 'success', timeout: 3000 });
      mailToTask(step.id, { deadline: values.taskDeadline });
    } else if (step.kind === 'case') {
      setCases(function (list) { return Cases.addEvent(list, values.caseId, { kind: 'letter', note: entry.regNo + ': ' + entry.subject, by: currentMe() || '' }, dayNow()); });
      Toast.show({ message: 'Pismo ' + entry.regNo + ' dołączone do sprawy.', tone: 'success', timeout: 3500 });
    } else {
      Toast.show({ message: 'Pismo ' + entry.regNo + ' przekazane.', tone: 'success', timeout: 3500 });
    }
  }

  /** Rejestracja pisma z dowolnego miejsca: projekt wybiera się w formularzu (domyślnie pierwszy aktywny). */
  function registerMail(files) {
    var open = store.getState().workspace.projects.filter(function (p) { return p.status !== 'done'; });
    if (!open.length) { Toast.show({ message: 'Najpierw załóż projekt, do którego trafi pismo.', tone: 'info', timeout: 4000 }); return; }
    var route = store.getState().route;
    var current = route && route.name === 'project' ? open.filter(function (p) { return String(p.id) === String(route.projectId); })[0] : null;
    openAddMail((current || open[0]).id, 'in', { files: files || [] });
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
  function openMailCard(id) {
    if (mailList().some(function (e) { return e.id === id; })) store.set({ mailCard: { id: id } });
  }

  function mailToTask(id, preset) {
    var entry = mailList().filter(function (e) { return e.id === id; })[0];
    var project = entry && findProject(entry.projectId);
    if (!project) return;
    if (!project.stages.length) { Toast.show({ message: 'Projekt nie ma jeszcze etapów — dodaj etap, w którym zapiszesz pracę nad pismem.', tone: 'info', timeout: 5000 }); return; }
    var stage = project.stages.filter(function (s) { return s.status === 'working'; })[0]
      || project.stages.filter(function (s) { return s.status !== 'done'; })[0] || project.stages[0];
    var allowed = projectRoster(project);
    var ownerId = Mail.ownerOf(entry, project);
    var assignees = ownerId && allowed.indexOf(ownerId) >= 0 ? [ownerId] : [];
    var verb = entry.direction === 'in' ? 'Odpowiedź na pismo ' : 'Pismo ';
    store.set({ mailStep: null, mailCard: null, taskForm: {
      projectId: project.id, stageId: stage.id, fromMail: { id: entry.id, regNo: entry.regNo, subject: entry.subject, counterparty: entry.counterparty },
      draft: {
        name: verb + entry.regNo + ': ' + entry.subject,
        deadline: preset && preset.deadline ? preset.deadline + 'T16:00' : '', important: entry.kind === 'summons',
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

  /** Zapis wpisów czasu. Zamknięty tydzień (zgłoszony lub zatwierdzony) jest chroniony tu, niezależnie od ścieżki, która go zmienia;
      dokończenie zegara uruchomionego przed zamknięciem jest dozwolone. */
  function setEntries(producer) {
    var ws = store.getState().workspace;
    var locks = ws.timeLocks || [];
    var before = ws.entries || [];
    var next = producer(before);
    if (locks.length) {
      var byId = {};
      before.forEach(function (e) { byId[e.id] = e; });
      var nextIds = {};
      var blocked = null;
      next.forEach(function (e) {
        nextIds[e.id] = 1;
        var old = byId[e.id];
        if (old && JSON.stringify(old) === JSON.stringify(e)) return;
        if (old && !old.end) return;
        if (E.WeekLock.isLocked(locks, e.personId, TL.dayKey(e.start))) blocked = e;
      });
      before.forEach(function (e) { if (!nextIds[e.id] && e.end && E.WeekLock.isLocked(locks, e.personId, TL.dayKey(e.start))) blocked = e; });
      if (blocked) {
        Toast.show({ message: 'Ten tydzień jest zamknięty. Poproś o zwrot do poprawy (lider lub zarząd), aby go edytować.', tone: 'danger', timeout: 6000 });
        return false;
      }
    }
    updateWorkspace(function (workspace) {
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, entries: next });
    });
    return true;
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
    if (weekLocked(me, E.Calendar.isoOf(new Date()))) return;
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

  /* Przełączenie zegara na inne zadanie: 5 s na reakcję (cofnięcie), potem stary wpis się domyka, a nowy startuje. */
  var SWITCH_DELAY = 5000;
  var switchTimerId = null;

  function cancelSwitch() {
    if (switchTimerId) { window.clearTimeout(switchTimerId); switchTimerId = null; }
    if (store.getState().pendingSwitch) store.set({ pendingSwitch: null });
  }

  function commitSwitch() {
    var pending = store.getState().pendingSwitch;
    cancelSwitch();
    if (pending) toggleTimer(pending.projectId, pending.stageId, pending.taskId);
  }

  function switchTimer(projectId, stageId, taskId) {
    var run = runningTimer();
    if (!run) { toggleTimer(projectId, stageId, taskId); return; }
    if (isTiming(projectId, stageId, taskId)) return;
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    if (task.status === 'done') {
      Toast.show({ message: 'Zadanie jest zakończone. Cofnij je do „Do wykonania”, żeby dalej zapisywać czas.', tone: 'info', timeout: 5000 });
      return;
    }
    cancelSwitch();
    store.set({ pendingSwitch: { projectId: projectId, stageId: stageId, taskId: taskId, until: Date.now() + SWITCH_DELAY } });
    Toast.show({ message: 'Zegar przejdzie na „' + task.name + '” za ' + Math.round(SWITCH_DELAY / 1000) + ' s.', tone: 'info', timeout: SWITCH_DELAY, actionLabel: 'Cofnij', onAction: cancelSwitch });
    switchTimerId = window.setTimeout(commitSwitch, SWITCH_DELAY);
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

  /** „Zacząłem wcześniej”: cofa start trwającego zegara o podaną liczbę minut (bez nachodzenia na inne wpisy). */
  function shiftTimerStart(minutes) {
    var me = currentMe();
    if (!me) return;
    var result = TL.shiftStart(entries(), me, minutes, new Date());
    if (!result.valid) { Toast.show({ message: result.error || 'Nie udało się cofnąć startu.', tone: 'info', timeout: 4000 }); return; }
    setEntries(function () { return result.entries; });
    Toast.show({ message: 'Start cofnięty o ' + TL.duration(result.shifted) + ' – zegar liczy od ' + E.Timer.hm(result.entry.start) + '.', tone: 'success', timeout: 4000 });
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
          out.push({ value: key, label: project.code + ' · ' + task.name + ' (' + Model.describeStage(stage).name + ')', rank: key in recent ? recent[key] : 1e6, ref: { projectId: project.id, stageId: stage.id, taskId: task.id }, code: project.code, name: task.name, deadline: task.deadline || '', status: task.status });
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
      var editing = entries().filter(function (e) { return e.id === form.entryId; })[0];
      if (editing && weekLocked(editing.personId, TL.dayKey(editing.start))) return;
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
    if (weekLocked(me, values.date)) return;
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

  /** Zablokowany tydzień (zgłoszony lub zatwierdzony): wpisy nie podlegają zmianom. */
  function weekLocked(personId, dayIso) {
    if (!E.WeekLock.isLocked(store.getState().workspace.timeLocks || [], personId, dayIso)) return false;
    Toast.show({ message: 'Ten tydzień jest zamknięty. Poproś o zwrot do poprawy (lider lub zarząd), aby go edytować.', tone: 'danger', timeout: 6000 });
    return true;
  }

  function closeWeek(dayIso, personId) {
    var me = currentMe();
    var who = personId || me;
    if (!who) { requireMe(); return; }
    if (who !== me && !E.Budget.isManagement(me, people())) { Toast.show({ message: 'Tydzień zamyka jego właściciel.', tone: 'danger' }); return; }
    if (TL.running(entries(), who)) { Toast.show({ message: 'Najpierw zatrzymaj zegar, potem zamknij tydzień.', tone: 'danger' }); return; }
    var mgmt = E.Budget.isManagement(who, people());
    var res = E.WeekLock.submit(store.getState().workspace.timeLocks || [], who, dayIso, new Date(), mgmt);
    if (!res.valid) { Toast.show({ message: res.error, tone: 'danger' }); return; }
    updateWorkspace(function (ws) { return Object.assign({}, ws, { timeLocks: res.locks }); });
    Toast.show({ message: mgmt ? 'Tydzień zamknięty i zatwierdzony.' : 'Tydzień zamknięty. Czeka na zatwierdzenie lidera lub zarządu.', tone: 'success', timeout: 4500 });
  }

  function decideWeek(personId, monday, verdict, note) {
    var me = currentMe();
    if (!E.WeekLock.canDecide(me, personId, store.getState().workspace.projects || [], E.Budget.isManagement(me, people()))) { Toast.show({ message: 'Tego tygodnia nie możesz rozpatrzyć.', tone: 'danger' }); return; }
    var res = E.WeekLock.decide(store.getState().workspace.timeLocks || [], personId, monday, verdict, me, note || (verdict === 'return' ? 'Popraw wpisy i zamknij tydzień ponownie.' : ''), new Date());
    if (!res.valid) { Toast.show({ message: res.error, tone: 'danger' }); return; }
    updateWorkspace(function (ws) { return Object.assign({}, ws, { timeLocks: res.locks }); });
    Toast.show({ message: verdict === 'approve' ? 'Tydzień zatwierdzony.' : 'Tydzień zwrócony do poprawy.', tone: 'success', timeout: 3500 });
  }

  function reopenWeek(personId, monday) {
    var me = currentMe();
    var cur = E.WeekLock.find(store.getState().workspace.timeLocks || [], personId, monday);
    var own = me === personId && cur && cur.status === 'submitted';
    if (!own && !E.WeekLock.canDecide(me, personId, store.getState().workspace.projects || [], E.Budget.isManagement(me, people())) && !(me === personId && cur && cur.status === 'returned')) { Toast.show({ message: 'Nie możesz otworzyć tego tygodnia.', tone: 'danger' }); return; }
    var res = E.WeekLock.reopen(store.getState().workspace.timeLocks || [], personId, monday);
    if (!res.valid) { Toast.show({ message: res.error, tone: 'danger' }); return; }
    updateWorkspace(function (ws) { return Object.assign({}, ws, { timeLocks: res.locks }); });
    Toast.show({ message: 'Tydzień otwarty do edycji.', tone: 'success', timeout: 3500 });
  }

  /** Przypomnienie o uzupełnieniu czasu: osoba zobaczy prośbę w swoim Czasie, dopóki tydzień ma luki. */
  function nudgeTime(personIds, monday) {
    var me = currentMe();
    var mgmt = E.Budget.isManagement(me, people());
    var ids = (personIds || []).filter(function (id) { return id !== me && (mgmt || E.WeekLock.canDecide(me, id, store.getState().workspace.projects || [], false)); });
    if (!ids.length) { Toast.show({ message: 'Nie możesz wysłać tego przypomnienia.', tone: 'danger' }); return; }
    updateWorkspace(function (ws) { return Object.assign({}, ws, { timeNudges: E.WeekLock.nudge(ws.timeNudges || [], ids, monday, me, new Date()) }); });
    Toast.show({ message: ids.length === 1 ? 'Przypomnienie wysłane.' : 'Przypomnienia wysłane: ' + ids.length + '.', tone: 'success', timeout: 3500 });
  }

  /** „Powtórz wczoraj”: kopiuje wpisy z poprzedniego dnia z zapisem (do 7 dni wstecz) na pusty dzień. */
  function repeatDay(toKey) {
    var me = currentMe();
    if (!me && !requireMe()) return;
    var now = new Date();
    var list = entries();
    if (weekLocked(me, toKey)) return;
    if (TL.forDay(list, me, now, toKey).length) { Toast.show({ message: 'Ten dzień ma już wpisy.', tone: 'danger' }); return; }
    var src = null;
    var cursor = toKey;
    for (var i = 0; i < 7 && !src; i += 1) {
      cursor = E.Calendar.addDays(cursor, -1);
      var found = TL.forDay(list, me, now, cursor).filter(function (e) { return e.end; });
      if (found.length) src = { key: cursor, list: found };
    }
    if (!src) { Toast.show({ message: 'Nie ma wpisów z ostatnich 7 dni do powtórzenia.', tone: 'info' }); return; }
    var added = 0;
    var current = list;
    src.list.sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); }).forEach(function (e) {
      var same = TL.dayKey(e.start) === TL.dayKey(e.end);
      var res = TL.addManual(current, {
        personId: me, projectId: e.projectId, stageId: e.stageId, taskId: e.taskId, label: e.label || '', date: toKey,
        hours: same ? undefined : TL.hoursOf(TL.minutes(e)), from: same ? TL.clockOf(Date.parse(e.start)) : '', to: same ? TL.clockOf(Date.parse(e.end)) : '', note: e.note || ''
      }, now);
      if (res.valid) { current = res.entries; added += 1; }
    });
    if (!added) { Toast.show({ message: 'Nie udało się powtórzyć wpisów (kolidują albo wypadają w przyszłości).', tone: 'danger' }); return; }
    setEntries(function () { return current; });
    Toast.show({ message: 'Powtórzono ' + added + ' ' + F.count(added, 'wpis', 'wpisy', 'wpisów') + ' z ' + src.key.slice(8, 10) + '.' + src.key.slice(5, 7) + '.', tone: 'success', timeout: 4000 });
  }

  function deleteEntry(entryId) {
    var list = entries();
    var index = list.findIndex(function (e) { return e.id === entryId; });
    if (index < 0) return;
    var removed = list[index];
    if (weekLocked(removed.personId, TL.dayKey(removed.start))) return;
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
    /* Budżet etapu widzi tylko zarząd i lider projektu; pracownik nie dostaje ani znacznika, ani ostrzeżenia. */
    if (!E.Budget.canSeeHours(currentMe(), found.project, people())) return null;
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

  /* Lista punktów przy zadaniu: tylko realizatorzy dopisują i odhaczają; nie zmienia statusu ani godzin. */
  /** Listę prowadzi realizator, zarząd albo lider projektu (ci dwaj mogą wskazywać osoby przy punktach). */
  function canManageList(projectId) {
    var me = currentMe();
    var project = (store.getState().workspace.projects || []).filter(function (p) { return p.id === projectId; })[0];
    return !!me && (E.Budget.isManagement(me, people()) || (!!project && !!project.team && project.team.leader === me));
  }
  function checklistChange(projectId, stageId, taskId, change) {
    var me = currentMe();
    var task = taskOf(projectId, stageId, taskId);
    if (!me || !task || ((task.assignees || []).indexOf(me) < 0 && !canManageList(projectId))) return;
    mapTask(projectId, stageId, taskId, function (t) { return change(t, me); });
  }
  function addChecklistPoint(projectId, stageId, taskId, text, to) {
    checklistChange(projectId, stageId, taskId, function (t, me) { return Tasks.addPoint(t, text, me, new Date().toISOString(), to || ''); });
  }
  function assignChecklistPoint(projectId, stageId, taskId, pointId, to) {
    if (!canManageList(projectId)) return;
    checklistChange(projectId, stageId, taskId, function (t) { return Tasks.assignPoint(t, pointId, to); });
  }
  function toggleChecklistPoint(projectId, stageId, taskId, pointId) {
    checklistChange(projectId, stageId, taskId, function (t, me) { return Tasks.togglePoint(t, pointId, me); });
  }
  function removeChecklistPoint(projectId, stageId, taskId, pointId) {
    checklistChange(projectId, stageId, taskId, function (t) { return Tasks.removePoint(t, pointId); });
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
    ['G S', 'Przejdź do skrzynki'],
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
    // Styl OLED, Filmowy i Papier mają jeden schemat; w Aurorze decyduje Motyw.
    var scheme = E.Prefs.schemeOf(prefs.look) || (prefs.theme === 'system' ? null : prefs.theme);
    if (!scheme) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', scheme);
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
    return !!project && E.Budget.canSeeHours(currentMe(), project, people());
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

  /** Nieobecności osób: zmienia je tylko zarząd. */
  function openAbsence(personId, id) {
    if (!E.Budget.isManagement(currentMe(), people())) { Toast.show({ message: 'Nieobecności wpisuje zarząd.', tone: 'danger' }); return; }
    var found = id ? (store.getState().workspace.absences || []).filter(function (a) { return a.id === id; })[0] : null;
    var day = E.Absences.isoOf(new Date());
    store.set({ absenceForm: { draft: found ? Object.assign({}, found) : { personId: personId || '', from: day, to: day, kind: 'leave', note: '' }, errors: {} } });
  }

  function setAbsences(producer) {
    updateWorkspace(function (workspace) { return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, absences: producer(workspace.absences || []) }); });
  }

  function submitAbsence(values) {
    var form = store.getState().absenceForm;
    if (!form) return;
    var res = E.Absences.save(store.getState().workspace.absences || [], values, people());
    if (!res.valid) { store.set({ absenceForm: Object.assign({}, form, { draft: values, errors: res.errors }) }); return; }
    setAbsences(function () { return res.list; });
    store.set({ absenceForm: null });
    Toast.show({ message: values.id ? 'Zmieniono nieobecność' : 'Dodano nieobecność', tone: 'success', timeout: 3000 });
  }

  /* ---------- Wyjazdy (teren, spotkanie) ---------- */
  function setTrips(producer) {
    updateWorkspace(function (workspace) { return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, trips: producer(workspace.trips || []) }); });
  }

  function openTrip(id, day, dayTo) {
    var me = currentMe();
    if (!me) { Toast.show({ message: 'Wybierz, kim jesteś.', tone: 'danger' }); return; }
    var found = id ? (store.getState().workspace.trips || []).filter(function (t) { return t.id === id; })[0] : null;
    var iso = day || E.Absences.isoOf(new Date());
    store.set({ tripForm: { draft: found ? Object.assign({}, found) : { personIds: [me], kind: 'field', from: iso, to: dayTo && dayTo >= iso ? dayTo : iso, place: '', projectId: null, note: '', notify: false }, errors: {},
      readOnly: !!found && !E.Trips.canEdit(me, found, people(), store.getState().workspace.projects || []) } });
  }

  function submitTrip(values) {
    var form = store.getState().tripForm;
    if (!form) return;
    var me = currentMe();
    var ws = store.getState().workspace;
    var allowed = values.personIds.every(function (id) { return E.Trips.canAddFor(me, id, people(), ws.projects || []); });
    if (!allowed) { store.set({ tripForm: Object.assign({}, form, { draft: values, errors: { personIds: 'Wyjazd innym osobom dodaje Lider ich projektu lub Dyrekcja.' } }) }); return; }
    var res = E.Trips.save(ws.trips || [], values, people(), me, new Date());
    if (!res.valid) { store.set({ tripForm: Object.assign({}, form, { draft: values, errors: res.errors }) }); return; }
    setTrips(function () { return res.list; });
    store.set({ tripForm: null });
    Toast.show({ message: values.id ? 'Zmieniono wyjazd' : 'Dodano wyjazd', tone: 'success', timeout: 3000 });
  }

  function deleteTrip(id) {
    var before = store.getState().workspace.trips || [];
    setTrips(function (list) { return E.Trips.remove(list, id); });
    store.set({ tripForm: null });
    Toast.show({ message: 'Usunięto wyjazd', actionLabel: 'Cofnij', timeout: 6000, onAction: function () { setTrips(function () { return before; }); } });
  }

  /* ---------- Zlecenia wewnętrzne ---------- */
  function setOrders(patch) {
    store.set({ ordersView: Object.assign({}, store.getState().ordersView || {}, patch), orderPanel: null });
  }

  function setOrderPanel(panel) { store.set({ orderPanel: panel }); }

  function setOrdersList(producer) {
    updateWorkspace(function (workspace) { return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, orders: producer(workspace.orders || []) }); });
  }

  function openOrder(projectId, text) {
    var me = currentMe();
    if (!me) { Toast.show({ message: 'Wybierz, kim jesteś.', tone: 'danger' }); return; }
    var sug = E.Orders.suggestAssignee(store.getState().workspace.orders || [], 'sign', me);
    store.set({ orderForm: { draft: { kind: 'sign', text: typeof text === 'string' ? text : '', assigneeId: sug ? sug.personId : '', projectId: projectId == null ? null : projectId, doc: null, dest: '', pay: null, next: null }, errors: {} } });
  }

  function orderSteps(values) {
    function step(s) {
      var out = { kind: s.kind, text: s.text, assigneeId: s.assigneeId, doc: null, dest: '', pay: null };
      return out;
    }
    var first = step(values);
    first.doc = values.doc || null;
    first.dest = values.kind === 'send' ? values.dest : '';
    if (values.kind === 'pay') first.pay = values.pay;
    var steps = [first];
    if (values.next) { var second = step(values.next); second.dest = values.next.kind === 'send' ? values.next.dest : ''; steps.push(second); }
    return steps;
  }

  function submitOrder(values) {
    var form = store.getState().orderForm;
    var me = currentMe();
    if (!form || !me) return;
    var res = E.Orders.create(store.getState().workspace.orders || [], { createdBy: me, projectId: values.projectId, steps: orderSteps(values) }, people(), new Date());
    if (!res.valid) { store.set({ orderForm: Object.assign({}, form, { draft: values, errors: res.errors }) }); return; }
    setOrdersList(function () { return res.list; });
    store.set({ orderForm: null });
    Toast.show({ message: res.ids.length > 1 ? 'Wysłano zlecenia (łańcuch)' : 'Wysłano zlecenie', tone: 'success', timeout: 3000 });
  }

  function completeOrder(id, result, note) {
    var me = currentMe();
    var res = E.Orders.complete(store.getState().workspace.orders || [], id, me, result, note, people(), new Date());
    if (!res.ok) { Toast.show({ message: 'Tego zlecenia nie możesz zamknąć.', tone: 'danger' }); return; }
    setOrdersList(function () { return res.list; });
    store.set({ orderPanel: null });
    Toast.show({ message: res.nextId ? 'Zamknięte — następny krok ruszył' : 'Zamknięte', tone: 'success', timeout: 3000 });
  }

  function passOrder(id, toId) {
    var res = E.Orders.reassign(store.getState().workspace.orders || [], id, currentMe(), toId, people());
    if (!res.ok) return;
    setOrdersList(function () { return res.list; });
    store.set({ orderPanel: null });
    Toast.show({ message: 'Przekazano dalej', tone: 'success', timeout: 3000 });
  }

  function nudgeOrder(id) {
    var res = E.Orders.nudge(store.getState().workspace.orders || [], id, currentMe(), people(), new Date());
    if (!res.ok) return;
    setOrdersList(function () { return res.list; });
    Toast.show({ message: 'Zlecenie wyróżnione u wykonawcy', tone: 'success', timeout: 2500 });
  }

  function cancelOrder(id) {
    var before = store.getState().workspace.orders || [];
    var res = E.Orders.cancel(before, id, currentMe(), people(), new Date());
    if (!res.ok) return;
    setOrdersList(function () { return res.list; });
    Toast.show({ message: 'Anulowano zlecenie', actionLabel: 'Cofnij', timeout: 6000, onAction: function () { setOrdersList(function () { return before; }); } });
  }

  /* ---------- Kalendarz: widok, filtry, eksport, widoczność nieobecności ---------- */
  function setCal(patch) {
    var cal = Object.assign({}, store.getState().prefs.cal || {}, patch);
    setPref({ cal: cal });
  }

  function dashPrefs() { return store.getState().prefs.dash || { tiles: [], collapsed: [] }; }
  function setDash(patch) { setPref({ dash: Object.assign({}, dashPrefs(), patch) }); }
  function toggleDashCard(id) {
    var list = dashPrefs().collapsed || [];
    setDash({ collapsed: list.indexOf(id) >= 0 ? list.filter(function (x) { return x !== id; }) : list.concat([id]) });
  }

  function exportIcs(items, name) {
    var text = E.CalView.toIcs(items, new Date(), name || 'ETROM');
    var url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
    var link = D.el('a', { attrs: { href: url, download: 'etrom-kalendarz-' + new Date().toISOString().slice(0, 10) + '.ics' } });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    Toast.show({ message: 'Pobrano plik .ics (' + items.length + ' wpisów)', tone: 'success', timeout: 4000 });
  }

  /* ---------- Urlopy: wnioski, decyzje, opinie ---------- */
  function setLeave(patch) {
    store.set({ leave: Object.assign({}, store.getState().leave || {}, patch) });
  }

  /** Kalendarz roczny: pierwsze kliknięcie zaczyna zakres, drugie go kończy (kolejne zaczyna od nowa). */
  function pickLeaveDay(key) {
    var sel = (store.getState().leave || {}).sel;
    if (!sel || !sel.from || sel.to) { setLeave({ sel: { from: key, to: '' } }); return; }
    setLeave({ sel: key < sel.from ? { from: key, to: sel.from } : { from: sel.from, to: key } });
  }

  function openLeaveRequest(draft) {
    var me = currentMe();
    if (!me) { Toast.show({ message: 'Wybierz, kim jesteś.', tone: 'danger' }); return; }
    var d = draft || {};
    var day = E.Absences.isoOf(new Date());
    store.set({ leaveForm: { draft: { from: d.from || day, to: d.to || d.from || day, kind: d.kind || 'leave', note: '', onDemand: false }, errors: {} } });
  }

  /** Zgłoszenie L4: bez wniosku i akceptacji, nie zużywa puli urlopu. Zarząd może zgłosić za inną osobę. */
  function openSickReport(personId) {
    var me = currentMe();
    if (!me) { Toast.show({ message: 'Wybierz, kim jesteś.', tone: 'danger' }); return; }
    var day = E.Absences.isoOf(new Date());
    store.set({ leaveForm: { sick: true, draft: { personId: personId || me, from: day, to: day, kind: 'sick', note: '' }, errors: {} } });
  }

  function submitLeaveRequest(values) {
    var form = store.getState().leaveForm;
    var me = currentMe();
    if (!form || !me) return;
    var management = E.Budget.isManagement(me, people());
    if (form.sick && form.editId) {
      var ures = E.Absences.updateSick(store.getState().workspace.absences || [], form.editId, { from: values.from, to: values.to, note: values.note }, people());
      if (!ures.valid) { store.set({ leaveForm: Object.assign({}, form, { draft: Object.assign({}, form.draft, values), errors: ures.errors }) }); return; }
      setAbsences(function () { return ures.list; });
      store.set({ leaveForm: null });
      Toast.show({ message: 'Zapisano zmiany w L4', tone: 'success', timeout: 3000 });
      return;
    }
    if (form.sick) {
      var who = management && values.personId ? values.personId : me;
      var sres = E.Absences.request(store.getState().workspace.absences || [], { personId: who, from: values.from, to: values.to, kind: 'sick', note: values.note }, people(), { by: me, autoApprove: true, now: new Date() });
      if (!sres.valid) { store.set({ leaveForm: Object.assign({}, form, { draft: Object.assign({}, values, { personId: who }), errors: sres.errors }) }); return; }
      setAbsences(function () { return sres.list; });
      store.set({ leaveForm: null, leave: Object.assign({}, store.getState().leave || {}, { sel: null }) });
      Toast.show({ message: who === me ? 'Zgłoszono L4. Życzymy zdrowia.' : 'Zapisano L4 osoby z zespołu', tone: 'success', timeout: 4000 });
      return;
    }
    var res = E.Absences.request(store.getState().workspace.absences || [], Object.assign({}, values, { personId: me }), people(), { by: me, autoApprove: management, override: management, blackouts: (store.getState().workspace.settings || {}).blackouts || [], now: new Date() });
    if (!res.valid) { store.set({ leaveForm: Object.assign({}, form, { draft: values, errors: res.errors }) }); return; }
    setAbsences(function () { return res.list; });
    store.set({ leaveForm: null, leave: Object.assign({}, store.getState().leave || {}, { sel: null, tab: 'mine' }) });
    Toast.show({ message: management ? 'Zapisano urlop' : 'Wniosek złożony, czeka na decyzję zarządu', tone: 'success', timeout: 4000 });
  }

  function decideLeave(id, decision, note) {
    var me = currentMe();
    if (!me || !E.Budget.isManagement(me, people())) { Toast.show({ message: 'Wnioski rozpatruje zarząd.', tone: 'danger' }); return; }
    var found = (store.getState().workspace.absences || []).filter(function (a) { return a.id === id; })[0];
    if (found && found.cancelRequest) {
      setAbsences(function (list) { return E.Absences.decideCancel(list, id, decision, me, note); });
      Toast.show({ message: decision === 'approve' ? 'Urlop anulowany' : 'Urlop zostaje, pracownik dostanie informację', tone: decision === 'approve' ? 'success' : 'default', timeout: 3500 });
      return;
    }
    setAbsences(function (list) { return E.Absences.decide(list, id, decision, me, note, new Date()); });
    Toast.show({ message: decision === 'approve' ? 'Wniosek zaakceptowany. Urlop jest w Planie.' : 'Wniosek odrzucony', tone: decision === 'approve' ? 'success' : 'default', timeout: 3500 });
  }

  /** Anulowanie przyszłego urlopu: zarząd od razu (z cofnięciem), pracownik prośbą do zarządu. */
  function cancelLeave(id, note) {
    var me = currentMe();
    var before = store.getState().workspace.absences || [];
    var found = before.filter(function (a) { return a.id === id; })[0];
    if (!me || !found || found.personId !== me) return;
    var now = new Date();
    if (!E.Absences.cancellable(found, now)) { Toast.show({ message: 'Anulować można tylko urlop, który jeszcze się nie zaczął.', tone: 'danger' }); return; }
    if (E.Budget.isManagement(me, people())) {
      setAbsences(function (list) { return E.Absences.remove(list, id); });
      Toast.show({ message: 'Urlop anulowany', actionLabel: 'Cofnij', timeout: 6000, onAction: function () { setAbsences(function () { return before; }); } });
      return;
    }
    var res = E.Absences.requestCancel(before, id, me, note, now);
    if (!res.valid) { Toast.show({ message: res.error, tone: 'danger' }); return; }
    setAbsences(function () { return res.list; });
    Toast.show({ message: 'Prośba o anulowanie wysłana do zarządu', tone: 'success', timeout: 4000 });
  }

  function withdrawCancelLeave(id) {
    var me = currentMe();
    var found = (store.getState().workspace.absences || []).filter(function (a) { return a.id === id; })[0];
    if (!found || found.personId !== me || !found.cancelRequest) return;
    setAbsences(function (list) { return E.Absences.withdrawCancel(list, id); });
    Toast.show({ message: 'Prośba o anulowanie wycofana', timeout: 3000 });
  }

  /** Właściciel potwierdza powiadomienie o decyzji (znika z Urlopów i licznika w menu). */
  function ackLeave(id) { setAbsences(function (list) { return E.Absences.acknowledge(list, id); }); }

  /** Zmiana własnego L4 (zarząd: dowolnego): skrócenie, przedłużenie, poprawka uwagi. */
  function openSickEdit(id) {
    var me = currentMe();
    var found = (store.getState().workspace.absences || []).filter(function (a) { return a.id === id; })[0];
    if (!me || !found || found.kind !== 'sick') return;
    if (found.personId !== me && !E.Budget.isManagement(me, people())) { Toast.show({ message: 'L4 zmienia osoba, której dotyczy, albo zarząd.', tone: 'danger' }); return; }
    store.set({ leaveForm: { sick: true, editId: id, draft: { personId: found.personId, from: found.from, to: found.to, kind: 'sick', note: found.note || '' }, errors: {} } });
  }

  function deleteSick(id) {
    var me = currentMe();
    var before = store.getState().workspace.absences || [];
    var found = before.filter(function (a) { return a.id === id; })[0];
    if (!me || !found || found.kind !== 'sick' || (found.personId !== me && !E.Budget.isManagement(me, people()))) return;
    setAbsences(function (list) { return E.Absences.remove(list, id); });
    Toast.show({ message: 'Zgłoszenie L4 usunięte', actionLabel: 'Cofnij', timeout: 6000, onAction: function () { setAbsences(function () { return before; }); } });
  }

  function opinionLeave(id, verdict, note) {
    var me = currentMe();
    var found = (store.getState().workspace.absences || []).filter(function (a) { return a.id === id; })[0];
    if (!me || !found || !E.Absences.isLeaderOf(me, found, store.getState().workspace.projects || [])) { Toast.show({ message: 'Opinię dopisuje lider projektu tej osoby.', tone: 'danger' }); return; }
    setAbsences(function (list) { return E.Absences.addOpinion(list, id, me, verdict, note, new Date()); });
    Toast.show({ message: 'Opinia zapisana', tone: 'success', timeout: 2500 });
  }

  function withdrawLeave(id) {
    var me = currentMe();
    var before = store.getState().workspace.absences || [];
    var found = before.filter(function (a) { return a.id === id; })[0];
    if (!found || found.personId !== me || found.status !== 'pending') return;
    setAbsences(function (list) { return E.Absences.remove(list, id); });
    Toast.show({ message: 'Wniosek wycofany', actionLabel: 'Cofnij', timeout: 6000, onAction: function () { setAbsences(function () { return before; }); } });
  }

  function deleteAbsence(id) {
    var before = store.getState().workspace.absences || [];
    setAbsences(function (list) { return E.Absences.remove(list, id); });
    store.set({ absenceForm: null });
    Toast.show({ message: 'Usunięto nieobecność', actionLabel: 'Cofnij', timeout: 6000, onAction: function () { setAbsences(function () { return before; }); } });
  }

  /* =========================================================
     Sprawy w toku: wniosek złożony / materiał zamówiony, licznik dni do zakończenia
     ========================================================= */

  var Cases = E.Cases;
  function caseList() { return store.getState().workspace.cases || []; }
  function setCases(producer) {
    updateWorkspace(function (workspace) { return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, cases: producer(workspace.cases || []) }); });
  }
  function dayNow() { return Cases.isoOf(new Date()); }
  function caseProjectIds() { return store.getState().workspace.projects.map(function (p) { return p.id; }); }

  /** Nazwa sprawy z nazwy zadania: „Złożyć wniosek o decyzję” → „Wniosek o decyzję”. */
  function caseNameFromTask(name) {
    var rest = String(name || '').replace(/^\s*(złożyć|złożenie|wysłać|wysłanie|zamówić|zamówienie|wystąpić o|wystąpić|zgłosić|zgłoszenie)\s+/i, '').trim();
    return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : String(name || '');
  }

  function openCase(preset) {
    var base = { projectId: '', stageId: '', name: '', org: '', startedAt: dayNow(), sourceTaskId: '' };
    store.set({ caseForm: { draft: Object.assign(base, preset || {}), errors: {} } });
  }

  function openCaseFromTask(projectId, stageId, taskId) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    openCase({ projectId: projectId, stageId: stageId, name: caseNameFromTask(task.name), sourceTaskId: taskId, startedAt: Cases.doneDay(task) || dayNow() });
  }

  function submitCase(values) {
    var form = store.getState().caseForm;
    if (!form) return;
    var project = store.getState().workspace.projects.filter(function (p) { return String(p.id) === String(values.projectId); })[0];
    var data = Object.assign({}, values, { projectId: project ? project.id : '', ownerId: currentMe() || '' });
    var res = Cases.create(caseList(), data, caseProjectIds());
    if (!res.valid) { store.set({ caseForm: Object.assign({}, form, { draft: values, errors: res.errors }) }); return; }
    setCases(function () { return res.list; });
    store.set({ caseForm: null });
    Toast.show({ message: 'Sprawa w toku: ' + res.item.name, tone: 'success', timeout: 4000 });
  }

  function caseCall(id, note) {
    var c = caseList().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    setCases(function (list) { return Cases.addEvent(list, id, { kind: 'call', note: note || '', by: currentMe() || '' }, dayNow()); });
    Toast.show({ message: 'Zapisano, że dopytano.', tone: 'success', timeout: 3500 });
  }

  /** Notatka lub informacja w historii sprawy; nie przesuwa przypomnienia. */
  function caseNote(id, note) {
    if (!String(note || '').trim()) return;
    setCases(function (list) { return Cases.addEvent(list, id, { kind: 'note', note: note, by: currentMe() || '' }, dayNow()); });
    Toast.show({ message: 'Dodano notatkę do sprawy', tone: 'success', timeout: 3000 });
  }

  /** Sprawa przypięta do zadania (do znacznika w listach zadań). */
  function caseOfTask(taskId, projectId, stageId) { return Cases.byTask(caseList(), taskId, projectId, stageId); }

  function closeCase(id, note) {
    var before = caseList();
    setCases(function (list) { return Cases.close(list, id, dayNow(), note || ''); });
    Toast.show({ message: 'Sprawa zakończona', actionLabel: 'Cofnij', timeout: 6000, onAction: function () { setCases(function () { return before; }); } });
  }

  function reopenCase(id) { setCases(function (list) { return Cases.reopen(list, id, dayNow()); }); }

  /** Zadanie „złożyć…” nie wymaga śledzenia: zapisujemy decyzję, żeby nie pytać ponownie. */
  function deleteCase(id) {
    var c = caseList().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    setCases(function (list) { return Cases.remove(list, id); });
    Toast.show({ message: 'Usunięto sprawę „' + c.name + '”.', tone: 'success', timeout: 3500 });
  }

  function skipTaskCase(projectId, stageId, taskId) {
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return;
    var res = Cases.create(caseList(), { projectId: projectId, stageId: stageId, name: task.name, startedAt: dayNow(), sourceTaskId: taskId, status: 'skipped', ownerId: currentMe() || '' }, caseProjectIds());
    if (res.valid) setCases(function () { return res.list; });
  }

  /** Pismo od organu (np. wezwanie do uzupełnienia) dodajemy jako zadanie przypięte do sprawy. */
  function openCaseLetter(id) {
    var c = caseList().filter(function (x) { return x.id === id; })[0];
    var project = c && findProject(c.projectId);
    if (!project) return;
    var stage = (c.stageId && stageOf(project.id, c.stageId)) || Progress.activeStage(project) || project.stages[0];
    if (!stage) return;
    openAddTask(project.id, stage.id);
    var form = store.getState().taskForm;
    if (form) store.set({ taskForm: Object.assign({}, form, { caseId: id, draft: Object.assign({}, form.draft, { name: 'Uzupełnić: ' + c.name }) }) });
  }

  /** Kolejność projektów na liście: identyfikatory od najpilniejszego. Tylko zarząd, do cofnięcia. */
  function setProjectOrder(ids) {
    if (!E.Budget.isManagement(currentMe(), people())) { Toast.show({ message: 'Kolejność projektów ustala zarząd.', tone: 'danger' }); return false; }
    var before = store.getState().workspace.projects.map(function (p) { return p.id; });
    var prev = {};
    store.getState().workspace.projects.forEach(function (p) { prev[p.id] = p.priority || 0; });
    setWorkspace(function (list) {
      return list.map(function (p) { var i = ids.indexOf(p.id); return i < 0 ? p : Object.assign({}, p, { priority: i + 1 }); });
    });
    Toast.show({
      message: 'Zmieniono kolejność projektów', actionLabel: 'Cofnij', timeout: 6000,
      onAction: function () { setWorkspace(function (list) { return list.map(function (p) { return before.indexOf(p.id) < 0 ? p : Object.assign({}, p, { priority: prev[p.id] || 0 }); }); }); }
    });
    return true;
  }

  /** Plan tygodni: zmiana okna zadania (start i termin), do cofnięcia. Tylko zarząd i lider projektu. */
  function setTaskSpan(projectId, stageId, taskId, start, deadline, extra) {
    var project = findProject(projectId);
    if (!project || !canPlan(project)) { Toast.show({ message: 'Terminy zadań zmienia zarząd i lider projektu.', tone: 'danger' }); return false; }
    var task = taskOf(projectId, stageId, taskId);
    if (!task) return false;
    withUndo(projectId, (extra && extra.message) || 'Przesunięto zadanie „' + task.name + '”', function (p) {
      return Object.assign({}, p, { stages: p.stages.map(function (st) {
        return st.id !== stageId ? st : Object.assign({}, st, { tasks: st.tasks.map(function (t) {
          if (t.id !== taskId) return t;
          var next = Object.assign({}, t, { start: start || '', deadline: deadline || t.deadline });
          if (extra && extra.fromId && extra.toId) {
            var parts = Object.assign({}, t.parts || {});
            var list = (t.assignees || []).filter(function (id) { return id !== extra.fromId; });
            if (list.indexOf(extra.toId) < 0) { list.push(extra.toId); parts[extra.toId] = parts[extra.fromId] || 'todo'; }
            delete parts[extra.fromId];
            next.assignees = list; next.parts = parts;
          }
          return next;
        }) });
      }) });
    });
    return true;
  }

  /** Przeniesienie zadania na inną osobę (osoba musi należeć do zespołu projektu). */
  function reassignTask(projectId, stageId, taskId, fromId, toId, start, deadline) {
    var project = findProject(projectId);
    var person = Team.findPerson(people(), toId);
    if (!project || !person) return false;
    if (Team.projectPeople(project.team).indexOf(toId) < 0) {
      Toast.show({ message: Team.fullName(person) + ' nie należy do zespołu projektu ' + project.code + '.', tone: 'danger' });
      return false;
    }
    var task = taskOf(projectId, stageId, taskId);
    return setTaskSpan(projectId, stageId, taskId, start === undefined ? (task && task.start) : start, deadline, { fromId: fromId, toId: toId, message: '„' + (task ? task.name : 'Zadanie') + '” przeniesione na ' + Team.fullName(person) });
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

  /** Oznaczenie etapu dla zespołu („budżet na wyczerpaniu” / „przekroczony”): ustawia człowiek, pracownik widzi tylko stan i komunikat. */
  function setBudgetFlag(projectId, stageId, flag) {
    var project = findProject(projectId);
    if (!project || !canPlan(project)) { Toast.show({ message: 'Etap oznacza zarząd lub lider projektu.', tone: 'danger' }); return; }
    var next = flag && (flag.state === 'warn' || flag.state === 'over')
      ? { state: flag.state, note: String(flag.note || '').trim().slice(0, 240), by: currentMe(), at: new Date().toISOString() }
      : null;
    patchStage(projectId, stageId, { budgetFlag: next }, next ? 'Etap oznaczony dla zespołu' : 'Zdjęto oznaczenie etapu');
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
    if (!project || !E.Budget.canSeeHours(currentMe(), project, people())) return;
    var before = project.baseline || null;
    var base = E.Analysis.makeBaseline(project, state.workspace.people || [], new Date(), state.prefs.hourlyCost);
    setWorkspace(function (list) { return list.map(function (p) { return p.id === projectId ? Object.assign({}, p, { baseline: base }) : p; }); });
    Toast.show({
      message: 'Plan bazowy ' + project.code + ' zamrożony: ' + F.hours(base.hours),
      actionLabel: 'Cofnij', timeout: 6000,
      onAction: function () { setWorkspace(function (list) { return list.map(function (p) { return p.id === projectId ? Object.assign({}, p, { baseline: before }) : p; }); }); }
    });
  }

  /** Ochrona OLED: co minutę przesuwa układ o 0–2 px, a po 3 minutach bez ruchu przygasza ekran. */
  var OledGuard = (function () {
    var on = false; var shiftTimer = null; var idleTimer = null; var wired = false; var step = 0;
    var SHIFTS = [[0, 0], [2, 0], [2, 2], [0, 2], [-2, 2], [-2, 0], [-2, -2], [0, -2], [2, -2]];
    var root = document.documentElement;
    function wake() {
      root.removeAttribute('data-idle');
      window.clearTimeout(idleTimer);
      if (on) idleTimer = window.setTimeout(function () { root.setAttribute('data-idle', 'true'); }, 180000);
    }
    function shift() {
      step = (step + 1) % SHIFTS.length;
      root.style.setProperty('--shift-x', SHIFTS[step][0] + 'px');
      root.style.setProperty('--shift-y', SHIFTS[step][1] + 'px');
    }
    function set(next) {
      if (next === on) return;
      on = next;
      if (on) {
        root.setAttribute('data-oled-guard', 'true');
        if (!wired) {
          wired = true;
          ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (name) { window.addEventListener(name, wake, { passive: true }); });
        }
        shiftTimer = window.setInterval(shift, 60000);
        wake();
      } else {
        root.removeAttribute('data-oled-guard');
        root.removeAttribute('data-idle');
        root.style.removeProperty('--shift-x');
        root.style.removeProperty('--shift-y');
        window.clearInterval(shiftTimer);
        window.clearTimeout(idleTimer);
      }
    }
    return { set: set };
  })();

  /** Wygląd: paleta, HDR, intensywność i kontrast jako atrybuty i zmienne CSS (podgląd na żywo bez zapisu). */
  function applyLook(look) {
    var el = document.documentElement;
    var style = look.look || 'etrom';
    if (style === 'aurora') el.removeAttribute('data-look');
    else el.setAttribute('data-look', style);
    // Palety należą do Aurory; inne style mają własną kolorystykę.
    if (style !== 'aurora' || !look.palette || look.palette === 'ocean') el.removeAttribute('data-palette');
    else el.setAttribute('data-palette', look.palette);
    OledGuard.set(style === 'oled' && !!look.oledGuard);
    // Pasek przeglądarki w barwie stylu.
    var tc = { etrom: '#f3f5f6', oled: '#000000', cinema: '#050607', paper: '#e7dfcf' }[style];
    if (!tc) tc = (el.getAttribute('data-theme') === 'dark' || (!el.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) ? '#0c1620' : '#eaf2f7';
    var tcm = document.querySelector('meta[name="theme-color"]');
    if (tcm) tcm.setAttribute('content', tc);
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

  /** Otwiera jeden panel paska (reszta ekranu zwinięta); null zwija wszystkie. */
  function openRail(ids, id) {
    var list = (store.getState().prefs.collapsedRails || []).filter(function (x) { return ids.indexOf(x) < 0; });
    ids.forEach(function (x) { if (x !== id) list.push(x); });
    setPref({ collapsedRails: list });
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

  var DEMO_ACCOUNTS = {
    'Anna Testowa': { email: 'a.testowa@etrom.pl', status: 'active', login: 1 },
    'Michał Testowy': { email: 'm.testowy@etrom.pl', status: 'active', login: 26 },
    'Ewa Testowa': { email: 'e.testowa@etrom.pl', status: 'active', login: 2 },
    'Jan Testowy': { email: 'j.testowy@etrom.pl', status: 'invited' },
    'Olga Testowa': { email: 'o.testowa@biuro-zew.pl', status: 'active', login: 72 },
    'Piotr Testowy': { email: 'p.testowy@etrom.pl', status: null }
  };

  // Indeksy odnoszą się do DEMO_PEOPLE powyżej.
  var DEMO_TEAMS = {
    '2601': { leader: 0, coordinator: 2, proxyLead: 4, members: [3, 5] },
    '2602': { leader: 1, coordinator: 3, proxyLead: 2, proxyExtra: 4, members: [5] },
    '2603': { leader: 0, coordinator: 4, members: [2] },
    '2604': { leader: 1, coordinator: 2, members: [3, 4] },
    '2605': { leader: 0, coordinator: 5, members: [1, 2, 3, 4] },
    '2606': { leader: 1, coordinator: 6, members: [2, 3, 7] },
    '2607': { leader: 0, coordinator: 6, members: [3, 4, 7] },
    '2608': { leader: 1, coordinator: 2, members: [3, 5] },
    '2609': { leader: 0, coordinator: 6, members: [2] },
    '2610': { leader: 1, coordinator: 6, proxyLead: 4, members: [2, 3, 7] },
    '2611': { leader: 0, coordinator: 2, members: [6, 3] },
    '2612': { leader: 0, coordinator: 3, members: [4, 6, 7] }
  };

  // Indeksy etapów odnoszą się do katalogu, indeksy osób do DEMO_PEOPLE.
  var DEMO_TASKS = {
    '2601': [
      { stage: 5, name: 'Zebrać warunki od zarządcy drogi', status: 'working', est: 24, startDays: -6, work: 14, workload: 'medium', hours: 48, people: [0, 2] },
      { stage: 6, name: 'Wystąpić o decyzję lokalizacyjną', status: 'todo', est: 6, startDays: 2, workload: 'small', hours: 120, people: [4] },
      { stage: 0, name: 'Zebrać dane wyjściowe od gminy', status: 'done', workload: 'small', hours: -200, people: [2] },
      { stage: 1, name: 'Koncepcja przebudowy przepustu — wariant A i B', status: 'done', workload: 'large', hours: -120, people: [0, 2] },
      { stage: 2, name: 'Inwentaryzacja przyrodnicza', status: 'review', est: 30, startDays: -10, work: 28, workload: 'medium', hours: 20, people: [3] },
      { stage: 3, name: 'Raport o oddziaływaniu na środowisko', status: 'working', est: 60, startDays: -12, work: 34, workload: 'large', hours: 90, people: [3, 5], important: true, description: 'Wymaga danych z inwentaryzacji przyrodniczej i opinii RDOŚ.' },
      { stage: 4, name: 'Zamówić mapę do celów projektowych', status: 'todo', workload: 'small', hours: -30, people: [5] },
      { stage: 6, name: 'Uzupełnić wniosek o pozwolenie wodnoprawne', status: 'working', est: 64, startDays: -9, workload: 'veryLarge', hours: 96, people: [2, 0], important: true, mail: 'Wezwanie do uzupełnienia wniosku', work: 34, description: 'Zadanie z wezwania RZGW: uzupełnić operat, mapy i obliczenia hydrauliczne.' }
    ],
    '2602': [
      { stage: 9, name: 'Skompletować załączniki do wniosku o pozwolenie', status: 'working', est: 42, startDays: -8, work: 26, workload: 'large', hours: 72, people: [1, 3] },
      { stage: 9, name: 'Uzgodnić kolizję z siecią gazową', status: 'review', workload: 'medium', hours: -36, people: [2] },
      { stage: 11, name: 'Opracować rysunki wykonawcze', status: 'todo', est: 120, startDays: 1, workload: 'veryLarge', hours: 240, people: [3, 4], important: true },
      { stage: 11, name: 'Zestawienie przekrojów odcinka III', status: 'done', workload: 'medium', hours: -50, people: [3] },
      { stage: 7, name: 'Odpowiedzieć na wezwanie w sprawie pozwolenia', status: 'changes', workload: 'medium', hours: 3, people: [2], reason: 'Dopisać analizę wpływu na brzegi.' },
      { stage: 12, name: 'Przedmiar i kosztorys inwestorski', status: 'todo', est: 40, startDays: 3, workload: 'large', hours: 150, people: [5, 3] },
      { stage: 13, name: 'Skompletować egzemplarze do przekazania', status: 'todo', est: 8, startDays: 0, workload: 'small', hours: 60, people: [3] }
    ],
    '2603': [
      { stage: 0, name: 'Ustalić zakres prac z inwestorem', status: 'todo', est: 6, startDays: 0, workload: 'small', hours: 48, people: [0] },
      { stage: 1, name: 'Wstępna koncepcja zbiornika', status: 'todo', est: 80, startDays: 2, workload: 'veryLarge', hours: 300, people: [2], important: true }
    ],
    '2604': [
      {
        stage: 3, name: 'Przygotować kartę informacyjną przedsięwzięcia',
        status: 'changes', workload: 'medium', hours: -12, people: [1],
        reason: 'Uzupełnić opis oddziaływania na wody powierzchniowe.'
      },
      { stage: 3, name: 'Analiza wariantów pompowni', status: 'working', est: 24, startDays: -3, work: 6, workload: 'medium', hours: 30, people: [2, 4] },
      { stage: 2, name: 'Pomiary hałasu i wibracji', status: 'todo', est: 16, startDays: 4, workload: 'small', hours: 240, people: [4] },
      { stage: 3, name: 'Uzupełnić kartę informacyjną wg opinii RDOŚ', status: 'done', workload: 'large', hours: 120, people: [1, 2], mail: 'Opinia do karty informacyjnej', work: 18, description: 'Uwagi RDOŚ do oddziaływania na wody powierzchniowe i siedliska.' }
    ],
    '2605': [
      { stage: 13, name: 'Przekazanie dokumentacji zamawiającemu', status: 'done', workload: 'small', hours: -900, people: [1] }
    ],
    '2606': [
      { stage: 0, name: 'Przygotować program prac', status: 'done', workload: 'small', hours: -400, people: [6] },
      { stage: 4, name: 'Pomiary batymetryczne zbiornika', status: 'done', workload: 'medium', hours: -250, people: [7] },
      { stage: 6, name: 'Operat wodnoprawny', status: 'working', est: 44, startDays: -5, work: 18, workload: 'large', hours: 70, people: [6, 2], important: true },
      { stage: 5, name: 'Wniosek o decyzję lokalizacyjną', status: 'review', est: 12, startDays: -7, work: 11, workload: 'medium', hours: 10, people: [3] },
      { stage: 9, name: 'Projekt zagospodarowania osadów', status: 'todo', est: 56, startDays: 4, workload: 'large', hours: 200, people: [2] },
      { stage: 6, name: 'Uzupełnić dane hydrologiczne', status: 'changes', est: 10, startDays: -9, work: 8, workload: 'small', hours: -4, people: [6], reason: 'Brakuje przepływów z ostatnich 10 lat.' },
      { stage: 9, name: 'Uzupełnić dane o osadach (wezwanie gminy)', status: 'todo', est: 12, startDays: 0, workload: 'medium', hours: 60, people: [2, 6], mail: 'Wezwanie do uzupełnienia danych o osadach' }
    ],
    '2607': [
      { stage: 0, name: 'Zebrać wytyczne od zarządcy drogi', status: 'done', workload: 'small', hours: -150, people: [3] },
      { stage: 1, name: 'Wstępny przekrój przepustu', status: 'working', est: 16, startDays: -4, work: 8, workload: 'medium', hours: 24, people: [3, 6] },
      { stage: 4, name: 'Pomiary geodezyjne dojazdu', status: 'working', est: 14, startDays: -2, work: 4, workload: 'small', hours: 36, people: [7] },
      { stage: 6, name: 'Obliczenia hydrauliczne', status: 'todo', est: 30, startDays: 3, workload: 'medium', hours: 96, people: [6] },
      { stage: 7, name: 'Złożyć wniosek o pozwolenie wodnoprawne', status: 'todo', est: 6, workload: 'small', hours: 400, people: [4] }
    ],
    '2608': [
      { stage: 12, name: 'Kosztorys inwestorski jazu', status: 'done', workload: 'medium', hours: -2300, people: [5] },
      { stage: 13, name: 'Przekazanie dokumentacji inwestorowi', status: 'done', workload: 'small', hours: -1950, people: [1] }
    ],
    '2609': [
      { stage: 0, name: 'Ustalić zakres z Wodami Polskimi', status: 'todo', est: 6, workload: 'small', hours: 1100, people: [0] }
    ],
    '2610': [
      { stage: 1, name: 'Koncepcja lokalizacji polderu', status: 'done', workload: 'large', hours: -1500, people: [1, 3] },
      { stage: 4, name: 'Pomiary geodezyjne obwałowania', status: 'done', workload: 'medium', hours: -700, people: [7] },
      { stage: 5, name: 'Wniosek o decyzję lokalizacyjną polderu', status: 'working', est: 30, startDays: -12, work: 0, workload: 'large', hours: 40, people: [1, 2] },
      { stage: 6, name: 'Operat wodnoprawny polderu', status: 'working', est: 70, startDays: -8, workload: 'veryLarge', hours: 160, people: [2, 6], important: true },
      { stage: 6, name: 'Obliczenia przepływów miarodajnych', status: 'review', est: 24, startDays: -6, work: 20, workload: 'medium', hours: 14, people: [6] },
      { stage: 9, name: 'Projekt budowlany obwałowania', status: 'todo', est: 90, startDays: 10, workload: 'veryLarge', hours: 400, people: [2, 3] }
    ],
    '2611': [
      { stage: 11, name: 'Ekspertyza stanu technicznego zapory', status: 'done', workload: 'large', hours: -420, people: [6, 3] },
      { stage: 13, name: 'Przekazanie ekspertyzy zamawiającemu', status: 'done', workload: 'small', hours: -150, people: [0] }
    ],
    '2612': [
      { stage: 0, name: 'Inwentaryzacja zniszczeń po powodzi', status: 'done', workload: 'medium', hours: -620, people: [3, 7] },
      { stage: 1, name: 'Koncepcja odbudowy wałów', status: 'working', est: 40, startDays: -10, work: 22, workload: 'large', hours: 70, people: [6, 4] },
      { stage: 4, name: 'Pomiary geodezyjne korony wału', status: 'working', est: 18, startDays: -4, workload: 'medium', hours: 40, people: [7] },
      { stage: 5, name: 'Wniosek o decyzję lokalizacyjną — Nowa Wieś', status: 'todo', est: 10, startDays: 6, workload: 'small', hours: 200, people: [4] }
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

  // start: dzień założenia projektu względem dziś; step: ile dni mija na jeden etap (z nich liczymy terminy etapów i oś czasu pracy).
  var DEMO = [
    { code: '2601', name: 'Przebudowa przepustu w Lipnicy', client: 'Gmina Lipnica', status: 'active', priority: 2, deadline: demoDate(21), done: 7, working: 2, start: -150, step: 20 },
    { code: '2602', name: 'Regulacja rzeki Białka — odcinek III', client: 'Wody Polskie RZGW', status: 'active', priority: 1, deadline: demoDate(-6), done: 11, working: 1, start: -190, step: 16 },
    { code: '2603', name: 'Zbiornik retencyjny Dąbrowa', client: 'Starostwo Powiatowe', status: 'planned', deadline: demoDate(330), done: 0, working: 0, start: 25, step: 20, age: 3 },
    { code: '2604', name: 'Modernizacja stacji pomp Rudnik', client: 'Spółka Wodna Rudnik', status: 'paused', deadline: demoDate(60), done: 5, working: 0, start: -170, step: 30 },
    { code: '2605', name: 'Dokumentacja wałów w Zarzeczu', client: 'Urząd Miasta', status: 'done', deadline: demoDate(-40), done: 16, working: 0, start: -300, step: 16 },
    { code: '2606', name: 'Odmulenie zbiornika Wąwolnica', client: 'Gmina Wąwolnica', status: 'active', priority: 3, deadline: demoDate(75), done: 6, working: 2, scale: 1.25, start: -70, step: 11 },
    { code: '2607', name: 'Przepust drogowy Klonów — pozwolenie wodnoprawne', client: 'Zarząd Dróg Powiatowych', status: 'active', priority: 4, deadline: demoDate(150), done: 3, working: 1, scale: 0.7, start: -20, step: 7 },
    { code: '2608', name: 'Przebudowa jazu w Kamionce', client: 'Gmina Kamionka', status: 'done', deadline: demoDate(-80), done: 16, working: 0, start: -260, step: 11 },
    { code: '2609', name: 'Kanał ulgi Dobra — koncepcja', client: 'Wody Polskie RZGW', status: 'planned', deadline: demoDate(300), done: 0, working: 0, start: 45, step: 18, age: 2 },
    { code: '2610', name: 'Polder przeciwpowodziowy Siedlce Zalew', client: 'Wody Polskie RZGW', status: 'active', priority: 5, deadline: demoDate(95), done: 5, working: 2, start: -105, step: 19, scale: 1.1 },
    { code: '2611', name: 'Ekspertyza stanu technicznego zapory Rożnów', client: 'Zarząd Zlewni', status: 'done', deadline: demoDate(-5), done: 16, working: 0, start: -200, step: 12, scale: 0.8 },
    { code: '2612', name: 'Odbudowa wałów po powodzi — Nowa Wieś', client: 'Gmina Nowa Wieś', status: 'active', deadline: demoDate(170), done: 2, working: 1, start: -35, step: 15, scale: 0.9 }
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
      var next = rate && !person.hourlyCost ? Object.assign({}, person, { hourlyCost: rate }) : person;
      var acct = DEMO_ACCOUNTS[Team.fullName(next)];
      if (acct && !next.email) {
        var logged = acct.login == null ? '' : new Date(Date.now() - acct.login * 3600000).toISOString();
        next = Object.assign({}, next, { email: acct.email, account: acct.status ? { status: acct.status, mustChange: acct.status === 'invited', createdAt: new Date(Date.now() - 86400000 * 30).toISOString(), createdBy: '', lastLoginAt: logged, passwordSetAt: '' } : null });
      }
      return next;
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
        for (var x = 0; x <= 960; x += 40) g.lineTo(x, layer[1] + Math.sin((x + variant * 90 + i * 1.4) / 120) * layer[2] * 0.5);
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
          name: spec.name, deadline: demoTaskDeadline(spec.hours), workload: spec.workload, estimate: spec.est || E.Plan.DEFAULT_HOURS[spec.workload] || 12, start: spec.startDays != null ? demoDate(spec.startDays) : '', description: spec.description || '',
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
          if (spec.hours < -600) hoursAgo = -spec.hours + (path.length - 1 - stepIndex) * 24;
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

    // Nowe wczytanie zastępuje stare dane przykładowe (po kodzie i nazwie projektu), a dane użytkownika zostają.
    var demoNotes = ['Wyjazd rodzinny', 'Urlop', 'Szkolenie z hydrauliki', 'Urlop letni', 'Szkolenie BHP', 'Zwolnienie lekarskie', 'Urlop wypoczynkowy', 'Urlop na żądanie', 'Termin złożenia projektu', 'Dwa dni wolne', 'Urlop listopadowy', 'Konferencja branżowa', 'Urlop świąteczny', 'Szkolenie z programu do obliczeń', 'Urlop zimowy', 'Opieka nad dzieckiem', 'Urlop wiosenny'];
    updateWorkspace(function (workspace) {
      var drop = {};
      workspace.projects.forEach(function (project) {
        if (DEMO.some(function (r) { return r.code === project.code && r.name === project.name; })) drop[project.id] = true;
      });
      var demoIds = DEMO_PEOPLE.map(function (row, i) { return demoPersonId(i); });
      // Komplet nowych danych jest już w programie: nic nie czyścimy (ponowne wczytanie niczego nie dubluje).
      var complete = DEMO.every(function (r) { return workspace.projects.some(function (p) { return p.code === r.code && p.name === r.name; }); });
      if (!Object.keys(drop).length || complete) return workspace;
      return Object.assign({}, workspace, {
        version: Model.WORKSPACE_VERSION,
        projects: workspace.projects.filter(function (p) { return !drop[p.id]; }),
        entries: (workspace.entries || []).filter(function (e) { return !drop[e.projectId] && String(e.id).indexOf('e-demo-') !== 0; }),
        mail: (workspace.mail || []).filter(function (m) { return !drop[m.projectId]; }),
        cases: (workspace.cases || []).filter(function (c) { return !drop[c.projectId]; }),
        orders: (workspace.orders || []).filter(function (o) { return !drop[o.projectId]; }),
        absences: (workspace.absences || []).filter(function (a) { return !(demoIds.indexOf(a.personId) >= 0 && demoNotes.indexOf(a.note) >= 0); })
      });
    });

    var added = 0;
    var freshCodes = {};
    setWorkspace(function (projects) {
      var result = projects.slice();
      DEMO.forEach(function (row) {
        if (result.some(function (p) { return p.code.toUpperCase() === row.code; })) return;
        var stages = demoCatalog().map(function (entry, index) {
          var stage = Model.createStage(entry.id, { deadline: demoDate(row.start + (index + 1) * row.step), hours: row.scale ? Math.round(entry.defaultHours * row.scale) : undefined });
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
        created.createdAt = new Date(Date.now() - (row.age != null ? row.age : Math.max(1, -row.start)) * 86400000).toISOString();
        if (row.priority) created.priority = row.priority;
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
    var F1 = function (name, kb) { return { name: name, size: kb * 1024, location: 'e-Doręczenia' }; };
    // Każdy wiersz to jedno pismo. decision: file | reply | none; answer: odpowiedź wysłana przez nas; ownerId: indeks osoby.
    var demoMail = {
      '2601': [
        { direction: 'in', kind: 'ruling', counterparty: 'Starostwo Powiatowe', number: 'OS.6220.4.2026', subject: 'Postanowienie o przeprowadzeniu oceny oddziaływania na środowisko', registeredDate: iso(-110), decision: 'file', files: [F1('postanowienie-OS-6220.pdf', 310)] },
        { direction: 'in', kind: 'inquiry', counterparty: 'Gmina Lipnica', subject: 'Zapytanie o termin przekazania koncepcji', registeredDate: iso(-95), decision: 'reply', responseDue: iso(-80), answer: { off: -84, subject: 'Odp.: Zapytanie o termin przekazania koncepcji', kind: 'reply' } },
        { direction: 'in', kind: 'summons', counterparty: 'RZGW Kraków', number: 'KR.ZZ.2.4210.12.2026', subject: 'Wezwanie do uzupełnienia wniosku o pozwolenie wodnoprawne', registeredDate: iso(-9), needsAction: true, responseDue: iso(12), files: [F1('wezwanie-KR-ZZ-2-4210-12.pdf', 482), F1('zalacznik-1-wykaz-brakow.pdf', 96), F1('zalacznik-2-mapa.pdf', 1840)] },
        { direction: 'in', kind: 'opinion', counterparty: 'Starostwo Powiatowe', subject: 'Opinia w sprawie lokalizacji przepustu', registeredDate: iso(-20), needsAction: true, files: [F1('opinia-lokalizacja-przepustu.pdf', 220)] },
        { direction: 'out', kind: 'application', counterparty: 'Gmina Lipnica', subject: 'Wniosek o udostępnienie map do celów projektowych', registeredDate: iso(-14) },
        { direction: 'in', kind: 'notice', counterparty: 'RZGW Kraków', number: 'KR.ZZ.2.4210.30.2026', subject: 'Pismo RZGW w sprawie uzgodnienia przebiegu', registeredDate: iso(-17), decision: 'file', caseLink: 'Uzgodnienie przebiegu z Wodami Polskimi' }
      ],
      '2602': [
        { direction: 'in', kind: 'contract', counterparty: 'Wody Polskie RZGW', number: 'UM/2026/041', subject: 'Umowa na dokumentację odcinka III', registeredDate: iso(-188), decision: 'file', files: [F1('umowa-UM-2026-041.pdf', 840)] },
        { direction: 'in', kind: 'notice', counterparty: 'Wody Polskie RZGW', subject: 'Zawiadomienie o terminie wizji lokalnej', registeredDate: iso(-150), decision: 'file' },
        { direction: 'in', kind: 'decision', counterparty: 'Wody Polskie RZGW', number: 'DO.ZUZ.1.421.8.2026', subject: 'Decyzja o warunkach zabudowy odcinka III', registeredDate: iso(-30), decision: 'file', files: [F1('decyzja-DO-ZUZ-1-421-8.pdf', 560)] },
        { direction: 'in', kind: 'inquiry', counterparty: 'Wody Polskie RZGW', subject: 'Zapytanie o harmonogram robót', registeredDate: iso(-3), needsAction: true },
        { direction: 'out', kind: 'application', counterparty: 'Starostwo Powiatowe', subject: 'Wniosek o pozwolenie wodnoprawne — odcinek III', registeredDate: iso(-12) }
      ],
      '2604': [
        { direction: 'in', kind: 'opinion', counterparty: 'Regionalna Dyrekcja Ochrony Środowiska', subject: 'Opinia do karty informacyjnej przedsięwzięcia', registeredDate: iso(-6), decision: 'reply', responseDue: iso(-1), files: [F1('opinia-RDOS.pdf', 410)] },
        { direction: 'out', kind: 'inquiry', counterparty: 'Spółka Wodna Rudnik', subject: 'Prośba o dane eksploatacyjne pomp', registeredDate: iso(-15) },
        { direction: 'in', kind: 'notice', counterparty: 'Spółka Wodna Rudnik', subject: 'Informacja o wstrzymaniu prac do czasu decyzji zarządu', registeredDate: iso(-48), decision: 'file' }
      ],
      '2605': [
        { direction: 'in', kind: 'summons', counterparty: 'Urząd Miasta', subject: 'Wezwanie do uzupełnienia dokumentacji wałów', registeredDate: iso(-120), decision: 'reply', responseDue: iso(-100), answer: { off: -104, subject: 'Odp.: Wezwanie do uzupełnienia dokumentacji wałów', kind: 'reply' } },
        { direction: 'in', kind: 'decision', counterparty: 'Urząd Miasta', number: 'GK.6740.4.2026', subject: 'Decyzja zatwierdzająca dokumentację', registeredDate: iso(-45), decision: 'file' }
      ],
      '2606': [
        { direction: 'out', kind: 'application', counterparty: 'Wody Polskie RZGW', subject: 'Wniosek o uzgodnienie operatu wodnoprawnego', registeredDate: iso(-4) },
        { direction: 'in', kind: 'summons', counterparty: 'Gmina Wąwolnica', subject: 'Wezwanie do uzupełnienia danych o osadach', registeredDate: iso(-2), decision: 'reply', responseDue: iso(2), files: [F1('wezwanie-osady.pdf', 190)] },
        { direction: 'in', kind: 'decision', counterparty: 'RDOŚ Kraków', number: 'OO.4210.12', subject: 'Decyzja o środowiskowych uwarunkowaniach (projekt)', registeredDate: iso(-33), decision: 'file', caseLink: 'Decyzja środowiskowa' }
      ],
      '2607': [
        { direction: 'in', kind: 'inquiry', counterparty: 'Zarząd Dróg Powiatowych', subject: 'Zapytanie o przepustowość istniejącego przepustu', registeredDate: iso(-5), needsAction: true, ownerId: 3 }
      ],
      '2608': [
        { direction: 'in', kind: 'decision', counterparty: 'Wody Polskie RZGW', number: 'KR.ZZŚ.3.421.5.2025', subject: 'Pozwolenie wodnoprawne na przebudowę jazu', registeredDate: iso(-130), decision: 'file', files: [F1('pozwolenie-wodnoprawne-jaz.pdf', 1250)] },
        { direction: 'out', kind: 'application', counterparty: 'Gmina Kamionka', subject: 'Przekazanie dokumentacji wykonawczej jazu', registeredDate: iso(-84) }
      ],
      '2610': [
        { direction: 'in', kind: 'notice', counterparty: 'Wody Polskie RZGW', subject: 'Zawiadomienie o rozpoczęciu postępowania lokalizacyjnego', registeredDate: iso(-40), decision: 'file', files: [F1('zawiadomienie-lokalizacja.pdf', 260)] },
        { direction: 'in', kind: 'summons', counterparty: 'RDOŚ Rzeszów', number: 'WOOŚ.4220.18.2026', subject: 'Wezwanie do uzupełnienia karty informacyjnej polderu', registeredDate: iso(-7), decision: 'reply', responseDue: iso(9), files: [F1('wezwanie-karta-polder.pdf', 330), F1('zalacznik-mapa-zalewu.pdf', 2100)] },
        { direction: 'in', kind: 'inquiry', counterparty: 'Starostwo Powiatowe', subject: 'Zapytanie o przebieg obwałowania', registeredDate: iso(-1), needsAction: true },
        { direction: 'out', kind: 'application', counterparty: 'RDOŚ Rzeszów', subject: 'Wniosek o wydanie decyzji środowiskowej', registeredDate: iso(-55) }
      ],
      '2611': [
        { direction: 'in', kind: 'contract', counterparty: 'Zarząd Zlewni', number: 'ZZ/2026/012', subject: 'Zlecenie ekspertyzy stanu technicznego zapory', registeredDate: iso(-198), decision: 'file' },
        { direction: 'out', kind: 'reply', counterparty: 'Zarząd Zlewni', subject: 'Przekazanie ekspertyzy', registeredDate: iso(-6) }
      ],
      '2612': [
        { direction: 'in', kind: 'notice', counterparty: 'Wojewoda', subject: 'Zawiadomienie o dofinansowaniu odbudowy po powodzi', registeredDate: iso(-30), decision: 'file', files: [F1('zawiadomienie-dofinansowanie.pdf', 180)] },
        { direction: 'in', kind: 'summons', counterparty: 'Gmina Nowa Wieś', subject: 'Wezwanie do przedstawienia harmonogramu odbudowy', registeredDate: iso(-1), needsAction: true, ownerId: 3, files: [F1('wezwanie-harmonogram.pdf', 140)] }
      ]
    };
    updateWorkspace(function (workspace) {
      var list = (workspace.mail || []).slice();
      workspace.projects.forEach(function (project) {
        var rows = demoMail[project.code];
        if (!rows || list.some(function (e) { return e.projectId === project.id; })) return;
        rows.forEach(function (row) {
          var input = Object.assign({}, row, { ownerId: row.ownerId != null ? demoPersonId(row.ownerId) : '' });
          delete input.caseLink; delete input.answer; delete input.decision;
          var res = Mail.create(list, project.id, input, { now: new Date() });
          if (!res.valid) return;
          list = res.entries;
          var made = list[list.length - 1];
          var when = new Date(row.registeredDate + 'T09:00:00');
          made.createdAt = row.registeredDate + 'T09:00:00.000Z';
          made.history = [{ at: row.registeredDate, by: '', text: 'Zarejestrowano' }];
          if (row.decision) {
            var dec = Mail.decide(list, made.id, row.decision, { responseDue: row.responseDue }, { now: when });
            if (dec.valid) { list = dec.entries; made = dec.entry; }
          }
          if (row.answer) {
            var ans = Mail.create(list, project.id, { direction: 'out', kind: row.answer.kind || 'reply', counterparty: row.counterparty, subject: row.answer.subject, registeredDate: iso(row.answer.off), replyTo: made.id }, { now: new Date() });
            if (ans.valid) list = ans.entries;
          }
        });
      });
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, mail: list });
    });
    // Przykładowe nieobecności (względem dziś), żeby plan pokazywał mniejszą pojemność tygodni.
    updateWorkspace(function (workspace) {
      var rows = [
        { who: 2, from: 3, to: 4, kind: 'leave', note: 'Wyjazd rodzinny' },
        { who: 3, from: 9, to: 15, kind: 'leave', note: 'Urlop' },
        // Archiwalne nieobecności: widać je w planie po cofnięciu okna i w kalendarzu.
        { who: 2, from: -75, to: -66, kind: 'leave', note: 'Urlop letni' },
        { who: 6, from: -52, to: -48, kind: 'leave', note: 'Urlop' },
        { who: 3, from: -22, to: -19, kind: 'sick', note: 'Zwolnienie lekarskie' },
        { who: 7, from: -118, to: -108, kind: 'leave', note: 'Urlop wypoczynkowy' },
        { who: 1, from: -95, to: -91, kind: 'leave', note: 'Urlop' },
        { who: 1, from: 3, to: 5, kind: 'leave', note: 'Wyjazd rodzinny', state: 'pending' },
        { who: 1, from: 45, to: 49, kind: 'leave', note: 'Urlop listopadowy' },
        { who: 1, from: -120, to: -120, kind: 'leave', note: 'Urlop na żądanie', onDemand: true },
        { who: 1, from: -60, to: -59, kind: 'leave', note: 'Termin złożenia projektu', state: 'rejected', reason: 'termin złożenia projektu 2601' },
        { who: 2, from: 17, to: 21, kind: 'leave', note: 'Urlop', state: 'pending' },
        { who: 3, from: 28, to: 29, kind: 'leave', note: 'Dwa dni wolne', state: 'pending' },
        // Pół roku wstecz i pół roku w przód: urlopy, szkolenia i zwolnienia, żeby Plan i Kalendarz miały pełny obraz.
        { who: 0, from: -170, to: -166, kind: 'leave', note: 'Urlop wiosenny' },
        { who: 5, from: -100, to: -90, kind: 'leave', note: 'Urlop wypoczynkowy' },
        { who: 6, from: -85, to: -80, kind: 'leave', note: 'Urlop letni' },
        { who: 7, from: -40, to: -39, kind: 'sick', note: 'Zwolnienie lekarskie' },
        { who: 4, from: 33, to: 37, kind: 'leave', note: 'Urlop listopadowy' },
        { who: 6, from: 60, to: 64, kind: 'leave', note: 'Urlop świąteczny' },
        { who: 2, from: 75, to: 86, kind: 'leave', note: 'Urlop zimowy' },
        { who: 5, from: 120, to: 126, kind: 'leave', note: 'Urlop wypoczynkowy' },
        { who: 0, from: 150, to: 154, kind: 'leave', note: 'Urlop wiosenny' },
        { who: 7, from: 25, to: 26, kind: 'leave', note: 'Opieka nad dzieckiem', state: 'pending' }
      ];
      var list = (workspace.absences || []).slice();
      rows.forEach(function (r) {
        var who = demoPersonId(r.who);
        if (!who) return;
        if (list.some(function (a) { return a.personId === who && a.note === r.note && a.from === iso(r.from); })) return;
        var res = E.Absences.save(list, { personId: who, from: iso(r.from), to: iso(r.to), kind: r.kind, note: r.note }, workspace.people || []);
        if (res.valid) list = res.list;
        if (res.valid && r.state) {
          // Wnioski urlopowe w różnych stanach: oczekujące, odrzucone, na żądanie.
          var boss = (workspace.people || []).filter(function (p) { return p.orgRole === 'managing'; })[0];
          var rec = list[list.length - 1];
          rec.requestedBy = who;
          rec.requestedAt = new Date(Date.now() - 2 * 86400000).toISOString();
          if (r.state === 'pending') rec.status = 'pending';
          if (r.state === 'rejected') { rec.status = 'rejected'; rec.decidedBy = boss ? boss.id : ''; rec.decidedAt = new Date(Date.now() - 20 * 86400000).toISOString(); rec.decisionNote = r.reason || ''; }
          if (r.onDemand) rec.onDemand = true;
        } else if (res.valid && r.onDemand) list[list.length - 1].onDemand = true;
      });
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, absences: list });
    });
    // Szkolenia i konferencje to wyjazdy (rodzaj „Szkolenie” albo „Inne”), nie nieobecności.
    updateWorkspace(function (workspace) {
      var rows = [
        { who: 5, from: 6, to: 6, kind: 'training', place: 'Warszawa, szkolenie z hydrauliki' },
        { who: 4, from: -31, to: -31, kind: 'training', place: 'Szkolenie BHP' },
        { who: 4, from: -140, to: -138, kind: 'training', place: 'Szkolenie z programu do obliczeń' },
        { who: 0, from: -12, to: -10, kind: 'other', place: 'Konferencja branżowa' },
        { who: 3, from: 100, to: 102, kind: 'training', place: 'Szkolenie z programu do obliczeń' }
      ];
      var list = (workspace.trips || []).slice();
      rows.forEach(function (r) {
        var who = demoPersonId(r.who);
        if (!who || list.some(function (t) { return t.personIds.indexOf(who) >= 0 && t.place === r.place && t.from === iso(r.from); })) return;
        var res = E.Trips.save(list, { personIds: [who], kind: r.kind, from: iso(r.from), to: iso(r.to), place: r.place }, workspace.people || [], who, new Date());
        if (res.valid) list = res.list;
      });
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, trips: list });
    });
    // Zlecenia do wykonania (Skrzynka i ekran Zleceń): jedno zaległe, dwa świeże.
    updateWorkspace(function (workspace) {
      if ((workspace.orders || []).length) return workspace;
      var byCode = function (code) { return workspace.projects.filter(function (pr) { return pr.code === code; })[0]; };
      var rows = [
        { by: 0, to: 1, code: '2602', kind: 'sign', text: 'Podpisać aneks do umowy na odcinek III', ago: 4 },
        { by: 1, to: 2, code: '2606', kind: 'send', text: 'Wysłać wniosek o uzgodnienie operatu wodnoprawnego', ago: 1 },
        { by: 2, to: 0, code: '2607', kind: 'pay', text: 'Opłacić opłatę skarbową za pozwolenie wodnoprawne', ago: 2 }
      ];
      var list = workspace.orders || [];
      rows.forEach(function (r) {
        var project = byCode(r.code);
        var res = E.Orders.create(list, { createdBy: demoPersonId(r.by), projectId: project ? project.id : null, steps: [{ kind: r.kind, text: r.text, assigneeId: demoPersonId(r.to) }] }, workspace.people || [], new Date(Date.now() - r.ago * 86400000));
        if (res.valid) list = res.list;
      });
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, orders: list });
    });
    // Sprawy w toku (wniosek złożony, materiał zamówiony): licznik dni od złożenia.
    updateWorkspace(function (workspace) {
      if ((workspace.cases || []).length) return workspace;
      var byCode = function (code) { return workspace.projects.filter(function (p) { return p.code === code; })[0]; };
      // Różne osoby i sytuacje: świeża, po dopytaniu, dopytana dawno temu, z wezwaniem do uzupełnienia, długa, bez osoby.
      var specs = [
        { code: '2606', who: 1, name: 'Decyzja środowiskowa', org: 'RDOŚ Kraków · OO.4210.12', at: -8, calls: [0] },
        { code: '2603', who: 2, name: 'Wypis z rejestru gruntów', org: 'Starostwo · zamówiono', at: -2, calls: [] },
        { code: '2601', who: 1, name: 'Uzgodnienie z zarządcą drogi', org: 'ZDW', at: -23, calls: [-12] },
        { code: '2601', who: 4, name: 'Uzgodnienie przebiegu z Wodami Polskimi', org: 'RZGW Kraków', at: -19, calls: [-12, -5] },
        { code: '2607', who: 4, name: 'Opinia konserwatora zabytków', org: 'WUOZ · znak ZN.5130.7', at: -5, calls: [] },
        { code: '2607', who: 4, name: 'Wniosek o pozwolenie wodnoprawne', org: 'Wody Polskie · KR.ZZŚ.2.421', at: -41, calls: [-27, -13], letters: [-20] },
        { code: '2602', who: 1, name: 'Warunki techniczne od gestora sieci', org: 'Tauron Dystrybucja', at: -15, calls: [] },
        { code: '2601', who: 2, name: 'Mapa do celów projektowych', org: 'Powiatowy Ośrodek Dokumentacji', at: -9, calls: [], letters: [-3] },
        { code: '2602', who: 7, name: 'Zamówienie mapy sytuacyjno-wysokościowej', org: 'Geodeta powiatowy', at: -4, calls: [-1] },
        { code: '2606', who: 6, name: 'Dane hydrologiczne', org: 'IMGW-PIB · wniosek', at: -30, calls: [] },
        { code: '2602', who: 3, name: 'Akceptacja wariantu koncepcji przez klienta', org: 'Wody Polskie RZGW', at: -6, calls: [] },
        { code: '2601', who: -1, name: 'Zgoda właściciela działki 112/4', org: 'osoba prywatna', at: -3, calls: [] },
        { code: '2610', who: 1, name: 'Decyzja środowiskowa polderu', org: 'RDOŚ Rzeszów · WOOŚ.4220.18', at: -38, calls: [-20, -9], letters: [-7] },
        { code: '2610', who: 6, name: 'Dane hydrologiczne dla polderu', org: 'IMGW-PIB · wniosek', at: -14, calls: [-6] },
        { code: '2612', who: 4, name: 'Zgoda zarządcy wałów', org: 'Zarząd Zlewni', at: -11, calls: [] },
        { code: '2612', who: 3, name: 'Wypis z rejestru gruntów', org: 'Starostwo · zamówiono', at: -26, calls: [-14] },
        { code: '2603', who: 0, name: 'Warunki techniczne od gestora sieci', org: 'PGE Dystrybucja', at: -1, calls: [] },
        // Zakończone sprawy z ostatniego półrocza (historia).
        { code: '2602', who: 1, name: 'Decyzja o warunkach zabudowy', org: 'Wody Polskie RZGW', at: -75, calls: [-60, -45], closed: -31, note: 'Decyzja DO.ZUZ.1.421.8.2026 odebrana' },
        { code: '2605', who: 4, name: 'Zatwierdzenie dokumentacji', org: 'Urząd Miasta', at: -130, calls: [-100], closed: -45, note: 'Decyzja GK.6740.4.2026' },
        { code: '2608', who: 1, name: 'Pozwolenie wodnoprawne na jaz', org: 'Wody Polskie RZGW', at: -230, calls: [-200, -170], closed: -130, note: 'Pozwolenie odebrane' },
        { code: '2604', who: 2, name: 'Opinia RDOŚ do karty informacyjnej', org: 'RDOŚ Kraków', at: -60, calls: [-40], closed: -6, note: 'Opinia otrzymana' },
        { code: '2606', who: 6, name: 'Pomiary batymetryczne', org: 'Geodeta · zlecenie', at: -62, calls: [], closed: -40, note: 'Dane odebrane' }
      ];
      var list = [];
      specs.forEach(function (sp) {
        var project = byCode(sp.code);
        var who = sp.who >= 0 ? demoPersonId(sp.who) : '';
        if (!project || (sp.who >= 0 && !who)) return;
        var res = E.Cases.create(list, { projectId: project.id, name: sp.name, org: sp.org, ownerId: who, startedAt: demoDate(sp.at) }, workspace.projects.map(function (p) { return p.id; }));
        if (!res.valid) return;
        list = res.list;
        var events = (sp.calls || []).map(function (off) { return { off: off, kind: 'call', note: 'Rozmowa telefoniczna' }; })
          .concat((sp.letters || []).map(function (off) { return { off: off, kind: 'letter', note: 'Wezwanie do uzupełnienia wniosku' }; }))
          .sort(function (x, y) { return x.off - y.off; });
        events.forEach(function (ev) { list = E.Cases.addEvent(list, res.item.id, { kind: ev.kind, note: ev.note, by: who }, demoDate(ev.off)); });
        if (sp.closed != null) list = E.Cases.close(list, res.item.id, demoDate(sp.closed), sp.note || '');
      });
      return Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, cases: list });
    });
    // Pisma dołączone do spraw (decyzja „W sprawie”): łączymy po temacie pisma i nazwie sprawy.
    updateWorkspace(function (workspace) {
      var mailList2 = (workspace.mail || []).slice();
      var changed = false;
      Object.keys(demoMail).forEach(function (code) {
        var project = workspace.projects.filter(function (pr) { return pr.code === code; })[0];
        if (!project) return;
        demoMail[code].filter(function (row) { return row.caseLink; }).forEach(function (row) {
          var c = (workspace.cases || []).filter(function (x) { return x.projectId === project.id && x.name === row.caseLink; })[0];
          var idx = -1;
          mailList2.forEach(function (m, i) { if (m.projectId === project.id && m.subject === row.subject) idx = i; });
          if (!c || idx < 0) return;
          var res = Mail.decide(mailList2, mailList2[idx].id, 'case', { caseId: c.id }, { now: new Date(row.registeredDate + 'T10:00:00') });
          if (res.valid) { mailList2 = res.entries; changed = true; }
        });
      });
      return changed ? Object.assign({}, workspace, { version: Model.WORKSPACE_VERSION, mail: mailList2 }) : workspace;
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
    var demoValues = { '2601': 180000, '2602': 420000, '2603': 260000, '2604': 310000, '2605': 150000, '2606': 240000, '2607': 95000, '2608': 210000, '2609': 140000, '2610': 380000, '2611': 85000, '2612': 270000 };
    var demoFactor = { '2601': 0.88, '2602': 1.38, '2603': 0.55, '2604': 1.04, '2605': 1.02, '2606': 0.84, '2607': 1.1, '2608': 0.97, '2609': 0.6, '2610': 1.12, '2611': 0.92, '2612': 1.05 };
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
      var busy = {};
      var taskLogged = {};
      // Oś czasu pracy: etap po etapie od dnia założenia projektu do dziś (do ~roku wstecz), deterministycznie.
      projectsOut.forEach(function (project) {
        var factor = demoFactor[project.code];
        if (factor === undefined) return;
        var row = DEMO.filter(function (r) { return r.code === project.code; })[0];
        var team = Team.projectPeople(project.team);
        if (!row || !team.length || row.status === 'planned') return;
        var seed = Number(project.code) % 97 + 13;
        var rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        var base = new Date(); base.setHours(0, 0, 0, 0);
        project.stages.forEach(function (stage, i) {
          if (stage.status !== 'done' && stage.status !== 'working') return;
          var from = row.start + i * row.step;
          var to = stage.status === 'done' ? row.start + (i + 1) * row.step : -1;
          if (to > -1) to = -1;
          var days = [];
          for (var off = Math.max(from, -330); off <= to; off += 1) {
            var day = new Date(base.getTime()); day.setDate(day.getDate() + off);
            if (day.getDay() !== 0 && day.getDay() !== 6) days.push(day);
          }
          if (!days.length) return;
          var hours = Math.round((Number(stage.hours) || 0) * (stage.status === "done" ? factor : 0.55 * factor) * 1.4);
          var avg = hours / days.length;
          var tasks = stage.tasks || [];
          days.forEach(function (day) {
            if (rnd() < 0.14) return;
            var left = avg * (0.4 + rnd() * 1.3);
            while (left >= 1) {
              var who = team[Math.floor(rnd() * team.length)];
              var chunk = Math.min(left, Math.round((2 + rnd() * 4) * 4) / 4);
              var key = who + '|' + day.getTime();
              var used = busy[key] || 0;
              left -= chunk;
              if (used + chunk > 8.25) continue;
              busy[key] = used + chunk;
              var start = new Date(day.getTime() + (8 + used) * 3600000);
              var task = tasks.length && rnd() < 0.4 ? tasks[Math.floor(rnd() * tasks.length)] : null;
              // Czas przypinamy do zadania tylko do jego oszacowania, żeby plan nie pokazywał przekroczeń, których nie ma w scenariuszu.
              if (task) {
                var logKey = project.id + '|' + task.id;
                if (task.status === 'todo' || (taskLogged[logKey] || 0) + chunk > (Number(task.estimate) || 0) * 0.8) task = null;
                else taskLogged[logKey] = (taskLogged[logKey] || 0) + chunk;
              }
              counter += 1;
              entriesOut.push({
                id: 'e-demo-' + counter, personId: who, projectId: project.id, stageId: stage.id, taskId: task ? task.id : '',
                label: task ? task.name : Model.describeStage(stage).name, start: start.toISOString(), end: new Date(start.getTime() + chunk * 3600000).toISOString(),
                note: notes[counter % notes.length], source: 'manual', updatedAt: start.toISOString()
              });
            }
          });
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
      // Na żywo: kilka osób ma uruchomiony licznik na swoim zadaniu, część pracowała już rano nad czym innym.
      var nowH = nowDate.getHours() + nowDate.getMinutes() / 60;
      if (nowH >= 8.5) {
        var liveRows = [{ who: 1, code: '2602', ago: 2.6 }, { who: 2, code: '2601', ago: 1.4 }, { who: 3, code: '2606', ago: 3.2 }, { who: 5, code: '2606', ago: 0.8 }, { who: 6, code: '2607', ago: 1.9 }];
        var liveIds = liveRows.map(function (r) { return demoPersonId(r.who); });
        var todayKey = E.TimeLog.dayKey(nowDate.getTime());
        entriesOut = entriesOut.filter(function (e) { return !(liveIds.indexOf(e.personId) >= 0 && E.TimeLog.dayKey(Date.parse(e.start)) === todayKey); });
        liveRows.forEach(function (r, i) {
          var who = liveIds[i];
          var project = projectsOut.filter(function (p) { return p.code === r.code; })[0];
          if (!who || !project) return;
          var found = [];
          (project.stages || []).forEach(function (st) { (st.tasks || []).forEach(function (t) { if (t.status !== 'done' && (t.assignees || []).indexOf(who) >= 0) found.push({ stage: st, task: t }); }); });
          if (!found.length) return;
          var main = found[0], other = found[found.length > 1 ? 1 : 0];
          var begin = new Date(nowDate.getTime() - r.ago * 3600000);
          if (begin.getHours() < 6) return;
          counter += 1;
          entriesOut.push({ id: 'e-demo-live-' + counter, personId: who, projectId: project.id, stageId: main.stage.id, taskId: main.task.id, label: main.task.name, start: begin.toISOString(), end: null, note: '', source: 'timer', updatedAt: begin.toISOString() });
          var mEnd = new Date(begin.getTime() - 25 * 60000), mStart = new Date(mEnd.getTime() - (1.5 + i * 0.25) * 3600000);
          if (mStart.getHours() >= 6) {
            counter += 1;
            entriesOut.push({ id: 'e-demo-live-' + counter, personId: who, projectId: project.id, stageId: other.stage.id, taskId: other.task.id, label: other.task.name, start: mStart.toISOString(), end: mEnd.toISOString(), note: '', source: 'manual', updatedAt: mStart.toISOString() });
          }
        });
      }
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
    var options = { mode: state.timeMode, offset: state.timeOffset, target: state.prefs.dayTarget, absences: state.workspace.absences || [], trips: state.workspace.trips || [] };
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

  /** Ewidencja czasu pracy za miesiąc (wariant 1: rzeczywisty czas, wariant 2: ewidencja 8:00–16:00) jako wydruk/PDF albo CSV. */
  function exportLeaveCard(format, scope) {
    var state = store.getState();
    var now = new Date();
    var meId = state.prefs.me;
    var mgmt = E.Budget.isManagement(meId, people());
    var year = Number((state.leave || {}).year) || now.getFullYear();
    if ((state.leave || {}).view === 'month') year = new Date(now.getFullYear(), now.getMonth() + (Number((state.leave || {}).monthOffset) || 0), 1).getFullYear();
    var list = state.workspace.absences || [];
    var teamScope = scope === 'team';
    if (teamScope && !mgmt) { Toast.show({ message: 'Zestawienie całego zespołu udostępnia zarząd.', tone: 'danger' }); return; }
    var person = Team.findPerson(people(), meId);
    if (!teamScope && !person) { Toast.show({ message: 'Wybierz, kim jesteś.', tone: 'danger' }); return; }
    var meta = { generatedAt: now.getDate() + '.' + (now.getMonth() + 1) + '.' + now.getFullYear() + ' ' + TL.clockOf(now.getTime()), autoPrint: format === 'print' };
    var card = teamScope ? null : E.LeaveCard.build(list, person, year, now);
    var cards = teamScope ? E.LeaveCard.team(list, people(), year, now) : null;
    var base = (teamScope ? 'zestawienie-urlopow-' : 'karta-urlopowa-') + year;
    if (format === 'csv') {
      var rows = teamScope ? E.LeaveCard.teamCsvRows(cards, year) : E.LeaveCard.csvRows(card, meta);
      var csvUrl = URL.createObjectURL(new Blob([E.Timesheet.csv(rows)], { type: 'text/csv;charset=utf-8' }));
      var link = D.el('a', { attrs: { href: csvUrl, download: base + '.csv' } });
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(csvUrl);
      Toast.show({ message: 'Pobrano ' + base + '.csv', tone: 'success', timeout: 4000 });
      return;
    }
    var url = URL.createObjectURL(new Blob([teamScope ? E.LeaveCard.teamHtml(cards, year, meta) : E.LeaveCard.html(card, meta)], { type: 'text/html;charset=utf-8' }));
    var win = window.open(url, '_blank');
    if (!win) {
      var dl = D.el('a', { attrs: { href: url, download: base + '.html' } });
      document.body.appendChild(dl); dl.click(); document.body.removeChild(dl);
      Toast.show({ message: 'Przeglądarka zablokowała okno wydruku – pobrano plik ' + base + '.html. Otwórz go i wybierz „Drukuj → Zapisz jako PDF”.', tone: 'info', timeout: 8000 });
    } else Toast.show({ message: 'Otwieram okno wydruku. Wybierz „Zapisz jako PDF”, aby dostać plik.', tone: 'info', timeout: 5000 });
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function saveLeaveSettings(patch) {
    if (!E.Budget.isManagement(store.getState().prefs.me, people())) { Toast.show({ message: 'Zasady urlopów ustawia zarząd.', tone: 'danger' }); return; }
    updateWorkspace(function (ws) { return Object.assign({}, ws, { settings: E.Absences.normalizeSettings(Object.assign({}, ws.settings, patch)) }); });
  }

  function exportRecord(variant, format, personId) {
    var state = store.getState();
    var now = new Date();
    if (variant !== 2 && !E.Budget.isManagement(state.prefs.me, people())) { Toast.show({ message: 'Zestawienie rzeczywistego czasu udostępnia zarząd.', tone: 'danger' }); return; }
    var pid = personId || state.prefs.me;
    var person = Team.findPerson(people(), pid);
    var period = E.Timesheet.period(now, state.timeMode === 'month' ? 'month' : 'week', state.timeMode === 'month' ? state.timeOffset : 0);
    var ref = state.timeMode === 'month' ? period.from : (state.timeMode === 'week' ? E.Timesheet.period(now, 'week', state.timeOffset).from : now);
    var projectOf = function (id) { var p = findProject(id); return { code: p ? p.code : String(id), name: p ? p.name : '' }; };
    var record = E.WorkRecord.build(state.workspace.entries || [], pid, now, { year: ref.getFullYear(), month: ref.getMonth(), absences: state.workspace.absences || [], trips: state.workspace.trips || [], target: state.prefs.dayTarget, project: projectOf });
    var meta = { personName: person ? Team.fullName(person) : '', generatedAt: now.getDate() + '.' + (now.getMonth() + 1) + '.' + now.getFullYear() + ' ' + TL.clockOf(now.getTime()), autoPrint: format === 'print' };
    var run = function () {
      var doc = variant === 2 ? E.WorkRecord.normative(record) : record;
      var base = (variant === 2 ? 'ewidencja-czasu-pracy-' : 'zestawienie-czasu-pracy-') + record.from.slice(0, 7);
      if (format === 'csv') {
        var csvUrl = URL.createObjectURL(new Blob([E.Timesheet.csv(E.WorkRecord.csvRows(doc, variant, meta))], { type: 'text/csv;charset=utf-8' }));
        var link = D.el('a', { attrs: { href: csvUrl, download: base + '.csv' } });
        document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(csvUrl);
        Toast.show({ message: 'Pobrano ' + base + '.csv', tone: 'success', timeout: 4000 });
        return;
      }
      var url = URL.createObjectURL(new Blob([E.WorkRecord.html(doc, variant, Object.assign({}, meta, { confirmedBy: currentMe() ? Team.fullName(Team.findPerson(people(), currentMe())) : '' }))], { type: 'text/html;charset=utf-8' }));
      var win = window.open(url, '_blank');
      if (!win) {
        var dl = D.el('a', { attrs: { href: url, download: base + '.html' } });
        document.body.appendChild(dl); dl.click(); document.body.removeChild(dl);
        Toast.show({ message: 'Przeglądarka zablokowała okno wydruku – pobrano plik ' + base + '.html. Otwórz go i wybierz „Drukuj → Zapisz jako PDF”.', tone: 'info', timeout: 8000 });
      } else Toast.show({ message: 'Otwieram okno wydruku. Wybierz „Zapisz jako PDF”, aby dostać plik.', tone: 'info', timeout: 5000 });
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    };
    if (variant !== 2) { run(); return; }
    var diffs = E.WorkRecord.differences(record);
    var list = diffs.slice(0, 8).map(function (d) { return D.el('li', { text: d.label + ' ' + d.number + '.: zapisano ' + TL.duration(d.actual) + ' (' + (d.diff < 0 ? 'brakuje ' : 'nadwyżka ') + TL.duration(Math.abs(d.diff)) + ')' }); });
    Dialog.confirm({
      title: 'Ewidencja czasu pracy – ' + record.title,
      message: 'W tym wariancie każdy dzień z pracą ma ' + TL.duration(record.target) + ' od 8:00. Dokument ma odpowiadać faktycznie przepracowanemu czasowi.',
      details: diffs.length ? [D.el('b', { text: diffs.length + (diffs.length === 1 ? ' dzień różni się' : ' dni różni się') + ' od zapisów czasu:' }), D.el('ul', null, list.concat(diffs.length > 8 ? [D.el('li', { text: '… i ' + (diffs.length - 8) + ' więcej' })] : []))] : [D.el('span', { text: 'Zapisy zgadzają się z normą we wszystkich dniach z pracą.' })],
      check: 'Potwierdzam, że godziny w ewidencji odpowiadają faktycznie przepracowanemu czasowi.',
      confirm: format === 'csv' ? 'Pobierz CSV' : 'Otwórz do wydruku'
    }).then(function (ok) { if (ok) run(); });
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
      { label: 'Nowa sprawa w toku', icon: 'plus', keywords: 'sprawa wniosek złożony zamówiony czekam na odpowiedź urząd', run: function () { openCase({}); } },
      { label: 'Nowa osoba', icon: 'person', keywords: 'zespół pracownik dodaj', run: function () { goTo('team'); openNewPerson(); } },
      { label: 'Przejdź do projektów', icon: 'folder', meta: now(state.route.name === 'projects'), keywords: 'ekran lista portfel', run: function () { goTo('projects'); } },
      { label: 'Przejdź do karty czasu', icon: 'clock', meta: now(state.route.name === 'time'), keywords: 'czas godziny tydzień miesiąc eksport csv plan obciążenia', run: function () { goTo('time'); } },
      { label: 'Przejdź do analizy', icon: 'chart', meta: now(state.route.name === 'analysis'), keywords: 'opłacalność budżet godziny prognoza marża zużycie', run: function () { goTo('analysis'); } },
      { label: 'Przejdź do ustawień', icon: 'sparkle', keywords: 'wygląd styl motyw oled papier budżet kopia', run: function () { goTo('settings'); } },
      { label: 'Przejdź do aktualności', icon: 'sparkle', meta: now(state.route.name === 'feed'), keywords: 'strumień wpisy reakcje komentarze media', run: function () { goTo('feed'); } },
      { label: 'Przejdź do zleceń', icon: 'checklist', meta: now(state.route.name === 'orders'), keywords: 'zlecenia do podpisu wysłania opłacenia prośba', run: function () { goTo('orders'); } },
      { label: 'Nowe zlecenie', icon: 'plus', keywords: 'zlecenie podpis wysyłka opłata poproś', run: function () { openOrder(); } },
      { label: 'Zarejestruj pismo', icon: 'upload', keywords: 'pismo korespondencja wpływ e-doręczenia wgraj plik', run: function () { registerMail(); } },
      { label: 'Przejdź do pulpitu', icon: 'grid', meta: now(state.route.name === 'dashboard'), keywords: 'start pulpit strona główna', run: function () { goTo('dashboard'); } },
      { label: 'Przejdź do skrzynki', icon: 'mail', meta: now(state.route.name === 'inbox'), keywords: 'skrzynka czeka na mnie zatwierdzenia zlecenia wnioski urlopowe pisma reakcje decyzje', run: function () { goTo('inbox'); } },
      { label: 'Przejdź do mojej pracy', icon: 'checklist', meta: now(state.route.name === 'mywork'), keywords: 'moje zadania dziś termin tydzień po terminie', run: function () { goTo('mywork'); } },
      { label: 'Przejdź do zespołu', icon: 'people', meta: now(state.route.name === 'team'), keywords: 'ekran osoby katalog', run: function () { goTo('team'); } },
      { label: 'Widok: portfel na osi czasu', icon: 'chart', meta: now(prefs.view === 'portfolio'), keywords: 'oś czasu hydrogram numery', run: function () { goTo('projects'); setView('portfolio'); } },
      { label: 'Widok: tabela', icon: 'list', meta: now(prefs.view === 'list'), keywords: 'lista wiersze', run: function () { goTo('projects'); setView('list'); } },
      { label: 'Widok: karty', icon: 'grid', meta: now(prefs.view === 'cards'), keywords: 'kafelki', run: function () { goTo('projects'); setView('cards'); } },
      { label: 'Motyw jasny', icon: 'sun', meta: now(prefs.theme === 'light'), run: function () { setPref({ theme: 'light' }); } },
      { label: 'Motyw ciemny', icon: 'moon', meta: now(prefs.theme === 'dark'), run: function () { setPref({ theme: 'dark' }); } },
      { label: 'Motyw jak w systemie', icon: 'monitor', meta: now(prefs.theme === 'system'), run: function () { setPref({ theme: 'system' }); } },
    ].concat([['standard', 'wg stylu domyślny nurt', 'water'], ['etrom', 'różowy etrom logo magenta', 'sparkle'], ['graphite', 'grafit', 'datum'], ['morski', 'morski turkus', 'water'], ['lesny', 'leśny zieleń', 'water'], ['granat', 'granat indygo', 'water'], ['lupek', 'łupek szary', 'datum'], ['fiolet', 'fiolet purpurowy', 'water'], ['bursztyn', 'bursztyn żółty', 'water'], ['terakota', 'terakota ceglasty', 'water'], ['oliwka', 'oliwka zieleń', 'water'], ['blekit', 'błękit niebieski', 'water']].map(function (a) {
      return { label: 'Kolor pracy w toku: ' + a[1].split(' ')[0], icon: a[2], meta: now(prefs.accent === a[0]), keywords: 'akcent barwy kolor ' + a[1], run: function () { setPref({ accent: a[0] }); } };
    })).concat([
      { label: 'Skróty klawiszowe', icon: 'keyboard', meta: '?', keywords: 'pomoc klawiatura', run: showShortcuts },
      { label: (prefs.sidebarCollapsed ? 'Rozwiń' : 'Zwiń') + ' panel boczny', icon: 'sidebar', meta: '[', keywords: 'nawigacja menu', run: toggleSidebar },
      { label: 'Dodaj dane przykładowe', icon: 'sparkle', keywords: 'demo testowe przykład', run: loadDemo },
      { label: 'Pobierz kopię zapasową', icon: 'download', keywords: 'eksport json backup zapis', run: exportJson },
      { label: 'Wczytaj kopię zapasową', icon: 'upload', keywords: 'import json przywróć', run: function () { nodes.fileInput.click(); } },
      { label: 'Usuń wszystkie dane', icon: 'trash', keywords: 'wyczyść skasuj', run: clearAll }
    ]);
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
    confirmStageDone: confirmStageDone,
    dismissStageAsk: dismissStageAsk,
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
    openRail: openRail,
    setTime: function (patch) { store.set(patch); },
    toggleTimeProject: function (id) {
      var open = Object.assign({}, store.getState().timeOpen || {});
      if (open[id]) delete open[id]; else open[id] = true;
      store.set({ timeOpen: open });
    },
    exportTime: exportTime,
    exportRecord: exportRecord,
    exportLeaveCard: exportLeaveCard,
    nudgeTime: nudgeTime, closeWeek: closeWeek, decideWeek: decideWeek, reopenWeek: reopenWeek,
    repeatDay: repeatDay,
    saveLeaveSettings: saveLeaveSettings,
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
    setInbox: function (patch) { store.set({ inbox: Object.assign({}, store.getState().inbox || {}, patch) }); },
    snoozeInbox: snoozeInbox,
    unsnoozeInbox: unsnoozeInbox,
    lastTimedTask: lastTimedTask,
    shiftTimerStart: shiftTimerStart,
    taskMinutes: function (taskId) { return TL.sum(entries().filter(function (e) { return e.taskId === taskId; }), new Date()); },
    stopTimer: stopTimer,
    switchTimer: switchTimer,
    setBudgetFlag: setBudgetFlag,
    openCase: openCase,
    caseNote: caseNote,
    caseOfTask: caseOfTask,
    openCaseFromTask: openCaseFromTask,
    submitCase: submitCase,
    caseCall: caseCall,
    closeCase: closeCase,
    reopenCase: reopenCase,
    skipTaskCase: skipTaskCase,
    openCaseLetter: openCaseLetter,
    commitSwitch: commitSwitch,
    cancelSwitch: cancelSwitch,
    openTasks: function () { var me = currentMe(); return me ? taskChoices(me) : []; },
    isTiming: isTiming,
    logTime: function (projectId, stageId, taskId) { openTimeForm({ mode: 'manual', projectId: projectId, stageId: stageId, taskId: taskId }); },
    editEntry: function (id) { openTimeForm({ mode: 'edit', entryId: id }); },
    addTimeEntry: function (spec) { openTimeForm(Object.assign({ mode: 'manual', needsTask: true }, spec || {})); },
    logTimeRange: function (fromMs, toMs) {
      openTimeForm({ mode: 'manual', needsTask: true, date: TL.dayKey(fromMs), from: TL.clockOf(fromMs), to: TL.clockOf(toMs) });
    },
    deleteEntry: deleteEntry,
    addMail: openAddMail,
    editMail: openEditMail,
    replyMail: replyToMail,
    deleteMail: deleteMail,
    toggleMailAction: toggleMailAction,
    setTaskSpan: setTaskSpan, reassignTask: reassignTask, setProjectOrder: setProjectOrder, openAbsence: openAbsence, openTrip: openTrip, setOrders: setOrders, setOrderPanel: setOrderPanel, openOrder: openOrder, completeOrder: completeOrder, passOrder: passOrder, nudgeOrder: nudgeOrder, cancelOrder: cancelOrder, setCal: setCal, dashPrefs: dashPrefs, setDash: setDash, toggleDashCard: toggleDashCard, exportIcs: exportIcs, setLeave: setLeave, pickLeaveDay: pickLeaveDay, openLeaveRequest: openLeaveRequest, openSickReport: openSickReport, decideLeave: decideLeave, opinionLeave: opinionLeave, withdrawLeave: withdrawLeave, cancelLeave: cancelLeave, withdrawCancelLeave: withdrawCancelLeave, ackLeave: ackLeave, openSickEdit: openSickEdit, deleteSick: deleteSick,
    libAddTask: libAddTask, libRenameTask: libRenameTask, libRemoveTask: libRemoveTask, libResetTasks: libResetTasks,
    mailTask: function (id) { mailToTask(id); },
    mailDecide: mailDecide,
    openMailCard: openMailCard,
    registerMail: registerMail,
    setMailView: function (patch) { store.update(function (state) { return Object.assign({}, state, { mailView: Object.assign({}, state.mailView, patch) }); }); },
    cyclePart: cycleTaskPart,
    meId: currentMe,
    deleteCase: deleteCase,
    canManageList: canManageList, assignPoint: assignChecklistPoint, addPoint: addChecklistPoint, togglePoint: toggleChecklistPoint, removePoint: removeChecklistPoint,
    setTaskFilter: function (value) { store.set({ taskFilter: value }); },
    setKanban: function (patch) { store.update(function (state) { return Object.assign({}, state, { kanban: Object.assign({}, state.kanban, patch) }); }); },
    editPerson: openEditPerson,
    togglePerson: togglePerson,
    setTeamTab: setTeamTab,
    setTeamStatus: setTeamStatus,
    createAccount: createAccountFor,
    resetPassword: resetPasswordFor,
    disableAccount: disableAccountFor,
    enableAccount: enableAccountFor,
    deletePerson: deletePerson,
    newPerson: openNewPerson,
    openCreate: openCreate,
    clearTeamFilters: clearTeamFilters,
    goTo: goTo,
    setMe: setMe,
    setPref: setPref,
    previewLook: applyLook,
    showShortcuts: showShortcuts,
    exportJson: exportJson,
    importJson: function () { nodes.fileInput.click(); },
    clearAll: clearAll,
    setSettingsSection: function (id) { store.set({ settingsSection: id }); },
    setSettingsAdv: function (open) { if (store.getState().settingsAdvOpen !== !!open) store.set({ settingsAdvOpen: !!open }); },
    openSettings: function (section) { if (section) store.set({ settingsSection: section }); goTo('settings'); },
    openLeaveRules: function () { setLeave({ rail: 'rules' }); goTo('leave'); },
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
      items: [{ value: 'portfolio', icon: 'chart', title: 'Portfel na osi czasu' }, { value: 'list', icon: 'list', title: 'Widok tabeli' }, { value: 'cards', icon: 'grid', title: 'Widok kart' }],
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
    nodes.sortButton.querySelector('span').textContent = (SORT_LABEL[state.filters.sort] || 'Numer') + (state.filters.sort === 'manual' ? '' : (state.filters.dir === 'desc' ? ' ↓' : ' ↑'));
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
    } else if (state.prefs.view === 'portfolio') {
      content = E.PortfolioMap.view(visible, ctx);
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

    var mgmt = E.Budget.isManagement(state.prefs.me, roster);
    var accounts = mgmt && state.teamTab === 'accounts';
    var boardTab = !accounts && state.teamTab !== 'people' && roster.length > 0;
    nodes.teamFilters.hidden = accounts || boardTab || !roster.length;
    var tabs = roster.length ? D.el('div', { class: 'ac-tabs' }, [UI.segmented({
      label: 'Widok zespołu', value: accounts ? 'accounts' : (boardTab ? 'board' : 'people'),
      items: [{ value: 'board', label: 'Dziś i tydzień' }, { value: 'people', label: 'Katalog osób' }].concat(mgmt ? [{ value: 'accounts', label: 'Konta i role' }] : []),
      onChange: setTeamTab
    }).node]) : null;
    var body = accounts ? E.AccountsScreen.view(state, actions) : (boardTab ? E.TeamScreen.board(state, actions) : E.TeamScreen.teamList(roster, state.workspace.projects, state.teamFilters, actions, teamCapacity(state)));
    D.render(nodes.teamTabs, tabs ? [tabs] : []);
    D.patch(nodes.teamList, [body]);
    if (boardTab && roster.length) nodes.teamSummary.textContent = 'Kto dziś pracuje, kto jest na urlopie, w terenie albo na spotkaniu.';

  }

  function renderPlan(state) {
    var screen = E.PlanBoard.screen(state, { actions: actions, find: locateEntry });
    nodes.planSummary.textContent = screen.summary;
    D.patch(nodes.planBody, [screen.body]);
  }

  function renderCalendar(state) {
    var screen = E.CalendarScreen.view(state, { actions: actions });
    nodes.calendarSummary.textContent = screen.summary;
    D.patch(nodes.calendarBody, [screen.body]);
  }

  function renderOrders(state) {
    var screen = E.OrdersScreen.view(state, { actions: actions });
    nodes.ordersSummary.textContent = screen.summary;
    D.patch(nodes.ordersBody, [screen.body]);
  }

  function renderLeave(state) {
    var screen = E.LeaveScreen.view(state, { actions: actions });
    nodes.leaveSummary.textContent = screen.summary;
    D.render(nodes.leaveTools, screen.tools ? [screen.tools] : []);
    D.patch(nodes.leaveBody, [screen.body]);
  }

  function renderReview(state) {
    var screen = E.ReviewScreen.view(state, { actions: actions });
    nodes.reviewSummary.textContent = screen.summary;
    D.patch(nodes.reviewBody, [screen.body]);
  }

  function renderLibrary(state) {
    var screen = E.LibraryScreen.view(state, { actions: actions });
    nodes.librarySummary.textContent = screen.summary;
    D.patch(nodes.libraryBody, [screen.body]);
  }

  function renderInbox(state) {
    var screen = E.InboxScreen.view(state, { actions: actions, find: locateEntry });
    nodes.inboxSummary.textContent = screen.summary;
    D.patch(nodes.inboxBody, [screen.body]);
  }

  function renderMyWork(state) {
    var screen = E.MyWork.view(state, { actions: actions, find: locateEntry });
    document.getElementById('mywork-title').textContent = 'Moja praca';
    nodes.myworkSummary.textContent = screen.summary;
    D.render(nodes.myworkWho, screen.who ? [screen.who] : []);
    D.patch(nodes.myworkBody, [screen.body]);
  }

  function renderDashboard(state) {
    var screen = E.Dashboard.view(state, { actions: actions, find: locateEntry });
    D.patch(nodes.dashboardBody, [screen.body]);
  }

  function renderSettings(state) {
    var screen = E.SettingsScreen.view(state, { actions: actions });
    nodes.settingsSummary.textContent = screen.summary;
    D.patch(nodes.settingsBody, [screen.body]);
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
    var current = state.form || state.personForm || state.taskForm || state.stageForm || state.timeForm || state.mailForm || state.absenceForm || state.tripForm || state.orderForm || state.leaveForm || state.caseForm || state.mailStep || state.mailCard || null;
    if (current === lastForm) return;
    lastForm = current;

    if (!current) {
      if (drawerEl) Dialog.closeDrawer();
      return;
    }

    var settings = {};
    if (current === state.personForm) {
      settings.title = current.draft.id != null ? 'Edytuj osobę' : 'Nowa osoba';
      settings.subtitle = current.draft.id != null ? 'Zmiany widać od razu we wszystkich projektach.' : (current.wizard ? ['Dane i adres e-mail, na który zakładamy konto.', 'Rola decyduje o tym, co osoba widzi w aplikacji.', 'Hasło tymczasowe pokazujemy tylko raz.'][(current.step || 1) - 1] : 'Osoba trafi do katalogu biura.');
      if (current.wizard) settings.content = E.PersonForm.wizard(current.draft, { step: current.step || 1, password: current.password || '', errors: current.errors }, { onBack: function (v) { wizardMove(v, -1); }, onNext: function (v) { wizardMove(v, 1); }, onRegenerate: wizardRegenerate, onSubmit: wizardCreate, onCancel: function () { store.set({ personForm: null }); } });
      else settings.content = E.PersonForm.personForm(current.draft, current.errors, { onSubmit: submitPerson, onCancel: function () { store.set({ personForm: null }); } }, { management: E.Budget.isManagement(state.prefs.me, state.workspace.people || []) });
    } else if (current === state.taskForm) {
      var project = findProject(current.projectId);
      var stage = stageOf(current.projectId, current.stageId);
      var roster = project
        ? projectRoster(project).map(function (id) { return Team.findPerson(state.workspace.people, id); }).filter(Boolean)
        : [];
      settings.title = current.draft.id != null ? 'Edytuj zadanie' : 'Nowe zadanie';
      settings.subtitle = (project ? project.code : '') + (stage ? ' · ' + Model.describeStage(stage).name : '');
      settings.content = E.TaskForm.taskForm(current.draft, current.errors, { onSubmit: submitTask, onCancel: function () { store.set({ taskForm: null }); } }, roster, current.fromMail ? { mail: current.fromMail, stageId: current.stageId, stages: (project ? project.stages : []).map(function (st) { return { value: st.id, label: Model.describeStage(st).name }; }) } : null, { hideHours: !(project && E.Budget.canSeeHours(currentMe(), project, people())) });
    } else if (current === state.timeForm) {
      var logged = findProject(current.projectId);
      var loggedTask = taskOf(current.projectId, current.stageId, current.taskId);
      settings.title = current.mode === 'stop' ? 'Rozlicz zegar' : (current.mode === 'edit' ? 'Zmień wpis czasu' : 'Dopisz czas');
      settings.subtitle = current.choices ? 'Wybierz zadanie, na które pracowałeś' : (logged ? logged.code + ' · ' : '') + (loggedTask ? loggedTask.name : 'Zadanie');
      settings.content = E.Timer.timeForm({ mode: current.mode, draft: current.draft, errors: current.errors, hint: current.hint, choices: current.choices },
        { onSubmit: submitTime, onCancel: function () { store.set({ timeForm: null }); } });
    } else if (current === state.absenceForm) {
      settings.title = current.draft.id ? 'Zmień nieobecność' : 'Nowa nieobecność';
      settings.subtitle = 'Pojemność tygodnia w planie zmniejsza się o dni robocze nieobecności.';
      settings.content = E.AbsenceForm.absenceForm(current.draft, current.errors, {
        onSubmit: submitAbsence,
        onCancel: function () { store.set({ absenceForm: null }); },
        onDelete: current.draft.id ? function () { deleteAbsence(current.draft.id); } : null
      }, (state.workspace.people || []).filter(function (p) { return p.active !== false; }));
    } else if (current === state.tripForm) {
      var meT = state.prefs.me;
      var projT = (state.workspace.projects || []).filter(function (p) { return p.status !== 'done'; });
      settings.title = current.draft.id ? 'Wyjazd' : 'Nowy wyjazd';
      settings.subtitle = 'Teren lub spotkanie poza biurem. Licznik czasu działa normalnie.';
      settings.content = E.TripForm.tripForm(current.draft, current.errors, {
        onSubmit: submitTrip,
        onCancel: function () { store.set({ tripForm: null }); },
        onDelete: current.draft.id && !current.readOnly ? function () { deleteTrip(current.draft.id); } : null
      }, { people: E.Trips.assignable(meT, state.workspace.people || [], state.workspace.projects || []).filter(function (p) { return p.active !== false; }), projects: projT });
    } else if (current === state.orderForm) {
      var meO = state.prefs.me;
      var allO = state.workspace.orders || [];
      var sugO = E.Orders.suggestAssignee(allO, current.draft.kind || 'sign', meO);
      var sugP = sugO ? Team.findPerson(people(), sugO.personId) : null;
      settings.title = 'Nowe zlecenie';
      settings.subtitle = 'Wskaż, co i komu. Wykonawca zobaczy je w „Zleceniach”, a Ty zobaczysz, ile już czeka.';
      settings.content = E.OrdersScreen.orderForm(current.draft, current.errors, {
        onSubmit: submitOrder,
        onCancel: function () { store.set({ orderForm: null }); },
        onChange: function (draft) { store.set({ orderForm: Object.assign({}, store.getState().orderForm, { draft: draft, errors: {} }) }); }
      }, { people: people().filter(function (p) { return p.active !== false; }), projects: (state.workspace.projects || []).filter(function (p) { return p.status !== 'done'; }), dests: E.Orders.recentDest(allO, 4), suggestedName: sugP && sugP.id !== current.draft.assigneeId ? Team.fullName(sugP) : (sugP && !current.draft.assigneeId ? Team.fullName(sugP) : '') });
    } else if (current === state.leaveForm) {
      var meL = Team.findPerson(people(), state.prefs.me);
      var mgmt = !!meL && E.Budget.isManagement(meL.id, people());
      var balL = E.Absences.balance(state.workspace.absences || [], meL, new Date());
      if (current.sick) {
        settings.title = current.editId ? 'Zmiana L4' : 'Zgłoszenie L4';
        if (current.editId) settings.subtitle = 'Skróć, przedłuż albo popraw uwagę. Zespół nadal widzi tylko, że ta osoba jest nieobecna.';
        else settings.subtitle = mgmt ? 'Zwolnienie lekarskie zapisuje się od razu. Możesz zgłosić je za osobę z zespołu.' : 'Bez wniosku i akceptacji. Zespół zobaczy tylko, że jesteś nieobecny/a, bez powodu.';
        settings.content = E.LeaveScreen.sickForm(current.draft, current.errors, { onSubmit: submitLeaveRequest, onCancel: function () { store.set({ leaveForm: null }); } }, { canPick: mgmt && !current.editId, people: people(), editing: !!current.editId });
      } else {
      settings.title = mgmt ? 'Nowy urlop' : 'Wniosek urlopowy';
      settings.subtitle = mgmt ? 'Jako zarząd zapisujesz urlop od razu, bez akceptacji.' : 'Wniosek trafia do zarządu. Po akceptacji urlop pojawi się w Planie.';
      settings.content = E.LeaveScreen.requestForm(current.draft, current.errors, { onSubmit: submitLeaveRequest, onCancel: function () { store.set({ leaveForm: null }); } },
        { free: balL.free, childcareLeft: E.Absences.CHILDCARE_LIMIT - balL.childcare, blackouts: ((state.workspace.settings || {}).blackouts) || [], onDemandLeft: balL.onDemandLimit - balL.onDemandUsed - balL.onDemandPending, auto: mgmt,
          impact: function (from, to) { return E.Absences.impact({ id: '', personId: meL.id, from: from, to: to }, { projects: state.workspace.projects || [], people: people(), absences: (state.workspace.absences || []).filter(function (x) { return x.kind === 'leave'; }) }); } });
      }
    } else if (current === state.caseForm) {
      settings.title = 'Sprawa w toku';
      settings.subtitle = 'Wniosek złożony lub materiał zamówiony: sprawa zostaje widoczna z licznikiem dni, aż ją zakończysz.';
      settings.content = E.CaseUI.form(current.draft, current.errors, { onSubmit: submitCase, onCancel: function () { store.set({ caseForm: null }); }, onDraft: function (draft) { store.set({ caseForm: Object.assign({}, current, { draft: draft, errors: {} }) }); }, nameFromTask: caseNameFromTask }, state.workspace.projects.filter(function (p) { return p.status !== 'done'; }), Model);
    } else if (current === state.mailCard) {
      var cardEntry = mailList().filter(function (e) { return e.id === current.id; })[0];
      var cardProject = cardEntry && findProject(cardEntry.projectId);
      settings.title = cardEntry ? cardEntry.regNo : 'Pismo';
      settings.subtitle = cardProject ? cardProject.code + ' · ' + cardProject.name : '';
      if (cardEntry && cardProject) {
        var cardOwner = cardEntry.direction === 'in' ? Team.findPerson(people(), Mail.ownerOf(cardEntry, cardProject)) : null;
        var cardCase = cardEntry.caseId ? caseList().filter(function (c) { return c.id === cardEntry.caseId; })[0] : null;
        settings.content = E.MailFlow.card({
          entry: cardEntry, project: cardProject,
          flow: Mail.incomingState(cardEntry, mailList(), cardProject, state.workspace.entries, new Date()),
          ownerName: cardOwner ? Team.fullName(cardOwner) : '',
          tasks: Mail.linkedTasks(cardProject, cardEntry.id, state.workspace.entries, new Date()),
          caseItem: cardCase || null,
          replies: mailList().filter(function (e) { return e.replyTo === cardEntry.id; }),
          history: (cardEntry.history || []).map(function (x) { var who = x.by ? Team.findPerson(people(), x.by) : null; return { at: x.at, text: x.text, who: who ? Team.fullName(who) : '' }; })
        }, {
          onDecide: function (choice) { mailDecide(cardEntry.id, choice); },
          onAnswer: function () { store.set({ mailCard: null }); replyToMail(cardEntry.id); },
          onEdit: function () { openEditMail(cardEntry.id); },
          onTask: function (row) { store.set({ mailCard: null }); actions.inspect({ kind: 'task', projectId: cardProject.id, stageId: row.stage.id, taskId: row.task.id }); }
        });
      } else settings.content = D.el('div');
    } else if (current === state.mailStep) {
      var stepEntry = mailList().filter(function (e) { return e.id === current.id; })[0];
      var stepProject = stepEntry && findProject(stepEntry.projectId);
      settings.title = current.kind === 'reply' ? 'Wymaga odpowiedzi' : (current.kind === 'case' ? 'Dołącz do sprawy' : 'Przekaż pismo');
      settings.subtitle = stepProject ? stepProject.code + ' · ' + stepProject.name : '';
      settings.content = stepEntry ? E.MailFlow.stepForm({
        kind: current.kind, entry: stepEntry, draft: current.draft, errors: current.errors,
        suggested: !!current.suggested,
        cases: caseList().filter(function (c) { return c.projectId === stepEntry.projectId && c.status === 'open'; }),
        people: mailOwnerOptions(stepEntry.projectId, true)
      }, { onSubmit: submitMailStep, onCancel: function () { store.set({ mailStep: null }); } }) : D.el('div');
    } else if (current === state.mailForm) {
      var mailProject = findProject(current.projectId);
      settings.title = current.mode === 'edit' ? 'Edytuj wpis w dzienniku' : (current.draft.direction === 'out' ? 'Pismo wychodzące' : 'Pismo przychodzące');
      settings.subtitle = mailProject ? mailProject.code + ' · ' + mailProject.name : '';
      settings.content = E.MailTab.mailForm({
        mode: current.mode, draft: current.draft, errors: current.errors, locked: current.locked,
        replies: mailReplyOptions(current.projectId, current.draft.direction, current.draft.id),
        owners: mailOwnerOptions(current.draft.projectId || current.projectId), projectId: current.projectId,
        projects: state.workspace.projects.filter(function (p) { return p.status !== 'done'; }).map(function (p) { return { value: String(p.id), label: p.code + ' · ' + p.name }; })
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
        if (live.form || live.personForm || live.taskForm || live.stageForm || live.timeForm || live.mailForm || live.absenceForm || live.tripForm || live.orderForm || live.leaveForm || live.mailStep || live.mailCard) {
          store.set({ mailStep: null, mailCard: null, form: null, personForm: null, taskForm: null, stageForm: null, timeForm: null, mailForm: null, absenceForm: null, tripForm: null, orderForm: null, leaveForm: null });
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
    nodes.views.plan.hidden = route.name !== 'plan';
    nodes.views.review.hidden = route.name !== 'review';
    nodes.views.calendar.hidden = route.name !== 'calendar';
    nodes.views.leave.hidden = route.name !== 'leave';
    E.Library.configure(state.workspace.library);
    nodes.views.orders.hidden = route.name !== 'orders';
    nodes.views.dashboard.hidden = route.name !== 'dashboard';
    if (route.name !== 'dashboard' && nodes.dashboardBody.firstChild) D.clear(nodes.dashboardBody);
    nodes.views.mywork.hidden = route.name !== 'mywork';
    nodes.views.inbox.hidden = route.name !== 'inbox';
    nodes.views.feed.hidden = route.name !== 'feed';
    nodes.views.settings.hidden = route.name !== 'settings';
    if (route.name !== 'settings' && nodes.settingsBody.firstChild) D.clear(nodes.settingsBody);
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
      null
    ]);
    if (E.TimeDock) E.TimeDock.render(nodes.timeDock, { state: state, me: meCurrent, running: runningTimer(), todays: todays, find: locateEntry, actions: actions, budget: timerBudget });

    if (route.name === 'time') {
      document.title = 'Czas · ETROM';
      renderTime(state);
    } else if (route.name === 'analysis') {
      document.title = 'Analiza · ETROM';
      renderAnalysis(state);
    } else if (route.name === 'settings') {
      document.title = 'Ustawienia · ETROM';
      renderSettings(state);
    } else if (route.name === 'feed') {
      document.title = 'Aktualności · ETROM';
      renderFeed(state);
    } else if (route.name === 'orders') {
      document.title = 'Zlecenia · ETROM';
      renderOrders(state);
    } else if (route.name === 'dashboard') {
      document.title = 'Pulpit · ETROM';
      renderDashboard(state);
    } else if (route.name === 'inbox') {
      document.title = 'Skrzynka · ETROM';
      renderInbox(state);
    } else if (route.name === 'mywork') {
      document.title = 'Moja praca · ETROM';
      renderMyWork(state);
    } else if (route.name === 'plan') {
      document.title = 'Plan · ETROM';
      renderPlan(state);
    } else if (route.name === 'leave') {
      document.title = 'Urlopy · ETROM';
      renderLeave(state);
    } else if (route.name === 'calendar') {
      document.title = 'Kalendarz · ETROM';
      renderCalendar(state);
    } else if (route.name === 'review') {
      document.title = 'Przegląd · ETROM';
      renderReview(state);
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
      cases: state.workspace.cases || [],
      me: state.prefs.me,
      findProject: findProject,
      mailOf: function (id) { return mailList().filter(function (e) { return e.id === id; })[0] || null; },
      actions: actions
    });
  }

  function renderAll(state) {
    /* Dni wolne firmy ustawione przez zarząd liczą się jak święta we wszystkich kalendarzach. */
    E.Calendar.setExtraHolidays(state.workspace && state.workspace.settings ? state.workspace.settings.companyDays : []);
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

  /** Skróty Kalendarza, Czasu i Urlopów: ← → zmieniają okres, D wraca do dziś, litery wybierają widok. Zwraca true, gdy klawisz obsłużono. */
  function handlePeriodKeys(route, event, state) {
    var key = String(event.key);
    var lower = key.toLowerCase();
    var dir = key === 'ArrowLeft' ? -1 : (key === 'ArrowRight' ? 1 : 0);
    var inGrid = event.target && event.target.closest && event.target.closest('[data-k]');
    if (dir && (event.defaultPrevented || inGrid)) return false;
    function done() { event.preventDefault(); return true; }
    if (route === 'calendar') {
      if (!dir) return false;
      var mode = ((state.prefs.cal || {}).view) || 'month';
      var Cal = E.Calendar;
      var anchor = state.calAnchor || Cal.isoOf(new Date());
      var d = Cal.parse(anchor);
      var next = mode === 'agenda' ? Cal.addDays(anchor, 30 * dir) : mode === 'day' ? Cal.addDays(anchor, dir) : (mode === 'week' ? Cal.addDays(anchor, 7 * dir) : (mode === 'year' ? Cal.isoOf(new Date(d.getFullYear() + dir, d.getMonth(), 1)) : Cal.isoOf(new Date(d.getFullYear(), d.getMonth() + dir, 1))));
      store.set({ calAnchor: next, calDay: null });
      return done();
    }
    if (route === 'time') {
      var tm = state.timeMode === 'month' ? 'month' : (state.timeMode === 'day' ? 'day' : 'week');
      var views = { z: 'day', w: 'week', m: 'month' };
      if (views[lower]) { store.set({ timeMode: views[lower], timeOffset: 0 }); return done(); }
      if (lower === 'd') { store.set({ timeOffset: 0 }); return done(); }
      if (!dir) return false;
      var off = (state.timeOffset || 0) + dir;
      store.set({ timeOffset: tm === 'day' ? Math.min(0, off) : off });
      return done();
    }
    var lv = state.leave || {};
    var lmode = lv.view === 'month' ? 'month' : 'year';
    if (lower === 'm' || lower === 'r') { setLeave({ view: lower === 'm' ? 'month' : 'year', sel: null }); return done(); }
    if (lower === 'd') { setLeave({ monthOffset: 0, year: new Date().getFullYear() }); return done(); }
    if (!dir) return false;
    if (lmode === 'year') setLeave({ year: (Number(lv.year) || new Date().getFullYear()) + dir, sel: null });
    else setLeave({ monthOffset: (Number(lv.monthOffset) || 0) + dir });
    return done();
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
      if (event.key === 's' || event.key === 'S') { event.preventDefault(); goTo('inbox'); return; }
      if (event.key === 'a' || event.key === 'A') { event.preventDefault(); goTo('feed'); return; }
      if (event.key === 'n' || event.key === 'N') { event.preventDefault(); goTo('analysis'); return; }
    }
    if (route === 'calendar' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      var calKeys = { m: 'month', w: 'week', r: 'year', z: 'day', a: 'agenda' };
      var ck = String(event.key).toLowerCase();
      if (calKeys[ck]) { event.preventDefault(); setCal({ view: calKeys[ck] }); return; }
      if (ck === 'd') { event.preventDefault(); store.set({ calAnchor: null, calDay: null }); return; }
    }
    if ((route === 'calendar' || route === 'time' || route === 'leave') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (handlePeriodKeys(route, event, state)) return;
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
      var links = Array.prototype.slice.call(nodes.list.querySelectorAll(nodes.list.querySelector('.hy') ? '.hy-n' : '.project-link'));
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
      if (route === 'projects') { event.preventDefault(); setView({ portfolio: 'list', list: 'cards', cards: 'portfolio' }[state.prefs.view] || 'portfolio'); return; }
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
    nodes.teamTabs = D.byId('team-tabs');
    nodes.teamList = D.byId('team-list');
    nodes.teamSummary = D.byId('team-summary');
    nodes.timerSlot = D.byId('timer-slot');
    nodes.timeDock = D.byId('time-dock');
    nodes.myworkSummary = D.byId('mywork-summary');
    nodes.librarySummary = D.byId('library-summary');
    nodes.planSummary = D.byId('plan-summary');
    nodes.planBody = D.byId('plan-body');
    nodes.calendarSummary = D.byId('calendar-summary');
    nodes.calendarBody = D.byId('calendar-body');
    nodes.ordersSummary = D.byId('orders-summary');
    nodes.ordersBody = D.byId('orders-body');
    nodes.leaveSummary = D.byId('leave-summary');
    nodes.leaveBody = D.byId('leave-body');
    nodes.reviewSummary = D.byId('review-summary');
    nodes.reviewBody = D.byId('review-body');
    nodes.libraryBody = D.byId('library-body');
    nodes.myworkWho = D.byId('mywork-who');
    nodes.myworkBody = D.byId('mywork-body');
    nodes.inboxSummary = D.byId('inbox-summary');
    D.byId('inbox-register').addEventListener('click', function () { registerMail(); });
    // Plik przeciągnięty na okno otwiera rejestrację pisma z jego nazwą.
    window.addEventListener('dragover', function (ev) { if (ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [], 'Files') >= 0) ev.preventDefault(); });
    window.addEventListener('drop', function (ev) {
      var dropped = ev.dataTransfer && ev.dataTransfer.files;
      if (!dropped || !dropped.length) return;
      ev.preventDefault();
      registerMail(Array.prototype.map.call(dropped, function (f) { return { name: f.name, size: f.size, location: '' }; }));
    });
    nodes.inboxBody = D.byId('inbox-body');
    nodes.dashboardBody = D.byId('dashboard-body');
    nodes.settingsSummary = D.byId('settings-summary');
    nodes.settingsBody = D.byId('settings-body');
    nodes.feedSummary = D.byId('feed-summary');
    nodes.feedBody = D.byId('feed-body');
    nodes.analysisSummary = D.byId('analysis-summary');
    nodes.analysisTools = D.byId('analysis-tools');
    nodes.analysisBody = D.byId('analysis-body');
    nodes.timeSummary = D.byId('time-summary');
    nodes.timeTools = D.byId('time-tools');
    nodes.leaveTools = D.byId('leave-tools');
    nodes.timeBody = D.byId('time-body');
    nodes.fileInput = D.byId('import-file');
    nodes.views = { orders: D.byId('view-orders'), dashboard: D.byId('view-dashboard'), projects: D.byId('view-projects'), project: D.byId('view-project'), team: D.byId('view-team'), library: D.byId('view-library'), plan: D.byId('view-plan'), review: D.byId('view-review'), calendar: D.byId('view-calendar'), leave: D.byId('view-leave'), mywork: D.byId('view-mywork'), inbox: D.byId('view-inbox'), feed: D.byId('view-feed'), settings: D.byId('view-settings'), analysis: D.byId('view-analysis'), time: D.byId('view-time') };
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
        setMyView: function (v) { store.set({ myView: v }); },
        setInbox: function (patch) { store.set({ inbox: Object.assign({}, store.getState().inbox || {}, patch) }); },
        setLeave: setLeave,
        setTeamTab: setTeamTab,
        newProject: function () { if (store.getState().route.name === 'team') goTo('projects'); openCreate(); },
        newPerson: function () { goTo('team'); openNewPerson(); },
        showShortcuts: showShortcuts,
        openSettings: function (section) { if (section) store.set({ settingsSection: section }); goTo('settings'); },
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
