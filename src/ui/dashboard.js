/* ETROM — Pulpit: powitanie z datą, pogodą i wyjazdem, pięć kafli, „Ten tydzień”, sprawy, aktualności,
   stany wód (przykładowe) i zespół dziś. Pracownik i Dyrekcja mają ten sam układ; różnią się kafle
   i dodatkowe bloki Dyrekcji. Dane liczy się z istniejących modułów, tu jest tylko składanie widoku. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;
  var Cal = E.Calendar;
  var TL = E.TimeLog;

  var DOW = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var DOW_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
  var MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var MONTHS_UP = ['STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC', 'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ'];
  var GLYPH = { sun: '☀', 'cloud-sun': '⛅', cloud: '☁', rain: '🌧' };
  var CITY = 'Kraków';

  function hh(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }
  function greeting(now) { var h = now.getHours(); return h >= 5 && h < 18 ? 'Dzień dobry' : 'Dobry wieczór'; }
  function sampleTag() { return D.el('span', { class: 'db-sample', text: 'przykładowe', attrs: { 'data-tooltip': 'Dane przykładowe — źródło zostanie podłączone później' } }); }
  function nextWorkday(iso) { var d = Cal.addDays(iso, 1); while (!Cal.isWorkday(d)) d = Cal.addDays(d, 1); return d; }

  function weekOf(iso) {
    var d = Cal.parse(iso);
    var mon = Cal.addDays(iso, -((d.getDay() + 6) % 7));
    return { from: mon, to: Cal.addDays(mon, 6) };
  }

  /** Tripy osoby: najbliższy dziś albo kolejny dzień roboczy. */
  function tripChip(state, meId, todayIso) {
    var trips = state.workspace.trips || [];
    var t = E.Trips.onDay(trips, todayIso, meId)[0];
    var when = 'Dziś';
    if (!t) {
      var tom = Cal.addDays(todayIso, 1);
      t = E.Trips.onDay(trips, tom, meId)[0]; when = 'Jutro';
      if (!t) { var nxt = nextWorkday(todayIso); t = E.Trips.onDay(trips, nxt, meId)[0]; when = DOW[Cal.parse(nxt).getDay()].charAt(0).toUpperCase() + DOW[Cal.parse(nxt).getDay()].slice(1); }
    }
    if (!t) return null;
    return D.el('span', { class: 'db-chip db-chip--trip', attrs: { 'data-fk': 'db-trip' } }, [
      D.el('b', { text: when + ': ' + (E.Trips.KINDS[t.kind] || 'wyjazd').toLowerCase() }), D.el('span', { text: ' · ' + t.place })
    ]);
  }

  function weatherCard(now) {
    var w = E.Ambient.weather(CITY, now);
    return D.el('aside', { class: 'db-wx', attrs: { 'aria-label': 'Pogoda', 'data-fk': 'db-weather' } }, [
      D.el('div', { class: 'db-wx__top' }, [
        D.el('span', { class: 'db-wx__glyph', text: GLYPH[w.icon] || '☁', attrs: { 'aria-hidden': 'true' } }),
        D.el('div', null, [D.el('b', { class: 'db-wx__temp t-num', text: w.temp + '°' }), D.el('small', { text: w.label + ' · wiatr ' + w.wind + ' km/h' })]),
        D.el('span', { class: 'db-wx__city' }, [D.el('b', { text: w.city }), sampleTag()])
      ]),
      D.el('ul', { class: 'db-wx__days' }, w.days.map(function (d) {
        return D.el('li', null, [D.el('small', { text: d.dow }), D.el('span', { text: GLYPH[d.icon] || '☁', attrs: { 'aria-hidden': 'true' } }), D.el('b', { class: 't-num', text: d.max + '°' }), D.el('i', { class: 't-num', text: d.min + '°' })]);
      }))
    ]);
  }

  function hero(state, ctx, me, management, now) {
    var todayIso = Cal.isoOf(now);
    var chip = tripChip(state, me.id, todayIso);
    var wk = Cal.weekNumber(todayIso);
    return D.el('header', { class: 'db-hero' }, [
      D.el('div', { class: 'db-hero__main' }, [
        D.el('p', { class: 'db-hero__kicker', text: 'TYDZIEŃ ' + wk + ' · ' + MONTHS_UP[now.getMonth()] + ' ' + now.getFullYear() }),
        D.el('h1', { class: 'db-hero__date', id: 'dashboard-title', text: DOW[now.getDay()].charAt(0).toUpperCase() + DOW[now.getDay()].slice(1) + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] }),
        D.el('p', { class: 'db-hero__hello', text: greeting(now) + ', ' + (me.firstName || Team.fullName(me)) }),
        D.el('div', { class: 'db-hero__actions' }, [
          UI.button({ label: 'Zacznij pracę', icon: 'play', variant: 'primary', attrs: { 'data-fk': 'db-start' }, onClick: function () { ctx.actions.openMyWork(); } }),
          UI.button({ label: 'Wpis czasu', icon: 'plus', variant: 'secondary', attrs: { 'data-fk': 'db-time' }, onClick: function () { ctx.actions.addTimeEntry(); } }),
          management ? UI.button({ label: 'Nowy projekt', icon: 'plus', variant: 'secondary', attrs: { 'data-fk': 'db-newproject' }, onClick: function () { ctx.actions.openCreate(); } }) : null,
          chip
        ])
      ]),
      weatherCard(now)
    ]);
  }

  function tile(o) {
    var el = D.el(o.href ? 'a' : 'div', { class: 'db-tile' + (o.tone ? ' db-tile--' + o.tone : '') + (o.soon ? ' is-soon' : ''), attrs: Object.assign({ 'data-fk': o.fk }, o.href ? { href: o.href } : {}), on: o.onClick ? { click: o.onClick } : null }, [
      D.el('span', { class: 'db-tile__k', text: o.label }),
      D.el('b', { class: 'db-tile__v t-num', text: o.value }),
      D.el('small', { class: 'db-tile__s', text: o.sub || '' })
    ]);
    return el;
  }

  function planFor(state, now, weeks) {
    return E.Plan.build({
      projects: state.workspace.projects || [], people: (state.workspace.people || []).filter(function (p) { return p.active !== false; }),
      entries: state.workspace.entries || [], now: now, target: state.prefs.dayTarget, weeks: weeks, offsetWeeks: 0,
      absences: state.workspace.absences || [], trips: state.workspace.trips || []
    });
  }

  function registeredWeek(state, meId, now) {
    var w = weekOf(Cal.isoOf(now));
    var min = 0;
    for (var d = w.from; d <= w.to; d = Cal.addDays(d, 1)) min += TL.sum(TL.forDay(state.workspace.entries || [], meId, now, d), now);
    return min / 60;
  }

  function workerTiles(state, ctx, m, now) {
    var me = m.me;
    var target = Number(state.prefs.dayTarget) || 8;
    if (target > 24) target = target / 60;
    var todayMin = TL.sum(TL.forDay(state.workspace.entries || [], me.id, now), now);
    var plan = planFor(state, now, 1);
    var row = plan.rows.filter(function (r) { return r.personId === me.id; })[0];
    var wk = row && row.weeks[0] ? row.weeks[0] : { planned: 0, capacity: target * 5 };
    var reg = registeredWeek(state, me.id, now);
    var all = m.buckets.today.concat(m.buckets.week, m.buckets.later).filter(function (r) { return r.task.deadline; })
      .sort(function (a, b) { return String(a.task.deadline) < String(b.task.deadline) ? -1 : 1; });
    var nxt = all[0];
    var nd = nxt ? String(nxt.task.deadline).slice(0, 10) : '';
    return [
      tile({ fk: 'db-t-today', label: 'Dziś', value: todayMin >= 60 ? hh(todayMin / 60) + ' h' : todayMin + ' min', sub: 'z ' + hh(target) + ' h', onClick: function () { ctx.actions.addTimeEntry(); } }),
      tile({ fk: 'db-t-week', label: 'Ten tydzień', value: hh(reg) + ' / ' + hh(wk.planned) + ' h', sub: 'zarejestrowano · plan z ' + hh(wk.capacity) + ' h', href: '#/czas' }),
      tile({ fk: 'db-t-late', label: 'Po terminie', value: String(m.overdue), sub: m.overdue ? 'zadania do nadrobienia' : 'wszystko w terminie', tone: m.overdue ? 'alarm' : '', href: '#/moja-praca' }),
      tile({ fk: 'db-t-react', label: 'Wymaga reakcji', value: String(m.react.length), sub: m.react.length ? 'zatwierdzenia i pisma' : 'nic nie czeka', tone: m.react.length ? 'warn' : '', onClick: function () { ctx.actions.setMyView('react'); location.hash = '#/moja-praca'; } }),
      tile({ fk: 'db-t-next', label: 'Najbliższy termin', value: nd ? DOW_SHORT[Cal.parse(nd).getDay()] + ' ' + nd.slice(8) + '.' + nd.slice(5, 7) : '—', sub: nxt ? nxt.task.name : 'brak terminów', href: '#/moja-praca' })
    ];
  }

  function terminowosc(projects, now) {
    var from = now.getTime() - 90 * 86400000;
    var ok = 0, all = 0;
    projects.forEach(function (p) { (p.stages || []).forEach(function (s) { (s.tasks || []).forEach(function (t) {
      if (t.status !== 'done' || !t.deadline) return;
      var h = (t.history || []).filter(function (x) { return x.to === 'done'; }).pop();
      if (!h || !(Date.parse(h.at) >= from)) return;
      all += 1;
      if (String(h.at).slice(0, 10) <= String(t.deadline).slice(0, 10)) ok += 1;
    }); }); });
    return all ? Math.round(ok / all * 100) : null;
  }

  function managerTiles(state, ctx, m, now) {
    var projects = (state.workspace.projects || []).filter(function (p) { return p.status !== 'done'; });
    var risky = projects.filter(function (p) { var l = E.Insight.health(p, now).level; return l === 'alarm' || l === 'warning'; }).length;
    var plan = planFor(state, now, 1);
    var cap = 0, planned = 0;
    plan.rows.forEach(function (r) { if (r.weeks[0]) { cap += r.weeks[0].capacity; planned += r.weeks[0].planned; } });
    var load = cap ? Math.round(planned / cap * 100) : 0;
    var pend = E.LeaveScreen.pendingFor(state, m.me);
    var tm = terminowosc(state.workspace.projects || [], now);
    return [
      tile({ fk: 'db-t-risk', label: 'Projekty w ryzyku', value: risky + ' / ' + projects.length, sub: 'ostrzeżenia i alarmy', tone: risky ? 'warn' : '', href: '#/przeglad' }),
      tile({ fk: 'db-t-load', label: 'Obciążenie zespołu', value: load + '%', sub: 'plan tygodnia / dostępne godziny', tone: load > 100 ? 'alarm' : '', href: '#/plan' }),
      tile({ fk: 'db-t-approve', label: 'Do akceptacji', value: String(pend), sub: pend ? 'wnioski urlopowe' : 'nic nie czeka', tone: pend ? 'warn' : '', onClick: function () { ctx.actions.setLeave({ tab: 'inbox' }); location.hash = '#/urlopy'; } }),
      tile({ fk: 'db-t-ontime', label: 'Terminowość 90 dni', value: tm === null ? '—' : tm + '%', sub: tm === null ? 'za mało zakończonych zadań' : 'zadań zamkniętych w terminie', href: '#/analiza' }),
      tile({ fk: 'db-t-cost', label: 'Koszt vs budżet', value: '—', sub: 'moduł Finanse — wkrótce', soon: true })
    ];
  }

  function weekCard(state, ctx, now, seg) {
    var res = E.MyWork.listSections(state, ctx, seg === 'react' ? 'react' : (seg === 'today' ? 'today' : 'week'), now);
    var tabs = UI.segmented({
      label: 'Zakres listy', value: seg,
      items: [{ value: 'today', label: 'Dziś' }, { value: 'week', label: 'Ten tydzień' }, { value: 'react', label: 'Wymaga reakcji' }],
      onChange: function (value) { ctx.actions.setTime({ dashSeg: value }); }
    });
    return D.el('section', { class: 'db-card', attrs: { 'aria-label': 'Ten tydzień', 'data-fk': 'db-week' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Ten tydzień' }), tabs.node || tabs, D.el('a', { class: 'db-link', attrs: { href: '#/moja-praca' }, text: 'Otwórz w Mojej pracy →' })]),
      res.nodes.length ? D.el('div', { class: 'db-card__body' }, res.nodes) : D.el('p', { class: 'db-empty', text: 'Nic w tym zakresie. Czysty stół.' })
    ]);
  }

  function feedCard(state, ctx, me, now) {
    var res = E.Feed.build(state.workspace, me.id, now, { filter: 'all', limit: 12 });
    var items = res.items.filter(function (i) { return i.kind === 'post' || i.kind === 'event'; }).slice(0, 3);
    return D.el('section', { class: 'db-card', attrs: { 'aria-label': 'Aktualności', 'data-fk': 'db-feed' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Aktualności' }), D.el('a', { class: 'db-link', attrs: { href: '#/aktualnosci' }, text: 'Wszystkie →' })]),
      items.length ? D.el('ul', { class: 'db-list' }, items.map(function (i) {
        var text = i.kind === 'post' ? (i.post.text || i.post.title || 'Wpis') : (i.event.text || i.event.title || i.event.label || 'Zdarzenie w projekcie');
        return D.el('li', null, [D.el('b', { class: 'db-list__k', text: i.project ? i.project.code : 'Firma' }), D.el('span', { class: 'truncate', text: String(text).slice(0, 120) })]);
      })) : D.el('p', { class: 'db-empty', text: 'Brak nowych wpisów.' })
    ]);
  }

  function waterCard(now) {
    var lv = E.Ambient.waterLevels(now);
    var label = { ok: 'Stan normalny', warn: 'Ostrzegawczy', alarm: 'Alarmowy' };
    return D.el('section', { class: 'db-card db-card--side', attrs: { 'aria-label': 'Stany wód', 'data-fk': 'db-water' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Stany wód' }), sampleTag()]),
      D.el('ul', { class: 'db-water' }, lv.map(function (w) {
        return D.el('li', { class: 'db-water__row is-' + w.status }, [
          D.el('div', null, [D.el('b', { text: w.river }), D.el('small', { text: w.station })]),
          E.Charts.spark(w.series, { label: 'Trend stanu wody: ' + w.river }),
          D.el('div', { class: 'db-water__v' }, [D.el('b', { class: 't-num', text: w.level + ' ' + w.unit }), D.el('span', { class: 'db-cap db-cap--' + w.status, text: label[w.status] })])
        ]);
      }))
    ]);
  }

  /** Wyjątki od „wszyscy w biurze”: urlop, teren, spotkanie. */
  function teamToday(state, now) {
    var iso = Cal.isoOf(now);
    var people = (state.workspace.people || []).filter(function (p) { return p.active !== false; });
    var rows = [];
    people.forEach(function (p) {
      var ab = E.Absences.daysOf(state.workspace.absences || [], p.id)[iso];
      if (ab) { rows.push({ p: p, kind: 'leave', label: E.Absences.KINDS[ab] || 'Nieobecność' }); return; }
      var t = E.Trips.onDay(state.workspace.trips || [], iso, p.id)[0];
      if (t) rows.push({ p: p, kind: t.kind, label: E.Trips.KINDS[t.kind] + ' · ' + t.place });
    });
    return rows;
  }

  function teamCard(state, ctx, now) {
    var rows = teamToday(state, now);
    return D.el('section', { class: 'db-card db-card--side', attrs: { 'aria-label': 'Zespół dziś', 'data-fk': 'db-team' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Zespół dziś' }), D.el('a', { class: 'db-link', attrs: { href: '#/kalendarz' }, text: 'Kalendarz →' })]),
      rows.length ? D.el('ul', { class: 'db-team' }, rows.map(function (r) {
        return D.el('li', null, [E.Avatar.avatar(r.p, { size: 'sm', tooltip: false }), D.el('span', { class: 'truncate', text: Team.fullName(r.p) }), D.el('span', { class: 'db-cap db-cap--' + r.kind, text: r.label })]);
      })) : D.el('p', { class: 'db-empty', text: 'Wszyscy w biurze.' }),
      D.el('p', { class: 'db-foot', text: 'Brak oznaczenia = w biurze.' })
    ]);
  }

  function matrixCard(state, ctx, now) {
    var plan = planFor(state, now, 2);
    var days = [];
    var d = Cal.isoOf(now);
    if (!Cal.isWorkday(d)) d = nextWorkday(d);
    while (days.length < 5) { days.push(d); d = nextWorkday(d); }
    var absences = state.workspace.absences || [];
    var dayH = Number(state.prefs.dayTarget) || 8;
    if (dayH > 24) dayH = dayH / 60;
    var rows = plan.rows.slice(0, 12).map(function (r) {
      var person = Team.findPerson(state.workspace.people || [], r.personId);
      if (!person) return null;
      var abs = E.Absences.daysOf(absences, r.personId);
      return D.el('tr', null, [D.el('th', { attrs: { scope: 'row' } }, [D.el('span', { class: 'truncate', text: Team.fullName(person) })])].concat(days.map(function (day) {
        var t = E.Trips.onDay(state.workspace.trips || [], day, r.personId)[0];
        if (abs[day]) return D.el('td', null, [D.el('span', { class: 'db-cap db-cap--leave', text: 'urlop' })]);
        if (t) return D.el('td', null, [D.el('span', { class: 'db-cap db-cap--' + t.kind, text: t.kind === 'meeting' ? 'spotkanie' : 'teren', attrs: { 'data-tooltip': t.place } })]);
        var h = r.days[day] || 0;
        return D.el('td', null, [D.el('span', { class: 'db-cap db-cap--h' + (h > dayH ? ' is-over' : ''), text: h ? hh(h) + ' h' : '—' })]);
      })));
    }).filter(Boolean);
    return D.el('section', { class: 'db-card', attrs: { 'aria-label': 'Zespół — najbliższe dni', 'data-fk': 'db-matrix' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Zespół — najbliższe 5 dni roboczych' }), D.el('a', { class: 'db-link', attrs: { href: '#/plan' }, text: 'Plan →' })]),
      D.el('div', { class: 'db-scroll' }, [D.el('table', { class: 'db-matrix' }, [
        D.el('thead', null, [D.el('tr', null, [D.el('th', { attrs: { scope: 'col' }, text: 'Osoba' })].concat(days.map(function (day) { return D.el('th', { attrs: { scope: 'col' }, text: DOW_SHORT[Cal.parse(day).getDay()] + ' ' + day.slice(8) }); })))]),
        D.el('tbody', null, rows)
      ])])
    ]);
  }

  function healthCard(state, ctx, now) {
    var list = (state.workspace.projects || []).filter(function (p) { return p.status !== 'done'; }).map(function (p) { return { p: p, h: E.Insight.health(p, now) }; })
      .filter(function (x) { return x.h.level === 'alarm' || x.h.level === 'warning'; })
      .sort(function (a, b) { return (a.h.level === 'alarm' ? 0 : 1) - (b.h.level === 'alarm' ? 0 : 1); }).slice(0, 5);
    return D.el('section', { class: 'db-card', attrs: { 'aria-label': 'Zdrowie projektów', 'data-fk': 'db-health' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Zdrowie projektów' }), D.el('a', { class: 'db-link', attrs: { href: '#/przeglad' }, text: 'Przegląd →' })]),
      list.length ? D.el('ul', { class: 'db-list' }, list.map(function (x) {
        return D.el('li', null, [D.el('button', { class: 'db-list__btn', attrs: { type: 'button' }, on: { click: function () { ctx.actions.openProject(x.p.id, 'etapy'); } } }, [
          D.el('b', { class: 'db-list__k', text: x.p.code }), D.el('span', { class: 'truncate', text: x.p.name }),
          D.el('span', { class: 'db-cap db-cap--' + (x.h.level === 'alarm' ? 'alarm' : 'warn'), text: x.h.reasons[0] ? x.h.reasons[0].text : x.h.label })
        ])]);
      })) : D.el('p', { class: 'db-empty', text: 'Żaden projekt nie jest w ryzyku.' })
    ]);
  }

  function approveCard(state, ctx, me) {
    var pend = (state.workspace.absences || []).filter(function (a) { return a.status === 'pending' && a.personId !== me.id; }).slice(0, 4);
    return D.el('section', { class: 'db-card db-card--side', attrs: { 'aria-label': 'Do akceptacji', 'data-fk': 'db-approve' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Do akceptacji' }), D.el('a', { class: 'db-link', attrs: { href: '#/urlopy' }, text: 'Urlopy →' })]),
      pend.length ? D.el('ul', { class: 'db-list' }, pend.map(function (a) {
        var p = Team.findPerson(state.workspace.people || [], a.personId);
        return D.el('li', null, [D.el('b', { class: 'db-list__k', text: p ? (p.firstName || Team.fullName(p)) : '—' }), D.el('span', { class: 'truncate', text: (E.Absences.KINDS[a.kind] || 'Urlop') + ' ' + a.from.slice(8) + '.' + a.from.slice(5, 7) + (a.to !== a.from ? '–' + a.to.slice(8) + '.' + a.to.slice(5, 7) : '') })]);
      })) : D.el('p', { class: 'db-empty', text: 'Nic nie czeka na decyzję.' })
    ]);
  }

  function financeCard() {
    return D.el('section', { class: 'db-card db-card--side db-card--soon', attrs: { 'aria-label': 'Finanse', 'data-fk': 'db-finance' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Finanse' }), D.el('span', { class: 'db-cap db-cap--soon', text: 'WKRÓTCE' })]),
      D.el('p', { class: 'db-empty', text: 'Koszt vs budżet i rentowność pojawią się po uruchomieniu modułu Finanse.' })
    ]);
  }

  function view(state, ctx) {
    var people = state.workspace.people || [];
    var now = new Date();
    var m = E.MyWork.model(state, now);
    if (!m) return { summary: '', body: E.Welcome.card(state, ctx, 'Pulpit pokazuje Twój dzień i tydzień. Wybierz, kim jesteś.') };
    var me = m.me;
    var management = E.Budget.isManagement(me.id, people);
    var c = Object.assign({}, ctx, { people: people, meId: me.id, state: state });
    var seg = ['today', 'week', 'react'].indexOf(state.dashSeg) >= 0 ? state.dashSeg : 'week';
    var tiles = management ? managerTiles(state, ctx, m, now) : workerTiles(state, ctx, m, now);

    var caseEl = E.CaseUI.section(state, c, 'all');
    var center = [weekCard(state, ctx, now, seg)];
    if (management) center.push(matrixCard(state, ctx, now), healthCard(state, ctx, now));
    center.push(D.el('div', { class: 'db-pair' }, [caseEl ? D.el('div', { class: 'db-card db-card--cases' }, [caseEl]) : null, feedCard(state, ctx, me, now)].filter(Boolean)));

    var react = m.react.length ? D.el('section', { class: 'db-card db-card--side', attrs: { 'aria-label': 'Wymaga reakcji', 'data-fk': 'db-react' } }, [
      D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Wymaga reakcji' }), D.el('span', { class: 'db-cap db-cap--warn', text: String(m.react.length) }), D.el('a', { class: 'db-link', attrs: { href: '#/moja-praca' }, text: 'Skrzynka →', on: null })]),
      D.el('ul', { class: 'db-list' }, m.react.slice(0, 4).map(function (i) {
        return D.el('li', null, [D.el('button', { class: 'db-list__btn', attrs: { type: 'button' }, on: { click: function () { ctx.actions.setMyView('react'); location.hash = '#/moja-praca'; } } }, [
          D.el('b', { class: 'db-list__k', text: i.project ? i.project.code : '' }), D.el('span', { class: 'truncate', text: i.title || i.detail || 'Do reakcji' }), i.urgent ? D.el('span', { class: 'db-cap db-cap--alarm', text: 'pilne' }) : null
        ])]);
      }))
    ]) : null;
    var side = [];
    if (management) side.push(approveCard(state, ctx, me));
    else side.push(react ? react : D.el('section', { class: 'db-card db-card--side' }, [D.el('div', { class: 'db-card__head' }, [D.el('h2', { class: 'db-card__t', text: 'Wymaga reakcji' })]), D.el('p', { class: 'db-empty', text: 'Nic nie czeka.' })]));
    side.push(waterCard(now), teamCard(state, ctx, now));
    if (management) side.push(financeCard());

    return {
      summary: '',
      body: D.el('div', { class: 'db' }, [
        hero(state, ctx, me, management, now),
        D.el('div', { class: 'db-tiles', attrs: { 'aria-label': 'Najważniejsze liczby' } }, tiles),
        D.el('div', { class: 'db-cols' }, [D.el('div', { class: 'db-center' }, center), D.el('div', { class: 'db-side' }, side)])
      ])
    };
  }

  E.Dashboard = { view: view, teamToday: teamToday, weekOf: weekOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
