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

  /** Karta z przyciskiem zwijania w nagłówku. Zwinięta pokazuje tylko nagłówek i krótkie podsumowanie. */
  function collapsible(state, ctx, reg, id, el, summary) {
    if (!el) return el;
    reg.push(id);
    var head = el.querySelector('.db-card__head');
    if (!head) return el;
    var collapsed = ((state.prefs.dash || {}).collapsed || []).indexOf(id) >= 0;
    var title = head.querySelector('.db-card__t');
    var name = title ? title.textContent : 'kartę';
    el.setAttribute('data-card', id);
    if (collapsed) el.classList.add('is-collapsed');
    var btn = UI.iconButton({ label: (collapsed ? 'Rozwiń: ' : 'Zwiń: ') + name, icon: collapsed ? 'chevronRight' : 'chevronDown', size: 'sm', class: 'db-card__fold', attrs: { 'aria-expanded': collapsed ? 'false' : 'true', 'data-fk': 'db-fold-' + id }, onClick: function () { ctx.actions.toggleDashCard(id); } });
    head.insertBefore(btn, head.firstChild);
    if (summary) {
      var sum = D.el('span', { class: 'db-card__sum', text: summary });
      if (title && title.nextSibling) head.insertBefore(sum, title.nextSibling); else head.appendChild(sum);
    }
    return el;
  }

  // Ten sam przycisk przeżywa odświeżenie widoku, żeby otwarte okno nie traciło zakotwiczenia.
  var cust = { btn: null, state: null, ctx: null, role: 'worker', cards: [] };
  function customizeButton(state, ctx, role, cardIds) {
    cust.state = state; cust.ctx = ctx; cust.role = role; cust.cards = cardIds;
    if (!cust.btn) {
      cust.btn = UI.button({ label: 'Dostosuj pulpit', icon: 'settings', variant: 'secondary', attrs: { 'data-fk': 'db-customize' }, onClick: function (ev) { customize(ev.currentTarget, cust.state, cust.ctx, cust.role, cust.cards); } });
    }
    return cust.btn;
  }

  /** Okno „Dostosuj pulpit”: wybór i kolejność kafli oraz zwijanie wszystkich kart. */
  function customize(anchor, state, ctx, role, cardIds) {
    var DT = E.DashTiles;
    var box = D.el('div', { class: 'dbset' });
    function current() { return ctx.actions.dashPrefs(); }
    function paint() {
      var chosen = DT.resolve(current().tiles, role);
      var full = chosen.length >= DT.MAX;
      var rows = DT.pool(role).map(function (t) {
        var at = chosen.indexOf(t.id);
        var on = at >= 0;
        var lock = (on && chosen.length <= DT.MIN) || (!on && full);
        var input = D.el('input', { class: 'checkbox', attrs: { type: 'checkbox', id: 'dbset-' + t.id, checked: on, disabled: lock, 'data-fk': 'dbset-' + t.id } });
        input.addEventListener('change', function () { ctx.actions.setDash({ tiles: DT.toggle(current().tiles, role, t.id) }); paint(); });
        return D.el('li', { class: 'dbset__row' + (on ? ' is-on' : '') }, [
          D.el('label', { class: 'dbset__lbl', attrs: { for: 'dbset-' + t.id } }, [input, D.el('span', null, [D.el('b', { text: t.label }), D.el('small', { text: t.hint })])]),
          on ? D.el('span', { class: 'dbset__move' }, [
            UI.iconButton({ label: 'Przesuń w lewo: ' + t.label, icon: 'chevronLeft', size: 'sm', disabled: at === 0, onClick: function () { ctx.actions.setDash({ tiles: DT.move(current().tiles, role, t.id, -1) }); paint(); } }),
            UI.iconButton({ label: 'Przesuń w prawo: ' + t.label, icon: 'chevronRight', size: 'sm', disabled: at === chosen.length - 1, onClick: function () { ctx.actions.setDash({ tiles: DT.move(current().tiles, role, t.id, 1) }); paint(); } })
          ]) : null
        ]);
      });
      var collapsed = current().collapsed || [];
      var allFolded = cardIds.length > 0 && cardIds.every(function (id) { return collapsed.indexOf(id) >= 0; });
      D.render(box, [
        D.el('b', { class: 'dbset__t', text: 'Kafle na górze' }),
        D.el('p', { class: 'dbset__s t-muted', text: full ? 'Komplet (' + DT.MAX + '). Wyłącz któryś, żeby dodać inny.' : 'Od ' + DT.MIN + ' do ' + DT.MAX + ' kafli. Kolejność strzałkami.' }),
        D.el('ul', { class: 'dbset__list' }, rows),
        D.el('b', { class: 'dbset__t', text: 'Karty poniżej' }),
        D.el('div', { class: 'dbset__acts' }, [
          UI.button({ label: allFolded ? 'Rozwiń wszystkie' : 'Zwiń wszystkie', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'dbset-fold' }, onClick: function () { ctx.actions.setDash({ collapsed: allFolded ? [] : cardIds.slice() }); paint(); } }),
          UI.button({ label: 'Przywróć domyślne', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'dbset-reset' }, onClick: function () { ctx.actions.setDash({ tiles: [], collapsed: [] }); paint(); } })
        ])
      ]);
    }
    paint();
    E.Menu.open({ anchor: anchor, content: box, label: 'Dostosuj pulpit', align: 'end', minWidth: '22rem' });
  }

  function hero(state, ctx, me, management, now, cardIds) {
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
          customizeButton(state, ctx, management ? 'manager' : 'worker', cardIds),
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
    var box = E.InboxScreen.count(state, now) || { total: 0, urgent: 0 };
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
    var soonN = all.filter(function (r) { var d = String(r.task.deadline).slice(0, 10); return d >= Cal.isoOf(now) && d <= Cal.addDays(Cal.isoOf(now), 7); }).length;
    var bal = E.Absences.balance(state.workspace.absences || [], me, now);
    return {
      today: tile({ fk: 'db-t-today', label: 'Dziś', value: todayMin >= 60 ? hh(todayMin / 60) + ' h' : todayMin + ' min', sub: 'z ' + hh(target) + ' h', onClick: function () { ctx.actions.addTimeEntry(); } }),
      week: tile({ fk: 'db-t-week', label: 'Ten tydzień', value: hh(reg) + ' / ' + hh(wk.planned) + ' h', sub: 'zarejestrowano · plan z ' + hh(wk.capacity) + ' h', href: '#/czas' }),
      late: tile({ fk: 'db-t-late', label: 'Po terminie', value: String(m.overdue), sub: m.overdue ? 'zadania do nadrobienia' : 'wszystko w terminie', tone: m.overdue ? 'alarm' : '', href: '#/moja-praca' }),
      react: tile({ fk: 'db-t-react', label: 'W Skrzynce', value: String(box.total), sub: box.total ? (box.urgent ? box.urgent + ' pilne · czeka na Ciebie' : 'czeka na Ciebie') : 'nic nie czeka', tone: box.urgent ? 'alarm' : (box.total ? 'warn' : ''), href: '#/skrzynka' }),
      next: tile({ fk: 'db-t-next', label: 'Najbliższy termin', value: nd ? DOW_SHORT[Cal.parse(nd).getDay()] + ' ' + nd.slice(8) + '.' + nd.slice(5, 7) : '—', sub: nxt ? nxt.task.name : 'brak terminów', href: '#/moja-praca' }),
      soon: tile({ fk: 'db-t-soon', label: 'Terminy w 7 dni', value: String(soonN), sub: soonN ? 'moich zadań do zamknięcia' : 'brak terminów w tym tygodniu', href: '#/moja-praca' }),
      leave: tile({ fk: 'db-t-leave', label: 'Urlop do wykorzystania', value: bal.left + ' dni', sub: 'z ' + bal.total + ' w ' + bal.year + (bal.pending ? ' · ' + bal.pending + ' czeka na decyzję' : ''), href: '#/urlopy' })
    };
  }

  /** Zadania aktywnych projektów po terminie i z terminem w najbliższych 7 dniach. */
  function taskCounts(projects, now) {
    var today = Cal.isoOf(now);
    var limit = Cal.addDays(today, 7);
    var out = { late: 0, soon: 0 };
    projects.forEach(function (p) {
      if (p.status === 'done') return;
      (p.stages || []).forEach(function (st) { (st.tasks || []).forEach(function (t) {
        if (t.status === 'done' || !t.deadline) return;
        var d = String(t.deadline).slice(0, 10);
        if (d < today) out.late += 1; else if (d <= limit) out.soon += 1;
      }); });
    });
    return out;
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
    var box = E.InboxScreen.count(state, now) || { total: 0, urgent: 0 };
    var projects = (state.workspace.projects || []).filter(function (p) { return p.status !== 'done'; });
    var risky = projects.filter(function (p) { var l = E.Insight.health(p, now).level; return l === 'alarm' || l === 'warning'; }).length;
    var plan = planFor(state, now, 1);
    var cap = 0, planned = 0;
    plan.rows.forEach(function (r) { if (r.weeks[0]) { cap += r.weeks[0].capacity; planned += r.weeks[0].planned; } });
    var load = cap ? Math.round(planned / cap * 100) : 0;
    var pend = E.LeaveScreen.pendingFor(state, m.me);
    var tm = terminowosc(state.workspace.projects || [], now);
    var counts = taskCounts(state.workspace.projects || [], now);
    var absent = teamToday(state, now).length;
    return {
      risk: tile({ fk: 'db-t-risk', label: 'Projekty w ryzyku', value: risky + ' / ' + projects.length, sub: 'ostrzeżenia i alarmy', tone: risky ? 'warn' : '', href: '#/przeglad' }),
      load: tile({ fk: 'db-t-load', label: 'Obciążenie zespołu', value: load + '%', sub: 'plan tygodnia / dostępne godziny', tone: load > 100 ? 'alarm' : '', href: '#/plan' }),
      approve: tile({ fk: 'db-t-approve', label: 'Do akceptacji', value: String(pend), sub: pend ? 'wnioski urlopowe' : 'nic nie czeka', tone: pend ? 'warn' : '', onClick: function () { ctx.actions.setLeave({ tab: 'inbox' }); location.hash = '#/urlopy'; } }),
      react: tile({ fk: 'db-t-react', label: 'W Skrzynce', value: String(box.total), sub: box.total ? (box.urgent ? box.urgent + ' pilne · czeka na Ciebie' : 'czeka na Ciebie') : 'nic nie czeka', tone: box.urgent ? 'alarm' : (box.total ? 'warn' : ''), href: '#/skrzynka' }),
      late: tile({ fk: 'db-t-late', label: 'Zadania po terminie', value: String(counts.late), sub: counts.late ? 'w aktywnych projektach' : 'wszystko w terminie', tone: counts.late ? 'alarm' : '', href: '#/przeglad' }),
      soon: tile({ fk: 'db-t-soon', label: 'Terminy w 7 dni', value: String(counts.soon), sub: counts.soon ? 'zadań do zamknięcia' : 'brak terminów w tym tygodniu', href: '#/kalendarz' }),
      absent: tile({ fk: 'db-t-absent', label: 'Nieobecni dziś', value: String(absent), sub: absent ? 'urlopy i wyjazdy' : 'wszyscy w biurze', href: '#/kalendarz' }),
      ontime: tile({ fk: 'db-t-ontime', label: 'Terminowość 90 dni', value: tm === null ? '—' : tm + '%', sub: tm === null ? 'za mało zakończonych zadań' : 'zadań zamkniętych w terminie', href: '#/analiza' })
    };
  }

  function weekCard(state, ctx, now, seg) {
    var res = E.MyWork.listSections(state, ctx, seg === 'today' ? 'today' : 'week', now);
    var tabs = UI.segmented({
      label: 'Zakres listy', value: seg,
      items: [{ value: 'today', label: 'Dziś' }, { value: 'week', label: 'Ten tydzień' }],
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

  var KIND_SHORT = { approve: 'Zatwierdź', order: 'Zlecenie', leave: 'Wniosek', mail: 'Pismo', project: 'Alarm' };

  /** Skrzynka na Pulpicie: najpilniejsze pozycje; załatwia się je w Skrzynce, tu tylko podgląd i przejście. */
  function inboxCard(inbox) {
    var items = inbox ? inbox.items.slice(0, 4) : [];
    var total = inbox ? inbox.total : 0;
    return D.el('section', { class: 'db-card db-card--side', attrs: { 'aria-label': 'Skrzynka', 'data-fk': 'db-inbox' } }, [
      D.el('div', { class: 'db-card__head' }, [
        D.el('h2', { class: 'db-card__t', text: 'Skrzynka' }),
        total ? D.el('span', { class: 'db-cap db-cap--' + (inbox.urgent ? 'alarm' : 'warn'), text: String(total) }) : null,
        D.el('a', { class: 'db-link', attrs: { href: '#/skrzynka' }, text: 'Skrzynka →' })
      ]),
      items.length ? D.el('ul', { class: 'db-list' }, items.map(function (i) {
        return D.el('li', null, [D.el('a', { class: 'db-list__btn', attrs: { href: '#/skrzynka', 'data-fk': 'db-inbox-row' } }, [
          D.el('b', { class: 'db-list__k', text: KIND_SHORT[i.kind] || '' }),
          D.el('span', { class: 'truncate', text: i.title }),
          i.urgent ? D.el('span', { class: 'db-cap db-cap--alarm', text: 'pilne' }) : null
        ])]);
      })) : D.el('p', { class: 'db-empty', text: 'Nic nie czeka na Ciebie.' })
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
    var seg = ['today', 'week'].indexOf(state.dashSeg) >= 0 ? state.dashSeg : 'week';
    var role = E.DashTiles.roleOf(management);
    var pool = management ? managerTiles(state, ctx, m, now) : workerTiles(state, ctx, m, now);
    var tiles = E.DashTiles.resolve((state.prefs.dash || {}).tiles, role).map(function (id) { return pool[id]; }).filter(Boolean);
    var reg = [];
    function fold(id, el, summary) { return collapsible(state, ctx, reg, id, el, summary); }

    var caseEl = E.CaseUI.section(state, c, 'all');
    var center = [fold('week', weekCard(state, ctx, now, seg))];
    if (management) {
      var risky = (state.workspace.projects || []).filter(function (p) { if (p.status === 'done') return false; var l = E.Insight.health(p, now).level; return l === 'alarm' || l === 'warning'; }).length;
      center.push(fold('matrix', matrixCard(state, ctx, now)), fold('health', healthCard(state, ctx, now), risky ? risky + ' w ryzyku' : 'brak ryzyk'));
    }
    center.push(D.el('div', { class: 'db-pair' }, [caseEl ? D.el('div', { class: 'db-card db-card--cases' }, [caseEl]) : null, fold('feed', feedCard(state, ctx, me, now))].filter(Boolean)));

    var side = [];
    var inbox = E.InboxScreen.model(state, now);
    side.push(fold('inbox', inboxCard(inbox), inbox && inbox.total ? inbox.total + ' czeka' : 'nic nie czeka'));
    var away = teamToday(state, now).length;
    side.push(fold('water', waterCard(now)), fold('team', teamCard(state, ctx, now), away ? away + ' poza biurem' : 'wszyscy w biurze'));
    if (management) side.push(fold('finance', financeCard()));

    return {
      summary: '',
      body: D.el('div', { class: 'db' }, [
        hero(state, ctx, me, management, now, reg),
        D.el('div', { class: 'db-tiles', style: { '--n': String(tiles.length) }, attrs: { 'aria-label': 'Najważniejsze liczby' } }, tiles),
        D.el('div', { class: 'db-cols' }, [D.el('div', { class: 'db-center' }, center), D.el('div', { class: 'db-side' }, side)])
      ])
    };
  }

  E.Dashboard = { view: view, teamToday: teamToday, weekOf: weekOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
