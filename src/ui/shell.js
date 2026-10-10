/* ETROM — szkielet: panel boczny na kalce, ścieżka w arkuszu, ustawienia.
   Panel boczny jest nawigacją: przestrzeń robocza, szukaj i utwórz,
   sekcje, przypięte i ostatnio otwierane projekty ze znakiem stanu. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Icons = E.Icons;
  var Insight = E.Insight;
  var Sig = E.Sig;

  var nodes = {};
  var actions = null;
  var getState = null;

  var ACCENTS = [
    { value: 'standard', label: 'Nurt', color: '#2C7CA0' },
    { value: 'etrom', label: 'Etrom', color: '#C23F86' },
    { value: 'graphite', label: 'Grafit', color: '#3E4B49' },
    { value: 'morski', label: 'Morski', color: '#0B7285' },
    { value: 'lesny', label: 'Leśny', color: '#2F7D5B' },
    { value: 'granat', label: 'Granat', color: '#3B4CAE' }
  ];

  // Motywy kolorystyczne (podgląd w pigułce: dwa kolory aurory).
  var PALETTES = [
    { value: 'ocean', label: 'Morski', a: 'oklch(.62 .14 200)', b: 'oklch(.4 .13 252)' },
    { value: 'graphite', label: 'Grafit', a: 'oklch(.52 .03 250)', b: 'oklch(.3 .03 255)' },
    { value: 'forest', label: 'Leśny', a: 'oklch(.6 .14 160)', b: 'oklch(.4 .12 195)' },
    { value: 'sunset', label: 'Zachód', a: 'oklch(.66 .16 38)', b: 'oklch(.42 .15 12)' },
    { value: 'violet', label: 'Fiolet', a: 'oklch(.6 .15 335)', b: 'oklch(.4 .14 288)' },
    { value: 'etrom', label: 'Etrom', a: 'oklch(.62 .19 352)', b: 'oklch(.5 .04 235)' },
    { value: 'sky', label: 'Niebo (jasny)', a: 'oklch(.9 .07 225)', b: 'oklch(.62 .13 262)' },
    { value: 'mint', label: 'Mięta (jasny)', a: 'oklch(.92 .07 170)', b: 'oklch(.64 .12 205)' },
    { value: 'peach', label: 'Brzoskwinia (jasny)', a: 'oklch(.92 .07 55)', b: 'oklch(.66 .15 15)' },
    { value: 'lilac', label: 'Lawenda (jasny)', a: 'oklch(.9 .07 312)', b: 'oklch(.6 .14 282)' }
  ];
  var LOOK_DEFAULTS = { look: 'aurora', oledGuard: false, palette: 'ocean', hdr: true, tilesFull: false, colorBy: 'number', vivid: 100, contrast: 50 };

  /** Logo ETROM: warstwa barwna + napis w kolorze tekstu (działa w obu motywach). */
  function logo(markOnly) {
    return D.el('span', { class: 'logo' + (markOnly ? ' logo--mark' : ''), attrs: { 'aria-hidden': 'true' } }, [
      D.el('span', { class: 'logo__color' }), D.el('span', { class: 'logo__ink' })
    ]);
  }

  function navItem(screen, icon, label, href, onClick) {
    var count = D.el('span', { class: 'count nav__count', text: '0' });
    var link = D.el('a', {
      class: 'nav__item',
      attrs: { href: href, 'data-tooltip': label },
      dataset: { screen: screen },
      on: onClick ? { click: onClick } : null
    }, [Icons.icon(icon), D.el('span', { class: 'nav__label', text: label }), count]);
    nodes.nav[screen] = link;
    nodes.counts[screen] = count;
    return link;
  }

  /** Pozycja zapowiedzianego modułu: widoczna dla Dyrekcji, nieaktywna. */
  function soonItem(screen, icon, label) {
    var el = D.el('span', { class: 'nav__item is-soon', attrs: { 'aria-disabled': 'true', 'data-tooltip': label + ' — wkrótce', tabindex: '-1' }, dataset: { screen: screen } }, [
      Icons.icon(icon), D.el('span', { class: 'nav__label', text: label }), D.el('span', { class: 'nav__soon', text: 'WKRÓTCE' })
    ]);
    nodes.nav[screen] = el;
    return el;
  }

  var COLLAPSE_KEY = 'etrom.nav.collapsed.v1';
  function loadCollapsed() { try { return JSON.parse(root.localStorage.getItem(COLLAPSE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveCollapsed(map) { try { root.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map)); } catch (e) { /* bez zapisu też działa */ } }

  /** Blok menu ze zwijanym nagłówkiem. `items` to elementy <li> w kolejności. */
  function navGroup(key, label, items) {
    var collapsed = loadCollapsed();
    var list = D.el('ul', { class: 'nav', attrs: { id: 'navg-' + key } }, items);
    var head = label ? D.el('button', { class: 'sidebar__label nav__group', attrs: { type: 'button', 'aria-expanded': String(!collapsed[key]), 'aria-controls': 'navg-' + key, 'data-fk': 'navg-' + key } }, [
      D.el('span', { text: label }), Icons.icon('chevronDown', 12)
    ]) : null;
    var box = D.el('div', { class: 'sidebar__section nav__block' + (collapsed[key] ? ' is-collapsed' : ''), dataset: { group: key } }, [head, list]);
    if (head) head.addEventListener('click', function () {
      var map = loadCollapsed();
      var closed = !box.classList.contains('is-collapsed');
      box.classList.toggle('is-collapsed', closed);
      head.setAttribute('aria-expanded', String(!closed));
      map[key] = closed;
      saveCollapsed(map);
    });
    nodes.groups[key] = box;
    return box;
  }

  function li(node, cls) { return D.el('li', cls ? { class: cls } : null, [node]); }

  function settingsPanel(state) {
    var prefs = state.prefs;
    var theme = UI.segmented({
      label: 'Motyw',
      value: prefs.theme,
      items: [
        { value: 'light', label: 'Jasny', icon: 'sun' },
        { value: 'dark', label: 'Ciemny', icon: 'moon' },
        { value: 'system', label: 'System', icon: 'monitor' }
      ],
      onChange: function (value) { actions.setPref({ theme: value }); theme.set(value); }
    });

    var density = UI.segmented({
      label: 'Gęstość',
      value: prefs.density || 'comfortable',
      items: [{ value: 'comfortable', label: 'Komfortowa' }, { value: 'compact', label: 'Zwarta' }],
      onChange: function (value) { actions.setPref({ density: value }); density.set(value); }
    });

    var meNow = E.Team.findPerson(state.workspace.people || [], prefs.me);
    var isBoss = !!meNow && E.Budget.isManagement(meNow.id, state.workspace.people || []);
    function item(label, icon, run, tone, kbd) {
      return D.el('button', {
        class: 'menu__item' + (tone === 'danger' ? ' menu__item--danger' : ''),
        attrs: { type: 'button' },
        on: { click: function () { Menu.close({ restoreFocus: false }); run(); } }
      }, [Icons.icon(icon), D.el('span', { class: 'menu__label', text: label }), kbd ? D.el('span', { class: 'menu__hint', text: kbd }) : null]);
    }

    return D.el('div', { class: 'settings' }, [
      D.el('div', { class: 'settings__head' }, [
        logo(false),
        D.el('span', { class: 'brand-sub', text: 'Biuro projektowe · dane w tej przeglądarce' })
      ]),
      D.el('div', { class: 'settings__row' }, [D.el('span', { class: 'settings__label', text: 'Motyw' }), theme.node]),
      D.el('div', { class: 'settings__row' }, [D.el('span', { class: 'settings__label', text: 'Gęstość' }), density.node]),
      D.el('div', { class: 'menu__separator' }),
      item('Wszystkie ustawienia…', 'sparkle', function () { actions.openSettings(); }, null, null),
      item('Skróty klawiszowe', 'keyboard', actions.showShortcuts, null, '?'),
      item('Dodaj dane przykładowe', 'sparkle', actions.loadDemo),
      item('Pobierz kopię zapasową', 'download', actions.exportJson),
      item('Wczytaj kopię zapasową…', 'upload', actions.importJson),
      D.el('div', { class: 'menu__separator' }),
      item('Usuń wszystkie dane…', 'trash', actions.clearAll, 'danger'),
      D.el('p', { class: 'menu__note', text: 'Dane zapisują się w tej przeglądarce. Przed zmianą komputera pobierz kopię zapasową.' })
    ]);
  }

  /** Buduje panel raz; dalej render(state) tylko aktualizuje. */
  function build(options) {
    actions = options.actions;
    getState = options.getState;
    nodes.sidebar = options.sidebar;
    nodes.crumb = options.crumb;
    nodes.nav = {};
    nodes.counts = {};
    nodes.groups = {};
    nodes.alarm = D.el('span', { class: 'nav__alert', attrs: { hidden: true } });

    nodes.pinned = D.el('ul', { class: 'nav', attrs: { 'aria-label': 'Przypięte projekty' } });
    nodes.recent = D.el('ul', { class: 'nav', attrs: { 'aria-label': 'Ostatnio otwierane' } });
    nodes.pinnedSection = D.el('div', { class: 'sidebar__section' }, [D.el('p', { class: 'sidebar__label', text: 'Przypięte' }), nodes.pinned]);
    nodes.recentSection = D.el('div', { class: 'sidebar__section' }, [D.el('p', { class: 'sidebar__label', text: 'Ostatnio otwierane' }), nodes.recent]);

    var workspace = D.el('button', {
      class: 'workspace',
      attrs: { type: 'button', id: 'action-settings', 'aria-label': 'ETROM — ustawienia i dane', 'data-tooltip': 'Ustawienia i dane' }
    }, [
      D.el('span', { class: 'brand-full' }, [logo(false)]),
      D.el('span', { class: 'brand-rail' }, [logo(true)]),
      Icons.icon('chevronsUpDown', 14)
    ]);
    workspace.lastChild.setAttribute('class', 'workspace__chev');
    workspace.setAttribute('aria-haspopup', 'dialog');
    workspace.setAttribute('aria-expanded', 'false');
    workspace.addEventListener('click', function () {
      Menu.open({ anchor: workspace, label: 'Ustawienia i dane', content: settingsPanel(getState()), minWidth: '26rem', className: 'popover--settings' });
    });

    var search = D.el('button', {
      class: 'sidebar__search',
      attrs: { type: 'button', id: 'action-search', 'aria-keyshortcuts': 'Control+K', 'data-tooltip': 'Szukaj i działaj', 'data-tooltip-kbd': 'Ctrl K' }
    }, [Icons.icon('search'), D.el('span', { class: 'grow', text: 'Szukaj' }), UI.kbd('Ctrl K')]);
    search.addEventListener('click', actions.openPalette);

    var create = UI.iconButton({ icon: 'plus', label: 'Utwórz', class: 'sidebar__create', attrs: { id: 'action-create' } });
    Menu.bind(create, function () {
      return {
        label: 'Utwórz', items: [
          { label: 'Nowy projekt', icon: 'folder', hint: 'N', onSelect: actions.newProject },
          { label: 'Nowa osoba', icon: 'person', onSelect: actions.newPerson }
        ]
      };
    });

    nodes.save = D.el('span', { class: 'save-state', attrs: { id: 'save-state', role: 'status', tabindex: '0' } });

    D.render(nodes.sidebar, [
      workspace,
      D.el('div', { class: 'sidebar__tools' }, [search, create]),
      D.el('nav', { class: 'sidebar__nav', attrs: { 'aria-label': 'Główna' } }, [
        navGroup('start', null, [
          li(navItem('dashboard', 'grid', 'Pulpit', '#/pulpit')),
          li(navItem('inbox', 'mail', 'Skrzynka', '#/skrzynka', function () { if (actions.setInbox) actions.setInbox({ kind: 'all', project: 'all', urgent: false }); })),
          li(navItem('orders', 'checklist', 'Zlecenia', '#/zlecenia', function () { if (actions.setOrders) actions.setOrders({ tab: 'mine' }); }))
        ]),
        navGroup('work', 'Moja praca', [
          li(navItem('mywork', 'checklist', 'Moja praca', '#/moja-praca')),
          li(navItem('time', 'clock', 'Czas', '#/czas')),
          li(navItem('calendar', 'calendar', 'Kalendarz', '#/kalendarz')),
          li(navItem('leave', 'leave', 'Urlopy', '#/urlopy', function () { if (actions.setLeave) actions.setLeave({ who: 'me' }); }))
        ]),
        navGroup('projects', 'Projekty', [
          li((function () { var l = navItem('projects', 'folder', 'Projekty', '#/projekty'); l.insertBefore(nodes.alarm, l.lastChild); return l; })()),
          li(navItem('plan', 'columns', 'Plan', '#/plan'), 'nav__plan'),
          li(navItem('review', 'flag', 'Przegląd', '#/przeglad'), 'nav__review')
        ]),
        navGroup('finance', 'Finanse', [
          li(soonItem('fin-budgets', 'database', 'Budżety')),
          li(soonItem('fin-costs', 'hours', 'Koszty')),
          li(soonItem('fin-profit', 'award', 'Rentowność')),
          li(navItem('analysis', 'chart', 'Analiza', '#/analiza'))
        ]),
        navGroup('team', 'Zespół', [
          li(navItem('team', 'people', 'Zespół', '#/zespol', function () { if (actions.setTeamTab) actions.setTeamTab('board'); }))
        ]),
        navGroup('comms', 'Komunikacja', [
          li(navItem('feed', 'sparkle', 'Aktualności', '#/aktualnosci')),
          li(soonItem('messages', 'mail', 'Wiadomości'))
        ]),
        navGroup('resources', 'Zasoby', [
          li(navItem('library', 'layers', 'Biblioteka', '#/biblioteka')),
          li(soonItem('documents', 'list', 'Dokumenty')),
          li(soonItem('offices', 'pin', 'Urzędy i kontrahenci'))
        ]),
        nodes.pinnedSection,
        nodes.recentSection,
        navGroup('admin', null, [
          li(navItem('admin', 'settings', 'Administracja', '#/zespol', function () { if (actions.setTeamTab) actions.setTeamTab('accounts'); }))
        ])
      ]),
      D.el('div', { class: 'sidebar__foot' }, [
        nodes.save,
        UI.iconButton({ icon: 'keyboard', label: 'Skróty klawiszowe', kbd: '?', size: 'sm', onClick: actions.showShortcuts }),
        UI.iconButton({ icon: 'sidebar', label: 'Zwiń panel', kbd: '[', size: 'sm', class: 'sidebar__collapse', attrs: { id: 'action-collapse' }, onClick: actions.toggleSidebar })
      ])
    ]);
  }

  function projectLink(project, route, now) {
    var state = Insight.health(project, now);
    return D.el('li', null, [D.el('a', {
      class: 'nav__item nav__item--project',
      attrs: {
        href: E.ProjectList.projectHref(project),
        'aria-current': route.name === 'project' && route.projectId === project.id ? 'page' : null,
        'data-tooltip': project.code + ' — ' + state.label
      },
      style: E.Identity.hueStyle(project.code)
    }, [
      Sig.datum(state.level, { label: false }),
      D.el('span', { class: 'nav__label', text: project.name })
    ])]);
  }

  function crumbs(state, project) {
    var route = state.route;
    if (route.name === 'dashboard') return [{ label: 'Pulpit' }];
    if (route.name === 'team') return [{ label: 'Zespół' }];
    if (route.name === 'library') return [{ label: 'Biblioteka' }];
    if (route.name === 'plan') return [{ label: 'Plan' }];
    if (route.name === 'calendar') return [{ label: 'Kalendarz' }];
    if (route.name === 'leave') return [{ label: 'Urlopy' }];
    if (route.name === 'orders') return [{ label: 'Zlecenia' }];
    if (route.name === 'review') return [{ label: 'Przegląd' }];
    if (route.name === 'feed') return [{ label: 'Aktualności' }];
    if (route.name === 'analysis') return [{ label: 'Analiza' }];
    if (route.name === 'time') return [{ label: 'Czas' }];
    if (route.name === 'mywork') return [{ label: 'Moja praca' }];
    if (route.name === 'inbox') return [{ label: 'Skrzynka' }];
    if (route.name === 'settings') return [{ label: 'Ustawienia' }];
    if (route.name === 'project') return [{ label: 'Projekty', href: '#/projekty' }, { label: project ? project.name : 'Nie znaleziono' }];
    return [{ label: 'Projekty' }];
  }

  function render(state, project) {
    var route = state.route;
    var screens = { settings: 'settings', orders: 'orders', dashboard: 'dashboard', leave: 'leave', calendar: 'calendar', review: 'review', plan: 'plan', library: 'library', team: 'team', mywork: 'mywork', inbox: 'inbox', time: 'time', feed: 'feed', analysis: 'analysis' };
    var section = screens[route.name] || 'projects';
    var people = state.workspace.people || [];
    var meNow = E.Team.findPerson(people, state.prefs.me);
    var projects = state.workspace.projects;
    var management = !!meNow && E.Budget.isManagement(meNow.id, people);
    var leads = !!meNow && projects.some(function (p) { return p.team && p.team.leader === meNow.id && p.status !== 'done'; });
    var may = management || leads;
    Object.keys(nodes.nav).forEach(function (key) {
      var here = key === section || (key === 'admin' && section === 'team' && management && state.teamTab === 'accounts');
      if (section === 'team' && key === 'team') here = !(management && state.teamTab === 'accounts');
      if (key === 'admin' && section !== 'team') here = false;
      var current = here ? (route.name === 'project' ? 'true' : 'page') : null;
      if (current) nodes.nav[key].setAttribute('aria-current', current);
      else nodes.nav[key].removeAttribute('aria-current');
    });
    function show(key, on) { var n = nodes.nav[key]; if (n && n.parentNode) n.parentNode.hidden = !on; }
    ['fin-budgets', 'fin-costs', 'fin-profit', 'messages', 'documents', 'offices'].forEach(function (k) { show(k, management); });
    show('analysis', management);
    show('plan', may);
    show('review', may);
    show('admin', management);
    Object.keys(nodes.groups).forEach(function (k) {
      var box = nodes.groups[k];
      var visible = Array.prototype.some.call(box.querySelectorAll('ul > li'), function (x) { return !x.hidden; });
      box.hidden = !visible;
    });
    nodes.counts.projects.textContent = String(projects.length);
    if (nodes.counts.library) nodes.counts.library.hidden = true;
    if (nodes.counts.plan) nodes.counts.plan.hidden = true;
    if (nodes.counts.calendar) nodes.counts.calendar.hidden = true;
    var pendingLeave = E.LeaveScreen ? E.LeaveScreen.badgeFor(state, meNow) : 0;
    if (nodes.counts.leave) {
      nodes.counts.leave.hidden = !pendingLeave;
      nodes.counts.leave.textContent = String(pendingLeave);
      nodes.counts.leave.classList.toggle('count--alarm', !!pendingLeave);
    }
    ['dashboard', 'admin', 'review'].forEach(function (k) { if (nodes.counts[k]) nodes.counts[k].hidden = true; });
    nodes.counts.team.textContent = String((state.workspace.people || []).filter(function (p) { return p.active !== false; }).length);

    var now = new Date();
    var box = E.MyWork.count(state, now);
    nodes.counts.mywork.textContent = box ? String(box.total) : '';
    nodes.counts.mywork.classList.toggle('count--alarm', !!(box && box.overdue));
    if (nodes.counts.inbox) {
      var inboxBox = E.InboxScreen.count(state, now);
      var reactN = inboxBox ? inboxBox.total : 0;
      nodes.counts.inbox.hidden = !reactN;
      nodes.counts.inbox.textContent = String(reactN);
      nodes.counts.inbox.classList.toggle('count--alarm', !!reactN);
    }
    if (nodes.counts.orders) {
      var ordN = E.Orders ? E.Orders.openCount(state.workspace.orders || [], state.prefs.me) : 0;
      nodes.counts.orders.hidden = !ordN;
      nodes.counts.orders.textContent = String(ordN);
      nodes.counts.orders.classList.toggle('count--alarm', !!ordN);
    }
    nodes.counts.feed.textContent = '';
    nodes.counts.analysis.textContent = '';
    nodes.counts.time.textContent = '';
    var alarms = projects.filter(function (p) { return Insight.health(p, now).level === 'alarm'; }).length;
    nodes.alarm.hidden = !alarms;
    D.render(nodes.alarm, alarms ? [Sig.datum('alarm', { size: 12, label: false }), D.el('span', { text: String(alarms) })] : []);
    nodes.alarm.setAttribute('aria-label', alarms ? 'w stanie alarmowym: ' + alarms : '');

    var byId = {};
    projects.forEach(function (p) { byId[p.id] = p; });
    var pinned = state.prefs.pinned.map(function (id) { return byId[id]; }).filter(Boolean);
    var recent = state.prefs.recent.filter(function (id) { return state.prefs.pinned.indexOf(id) < 0; })
      .map(function (id) { return byId[id]; }).filter(Boolean).slice(0, 4);

    nodes.pinnedSection.hidden = !pinned.length;
    nodes.recentSection.hidden = !recent.length;
    D.render(nodes.pinned, pinned.map(function (p) { return projectLink(p, route, now); }));
    D.render(nodes.recent, recent.map(function (p) { return projectLink(p, route, now); }));

    D.render(nodes.crumb, [UI.breadcrumb(crumbs(state, project))]);
  }

  function setSaved(ok, animate) {
    nodes.save.className = 'save-state' + (ok ? '' : ' save-state--error');
    nodes.save.setAttribute('data-tooltip', ok
      ? 'Każda zmiana zapisuje się od razu w tej przeglądarce'
      : 'Przeglądarka nie pozwala zapisać danych. Pobierz kopię zapasową, żeby ich nie stracić.');
    var icon = ok
      ? D.svg('svg', { viewBox: '0 0 24 24', width: '15', height: '15', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [
          D.svg('path', { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z' }),
          D.svg('path', { d: 'm8 12.3 2.8 2.7 5.2-5.5', class: 'check-path' })
        ])
      : Icons.icon('cloudOff', 15);
    D.render(nodes.save, [icon, D.el('span', { text: ok ? 'Zapisano lokalnie' : 'Zapis niedostępny' })]);
    if (ok && animate) {
      void nodes.save.offsetWidth;
      nodes.save.classList.add('is-saved');
    }
  }

  root.ETROM.Shell = { build: build, render: render, setSaved: setSaved, PALETTES: PALETTES, ACCENTS: ACCENTS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
