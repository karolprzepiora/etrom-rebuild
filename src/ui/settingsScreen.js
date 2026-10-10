/* ETROM — ekran „Ustawienia”: osobna strona z listą sekcji zamiast długiego menu.
   Sekcje: Wygląd, Czas pracy, Skróty (moje) · Budżet i postęp, Kalendarz i urlopy (zasady firmy) · Dane.
   Ustawienia zapisują się od razu; wygląd widać na żywo w całej aplikacji. Ekran niczego nie liczy
   poza podglądem skutków progów budżetu (Analysis.impactOf). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Prefs = E.Prefs;

  var SECTIONS = [
    { id: 'look', group: 'Moje', label: 'Wygląd', icon: 'sparkle' },
    { id: 'time', group: 'Moje', label: 'Czas pracy', icon: 'clock' },
    { id: 'keys', group: 'Moje', label: 'Skróty klawiszowe', icon: 'keyboard' },
    { id: 'budget', group: 'Zasady firmy', label: 'Budżet i postęp', icon: 'chart' },
    { id: 'leave', group: 'Zasady firmy', label: 'Kalendarz i urlopy', icon: 'calendar', management: true },
    { id: 'data', group: 'Dane', label: 'Kopia zapasowa i dane', icon: 'download' }
  ];
  var DEFAULT_SECTION = 'look';

  var LOOK_DEFAULTS = { look: 'etrom', oledGuard: false, palette: 'ocean', hdr: true, tilesFull: false, colorBy: 'number', vivid: 100, contrast: 50 };

  function sectionsFor(management) {
    return SECTIONS.filter(function (s) { return !s.management || management; });
  }

  function card(title, children, hint) {
    return D.el('section', { class: 'set-card' }, [
      title ? D.el('h2', { class: 'set-card__title', text: title }) : null,
      hint ? D.el('p', { class: 'set-card__hint', text: hint }) : null
    ].concat(children));
  }

  function row(label, control, hint, forId) {
    var hintNode = hint ? D.el('span', { class: 'set-row__hint', text: hint }) : null;
    if (!label) return D.el('div', { class: 'set-row set-row--bare' }, [control, hintNode]);
    return D.el('div', { class: 'set-row' }, [
      D.el('span', { class: 'set-row__txt' }, [
        D.el(forId ? 'label' : 'span', { class: 'set-row__label', text: label, attrs: forId ? { for: forId } : {} }),
        hintNode
      ]),
      control
    ]);
  }

  function selectOf(id, value, options, onChange) {
    var sel = UI.select({
      id: id, value: String(value), options: options,
      on: { change: function () { onChange(sel.value); } },
      attrs: { 'data-fk': id }
    });
    return sel;
  }

  function percentOptions(values) {
    return values.map(function (v) { return { value: String(v), label: v + '%' }; });
  }

  /* ---------- Wygląd ---------- */

  function lookSection(state, ctx) {
    var a = ctx.actions;
    var prefs = state.prefs;
    var style = prefs.look || 'etrom';
    var forced = Prefs.schemeOf(style);
    var shell = E.Shell;

    function apply(patch) { a.setPref(patch); }

    var cards = Prefs.LOOKS.map(function (look) {
      var on = look.value === style;
      return D.el('button', {
        class: 'look-card' + (on ? ' is-on' : ''),
        attrs: { type: 'button', 'aria-pressed': String(on), 'data-fk': 'look-style-' + look.value, 'aria-label': 'Styl ' + look.label + ': ' + look.hint },
        on: { click: function () { apply({ look: look.value }); } }
      }, [
        D.el('img', { class: 'look-card__img', attrs: { src: 'assets/looks/' + look.value + '.png', alt: '', width: '300', height: '188' } }),
        D.el('span', { class: 'look-card__name', text: look.label }),
        D.el('span', { class: 'look-card__hint', text: look.hint })
      ]);
    });

    var theme = UI.segmented({
      label: 'Motyw', value: forced || prefs.theme,
      items: [{ value: 'light', label: 'Jasny', icon: 'sun' }, { value: 'dark', label: 'Ciemny', icon: 'moon' }, { value: 'system', label: 'System', icon: 'monitor' }],
      onChange: function (v) { apply({ theme: v }); }
    });
    if (forced) Object.keys(theme.buttons || {}).forEach(function (k) { theme.buttons[k].disabled = true; });

    var palettes = (shell.PALETTES || []).map(function (pal) {
      return D.el('button', {
        class: 'pal-swatch',
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(prefs.palette === pal.value), 'aria-label': 'Motyw kolorystyczny: ' + pal.label, 'data-tooltip': pal.label, 'data-fk': 'palette-' + pal.value, disabled: style !== 'aurora' },
        style: { '--pa': pal.a, '--pb': pal.b },
        on: { click: function () { apply({ palette: pal.value }); } }
      });
    });

    function slider(o) {
      var out = D.el('output', { class: 'look-slider__val t-num', attrs: { for: o.id } });
      var input = D.el('input', {
        class: 'look-slider__input', attrs: { id: o.id, type: 'range', min: String(o.min), max: String(o.max), step: '1', 'data-fk': o.id, 'aria-label': o.label },
        on: {
          input: function () { out.textContent = o.format(Number(input.value)); a.previewLook(Object.assign({}, prefs, o.patch(Number(input.value)))); },
          change: function () { apply(o.patch(Number(input.value))); }
        }
      });
      input.value = String(o.value);
      out.textContent = o.format(o.value);
      return D.el('div', { class: 'look-slider' }, [D.el('label', { class: 'settings__label', attrs: { for: o.id }, text: o.label }), input, out]);
    }

    var hdr = UI.switchControl({ id: 'look-hdr', label: 'HDR', checked: prefs.hdr, attrs: { 'data-fk': 'look-hdr' }, onChange: function (on) { apply({ hdr: on }); } });
    var tiles = UI.switchControl({ id: 'look-tiles', label: 'Motyw z połyskiem', checked: !!prefs.tilesFull, attrs: { 'data-fk': 'look-tiles' }, onChange: function (on) { apply({ tilesFull: on }); } });
    var guard = UI.switchControl({ id: 'look-oled-guard', label: 'Ochrona OLED', checked: !!prefs.oledGuard, attrs: { 'data-fk': 'look-oled-guard' }, onChange: function (on) { apply({ oledGuard: on }); } });
    var density = UI.segmented({
      label: 'Gęstość', value: prefs.density || 'comfortable',
      items: [{ value: 'comfortable', label: 'Komfortowa' }, { value: 'compact', label: 'Zwarta' }],
      onChange: function (v) { apply({ density: v }); }
    });
    var accents = (shell.ACCENTS || []).map(function (accent) {
      return D.el('button', {
        class: 'accent-swatch',
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(prefs.accent === accent.value), 'aria-label': 'Kolor bieżącej pracy: ' + accent.label, 'data-tooltip': accent.label },
        style: { '--swatch': accent.color },
        on: { click: function () { apply({ accent: accent.value }); } }
      });
    });

    return [
      card('Styl', [D.el('div', { class: 'look-cards', attrs: { role: 'group', 'aria-label': 'Styl wyglądu' } }, cards)],
        'Styl zmienia charakter całej aplikacji. Aurora ma palety kolorów, ETROM to barwy marki; OLED i Filmowy są ciemne, Papier jasny.'),
      D.el('div', { class: 'set-two' }, [
        card('Kolory', [
          row('Motyw', theme.node, forced ? 'styl ' + Prefs.LOOKS.filter(function (l) { return l.value === style; })[0].label + ' ma stały schemat' : ''),
          row('Paleta', D.el('div', { class: 'pal-swatches', attrs: { role: 'radiogroup', 'aria-label': 'Motyw kolorystyczny' } }, palettes), style !== 'aurora' ? 'palety działają w stylu Aurora' : ''),
          slider({ id: 'look-vivid', label: 'Intensywność kolorów', min: 40, max: 150, value: prefs.vivid, format: function (v) { return v + '%'; }, patch: function (v) { return { vivid: v }; } }),
          slider({ id: 'look-contrast', label: 'Kontrast', min: 0, max: 100, value: prefs.contrast, format: function (v) { return v === 50 ? 'standard' : (v > 50 ? '+' + (v - 50) : String(v - 50)); }, patch: function (v) { return { contrast: v }; } })
        ]),
        card('Ekran i efekty', [
          row('', hdr.node, 'połysk i szersza gama barw (ekrany P3 i HDR)'),
          row('', tiles.node, 'projekty z gradientem i połyskiem; wyłączone = jednolity kolor'),
          style === 'oled' ? row('', guard.node, 'przesuwa układ o kilka pikseli i przygasza ekran po 3 minutach bez ruchu') : null,
          row('Gęstość', density.node),
          row('Kolor pracy w toku', D.el('div', { class: 'accent-swatches', attrs: { role: 'radiogroup', 'aria-label': 'Kolor bieżącej pracy' } }, accents))
        ])
      ]),
      D.el('div', { class: 'set-foot' }, [D.el('button', {
        class: 'link-btn', text: 'Przywróć domyślny wygląd', attrs: { type: 'button', 'data-fk': 'look-reset' },
        on: { click: function () { apply(LOOK_DEFAULTS); } }
      })])
    ];
  }

  /* ---------- Czas pracy ---------- */

  function timeSection(state, ctx) {
    var a = ctx.actions;
    var prefs = state.prefs;
    var targets = [240, 300, 360, 420, 450, 480, 540, 600].map(function (m) { return { value: String(m), label: (Math.round(m / 6) / 10 + ' h').replace('.', ',') }; });
    var ends = [];
    for (var m = 15 * 60; m <= 21 * 60; m += 30) {
      var hh = String(Math.floor(m / 60)).padStart(2, '0');
      var mm = String(m % 60).padStart(2, '0');
      ends.push({ value: hh + ':' + mm, label: hh + ':' + mm });
    }
    return [card('Dzień pracy', [
      row('Cel dnia', selectOf('work-target', prefs.dayTarget || 480, targets, function (v) { a.setPref({ dayTarget: Number(v) }); }), 'od niego liczy się pasek dnia i bilans', 'work-target'),
      row('Koniec dnia pracy', selectOf('work-end', prefs.dayEnd || '17:00', ends, function (v) { a.setPref({ dayEnd: v }); }), 'po nim zapytam o niezatrzymany zegar', 'work-end')
    ])];
  }

  /* ---------- Skróty ---------- */

  function keysSection(state, ctx) {
    return [card('Skróty klawiszowe', [
      D.el('p', { class: 'set-note', text: 'Skróty działają na każdym ekranie. W dowolnym miejscu otworzysz tę listę klawiszem ?.' }),
      UI.button({ label: 'Pokaż skróty', variant: 'secondary', icon: 'keyboard', attrs: { 'data-fk': 'set-keys' }, onClick: function () { ctx.actions.showShortcuts(); } })
    ])];
  }

  /* ---------- Budżet i postęp ---------- */

  function impactRows(state, current) {
    var people = state.workspace.people || [];
    var me = E.Team.findPerson(people, state.prefs.me);
    if (!me || !E.Analysis || !E.Analysis.impactOf) return null;
    var sets = Prefs.BUDGET_PROFILES.map(function (p) { return { warn: p.values.forecastWarn / 100, alarm: p.values.forecastAlarm / 100 }; });
    sets.push({ warn: state.prefs.forecastWarn / 100, alarm: state.prefs.forecastAlarm / 100 });
    var res = E.Analysis.impactOf(state.workspace, me.id, new Date(), sets);
    if (!res.length || !res[0].active) return null;
    return { profiles: res.slice(0, Prefs.BUDGET_PROFILES.length), now: res[res.length - 1] };
  }

  function budgetSection(state, ctx) {
    var a = ctx.actions;
    var prefs = state.prefs;
    var profile = Prefs.profileOf(prefs);
    var cards = Prefs.BUDGET_PROFILES.map(function (p) {
      var on = p.id === profile;
      return D.el('button', {
        class: 'profile-card' + (on ? ' is-on' : ''),
        attrs: { type: 'button', 'aria-pressed': String(on), 'data-fk': 'bp-' + p.id },
        on: { click: function () { a.setPref(Prefs.profileValues(p.id)); } }
      }, [
        D.el('span', { class: 'profile-card__name', text: p.label }),
        D.el('span', { class: 'profile-card__hint', text: 'Uwaga od ' + p.values.forecastWarn + '%, alarm od ' + p.values.forecastAlarm + '%, rezerwa ' + p.values.reservePct + '%' })
      ]);
    });
    if (profile === 'custom') cards.push(D.el('span', { class: 'profile-card is-custom', attrs: { 'data-fk': 'bp-custom' } }, [
      D.el('span', { class: 'profile-card__name', text: 'Własny' }),
      D.el('span', { class: 'profile-card__hint', text: 'Ręcznie zmienione wartości. Wybierz profil, żeby wrócić do gotowego zestawu.' })
    ]));

    var method = selectOf('rule-method', prefs.progressMethod, [
      { value: 'auto', label: 'Z zadań (zalecane)' }, { value: 'status', label: 'Tylko ze statusu etapu' }, { value: 'done', label: 'Tylko etapy zakończone' }
    ], function (v) { a.setPref({ progressMethod: v }); });

    var impact = impactRows(state);
    var impactNode;
    if (!impact) {
      impactNode = D.el('p', { class: 'set-note', text: 'Podgląd skutków pojawi się, gdy w portfelu będą aktywne projekty widoczne dla Ciebie.' });
    } else {
      var n = impact.now;
      impactNode = D.el('div', { class: 'impact', attrs: { 'data-fk': 'bp-impact' } }, [
        D.el('p', { class: 'set-note', text: 'Przy obecnych ustawieniach: ' + n.risk + ' ' + E.Format.plural(n.risk, 'projekt ma', 'projekty mają', 'projektów ma') + ' alarm, ' + n.watch + ' z uwagą (spośród ' + n.active + ' aktywnych).' }),
        D.el('ul', { class: 'impact__list' }, Prefs.BUDGET_PROFILES.map(function (p, i) {
          var r = impact.profiles[i];
          return D.el('li', { class: p.id === profile ? 'is-on' : '' }, [
            D.el('span', { text: p.label }),
            D.el('span', { class: 't-num', text: r.risk + ' ' + 'alarm · ' + r.watch + ' uwaga' })
          ]);
        }))
      ]);
    }

    var advanced = D.el('details', { class: 'set-adv', attrs: { 'data-fk': 'set-adv' } }, [
      D.el('summary', { text: 'Zaawansowane: liczenie postępu, waga etapu „w toku”, rezerwa postępowań, minimalny postęp do prognozy' }),
      row('Liczenie postępu', method, 'etap w toku liczy się wg godzin oszacowanych zadań', 'rule-method'),
      row('Waga etapu „w toku” bez zadań', selectOf('rule-weight', prefs.workingWeight, percentOptions([0, 10, 25, 30, 40, 50, 60, 75, 90]), function (v) { a.setPref({ workingWeight: Number(v) }); }), '', 'rule-weight'),
      row('Rezerwa postępowań', selectOf('rule-reserve', prefs.reservePct, percentOptions([0, 10, 15, 20, 25, 30]), function (v) { a.setPref({ reservePct: Number(v) }); }), 'część budżetu etapu-postępowania na uzupełnienia', 'rule-reserve'),
      row('Prognoza od postępu', selectOf('rule-min', prefs.minProgress, percentOptions([0, 5, 10, 15, 20, 30]), function (v) { a.setPref({ minProgress: Number(v) }); }), 'wcześniej wynik byłby zgadywaniem', 'rule-min')
    ]);
    if (state.settingsAdvOpen) advanced.open = true;
    advanced.addEventListener('toggle', function () { a.setSettingsAdv(advanced.open); });

    return [
      card('Profil', [D.el('div', { class: 'profile-cards', attrs: { role: 'group', 'aria-label': 'Profil zasad budżetu' } }, cards)],
        'Dla większości biur wystarczy gotowy profil. Wpływa na ostrzeżenia w Pulpicie, Analizie i Skrzynce.'),
      card('Co się stanie przy przekroczeniu', [
        row('Uwaga od przekroczenia', selectOf('rule-warn', prefs.forecastWarn, percentOptions([5, 10, 15, 20]), function (v) { a.setPref({ forecastWarn: Number(v) }); }), 'prognoza godzin wobec budżetu', 'rule-warn'),
        row('Alarm od przekroczenia', selectOf('rule-alarm', prefs.forecastAlarm, percentOptions([15, 20, 25, 30, 35, 40, 50]), function (v) { a.setPref({ forecastAlarm: Number(v) }); }), 'projekt trafia na Pulpit i do Skrzynki', 'rule-alarm')
      ]),
      D.el('section', { class: 'set-card' }, [advanced]),
      card('Podgląd skutków', [impactNode])
    ];
  }

  /* ---------- Kalendarz i urlopy ---------- */

  function leaveSection(state, ctx) {
    return [card('Kalendarz i urlopy', [
      D.el('p', { class: 'set-note', text: 'Terminy zamknięte, dni wolne firmy, widoczność nieobecności i zasady limitów ustawia kierownictwo w panelu „Zasady” na ekranie Urlopy.' }),
      UI.button({ label: 'Otwórz zasady urlopów', variant: 'secondary', icon: 'calendar', attrs: { 'data-fk': 'set-leave-rules' }, onClick: function () { ctx.actions.openLeaveRules(); } })
    ])];
  }

  /* ---------- Dane ---------- */

  function dataSection(state, ctx) {
    var a = ctx.actions;
    return [
      card('Kopia zapasowa', [
        D.el('p', { class: 'set-note', text: 'Dane zapisują się w tej przeglądarce. Przed zmianą komputera pobierz kopię zapasową i wczytaj ją na nowym.' }),
        D.el('div', { class: 'set-btns' }, [
          UI.button({ label: 'Pobierz kopię zapasową', variant: 'secondary', icon: 'download', attrs: { 'data-fk': 'set-export' }, onClick: function () { a.exportJson(); } }),
          UI.button({ label: 'Wczytaj kopię zapasową…', variant: 'secondary', icon: 'upload', attrs: { 'data-fk': 'set-import' }, onClick: function () { a.importJson(); } })
        ])
      ]),
      card('Dane przykładowe', [
        D.el('p', { class: 'set-note', text: 'Dodaje kilkanaście projektów, zespół, urlopy i wpisy czasu, żeby obejrzeć aplikację w działaniu.' }),
        UI.button({ label: 'Dodaj dane przykładowe', variant: 'secondary', icon: 'sparkle', attrs: { 'data-fk': 'set-demo' }, onClick: function () { a.loadDemo(); } })
      ]),
      card('Usuwanie', [
        D.el('p', { class: 'set-note', text: 'Usuwa wszystkie projekty, wpisy i ustawienia z tej przeglądarki. Wcześniej pobierz kopię zapasową.' }),
        UI.button({ label: 'Usuń wszystkie dane…', variant: 'danger', icon: 'trash', attrs: { 'data-fk': 'set-clear' }, onClick: function () { a.clearAll(); } })
      ])
    ];
  }

  var BUILDERS = { look: lookSection, time: timeSection, keys: keysSection, budget: budgetSection, leave: leaveSection, data: dataSection };

  /**
   * @param {Object} state stan aplikacji
   * @param {{actions: Object}} ctx
   * @returns {{summary: string, body: Element}}
   */
  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = E.Team.findPerson(people, state.prefs.me);
    var management = !!me && E.Budget.isManagement(me.id, people);
    var list = sectionsFor(management);
    var current = list.filter(function (s) { return s.id === state.settingsSection; })[0] || list[0];

    var nav = [];
    var group = '';
    list.forEach(function (s) {
      if (s.group !== group) { group = s.group; nav.push(D.el('h2', { class: 'set-nav__group', text: group })); }
      nav.push(D.el('button', {
        class: 'set-nav__item' + (s.id === current.id ? ' is-on' : ''),
        attrs: { type: 'button', 'data-fk': 'set-nav-' + s.id, 'aria-current': s.id === current.id ? 'page' : null },
        on: { click: function () { ctx.actions.setSettingsSection(s.id); } }
      }, [E.Icons.icon(s.icon), D.el('span', { text: s.label })]));
    });

    var body = D.el('div', { class: 'set' }, [
      D.el('nav', { class: 'set-nav', attrs: { 'aria-label': 'Sekcje ustawień' } }, nav),
      D.el('div', { class: 'set-main', attrs: { 'data-section': current.id } }, [
        D.el('h2', { class: 'set-main__title', text: current.label })
      ].concat(BUILDERS[current.id](state, ctx).filter(Boolean)))
    ]);
    return { summary: 'Zmiany zapisują się od razu. Wygląd widać na żywo w całej aplikacji.', body: body };
  }

  root.ETROM.SettingsScreen = { view: view, SECTIONS: SECTIONS, sectionsFor: sectionsFor, DEFAULT_SECTION: DEFAULT_SECTION };
})(typeof globalThis !== 'undefined' ? globalThis : this);
