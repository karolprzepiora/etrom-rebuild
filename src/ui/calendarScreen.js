/* ETROM — ekran „Kalendarz”: jeden kalendarz w trzech widokach (Miesiąc, Tydzień, Rok) z panelem warstw po lewej.
   Miesiąc i tydzień to kafle, tak samo jak w Czasie. Terminy projektów, etapów i zadań, wyjazdy i spotkania oraz święta;
   nieobecności i wnioski urlopowe to kółka osób na kaflu (wszyscy widzą wszystko, L4 innych jako „nieobecność”).
   Kto gdzie jest dziś i w tym tygodniu: zakładka Zespół.
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
  var VIEWS = [{ value: 'month', label: 'Miesiąc' }, { value: 'week', label: 'Tydzień' }, { value: 'year', label: 'Rok' }];
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
    var mode = cal.view === 'week' || cal.view === 'year' ? cal.view : 'month';
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

    /* ---------- pasek narzędzi ---------- */
    function shift(dir) {
      var next;
      if (mode === 'week') next = Cal.addDays(anchor, 7 * dir);
      else if (mode === 'year') next = iso(year + dir, month, 1);
      else next = iso(new Date(year, month + dir, 1).getFullYear(), new Date(year, month + dir, 1).getMonth(), 1);
      ctx.actions.setTime({ calAnchor: next, calDay: null });
    }
    var unit = { month: 'miesiąc', week: 'tydzień', year: 'rok' }[mode];
    var switcher = UI.segmented({ label: 'Widok kalendarza', value: mode, items: VIEWS, onChange: function (v) { ctx.actions.setCal({ view: v }); } });
    var hiddenCount = (cal.hiddenPeople || []).length + (cal.hiddenProjects || []).length + (cal.hiddenKinds || []).length + (cal.scope && cal.scope !== CV.defaultScope(management) ? 1 : 0);
    var addBtn = UI.button({ label: 'Wyjazd lub spotkanie', variant: 'primary', size: 'sm', icon: 'plus', attrs: { 'data-fk': 'cv-add' }, onClick: function () { ctx.actions.openTrip(null, selected); } });
    var toolbar = D.el('div', { class: 'cv-bar' }, [
      switcher.node,
      UI.iconButton({ icon: 'chevronLeft', label: 'Poprzedni ' + unit, size: 'sm', attrs: { 'data-fk': 'cv-prev' }, onClick: function () { shift(-1); } }),
      UI.iconButton({ icon: 'chevronRight', label: 'Następny ' + unit, size: 'sm', attrs: { 'data-fk': 'cv-next' }, onClick: function () { shift(1); } }),
      UI.button({ label: 'Dziś', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'cv-today', 'data-tooltip': 'D' }, onClick: function () { ctx.actions.setTime({ calAnchor: null, calDay: null }); } }),
      D.el('h2', { class: 'cv-title', text: title }),
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
    function chip(ev, showText) {
      var tip = ev.kind === 'trip' ? ev.title + ' · ' + ev.sub : ev.kind === 'absence' ? ev.title + ' · ' + ev.sub : ev.code + ' · ' + ev.title + ' · ' + ev.sub;
      var text = ev.kind === 'trip' ? ev.title : ev.kind === 'absence' ? ev.title + ' · ' + ev.sub.toLowerCase() : null;
      var kids = !showText ? [] : (text ? [D.el('span', { class: 'truncate', text: text })] : [D.el('span', { class: 'cv-ev__code', text: ev.code }), D.el('span', { class: 'truncate', text: ev.title })]);
      return D.el('button', {
        class: 'cv-ev cv-ev--' + ev.kind + (ev.tripKind === 'meeting' ? ' is-meet' : '') + (ev.warn ? ' is-warn' : '') + (!showText ? ' cv-ev--cont' : ''), style: ev.kind === 'absence' || ev.kind === 'trip' ? null : E.Identity.hueStyle(ev.code),
        attrs: { type: 'button', 'data-tooltip': tip, 'aria-label': tip, 'data-fk': 'cv-ev-' + ev.kind },
        on: { click: function (e) { e.stopPropagation(); openEvent(ev); } }
      }, kids);
    }
    function occ(c) {
      if (!c.total || !c.workday || c.out || !c.awayCount) return null;
      return D.el('span', { class: 'cv-occ' + (c.awayCount >= CV.THIN ? ' is-warn' : ''), text: c.present + '/' + c.total, attrs: { 'data-tooltip': 'Obecnych ' + c.present + ' z ' + c.total + ', nieobecnych ' + c.awayCount } });
    }

    /* ---------- kafle (miesiąc i tydzień) ---------- */
    var byPerson = {};
    people.forEach(function (p) { byPerson[p.id] = p; });
    function whoRow(c, limit) {
      if (c.weekend || c.holiday) return null;
      var abs = c.events.filter(function (e) { return e.kind === 'absence'; });
      if (!abs.length) return null;
      var shown = abs.slice(0, limit);
      var extra = abs.length - shown.length;
      var nodes = shown.map(function (ev) {
        var p = byPerson[ev.personId];
        if (!p) return null;
        var tip = Team.fullName(p) + ' · ' + ev.sub.toLowerCase() + ' · ' + E.LeaveScreen.range(ev.from, ev.to, now);
        return D.el('span', { class: 'cv-av ' + (ev.pending ? 'is-pending' : (ev.absKind === 'leave' ? 'is-leave' : 'is-other')), attrs: { 'data-tooltip': tip, 'aria-label': tip, 'data-fk': 'cv-ev-absence' }, on: { click: function (e) { e.stopPropagation(); openEvent(ev); } } }, [E.Avatar.avatar(p, { size: 'xs' })]);
      });
      return D.el('span', { class: 'cv-who' }, nodes.concat(extra > 0 ? [D.el('small', { text: '+' + extra })] : []));
    }
    function items(c) { return c.events.filter(function (e) { return e.kind !== 'absence'; }); }
    function dots(list) {
      return D.el('span', { class: 'cv-dots', attrs: { 'aria-hidden': 'true' } }, list.slice(0, 8).map(function (e) { return D.el('i', { class: 'cv-dot cv-dot--' + (e.kind === 'trip' ? (e.tripKind === 'meeting' ? 'meet' : 'trip') : 'dl') }); }));
    }
    function tileClass(c) {
      return 'ts-day cv-c' + (c.out ? ' is-out' : '') + (c.weekend ? ' is-weekend' : '') + (c.holiday ? ' is-hol' : '') + (c.today ? ' is-today' : '') + (c.key === selected ? ' is-sel' : '') + (conflictDays[c.key] && !c.out ? ' is-conflict' : '');
    }
    function tileAttrs(c) {
      return { role: 'gridcell', tabindex: c.key === selected ? '0' : '-1', 'data-k': c.key, 'data-day': c.key, 'aria-label': longDay(c.key) + (c.holiday ? ', ' + c.holiday : '') + (c.events.length ? ', ' + c.events.length + ' wpisów' : ''), 'aria-selected': String(c.key === selected) };
    }
    function legend() {
      return D.el('div', { class: 'ts-legend' }, [
        D.el('span', { class: 'ts-legend__i is-dl', text: 'termin projektu' }),
        D.el('span', { class: 'ts-legend__i is-trip', text: 'teren' }),
        D.el('span', { class: 'ts-legend__i is-meet', text: 'spotkanie' }),
        D.el('span', { class: 'ts-legend__i is-vac', text: 'urlop' }),
        D.el('span', { class: 'ts-legend__i is-req', text: 'wniosek o urlop' }),
        D.el('span', { class: 'ts-legend__i is-hol', text: 'święto' })
      ]);
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
        if (!next) return;
        e.preventDefault();
        ctx.actions.setTime({ calDay: next, calAnchor: next });
        window.setTimeout(function () { var el = document.querySelector('.cv-c[data-k="' + next + '"]'); if (el) el.focus(); }, 30);
      });
    }

    /* ---------- widok: miesiąc ---------- */
    function monthGrid() {
      var parts = DOW.map(function (n) { return D.el('span', { class: 'ts-cal__dh', text: n.toLowerCase(), attrs: { role: 'columnheader' } }); }).concat([D.el('span', { class: 'ts-cal__dh ts-cal__dh--wk', text: 'Tydzień' })]);
      for (var i = 0; i < data.cells.length; i += 7) {
        var week = data.cells.slice(i, i + 7);
        var sumItems = 0;
        var sumAbs = 0;
        week.forEach(function (c) {
          if (c.out) { parts.push(D.el('div', { class: 'ts-day is-out', attrs: { 'aria-hidden': 'true' } })); return; }
          var list = items(c);
          sumItems += list.length;
          sumAbs += c.weekend || c.holiday ? 0 : c.events.filter(function (e) { return e.kind === 'absence'; }).length;
          var kids = [D.el('span', { class: 'ts-day__n' }, [String(c.day), c.holiday ? D.el('small', { class: 'cv-holname truncate', text: ' ' + c.holiday }) : null])];
          if (list.length) kids.push(D.el('span', { class: 'ts-day__h t-num' }, [String(list.length), D.el('small', { text: ' ' + E.Format.count(list.length, 'pozycja', 'pozycje', 'pozycji').replace(/^\d+\s/, '') })]), dots(list));
          kids.push(whoRow(c, 3));
          parts.push(D.el('div', { class: tileClass(c), attrs: tileAttrs(c), on: { click: function () { pickDay(c.key); } } }, kids.filter(Boolean)));
        });
        parts.push(D.el('div', { class: 'ts-wk', attrs: { role: 'cell' } }, [
          D.el('span', { text: 'Tydz. ' + Cal.weekNumber(week[0].key) }),
          D.el('b', { class: 't-num', text: sumItems ? sumItems + ' poz.' : '—' }),
          D.el('span', { text: sumAbs ? E.Format.count(sumAbs, 'dzień nieobecności', 'dni nieobecności', 'dni nieobecności') : '' })
        ]));
      }
      var grid = D.el('div', { class: 'ts-cal__grid', attrs: { role: 'grid', 'aria-label': title } }, parts);
      gridKeys(grid);
      return D.el('div', { class: 'ts-cal is-month cv-wrap' }, [grid, legend()]);
    }

    /* ---------- widok: tydzień ---------- */
    function weekView() {
      var head = data.cells.map(function (c) { return D.el('span', { class: 'ts-cal__dh', text: DOW[(Cal.parse(c.key).getDay() + 6) % 7].toLowerCase(), attrs: { role: 'columnheader' } }); });
      var tiles = data.cells.map(function (c) {
        var kids = [D.el('span', { class: 'ts-day__n' }, [c.day + ' ' + DOW[(Cal.parse(c.key).getDay() + 6) % 7].toLowerCase(), occ(c)]), c.holiday ? D.el('small', { class: 'cv-holname', text: c.holiday }) : null,
          D.el('div', { class: 'cv-evs' }, items(c).map(function (ev) { return chip(ev, true); })), whoRow(c, 6)];
        return D.el('div', { class: tileClass(c) + ' cv-wcol', attrs: tileAttrs(c), on: { click: function () { pickDay(c.key); } } }, kids.filter(Boolean));
      });
      var grid = D.el('div', { class: 'ts-cal__grid', attrs: { role: 'grid', 'aria-label': title } }, head.concat(tiles));
      gridKeys(grid);
      return D.el('div', { class: 'ts-cal is-week cv-week' }, [grid, legend()]);
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

    var main = mode === 'month' ? monthGrid() : mode === 'week' ? weekView() : yearView();
    var items = [{ id: 'filters', title: 'Filtry i warstwy', icon: 'filter', tone: 'accent', badge: hiddenCount ? String(hiddenCount) : '', side: filtersSide }];
    if (mode === 'month' || mode === 'week') items.push({ id: 'day', title: 'Wybrany dzień i najbliższe terminy', label: 'Dzień', icon: 'calendar', tone: 'violet', side: daySide() });
    if (data.conflicts.length) items.push({ id: 'warn', title: 'Uwaga w tym zakresie', icon: 'alert', tone: 'warn', badge: String(data.conflicts.length), late: true, side: warnSide() });
    var railPref = cal.rail || 'day';
    var openId = railPref === 'none' ? null : (items.some(function (it) { return it.id === railPref; }) ? railPref : null);
    var total = data.cells.reduce(function (n, c) { return n + (c.out ? 0 : c.events.filter(function (e) { return e.kind !== 'absence' && e.kind !== 'trip'; }).length); }, 0);
    return {
      summary: management ? 'Terminy projektów i etapów oraz nieobecności zespołu.' : 'Twoje terminy i nieobecności.',
      body: D.el('div', { class: 'cv' }, [toolbar,
        UI.railLayout({ id: 'calendar', cls: 'cv-rl', mainCls: 'cv-main', items: items, active: openId, main: [D.el('section', { class: 'an-card ts-calcard cv-card' }, [main])], onSelect: function (id) { ctx.actions.setCal({ rail: id || 'none' }); } }),
        D.el('p', { class: 'sr-only', text: total + ' terminów w zakresie', attrs: { 'aria-live': 'polite' } })])
    };
  }

  E.CalendarScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
