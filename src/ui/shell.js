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
    { value: 'standard', label: 'Stal', color: '#2C7CA0' },
    { value: 'graphite', label: 'Grafit', color: '#3E4B49' },
    { value: 'raspberry', label: 'Malina', color: '#B4245F' }
  ];

  /** Logo ETROM: warstwa barwna + napis w kolorze tekstu (działa w obu motywach). */
  function logo(markOnly) {
    return D.el('span', { class: 'logo' + (markOnly ? ' logo--mark' : ''), attrs: { 'aria-hidden': 'true' } }, [
      D.el('span', { class: 'logo__color' }), D.el('span', { class: 'logo__ink' })
    ]);
  }

  function navItem(screen, icon, label, href) {
    var count = D.el('span', { class: 'count nav__count', text: '0' });
    var link = D.el('a', {
      class: 'nav__item',
      attrs: { href: href, 'data-tooltip': label },
      dataset: { screen: screen }
    }, [Icons.icon(icon), D.el('span', { class: 'nav__label', text: label }), count]);
    nodes.nav[screen] = link;
    nodes.counts[screen] = count;
    return link;
  }

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

    var swatches = ACCENTS.map(function (accent) {
      return D.el('button', {
        class: 'accent-swatch',
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(prefs.accent === accent.value), 'aria-label': 'Kolor bieżącej pracy: ' + accent.label, 'data-tooltip': accent.label },
        style: { '--swatch': accent.color },
        dataset: { value: accent.value },
        on: {
          click: function () {
            actions.setPref({ accent: accent.value });
            swatches.forEach(function (btn) { btn.setAttribute('aria-checked', String(btn.dataset.value === accent.value)); });
          }
        }
      });
    });

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
      D.el('div', { class: 'settings__row' }, [
        D.el('span', { class: 'settings__label', text: 'Kolor pracy w toku', attrs: { id: 'accent-label' } }),
        D.el('div', { class: 'accent-swatches', attrs: { role: 'radiogroup', 'aria-labelledby': 'accent-label' } }, swatches)
      ]),
      D.el('div', { class: 'menu__separator' }),
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
      Menu.open({ anchor: workspace, label: 'Ustawienia i dane', content: settingsPanel(getState()), minWidth: '18rem' });
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
        D.el('ul', { class: 'nav' }, [
          D.el('li', null, [(function () { var l = navItem('projects', 'folder', 'Projekty', '#/projekty'); l.insertBefore(nodes.alarm, l.lastChild); return l; })()]),
          D.el('li', null, [navItem('team', 'people', 'Zespół', '#/zespol')])
        ]),
        nodes.pinnedSection,
        nodes.recentSection
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
      }
    }, [
      Sig.datum(state.level, { label: false }),
      D.el('span', { class: 'nav__label', text: project.name })
    ])]);
  }

  function crumbs(state, project) {
    var route = state.route;
    if (route.name === 'team') return [{ label: 'Zespół' }];
    if (route.name === 'project') return [{ label: 'Projekty', href: '#/projekty' }, { label: project ? project.name : 'Nie znaleziono' }];
    return [{ label: 'Projekty' }];
  }

  function render(state, project) {
    var route = state.route;
    var section = route.name === 'team' ? 'team' : 'projects';
    Object.keys(nodes.nav).forEach(function (key) {
      var current = key === section ? (route.name === 'project' ? 'true' : 'page') : null;
      if (current) nodes.nav[key].setAttribute('aria-current', current);
      else nodes.nav[key].removeAttribute('aria-current');
    });
    var projects = state.workspace.projects;
    nodes.counts.projects.textContent = String(projects.length);
    nodes.counts.team.textContent = String((state.workspace.people || []).filter(function (p) { return p.active !== false; }).length);

    var now = new Date();
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

  root.ETROM.Shell = { build: build, render: render, setSaved: setSaved };
})(typeof globalThis !== 'undefined' ? globalThis : this);
