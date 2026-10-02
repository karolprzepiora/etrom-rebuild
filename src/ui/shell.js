/* ETROM — szkielet aplikacji: panel boczny, pasek górny, ustawienia.
   Panel boczny jest nawigacją i niczym więcej: sekcje, skróty do projektów
   w realizacji, wyszukiwanie. Ustawienia i operacje na danych mieszkają
   w jednym menu „Ustawienia”, a nie w pasku górnym obok nawigacji. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Icons = E.Icons;
  var Progress = E.Progress;
  var Query = E.Query;

  var MAX_PINNED = 7;
  var nodes = {};
  var actions = null;

  var ACCENTS = [
    { value: 'standard', label: 'Malinowy ETROM', color: '#c0266a' },
    { value: 'hydro', label: 'Morski', color: '#0b7069' },
    { value: 'graphite', label: 'Grafitowy', color: '#2a2f36' }
  ];

  function navItem(screen, icon, label, href) {
    var count = D.el('span', { class: 'count nav__count', text: '0' });
    var link = D.el('a', {
      class: 'nav__item',
      attrs: { href: href },
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

    var accentButtons = ACCENTS.map(function (accent) {
      return D.el('button', {
        class: 'accent-swatch',
        attrs: {
          type: 'button', role: 'radio',
          'aria-checked': String(prefs.accent === accent.value),
          'aria-label': 'Akcent: ' + accent.label,
          'data-tooltip': accent.label
        },
        style: { '--swatch': accent.color },
        on: {
          click: function () {
            actions.setPref({ accent: accent.value });
            accentButtons.forEach(function (btn) { btn.setAttribute('aria-checked', String(btn === this)); }, this);
          }
        }
      });
    });

    function dataItem(label, icon, run, tone) {
      return D.el('button', {
        class: 'menu__item' + (tone === 'danger' ? ' menu__item--danger' : ''),
        attrs: { type: 'button' },
        on: { click: function () { Menu.close({ restoreFocus: false }); run(); } }
      }, [Icons.icon(icon), D.el('span', { class: 'menu__label', text: label })]);
    }

    return D.el('div', { class: 'settings' }, [
      D.el('div', { class: 'settings__row' }, [D.el('span', { class: 'settings__label', text: 'Motyw' }), theme.node]),
      D.el('div', { class: 'settings__row' }, [
        D.el('span', { class: 'settings__label', text: 'Akcent', attrs: { id: 'accent-label' } }),
        D.el('div', { class: 'accent-swatches', attrs: { role: 'radiogroup', 'aria-labelledby': 'accent-label' } }, accentButtons)
      ]),
      D.el('div', { class: 'menu__separator' }),
      D.el('p', { class: 'menu__group', text: 'Dane' }),
      dataItem('Dodaj dane przykładowe', 'sparkle', actions.loadDemo),
      dataItem('Pobierz kopię zapasową', 'download', actions.exportJson),
      dataItem('Wczytaj kopię zapasową…', 'upload', actions.importJson),
      D.el('div', { class: 'menu__separator' }),
      dataItem('Usuń wszystkie dane…', 'trash', actions.clearAll, 'danger'),
      D.el('p', { class: 'menu__note', text: 'Dane zapisują się w tej przeglądarce. Przed zmianą komputera pobierz kopię zapasową.' })
    ]);
  }

  /** Buduje szkielet raz. Dalej tylko render(state) aktualizuje stan. */
  function build(options) {
    actions = options.actions;
    nodes.sidebar = options.sidebar;
    nodes.crumb = options.crumb;
    nodes.save = options.save;
    nodes.nav = {};
    nodes.counts = {};
    nodes.pinned = D.el('ul', { class: 'nav nav--projects' });
    nodes.pinnedSection = D.el('div', { class: 'sidebar__section' }, [
      D.el('p', { class: 'sidebar__label', text: 'W realizacji', attrs: { id: 'pinned-label' } }),
      nodes.pinned
    ]);
    nodes.pinned.setAttribute('aria-labelledby', 'pinned-label');

    var search = D.el('button', {
      class: 'sidebar__search',
      attrs: { type: 'button', id: 'action-search', 'aria-keyshortcuts': 'Control+K' },
      on: { click: actions.openPalette }
    }, [Icons.icon('search'), D.el('span', { class: 'grow', text: 'Szukaj' }), UI.kbd('Ctrl K')]);

    var settings = D.el('button', {
      class: 'nav__item sidebar__settings',
      attrs: { type: 'button', id: 'action-settings' }
    }, [Icons.icon('settings'), D.el('span', { class: 'nav__label', text: 'Ustawienia i dane' })]);
    settings.setAttribute('aria-haspopup', 'dialog');
    settings.setAttribute('aria-expanded', 'false');
    settings.addEventListener('click', function () {
      Menu.open({
        anchor: settings, label: 'Ustawienia i dane', side: 'top',
        content: settingsPanel(options.getState()), minWidth: '17rem'
      });
    });

    D.render(nodes.sidebar, [
      D.el('div', { class: 'sidebar__brand' }, [
        D.el('span', { class: 'brand-mark', text: 'E', attrs: { 'aria-hidden': 'true' } }),
        D.el('span', { class: 'brand-text' }, [
          D.el('span', { class: 'brand-name', text: 'ETROM' }),
          D.el('span', { class: 'brand-sub', text: 'Biuro projektowe' })
        ]),
        UI.iconButton({ icon: 'close', label: 'Zamknij nawigację', class: 'sidebar__close', onClick: actions.closeNav })
      ]),
      search,
      D.el('nav', { class: 'sidebar__nav', attrs: { 'aria-label': 'Główna' } }, [
        D.el('ul', { class: 'nav' }, [
          D.el('li', null, [navItem('projects', 'folder', 'Projekty', '#/projekty')]),
          D.el('li', null, [navItem('team', 'people', 'Zespół', '#/zespol')])
        ]),
        nodes.pinnedSection
      ]),
      D.el('div', { class: 'sidebar__foot' }, [settings])
    ]);
  }

  function crumbs(state, project) {
    var route = state.route;
    if (route.name === 'team') return [{ label: 'Zespół' }];
    if (route.name === 'project') {
      return [{ label: 'Projekty', href: '#/projekty' }, { label: project ? project.code + ' · ' + project.name : 'Nie znaleziono' }];
    }
    return [{ label: 'Projekty' }];
  }

  function render(state, project) {
    var route = state.route;
    var section = route.name === 'team' ? 'team' : 'projects';
    Object.keys(nodes.nav).forEach(function (key) {
      // Lista projektów jest „bieżąca” tylko na samej liście; w szczegółach to ścieżka nadrzędna.
      var current = key === section ? (route.name === 'project' ? 'true' : 'page') : null;
      if (current) nodes.nav[key].setAttribute('aria-current', current);
      else nodes.nav[key].removeAttribute('aria-current');
    });
    nodes.counts.projects.textContent = String(state.workspace.projects.length);
    nodes.counts.team.textContent = String((state.workspace.people || []).filter(function (p) { return p.active !== false; }).length);

    var running = Query.filterAndSort(state.workspace.projects, { status: 'active', sort: 'deadline' }).slice(0, MAX_PINNED);
    nodes.pinnedSection.hidden = !running.length;
    var signature = running.map(function (p) { return p.id + p.name + Progress.isOverdue(p); }).join('|') + '#' + (route.projectId || '');
    if (signature !== nodes.pinnedSignature) {
      nodes.pinnedSignature = signature;
      D.render(nodes.pinned, running.map(function (p) {
        var overdue = Progress.isOverdue(p);
        return D.el('li', null, [D.el('a', {
          class: 'nav__item nav__item--project',
          attrs: {
            href: E.ProjectList.projectHref(p),
            'aria-current': route.name === 'project' && route.projectId === p.id ? 'page' : null
          }
        }, [
          UI.swatch(p.code),
          D.el('span', { class: 'nav__label', text: p.name }),
          overdue ? D.el('span', { class: 'nav__alert', attrs: { 'data-tooltip': 'Po terminie umowy', 'aria-label': 'po terminie' } }, [Icons.icon('alertCircle', 14)]) : null
        ])]);
      }));
    }

    D.render(nodes.crumb, [UI.breadcrumb(crumbs(state, project))]);
  }

  function setSaved(ok) {
    nodes.save.className = 'save-state' + (ok ? '' : ' save-state--error');
    nodes.save.setAttribute('data-tooltip', ok
      ? 'Zmiany zapisują się od razu w tej przeglądarce'
      : 'Przeglądarka nie pozwala zapisać danych. Pobierz kopię zapasową, żeby ich nie stracić.');
    D.render(nodes.save, [Icons.icon(ok ? 'cloudCheck' : 'cloudOff'), D.el('span', { text: ok ? 'Zapisano' : 'Zapis niedostępny' })]);
  }

  root.ETROM.Shell = { build: build, render: render, setSaved: setSaved };
})(typeof globalThis !== 'undefined' ? globalThis : this);
