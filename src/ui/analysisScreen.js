/* ETROM — ekran „Analiza”: gdzie jest portfel, które projekty zagraża przekroczenie budżetu
   godzin, ile to kosztuje i jak się to zmienia w czasie. Liczy core/analysis.js, wykresy to
   czysty SVG (ui/charts.js). Dostęp: zarząd (wszystko, z finansami) i liderzy (swoje projekty). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Icons = E.Icons;
  var Charts = E.Charts;
  var Analysis = E.Analysis;
  var Team = E.Team;
  var F = E.Format;

  var VERDICT = {
    ok: 'W normie', watch: 'Obserwuj', risk: 'Zagrożony', closed: 'Zakończony', nodata: 'Brak danych'
  };

  function pln(value) { return F.number(value) + ' zł'; }
  function signed(value, unit) { return (value > 0 ? '+' : (value < 0 ? '−' : '')) + F.number(Math.abs(value)) + (unit || ''); }

  function pill(verdict) {
    return D.el('span', { class: 'an-pill an-pill--' + verdict, text: VERDICT[verdict] });
  }

  /** Jedno zdanie o tym, co dzieje się z projektem — to, co zarząd i tak chciałby usłyszeć. */
  function insight(p) {
    if (p.verdict === 'closed') return 'Projekt zakończony: zużyto ' + F.hours(p.used) + ' z ' + F.hours(p.planned) + ' budżetu.';
    if (p.verdict === 'nodata') return 'Brak zapisanego czasu i ukończonych etapów — nie ma jeszcze z czego liczyć prognozy.';
    var parts = [];
    if (p.eac !== null) {
      var diff = p.eac - p.planned;
      parts.push('Przy obecnej efektywności projekt zużyje ok. ' + F.hours(p.eac) + ' wobec ' + F.hours(p.planned) + ' budżetu (' + signed(Math.round((p.forecastRatio - 1) * 100), '%') + ', ' + signed(diff, ' h') + ').');
    }
    if (p.timePct !== null && p.timePct > 100) parts.push('Termin umowy minął.');
    else if (p.spi !== null && p.spi < 0.9) parts.push('Postęp jest wolniejszy niż upływ czasu umowy (' + Math.round(p.earnedPct) + '% pracy przy ' + Math.round(p.timePct) + '% czasu).');
    if (p.exhaustAt) {
      var d = new Date(p.exhaustAt);
      parts.push('W obecnym tempie (' + F.hours(p.pace) + '/tydz.) budżet wyczerpie się około ' + F.date(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), { year: 'always' }) + '.');
    }
    return parts.join(' ') || 'Projekt idzie zgodnie z planem.';
  }

  /** Jedno krótkie zdanie do listy „Najwięcej uwagi”. */
  function short(p) {
    if (p.eac !== null) return 'Prognoza ' + F.hours(p.eac) + ' wobec ' + F.hours(p.planned) + ' (' + signed(Math.round((p.forecastRatio - 1) * 100), '%') + ')';
    return 'Zużyto ' + Math.round(p.usagePct) + '% budżetu';
  }

  function tile(label, body, tone, extra) {
    return D.el('div', { class: 'an-tile' + (tone ? ' an-tile--' + tone : '') }, [
      D.el('div', { class: 'an-tile__label', text: label }),
      body,
      extra || null
    ]);
  }

  function kpis(data, ctx) {
    var t = data.totals;
    var weekDelta = t.thisWeek - t.lastWeek;
    var tiles = [
      tile('Zużycie budżetu', D.el('div', { class: 'an-tile__ring' }, [
        Charts.ring(t.usagePct, { tone: t.usagePct > 100 ? 'bad' : (t.usagePct >= 80 ? 'warn' : 'ok') }),
        D.el('div', { class: 'an-tile__nums' }, [D.el('b', { class: 't-num', text: F.number(t.used) }), D.el('span', { text: 'z ' + F.hours(t.planned) })])
      ])),
      tile('Projekty zagrożone', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: String(t.risk) }), D.el('span', { text: 'z ' + t.active + ' w toku' })]), t.risk ? 'bad' : null,
        D.el('div', { class: 'an-tile__sub', text: t.watch ? t.watch + ' do obserwacji' : 'Reszta w normie' })),
      tile('Godziny w tym tygodniu', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: F.number(t.thisWeek) }), D.el('span', { text: 'h' })]), null, D.el('div', { class: 'an-tile__spark' }, [
        Charts.spark(data.weekly.totals, { label: 'Godziny w kolejnych tygodniach' }),
        D.el('span', { class: 'an-tile__delta ' + (weekDelta >= 0 ? 'is-up' : 'is-down'), text: signed(Math.round(weekDelta), ' h') + ' vs poprzedni' })
      ]))
    ];
    var forecast = data.projects.filter(function (p) { return p.status !== 'done' && p.eac !== null; });
    if (forecast.length) {
      var over = forecast.reduce(function (acc, p) { return acc + (p.eac - p.planned); }, 0);
      tiles.push(tile('Prognoza zużycia', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: signed(Math.round(over)) }), D.el('span', { text: 'h względem budżetu' })]), over > 0 ? 'warn' : 'ok',
        D.el('div', { class: 'an-tile__sub', text: 'dla ' + F.count(forecast.length, 'projektu', 'projektów', 'projektów') + ' z postępem' })));
    }
    if (data.management && t.financeProjects) {
      var margin = t.value ? (t.margin / t.value) * 100 : 0;
      tiles.push(tile('Marża dotychczasowa', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: pln(t.margin) })]), margin < 20 ? 'warn' : 'ok',
        D.el('div', { class: 'an-tile__sub', text: Math.round(margin) + '% wartości umów (' + pln(t.value) + ')' })));
    }
    return D.el('div', { class: 'an-kpis' }, tiles);
  }

  /** Trzy pasy: postęp, budżet, czas — to samo, co mapa, ale dla jednego projektu i w liczbach. */
  function lanes(p) {
    function lane(label, pct, tone, detail) {
      return D.el('div', { class: 'an-lane' }, [
        D.el('div', { class: 'an-lane__head' }, [D.el('span', { text: label }), D.el('b', { class: 't-num', text: pct === null ? '—' : Math.round(pct) + '%' })]),
        D.el('div', { class: 'an-lane__track' }, [D.el('span', { class: 'an-lane__fill an-lane__fill--' + tone, style: { width: Math.min(100, pct || 0) + '%' } }), pct > 100 ? D.el('span', { class: 'an-lane__over', style: { width: Math.min(40, pct - 100) + '%' } }) : null]),
        D.el('div', { class: 't-meta', text: detail })
      ]);
    }
    return D.el('div', { class: 'an-lanes' }, [
      lane('Postęp rzeczowy', p.earnedPct, 'flow', F.hours(p.earned) + ' z ' + F.hours(p.planned) + ' wykonane'),
      lane('Zużycie budżetu', p.usagePct, p.usagePct > 100 ? 'bad' : (p.usagePct >= 80 ? 'warn' : 'ink'), F.hours(p.used) + ' zapisane (z korektami zarządu)'),
      lane('Czas umowy', p.timePct, p.timePct > 100 ? 'bad' : 'slate', p.deadline ? 'do ' + F.date(p.deadline, { year: 'always' }) : 'brak terminu')
    ]);
  }

  function indexes(p) {
    function cell(label, value, hint, tone) {
      return D.el('div', { class: 'an-idx' + (tone ? ' an-idx--' + tone : '') }, [D.el('div', { class: 'an-idx__v t-num', text: value }), D.el('div', { class: 'an-idx__l', text: label }), D.el('div', { class: 't-meta', text: hint })]);
    }
    return D.el('div', { class: 'an-idxs' }, [
      cell('Efektywność (CPI)', p.cpi === null ? '—' : String(p.cpi).replace('.', ','), 'wykonana praca / zużyte godziny; poniżej 1 = drożej niż plan', p.cpi !== null && p.cpi < 0.9 ? 'bad' : null),
      cell('Tempo (SPI)', p.spi === null ? '—' : String(p.spi).replace('.', ','), 'postęp / upływ czasu umowy; poniżej 1 = z opóźnieniem', p.spi !== null && p.spi < 0.9 ? 'bad' : null),
      cell('Prognoza całości', p.eac === null ? '—' : F.hours(p.eac), p.eac === null ? 'po pierwszych ukończonych etapach' : signed(Math.round(p.eac - p.planned), ' h') + ' względem budżetu', p.forecastRatio !== null && p.forecastRatio > 1.05 ? 'bad' : null)
    ]);
  }

  function stageBars(p) {
    var rows = p.stages.filter(function (st) { return st.planned > 0 && (st.used > 0 || st.status !== 'todo'); });
    if (!rows.length) return D.el('p', { class: 'an-empty', text: 'Brak zapisanego czasu na etapach.' });
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r.planned, r.used); }));
    return D.el('ul', { class: 'an-stages' }, rows.map(function (st) {
      return D.el('li', { class: 'an-stage' }, [
        D.el('div', { class: 'an-stage__head' }, [D.el('span', { class: 'truncate', text: st.name }), D.el('span', { class: 't-num an-stage__v an-stage__v--' + st.state, text: F.number(st.used) + ' / ' + F.number(st.planned) + ' h' })]),
        D.el('div', { class: 'an-stage__track', attrs: { 'data-tooltip': st.percent + '% budżetu etapu' } }, [
          D.el('span', { class: 'an-stage__plan', style: { width: (st.planned / max) * 100 + '%' } }),
          D.el('span', { class: 'an-stage__used an-stage__used--' + st.state, style: { width: (st.used / max) * 100 + '%' } })
        ])
      ]);
    }));
  }

  function kindBreakdown(p) {
    var items = p.byKind.filter(function (k) { return k.used > 0; }).map(function (k) { return { label: k.label, value: k.used }; });
    if (!items.length) return D.el('p', { class: 'an-empty', text: 'Brak zapisanego czasu.' });
    var total = items.reduce(function (t, i) { return t + i.value; }, 0);
    return D.el('div', { class: 'an-donut' }, [
      Charts.donut(items, { label: 'Godziny wg rodzaju pracy' }),
      D.el('ul', { class: 'an-legend' }, items.map(function (item, k) {
        return D.el('li', null, [D.el('i', { class: 'an-sw ch-s' + (k % 6) }), D.el('span', { text: item.label }), D.el('b', { class: 't-num', text: Math.round((item.value / total) * 100) + '%' }), D.el('span', { class: 't-meta t-num', text: F.hours(item.value) })]);
      }))
    ]);
  }

  function peopleBars(p) {
    if (!p.people.length) return D.el('p', { class: 'an-empty', text: 'Nikt nie zapisał jeszcze czasu.' });
    var max = p.people[0].hours || 1;
    return D.el('ul', { class: 'an-people' }, p.people.slice(0, 8).map(function (row) {
      return D.el('li', null, [
        row.person ? E.Avatar.avatar(row.person, { size: 'sm' }) : D.el('span', { class: 'avatar avatar--sm' }),
        D.el('span', { class: 'an-people__name truncate', text: row.person ? Team.fullName(row.person) : 'Nieznana osoba' }),
        D.el('span', { class: 'an-people__bar' }, [D.el('i', { style: { width: (row.hours / max) * 100 + '%' } })]),
        D.el('b', { class: 't-num', text: F.hours(row.hours) })
      ]);
    }));
  }

  function financeBlock(p) {
    var f = p.finance;
    if (!f) return D.el('p', { class: 'an-empty', text: 'Uzupełnij wartość umowy (edycja projektu) i koszt godziny, aby zobaczyć opłacalność.' });
    function cell(label, value, tone, hint) { return D.el('div', { class: 'an-fin__c' + (tone ? ' an-fin__c--' + tone : '') }, [D.el('div', { class: 'an-fin__v t-num', text: value }), D.el('div', { class: 'an-fin__l', text: label }), hint ? D.el('div', { class: 't-meta', text: hint }) : null]); }
    var tone = function (pct) { return pct < 0 ? 'bad' : (pct < 20 ? 'warn' : 'ok'); };
    return D.el('div', { class: 'an-fin' }, [
      cell('Wartość umowy', pln(f.value)),
      cell('Koszt dotychczas', pln(f.cost), null, F.hours(p.used) + ' × ' + pln(f.rate)),
      cell('Marża dotychczas', pln(f.margin), tone(f.marginPct), f.marginPct + '%'),
      cell('Marża po prognozie', f.forecastMargin === null ? '—' : pln(f.forecastMargin), f.forecastMarginPct === null ? null : tone(f.forecastMarginPct), f.forecastMarginPct === null ? '' : f.forecastMarginPct + '%'),
      cell('Przychód na godzinę', f.perHour === null ? '—' : pln(f.perHour), f.perHour !== null && f.perHour < f.rate ? 'bad' : 'ok', 'koszt godziny: ' + pln(f.rate))
    ]);
  }

  function card(title, subtitle, body, cls) {
    return D.el('section', { class: 'an-card ' + (cls || '') }, [
      D.el('header', { class: 'an-card__head' }, [D.el('h3', { class: 'an-card__title', text: title }), subtitle ? D.el('p', { class: 't-meta', text: subtitle }) : null]),
      body
    ]);
  }

  function detail(p, data, ctx, now, bare) {
    return D.el('div', { class: 'an-detail' + (bare ? ' an-detail--bare' : ''), dataset: { projectId: p.id } }, [
      bare ? D.el('header', { class: 'an-detail__head' }, [pill(p.verdict), D.el('span', { class: 't-meta', text: 'Zużycie, prognoza i opłacalność tego projektu' })]) : D.el('header', { class: 'an-detail__head' }, [
        D.el('span', { class: 'pf-num pf-num--pill t-num', text: '#' + p.code }),
        D.el('h2', { class: 'an-detail__title', text: p.name }),
        pill(p.verdict),
        UI.button({ label: 'Otwórz projekt', variant: 'ghost', size: 'sm', icon: 'arrowUpRight', onClick: function () { ctx.actions.openProject(p.id); } })
      ]),
      D.el('p', { class: 'an-detail__insight', text: insight(p) }),
      D.el('div', { class: 'an-grid an-grid--2' }, [
        card('Spalanie godzin', 'Zużycie narastająco, budżet i plan liniowy wg czasu umowy', Charts.burn(p, now)),
        D.el('div', { class: 'an-stack' }, [
          card('Postęp, budżet i czas', null, lanes(p)),
          card('Wskaźniki', null, indexes(p))
        ])
      ]),
      D.el('div', { class: 'an-grid an-grid--3' }, [
        card('Budżet etapów', 'zużyte / zaplanowane godziny', stageBars(p)),
        card('Godziny wg rodzaju pracy', null, kindBreakdown(p)),
        card('Kto pracował', 'godziny zapisane w projekcie', peopleBars(p))
      ]),
      data.management ? card('Opłacalność', 'tylko zarząd', financeBlock(p), 'an-card--fin') : null
    ]);
  }

  function table(data, selected, ctx) {
    var rows = data.projects.slice().sort(function (a, b) {
      var order = { risk: 0, watch: 1, ok: 2, nodata: 3, closed: 4 };
      return order[a.verdict] - order[b.verdict] || String(a.code).localeCompare(String(b.code), 'pl', { numeric: true });
    });
    function bar(pct, tone) { return D.el('span', { class: 'an-mini' }, [D.el('i', { class: 'an-mini__f an-mini__f--' + tone, style: { width: Math.min(100, pct || 0) + '%' } }), D.el('b', { class: 't-num', text: pct === null ? '—' : Math.round(pct) + '%' })]); }
    return D.el('div', { class: 'an-table', attrs: { role: 'table', 'aria-label': 'Wszystkie projekty' } }, [
      D.el('div', { class: 'an-tr an-tr--head', attrs: { role: 'row' } }, ['Projekt', 'Stan', 'Postęp', 'Budżet', 'Czas umowy', 'Prognoza'].concat(data.management ? ['Marża'] : []).map(function (h) { return D.el('span', { text: h, attrs: { role: 'columnheader' } }); })),
      D.el('div', { class: 'an-trows' }, rows.map(function (p) {
        return D.el('button', { class: 'an-tr an-tr--row' + (p.id === selected ? ' is-selected' : ''), attrs: { type: 'button', role: 'row', 'data-fk': 'an-row-' + p.id }, dataset: { projectId: p.id }, on: { click: function () { ctx.actions.setAnalysisProject(p.id); } } }, [
          D.el('span', { class: 'an-tr__name', attrs: { role: 'cell' } }, [D.el('span', { class: 'pf-num pf-num--pill t-num', text: p.code }), D.el('span', { class: 'truncate', text: p.name })]),
          D.el('span', { attrs: { role: 'cell' } }, [pill(p.verdict)]),
          D.el('span', { attrs: { role: 'cell' } }, [bar(p.earnedPct, 'flow')]),
          D.el('span', { attrs: { role: 'cell' } }, [bar(p.usagePct, p.usagePct > 100 ? 'bad' : (p.usagePct >= 80 ? 'warn' : 'ink'))]),
          D.el('span', { attrs: { role: 'cell' } }, [bar(p.timePct, p.timePct > 100 ? 'bad' : 'slate')]),
          D.el('span', { class: 't-num an-tr__fc' + (p.forecastRatio !== null && p.forecastRatio > 1.05 ? ' is-bad' : ''), attrs: { role: 'cell' }, text: p.eac === null ? '—' : signed(Math.round(p.eac - p.planned), ' h') }),
          data.management ? D.el('span', { class: 't-num', attrs: { role: 'cell' }, text: p.finance ? p.finance.marginPct + '%' : '—' }) : null
        ]);
      }))
    ]);
  }

  function rateControl(state, ctx) {
    var input = D.el('input', { class: 'input an-rate__input', attrs: { type: 'number', min: '0', step: '5', 'aria-label': 'Koszt godziny pracy w złotych', value: state.prefs.hourlyCost ? String(state.prefs.hourlyCost) : '', placeholder: '0', 'data-fk': 'an-rate' } });
    input.addEventListener('change', function () { ctx.actions.setHourlyCost(input.value); });
    return D.el('label', { class: 'an-rate' }, [D.el('span', { text: 'Koszt godziny' }), input, D.el('span', { text: 'zł' })]);
  }

  /** Zakładka „Analiza” w projekcie: ten sam szczegółowy widok, ale dla jednego projektu. */
  function projectView(project, state, ctx) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    var data = me ? Analysis.portfolio(state.workspace, me.id, new Date(), { rate: state.prefs.hourlyCost }) : { access: false };
    var p = data.access ? data.projects.filter(function (x) { return x.id === project.id; })[0] : null;
    if (!p) {
      return UI.emptyState({ icon: 'checklist', title: 'Analiza projektu jest dla lidera i zarządu', text: 'Pracownik widzi w planie procent zużycia budżetu etapów. Godziny, prognozy i opłacalność analizują lider projektu oraz zarząd.' });
    }
    if (!p.planned) {
      return UI.emptyState({ icon: 'layers', title: 'Brak budżetu godzin', text: 'Dodaj do etapów budżet godzin, a Analiza pokaże zużycie, prognozę i opłacalność tego projektu.' });
    }
    return D.el('div', { class: 'an an--project' }, [
      data.management ? D.el('div', { class: 'an-bar' }, [rateControl(state, ctx)]) : null,
      detail(p, data, ctx, new Date(), true)
    ]);
  }

  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    var now = new Date();
    if (!me) {
      return { summary: 'Analiza projektów dla lidera i zarządu.', tools: null, body: UI.emptyState({
        icon: 'people', title: 'Najpierw wybierz, kim jesteś',
        text: 'Analiza pokazuje projekty, które możesz oceniać jako lider albo zarząd. Wybór osoby robisz w „Mojej pracy”.',
        actions: [UI.button({ label: 'Przejdź do mojej pracy', variant: 'primary', onClick: function () { ctx.actions.goTo('mywork'); } })]
      }) };
    }
    var data = Analysis.portfolio(state.workspace, me.id, now, { rate: state.prefs.hourlyCost });
    if (!data.access) {
      return { summary: 'Analiza projektów dla lidera i zarządu.', tools: null, body: UI.emptyState({
        icon: 'checklist', title: 'Analiza jest dla liderów projektów i zarządu',
        text: 'Pracownik widzi w projekcie procent zużycia budżetu etapów. Godziny, prognozy i opłacalność analizują liderzy swoich projektów oraz zarząd.'
      }) };
    }
    var active = data.projects.filter(function (p) { return p.status !== 'done'; });
    if (!data.projects.length || !data.projects.some(function (p) { return p.planned > 0; })) {
      return { summary: 'Brak danych do analizy.', tools: null, body: UI.emptyState({ icon: 'layers', title: 'Nie ma jeszcze czego analizować', text: 'Dodaj projekty z etapami i budżetem godzin, a Analiza pokaże zużycie, prognozy i opłacalność. Dane przykładowe znajdziesz w ustawieniach.' }) };
    }
    var selectedId = state.analysisProject;
    var selected = data.projects.filter(function (p) { return p.id === selectedId; })[0]
      || active.filter(function (p) { return p.verdict === 'risk'; })[0] || active[0] || data.projects[0];
    var plotted = data.projects.filter(function (p) { return p.planned > 0 && p.verdict !== 'nodata'; });
    var t = data.totals;
    var summary = F.count(t.active, 'projekt w toku', 'projekty w toku', 'projektów w toku') + ' · zużyto ' + t.usagePct + '% budżetu godzin' + (t.risk ? ' · ' + t.risk + ' zagrożone' : '');
    return {
      summary: summary,
      tools: data.management ? rateControl(state, ctx) : null,
      body: D.el('div', { class: 'an' }, [
        kpis(data, ctx),
        D.el('div', { class: 'an-grid an-grid--map' }, [
          card('Mapa projektów', 'Kropka = projekt, wielkość = budżet godzin. Nad przekątną wydajemy szybciej, niż robimy.', Charts.scatter(plotted, { selected: selected.id, onPick: ctx.actions.setAnalysisProject })),
          card('Najwięcej uwagi', 'projekty w toku, od najbardziej zagrożonych', D.el('ul', { class: 'an-focus' }, active.filter(function (p) { return p.verdict === 'risk' || p.verdict === 'watch'; }).slice(0, 5).map(function (p) {
            return D.el('li', null, [D.el('button', { class: 'an-focus__b', attrs: { type: 'button', 'data-fk': 'an-focus-' + p.id }, on: { click: function () { ctx.actions.setAnalysisProject(p.id); } } }, [
              D.el('span', { class: 'pf-num pf-num--pill t-num', text: p.code }), D.el('span', { class: 'an-focus__t' }, [D.el('b', { class: 'truncate', text: p.name }), D.el('span', { class: 't-meta', text: short(p) })]), pill(p.verdict)
            ])]);
          }).concat(active.some(function (p) { return p.verdict === 'risk' || p.verdict === 'watch'; }) ? [] : [D.el('li', { class: 'an-empty', text: 'Wszystkie projekty w toku są w normie.' })])))
        ]),
        detail(selected, data, ctx, now),
        card('Godziny w ostatnich 12 tygodniach', 'zapisany czas wszystkich osób, warstwy = projekty', D.el('div', { class: 'an-weekly' }, [
          Charts.weekly(data.weekly),
          D.el('ul', { class: 'an-legend an-legend--inline' }, data.weekly.series.filter(function (s) { return s.values.some(Boolean); }).map(function (s) { var k = data.weekly.series.indexOf(s); return D.el('li', null, [D.el('i', { class: 'an-sw ch-c' + (k % 8) }), D.el('span', { text: s.code })]); }))
        ])),
        card('Wszystkie projekty', 'kliknij, aby zobaczyć szczegóły powyżej', table(data, selected.id, ctx))
      ])
    };
  }

  root.ETROM.AnalysisScreen = { view: view, projectView: projectView, insight: insight, VERDICT: VERDICT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
