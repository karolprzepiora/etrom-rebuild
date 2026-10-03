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
    tiles.push(tile('Obłożenie zespołu', D.el('div', { class: 'an-tile__ring' }, [
      Charts.ring(t.utilization, { tone: t.utilization > 105 ? 'bad' : (t.utilization > 85 ? 'warn' : 'ok') }),
      D.el('div', { class: 'an-tile__nums' }, [D.el('b', { class: 't-num', text: F.number(t.avg4) + ' h' }), D.el('span', { text: 'tyg., średnia 4 tyg.' })])
    ]), t.utilization > 105 ? 'warn' : null));
    var nx = data.deadlines[0];
    if (nx) tiles.push(tile('Najbliższy termin', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: nx.days < 0 ? '−' + Math.abs(nx.days) : String(nx.days) }), D.el('span', { text: nx.days < 0 ? 'dni po terminie' : 'dni' })]), nx.days < 0 ? 'bad' : (nx.days <= 14 ? 'warn' : null), D.el('div', { class: 'an-tile__sub', text: nx.code + ' ' + nx.name })));
    var sg = data.signals;
    var late = sg.overdueTasks + sg.overdueStages + sg.pastDeadline;
    tiles.push(tile('Po terminie', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: String(late) }), D.el('span', { text: 'sygnałów' })]), late ? 'bad' : null,
      D.el('div', { class: 'an-tile__sub', text: late ? [sg.overdueTasks ? F.count(sg.overdueTasks, 'zadanie', 'zadania', 'zadań') : '', sg.overdueStages ? F.count(sg.overdueStages, 'etap', 'etapy', 'etapów') : '', sg.pastDeadline ? F.count(sg.pastDeadline, 'umowa', 'umowy', 'umów') : ''].filter(Boolean).join(' · ') : 'Nic nie jest po terminie' })));
    if (data.management && t.financeProjects) {
      var emPct = t.earnedValue ? (t.earnedMargin / t.earnedValue) * 100 : 0;
      tiles.push(tile('Marża na wykonanej pracy', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: pln(t.earnedMargin) })]), emPct < 0 ? 'bad' : (emPct < 20 ? 'warn' : 'ok'),
        D.el('div', { class: 'an-tile__sub', text: Math.round(emPct) + '% wartości wypracowanej (' + pln(t.earnedValue) + ')' })));
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

  function peopleBars(p, management) {
    if (!p.people.length) return D.el('p', { class: 'an-empty', text: 'Nikt nie zapisał jeszcze czasu.' });
    var max = p.people[0].hours || 1;
    return D.el('ul', { class: 'an-people' }, p.people.slice(0, 8).map(function (row) {
      return D.el('li', null, [
        row.person ? E.Avatar.avatar(row.person, { size: 'sm' }) : D.el('span', { class: 'avatar avatar--sm' }),
        D.el('span', { class: 'an-people__name truncate', text: row.person ? Team.fullName(row.person) : 'Nieznana osoba' }),
        D.el('span', { class: 'an-people__bar' }, [D.el('i', { style: { width: (row.hours / max) * 100 + '%' } })]),
        D.el('b', { class: 't-num', text: F.hours(row.hours) + (management && row.cost ? ' · ' + pln(row.cost) : '') })
      ]);
    }));
  }

  function financeBlock(p) {
    var f = p.finance;
    if (!f) return D.el('p', { class: 'an-empty', text: 'Uzupełnij wartość umowy (edycja projektu) oraz koszt godziny osób w katalogu Zespół, aby zobaczyć opłacalność.' });
    function cell(label, value, tone, hint) { return D.el('div', { class: 'an-fin__c' + (tone ? ' an-fin__c--' + tone : '') }, [D.el('div', { class: 'an-fin__v t-num', text: value }), D.el('div', { class: 'an-fin__l', text: label }), hint ? D.el('div', { class: 't-meta', text: hint }) : null]); }
    var tone = function (pct) { return pct === null ? null : (pct < 0 ? 'bad' : (pct < 20 ? 'warn' : 'ok')); };
    var forecastCost = f.forecastCost === null ? f.cost : Math.max(f.cost, f.forecastCost);
    var scale = Math.max(f.value, forecastCost) || 1;
    var split = D.el('div', { class: 'an-split', attrs: { role: 'img', 'aria-label': 'Wartość umowy, koszt dotychczas i prognoza kosztu' } }, [
      D.el('div', { class: 'an-split__track' }, [
        D.el('i', { class: 'an-split__cost', style: { width: (f.cost / scale) * 100 + '%' }, attrs: { 'data-tooltip': 'Koszt dotychczas ' + pln(f.cost) } }),
        D.el('i', { class: 'an-split__fc', style: { width: ((forecastCost - f.cost) / scale) * 100 + '%' }, attrs: { 'data-tooltip': 'Dalsze koszty wg prognozy ' + pln(forecastCost - f.cost) } }),
        D.el('i', { class: 'an-split__margin', style: { width: Math.max(0, (f.value - forecastCost) / scale) * 100 + '%' }, attrs: { 'data-tooltip': 'Marża po prognozie ' + pln(f.value - forecastCost) } })
      ]),
      D.el('ul', { class: 'an-legend an-legend--inline' }, [
        D.el('li', null, [D.el('i', { class: 'an-sw an-sw--cost' }), D.el('span', { text: 'koszt dotychczas' })]),
        D.el('li', null, [D.el('i', { class: 'an-sw an-sw--fc' }), D.el('span', { text: 'dalszy koszt wg prognozy' })]),
        D.el('li', null, [D.el('i', { class: 'an-sw an-sw--margin' }), D.el('span', { text: 'marża po prognozie' })])
      ])
    ]);
    return D.el('div', { class: 'an-finblock' }, [
      split,
      D.el('div', { class: 'an-fin' }, [
        cell('Wartość umowy', pln(f.value)),
        cell('Koszt dotychczas', pln(f.cost), null, 'średnio ' + pln(f.rate) + '/h wg stawek osób'),
        cell('Wartość wypracowana', pln(f.earnedValue), null, Math.round(p.earnedPct) + '% pracy × wartość umowy'),
        cell('Marża na wykonanej pracy', pln(f.earnedMargin), tone(f.earnedMarginPct), f.earnedMarginPct === null ? '' : f.earnedMarginPct + '%'),
        cell('Marża po prognozie', f.forecastMargin === null ? '—' : pln(f.forecastMargin), tone(f.forecastMarginPct), f.forecastMarginPct === null ? '' : f.forecastMarginPct + '%'),
        cell('Przychód na godzinę', f.perHour === null ? '—' : pln(f.perHour), f.perHour !== null && f.perHour < f.rate ? 'bad' : 'ok', f.forecastPerHour ? 'po prognozie: ' + pln(f.forecastPerHour) : 'koszt godziny: ' + pln(f.rate)),
        cell('Koszt 1% postępu', f.costPerPct === null ? '—' : pln(f.costPerPct), null, 'ile kosztuje każdy punkt procentowy pracy')
      ]),
      f.missingRateHours > 0 ? D.el('p', { class: 't-meta an-warnline', text: F.hours(f.missingRateHours) + ' zapisano przez osoby bez stawki — nie weszły do kosztu. Uzupełnij stawki w katalogu Zespół.' }) : null
    ]);
  }

  /** Pasek sygnałów ryzyka niezależnych od godzin: zadania i etapy po terminie, brak postępu. */
  function signals(p) {
    var chips = [];
    if (p.overdueTasks) chips.push(['bad', F.count(p.overdueTasks, 'zadanie po terminie', 'zadania po terminie', 'zadań po terminie')]);
    if (p.overdueStages) chips.push(['bad', F.count(p.overdueStages, 'etap po terminie', 'etapy po terminie', 'etapów po terminie')]);
    if (p.timePct !== null && p.timePct > 100 && p.status !== 'done') chips.push(['bad', 'termin umowy minął']);
    if (p.pace > 0 && p.status !== 'done') chips.push([null, 'tempo ' + F.hours(p.pace) + '/tydz.']);
    if (p.openTasks) chips.push([null, F.count(p.openTasks, 'otwarte zadanie', 'otwarte zadania', 'otwartych zadań')]);
    if (!chips.length) return null;
    return D.el('ul', { class: 'an-chips' }, chips.map(function (c) { return D.el('li', { class: 'an-chip' + (c[0] ? ' an-chip--' + c[0] : ''), text: c[1] }); }));
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
        D.el('span', { class: 'pf-num pf-num--pill t-num', style: E.Identity.hueStyle(p.code), text: '#' + p.code }),
        D.el('h2', { class: 'an-detail__title', text: p.name }),
        pill(p.verdict),
        UI.button({ label: 'Otwórz projekt', variant: 'ghost', size: 'sm', icon: 'arrowUpRight', onClick: function () { ctx.actions.openProject(p.id); } })
      ]),
      D.el('p', { class: 'an-detail__insight', text: insight(p) }),
      signals(p),
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
        card('Kto pracował', data.management ? 'godziny i koszt wg stawki osoby' : 'godziny zapisane w projekcie', peopleBars(p, data.management))
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
          D.el('span', { class: 'an-tr__name', attrs: { role: 'cell' } }, [D.el('span', { class: 'pf-num pf-num--pill t-num', style: E.Identity.hueStyle(p.code), text: p.code }), D.el('span', { class: 'truncate', text: p.name })]),
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

  /** Zakładka „Analiza” w projekcie: ten sam szczegółowy widok, ale dla jednego projektu. */
  function projectView(project, state, ctx) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    var data = me ? Analysis.portfolio(state.workspace, me.id, new Date()) : { access: false };
    var p = data.access ? data.projects.filter(function (x) { return x.id === project.id; })[0] : null;
    if (!p) {
      return UI.emptyState({ icon: 'checklist', title: 'Analiza projektu jest dla lidera i zarządu', text: 'Pracownik widzi w planie procent zużycia budżetu etapów. Godziny, prognozy i opłacalność analizują lider projektu oraz zarząd.' });
    }
    if (!p.planned) {
      return UI.emptyState({ icon: 'layers', title: 'Brak budżetu godzin', text: 'Dodaj do etapów budżet godzin, a Analiza pokaże zużycie, prognozę i opłacalność tego projektu.' });
    }
    return D.el('div', { class: 'an an--project' }, [
      detail(p, data, ctx, new Date(), true)
    ]);
  }

  /* ---------- wspólne klocki ---------- */

  /** Lista poziomych pasków: etykieta, wartość tekstowa i pasek o skali `max`; opcjonalny znacznik `mark`. */
  function hbars(rows, options) {
    var o = options || {};
    if (!rows.length) return D.el('p', { class: 'an-empty', text: o.empty || 'Brak danych.' });
    var max = o.max || Math.max.apply(null, rows.map(function (r) { return Math.max(r.value, r.mark || 0); }).concat([1]));
    return D.el('ul', { class: 'an-hb' }, rows.map(function (r) {
      return D.el('li', { class: 'an-hb__row' }, [
        D.el('span', { class: 'an-hb__label truncate' }, [r.code ? D.el('span', { class: 'pf-num pf-num--pill t-num', style: E.Identity.hueStyle(r.code), text: r.code }) : null, D.el('span', { class: 'truncate', text: r.label })]),
        D.el('span', { class: 'an-hb__track', attrs: r.tip ? { 'data-tooltip': r.tip } : {} }, [
          D.el('i', { class: 'an-hb__fill an-hb__fill--' + (r.tone || 'flow'), style: { width: Math.min(100, (Math.max(0, r.value) / max) * 100) + '%' } }),
          r.mark ? D.el('i', { class: 'an-hb__mark', style: { left: Math.min(100, (r.mark / max) * 100) + '%' } }) : null
        ]),
        D.el('b', { class: 'an-hb__val t-num', text: r.text })
      ]);
    }));
  }

  /** Pasek rozbieżny wokół zera (marża dodatnia w prawo, ujemna w lewo). */
  function diverging(rows, options) {
    if (!rows.length) return D.el('p', { class: 'an-empty', text: (options && options.empty) || 'Brak danych.' });
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([1]));
    return D.el('ul', { class: 'an-hb an-hb--div' }, rows.map(function (r) {
      var w = (Math.abs(r.value) / max) * 50;
      return D.el('li', { class: 'an-hb__row' }, [
        D.el('span', { class: 'an-hb__label truncate' }, [D.el('span', { class: 'pf-num pf-num--pill t-num', style: E.Identity.hueStyle(r.code), text: r.code }), D.el('span', { class: 'truncate', text: r.label })]),
        D.el('span', { class: 'an-hb__track an-hb__track--div', attrs: r.tip ? { 'data-tooltip': r.tip } : {} }, [
          D.el('i', { class: 'an-hb__zero' }),
          D.el('i', { class: 'an-hb__fill an-hb__fill--' + (r.value < 0 ? 'bad' : (r.tone || 'flow')), style: r.value < 0 ? { width: w + '%', right: '50%' } : { width: w + '%', left: '50%' } })
        ]),
        D.el('b', { class: 'an-hb__val t-num', text: r.text })
      ]);
    }));
  }

  /** Mapa cieplna osoby × tygodnie. Kolor = obłożenie względem tygodnia pracy (zielony → bursztyn, powyżej normy → czerwony). */
  function heatmap(data) {
    var labels = data.weekly.labels;
    var cap = data.capacity;
    if (!data.team.length) return D.el('p', { class: 'an-empty', text: 'Nikt nie zapisał jeszcze czasu w tych tygodniach.' });
    function cellStyle(h) {
      if (!h) return {};
      var ratio = h / cap;
      var tone = ratio > 1.05 ? 'var(--alarm)' : (ratio > 0.85 ? 'var(--warn)' : 'var(--flow)');
      return { background: 'color-mix(in srgb, ' + tone + ' ' + Math.round(14 + Math.min(1, ratio) * 62) + '%, transparent)' };
    }
    var head = D.el('div', { class: 'an-hm__row an-hm__row--head', attrs: { role: 'row' } }, [D.el('span', { class: 'an-hm__who' })].concat(labels.map(function (l, i) {
      var d = new Date(l);
      return D.el('span', { class: 'an-hm__wk', text: (labels.length - 1 - i) % 2 === 0 ? d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0') : '', attrs: { role: 'columnheader' } });
    })).concat([D.el('span', { class: 'an-hm__sum', text: 'Śr. 4 tyg.' })]));
    return D.el('div', { class: 'an-hm', attrs: { role: 'table', 'aria-label': 'Godziny osób w tygodniach' } }, [head].concat(data.team.map(function (row) {
      return D.el('div', { class: 'an-hm__row', attrs: { role: 'row' } }, [
        D.el('span', { class: 'an-hm__who truncate', attrs: { role: 'rowheader' } }, [row.person ? E.Avatar.avatar(row.person, { size: 'sm' }) : null, D.el('span', { class: 'truncate', text: row.person ? Team.fullName(row.person) : 'Nieznana osoba' })])
      ].concat(row.weeks.map(function (h, i) {
        return D.el('span', { class: 'an-hm__c', style: cellStyle(h), text: h ? F.number(Math.round(h)) : '', attrs: { role: 'cell', 'data-tooltip': (row.person ? Team.fullName(row.person) : '') + ' · tydzień od ' + F.date(new Date(labels[i]).toISOString().slice(0, 10)) + ': ' + F.hours(h) } });
      })).concat([D.el('span', { class: 'an-hm__sum t-num', attrs: { role: 'cell' } }, [D.el('b', { text: F.number(row.avg4) + ' h' }), D.el('span', { class: 'an-hm__pct' + (row.utilization > 105 ? ' is-bad' : ''), text: row.utilization + '%' })])]));
    })));
  }

  function tabsBar(state, data, ctx) {
    var items = [['overview', 'Przegląd'], ['projects', 'Projekty'], ['team', 'Zespół']].concat(data.management ? [['finance', 'Finanse']] : []).concat([['calibration', 'Wyceny']]);
    return D.el('div', { class: 'an-tabs', attrs: { role: 'tablist', 'aria-label': 'Widoki analizy' } }, items.map(function (it) {
      var on = it[0] === state.tab;
      return D.el('button', { class: 'an-tabs__tab' + (on ? ' is-active' : ''), attrs: { type: 'button', role: 'tab', 'aria-selected': String(on), 'data-fk': 'an-tab-' + it[0] }, dataset: { anTab: it[0] }, on: { click: function () { ctx.actions.setAnalysisTab(it[0]); } } }, [D.el('span', { text: it[1] })]);
    }));
  }

  /* ---------- widoki ---------- */

  function overview(data, selected, ctx, now) {
    var active = data.projects.filter(function (p) { return p.status !== 'done'; });
    var plotted = data.projects.filter(function (p) { return p.planned > 0 && p.verdict !== 'nodata'; });
    var attention = active.filter(function (p) { return p.verdict === 'risk' || p.verdict === 'watch'; });
    var timeline = active.filter(function (p) { return p.start !== null && p.end !== null; });
    var order = { risk: 0, watch: 1, ok: 2, nodata: 3, closed: 4 };
    timeline.sort(function (a, b) { return order[a.verdict] - order[b.verdict] || a.end - b.end; });
    var next = data.deadlines[0];
    return [
      kpis(data, ctx),
      D.el('div', { class: 'an-grid an-grid--map' }, [
        card('Mapa projektów', 'Kropka = projekt, wielkość = budżet godzin. Nad przekątną wydajemy szybciej, niż robimy.', Charts.scatter(plotted, { selected: selected.id, onPick: function (id) { ctx.actions.openAnalysisProject(id); } })),
        D.el('div', { class: 'an-stack' }, [
          card('Najwięcej uwagi', 'projekty w toku, od najbardziej zagrożonych', D.el('ul', { class: 'an-focus' }, attention.slice(0, 5).map(function (p) {
            return D.el('li', null, [D.el('button', { class: 'an-focus__b', attrs: { type: 'button', 'data-fk': 'an-focus-' + p.id }, on: { click: function () { ctx.actions.openAnalysisProject(p.id); } } }, [
              D.el('span', { class: 'pf-num pf-num--pill t-num', style: E.Identity.hueStyle(p.code), text: p.code }), D.el('span', { class: 'an-focus__t' }, [D.el('b', { class: 'truncate', text: p.name }), D.el('span', { class: 't-meta', text: short(p) })]), pill(p.verdict)
            ])]);
          }).concat(attention.length ? [] : [D.el('li', { class: 'an-empty', text: 'Wszystkie projekty w toku są w normie.' })]))),
          card('Najbliższe terminy', 'umowy projektów w toku', hbars(data.deadlines.slice(0, 5).map(function (d) {
            return { code: d.code, label: d.name, value: Math.max(0, 60 - Math.abs(d.days)), max: 60, tone: d.days < 0 ? 'bad' : (d.days <= 14 ? 'warn' : 'flow'), text: d.days < 0 ? Math.abs(d.days) + ' dni po terminie' : (d.days === 0 ? 'dziś' : 'za ' + d.days + ' dni') };
          }), { empty: 'Brak terminów umów.' }))
        ])
      ]),
      card('Oś czasu projektów', 'od założenia do terminu umowy; wypełnienie = postęp rzeczowy, czerwony pas = czas po terminie', Charts.timeline(timeline, now, { onPick: function (id) { ctx.actions.openAnalysisProject(id); } })),
      D.el('div', { class: 'an-grid an-grid--2' }, [
        card('Godziny w ostatnich 12 tygodniach', 'zapisany czas wszystkich osób, warstwy = projekty, linia = średnia krocząca', D.el('div', { class: 'an-weekly' }, [
          Charts.weekly(data.weekly),
          D.el('ul', { class: 'an-legend an-legend--inline' }, data.weekly.series.filter(function (x) { return x.values.some(Boolean); }).map(function (x) { var k = data.weekly.series.indexOf(x); return D.el('li', null, [D.el('i', { class: 'an-sw ch-c' + (k % 8) }), D.el('span', { text: x.code })]); }))
        ])),
        card('Gdzie idą godziny', 'zużycie wg zamawiającego', hbars(data.clients.slice(0, 6).map(function (c) { return { label: c.client, value: c.used, text: F.hours(c.used), tip: F.count(c.projects, 'projekt', 'projekty', 'projektów') }; }), { empty: 'Brak zapisanych godzin.' }))
      ]),
      next ? null : null
    ];
  }

  function projectsView(data, selected, ctx, now) {
    return [
      card('Wszystkie projekty', 'kliknij projekt, aby zobaczyć szczegóły poniżej', table(data, selected.id, ctx)),
      detail(selected, data, ctx, now)
    ];
  }

  function teamView(data, ctx) {
    var t = data.totals;
    var over = data.team.filter(function (r) { return r.utilization > 105; });
    var rows = data.team;
    var mixMax = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1]));
    return [
      D.el('div', { class: 'an-kpis' }, [
        tile('Obłożenie zespołu', D.el('div', { class: 'an-tile__ring' }, [Charts.ring(t.utilization, { tone: t.utilization > 105 ? 'bad' : (t.utilization > 85 ? 'warn' : 'ok') }), D.el('div', { class: 'an-tile__nums' }, [D.el('b', { class: 't-num', text: F.number(t.avg4) + ' h' }), D.el('span', { text: 'tygodniowo (śr. 4 tyg.)' })])]), over.length ? 'warn' : null),
        tile('Osoby przeciążone', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: String(over.length) }), D.el('span', { text: 'powyżej ' + data.capacity + ' h/tydz.' })]), over.length ? 'bad' : null, D.el('div', { class: 'an-tile__sub', text: over.length ? over.map(function (r) { return r.person ? r.person.firstName : '?'; }).join(', ') : 'Nikt nie przekracza normy' })),
        tile('Zapisujących czas', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: String(data.team.length) }), D.el('span', { text: 'osób w 12 tygodniach' })])),
        tile('Najwięcej godzin', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: rows[0] ? F.number(rows[0].total) + ' h' : '—' })]), null, D.el('div', { class: 'an-tile__sub', text: rows[0] && rows[0].person ? Team.fullName(rows[0].person) : '' }))
      ]),
      card('Obłożenie tydzień po tygodniu', 'godziny zapisane przez osobę; barwa = udział w tygodniu pracy (' + data.capacity + ' h)', heatmap(data)),
      D.el('div', { class: 'an-grid an-grid--2' }, [
        card('Nad czym pracują', 'godziny wg projektu, 12 tygodni', D.el('ul', { class: 'an-mix' }, rows.map(function (r) {
          return D.el('li', { class: 'an-mix__row' }, [
            D.el('span', { class: 'an-hb__label truncate', text: r.person ? Team.fullName(r.person) : 'Nieznana osoba' }),
            D.el('span', { class: 'an-mix__bar', style: { width: (r.total / mixMax) * 100 + '%' } }, r.projects.slice(0, 6).map(function (pr, k) {
              return D.el('i', { class: 'ch-c' + (data.weekly.series.map(function (x) { return String(x.id); }).indexOf(String(pr.id)) % 8), style: { width: (pr.hours / r.total) * 100 + '%' }, attrs: { 'data-tooltip': pr.code + ': ' + F.hours(pr.hours) } });
            })),
            D.el('b', { class: 't-num an-hb__val', text: F.hours(r.total) })
          ]);
        }))),
        card('Wykorzystanie stawki', data.management ? 'koszt pracy osoby w 12 tygodniach' : 'szczegóły kosztów widzi zarząd', data.management
          ? hbars(rows.filter(function (r) { return r.cost > 0; }).map(function (r) { return { label: r.person ? Team.fullName(r.person) : '?', value: r.cost, text: pln(r.cost), tip: pln(r.rate) + '/h' }; }), { empty: 'Uzupełnij stawki godzinowe osób w katalogu Zespół.' })
          : D.el('p', { class: 'an-empty', text: 'Koszty widzi zarząd.' }))
      ])
    ];
  }

  function financeView(data, ctx) {
    var t = data.totals;
    var rows = data.projects.filter(function (p) { return p.finance; });
    if (!rows.length) return [UI.emptyState({ icon: 'layers', title: 'Brak danych finansowych', text: 'Wpisz wartość umowy w edycji projektu i koszt godziny osób w katalogu Zespół. Wtedy zobaczysz marże, przychód na godzinę i koncentrację klientów.' })];
    var marginPct = t.value ? (t.margin / t.value) * 100 : 0;
    var earnedPct = t.earnedValue ? (t.earnedMargin / t.earnedValue) * 100 : 0;
    var byMargin = rows.slice().sort(function (a, b) { return a.finance.earnedMargin - b.finance.earnedMargin; });
    var perHour = rows.filter(function (p) { return p.finance.perHour !== null; });
    var maxHour = Math.max.apply(null, perHour.map(function (p) { return Math.max(p.finance.perHour, p.finance.rate); }).concat([1]));
    var clients = data.clients.filter(function (c) { return c.value > 0; }).sort(function (a, b) { return b.value - a.value; });
    return [
      D.el('div', { class: 'an-kpis an-kpis--5' }, [
        tile('Wartość umów', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: pln(t.value) })]), null, D.el('div', { class: 'an-tile__sub', text: F.count(t.financeProjects, 'projekt', 'projekty', 'projektów') + ' z wartością' })),
        tile('Koszt pracy', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: pln(t.cost) })]), null, D.el('div', { class: 'an-tile__sub', text: 'godziny × stawki osób' })),
        tile('Wartość wypracowana', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: pln(t.earnedValue) })]), null, D.el('div', { class: 'an-tile__sub', text: 'umowa × postęp rzeczowy' })),
        tile('Marża na wykonanej pracy', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: pln(t.earnedMargin) })]), earnedPct < 0 ? 'bad' : (earnedPct < 20 ? 'warn' : 'ok'), D.el('div', { class: 'an-tile__sub', text: Math.round(earnedPct) + '% wartości wypracowanej' })),
        tile('Marża po prognozie', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: pln(t.forecastMargin) })]), t.forecastMargin < 0 ? 'bad' : null, D.el('div', { class: 'an-tile__sub', text: 'jeśli każdy projekt skończy wg prognozy · gotówkowo dziś ' + Math.round(marginPct) + '%' }))
      ]),
      D.el('div', { class: 'an-grid an-grid--2' }, [
        card('Marża na wykonanej pracy', 'wartość wypracowana minus koszt; czerwone = praca kosztuje więcej, niż jest warta', diverging(byMargin.map(function (p) {
          return { code: p.code, label: p.name, value: p.finance.earnedMargin, text: pln(p.finance.earnedMargin) + (p.finance.earnedMarginPct === null ? '' : ' · ' + p.finance.earnedMarginPct + '%'), tip: 'Po prognozie: ' + (p.finance.forecastMargin === null ? '—' : pln(p.finance.forecastMargin)) };
        }))),
        card('Przychód na godzinę a koszt godziny', 'pasek = przychód z umowy na zapisaną godzinę, kreska = średni koszt godziny w projekcie', hbars(perHour.map(function (p) {
          return { code: p.code, label: p.name, value: p.finance.perHour, mark: p.finance.rate, max: maxHour, tone: p.finance.perHour < p.finance.rate ? 'bad' : 'flow', text: pln(p.finance.perHour) + '/h', tip: 'Koszt godziny ' + pln(p.finance.rate) };
        }), { empty: 'Brak zapisanych godzin.' }))
      ]),
      D.el('div', { class: 'an-grid an-grid--2' }, [
        card('Koncentracja klientów', 'udział w wartości umów', hbars(clients.map(function (c) { return { label: c.client, value: c.value, text: Math.round((c.value / (t.value || 1)) * 100) + '% · ' + pln(c.value) }; }), { empty: 'Brak wartości umów.' })),
        card('Budżet kosztowy a prognoza', 'planowany koszt godzin vs prognozowany przy obecnej efektywności', hbars(rows.filter(function (p) { return p.status !== 'done' && p.finance.forecastCost !== null; }).map(function (p) {
          return { code: p.code, label: p.name, value: p.finance.forecastCost, mark: p.finance.budgetCost, tone: p.finance.forecastCost > p.finance.budgetCost * 1.05 ? 'warn' : 'flow', text: pln(p.finance.forecastCost), tip: 'Plan ' + pln(p.finance.budgetCost) };
        }), { empty: 'Prognoza pojawi się po pierwszych ukończonych etapach.' }))
      ])
    ];
  }

  function calibrationView(data) {
    var kinds = data.byKind.filter(function (k) { return k.planned > 0; });
    var cal = data.calibration;
    var worst = cal.filter(function (c) { return c.n >= 1 && Math.abs(c.ratio - 1) >= 0.1; }).slice(0, 5);
    return [
      D.el('div', { class: 'an-kpis' }, [
        tile('Trafność wycen', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: data.accuracy ? Math.round(data.accuracy.avgRatio * 100) + '%' : '—' }), D.el('span', { text: 'plan → rzeczywistość' })]), data.accuracy && Math.abs(data.accuracy.avgRatio - 1) > 0.1 ? 'warn' : null, D.el('div', { class: 'an-tile__sub', text: data.accuracy ? 'z ' + F.count(data.accuracy.n, 'zamkniętego projektu', 'zamkniętych projektów', 'zamkniętych projektów') + ' (100% = idealnie)' : 'pojawi się po zamknięciu pierwszego projektu' })),
        tile('Etapy do przeceny', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: String(worst.length) }), D.el('span', { text: 'odchylenie ≥ 10%' })]), worst.length ? 'warn' : null, D.el('div', { class: 'an-tile__sub', text: 'na podstawie ukończonych etapów' })),
        tile('Przyjęte etapy', D.el('div', { class: 'an-tile__big' }, [D.el('b', { class: 't-num', text: String(cal.length) }), D.el('span', { text: 'z historią zakończenia' })]))
      ]),
      D.el('div', { class: 'an-grid an-grid--2' }, [
        card('Plan a rzeczywistość wg rodzaju pracy', 'wszystkie widoczne projekty; kreska = plan', hbars(kinds.map(function (k) {
          var r = k.planned ? k.used / k.planned : 0;
          return { label: k.label, value: k.used, mark: k.planned, tone: r > 1.1 ? 'bad' : (r > 0.95 ? 'warn' : 'flow'), text: F.hours(k.used) + ' / ' + F.hours(k.planned), tip: Math.round(r * 100) + '% planu' };
        }), { empty: 'Brak danych.' })),
        card('Kalibracja etapów', 'ukończone etapy ze standardu: średnie godziny faktyczne a zaplanowane', cal.length ? D.el('div', { class: 'an-cal' }, [
          D.el('div', { class: 'an-cal__row an-cal__row--head' }, ['Etap', 'Plan', 'Fakt', 'Wskaźnik'].map(function (h) { return D.el('span', { text: h }); }))
        ].concat(cal.slice(0, 10).map(function (c) {
          return D.el('div', { class: 'an-cal__row' }, [
            D.el('span', { class: 'truncate', text: c.name, attrs: { title: c.name + ' (' + c.n + ' ' + (c.n === 1 ? 'projekt' : 'projekty') + ')' } }),
            D.el('span', { class: 't-num', text: F.hours(c.plannedAvg) }),
            D.el('span', { class: 't-num', text: F.hours(c.usedAvg) }),
            D.el('b', { class: 't-num an-cal__r' + (c.ratio > 1.1 ? ' is-bad' : (c.ratio < 0.9 ? ' is-ok' : '')), text: Math.round(c.ratio * 100) + '%' })
          ]);
        }))) : D.el('p', { class: 'an-empty', text: 'Po zakończeniu etapów zobaczysz, które wyceniasz za nisko lub za wysoko.' }))
      ]),
      worst.length ? card('Wskazówki do następnych wycen', 'na podstawie historii; uwzględnij je przy wpisywaniu budżetu godzin nowego projektu', D.el('ul', { class: 'an-tips' }, worst.map(function (c) {
        var pct = Math.round((c.ratio - 1) * 100);
        return D.el('li', null, [D.el('b', { text: c.name }), ' — ' + (pct > 0 ? 'zwykle zajmuje o ' + pct + '% więcej, niż planujesz (' + F.hours(c.usedAvg) + ' przy planie ' + F.hours(c.plannedAvg) + ').' : 'zwykle idzie o ' + Math.abs(pct) + '% szybciej (' + F.hours(c.usedAvg) + ' przy planie ' + F.hours(c.plannedAvg) + ').')]);
      }))) : null
    ];
  }

  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    var now = new Date();
    if (!me) {
      return { summary: 'Analiza projektów dla lidera i zarządu.', tools: null, body: E.Welcome.card(state, ctx, 'Analiza pokazuje zużycie godzin, prognozy i opłacalność projektów, które możesz oceniać jako lider albo zarząd.') };
    }
    var data = Analysis.portfolio(state.workspace, me.id, now);
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
    var selected = data.projects.filter(function (p) { return p.id === state.analysisProject; })[0]
      || active.filter(function (p) { return p.verdict === 'risk'; })[0] || active[0] || data.projects[0];
    var tab = state.analysisTab || 'overview';
    if (tab === 'finance' && !data.management) tab = 'overview';
    var t = data.totals;
    var summary = F.count(t.active, 'projekt w toku', 'projekty w toku', 'projektów w toku') + ' · zużyto ' + t.usagePct + '% budżetu godzin' + (t.risk ? ' · ' + t.risk + ' zagrożone' : '');
    var content = tab === 'projects' ? projectsView(data, selected, ctx, now)
      : tab === 'team' ? teamView(data, ctx)
      : tab === 'finance' ? financeView(data, ctx)
      : tab === 'calibration' ? calibrationView(data)
      : overview(data, selected, ctx, now);
    return {
      summary: summary,
      tools: null,
      body: D.el('div', { class: 'an' }, [tabsBar({ tab: tab }, data, ctx)].concat(content.filter(Boolean)))
    };
  }

  root.ETROM.AnalysisScreen = { view: view, projectView: projectView, insight: insight, VERDICT: VERDICT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
