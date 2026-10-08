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
  var LOOK_DEFAULTS = { palette: 'ocean', hdr: true, tilesFull: false, colorBy: 'number', vivid: 100, contrast: 50 };

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

    var density = UI.segmented({
      label: 'Gęstość',
      value: prefs.density || 'comfortable',
      items: [{ value: 'comfortable', label: 'Komfortowa' }, { value: 'compact', label: 'Zwarta' }],
      onChange: function (value) { actions.setPref({ density: value }); density.set(value); }
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

    // ---- Wygląd: motyw kolorystyczny, HDR, intensywność i kontrast ----
    var look = { palette: prefs.palette, hdr: prefs.hdr, vivid: prefs.vivid, contrast: prefs.contrast, tilesFull: prefs.tilesFull, colorBy: prefs.colorBy };
    var palButtons = PALETTES.map(function (pal) {
      return D.el('button', {
        class: 'pal-swatch',
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(look.palette === pal.value), 'aria-label': 'Motyw kolorystyczny: ' + pal.label, 'data-tooltip': pal.label, 'data-fk': 'palette-' + pal.value },
        style: { '--pa': pal.a, '--pb': pal.b },
        dataset: { value: pal.value },
        on: { click: function () { look.palette = pal.value; actions.setPref({ palette: pal.value }); syncLook(); } }
      });
    });
    var hdrSwitch = UI.switchControl({
      id: 'look-hdr', label: 'HDR', checked: look.hdr,
      attrs: { 'data-fk': 'look-hdr', 'aria-describedby': 'look-hdr-hint' },
      onChange: function (on) { look.hdr = on; actions.setPref({ hdr: on }); syncLook(); }
    });
    var tilesSwitch = UI.switchControl({
      id: 'look-tiles', label: 'Kafle z połyskiem', checked: !!look.tilesFull,
      attrs: { 'data-fk': 'look-tiles', 'aria-describedby': 'look-tiles-hint' },
      onChange: function (on) { look.tilesFull = on; actions.setPref({ tilesFull: on }); syncLook(); }
    });
    function slider(o) {
      var out = D.el('output', { class: 'look-slider__val t-num', attrs: { for: o.id } });
      var input = D.el('input', {
        class: 'look-slider__input', attrs: { id: o.id, type: 'range', min: String(o.min), max: String(o.max), step: '1', 'data-fk': o.id, 'aria-label': o.label },
        on: {
          input: function () { o.set(Number(input.value)); out.textContent = o.format(Number(input.value)); actions.previewLook(look); },
          change: function () { actions.setPref(o.patch(Number(input.value))); }
        }
      });
      input.value = String(o.get());
      out.textContent = o.format(o.get());
      return { node: D.el('div', { class: 'look-slider' }, [D.el('label', { class: 'settings__label', attrs: { for: o.id }, text: o.label }), input, out]), input: input, out: out, o: o };
    }
    var vividSlider = slider({
      id: 'look-vivid', label: 'Intensywność kolorów', min: 40, max: 150,
      get: function () { return look.vivid; }, set: function (v) { look.vivid = v; },
      format: function (v) { return v + '%'; }, patch: function (v) { return { vivid: v }; }
    });
    var contrastSlider = slider({
      id: 'look-contrast', label: 'Kontrast', min: 0, max: 100,
      get: function () { return look.contrast; }, set: function (v) { look.contrast = v; },
      format: function (v) { return v === 50 ? 'standard' : (v > 50 ? '+' + (v - 50) : String(v - 50)); }, patch: function (v) { return { contrast: v }; }
    });
    function syncLook() {
      palButtons.forEach(function (btn) { btn.setAttribute('aria-checked', String(btn.dataset.value === look.palette)); });
      hdrSwitch.input.checked = !!look.hdr;
      tilesSwitch.input.checked = !!look.tilesFull;
      [vividSlider, contrastSlider].forEach(function (sl) { sl.input.value = String(sl.o.get()); sl.out.textContent = sl.o.format(sl.o.get()); });
      actions.previewLook(look);
    }
    var resetLook = D.el('button', {
      class: 'link-btn', text: 'Przywróć domyślny wygląd', attrs: { type: 'button', 'data-fk': 'look-reset' },
      on: { click: function () { look = Object.assign({}, LOOK_DEFAULTS); actions.setPref(look); syncLook(); } }
    });

    var targetOptions = [240, 300, 360, 420, 450, 480, 540, 600].map(function (m) { return { value: String(m), label: (Math.round(m / 6) / 10 + ' h').replace('.', ',') }; });
    var dayTarget = UI.select({ id: 'work-target', value: String(prefs.dayTarget || 480), options: targetOptions, on: { change: function () { actions.setPref({ dayTarget: Number(dayTarget.value) }); } }, attrs: { 'data-fk': 'work-target', 'aria-label': 'Cel dnia pracy' } });
    function ruleSelect(id, key, values, label, suffix) {
      var sel = UI.select({ id: id, value: String(prefs[key]), options: values.map(function (v) { return { value: String(v), label: label ? label(v) : v + suffix }; }), on: { change: function () { var patch = {}; patch[key] = sel.value; if (key !== 'progressMethod') patch[key] = Number(sel.value); actions.setPref(patch); } }, attrs: { 'data-fk': id, 'aria-label': id } });
      return sel;
    }
    var progressMethod = ruleSelect('rule-method', 'progressMethod', ['auto', 'status', 'done'], function (v) { return { auto: 'Z zadań (zalecane)', status: 'Tylko ze statusu etapu', done: 'Tylko etapy zakończone' }[v]; });
    var workingWeight = ruleSelect('rule-weight', 'workingWeight', [0, 10, 25, 30, 40, 50, 60, 75, 90], null, '%');
    var forecastWarn = ruleSelect('rule-warn', 'forecastWarn', [5, 10, 15, 20], null, '%');
    var forecastAlarm = ruleSelect('rule-alarm', 'forecastAlarm', [15, 20, 25, 30, 40, 50], null, '%');
    var reservePct = ruleSelect('rule-reserve', 'reservePct', [0, 10, 15, 20, 25, 30], null, '%');
    var minProgress = ruleSelect('rule-min', 'minProgress', [0, 5, 10, 15, 20, 30], null, '%');
    var endOptions = [];
    for (var m = 15 * 60; m <= 21 * 60; m += 30) endOptions.push({ value: String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'), label: String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') });
    var dayEnd = UI.select({ id: 'work-end', value: prefs.dayEnd || '17:00', options: endOptions, on: { change: function () { actions.setPref({ dayEnd: dayEnd.value }); } }, attrs: { 'data-fk': 'work-end', 'aria-label': 'Koniec dnia pracy' } });

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
      D.el('div', { class: 'settings__row' }, [
        D.el('span', { class: 'settings__label', text: 'Kolor pracy w toku', attrs: { id: 'accent-label' } }),
        D.el('div', { class: 'accent-swatches', attrs: { role: 'radiogroup', 'aria-labelledby': 'accent-label' } }, swatches)
      ]),
      D.el('div', { class: 'menu__separator' }),
      D.el('p', { class: 'settings__group', text: 'Czas pracy' }),
      D.el('div', { class: 'settings__row' }, [D.el('label', { class: 'settings__label', attrs: { for: 'work-target' }, text: 'Cel dnia' }), dayTarget]),
      D.el('div', { class: 'settings__row' }, [D.el('label', { class: 'settings__label', attrs: { for: 'work-end' }, text: 'Koniec dnia pracy' }), dayEnd, D.el('span', { class: 'settings__hint', text: 'po nim zapytam o niezatrzymany zegar' })]),
      D.el('div', { class: 'menu__separator' }),
      D.el('p', { class: 'settings__group', text: 'Budżet i postęp' }),
      D.el('div', { class: 'settings__row' }, [D.el('label', { class: 'settings__label', attrs: { for: 'rule-method' }, text: 'Liczenie postępu' }), progressMethod, D.el('span', { class: 'settings__hint', text: 'etap w toku liczy się wg godzin oszacowanych zadań, a bez nich wg liczby zadań' })]),
      D.el('div', { class: 'settings__row' }, [D.el('label', { class: 'settings__label', attrs: { for: 'rule-weight' }, text: 'Waga etapu „w toku” bez zadań' }), workingWeight]),
      D.el('div', { class: 'settings__row' }, [D.el('label', { class: 'settings__label', attrs: { for: 'rule-warn' }, text: 'Uwaga od przekroczenia' }), forecastWarn, D.el('span', { class: 'settings__hint', text: 'prognoza godzin wobec budżetu' })]),
      D.el('div', { class: 'settings__row' }, [D.el('label', { class: 'settings__label', attrs: { for: 'rule-alarm' }, text: 'Alarm od przekroczenia' }), forecastAlarm]),
      D.el('div', { class: 'settings__row' }, [D.el('label', { class: 'settings__label', attrs: { for: 'rule-reserve' }, text: 'Rezerwa postępowań' }), reservePct, D.el('span', { class: 'settings__hint', text: 'część budżetu etapu-postępowania na uzupełnienia; dzień roboczy = Cel dnia' })]),
      D.el('div', { class: 'settings__row' }, [D.el('label', { class: 'settings__label', attrs: { for: 'rule-min' }, text: 'Prognoza od postępu' }), minProgress, D.el('span', { class: 'settings__hint', text: 'wcześniej wynik byłby zgadywaniem' })]),
      D.el('div', { class: 'menu__separator' }),
      D.el('p', { class: 'settings__group', text: 'Wygląd' }),
      D.el('div', { class: 'settings__row' }, [
        D.el('span', { class: 'settings__label', text: 'Motyw kolorystyczny', attrs: { id: 'palette-label' } }),
        D.el('div', { class: 'pal-swatches', attrs: { role: 'radiogroup', 'aria-labelledby': 'palette-label' } }, palButtons)
      ]),
      D.el('div', { class: 'settings__row' }, [hdrSwitch.node, D.el('span', { class: 'settings__hint', attrs: { id: 'look-hdr-hint' }, text: 'połysk, poświata i szersza gama barw' })]),
      D.el('div', { class: 'settings__row' }, [tilesSwitch.node, D.el('span', { class: 'settings__hint', attrs: { id: 'look-tiles-hint' }, text: 'domyślnie jednolity kolor, bez połysku i cieniowania' })]),
      vividSlider.node,
      contrastSlider.node,
      D.el('div', { class: 'settings__row' }, [resetLook]),
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
        D.el('ul', { class: 'nav' }, [
          D.el('li', null, [navItem('mywork', 'checklist', 'Moja praca', '#/moja-praca')]),
          D.el('li', null, [navItem('time', 'clock', 'Czas', '#/czas')]),
          D.el('li', null, [navItem('calendar', 'calendar', 'Kalendarz', '#/kalendarz')]),
          D.el('li', { class: 'nav__plan' }, [navItem('plan', 'columns', 'Plan', '#/plan')]),
          D.el('li', { class: 'nav__review' }, [navItem('review', 'flag', 'Przegląd', '#/przeglad')]),
          D.el('li', null, [navItem('feed', 'sparkle', 'Aktualności', '#/aktualnosci')]),
          D.el('li', null, [navItem('analysis', 'chart', 'Analiza', '#/analiza')]),
          D.el('li', null, [(function () { var l = navItem('projects', 'folder', 'Projekty', '#/projekty'); l.insertBefore(nodes.alarm, l.lastChild); return l; })()]),
          D.el('li', null, [navItem('team', 'people', 'Zespół', '#/zespol')]),
          D.el('li', null, [navItem('library', 'layers', 'Biblioteka', '#/biblioteka')])
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
      },
      style: E.Identity.hueStyle(project.code)
    }, [
      Sig.datum(state.level, { label: false }),
      D.el('span', { class: 'nav__label', text: project.name })
    ])]);
  }

  function crumbs(state, project) {
    var route = state.route;
    if (route.name === 'team') return [{ label: 'Zespół' }];
    if (route.name === 'library') return [{ label: 'Biblioteka' }];
    if (route.name === 'plan') return [{ label: 'Plan' }];
    if (route.name === 'calendar') return [{ label: 'Kalendarz' }];
    if (route.name === 'review') return [{ label: 'Przegląd' }];
    if (route.name === 'feed') return [{ label: 'Aktualności' }];
    if (route.name === 'analysis') return [{ label: 'Analiza' }];
    if (route.name === 'time') return [{ label: 'Czas' }];
    if (route.name === 'mywork') return [{ label: 'Moja praca' }];
    if (route.name === 'project') return [{ label: 'Projekty', href: '#/projekty' }, { label: project ? project.name : 'Nie znaleziono' }];
    return [{ label: 'Projekty' }];
  }

  function render(state, project) {
    var route = state.route;
    var section = route.name === 'calendar' ? 'calendar' : route.name === 'review' ? 'review' : route.name === 'plan' ? 'plan' : route.name === 'library' ? 'library' : route.name === 'team' ? 'team' : (route.name === 'mywork' ? 'mywork' : (route.name === 'time' ? 'time' : ((route.name === 'feed' ? 'feed' : (route.name === 'analysis' ? 'analysis' : 'projects')))));
    Object.keys(nodes.nav).forEach(function (key) {
      var current = key === section ? (route.name === 'project' ? 'true' : 'page') : null;
      if (current) nodes.nav[key].setAttribute('aria-current', current);
      else nodes.nav[key].removeAttribute('aria-current');
    });
    var projects = state.workspace.projects;
    nodes.counts.projects.textContent = String(projects.length);
    if (nodes.counts.library) nodes.counts.library.hidden = true;
    if (nodes.counts.plan) nodes.counts.plan.hidden = true;
    if (nodes.counts.calendar) nodes.counts.calendar.hidden = true;
    if (nodes.counts.review) nodes.counts.review.hidden = true;
    (function () {
      var meNow = E.Team.findPerson(state.workspace.people || [], state.prefs.me);
      var may = !!meNow && (E.Budget.isManagement(meNow.id, state.workspace.people || []) || projects.some(function (p) { return p.team && p.team.leader === meNow.id && p.status !== 'done'; }));
      if (nodes.nav.plan && nodes.nav.plan.parentNode) nodes.nav.plan.parentNode.hidden = !may;
      if (nodes.nav.review && nodes.nav.review.parentNode) nodes.nav.review.parentNode.hidden = !may;
    })();
    nodes.counts.team.textContent = String((state.workspace.people || []).filter(function (p) { return p.active !== false; }).length);

    var now = new Date();
    var box = E.MyWork.count(state, now);
    nodes.counts.mywork.textContent = box ? String(box.total) : '';
    nodes.counts.mywork.classList.toggle('count--alarm', !!(box && (box.overdue || box.urgent)));
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

  root.ETROM.Shell = { build: build, render: render, setSaved: setSaved };
})(typeof globalThis !== 'undefined' ? globalThis : this);
