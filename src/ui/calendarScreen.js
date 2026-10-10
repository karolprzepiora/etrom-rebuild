/* ETROM — ekran „Kalendarz”: jeden kalendarz w czterech widokach (Dzień, Tydzień, Miesiąc, Rok) z panelami z boku.
   Nieobecności i wnioski urlopowe to ciągłe paski z imieniem (wszyscy widzą wszystko, L4 innych jako „nieobecność”),
   terminy projektów, etapów i zadań oraz wyjazdy i spotkania to karteczki z tekstem; przełącznik „Pokaż” wybiera warstwę.
   Wspólne elementy: ui/calBars.js.
   Kto gdzie jest dziś i w tym tygodniu: zakładka Zespół.
   Dane i filtry: core/calview.js, ustawienia widoku pamiętane na urządzeniu (prefs.cal). Bez godzin i obciążenia. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;
  var Cal = E.Calendar;
  var CB = E.CalBars;
  var CV = E.CalView;

  var DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  var DOW_FULL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var MONTHS_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var VIEWS = [{ value: 'day', label: 'Dzień' }, { value: 'week', label: 'Tydzień' }, { value: 'month', label: 'Miesiąc' }, { value: 'year', label: 'Rok' }, { value: 'agenda', label: 'Agenda' }];
  var MAX_CHIPS = 3;

  function n2(n) { return n < 10 ? '0' + n : String(n); }
  function iso(y, m, d) { return y + '-' + n2(m + 1) + '-' + n2(d); }
  function longDay(key) { var d = Cal.parse(key); return DOW_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function monday(key) { var d = Cal.parse(key); return Cal.addDays(key, -((d.getDay() + 6) % 7)); }
  function monthLast(y, m) { return iso(y, m, new Date(y, m + 1, 0).getDate()); }
  function cap(t) { return t ? t[0].toUpperCase() + t.slice(1) : t; }

  function weekTitle(from, to) {
    var a = Cal.parse(from);
    var b = Cal.parse(to);
    var same = a.getMonth() === b.getMonth();
    return a.getDate() + (same ? '' : ' ' + MONTHS[a.getMonth()]) + '–' + b.getDate() + ' ' + MONTHS[b.getMonth()] + ' ' + b.getFullYear();
  }

  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    if (!me) return { summary: 'Terminy i nieobecności w kalendarzu.', body: E.Welcome.card(state, ctx, 'Kalendarz pokazuje terminy i nieobecności. Wybierz, kim jesteś.') };
    var now = new Date();
    var today = Cal.isoOf(now);
    var cal = state.prefs.cal || {};
    var mode = cal.view === 'day' || cal.view === 'week' || cal.view === 'year' || cal.view === 'agenda' ? cal.view : 'month';
    var management = E.Budget.isManagement(me.id, people);
    var visibility = (state.workspace.settings || {}).absenceVisibility;
    var anchor = state.calAnchor && /^\d{4}-\d{2}-\d{2}$/.test(state.calAnchor) ? state.calAnchor : today;
    var ad = Cal.parse(anchor);
    var year = ad.getFullYear();
    var month = ad.getMonth();

    var input = {
      projects: state.workspace.projects || [], people: people, absences: state.workspace.absences || [], trips: state.workspace.trips || [],
      meId: me.id, now: now, visibility: visibility,
      filters: { scope: cal.scope, hiddenPeople: cal.hiddenPeople, hiddenProjects: cal.hiddenProjects, hiddenKinds: cal.hiddenKinds }
    };
    var title;
    if (mode === 'month') { input.year = year; input.month = month; title = cap(MONTHS_NOM[month]) + ' ' + year; }
    else if (mode === 'day') { input.range = { from: anchor, to: anchor }; title = cap(longDay(anchor)) + ' ' + year; }
    else if (mode === 'week') { var mon = monday(anchor); input.range = { from: mon, to: Cal.addDays(mon, 6) }; title = weekTitle(input.range.from, input.range.to); }
    else if (mode === 'agenda') { input.range = { from: anchor, to: Cal.addDays(anchor, 29) }; title = 'Agenda: 30 dni od ' + anchor.slice(8, 10) + '.' + anchor.slice(5, 7); }
    else { input.range = { from: iso(year, 0, 1), to: iso(year, 11, 31) }; title = String(year); }
    var data = CV.build(input);
    var byKey = {};
    data.cells.forEach(function (c) { byKey[c.key] = c; });

    var selected = state.calDay && byKey[state.calDay] ? state.calDay : (byKey[today] ? today : data.cells[0] && (mode === 'month' ? iso(year, month, 1) : data.cells[0].key));
    var selCell = byKey[selected];
    var conflictDays = {};
    data.conflicts.forEach(function (x) { for (var d = x.day; d <= (x.to || x.day) && d < '9999'; d = Cal.addDays(d, 1)) conflictDays[d] = true; });

    function openEvent(ev) {
      if (ev.kind === 'task') ctx.actions.inspect({ kind: 'task', projectId: ev.projectId, stageId: ev.stageId, taskId: ev.taskId });
      else if (ev.kind === 'trip') ctx.actions.openTrip(ev.tripId);
      else if (ev.kind === 'absence') { if (management) ctx.actions.openAbsence(ev.personId, ev.absenceId); }
      else ctx.actions.openProject(ev.projectId, 'etapy');
    }
    function pickDay(key) { ctx.actions.setTime({ calDay: key }); }
    /** Kliknięcie dnia w Tygodniu, Miesiącu lub Roku otwiera ten dzień w widoku Dzień. */
    function openDay(key) { ctx.actions.setCal({ view: 'day' }); ctx.actions.setTime({ calAnchor: key, calDay: key }); }

    /* ---------- pasek narzędzi ---------- */
    function shift(dir) {
      var next;
      if (mode === 'day') next = Cal.addDays(anchor, dir);
      else if (mode === 'week') next = Cal.addDays(anchor, 7 * dir);
      else if (mode === 'agenda') next = Cal.addDays(anchor, 30 * dir);
      else if (mode === 'year') next = iso(year + dir, month, 1);
      else next = iso(new Date(year, month + dir, 1).getFullYear(), new Date(year, month + dir, 1).getMonth(), 1);
      ctx.actions.setTime({ calAnchor: next, calDay: null });
    }
    var unit = { day: 'dzień', month: 'miesiąc', week: 'tydzień', year: 'rok', agenda: '30 dni' }[mode];
    var switcher = UI.segmented({ label: 'Widok kalendarza', value: mode, items: VIEWS, onChange: function (v) { if (v === 'day') ctx.actions.setTime({ calAnchor: null, calDay: null }); ctx.actions.setCal({ view: v }); } });
    var hiddenCount = (cal.hiddenPeople || []).length + (cal.hiddenProjects || []).length + (cal.hiddenKinds || []).length + (cal.scope && cal.scope !== CV.defaultScope(management) ? 1 : 0);
    var addBtn = UI.button({ label: 'Wyjazd lub spotkanie', variant: 'primary', size: 'sm', icon: 'plus', attrs: { 'data-fk': 'cv-add' }, onClick: function () { ctx.actions.openTrip(null, selected); } });
    var toolbar = D.el('div', { class: 'cv-bar' }, [
      switcher.node,
      UI.iconButton({ icon: 'chevronLeft', label: 'Poprzedni ' + unit, size: 'sm', attrs: { 'data-fk': 'cv-prev' }, onClick: function () { shift(-1); } }),
      UI.iconButton({ icon: 'chevronRight', label: 'Następny ' + unit, size: 'sm', attrs: { 'data-fk': 'cv-next' }, onClick: function () { shift(1); } }),
      UI.button({ label: 'Dziś', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'cv-today', 'data-tooltip': 'D' }, onClick: function () { ctx.actions.setTime({ calAnchor: null, calDay: null }); } }),
      D.el('h2', { class: 'cv-title' }, [CB.dateJump({ text: title, value: anchor, fk: 'cv-jump', onPick: function (v) { ctx.actions.setTime({ calAnchor: v, calDay: v }); } })]),
      D.el('span', { class: 'cv-bar__fill' }),
      UI.button({ label: '.ics', variant: 'secondary', size: 'sm', icon: 'download', attrs: { 'data-fk': 'cv-ics', 'data-tooltip': 'Pobierz widoczny zakres do kalendarza w telefonie lub Outlooku' }, onClick: function () { ctx.actions.exportIcs(data.items, 'ETROM'); } }),
      addBtn
    ]);

    /* ---------- panel warstw ---------- */
    function opt(label, on, onToggle, lead, fk) {
      return D.el('button', { class: 'cv-opt' + (on ? ' is-on' : ''), attrs: { type: 'button', role: 'checkbox', 'aria-checked': String(on), 'data-fk': fk || null }, on: { click: onToggle } }, [
        D.el('i', { class: 'cv-opt__box', attrs: { 'aria-hidden': 'true' } }), lead || null, D.el('span', { class: 'truncate', text: label })
      ]);
    }
    function toggleIn(list, id) { var arr = (list || []).slice(); var i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); return arr; }
    var scopeSeg = UI.segmented({ label: 'Zakres', value: data.scope, items: [{ value: 'mine', label: 'Moje' }, { value: 'team', label: 'Mój zespół' }].concat([{ value: 'all', label: 'Wszyscy' }]), onChange: function (v) { ctx.actions.setCal({ scope: v }); } });
    var hiddenPeople = cal.hiddenPeople || [];
    var peopleOpts = data.candidates.map(function (p) {
      return opt(Team.fullName(p), hiddenPeople.indexOf(p.id) < 0, function () { ctx.actions.setCal({ hiddenPeople: toggleIn(hiddenPeople, p.id) }); }, E.Avatar.avatar(p, { size: 'xs' }), 'cv-p-' + p.id);
    });
    var hiddenProjects = cal.hiddenProjects || [];
    var projOpts = data.allProjects.map(function (p) {
      return opt(p.code + ' · ' + p.name, hiddenProjects.indexOf(p.projectId) < 0, function () { ctx.actions.setCal({ hiddenProjects: toggleIn(hiddenProjects, p.projectId) }); }, D.el('i', { class: 'cv-swatch', style: E.Identity.hueStyle(p.code), attrs: { 'aria-hidden': 'true' } }), 'cv-j-' + p.projectId);
    });
    var hiddenKinds = cal.hiddenKinds || [];
    var kindOpts = Object.keys(CV.KINDS).map(function (k) {
      return opt(CV.KINDS[k], hiddenKinds.indexOf(k) < 0, function () { ctx.actions.setCal({ hiddenKinds: toggleIn(hiddenKinds, k) }); }, D.el('i', { class: 'cv-swatch cv-swatch--' + k, attrs: { 'aria-hidden': 'true' } }), 'cv-k-' + k);
    });
    function section(name, children, reset) {
      return D.el('div', { class: 'cv-panel__sec' }, [D.el('div', { class: 'cv-panel__h' }, [D.el('span', { text: name }), reset || null])].concat(children));
    }
    var resetPeople = hiddenPeople.length ? UI.button({ label: 'Pokaż wszystkich', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.setCal({ hiddenPeople: [] }); } }) : null;
    var mini = E.LeaveScreen.miniMonth(year, month, function (key) {
      var c = byKey[key];
      var cls = (key === selected ? 'is-selected ' : '') + (c && c.events.some(function (e) { return e.kind === 'project' || e.kind === 'stage'; }) ? 'has-dl' : '');
      return { cls: cls.trim(), pressed: key === selected, onClick: function (k) { ctx.actions.setTime({ calAnchor: k, calDay: k }); } };
    }, today);
    var filtersSide = [
      mini,
      section('Zakres', [scopeSeg.node]),
      section('Osoby', peopleOpts.length ? [D.el('div', { class: 'cv-opts' }, peopleOpts)] : [D.el('p', { class: 'cv-empty', text: 'Brak osób w tym zakresie.' })], resetPeople),
      section('Projekty', projOpts.length ? [D.el('div', { class: 'cv-opts' }, projOpts)] : [D.el('p', { class: 'cv-empty', text: 'Brak projektów.' })]),
      section('Rodzaje', [D.el('div', { class: 'cv-opts' }, kindOpts)])
    ];

    /* ---------- elementy wspólne ---------- */
    function occ(c) {
      if (!c.total || !c.workday || c.out || !c.awayCount) return null;
      return D.el('span', { class: 'cv-occ' + (c.awayCount >= CV.THIN ? ' is-warn' : ''), text: c.present + '/' + c.total, attrs: { 'data-tooltip': 'Obecnych ' + c.present + ' z ' + c.total + ', nieobecnych ' + c.awayCount } });
    }

    /* ---------- kafle (miesiąc i tydzień) ---------- */
    var byPerson = {};
    people.forEach(function (p) { byPerson[p.id] = p; });
    function tileAttrs(c) {
      return { role: 'gridcell', tabindex: c.key === selected ? '0' : '-1', 'data-k': c.key, 'data-day': c.key, 'aria-label': longDay(c.key) + (c.holiday ? ', ' + c.holiday : '') + (c.events.length ? ', ' + c.events.length + ' wpisów' : ''), 'aria-selected': String(c.key === selected) };
    }
    /** Przeciągnięcie po dniach (miesiąc, tydzień) otwiera formularz wyjazdu z zakresem od–do. */
    function dragCreate(grid) {
      var start = null;
      var suppress = false;
      function dayOf(e) { var t = e.target && e.target.closest ? e.target.closest('[data-day]') : null; return t ? t.getAttribute('data-day') : null; }
      grid.addEventListener('pointerdown', function (e) { if (e.button === 0 && !(e.target.closest && e.target.closest('button, a, .cb-bar, .cb-chip, .cb-card'))) start = dayOf(e); else start = null; });
      grid.addEventListener('pointerup', function (e) {
        var from = start; start = null;
        var to = dayOf(e);
        if (!from || !to || from === to) return;
        suppress = true;
        window.setTimeout(function () { suppress = false; }, 0);
        ctx.actions.openTrip(null, from < to ? from : to, from < to ? to : from);
      });
      grid.addEventListener('click', function (e) { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
    }
    function gridKeys(grid) {
      grid.addEventListener('keydown', function (e) {
        var cur = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-k');
        if (!cur) return;
        var next = null;
        if (e.key === 'ArrowLeft') next = Cal.addDays(cur, -1);
        else if (e.key === 'ArrowRight') next = Cal.addDays(cur, 1);
        else if (e.key === 'ArrowUp') next = Cal.addDays(cur, -7);
        else if (e.key === 'ArrowDown') next = Cal.addDays(cur, 7);
        if (e.key === 'Enter' && mode !== 'day') { e.preventDefault(); openDay(cur); return; }
        if (!next) return;
        e.preventDefault();
        ctx.actions.setTime({ calDay: next, calAnchor: next });
        window.setTimeout(function () { var el = document.querySelector('.cb-day[data-k="' + next + '"]'); if (el) el.focus(); }, 30);
      });
    }

    /* ---------- paski nieobecności, karteczki i warstwy ---------- */
    var layer = ['abs', 'dl', 'trip'].indexOf(cal.layer) >= 0 ? cal.layer : 'all';
    var showAbs = layer === 'all' || layer === 'abs';
    function isDl(e) { return e.kind === 'project' || e.kind === 'stage' || e.kind === 'task'; }
    function evOk(e) { return layer === 'all' || (layer === 'dl' && isDl(e)) || (layer === 'trip' && e.kind === 'trip'); }
    function dayItems(c) { return c.events.filter(function (e) { return e.kind !== 'absence' && evOk(e); }); }
    function absLabel(ev, p) {
      var who = p ? Team.fullName(p).split(' ')[0] + ' ' + (Team.fullName(p).split(' ')[1] || '').charAt(0) + '.' : ev.title;
      var k = CB.kindOf(ev.absKind, ev.pending);
      var extra = { training: 'szkolenie', childcare: 'opieka nad dzieckiem', occasional: 'urlop okolicznościowy', unpaid: 'urlop bezpłatny' }[ev.absKind];
      return who.replace(/ \.$/, '') + ' · ' + (extra && !ev.pending ? extra : CB.TEXT[k]);
    }
    /** Jeden pasek na całą nieobecność w widocznych komórkach (z danych CalView), przycinany później do tygodnia. */
    function barsFrom(cells) {
      var seen = {};
      var out = [];
      cells.forEach(function (c) {
        c.events.forEach(function (ev) {
          if (ev.kind !== 'absence' || seen[ev.absenceId]) return;
          seen[ev.absenceId] = true;
          var p = byPerson[ev.personId];
          var tip = (p ? Team.fullName(p) : ev.title) + ' · ' + ev.sub.toLowerCase() + ' · ' + E.LeaveScreen.range(ev.from, ev.to, now);
          out.push({ from: ev.from, to: ev.to, kind: CB.kindOf(ev.absKind, ev.pending), label: absLabel(ev, p), tip: tip, fk: 'cv-ev-absence', onClick: management ? function () { openEvent(ev); } : null });
        });
      });
      return out;
    }
    function chipType(ev) { return ev.kind === 'trip' ? (ev.tripKind !== 'field' ? 'meet' : 'trip') : (ev.kind === 'task' ? 'task' : 'dl'); }
    function chipNode(ev) {
      var t = chipType(ev);
      var tip = (ev.code ? ev.code + ' · ' : '') + ev.title + (ev.project ? ' · ' + ev.project : '') + (ev.sub ? ' · ' + ev.sub : '');
      return D.el('button', { class: 'cb-chip cv-ev is-' + t + (ev.warn ? ' is-warn' : '') + (ev.code && t !== 'trip' && t !== 'meet' ? ' has-hue' : ''), style: ev.code && t !== 'trip' && t !== 'meet' ? E.Identity.hueStyle(ev.code) : null, attrs: { type: 'button', 'data-tooltip': tip, 'aria-label': tip, 'data-fk': 'cv-ev-' + ev.kind }, on: { click: function (e) { e.stopPropagation(); openEvent(ev); } } }, [
        ev.code && t !== 'trip' && t !== 'meet' ? D.el('b', { class: 'cb-chip__c', text: ev.code }) : null, D.el('span', { class: 'truncate', text: ev.title })
      ]);
    }
    function cardNode(ev) {
      var t = chipType(ev);
      return D.el('button', { class: 'cb-card cv-ev is-' + t + (ev.warn ? ' is-warn' : '') + (ev.code && t !== 'trip' && t !== 'meet' ? ' has-hue' : ''), style: ev.code && t !== 'trip' && t !== 'meet' ? E.Identity.hueStyle(ev.code) : null, attrs: { type: 'button', 'data-fk': 'cv-ev-' + ev.kind }, on: { click: function (e) { e.stopPropagation(); openEvent(ev); } } }, [
        ev.code && t !== 'trip' && t !== 'meet' ? D.el('b', { class: 'cb-chip__c', text: ev.code }) : null,
        D.el('span', { class: 'cb-card__t', text: ev.title }),
        ev.project || (t === 'trip' || t === 'meet') && ev.sub ? D.el('small', { class: 'truncate', text: ev.project || ev.sub }) : null
      ]);
    }
    function tileOf(c) {
      if (c.out) return {};
      return { cls: 'cb-day' + (c.key === selected ? ' is-sel' : ''), attrs: tileAttrs(c), onClick: function () { openDay(c.key); } };
    }
    function rangeCounts() {
      var inR = data.cells.filter(function (c) { return !c.out; });
      var trips = {};
      var dl = 0;
      inR.forEach(function (c) { c.events.forEach(function (e) { if (e.kind === 'trip') trips[e.tripId] = 1; else if (isDl(e)) dl += 1; }); });
      return { abs: barsFrom(inR).length, dl: dl, trip: Object.keys(trips).length };
    }
    function layerBar() {
      var n = rangeCounts();
      var seg = UI.segmented({ label: 'Pokaż warstwę kalendarza', value: layer, items: [
        { value: 'all', label: 'Wszystko' }, { value: 'abs', label: 'Nieobecności · ' + n.abs }, { value: 'dl', label: 'Terminy i zadania · ' + n.dl }, { value: 'trip', label: 'Wyjazdy i spotkania · ' + n.trip }
      ], onChange: function (v) { ctx.actions.setCal({ layer: v }); } });
      return D.el('div', { class: 'cb-layers', attrs: { 'data-fk': 'cv-layers' } }, [D.el('span', { class: 'cb-layers__l', text: 'Pokaż' }), seg.node]);
    }

    /** Telefon: zamiast małych kafli miesiąc jako lista dni z wpisami (kafle chowa CSS). */
    function agenda() {
      var days = [];
      data.cells.forEach(function (c) {
        if (c.out) return;
        var abs = showAbs ? c.events.filter(function (e) { return e.kind === 'absence'; }) : [];
        var items = dayItems(c);
        if (!abs.length && !items.length) return;
        days.push(D.el('section', { class: 'cv-ag__day' + (c.today ? ' is-today' : '') }, [
          D.el('button', { class: 'cv-ag__h', attrs: { type: 'button', 'data-fk': 'cv-ag-day' }, on: { click: function () { openDay(c.key); } } }, [longDay(c.key) + (c.holiday ? ' · ' + c.holiday : '')]),
          D.el('ul', { class: 'cv-ag__l' }, abs.map(function (e) {
            return D.el('li', { class: 'cv-ag__abs is-' + CB.kindOf(e.absKind, e.pending), text: absLabel(e, byPerson[e.personId]) });
          }).concat(items.map(function (e) { return D.el('li', null, [chipNode(e)]); })))
        ]));
      });
      return D.el('div', { class: 'cv-agenda', attrs: { 'data-fk': 'cv-agenda' } }, days.length ? days : [D.el('p', { class: 'cv-empty', text: 'Nic nie jest zaplanowane w tym zakresie.' })]);
    }

    /** Widok „Agenda”: lista dni z wpisami na 30 dni od wybranego dnia, na każdym ekranie. */
    function agendaView() {
      var node = agenda();
      node.classList.add('cv-agenda--page');
      return D.el('div', { class: 'cb cv-wrap' }, [node, CB.legendBar('calendar', { layer: layer })]);
    }

    /* ---------- widok: miesiąc ---------- */
    function monthGrid() {
      var parts = [D.el('div', { class: 'cb-dow' }, DOW.map(function (n) { return D.el('span', { text: n.toLowerCase(), attrs: { role: 'columnheader' } }); }))];
      var bars = showAbs ? barsFrom(data.cells) : [];
      var grid = D.el('div', { class: 'cb-grid', attrs: { role: 'grid', 'aria-label': title } });
      var mFirst = iso(year, month, 1);
      var mLast = monthLast(year, month);
      bars = bars.filter(function (b) { return b.to >= mFirst && b.from <= mLast; }).map(function (b) { return Object.assign({}, b, { from: b.from < mFirst ? mFirst : b.from, to: b.to > mLast ? mLast : b.to }); });
      for (var i = 0; i < data.cells.length; i += 7) {
        var wkDays = data.cells.slice(i, i + 7);
        if (wkDays.every(function (c) { return c.out; })) continue;
        grid.appendChild(CB.weekRow({
          days: wkDays, bars: bars, tile: tileOf,
          events: function (c) {
            var list = dayItems(c);
            var nodes = list.slice(0, 2).map(chipNode);
            if (list.length > 2) nodes.push(D.el('span', { class: 'cb-more', text: '+' + (list.length - 2) + ' więcej' }));
            return nodes;
          }
        }));
      }
      parts.push(grid);
      gridKeys(grid);
      dragCreate(grid);
      parts.push(agenda());
      return D.el('div', { class: 'cb cv-wrap' }, parts.concat([CB.legendBar('calendar', { layer: layer })]));
    }

    /* ---------- widok: tydzień ---------- */
    function weekView() {
      var keys = data.cells.map(function (c) { return c.key; });
      var lane = showAbs ? CB.lanes(barsFrom(data.cells), keys) : null;
      var cols = data.cells.map(function (c) {
        var list = dayItems(c);
        var t = tileOf(c);
        return D.el('div', { class: 'cb-wc ' + t.cls + (c.weekend ? ' is-weekend' : '') + (c.holiday ? ' is-hol' : '') + (c.today ? ' is-today' : ''), attrs: t.attrs, on: { click: t.onClick } }, [
          D.el('div', { class: 'cb-wc__h' }, [D.el('span', { text: c.day + ' ' + DOW[(Cal.parse(c.key).getDay() + 6) % 7].toLowerCase() }), occ(c)]),
          c.holiday ? D.el('small', { class: 'cb-hol', text: c.holiday }) : null
        ].concat(list.map(cardNode)));
      });
      var grid = D.el('div', { class: 'cb-wcols', attrs: { role: 'grid', 'aria-label': title } }, cols);
      gridKeys(grid);
      dragCreate(grid);
      return D.el('div', { class: 'cb cb--week cv-week' }, [
        lane ? D.el('div', { class: 'cb-lanehead', text: 'Nieobecni w tym tygodniu' }) : null, lane, grid, CB.legendBar('calendar', { layer: layer })
      ]);
    }

    /* ---------- widok: rok ---------- */
    function yearKind(key) {
      var c = byKey[key];
      if (!showAbs || !c || c.weekend || c.holiday) return null;
      return CB.top(c.events.filter(function (e) { return e.kind === 'absence'; }).map(function (e) { return CB.kindOf(e.absKind, e.pending); }));
    }
    function yearView() {
      var months = [];
      for (var m = 0; m < 12; m += 1) {
        months.push(E.LeaveScreen.miniMonth(year, m, function (key, wk, hol) {
          var c = byKey[key];
          if (!c) return null;
          var cls = CB.stripCls(yearKind, key);
          var evs = c.weekend || c.holiday ? [] : dayItems(c);
          if (evs.length) cls += ' has-ev has-ev-' + (evs.some(function (e) { return e.kind === 'trip' && e.tripKind === 'field'; }) ? 'trip' : (evs.some(function (e) { return e.kind === 'trip'; }) ? 'meet' : 'dl'));
          var tipParts = [];
          if (c.holiday) tipParts.push(c.holiday);
          c.events.filter(function (e) { return e.kind === 'absence'; }).forEach(function (e) { var p = byPerson[e.personId]; tipParts.push(absLabel(e, p)); });
          evs.slice(0, 3).forEach(function (e) { tipParts.push((e.code ? e.code + ' ' : '') + e.title); });
          return { cls: cls.trim(), tip: tipParts.join(' · '), onClick: function (k) { openDay(k); } };
        }, today));
      }
      return D.el('div', { class: 'cv-year lv-yearcal' }, [D.el('div', { class: 'lv-months' }, months), D.el('div', { class: 'lv-foot' }, [CB.legendBar('calendar', { layer: layer })])]);
    }

    /* ---------- panel dnia ---------- */
    function sideRow(ev) {
      return D.el('li', null, [D.el('button', { class: 'cv-row' + (ev.kind === 'absence' ? ' is-abs' : ev.kind === 'trip' ? ' is-trip' : ''), style: ev.kind === 'absence' || ev.kind === 'trip' ? null : E.Identity.hueStyle(ev.code), attrs: { type: 'button' }, on: { click: function () { openEvent(ev); } } }, [
        D.el('i', { class: 'cv-row__bar', attrs: { 'aria-hidden': 'true' } }),
        D.el('span', { class: 'cv-row__txt' }, [D.el('b', { class: 'truncate', text: ev.title }), D.el('small', { class: 'truncate', text: (ev.code ? ev.code + ' · ' : '') + (ev.project ? ev.project + ' · ' : '') + ev.sub })])
      ])]);
    }
    function daySide() {
      var dayList = selCell && selCell.events.length
        ? D.el('ul', { class: 'cv-list' }, selCell.events.map(sideRow))
        : D.el('p', { class: 'cv-empty', text: selCell && selCell.holiday ? selCell.holiday : 'Nic nie jest zaplanowane.' });
      var occLine = selCell && selCell.total && selCell.workday
        ? D.el('p', { class: 'cv-occline' + (selCell.awayCount >= CV.THIN ? ' is-warn' : ''), text: 'Obecnych ' + selCell.present + ' z ' + selCell.total + (selCell.awayCount ? ' · nieobecni: ' + selCell.away.map(function (id) { var p = Team.findPerson(people, id); return p ? Team.fullName(p) : ''; }).filter(Boolean).join(', ') : '') })
        : null;
      var dayConf = data.conflicts.filter(function (x) { return selected >= x.day && selected <= (x.to || x.day); });
      var confBox = dayConf.length ? D.el('ul', { class: 'cv-conf' }, dayConf.map(function (x) { return D.el('li', { text: x.text }); })) : null;
      var upcoming = data.upcoming.length ? D.el('ul', { class: 'cv-list' }, data.upcoming.map(function (ev) {
        var days = Math.round((Cal.parse(ev.key) - Cal.parse(today)) / 86400000);
        var row = sideRow(ev);
        row.querySelector('small').textContent = (ev.code ? ev.code + ' · ' : '') + (ev.project ? ev.project + ' · ' : '') + ev.sub + ' · ' + (days === 0 ? 'dziś' : (days === 1 ? 'jutro' : 'za ' + days + ' dni'));
        return row;
      })) : D.el('p', { class: 'cv-empty', text: 'Brak nadchodzących terminów.' });
      return [
        D.el('div', { class: 'cv-side__sec' }, [D.el('h3', { class: 'cv-side__t', text: selected ? longDay(selected) : '' }), occLine, confBox, dayList,
          ]),
        D.el('div', { class: 'cv-side__sec' }, [D.el('span', { class: 'cv-side__k', text: 'Najbliższe terminy' }), upcoming])
      ];
    }
    function warnSide() {
      return [D.el('ul', { class: 'cv-conf' }, data.conflicts.slice(0, 12).map(function (x) {
        return D.el('li', null, [D.el('button', { class: 'cv-conf__b', attrs: { type: 'button' }, on: { click: function () { ctx.actions.setTime({ calDay: x.day, calAnchor: x.day }); } } }, [D.el('b', { text: longDay(x.day) + ' · ' }), D.el('span', { text: x.text })])]);
      }))];
    }

    /* ---------- widok: dzień ---------- */
    function dayView() {
      var c = selCell || data.cells[0];
      if (!c) return D.el('p', { class: 'cv-empty', text: 'Brak danych.' });
      var abs = c.events.filter(function (e) { return e.kind === 'absence'; });
      var trips = c.events.filter(function (e) { return e.kind === 'trip'; });
      var deadlines = c.events.filter(function (e) { return e.kind !== 'absence' && e.kind !== 'trip'; });
      function group(name, list, rows, emptyText) {
        return D.el('section', { class: 'cv-dgroup' }, [
          D.el('h3', { class: 'cv-dgroup__t' }, [name, D.el('small', { text: String(list.length) })]),
          list.length ? D.el('div', { class: 'cv-dgrid' }, rows) : D.el('p', { class: 'cv-empty', text: emptyText })
        ]);
      }
      function dtile(ev) {
        return D.el('button', { class: 'cv-dtile' + (ev.kind === 'trip' ? ' is-trip' : '') + (ev.tripKind !== 'field' ? ' is-meet' : ''), style: ev.kind === 'trip' ? null : E.Identity.hueStyle(ev.code), attrs: { type: 'button', 'data-fk': 'cv-ev-' + ev.kind }, on: { click: function () { openEvent(ev); } } }, [
          D.el('i', { class: 'cv-dtile__bar', attrs: { 'aria-hidden': 'true' } }),
          D.el('span', { class: 'cv-dtile__t' }, [ev.code ? D.el('span', { class: 'cv-ev__code', text: ev.code }) : null, D.el('b', { text: ev.title })]),
          D.el('small', { text: (ev.project ? ev.project + ' · ' : '') + (ev.sub || '') })
        ]);
      }
      function atile(ev) {
        var p = byPerson[ev.personId];
        return D.el('div', { class: 'cv-dtile cv-dtile--abs' + (ev.pending ? ' is-pending' : ''), attrs: { 'data-fk': 'cv-ev-absence' } }, [
          p ? E.Avatar.avatar(p, { size: 'sm' }) : null,
          D.el('span', { class: 'cv-dtile__t' }, [D.el('b', { text: p ? Team.fullName(p) : ev.title })]),
          D.el('small', { text: ev.pending ? (ev.sub || 'Wniosek') : (ev.title || 'Nieobecność') })
        ]);
      }
      var head = D.el('div', { class: 'cv-dhead' }, [
        c.holiday ? D.el('span', { class: 'ts-pill is-hol', text: c.holiday }) : null,
        c.total && c.workday ? occ(c) : null
      ]);
      var conf = data.conflicts.filter(function (x) { return c.key >= x.day && c.key <= (x.to || x.day); });
      return D.el('div', { class: 'cv-day' }, [
        c.holiday || (c.total && c.workday) ? head : null,
        conf.length ? D.el('ul', { class: 'cv-conf' }, conf.map(function (x) { return D.el('li', { text: x.text }); })) : null,
        group('Terminy i zadania', deadlines, deadlines.map(dtile), 'Brak terminów w tym dniu.'),
        group('Wyjazdy i spotkania', trips, trips.map(dtile), 'Brak wyjazdów i spotkań.'),
        group('Nieobecności', abs, abs.map(atile), c.workday ? 'Wszyscy obecni.' : 'Dzień wolny.')
      ]);
    }

    /* ---------- cztery kafle statystyk (jak w Czasie) ---------- */
    function stat(label, value, sub) {
      return D.el('div', { class: 'ts-stat' }, [D.el('span', { class: 'ts-stat__l', text: label }), D.el('span', { class: 'ts-stat__v t-num', text: value }), sub ? D.el('span', { class: 'ts-stat__s', text: sub }) : null]);
    }
    function stats() {
      var inR = data.cells.filter(function (c) { return !c.out; });
      var dl = 0, absDays = 0, pend = 0, minPresent = null, minKey = null, tripIds = {}, trips = 0, meets = 0;
      /* Najmniejsza obsada patrzy w przód: dni, które już minęły, nie mówią nic o planowaniu. */
      var hasFuture = inR.some(function (c) { return c.key >= today; });
      inR.forEach(function (c) {
        c.events.forEach(function (e) {
          if (e.kind === 'trip') { if (!tripIds[e.tripId]) { tripIds[e.tripId] = 1; if (e.tripKind !== 'field') meets += 1; else trips += 1; } }
          else if (e.kind === 'absence') { if (e.pending) pend += 1; else if (c.workday) absDays += 1; }
          else dl += 1;
        });
        if (c.workday && c.total && (!hasFuture || c.key >= today) && (minPresent === null || c.present < minPresent)) { minPresent = c.present; minKey = c.key; }
      });
      var one = mode === 'day';
      var tot = inR[0] ? inR[0].total : 0;
      return D.el('div', { class: 'ts-stats cv-stats' }, [
        stat('Terminy', String(dl), F(dl, 'projekt, etap lub zadanie', 'projekty, etapy lub zadania', 'projektów, etapów lub zadań') + (one ? ' w tym dniu' : ' w okresie')),
        stat('Nieobecności', absDays ? (one ? F(absDays, 'osoba', 'osoby', 'osób') : F(absDays, 'dzień osobowy', 'dni osobowe', 'dni osobowych')) : 'brak', pend ? F(pend, 'wniosek czeka', 'wnioski czekają', 'wniosków czeka') + ' na decyzję' : 'bez wniosków w toku'),
        stat('Wyjazdy i spotkania', String(trips + meets), trips + meets ? F(trips, 'wyjazd', 'wyjazdy', 'wyjazdów') + ' · ' + F(meets, 'spotkanie', 'spotkania', 'spotkań') : 'nic nie zaplanowano'),
        stat(one ? 'Obsada' : 'Najmniejsza obsada', minPresent === null ? '—' : minPresent + ' z ' + tot, minPresent === null ? 'dni wolne' : (one ? 'osób obecnych' : 'osób obecnych · ' + longDay(minKey)))
      ]);
    }
    function F(n, a, b, c) { return E.Format.count(n, a, b, c); }

    var main = mode === 'agenda' ? agendaView() : mode === 'day' ? dayView() : mode === 'month' ? monthGrid() : mode === 'week' ? weekView() : yearView();
    var items = [{ id: 'filters', title: 'Filtry i warstwy', icon: 'filter', tone: 'accent', badge: hiddenCount ? String(hiddenCount) : '', side: filtersSide }];
    if (mode === 'month' || mode === 'week') items.push({ id: 'day', title: 'Wybrany dzień i najbliższe terminy', label: 'Dzień', icon: 'calendar', tone: 'violet', side: daySide() });
    if (data.conflicts.length) items.push({ id: 'warn', title: 'Uwaga w tym zakresie', icon: 'alert', tone: 'warn', badge: String(data.conflicts.length), late: true, side: warnSide() });
    var railPref = cal.rail || 'none';
    var openId = railPref === 'none' ? null : (items.some(function (it) { return it.id === railPref; }) ? railPref : null);
    var total = data.cells.reduce(function (n, c) { return n + (c.out ? 0 : c.events.filter(function (e) { return e.kind !== 'absence' && e.kind !== 'trip'; }).length); }, 0);
    return {
      summary: management ? 'Terminy projektów i etapów oraz nieobecności zespołu.' : 'Twoje terminy i nieobecności.',
      body: D.el('div', { class: 'cv' }, [toolbar,
        UI.railLayout({ id: 'calendar', cls: 'cv-rl', mainCls: 'cv-main', items: items, active: openId, main: [stats(), D.el('section', { class: 'an-card ts-calcard cv-card' }, [mode === 'day' ? null : layerBar(), main])], onSelect: function (id) { ctx.actions.setCal({ rail: id || 'none' }); } }),
        D.el('p', { class: 'sr-only', text: total + ' terminów w zakresie', attrs: { 'aria-live': 'polite' } })])
    };
  }

  E.CalendarScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
