/* ETROM — plan tygodni: wiersz na osobę (albo na projekt), kolumna na tydzień, zadanie jako pasek od startu do terminu.
   Widok „Wg osób” ma wstęgę godzin na tydzień, słupki godzin na dzień i tackę zadań bez osoby; „Wg projektów” grupuje paski
   w projekty w kolejności z listy Projekty. Pasek podpisuje termin na końcu.
   Pasek przeciąga się (cały: start i termin razem), jego brzegi zmieniają start albo termin, upuszczony na innej osobie
   przenosi zadanie. W trakcie przeciągania pojemność tygodni liczy się na bieżąco. Z klawiatury: strzałki (cały pasek),
   Shift+strzałki (termin), Alt+strzałki (start). Zadania bez terminu czekają w „tacce” i da się je upuścić na oś.
   Obliczenia: core/plan.js; tu tylko wygląd i interakcja. Zmienia zarząd i lider projektu, reszta ogląda. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;
  var Budget = E.Budget;
  var Plan = E.Plan;
  var Identity = E.Identity;
  var Cal = E.Calendar;

  var DAY = 86400000;
  var MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  var RANGES = [2, 4, 6, 8, 12];
  var DOWS = ['pn', 'wt', 'śr', 'cz', 'pt'];
  var DOWS_SHORT = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  var LANE_H = 2.1; // rem
  var pendingFocus = null;

  function hh(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function dayStart(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function shortDate(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function weekLabel(start) {
    var s = new Date(start);
    var e = new Date(start + 4 * DAY);
    return s.getDate() + (s.getMonth() === e.getMonth() ? '' : ' ' + MONTHS[s.getMonth()]) + '–' + e.getDate() + ' ' + MONTHS[e.getMonth()];
  }

  /** Numer kolumny osi (dni robocze liczone od pierwszego poniedziałku okna); weekend przesuwa się na sąsiedni dzień roboczy. */
  function slotOf(first, ms, dir) {
    var d = dayStart(ms);
    var diff = Math.round((d.getTime() - first) / DAY);
    var week = Math.floor(diff / 7);
    var dow = ((diff % 7) + 7) % 7;
    if (dow > 4) { if (dir > 0) { week += 1; dow = 0; } else dow = 4; }
    return week * 5 + dow;
  }
  function dateOfSlot(first, slot) {
    var f = new Date(first);
    var week = Math.floor(slot / 5);
    return new Date(f.getFullYear(), f.getMonth(), f.getDate() + week * 7 + (slot - week * 5));
  }

  /** Układa paski w pasach tak, żeby się nie zasłaniały (zachłannie, wg początku). */
  function lanes(items) {
    var ends = [];
    items.forEach(function (it) {
      var lane = 0;
      while (ends[lane] !== undefined && ends[lane] >= it.s) lane += 1;
      ends[lane] = it.reach !== undefined ? it.reach : it.e;
      it.lane = lane;
    });
    return ends.length || 1;
  }

  function findTask(projects, ref) {
    var project = projects.filter(function (p) { return p.id === ref.projectId; })[0];
    var stage = project && project.stages.filter(function (s) { return s.id === ref.stageId; })[0];
    var task = stage && (stage.tasks || []).filter(function (t) { return t.id === ref.taskId; })[0];
    return task ? { project: project, stage: stage, task: task } : null;
  }

  /** Kopia projektów z jednym zadaniem zmienionym (do podglądu przy przeciąganiu). */
  function withChange(projects, ref, patch, fromId, toId) {
    return projects.map(function (p) {
      if (p.id !== ref.projectId) return p;
      return Object.assign({}, p, { stages: p.stages.map(function (st) {
        if (st.id !== ref.stageId) return st;
        return Object.assign({}, st, { tasks: st.tasks.map(function (t) {
          if (t.id !== ref.taskId) return t;
          var next = Object.assign({}, t, patch);
          if (fromId && toId && fromId !== toId) {
            var list = (t.assignees || []).filter(function (id) { return id !== fromId; });
            if (list.indexOf(toId) < 0) list.push(toId);
            next.assignees = list;
          }
          return next;
        }) });
      }) });
    });
  }

  function chipState(cell) {
    return 'pb-load pb-load--' + cell.state + (cell.planned ? '' : ' is-empty');
  }
  function chipText(cell) {
    if (!cell.planned && !cell.capacity) return cell.absentDays ? 'urlop ' + cell.absentDays + ' dn.' : '';
    if (cell.state === 'over') return '+' + Math.round(cell.planned - cell.capacity) + ' h';
    return Math.round(cell.planned) + ' / ' + Math.round(cell.capacity) + ' h';
  }
  /** Druga linia komórki tygodnia: przy przeciążeniu „plan / wolne”, przy minionej pracy „wyk.”. */
  function chipSub(cell, real) {
    var parts = [];
    if (cell.state === 'over') parts.push(Math.round(cell.planned) + ' / ' + Math.round(cell.capacity) + ' h');
    if (real) parts.push('wyk. ' + hh(real) + ' h');
    return parts.join(' · ');
  }
  function chipTip(cell) {
    return cell.planned
      ? hh(cell.planned) + ' h planu przy pojemności ' + hh(cell.capacity) + ' h' + (cell.absentDays ? ' (nieobecność: ' + cell.absentDays + ' dni)' : '') + (cell.state === 'over' ? ' — przeciążenie (' + hh(cell.planned - cell.capacity) + ' h za dużo)' : '') + ' · kliknij, żeby zobaczyć dni'
      : (cell.absentDays ? 'Nieobecność: ' + cell.absentDays + ' dni robocze' : 'Brak zaplanowanej pracy');
  }

  function detail(selected, plan, people, ctx) {
    if (!selected) return null;
    var row = plan.rows.filter(function (r) { return r.personId === selected.personId; })[0];
    if (!row) return null;
    var isFree = selected.week === 'free';
    var list = isFree ? row.unscheduled.tasks : (row.weeks[selected.week] ? row.weeks[selected.week].tasks : []);
    var person = Team.findPerson(people, selected.personId);
    var title = (person ? Team.fullName(person) : '') + ' · ' + (isFree ? 'zadania bez terminu' : 'tydzień ' + weekLabel(plan.weeks[selected.week].start));
    return D.el('section', { class: 'pl-detail', attrs: { 'aria-label': title } }, [
      D.el('h3', { class: 'pl-detail__title', text: title }),
      list.length ? D.el('ul', { class: 'pl-tasks' }, list.map(function (t) {
        return D.el('li', { class: 'pl-task' }, [
          D.el('span', { class: 'ts-code', style: Identity.hueStyle(t.code), text: t.code }),
          D.el('button', { class: 'pl-task__name truncate', attrs: { type: 'button' }, text: t.name, on: { click: function () { ctx.actions.inspect({ kind: 'task', projectId: t.projectId, stageId: t.stageId, taskId: t.taskId }); } } }),
          D.el('span', { class: 'pl-task__late', text: t.overdue ? 'po terminie' : (t.squeezed ? 'za mało czasu' : (t.mustStartNow ? 'musi ruszyć teraz' : '')) }),
          D.el('span', { class: 'pl-task__h t-num', text: hh(t.hours) + ' h' })
        ]);
      })) : D.el('p', { class: 'pl-detail__empty', text: 'Brak zadań w tym okresie.' })
    ]);
  }

  /** @returns {{summary: string, body: Array}} */
  var DEFAULT_OFFSET = -1;

  function view(state, ctx, now, opts) {
    var solo = !!(opts && opts.solo);
    var K = solo ? { weeks: 'myPlanWeeks', offset: 'myPlanOffset', cell: 'myPlanCell' } : { weeks: 'planWeeks', offset: 'planOffset', cell: 'planCell' };
    var people = state.workspace.people || [];
    var projects = state.workspace.projects || [];
    var me = Team.findPerson(people, state.prefs.me);
    var management = Budget.isManagement(me.id, people) && !solo;
    var weeksN = RANGES.indexOf(state[K.weeks]) >= 0 ? state[K.weeks] : 6;
    var offset = state[K.offset] == null ? DEFAULT_OFFSET : (Number(state[K.offset]) || 0);
    // Zarząd widzi wszystkich, lider osoby ze swoich projektów, pozostali tylko siebie.
    var led = projects.filter(function (p) { return p.team && p.team.leader === me.id && p.status !== 'done'; });
    var visibleIds = null;
    if (!management) {
      var set = {};
      set[me.id] = true;
      if (!solo) led.forEach(function (p) { Team.projectPeople(p.team).forEach(function (id) { set[id] = true; }); });
      visibleIds = Object.keys(set);
    }
    var focusProject = 0;
    var wantProject = !solo && state.planProject ? Number(state.planProject) : 0;
    var wantPerson = !solo && state.planPerson ? String(state.planPerson) : '';
    var baseInput = {
      projects: projects, people: people, entries: state.workspace.entries || [], now: now,
      target: state.prefs.dayTarget, weeks: weeksN, offsetWeeks: offset,
      personIds: visibleIds, absences: state.workspace.absences || []
    };
    var plan = Plan.build(baseInput);
    var allRows = plan.rows;
    if (wantPerson && !allRows.some(function (r) { return String(r.personId) === wantPerson; })) wantPerson = '';
    if (wantProject && !projects.some(function (p) { return p.id === wantProject; })) wantProject = 0;
    // Filtr: jedna osoba i/lub jeden projekt. Obciążenie tygodniowe zostaje prawdziwe, filtrowane są paski.
    plan.rows = allRows.filter(function (r) { return !wantPerson || String(r.personId) === wantPerson; }).map(function (r) {
      if (!wantProject) return r;
      return Object.assign({}, r, { bars: r.bars.filter(function (b) { return b.projectId === wantProject; }) });
    }).filter(function (r) { return !wantProject || wantPerson || r.bars.length; });
    plan.unassigned = (plan.unassigned || []).filter(function (t) { return (!wantProject || t.projectId === wantProject) && !wantPerson; });
    var viewSel = solo ? (['plan', 'done', 'both'].indexOf(state.myPlanView) >= 0 ? state.myPlanView : 'plan') : (['plan', 'both', 'done', 'live'].indexOf(state.planView) >= 0 ? state.planView : 'both');
    var emphKey = solo ? state.myPlanEmph : state.planEmph;
    var emph = viewSel === 'both' && (emphKey === 'plan' || emphKey === 'real') ? emphKey : 'both';
    var real = Plan.realization({ projects: projects, entries: state.workspace.entries || [], now: now, first: new Date(plan.first), weeks: weeksN, personIds: visibleIds });
    var N = weeksN * 5;
    var dayH = (state.prefs.dayTarget || 480) / 60;
    var todaySlot = slotOf(plan.first, plan.today, 1);
    var selected = state[K.cell] || null;
    var overCount = plan.rows.filter(function (r) { return r.weeks.some(function (c) { return c.state === 'over'; }); }).length;
    var canEdit = function (projectId) {
      var p = projects.filter(function (x) { return x.id === projectId; })[0];
      return !!p && Budget.canSeeHours(me.id, p, people);
    };
    var ranked = Plan.rankProjects(projects);
    var rankOf = {};
    ranked.forEach(function (p, i) { rankOf[p.id] = i + 1; });
    var labelW = 336;
    try { var savedW = Number(window.localStorage.getItem('etrom.pb.labelWidth')); if (savedW >= 224 && savedW <= 640) labelW = savedW; } catch (err) { /* brak pamięci */ }
    var chips = {};      // 'personId:week' → element
    var rowEls = {};     // personId → element
    var drag = null;

    /* ---------- pasek ---------- */
    function workedText(b) {
      if (b.planned > 0) return (b.logged > 0.05 ? hh(b.logged) + ' / ' : '') + hh(b.planned) + ' h' + (b.logged > 0.05 ? ' · ' + Math.round(b.logged / b.planned * 100) + '%' : '');
      return b.logged > 0.05 ? hh(b.logged) + ' h' : '—';
    }
    /** Budżet etapu zadania: „Budżet etapu „X”: 212 / 280 h · 76%” (godziny tylko dla zarządu i lidera). */
    function stageBudgetText(b) {
      var pr = projects.filter(function (x) { return x.id === b.projectId; })[0];
      var st = pr && (pr.stages || []).filter(function (x) { return x.id === b.stageId; })[0];
      if (!st || !(Number(st.hours) > 0)) return '';
      var v = Budget.view(pr, st, state.workspace.entries || [], me.id, people, new Date(plan.today));
      return 'Budżet etapu „' + E.Model.describeStage(st).name + '”: ' + (v.exact ? hh(v.used) + ' / ' + hh(v.planned) + ' h · ' : '') + v.percent + '%';
    }
    function barTip(b, span) {
      var s0 = span ? new Date(span.start + 'T00:00') : dayStart(b.start);
      var e0 = span ? new Date(span.deadline.slice(0, 10) + 'T00:00') : dayStart(b.end);
      var late = b.overdue ? ' · po terminie' : (!solo && b.squeezed ? ' · za mało czasu' : (!solo && b.mustStartNow ? ' · musi ruszyć teraz' : ''));
      if (solo) return b.code + ' · ' + b.name + ' · ' + shortDate(s0) + ' – ' + shortDate(e0) + ' · ' + timeText(b) + late;
      var perDay = b.days ? ' · ok. ' + hh(b.hours / b.days) + ' h dziennie' : '';
      return b.code + ' · ' + b.name + ' · zaplanowano ' + hh(b.planned) + ' h (' + (b.fromPool ? 'z puli etapu' : 'szacunek zadania') + '), przepracowano ' + hh(b.logged) + ' h, zostało ' + hh(b.hours * b.workers) + ' h · ' + shortDate(s0) + ' – ' + shortDate(e0) + perDay + late;
    }

    /** Pracownik widzi tylko upływ czasu do terminu (bez godzin i obciążenia). */
    function elapsedOf(b) {
      var total = Math.max(86400000, b.end - b.start + 86400000);
      return b.overdue ? 100 : Math.max(0, Math.min(100, Math.round((plan.today - b.start) / total * 100)));
    }
    function timeText(b) {
      if (b.overdue) return 'po terminie';
      var left = Plan.workdayDiff(new Date(plan.today), new Date(b.end));
      return left <= 0 ? 'termin dziś' : 'zostało ' + left + ' ' + (left === 1 ? 'dzień' : 'dni');
    }
    /** Pod procentem czasu: termin i liczba dni roboczych do niego, np. „do pt 9 paź · 3 dni”. */
    function dueText(b) {
      if (b.overdue) return 'po terminie';
      var left = Plan.workdayDiff(new Date(plan.today), new Date(b.end));
      var d = new Date(b.end);
      var when = DOWS_SHORT[d.getDay()] + ' ' + shortDate(d);
      if (left <= 0) return 'termin dziś';
      return 'do ' + when + ' · ' + left + ' ' + (left === 1 ? 'dzień' : 'dni');
    }

    /** Krótki termin na końcu paska: „dziś”, „jutro”, „pt 9”. */
    function dueShort(b) {
      var d = new Date(b.end);
      var left = Plan.workdayDiff(new Date(plan.today), d);
      if (left <= 0) return 'dziś';
      if (left === 1) return 'jutro';
      return DOWS_SHORT[d.getDay()] + ' ' + d.getDate();
    }

    /** Termin w kolumnie zadania pracownika: „dziś”, „jutro”, „pn 12”, „po terminie 2 dni”. */
    function termText(b) {
      if (b.overdue) {
        var late = Math.max(1, Plan.workdayDiff(new Date(b.end), new Date(plan.today)));
        return 'po terminie ' + late + ' ' + (late === 1 ? 'dzień' : 'dni');
      }
      return dueShort(b);
    }
    /** Godziny, które zalogowała na zadaniu sama osoba (tylko jej wpisy). */
    function soloLogged(b) {
      var sum = 0;
      (state.workspace.entries || []).forEach(function (e) {
        if (String(e.personId) === String(me.id) && e.projectId === b.projectId && e.stageId === b.stageId && e.taskId === b.taskId && e.end) sum += (Date.parse(e.end) - Date.parse(e.start)) / 3600000;
      });
      return sum;
    }

    function paintBar(el, ns, ne) {
      var cl = ns < 0, cr = ne >= N;
      var s = Math.max(0, ns), e = Math.min(N - 1, ne);
      el.style.left = (s / N * 100) + '%';
      el.style.width = (Math.max(1, e - s + 1) / N * 100) + '%';
      el.classList.toggle('is-clipl', cl);
      el.classList.toggle('is-clipr', cr);
    }

    /** Ile pracy zrobiono (przepracowane / zaplanowane), w procentach. */
    function donePct(b) { return b.planned > 0 ? Math.min(100, b.logged / b.planned * 100) : 0; }

    /** Znacznik „gdzie powinno być dziś”: czerwony, gdy zrobiono wyraźnie mniej niż wynika z upływu czasu. */
    function paceTick(b, item) {
      var pct = elapsedOf(b);
      if (b.overdue || pct <= 0 || pct >= 100 || todaySlot < item.s || todaySlot > item.e) return null;
      var from = Math.max(0, item.s), to = Math.min(N - 1, item.e);
      var left = (todaySlot - from) / (to - from + 1) * 100;
      var lag = donePct(b) < pct - 10;
      return D.el('span', { class: 'pb-bar__tick' + (lag ? ' is-lag' : ''), style: { left: left + '%' }, attrs: { 'aria-hidden': 'true', 'data-tooltip': lag ? 'Praca jest za znacznikiem: zrobiono mniej, niż wynika z upływu czasu' : 'Gdzie powinno być dziś' } });
    }

    function barEl(b, person, item) {
      var editable = !solo && canEdit(b.projectId);
      var pct = elapsedOf(b);
      var cls = 'pb-bar' + (b.overdue ? ' is-late' : '') + (!solo && b.squeezed ? ' is-tight' : '') + (!solo && b.mustStartNow ? ' is-now' : '') + (b.free ? ' is-free' : '') + (editable ? ' is-editable' : '') + (b.status === 'review' ? ' is-review' : '') + (focusProject && focusProject !== b.projectId ? ' is-dim' : '') + (!solo && b.logged > b.planned + 0.05 ? ' is-over' : '') + (solo ? ' is-time' + (pct >= 75 ? ' is-hot' : '') : ' is-prog');
      var key = b.projectId + '|' + b.stageId + '|' + b.taskId + '|' + person.id;
      var el = D.el('div', {
        class: cls, style: Object.assign({ '--d': (solo ? pct : donePct(b)) + '%' }, Identity.hueStyle(b.code)),
        attrs: { tabindex: '0', role: 'button', 'data-fk': 'pb-bar-' + b.taskId, 'data-tooltip': barTip(b), 'aria-label': barTip(b) + (editable ? '. Strzałki przesuwają, Shift i Alt zmieniają termin i start.' : ''), 'data-key': key },
        dataset: { projectId: String(b.projectId), stageId: b.stageId, taskId: b.taskId, personId: person.id }
      }, [
        D.el('span', { class: 'pb-bar__clip', attrs: { 'aria-hidden': 'true' } }),
        editable ? D.el('span', { class: 'pb-bar__h pb-bar__h--l', attrs: { 'data-h': 'start', 'data-tooltip': 'Zmień start' } }) : null,
        editable ? D.el('span', { class: 'pb-bar__h pb-bar__h--r', attrs: { 'data-h': 'end', 'data-tooltip': 'Zmień termin' } }) : null,
        item.e >= N ? null : D.el('span', { class: 'pb-bar__due' + (b.overdue ? ' is-late' : '') + (item.e >= N - 3 ? ' is-in' : ''), attrs: { 'aria-hidden': 'true' }, text: b.overdue ? 'po terminie' : dueShort(b) })
      ]);
      paintBar(el, item.s, item.e);
      if (pendingFocus === key) { pendingFocus = null; window.setTimeout(function () { el.focus({ preventScroll: true }); }, 30); }
      attachBar(el, b, person, item, editable, key);
      return el;
    }

    /** Lewa kolumna wiersza zadania: kod, pełna nazwa i godziny (zarząd) albo upływ czasu (pracownik). */
    function projectName(id) {
      var p = projects.filter(function (x) { return x.id === id; })[0];
      return p ? p.name : '';
    }

    var chkCtx = Object.assign({}, ctx, { people: people, meId: me.id });
    var caseCtx = { actions: ctx.actions, projects: projects };
    function taskCaseChip(b) {
      var cs = E.Cases.byTask(state.workspace.cases || [], b.taskId);
      return cs ? E.CaseUI.chip(cs, caseCtx) : null;
    }
    /** Wiersze „Sprawy w toku” osoby: kropka = złożono, linia = dni od złożenia, ◇ pismo, ✆ dopytano. */
    function caseRows(personId, trackOf) {
      var list = E.Cases.visible(state.workspace.cases || [], projects).filter(function (c) { return c.ownerId === personId && (!wantProject || c.projectId === wantProject); })
        .sort(function (a, b) { return a.startedAt < b.startedAt ? -1 : 1; });
      if (!list.length) return [];
      function slotIso(iso, dir) { return slotOf(plan.first, new Date(iso + 'T00:00:00').getTime(), dir || 1); }
      function pos(slot) { return ((Math.max(0, Math.min(N - 1, slot)) + 0.5) / N * 100) + '%'; }
      var nowIso = Plan.isoDay(new Date(plan.today));
      var out = [D.el('div', { class: 'pb-row pb-row--casehead' }, [
        D.el('div', { class: 'pb-label pb-label--casehead' }, [D.el('span', { text: 'Sprawy w toku' }), D.el('small', { class: 't-muted', text: 'dni od złożenia' })]),
        D.el('div', { class: 'pb-cell' }, [trackOf([])])
      ])];
      list.forEach(function (c) {
        var pr = projects.filter(function (x) { return x.id === c.projectId; })[0];
        var code = pr ? pr.code : '';
        var days = E.Cases.daysSince(c, nowIso);
        var s0 = slotIso(c.startedAt);
        var marks = [];
        if (s0 > 0 || todaySlot >= 0) {
          var from = Math.max(0, s0);
          var to = todaySlot >= 0 ? Math.min(N - 1, todaySlot) : -1;
          if (to >= from && s0 < N) marks.push(D.el('span', { class: 'pb-case__line', style: { left: pos(from), width: ((to - from) / N * 100) + '%' }, attrs: { 'aria-hidden': 'true' } }));
        }
        if (s0 < 0) marks.push(D.el('span', { class: 'pb-case__more', text: '◂', style: { left: '2px' }, attrs: { 'data-tooltip': 'Złożono ' + c.startedAt.slice(8, 10) + '.' + c.startedAt.slice(5, 7) + ' (przed oknem)' } }));
        c.events.forEach(function (e) {
          var sl = slotIso(e.at);
          if (sl < 0 || sl >= N) return;
          var linked = e.taskId ? E.CaseUI.findTask(projects, e.taskId) : null;
          var done = e.kind === 'letter' && linked && linked.task.status === 'done';
          var tip = (e.kind === 'filed' ? 'Złożono' : e.kind === 'call' ? 'Dopytano' : done ? 'Uzupełniono' : 'Pismo od organu') + ' · ' + e.at.slice(8, 10) + '.' + e.at.slice(5, 7) + (e.note ? ' · ' + e.note : '');
          if (e.kind === 'letter' && linked && linked.task.status !== 'done' && linked.task.deadline) {
            var se = Math.max(sl, Math.min(N - 1, slotIso(linked.task.deadline, -1)));
            marks.push(D.el('span', { class: 'pb-case__task', style: { left: (sl / N * 100) + '%', width: ((se - sl + 1) / N * 100) + '%' }, attrs: { 'data-tooltip': 'Zadanie: ' + linked.task.name + ' · termin ' + linked.task.deadline.slice(8, 10) + '.' + linked.task.deadline.slice(5, 7) } }));
          }
          marks.push(D.el('span', { class: 'pb-case__m pb-case__m--' + e.kind + (done ? ' is-filled' : ''), style: { left: pos(sl) }, attrs: { 'data-tooltip': tip, 'data-fk': 'pb-case-mark-' + c.id + '-' + e.id }, text: e.kind === 'call' ? '✆' : '' }));
        });
        var open = D.el('button', { class: 'pb-case__name', attrs: { type: 'button', 'data-fk': 'pb-case-' + c.id, title: c.name }, text: c.name });
        open.addEventListener('click', function () { E.CaseUI.openDetail(open, c, caseCtx); });
        out.push(D.el('div', { class: 'pb-row pb-row--case', style: Identity.hueStyle(code), dataset: { caseId: c.id } }, [
          D.el('div', { class: 'pb-label pb-label--case' }, [
            D.el('span', { class: 'mrow__project', style: Identity.hueStyle(code), text: code }),
            D.el('span', { class: 'pb-case__txt' }, [open, D.el('small', { class: 't-muted truncate', text: c.org || 'sprawa w toku' })]),
            D.el('span', { class: 'pb-case__days' }, [D.el('b', { class: 't-num', text: String(days) + ' dni' })])
          ]),
          D.el('div', { class: 'pb-cell' }, [trackOf([D.el('div', { class: 'pb-case__track' }, marks)])])
        ]));
      });
      return out;
    }
    function taskOf(b) {
      var pr = projects.filter(function (x) { return x.id === b.projectId; })[0];
      var st = pr && (pr.stages || []).filter(function (x) { return x.id === b.stageId; })[0];
      return st ? (st.tasks || []).filter(function (x) { return x.id === b.taskId; })[0] : null;
    }
    /** Znak listy punktów przy zadaniu; klik rozwija podgląd pod wierszem (jak w Mojej pracy). */
    function chkIndicator(b) {
      var task = taskOf(b);
      if (!task) return null;
      var ref = { projectId: b.projectId, stageId: b.stageId };
      var holder = D.el('span', { class: 'pb-tn__chk' });
      function draw() {
        var node = E.Checklist.indicator(task, toggle, chkCtx, ref);
        holder.replaceChildren.apply(holder, node ? [node] : []);
      }
      function toggle() {
        var open = E.Checklist.toggle(task.id);
        var row = holder.closest('.pb-row');
        var cur = row.querySelector('.chk');
        if (cur) cur.remove();
        if (open) row.appendChild(E.Checklist.panel(task, ref, chkCtx));
        draw();
      }
      draw();
      holder.__open = function (row) { if (E.Checklist.isOpen(task.id)) row.appendChild(E.Checklist.panel(task, ref, chkCtx)); };
      return holder;
    }

    function nameCell(b, who) {
      var editable = !solo && canEdit(b.projectId);
      var side;
      if (solo) {
        var pct = elapsedOf(b);
        var mine = soloLogged(b);
        side = D.el('span', { class: 'pb-tn__side pb-tn__time' + (b.overdue ? ' is-late' : ''), attrs: { 'data-tooltip': 'Upłynęło ' + pct + '% czasu do terminu' + (mine > 0.05 ? ' · zarejestrowano ' + hh(mine) + ' h' : '') } }, [
          D.el('b', { class: 't-num', text: termText(b) }),
          D.el('i', { class: 'pb-tn__meter', style: { '--p': pct + '%' }, attrs: { 'aria-hidden': 'true' } }),
          D.el('small', { class: 't-num', text: mine > 0.05 ? 'zarejestrowano ' + hh(mine) + ' h' : '' })
        ]);
      } else {
        var bud = stageBudgetText(b);
        var overPlan = b.planned > 0 && b.logged > b.planned + 0.05;
        var hoursBtn = D.el('span', { class: 'pb-bar__hours t-num' + (overPlan ? ' is-over' : ''), text: workedText(b), attrs: editable ? { 'data-fk': 'pb-hours-' + b.taskId, 'data-tooltip': 'Przepracowano / zaplanowano — kliknij, żeby zmienić zaplanowane godziny' + (bud ? ' · ' + bud : '') } : {} });
        if (editable) editHours(hoursBtn, b);
        side = D.el('span', { class: 'pb-tn__side' + (overPlan ? ' is-over' : ''), attrs: bud && !editable ? { 'data-tooltip': bud } : {} }, [
          hoursBtn,
          D.el('i', { class: 'pb-tn__meter', style: { '--p': (b.planned > 0 ? Math.min(100, b.logged / b.planned * 100) : 0) + '%' }, attrs: { 'aria-hidden': 'true' } })
        ]);
      }
      var flagStage = (function () {
        var pr = projects.filter(function (x) { return x.id === b.projectId; })[0];
        return pr && (pr.stages || []).filter(function (x) { return x.id === b.stageId; })[0];
      })();
      var bflag = flagStage && flagStage.budgetFlag && b.status !== 'done' ? flagStage.budgetFlag : null;
      return D.el('div', { class: 'pb-tn' + (focusProject && focusProject !== b.projectId ? ' is-dim' : '') + (bflag ? ' has-bflag has-bflag--' + bflag.state : ''), style: Identity.hueStyle(b.code), dataset: { projectId: String(b.projectId), stageId: b.stageId, taskId: b.taskId } }, [
        bflag ? E.BudgetFlag.badge(bflag, people) : null,
        D.el('span', { class: 'mrow__project pb-tn__code', style: Identity.hueStyle(b.code), text: b.code }),
        D.el('span', { class: 'pb-tn__txt' }, [
          D.el('button', { class: 'pb-tn__name', attrs: { type: 'button', title: b.name }, text: b.name, on: { click: function () { ctx.actions.inspect({ kind: 'task', projectId: b.projectId, stageId: b.stageId, taskId: b.taskId }); } } }),
          D.el('span', { class: 'pb-tn__sub' }, [
            who === undefined
              ? D.el('small', { class: 'pb-tn__proj truncate', text: projectName(b.projectId), attrs: { title: projectName(b.projectId) } })
              : D.el('span', { class: 'pb-tn__who' }, who.length ? who.map(function (pp) { return E.Avatar.avatar(pp, { size: 'xs' }); }) : [D.el('small', { class: 'pb-tn__free', text: 'Bez osoby' })]),
            chkIndicator(b),
            taskCaseChip(b)
          ])
        ]),
        side
      ]);
    }

    function commitSpan(b, person, span, targetId) {
      if (targetId && targetId !== person.id) ctx.actions.reassignTask(b.projectId, b.stageId, b.taskId, person.id, targetId, span.start, span.deadline);
      else ctx.actions.setTaskSpan(b.projectId, b.stageId, b.taskId, span.start, span.deadline);
    }

    function previewLoads(ref, span, fromId, toId) {
      var next = Plan.build(Object.assign({}, baseInput, { projects: withChange(projects, ref, { start: span.start, deadline: span.deadline }, fromId, toId) }));
      next.rows.forEach(function (row) {
        row.weeks.forEach(function (cell, i) {
          var chip = chips[row.personId + ':' + i];
          if (!chip) return;
          chip.className = chipState(cell) + (chip.classList.contains('is-selected') ? ' is-selected' : '');
          chip.textContent = chipText(cell);
        });
      });
    }

    /** Godziny pracy przy zadaniu: klik w liczbę na pasku zamienia ją w pole (Enter zapisuje, Esc wraca). */
    function editHours(btn, b) {
      btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var input = D.el('input', { class: 'input pb-hours-input', attrs: { type: 'text', inputmode: 'decimal', value: hh(b.planned), 'aria-label': 'Zaplanowane godziny zadania ' + b.name, 'data-fk': 'pb-hours-input' } });
        var done = false;
        function commit() {
          if (done) return; done = true;
          var n = Number(String(input.value).trim().replace(',', '.'));
          if (!(n > 0) || n > 2000) { E.Toast.show({ message: 'Podaj liczbę godzin, np. 8 albo 12,5.', tone: 'danger' }); input.replaceWith(btn); return; }
          if (Math.abs(n - b.planned) < 0.05) { input.replaceWith(btn); return; }
          ctx.actions.setTaskHours(b.projectId, b.stageId, b.taskId, n);
        }
        ['pointerdown', 'click', 'keyup'].forEach(function (t) { input.addEventListener(t, function (ev) { ev.stopPropagation(); }); });
        input.addEventListener('keydown', function (ev) {
          ev.stopPropagation();
          if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
          if (ev.key === 'Escape') { ev.preventDefault(); done = true; input.replaceWith(btn); }
        });
        input.addEventListener('blur', commit);
        btn.replaceWith(input);
        input.focus(); input.select();
      });
    }

    function attachBar(el, b, person, item, editable, key) {
      var ref = { projectId: b.projectId, stageId: b.stageId, taskId: b.taskId };
      var found = findTask(projects, ref);
      var today = new Date(plan.today);
      var open = function () { ctx.actions.inspect({ kind: 'task', projectId: b.projectId, stageId: b.stageId, taskId: b.taskId }); };

      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); return; }
        if (!editable || !found || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        var mode = e.shiftKey ? 'end' : (e.altKey ? 'start' : 'move');
        var span = Plan.shiftSpan(found.task, mode, e.key === 'ArrowRight' ? 1 : -1, today);
        if (!span) return;
        pendingFocus = key;
        commitSpan(b, person, span, null);
      });

      if (!editable) { el.addEventListener('click', open); return; }

      el.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || !found) return;
        var handle = e.target.closest ? e.target.closest('[data-h]') : null;
        var track = el.closest('.pb-track');
        var rect = track.getBoundingClientRect();
        drag = {
          mode: handle ? handle.getAttribute('data-h') : 'move', x0: e.clientX, y0: e.clientY, dayW: rect.width / N, moved: false,
          delta: 0, target: person.id, span: null, left: el.style.left, width: el.style.width, raf: 0
        };
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* testy bez przechwytu */ }
        e.preventDefault();
      });

      el.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x0;
        var dy = e.clientY - drag.y0;
        if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        if (!drag.moved) { drag.moved = true; el.classList.add('is-drag'); board.classList.add('is-dragging'); }
        drag.delta = Math.round(dx / drag.dayW);
        var span = Plan.shiftSpan(found.task, drag.mode, drag.delta, today);
        if (!span) return;
        drag.span = span;
        var ns = slotOf(plan.first, new Date(span.start + 'T00:00').getTime(), 1);
        var ne = slotOf(plan.first, new Date(span.deadline.slice(0, 10) + 'T00:00').getTime(), -1);
        paintBar(el, ns, ne);
        el.style.transform = drag.mode === 'move' ? 'translateY(calc(-50% + ' + dy + 'px))' : '';
        el.setAttribute('data-drag', shortDate(new Date(span.start + 'T00:00')) + ' – ' + shortDate(new Date(span.deadline.slice(0, 10) + 'T00:00')));
        var under = document.elementFromPoint(e.clientX, e.clientY);
        var row = under && under.closest ? under.closest('.pb-person[data-person]') : null;
        var target = drag.mode === 'move' && row ? row.getAttribute('data-person') : person.id;
        Object.keys(rowEls).forEach(function (id) { rowEls[id].classList.toggle('is-drop', drag.mode === 'move' && id === target && id !== person.id); });
        drag.target = target;
        var cur = drag;
        if (!cur.raf) cur.raf = window.requestAnimationFrame(function () { cur.raf = 0; if (drag === cur && cur.span) previewLoads(ref, cur.span, person.id, cur.target); });
      });

      function finish(e, cancel) {
        if (!drag) return;
        var d = drag;
        drag = null;
        try { el.releasePointerCapture(e.pointerId); } catch (err) { /* brak przechwytu */ }
        board.classList.remove('is-dragging');
        el.classList.remove('is-drag');
        el.removeAttribute('data-drag');
        el.style.transform = '';
        Object.keys(rowEls).forEach(function (id) { rowEls[id].classList.remove('is-drop'); });
        if (!d.moved) { if (!cancel) open(); return; }
        var changed = d.span && (d.delta !== 0 || d.target !== person.id);
        if (cancel || !changed) {
          el.style.left = d.left; el.style.width = d.width;
          previewLoads(ref, { start: found.task.start || '', deadline: found.task.deadline }, person.id, person.id);
          return;
        }
        pendingFocus = key;
        commitSpan(b, person, d.span, d.target);
      }
      el.addEventListener('pointerup', function (e) { finish(e, false); });
      el.addEventListener('pointercancel', function (e) { finish(e, true); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drag) finish(e, true); });
    }

    /* ---------- tacka: zadania bez terminu ---------- */
    function trayChip(t, person) {
      var editable = canEdit(t.projectId);
      var chip = D.el('button', {
        class: 'pb-chip' + (editable ? ' is-editable' : ''), style: Identity.hueStyle(t.code),
        attrs: { type: 'button', 'data-fk': 'pb-free-' + t.taskId, 'data-tooltip': t.code + ' · ' + t.name + (solo ? '' : ' · ' + hh(t.hours) + ' h') + (editable ? ' — przeciągnij na oś, żeby wyznaczyć termin' : '') }
      }, [D.el('span', { class: 'pb-bar__code', text: t.code }), D.el('span', { class: 'truncate', text: t.name }), solo ? null : D.el('span', { class: 't-num', text: hh(t.hours) + ' h' })]);
      var ref = { projectId: t.projectId, stageId: t.stageId, taskId: t.taskId };
      var open = function () { ctx.actions.inspect({ kind: 'task', projectId: t.projectId, stageId: t.stageId, taskId: t.taskId }); };
      if (!editable) { chip.addEventListener('click', open); return chip; }
      var d = null;
      function slotAt(e) {
        var under = document.elementFromPoint(e.clientX, e.clientY);
        var row = under && under.closest ? under.closest('.pb-person[data-person]') : null;
        if (!row) return null;
        var track = row.querySelector('.pb-track');
        var rect = track.getBoundingClientRect();
        var slot = Math.floor((e.clientX - rect.left) / (rect.width / N));
        return slot >= 0 && slot < N ? { personId: row.getAttribute('data-person'), slot: slot } : { personId: row.getAttribute('data-person'), slot: -1 };
      }
      chip.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        d = { x: e.clientX, y: e.clientY, moved: false };
        try { chip.setPointerCapture(e.pointerId); } catch (err) { /* testy */ }
        e.preventDefault();
      });
      chip.addEventListener('pointermove', function (e) {
        if (!d) return;
        var dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        d.moved = true;
        board.classList.add('is-dragging');
        chip.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        var at = slotAt(e);
        Object.keys(rowEls).forEach(function (id) { rowEls[id].classList.toggle('is-drop', !!at && at.slot >= 0 && id === at.personId); });
      });
      function end(e, cancel) {
        if (!d) return;
        var s = d; d = null;
        try { chip.releasePointerCapture(e.pointerId); } catch (err) { /* brak */ }
        board.classList.remove('is-dragging');
        chip.style.transform = '';
        Object.keys(rowEls).forEach(function (id) { rowEls[id].classList.remove('is-drop'); });
        if (!s.moved) { if (!cancel) open(); return; }
        if (cancel) return;
        var at = slotAt(e);
        if (!at || at.slot < 0) return;
        var start = dateOfSlot(plan.first, at.slot);
        var needDays = Math.max(1, Math.ceil(t.hours / dayH - 1e-9));
        var endDay = Plan.addWorkdays(start, needDays - 1);
        if (t.deadline && /^\d{4}-\d{2}-\d{2}/.test(t.deadline)) {
          var kept = new Date(t.deadline.slice(0, 10) + 'T00:00');
          if (kept.getTime() >= start.getTime()) endDay = kept;
        }
        var iso = function (x) { return Plan.isoDay(x); };
        if (at.personId !== person.id) ctx.actions.reassignTask(ref.projectId, ref.stageId, ref.taskId, person.id, at.personId, iso(start), iso(endDay) + 'T16:00');
        else ctx.actions.setTaskSpan(ref.projectId, ref.stageId, ref.taskId, iso(start), iso(endDay) + 'T16:00', { message: 'Wyznaczono termin zadania „' + t.name + '”' });
      }
      chip.addEventListener('pointerup', function (e) { end(e, false); });
      chip.addEventListener('pointercancel', function (e) { end(e, true); });
      return chip;
    }

    /* ---------- oś: tło tygodni, święta, dziś, pasma nieobecności ---------- */
    var holSlots = [];
    for (var hs = 0; hs < N; hs += 1) {
      if (Cal.isHoliday(Plan.isoDay(dateOfSlot(plan.first, hs)))) holSlots.push(hs);
    }
    function trackBase(inner, bands) {
      var weekCols = D.el('div', { class: 'pb-wks', attrs: { 'aria-hidden': 'true' } }, plan.weeks.map(function (w) { return D.el('span', { class: 'pb-wk' + (w.current ? ' is-current' : '') }); }));
      var inTrack = todaySlot >= 0 && todaySlot < N;
      var colTint = inTrack && !Cal.isWeekend(Plan.isoDay(new Date(plan.today)));
      var holCols = holSlots.map(function (i) { return D.el('span', { class: 'pb-holcol', style: { left: (i / N * 100) + '%', width: (100 / N) + '%' }, attrs: { 'aria-hidden': 'true' } }); });
      var children = [weekCols].concat(
        holCols,
        [colTint ? D.el('span', { class: 'pb-todaycol', style: { left: (todaySlot / N * 100) + '%', width: (100 / N) + '%' }, attrs: { 'aria-hidden': 'true' } }) : null],
        [inTrack ? D.el('span', { class: 'pb-today', style: { left: (todaySlot / N * 100) + '%' }, attrs: { 'aria-hidden': 'true' } }) : null],
        bands || [],
        inner
      );
      return D.el('div', { class: 'pb-track' }, children);
    }

    /* ---------- realizacja: słupki zarejestrowanego czasu pod paskiem planu ---------- */
    var DAY_NAMES = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];
    function clockText(ms) { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function durText(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + ' h ' + String(m).padStart(2, '0') + ' min' : m + ' min'; }
    function realStrip(rt, planStartSlot) {
      var perSlot = {};
      Object.keys(rt.days).forEach(function (dk) {
        var sl = slotOf(plan.first, new Date(dk + 'T00:00').getTime(), -1);
        if (sl < 0 || sl >= N) return;
        perSlot[sl] = (perSlot[sl] || 0) + rt.days[dk];
      });
      var blocks = Object.keys(perSlot).map(function (key) {
        var sl = Number(key), h = perSlot[key];
        var d = dateOfSlot(plan.first, sl);
        var pre = planStartSlot !== null && sl < planStartSlot;
        return D.el('span', {
          class: 'pb-real__d' + (h > dayH + 0.05 ? ' is-over' : '') + (pre ? ' is-pre' : ''),
          style: { left: (sl / N * 100) + '%', width: (100 / N) + '%', '--h': Math.min(100, h / (dayH * 0.75) * 100) + '%' },
          attrs: { 'data-tooltip': DAY_NAMES[d.getDay()] + ' ' + shortDate(d) + ': zarejestrowano ' + hh(h) + ' h' + (pre ? ' (przed planowanym startem)' : '') }
        }, [D.el('i')]);
      });
      return D.el('div', { class: 'pb-real', style: Identity.hueStyle(rt.code), attrs: { role: 'img', 'aria-label': 'Zarejestrowany czas: ' + hh(rt.total) + ' h w oknie' } }, blocks);
    }
    function realTaskKey(t) { return t.projectId + '|' + t.stageId + '|' + t.taskId; }
    function liveLine(rec, quiet) {
      if (!rec) return null;
      if (rec.current) {
        return D.el('span', { class: 'pb-live-line is-on', attrs: { 'data-tooltip': 'Uruchomiony licznik' } }, [
          D.el('i', { class: 'pb-dot', attrs: { 'aria-hidden': 'true' } }),
          D.el('span', { class: 'mrow__project', style: Identity.hueStyle(rec.current.code), text: rec.current.code }),
          D.el('span', { class: 'truncate', text: rec.current.name }),
          D.el('small', { class: 't-muted t-num', text: 'od ' + clockText(rec.current.since) + ' · ' + durText(rec.current.minutes) })
        ]);
      }
      if (quiet || !rec.last) return null;
      var d = new Date(rec.last.at);
      return D.el('span', { class: 'pb-live-line' }, [D.el('small', { class: 't-muted', text: 'ostatnio ' + DAY_NAMES[d.getDay()] + ' ' + clockText(rec.last.at) + ' · ' + rec.last.code + ' ' + rec.last.name })]);
    }

    /* ---------- bieżąca praca: zielony wiersz, uchwyt do przeciągania zegara (pracownik) ---------- */
    function nowBadge(cur) {
      return D.el('span', { class: 'pb-now', attrs: { 'data-fk': 'pb-now' } }, [
        D.el('b', { text: 'TERAZ' }),
        solo
          ? D.el('time', { class: 't-num', text: durClock(Date.now() - cur.since), attrs: { 'data-timer-start': String(cur.since), 'aria-hidden': 'true' } })
          : D.el('small', { class: 't-num', text: 'od ' + clockText(cur.since) + ' · ' + durText(cur.minutes) })
      ]);
    }
    function durClock(ms) {
      var s = Math.max(0, Math.floor(ms / 1000));
      return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }
    function dropRef(rowEl) {
      var tn = rowEl && rowEl.querySelector('.pb-tn');
      if (!tn) return null;
      var pr = projects.filter(function (p) { return String(p.id) === tn.dataset.projectId; })[0];
      return pr ? { projectId: pr.id, stageId: tn.dataset.stageId, taskId: tn.dataset.taskId } : null;
    }
    function attachSwitchDrag(grip, srcRow, label) {
      grip.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var ghost = D.el('div', { class: 'pb-ghost', text: label });
        document.body.appendChild(ghost);
        var over = null;
        function place(ev) { ghost.style.left = (ev.clientX + 12) + 'px'; ghost.style.top = (ev.clientY + 6) + 'px'; }
        function mark(ev) {
          place(ev);
          var hit = document.elementFromPoint(ev.clientX, ev.clientY);
          var row = hit && hit.closest ? hit.closest('.pb-row--task') : null;
          if (row && (row === srcRow || !row.querySelector('.pb-tn') || row.classList.contains('pb-row--now'))) row = null;
          if (row !== over) { if (over) over.classList.remove('is-drop'); over = row; if (over) over.classList.add('is-drop'); }
        }
        function end(ev, cancel) {
          grip.removeEventListener('pointermove', mark);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', cancelUp);
          try { grip.releasePointerCapture(e.pointerId); } catch (err) { /* testy */ }
          ghost.remove();
          srcRow.classList.remove('is-dragging');
          var target = over;
          if (over) over.classList.remove('is-drop');
          over = null;
          var ref = !cancel && target ? dropRef(target) : null;
          if (ref) ctx.actions.switchTimer(ref.projectId, ref.stageId, ref.taskId);
        }
        function up(ev) { end(ev, false); }
        function cancelUp(ev) { end(ev, true); }
        try { grip.setPointerCapture(e.pointerId); } catch (err) { /* testy */ }
        srcRow.classList.add('is-dragging');
        grip.addEventListener('pointermove', mark);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', cancelUp);
        mark(e);
      });
    }

    /* ---------- wiersze osób: nagłówek z obciążeniem (tylko zarząd/lider) i wiersz na zadanie ---------- */
    function personRow(row) {
      var person = Team.findPerson(people, row.personId);
      var items = row.bars.map(function (b) {
        return { b: b, s: slotOf(plan.first, b.start, 1), e: slotOf(plan.first, b.end, -1), lane: 0 };
      }).filter(function (it) { return it.e >= 0 && it.s < N; });
      items.forEach(function (it) { it.e = Math.max(it.e, it.s); });
      var rv = mode === 'people' && (viewSel === 'both' || viewSel === 'done');
      var rec = real[row.personId] || null;
      var recTasks = (rec ? rec.tasks : []).filter(function (t) { return !wantProject || t.projectId === wantProject; });
      var realOf = {};
      recTasks.forEach(function (t) { realOf[realTaskKey(t)] = t; });
      var curRun = rec && rec.current ? rec.current : null;
      var nowKey = curRun ? curRun.projectId + '|' + curRun.stageId + '|' + curRun.taskId : null;
      var nowVisible = !!curRun && (items.some(function (it) { return it.b.projectId + '|' + it.b.stageId + '|' + it.b.taskId === nowKey; }) || (rv && recTasks.some(function (t) { return realTaskKey(t) === nowKey; })));
      function decorate(rowEl, nameNode, b) {
        var key = b.projectId + '|' + b.stageId + '|' + b.taskId;
        var pend = state.pendingSwitch;
        if (curRun && key === nowKey) {
          rowEl.classList.add('pb-row--now');
          var txt = nameNode.querySelector('.pb-tn__txt');
          if (txt) txt.appendChild(nowBadge(curRun));
          if (solo) {
            var grip = D.el('button', { class: 'pb-grip', text: '⋮⋮', attrs: { type: 'button', 'data-fk': 'pb-grip', 'data-tooltip': 'Przeciągnij na inne zadanie, żeby przenieść tam zegar', 'aria-label': 'Przeciągnij na inne zadanie, żeby przenieść zegar' } });
            attachSwitchDrag(grip, rowEl, b.code + ' · ' + b.name);
            var lab = rowEl.firstChild;
            lab.insertBefore(grip, lab.firstChild);
          }
        } else if (solo && curRun && b.status !== 'done') {
          var sw = D.el('button', { class: 'pb-switch', attrs: { type: 'button', 'data-fk': 'pb-switch-' + b.taskId, 'aria-label': 'Przełącz zegar na to zadanie' }, on: { click: function () { ctx.actions.switchTimer(b.projectId, b.stageId, b.taskId); } } }, [E.Icons.icon('play', 12), D.el('span', { text: 'Przełącz tu' })]);
          rowEl.firstChild.appendChild(sw);
        }
        if (pend && pend.projectId === b.projectId && pend.stageId === b.stageId && pend.taskId === b.taskId) rowEl.classList.add('is-pending');
      }
      if (solo) items.sort(function (a, b) { return (a.b.overdue ? 0 : 1) - (b.b.overdue ? 0 : 1) || a.e - b.e || a.s - b.s; });
      else items.sort(function (a, b) { return (rankOf[a.b.projectId] || 1e6) - (rankOf[b.b.projectId] || 1e6) || a.s - b.s; });
      var weekEndSlot = Math.floor(Math.max(todaySlot, 0) / 5) * 5 + 4;
      var lastGroup = '';
      function bandEls(interactive) {
        return (row.absences || []).map(function (a) {
          var bs = slotOf(plan.first, new Date(a.from + 'T00:00').getTime(), 1);
          var be = slotOf(plan.first, new Date(a.to + 'T00:00').getTime(), -1);
          if (be < 0 || bs >= N || be < bs) return null;
          var s0 = Math.max(0, bs), e0 = Math.min(N - 1, be);
          var tip = (E.Absences.KINDS[a.kind] || 'Nieobecność') + ' · ' + a.from.slice(8) + '.' + a.from.slice(5, 7) + ' – ' + a.to.slice(8) + '.' + a.to.slice(5, 7) + (a.note ? ' · ' + a.note : '') + (interactive && management ? ' — kliknij, żeby zmienić' : '');
          var el = D.el(interactive && management ? 'button' : 'span', {
            class: 'pb-absent' + (interactive ? ' is-head' : ''), dataset: { kind: a.kind },
            style: { left: (s0 / N * 100) + '%', width: ((e0 - s0 + 1) / N * 100) + '%' },
            attrs: interactive ? { type: 'button', 'data-tooltip': tip, 'data-fk': 'pb-absent-' + a.id, 'aria-label': tip } : { 'aria-hidden': 'true' },
            text: interactive ? ((e0 - s0 + 1) >= 2 ? (E.Absences.KINDS[a.kind] || '') + ' · ' + (e0 - s0 + 1) + ' dn.' : (E.Absences.KINDS[a.kind] || 'N').charAt(0)) : ''
          });
          if (interactive && management) el.addEventListener('click', function () { ctx.actions.openAbsence(row.personId, a.id); });
          return el;
        }).filter(Boolean);
      }
      function trackOf(inner, bands) { return trackBase(inner, bands === undefined ? bandEls(false) : bands); }
      var rows = [];
      if (!solo) {
        var weekReal = row.weeks.map(function () { return 0; });
        if (rv) recTasks.forEach(function (t) {
          Object.keys(t.days).forEach(function (dk) {
            var sl = slotOf(plan.first, new Date(dk + 'T00:00').getTime(), -1);
            if (sl >= 0 && sl < N) weekReal[Math.floor(sl / 5)] += t.days[dk];
          });
        });
        var loads = D.el('div', { class: 'pb-loads', attrs: { role: 'row' } }, row.weeks.map(function (cell, i) {
          var isSel = selected && selected.personId === row.personId && selected.week === i;
          var chip = D.el('button', {
            class: chipState(cell) + (isSel ? ' is-selected' : ''),
            attrs: { type: 'button', role: 'cell', 'aria-pressed': String(!!isSel), 'data-fk': 'pl-cell-' + row.personId + '-' + i, 'data-tooltip': chipTip(cell) },
            on: { click: function () { ctx.actions.setTime(Object.fromEntries([[K.cell, isSel ? null : { personId: row.personId, week: i }]])); } }
          }, [D.el('span', { class: 'pb-load__a', text: chipText(cell) }), chipSub(cell, weekReal[i]) ? D.el('small', { class: 'pb-load__b', text: chipSub(cell, weekReal[i]) }) : null]);
          chips[row.personId + ':' + i] = chip;
          return chip;
        }));
        var total = row.weeks.reduce(function (t, c) { return t + c.planned; }, 0);
        var label = D.el('div', { class: 'pb-label', attrs: { 'data-tooltip': hh(total) + ' h planu w oknie' } }, [
          E.Avatar.avatar(person, { size: 'sm', tooltip: false }),
          D.el('span', { class: 'pb-label__txt' }, [D.el('span', { class: 'pb-label__name truncate', text: Team.fullName(person) }), (rv && rec ? D.el('small', { class: 't-muted t-num', text: 'zarejestrowano ' + hh(recTasks.reduce(function (t, x) { return t + x.total; }, 0)) + ' h' }) : null), curRun ? liveLine(rec) : (viewSel === 'plan' ? null : liveLine(rec))])
        ]);
        var openWeek = selected && selected.personId === row.personId && typeof selected.week === 'number' ? selected.week : -1;
        var dayBars = openWeek < 0 ? null : D.el('div', { class: 'pb-dbars', attrs: { 'aria-hidden': 'true' } }, (function () {
          var out = [];
          for (var sl = 0; sl < N; sl += 1) {
            if (Math.floor(sl / 5) !== openWeek) { out.push(D.el('span', { class: 'pb-dbar is-off' })); continue; }
            var hrs = (row.days && row.days[Plan.isoDay(dateOfSlot(plan.first, sl))]) || 0;
            var over = hrs > dayH + 0.05;
            out.push(D.el('span', { class: 'pb-dbar' + (over ? ' is-over' : '') + (hrs ? '' : ' is-empty'), style: { '--h': Math.min(100, hrs / dayH * 70) + '%' }, attrs: hrs ? { 'data-tooltip': hh(hrs) + ' h zaplanowane tego dnia' + (over ? ' (ponad ' + hh(dayH) + ' h)' : '') } : {} }));
          }
          return out;
        })());
        rows.push(D.el('div', { class: 'pb-row pb-row--who' }, [label, D.el('div', { class: 'pb-cell' }, [trackOf(dayBars ? [loads, dayBars] : [loads], bandEls(true))])]));
      }
      items.forEach(function (it) {
        if (solo) {
          var grp = it.b.overdue ? 'late' : (it.e <= weekEndSlot ? 'week' : 'later');
          if (grp !== lastGroup) {
            lastGroup = grp;
            rows.push(D.el('div', { class: 'pb-grp' + (grp === 'late' ? ' is-late' : '') }, [D.el('span', { text: grp === 'late' ? 'Po terminie' : (grp === 'week' ? 'Ten tydzień' : 'Później') })]));
          }
        }
        if (rv && viewSel === 'done' && !realOf[it.b.projectId + '|' + it.b.stageId + '|' + it.b.taskId]) return;
        var rt = rv ? realOf[it.b.projectId + '|' + it.b.stageId + '|' + it.b.taskId] : null;
        if (rt) rt.shown = true;
        var bars = D.el('div', { class: 'pb-bars' + (rv ? ' pb-bars--real' : '') }, [viewSel === 'done' && rv ? null : barEl(it.b, person, it), rt ? realStrip(rt, viewSel === 'done' ? null : it.s) : null]);
        var nameNode = nameCell(it.b);
        var taskRowEl = D.el('div', { class: 'pb-row pb-row--task' }, [D.el('div', { class: 'pb-label pb-label--task' }, [nameNode]), D.el('div', { class: 'pb-cell' }, [trackOf([bars])])]);
        var chkHolder = nameNode.querySelector('.pb-tn__chk');
        if (chkHolder && chkHolder.__open) chkHolder.__open(taskRowEl);
        decorate(taskRowEl, nameNode, it.b);
        rows.push(taskRowEl);
      });
      if (rv) {
        recTasks.filter(function (t) { return !t.shown; }).sort(function (a, b) { return (rankOf[a.projectId] || 1e6) - (rankOf[b.projectId] || 1e6); }).forEach(function (t) {
          var tk = taskOf(t);
          var b0 = { projectId: t.projectId, stageId: t.stageId, taskId: t.taskId, name: t.name, code: t.code, planned: tk && Number(tk.estimate) > 0 ? Number(tk.estimate) : 0, logged: t.all, start: 0, end: 0, hours: 0, days: 1, workers: 1, status: tk ? tk.status : 'done' };
          var nameNode = nameCell(b0);
          var bars = D.el('div', { class: 'pb-bars pb-bars--real' }, [realStrip(t, null)]);
          var rowEl = D.el('div', { class: 'pb-row pb-row--task' }, [D.el('div', { class: 'pb-label pb-label--task' }, [nameNode]), D.el('div', { class: 'pb-cell' }, [trackOf([bars])])]);
          decorate(rowEl, nameNode, b0);
          rows.push(rowEl);
        });
      }
      if (row.unscheduled.tasks.length) {
        rows.push(D.el('div', { class: 'pb-free' }, [D.el('span', { class: 'pb-free__l t-muted', text: 'Bez terminu' })].concat(row.unscheduled.tasks.map(function (t) { return trayChip(t, person); }))));
      }
      if (!rows.length) rows.push(D.el('div', { class: 'pb-row pb-row--task' }, [D.el('div', { class: 'pb-label pb-label--task' }, [D.el('span', { class: 't-muted', text: 'Brak zadań z terminem' })]), D.el('div', { class: 'pb-cell' }, [trackOf([])])]));
      caseRows(row.personId, trackOf).forEach(function (r) { rows.push(r); });
      var el = D.el('div', { class: 'pb-person', dataset: { person: row.personId }, attrs: { role: 'group', 'aria-label': Team.fullName(person) } }, rows);
      rowEls[row.personId] = el;
      return el;
    }

    /* ---------- szerokość lewej kolumny (nazwy zadań i projektów): uchwyt w nagłówku, wspólna dla obu widoków ---------- */
    function resizer() {
      var LW_MIN = 224, LW_MAX = 640, LW_DEF = 336;
      var handle = D.el('div', { class: 'pb-resize', attrs: { role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'aria-label': 'Szerokość kolumny z nazwami', 'aria-valuemin': String(LW_MIN), 'aria-valuemax': String(LW_MAX), 'data-fk': 'pb-resize', 'data-tooltip': 'Przeciągnij, żeby zmienić szerokość kolumny (dwuklik: domyślna)' } });
      function clamp(v) { return Math.max(LW_MIN, Math.min(LW_MAX, Math.round(v))); }
      function apply(v, save) {
        var w = clamp(v);
        handle.setAttribute('aria-valuenow', String(w));
        var b = handle.closest('.pb');
        if (b) b.style.setProperty('--lw', w + 'px');
        if (save) { try { window.localStorage.setItem('etrom.pb.labelWidth', String(w)); } catch (err) { /* brak pamięci */ } }
        return w;
      }
      handle.setAttribute('aria-valuenow', String(labelW));
      var d = null;
      handle.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        d = { x: e.clientX, w: handle.parentNode.getBoundingClientRect().width };
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* testy */ }
        handle.classList.add('is-drag');
        e.preventDefault();
      });
      handle.addEventListener('pointermove', function (e) { if (d) d.now = apply(d.w + e.clientX - d.x, false); });
      function end() { if (!d) return; var w = d.now || d.w; d = null; handle.classList.remove('is-drag'); apply(w, true); }
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
      handle.addEventListener('dblclick', function () { apply(LW_DEF, true); });
      handle.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home') return;
        e.preventDefault();
        var cur = Number(handle.getAttribute('aria-valuenow')) || LW_DEF;
        apply(e.key === 'Home' ? LW_DEF : cur + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 48 : 16), true);
      });
      return handle;
    }

    /* ---------- nagłówek, pasek narzędzi ---------- */
    var compact = weeksN >= 8;
    var todayKey = Plan.isoDay(new Date(plan.today));
    var todayWork = !Cal.isWeekend(todayKey);
    function dayCells(wi) {
      var out = [];
      for (var k = 0; k < 5; k += 1) {
        var slot = wi * 5 + k;
        var key = Plan.isoDay(dateOfSlot(plan.first, slot));
        var hol = Cal.holidayName(key);
        out.push(D.el('span', {
          class: 'pb-dh' + (todayWork && slot === todaySlot ? ' is-today' : '') + (hol ? ' is-hol' : ''),
          attrs: hol ? { 'data-tooltip': hol } : {}
        }, compact ? [D.el('b', { text: String(Number(key.slice(8))) })] : [D.el('small', { text: DOWS[k] }), D.el('b', { text: String(Number(key.slice(8))) })]));
      }
      return D.el('span', { class: 'pb-days' }, out);
    }
    var head = D.el('div', { class: 'pb-row pb-row--head' }, [
      D.el('div', { class: 'pb-label' }, [resizer()]),
      D.el('div', { class: 'pb-cell' }, [D.el('div', { class: 'pb-track pb-track--head' }, [D.el('div', { class: 'pb-wks pb-wks--head' }, plan.weeks.map(function (w, wi) {
        var wkKey = Plan.isoDay(new Date(w.start));
        return D.el('span', { class: 'pb-wk pb-wk--head' + (w.current ? ' is-current' : '') }, [
          D.el('span', { class: 'pb-wk__top', attrs: { 'data-tooltip': 'Tydzień ' + Cal.weekNumber(wkKey) + ': ' + weekLabel(w.start) } }, [D.el('b', { text: 'Tydz. ' + Cal.weekNumber(wkKey) }), weeksN >= 6 ? null : D.el('small', { text: weekLabel(w.start) + (w.current ? ' · bieżący' : '') })]),
          dayCells(wi)
        ]);
      }))])])
    ]);

    function filters() {
      if (solo) return [];
      var used = {};
      allRows.forEach(function (r) { r.bars.forEach(function (b) { used[b.projectId] = b.code; }); });
      var ids = Object.keys(used);
      var out = [];
      if (allRows.length > 1) {
        var ps = UI.select({
          id: 'pb-person', value: wantPerson,
          options: [{ value: '', label: 'Wszystkie osoby' }].concat(allRows.map(function (r) { return { value: String(r.personId), label: Team.fullName(Team.findPerson(people, r.personId)) }; })),
          attrs: { 'data-fk': 'pb-person', 'aria-label': 'Pokaż plan jednej osoby' },
          on: { change: function () { ctx.actions.setTime({ planPerson: ps.value }); } }
        });
        out.push(ps);
      }
      if (ids.length > 1) {
        var select = UI.select({
          id: 'pb-project', value: wantProject ? String(wantProject) : '',
          options: [{ value: '', label: 'Wszystkie projekty' }].concat(ids.sort(function (a, b) { return used[a] < used[b] ? -1 : 1; }).map(function (id) { return { value: id, label: used[id] }; })),
          attrs: { 'data-fk': 'pb-project', 'aria-label': 'Pokaż plan jednego projektu' },
          on: { change: function () { ctx.actions.setTime({ planProject: select.value }); } }
        });
        out.push(select);
      }
      return out;
    }

    /* ---------- widok „Wg projektów”: projekty w kolejności z listy Projekty, zadania jako paski ---------- */
    var canProjects = !solo && (management || led.length > 0);
    var mode = canProjects && state.planMode === 'projects' ? 'projects' : 'people';

    function projectGroups() {
      var shown = ranked.filter(function (p) { return management || (p.team && p.team.leader === me.id); });
      var byTask = {};
      plan.rows.forEach(function (r) {
        var who = Team.findPerson(people, r.personId);
        r.bars.forEach(function (b) { var key = b.projectId + '|' + b.stageId + '|' + b.taskId; (byTask[key] = byTask[key] || []).push({ b: b, person: who }); });
      });
      return shown.filter(function (p) { return !wantProject || p.id === wantProject; }).map(function (project) {
        var items = [];
        (project.stages || []).forEach(function (st) {
          (st.tasks || []).forEach(function (t) {
            if (t.status === 'done' || t.draft) return;
            var found = byTask[project.id + '|' + st.id + '|' + t.id];
            var b = null, who = [], person = null, free = false;
            if (found && found.length) { b = found[0].b; person = found[0].person; who = found.map(function (x) { return x.person; }).filter(Boolean); }
            else if (!(t.assignees || []).length && /^\d{4}-\d{2}-\d{2}/.test(t.deadline || '')) {
              var due = new Date(t.deadline.slice(0, 10) + 'T00:00');
              var from = /^\d{4}-\d{2}-\d{2}$/.test(t.start || '') ? new Date(t.start + 'T00:00') : new Date(plan.today);
              if (from.getTime() > due.getTime()) from = due;
              b = { projectId: project.id, stageId: st.id, taskId: t.id, name: t.name, code: project.code, start: from.getTime(), end: due.getTime(), hours: 0, days: 1, workers: 1, logged: 0, planned: Number(t.estimate) > 0 ? Number(t.estimate) : 0, status: t.status, overdue: due.getTime() < plan.today, explicitStart: !!t.start, free: true };
              person = { id: '_' }; free = true;
            }
            if (!b) return;
            if (wantPerson && !who.some(function (w) { return String(w.id) === wantPerson; })) return;
            var it = { b: b, s: slotOf(plan.first, b.start, 1), e: slotOf(plan.first, b.end, -1), lane: 0, person: person, who: who, free: free };
            if (it.e < 0 || it.s >= N) return;
            it.e = Math.max(it.e, it.s);
            items.push(it);
          });
        });
        items.sort(function (a, c) { return a.s - c.s || a.e - c.e; });
        return { project: project, items: items };
      }).filter(function (g) { return g.items.length; });
    }

    function projectHeader(g) {
      var project = g.project;
      var s0 = Math.max(0, Math.min.apply(null, g.items.map(function (i) { return i.s; })));
      var e0 = Math.min(N - 1, Math.max.apply(null, g.items.map(function (i) { return i.e; })));
      var pct = E.Progress.projectProgress(project).percent;
      var dl = project.deadline ? slotOf(plan.first, new Date(String(project.deadline).slice(0, 10) + 'T00:00').getTime(), -1) : -1;
      var free = g.items.filter(function (i) { return i.free; }).length;
      var sum = D.el('div', { class: 'pb-psum', style: Object.assign({ left: (s0 / N * 100) + '%', width: (Math.max(1, e0 - s0 + 1) / N * 100) + '%' }, Identity.hueStyle(project.code)), attrs: { 'data-tooltip': project.name + ' · postęp projektu ' + pct + '%' } }, [
        D.el('i', { class: 'pb-psum__fill', style: { width: pct + '%' } })
      ]);
      var diamond = dl >= 0 && dl < N ? D.el('span', { class: 'pb-pdia', style: Object.assign({ left: ((dl + .5) / N * 100) + '%' }, Identity.hueStyle(project.code)), attrs: { 'data-tooltip': 'Termin projektu · ' + shortDate(new Date(String(project.deadline).slice(0, 10) + 'T00:00')) } }) : null;
      return D.el('div', { class: 'pb-row pb-row--proj' }, [
        D.el('div', { class: 'pb-label pb-label--proj' }, [
          UI.projectTag(project, { href: E.ProjectList.projectHref(project) }),
          free ? D.el('span', { class: 'pb-proj__free', text: E.Format.count(free, 'zadanie bez osoby', 'zadania bez osoby', 'zadań bez osoby') }) : null
        ]),
        D.el('div', { class: 'pb-cell' }, [trackBase([D.el('div', { class: 'pb-bars pb-bars--proj' }, [sum, diamond])], [])])
      ]);
    }

    function stageIndex(project, stageId) {
      for (var i = 0; i < (project.stages || []).length; i += 1) if (project.stages[i].id === stageId) return i;
      return 1e6;
    }
    /** Nagłówek etapu z budżetem: wykonane godziny / budżet · % (godziny tylko dla zarządu i lidera). */
    function stageHeader(project, stageId) {
      var st = (project.stages || []).filter(function (x) { return x.id === stageId; })[0];
      if (!st || !(Number(st.hours) > 0)) return null;
      var v = Budget.view(project, st, state.workspace.entries || [], me.id, people, new Date(plan.today));
      var over = v.state === 'over';
      var txt = (v.exact ? hh(v.used) + ' / ' + hh(v.planned) + ' h · ' : '') + v.percent + '%';
      var flag = st.budgetFlag;
      var auto = st.status !== 'done' && (v.state === 'warn' || v.state === 'over')
        ? D.el('span', { class: 'pb-stage__auto pb-stage__auto--' + v.state, attrs: { 'data-tooltip': 'Sygnał z budżetu etapu (widzi lider projektu i zarząd)' }, text: E.BudgetFlag.SHORT[v.state] }) : null;
      var ctl = null;
      if (canEdit(project.id) && (auto || flag)) {
        var flagBtn = D.el('button', {
          class: 'pb-stage__flag' + (flag ? ' is-set' : ''),
          attrs: { type: 'button', 'data-fk': 'pb-stage-flag-' + st.id, 'data-tooltip': flag ? E.BudgetFlag.tip(flag, people) : 'Zespół zobaczy oznaczenie przy zadaniach etapu' }
        }, [E.Icons.icon('flag', 12), D.el('span', { text: flag ? 'oznaczone dla zespołu' : 'Oznacz dla zespołu' })]);
        flagBtn.addEventListener('click', function () { E.BudgetFlag.openForm(flagBtn, project, st, flag, ctx.actions); });
        ctl = flagBtn;
      }
      return D.el('div', { class: 'pb-row pb-row--stage' }, [
        D.el('div', { class: 'pb-label pb-label--stage' }, [
          D.el('span', { class: 'pb-stage__lead' }, [
            D.el('span', { class: 'pb-stage__name truncate', text: E.Model.describeStage(st).name, attrs: { title: E.Model.describeStage(st).name } }),
            D.el('span', { class: 'pb-stage__ctl' }, [auto, ctl])
          ]),
          D.el('span', { class: 'pb-stage__bud t-num' + (over ? ' is-over' : ''), attrs: { 'data-tooltip': 'Budżet godzin etapu' } }, [
            D.el('span', { text: txt }),
            D.el('i', { class: 'pb-tn__meter', style: { '--p': Math.min(100, v.percent) + '%' }, attrs: { 'aria-hidden': 'true' } }),
            D.el('small', { text: 'budżet etapu' })
          ])
        ]),
        D.el('div', { class: 'pb-cell' }, [trackBase([], [])])
      ]);
    }

    function projectBoardRows() {
      var out = [];
      projectGroups().forEach(function (g) {
        var rows = [projectHeader(g)];
        var lastStage = null;
        g.items.slice().sort(function (a, c) { return stageIndex(g.project, a.b.stageId) - stageIndex(g.project, c.b.stageId) || a.s - c.s || a.e - c.e; }).forEach(function (it) {
          if (it.b.stageId !== lastStage) {
            lastStage = it.b.stageId;
            var sh = stageHeader(g.project, it.b.stageId);
            if (sh) rows.push(sh);
          }
          var nameNode = nameCell(it.b, it.who.length ? it.who : []);
          var bars = D.el('div', { class: 'pb-bars' }, [barEl(it.b, it.person, it)]);
          var rowEl = D.el('div', { class: 'pb-row pb-row--task' }, [D.el('div', { class: 'pb-label pb-label--task' }, [nameNode]), D.el('div', { class: 'pb-cell' }, [trackBase([bars], [])])]);
          var holder = nameNode.querySelector('.pb-tn__chk');
          if (holder && holder.__open) holder.__open(rowEl);
          rows.push(rowEl);
        });
        out.push(D.el('div', { class: 'pb-person pb-person--proj', attrs: { role: 'group', 'aria-label': g.project.name } }, rows));
      });
      return out;
    }

    /** Tacka „Do przydzielenia”: zadania, do których nikt nie jest przypisany; przeciągnięte na osobę dostają ją i termin. */
    function unassignedTray() {
      if (solo || mode !== 'people') return null;
      var list = (plan.unassigned || []).filter(function (t) { return management || led.some(function (p) { return p.id === t.projectId; }); });
      if (!list.length) return null;
      return D.el('div', { class: 'pb-free pb-free--unassigned' }, [D.el('span', { class: 'pb-free__l', text: 'Do przydzielenia ' + list.length + ' · przeciągnij na osobę i dzień' })].concat(list.map(function (t) { return trayChip(t, { id: '_' }); })));
    }

    /* ---------- „Na żywo”: kto nad czym pracuje, ostatnie dni i oś dzisiejszego dnia ---------- */
    function livePanel() {
      var liveReal = Plan.realization({ projects: projects, entries: state.workspace.entries || [], now: now, first: new Date(plan.today - 14 * 86400000), weeks: 3, personIds: visibleIds });
      var rows = plan.rows;
      var days = [];
      for (var back = 0, d0 = new Date(plan.today); days.length < 6 && back < 14; back += 1) {
        var dd = new Date(plan.today - back * 86400000);
        if (dd.getDay() === 0 || dd.getDay() === 6) continue;
        days.unshift(dd);
      }
      function card(row) {
        var person = Team.findPerson(people, row.personId);
        var rec = liveReal[row.personId] || { tasks: [], current: null, last: null, today: [] };
        var task = rec.current || rec.last;
        var bar = task ? row.bars.filter(function (b) { return b.projectId === task.projectId && b.stageId === task.stageId && b.taskId === task.taskId; })[0] : null;
        var tk = task ? taskOf(task) : null;
        var planned = bar ? bar.planned : (tk && Number(tk.estimate) > 0 ? Number(tk.estimate) : 0);
        var logged = bar ? bar.logged : (task ? (rec.tasks.filter(function (t) { return t.taskId === task.taskId && t.projectId === task.projectId; })[0] || { all: 0 }).all : 0);
        var pct = planned > 0 ? Math.min(100, logged / planned * 100) : 0;
        var spark = days.map(function (dd) {
          var key = Plan.isoDay(dd), segs = [];
          rec.tasks.forEach(function (t) { if (t.days[key]) segs.push({ code: t.code, h: t.days[key] }); });
          var tot = segs.reduce(function (a, x) { return a + x.h; }, 0);
          return D.el('span', { class: 'pb-spark__d', attrs: { 'data-tooltip': DAY_NAMES[dd.getDay()] + ' ' + shortDate(dd) + ': ' + (tot ? hh(tot) + ' h' : 'brak wpisów') } }, segs.map(function (x) {
            return D.el('i', { style: Object.assign({ height: Math.min(100, x.h / 10 * 100) + '%' }, Identity.hueStyle(x.code)) });
          }));
        });
        return D.el('article', { class: 'pb-lc' + (rec.current ? ' is-on' : ''), dataset: { person: row.personId } }, [
          D.el('header', { class: 'pb-lc__h' }, [
            E.Avatar.avatar(person, { size: 'sm', tooltip: false }),
            D.el('b', { class: 'truncate', text: Team.fullName(person) }),
            rec.current ? D.el('span', { class: 'pb-lc__on' }, [D.el('i', { class: 'pb-dot', attrs: { 'aria-hidden': 'true' } }), 'pracuje ' + durText(rec.current.minutes)]) : D.el('small', { class: 't-muted', text: 'bez licznika' })
          ]),
          task
            ? D.el('button', { class: 'pb-lc__task', style: Identity.hueStyle(task.code), attrs: { type: 'button', 'data-fk': 'pb-live-task-' + row.personId }, on: { click: function () { ctx.actions.inspect({ kind: 'task', projectId: task.projectId, stageId: task.stageId, taskId: task.taskId }); } } }, [
                D.el('small', { class: 'pb-lc__proj', text: task.code + ' · ' + (task.projectName || '') }),
                D.el('b', { text: task.name }),
                rec.current ? null : D.el('small', { class: 'pb-lc__since', text: 'ostatnio ' + DAY_NAMES[new Date(task.at).getDay()] + ' ' + clockText(task.at) })
              ])
            : D.el('div', { class: 'pb-lc__none t-muted', text: 'Brak zarejestrowanego czasu w ostatnich tygodniach' }),
          task ? D.el('div', { class: 'pb-lc__meter', style: Identity.hueStyle(task.code) }, [
            D.el('span', { class: 't-num', text: planned > 0 ? 'zadanie: ' + hh(logged) + ' / ' + hh(planned) + ' h' : 'zadanie: ' + hh(logged) + ' h' }),
            bar ? D.el('span', { class: 't-num' + (bar.overdue ? ' is-late' : ''), text: bar.overdue ? 'po terminie' : 'termin ' + shortDate(new Date(bar.end)) }) : null,
            D.el('i', { class: 'pb-lc__bar', style: { '--p': pct + '%' } })
          ]) : null,
          D.el('div', { class: 'pb-lc__spark' }, [D.el('span', { class: 'pb-spark' }, spark), D.el('small', { class: 't-muted', text: 'ostatnie dni robocze' })])
        ]);
      }
      var all = [];
      rows.forEach(function (r) { (liveReal[r.personId] ? liveReal[r.personId].today : []).forEach(function (x) { all.push(x); }); });
      var startH = 7, endH = 17;
      all.forEach(function (x) { startH = Math.min(startH, Math.floor(new Date(x.start).getHours())); endH = Math.max(endH, Math.ceil(new Date(x.end).getHours() + new Date(x.end).getMinutes() / 60)); });
      endH = Math.min(24, Math.max(endH, new Date(now).getHours() + 1));
      var span = endH - startH;
      var axis = [];
      for (var h = startH; h < endH; h += 1) axis.push(D.el('span', { class: 'pb-tl__h t-num', style: { left: ((h - startH) / span * 100) + '%' }, text: h + ':00' }));
      var nowPct = ((now.getHours() + now.getMinutes() / 60) - startH) / span * 100;
      var lines = rows.map(function (row) {
        var person = Team.findPerson(people, row.personId);
        var rec = liveReal[row.personId] || { today: [] };
        return D.el('div', { class: 'pb-tl__row' }, [
          D.el('span', { class: 'pb-tl__who' }, [E.Avatar.avatar(person, { size: 'xs', tooltip: false }), D.el('b', { class: 'truncate', text: Team.fullName(person) })]),
          D.el('span', { class: 'pb-tl__track' }, rec.today.map(function (x) {
            var l = ((new Date(x.start).getHours() + new Date(x.start).getMinutes() / 60) - startH) / span * 100;
            var w = Math.max(0.6, (x.end - x.start) / 3600000 / span * 100);
            return D.el('i', { class: 'pb-tl__seg' + (x.running ? ' is-run' : ''), style: Object.assign({ left: l + '%', width: w + '%' }, Identity.hueStyle(x.code)), attrs: { 'data-tooltip': x.code + ' · ' + x.name + ' · ' + clockText(x.start) + '–' + (x.running ? 'teraz' : clockText(x.end)) } });
          }))
        ]);
      });
      return D.el('section', { class: 'pb-live', attrs: { 'aria-label': 'Na żywo' } }, [
        D.el('div', { class: 'pb-lcs' }, rows.map(card)),
        D.el('div', { class: 'pb-tl' }, [
          D.el('div', { class: 'pb-tl__title', text: 'Dziś · oś dnia: wpisy czasu i uruchomione liczniki' }),
          D.el('div', { class: 'pb-tl__axis' }, [D.el('span', { class: 'pb-tl__who' }), D.el('span', { class: 'pb-tl__track' }, axis)]),
          D.el('div', { class: 'pb-tl__body' }, lines.concat([nowPct > 0 && nowPct < 100 ? D.el('span', { class: 'pb-tl__now', style: { '--x': String(nowPct / 100) }, attrs: { 'aria-hidden': 'true' } }) : null]))
        ])
      ]);
    }

    var toolbar = D.el('div', { class: 'pb-toolbar' }, [].concat([
      D.el('div', { class: 'pb-nav' }, [
        UI.iconButton({ icon: 'chevronLeft', label: 'Wcześniejsze tygodnie', size: 'sm', attrs: { 'data-fk': 'pb-prev' }, onClick: function () { ctx.actions.setTime(Object.fromEntries([[K.offset, offset - Math.max(1, weeksN - 2)]])); } }),
        UI.button({ label: 'Dziś', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'pb-today' }, onClick: function () { ctx.actions.setTime(Object.fromEntries([[K.offset, DEFAULT_OFFSET]])); } }),
        UI.iconButton({ icon: 'chevronRight', label: 'Późniejsze tygodnie', size: 'sm', attrs: { 'data-fk': 'pb-next' }, onClick: function () { ctx.actions.setTime(Object.fromEntries([[K.offset, offset + Math.max(1, weeksN - 2)]])); } })
      ]),
      UI.segmented({
        label: 'Co pokazać', value: solo ? viewSel : (mode === 'projects' && (viewSel === 'both' || viewSel === 'done') ? 'plan' : viewSel),
        items: solo ? [{ value: 'plan', label: 'Plan' }, { value: 'done', label: 'Realizacja' }, { value: 'both', label: 'Plan i realizacja' }]
          : (mode === 'projects' ? [{ value: 'plan', label: 'Plan' }, { value: 'live', label: 'Na żywo' }] : [{ value: 'plan', label: 'Plan' }, { value: 'done', label: 'Realizacja' }, { value: 'both', label: 'Plan i realizacja' }, { value: 'live', label: 'Na żywo' }]),
        onChange: function (v) { ctx.actions.setTime(solo ? { myPlanView: v } : { planView: v }); }
      }).node,
      viewSel === 'both' && mode === 'people' ? UI.segmented({
        label: 'Wyróżnij', value: emph,
        items: [{ value: 'both', label: 'Oba' }, { value: 'plan', label: 'Plan' }, { value: 'real', label: 'Realizacja' }],
        onChange: function (v) { ctx.actions.setTime(solo ? { myPlanEmph: v } : { planEmph: v }); }
      }).node : null,
      canProjects ? UI.segmented({
        label: 'Widok planu', value: mode,
        items: [{ value: 'people', label: 'Wg osób' }, { value: 'projects', label: 'Wg projektów' }],
        onChange: function (v) { ctx.actions.setTime({ planMode: v }); }
      }).node : null,
      UI.segmented({
        label: 'Liczba tygodni', value: weeksN,
        items: RANGES.map(function (n) { return { value: n, label: n === 12 ? 'Kwartał' : n + ' tyg.' }; }),
        onChange: function (v) { ctx.actions.setTime(Object.fromEntries([[K.weeks, Number(v)]])); }
      }).node,
      solo ? null : D.el('div', { class: 'pl-legend pb-legend', attrs: { 'aria-hidden': 'true' } }, [
        D.el('span', { class: 'pl-legend__i pl-legend__i--ok', text: 'do 85% pojemności' }),
        D.el('span', { class: 'pl-legend__i pl-legend__i--tight', text: 'napięty' }),
        D.el('span', { class: 'pl-legend__i pl-legend__i--over', text: 'przeciążenie' })
      ])
    ], filters()));

    var board = D.el('div', { class: 'pb' + (solo ? ' pb--solo' : '') + (emph !== 'both' ? ' pb--emph-' + emph : '') + (compact ? ' pb--compact' : ''), style: { '--n': String(N), '--weeks': String(weeksN), '--lw': labelW + 'px' }, attrs: { 'aria-label': 'Plan tygodni' } }, [
      D.el('div', { class: 'pb-scroll' }, [D.el('div', { class: 'pb-grid' }, [head].concat(mode === 'projects' ? projectBoardRows() : plan.rows.map(personRow)))])
    ]);

    return {
      summary: management ? (overCount ? E.Format.count(overCount, 'osoba przeciążona', 'osoby przeciążone', 'osób przeciążonych') + ' w oknie planu' : 'Nikt nie jest przeciążony w oknie planu') : 'Twój plan na najbliższe tygodnie',
      body: [
        toolbar,
        viewSel === 'live' && !solo && plan.rows.length ? livePanel() : null,
        viewSel === 'live' && !solo ? null : (plan.rows.length ? board : UI.emptyState({ icon: 'people', title: 'Brak osób w planie', text: 'Dodaj osoby do zespołu i przypisz im zadania z terminami.' })),
        viewSel === 'live' && !solo ? null : unassignedTray(),
        solo || viewSel === 'live' ? null : detail(selected, plan, people, ctx)
      ]
    };
  }

  /** Ekran „Plan” w menu: nagłówek składa aplikacja. */
  function screen(state, ctx) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me) {
      return { summary: 'Plan pracy zespołu w kolejnych tygodniach.', body: E.Welcome.card(state, ctx, 'Plan pokazuje, kto nad czym pracuje w kolejnych tygodniach. Wybierz, kim jesteś.') };
    }
    var people = state.workspace.people || [];
    var leads = (state.workspace.projects || []).some(function (p) { return p.team && p.team.leader === me.id; });
    if (!Budget.isManagement(me.id, people) && !leads) {
      return {
        summary: 'Plan pracy zespołu jest dla zarządu i liderów projektów.',
        body: UI.emptyState({ icon: 'calendar', title: 'Twoje zadania są w Moja praca', text: 'Termin i upływ czasu każdego zadania zobaczysz w Moja praca → Tygodnie.' })
      };
    }
    var part = view(state, ctx, new Date());
    var todays = E.TimeLog.forDay(state.workspace.entries || [], me.id, new Date());
    return {
      summary: part.summary,
      body: UI.railLayout({
        id: 'time', title: 'Panel dnia', cls: 'rl--time',
        collapsed: (state.prefs.collapsedRails || []).indexOf('time') >= 0,
        onToggle: function () { ctx.actions.toggleRail('time'); },
        badge: '',
        main: [D.el('div', { class: 'ts' }, part.body.filter(Boolean))],
        side: [D.el('div', { class: 'mywork__aside' }, [E.Timer.todayBlock(todays, { find: ctx.find, actions: ctx.actions, entries: state.workspace.entries || [], meId: me.id })])]
      })
    };
  }

  E.PlanBoard = { view: view, screen: screen, slotOf: slotOf, dateOfSlot: dateOfSlot, weekLabel: weekLabel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
