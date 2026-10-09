/* ETROM — ekran „Kalendarz”: jeden kalendarz w czterech widokach (Miesiąc, Tydzień, Rok, Zespół) z panelem warstw po lewej.
   Terminy projektów, etapów i zadań, nieobecności, wyjazdy i święta. Nieobecności wyglądają tak samo jak w Urlopach
   (te same komponenty: LeaveScreen.miniMonth i teamTable); widoczność cudzych ustawia Dyrekcja.
   Dane i filtry: core/calview.js, ustawienia widoku pamiętane na urządzeniu (prefs.cal). Bez godzin i obciążenia. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;
  var Cal = E.Calendar;
  var CV = E.CalView;

  var DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  var DOW_FULL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var MONTHS_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var VIEWS = [{ value: 'month', label: 'Miesiąc' }, { value: 'week', label: 'Tydzień' }, { value: 'year', label: 'Rok' }, { value: 'team', label: 'Zespół' }];
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
    var mode = cal.view || 'month';
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
    else if (mode === 'week') { var mon = monday(anchor); input.range = { from: mon, to: Cal.addDays(mon, 6) }; title = weekTitle(input.range.from, input.range.to); }
    else if (mode === 'year') { input.range = { from: iso(year, 0, 1), to: iso(year, 11, 31) }; title = String(year); }
    else { input.range = { from: iso(year, month, 1), to: monthLast(year, month) }; title = cap(MONTHS_NOM[month]) + ' ' + year; }
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

    /* ---------- pasek narzędzi ---------- */
    function shift(dir) {
      var next;
      if (mode === 'week') next = Cal.addDays(anchor, 7 * dir);
      else if (mode === 'year') next = iso(year + dir, month, 1);
      else next = iso(new Date(year, month + dir, 1).getFullYear(), new Date(year, month + dir, 1).getMonth(), 1);
      ctx.actions.setTime({ calAnchor: next, calDay: null });
    }
    var unit = { month: 'miesiąc', week: 'tydzień', year: 'rok', team: 'miesiąc' }[mode];
    var switcher = UI.segmented({ label: 'Widok kalendarza', value: mode, items: VIEWS, onChange: function (v) { ctx.actions.setCal({ view: v }); } });
    var hiddenCount = (cal.hiddenPeople || []).length + (cal.hiddenProjects || []).length + (cal.hiddenKinds || []).length + (cal.scope && cal.scope !== CV.defaultScope(management) ? 1 : 0);
    var addBtn = UI.button({ label: 'Dodaj', variant: 'primary', size: 'sm', icon: 'plus', attrs: { 'data-fk': 'cv-add', 'aria-haspopup': 'menu' } });
    addBtn.addEventListener('click', function () {
      E.Menu.open({
        anchor: addBtn, label: 'Dodaj do kalendarza', align: 'end', items: [
          { label: 'Wyjazd lub spotkanie', icon: 'plus', onSelect: function () { ctx.actions.openTrip(null, selected); } },
          { label: 'Urlop lub nieobecność', icon: 'plus', onSelect: function () { ctx.actions.openLeaveRequest({ kind: 'leave' }); } },
          { label: 'Zlecenie wewnętrzne…', icon: 'plus', onSelect: function () { ctx.actions.openOrder(null, ''); } }
        ]
      });
    });
    var toolbar = D.el('div', { class: 'cv-bar' }, [
      switcher.node,
      UI.iconButton({ icon: 'chevronLeft', label: 'Poprzedni ' + unit, size: 'sm', attrs: { 'data-fk': 'cv-prev' }, onClick: function () { shift(-1); } }),
      UI.iconButton({ icon: 'chevronRight', label: 'Następny ' + unit, size: 'sm', attrs: { 'data-fk': 'cv-next' }, onClick: function () { shift(1); } }),
      UI.button({ label: 'Dziś', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'cv-today', 'data-tooltip': 'D' }, onClick: function () { ctx.actions.setTime({ calAnchor: null, calDay: null }); } }),
      D.el('h2', { class: 'cv-title', text: title }),
      D.el('span', { class: 'cv-bar__fill' }),
      UI.button({ label: cal.panel === false ? 'Filtry' + (hiddenCount ? ' · ' + hiddenCount : '') : 'Ukryj filtry', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'cv-panel', 'aria-pressed': String(cal.panel !== false) }, onClick: function () { ctx.actions.setCal({ panel: cal.panel === false }); } }),
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
    var panel = cal.panel === false ? null : D.el('aside', { class: 'cv-panel', attrs: { 'aria-label': 'Filtry kalendarza' } }, [
      mini,
      section('Zakres', [scopeSeg.node]),
      section('Osoby', peopleOpts.length ? [D.el('div', { class: 'cv-opts' }, peopleOpts)] : [D.el('p', { class: 'cv-empty', text: 'Brak osób w tym zakresie.' })], resetPeople),
      section('Projekty', projOpts.length ? [D.el('div', { class: 'cv-opts' }, projOpts)] : [D.el('p', { class: 'cv-empty', text: 'Brak projektów.' })]),
      section('Rodzaje', [D.el('div', { class: 'cv-opts' }, kindOpts)])
    ]);

    /* ---------- elementy wspólne ---------- */
    function chip(ev, showText) {
      var tip = ev.kind === 'trip' ? ev.title + ' · ' + ev.sub : ev.kind === 'absence' ? ev.title + ' · ' + ev.sub : ev.code + ' · ' + ev.title + ' · ' + ev.sub;
      var text = ev.kind === 'trip' ? ev.title : ev.kind === 'absence' ? ev.title + ' · ' + ev.sub.toLowerCase() : null;
      var kids = !showText ? [] : (text ? [D.el('span', { class: 'truncate', text: text })] : [D.el('span', { class: 'cv-ev__code', text: ev.code }), D.el('span', { class: 'truncate', text: ev.title })]);
      return D.el('button', {
        class: 'cv-ev cv-ev--' + ev.kind + (ev.warn ? ' is-warn' : '') + (!showText ? ' cv-ev--cont' : ''), style: ev.kind === 'absence' || ev.kind === 'trip' ? null : E.Identity.hueStyle(ev.code),
        attrs: { type: 'button', 'data-tooltip': tip, 'aria-label': tip, 'data-fk': 'cv-ev-' + ev.kind },
        on: { click: function (e) { e.stopPropagation(); openEvent(ev); } }
      }, kids);
    }
    function occ(c) {
      if (!c.total || !c.workday || c.out || !c.awayCount) return null;
      return D.el('span', { class: 'cv-occ' + (c.awayCount >= CV.THIN ? ' is-warn' : ''), text: c.present + '/' + c.total, attrs: { 'data-tooltip': 'Obecnych ' + c.present + ' z ' + c.total + ', nieobecnych ' + c.awayCount } });
    }

    /* ---------- widok: miesiąc ---------- */
    function monthGrid() {
      var grid = D.el('div', { class: 'cv-grid', attrs: { role: 'grid', 'aria-label': title } });
      grid.appendChild(D.el('span', { class: 'cv-h cv-wk' }));
      DOW.forEach(function (n) { grid.appendChild(D.el('span', { class: 'cv-h', text: n })); });
      data.cells.forEach(function (c, i) {
        if (i % 7 === 0) grid.appendChild(D.el('span', { class: 'cv-wk', text: String(Cal.weekNumber(c.key)), attrs: { 'aria-hidden': 'true' } }));
        var shown = c.events.slice(0, MAX_CHIPS);
        var extra = c.events.length - shown.length;
        var cls = 'cv-c' + (c.out ? ' is-out' : '') + (c.weekend ? ' is-we' : '') + (c.holiday ? ' is-hol' : '') + (c.today ? ' is-today' : '') + (c.key === selected ? ' is-sel' : '') + (conflictDays[c.key] && !c.out ? ' is-conflict' : '');
        grid.appendChild(D.el('div', {
          class: cls, attrs: { role: 'gridcell', tabindex: c.key === selected ? '0' : '-1', 'data-k': c.key, 'aria-label': longDay(c.key) + (c.holiday ? ', ' + c.holiday : '') + (c.events.length ? ', ' + c.events.length + ' wpisów' : ''), 'aria-selected': String(c.key === selected) },
          on: { click: function () { pickDay(c.key); } }
        }, [
          D.el('div', { class: 'cv-num' }, [D.el('span', { class: 'cv-num__d', text: String(c.day) }), c.holiday ? D.el('span', { class: 'cv-num__hol truncate', text: c.holiday }) : null, occ(c)]),
          D.el('div', { class: 'cv-evs' }, shown.map(function (ev) { return chip(ev, !ev.bar || ev.from === c.key || i % 7 === 0); }).concat(extra > 0 ? [D.el('span', { class: 'cv-more', text: '+' + extra + ' więcej' })] : []))
        ]));
      });
      grid.addEventListener('keydown', function (e) {
        var cur = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-k');
        if (!cur) return;
        var next = null;
        if (e.key === 'ArrowLeft') next = Cal.addDays(cur, -1);
        else if (e.key === 'ArrowRight') next = Cal.addDays(cur, 1);
        else if (e.key === 'ArrowUp') next = Cal.addDays(cur, -7);
        else if (e.key === 'ArrowDown') next = Cal.addDays(cur, 7);
        if (!next) return;
        e.preventDefault();
        ctx.actions.setTime({ calDay: next, calAnchor: next });
        window.setTimeout(function () { var el = document.querySelector('.cv-c[data-k="' + next + '"]'); if (el) el.focus(); }, 30);
      });
      return D.el('div', { class: 'cv-wrap' }, [grid]);
    }

    /* ---------- widok: tydzień ---------- */
    function weekView() {
      var cols = data.cells.map(function (c) {
        var evs = c.events;
        return D.el('section', { class: 'cv-wcol' + (c.today ? ' is-today' : '') + (c.weekend || c.holiday ? ' is-we' : '') + (c.key === selected ? ' is-sel' : '') + (conflictDays[c.key] ? ' is-conflict' : ''), on: { click: function () { pickDay(c.key); } } }, [
          D.el('header', { class: 'cv-wcol__h' }, [D.el('b', { text: DOW[(Cal.parse(c.key).getDay() + 6) % 7] + ' ' + c.day }), occ(c)]),
          c.holiday ? D.el('small', { class: 'cv-num__hol', text: c.holiday }) : null,
          D.el('div', { class: 'cv-evs' }, evs.map(function (ev) { return chip(ev, true); }))
        ]);
      });
      var matrix = weekMatrix();
      return D.el('div', { class: 'cv-week' }, [D.el('div', { class: 'cv-wcols' }, cols), D.el('h3', { class: 'cv-sub', text: 'Kto gdzie pracuje' }), matrix]);
    }
    function weekMatrix() {
      var head = [D.el('span', { class: 'lv-t__name' })].concat(data.cells.map(function (c) {
        return D.el('span', { class: 'lv-t__d' + (c.weekend ? ' is-weekend' : '') + (c.holiday ? ' is-holiday' : '') + (c.today ? ' is-today' : ''), text: DOW[(Cal.parse(c.key).getDay() + 6) % 7] + ' ' + c.day });
      }));
      var rows = data.people.map(function (p) {
        var cells = [D.el('span', { class: 'lv-t__name' }, [E.Avatar.avatar(p, { size: 'sm' }), D.el('span', { class: 'truncate', text: Team.fullName(p) })])];
        data.cells.forEach(function (c) {
          var ab = c.events.filter(function (e) { return e.kind === 'absence' && e.personId === p.id; })[0];
          var tr = c.events.filter(function (e) { return e.kind === 'trip' && e.personIds.indexOf(p.id) >= 0; })[0];
          var cls = 'lv-t__c lv-t__c--wide' + (c.weekend || c.holiday ? ' is-weekend' : '');
          var text = '';
          var tip = null;
          if (ab && !c.weekend && !c.holiday) { cls += ' is-away'; text = ab.sub.toLowerCase(); tip = Team.fullName(p) + ' · ' + ab.sub; }
          else if (tr) { cls += ' is-trip'; text = tr.title.replace(/^(Teren|Spotkanie) · /, ''); tip = Team.fullName(p) + ' · ' + tr.title; }
          cells.push(D.el('span', { class: cls, attrs: { 'data-tooltip': tip } }, [D.el('span', { class: 'truncate', text: text })]));
        });
        return D.el('div', { class: 'lv-t__row lv-t__row--wk' }, cells);
      });
      return D.el('div', { class: 'lv-t', style: { '--days': '7' } }, [D.el('div', { class: 'lv-t__row lv-t__row--wk lv-t__row--head' }, head)].concat(rows));
    }

    /* ---------- widok: rok ---------- */
    function yearView() {
      var months = [];
      for (var m = 0; m < 12; m += 1) {
        months.push(E.LeaveScreen.miniMonth(year, m, function (key, wk, hol) {
          var c = byKey[key];
          if (!c) return null;
          var cls = '';
          if (c.workday && c.awayCount) cls += ' is-heat' + Math.min(3, c.awayCount >= CV.THIN ? 3 : c.awayCount);
          if (c.events.some(function (e) { return e.kind === 'project' || e.kind === 'stage'; })) cls += ' has-dl';
          if (conflictDays[key]) cls += ' is-conflict';
          var tipParts = [];
          if (c.holiday) tipParts.push(c.holiday);
          if (c.awayCount) tipParts.push('nieobecnych ' + c.awayCount + ' z ' + c.total);
          c.events.filter(function (e) { return e.kind === 'project' || e.kind === 'stage'; }).forEach(function (e) { tipParts.push(e.code + ' ' + e.title); });
          return { cls: cls.trim(), tip: tipParts.join(' · '), onClick: function (k) { ctx.actions.setCal({ view: 'month' }); ctx.actions.setTime({ calAnchor: k, calDay: k }); } };
        }, today));
      }
      return D.el('div', { class: 'cv-year' }, [D.el('div', { class: 'lv-months' }, months), yearLegend()]);
    }
    function yearLegend() {
      return D.el('ul', { class: 'lv-legend lv-legend--row' }, [
        D.el('li', null, [D.el('i', { class: 'lv-dot cv-dot--h1' }), D.el('span', { text: '1 osoba nieobecna' })]),
        D.el('li', null, [D.el('i', { class: 'lv-dot cv-dot--h2' }), D.el('span', { text: '2 osoby' })]),
        D.el('li', null, [D.el('i', { class: 'lv-dot cv-dot--h3' }), D.el('span', { text: CV.THIN + ' lub więcej' })]),
        D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--holiday' }), D.el('span', { text: 'święto' })]),
        D.el('li', null, [D.el('i', { class: 'cv-dl-dot' }), D.el('span', { text: 'termin projektu lub etapu' })])
      ]);
    }

    /* ---------- widok: zespół ---------- */
    function teamView() {
      var table = E.LeaveScreen.teamTable(year, month, data.people, function (p, k, off) {
        var c = byKey[k];
        if (!c) return null;
        var ab = c.events.filter(function (e) { return e.kind === 'absence' && e.personId === p.id; })[0];
        if (ab && !off) return { cls: 'is-away', tip: Team.fullName(p) + ' · ' + ab.sub };
        var tr = c.events.filter(function (e) { return e.kind === 'trip' && e.personIds.indexOf(p.id) >= 0; })[0];
        if (tr) return { cls: 'is-trip', tip: Team.fullName(p) + ' · ' + tr.title };
        return null;
      }, now, [
        { label: 'Obsada', cellFn: function (k, off) { var c = byKey[k]; if (!c || off || !c.total) return null; return { text: String(c.present), cls: c.awayCount >= CV.THIN ? 'is-warn' : '', tip: 'Obecnych ' + c.present + ' z ' + c.total }; } },
        { label: 'Terminy', cellFn: function (k) { var c = byKey[k]; var dl = c ? c.events.filter(function (e) { return e.kind === 'project' || e.kind === 'stage'; }) : []; return dl.length ? { text: '●', cls: c.events.some(function (e) { return e.warn; }) ? 'is-warn' : '', tip: dl.map(function (e) { return e.code + ' ' + e.title; }).join(', ') } : null; } }
      ]);
      return D.el('div', { class: 'lv-team' }, [table, D.el('p', { class: 't-meta', text: visibility === 'own' && !management ? 'Dyrekcja ustawiła pokazywanie tylko własnych nieobecności.' : (management || visibility === 'kind' ? 'Widzisz rodzaj nieobecności.' : 'Widzisz, kto jest nieobecny, bez rodzaju nieobecności.') })]);
    }

    /* ---------- panel dnia ---------- */
    function sideRow(ev) {
      return D.el('li', null, [D.el('button', { class: 'cv-row' + (ev.kind === 'absence' ? ' is-abs' : ev.kind === 'trip' ? ' is-trip' : ''), style: ev.kind === 'absence' || ev.kind === 'trip' ? null : E.Identity.hueStyle(ev.code), attrs: { type: 'button' }, on: { click: function () { openEvent(ev); } } }, [
        D.el('i', { class: 'cv-row__bar', attrs: { 'aria-hidden': 'true' } }),
        D.el('span', { class: 'cv-row__txt' }, [D.el('b', { class: 'truncate', text: ev.title }), D.el('small', { class: 'truncate', text: (ev.code ? ev.code + ' · ' : '') + (ev.project ? ev.project + ' · ' : '') + ev.sub })])
      ])]);
    }
    function sidePanel() {
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
      var otherConf = data.conflicts.filter(function (x) { return dayConf.indexOf(x) < 0; }).slice(0, 4);
      return D.el('aside', { class: 'cv-side', attrs: { 'aria-label': 'Wybrany dzień' } }, [
        D.el('div', { class: 'cv-side__sec' }, [D.el('span', { class: 'cv-side__k', text: 'Wybrany dzień' }), D.el('h3', { class: 'cv-side__t', text: selected ? longDay(selected) : '' }), occLine, confBox, dayList,
          UI.button({ label: 'Wyjazd tego dnia', variant: 'ghost', size: 'sm', icon: 'plus', attrs: { 'data-fk': 'cv-trip' }, onClick: function () { ctx.actions.openTrip(null, selected); } })]),
        otherConf.length ? D.el('div', { class: 'cv-side__sec' }, [D.el('span', { class: 'cv-side__k', text: 'Uwaga w tym zakresie' }), D.el('ul', { class: 'cv-conf' }, otherConf.map(function (x) {
          return D.el('li', null, [D.el('button', { class: 'cv-conf__b', attrs: { type: 'button' }, on: { click: function () { ctx.actions.setTime({ calDay: x.day, calAnchor: x.day }); } } }, [D.el('b', { text: longDay(x.day) + ' · ' }), D.el('span', { text: x.text })])]);
        }))]) : null,
        D.el('div', { class: 'cv-side__sec' }, [D.el('span', { class: 'cv-side__k', text: 'Najbliższe terminy' }), upcoming])
      ]);
    }

    var main = mode === 'month' ? monthGrid() : mode === 'week' ? weekView() : mode === 'year' ? yearView() : teamView();
    var hasSide = mode === 'month';
    var total = data.cells.reduce(function (n, c) { return n + (c.out ? 0 : c.events.filter(function (e) { return e.kind !== 'absence' && e.kind !== 'trip'; }).length); }, 0);
    return {
      summary: management ? 'Terminy projektów i etapów oraz nieobecności zespołu.' : 'Twoje terminy i nieobecności.',
      body: D.el('div', { class: 'cv' }, [toolbar,
        D.el('div', { class: 'cv-body' + (panel ? ' has-panel' : '') + (hasSide ? ' has-side' : '') }, [panel, D.el('div', { class: 'cv-main' }, [main]), hasSide ? sidePanel() : null]),
        D.el('p', { class: 'sr-only', text: total + ' terminów w zakresie', attrs: { 'aria-live': 'polite' } })])
    };
  }

  E.CalendarScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
