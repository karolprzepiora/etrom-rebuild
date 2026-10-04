/* ETROM — plan tygodni: wiersz na osobę, kolumna na tydzień, zadanie jako pasek od startu do terminu.
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
  var LANE_H = 2.1; // rem
  var pendingFocus = null;
  var pendingPrio = null;

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
  function chipText(cell) { return cell.planned ? Math.round(cell.planned) + '/' + Math.round(cell.capacity) : ''; }
  function chipTip(cell) {
    return cell.planned
      ? hh(cell.planned) + ' h planu przy pojemności ' + hh(cell.capacity) + ' h' + (cell.absentDays ? ' (nieobecność: ' + cell.absentDays + ' dni)' : '') + (cell.state === 'over' ? ' — przeciążenie (' + hh(cell.planned - cell.capacity) + ' h za dużo)' : '')
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
  function view(state, ctx, now, opts) {
    var solo = !!(opts && opts.solo);
    var K = solo ? { weeks: 'myPlanWeeks', offset: 'myPlanOffset', cell: 'myPlanCell' } : { weeks: 'planWeeks', offset: 'planOffset', cell: 'planCell' };
    var people = state.workspace.people || [];
    var projects = state.workspace.projects || [];
    var me = Team.findPerson(people, state.prefs.me);
    var management = Budget.isManagement(me.id, people) && !solo;
    var weeksN = RANGES.indexOf(state[K.weeks]) >= 0 ? state[K.weeks] : (solo ? 4 : 6);
    var offset = Number(state[K.offset]) || 0;
    // Zarząd widzi wszystkich, lider osoby ze swoich projektów, pozostali tylko siebie.
    var led = projects.filter(function (p) { return p.team && p.team.leader === me.id && p.status !== 'done'; });
    var visibleIds = null;
    if (!management) {
      var set = {};
      set[me.id] = true;
      if (!solo) led.forEach(function (p) { Team.projectPeople(p.team).forEach(function (id) { set[id] = true; }); });
      visibleIds = Object.keys(set);
    }
    var focusProject = !solo && state.planProject ? Number(state.planProject) : 0;
    var baseInput = {
      projects: projects, people: people, entries: state.workspace.entries || [], now: now,
      target: state.prefs.dayTarget, weeks: weeksN, offsetWeeks: offset,
      personIds: visibleIds, absences: state.workspace.absences || []
    };
    var plan = Plan.build(baseInput);
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
    var chips = {};      // 'personId:week' → element
    var rowEls = {};     // personId → element
    var drag = null;

    /* ---------- pasek ---------- */
    function workedText(b) { return (b.logged > 0.05 ? hh(b.logged) + ' / ' : '') + hh(b.planned) + ' h'; }
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
      var cls = 'pb-bar' + (b.overdue ? ' is-late' : '') + (!solo && b.squeezed ? ' is-tight' : '') + (!solo && b.mustStartNow ? ' is-now' : '') + (b.explicitStart ? '' : ' is-implicit') + (editable ? ' is-editable' : '') + (b.status === 'review' ? ' is-review' : '') + (focusProject && focusProject !== b.projectId ? ' is-dim' : '') + (!solo && b.logged > b.planned + 0.05 ? ' is-over' : '') + (solo ? ' is-time' + (pct >= 75 ? ' is-hot' : '') : ' is-prog');
      var key = b.projectId + '|' + b.stageId + '|' + b.taskId + '|' + person.id;
      var el = D.el('div', {
        class: cls, style: Object.assign({ '--d': (solo ? pct : donePct(b)) + '%' }, Identity.hueStyle(b.code)),
        attrs: { tabindex: '0', role: 'button', 'data-fk': 'pb-bar-' + b.taskId, 'data-tooltip': barTip(b), 'aria-label': barTip(b) + (editable ? '. Strzałki przesuwają, Shift i Alt zmieniają termin i start.' : ''), 'data-key': key },
        dataset: { projectId: String(b.projectId), stageId: b.stageId, taskId: b.taskId, personId: person.id }
      }, [
        D.el('span', { class: 'pb-bar__clip', attrs: { 'aria-hidden': 'true' } }, [D.el('span', { class: 'pb-bar__fill' })]),
        solo ? null : paceTick(b, item),
        editable ? D.el('span', { class: 'pb-bar__h pb-bar__h--l', attrs: { 'data-h': 'start', 'data-tooltip': 'Zmień start' } }) : null,
        editable ? D.el('span', { class: 'pb-bar__h pb-bar__h--r', attrs: { 'data-h': 'end', 'data-tooltip': 'Zmień termin' } }) : null
      ]);
      paintBar(el, item.s, item.e);
      if (pendingFocus === key) { pendingFocus = null; window.setTimeout(function () { el.focus({ preventScroll: true }); }, 30); }
      attachBar(el, b, person, item, editable, key);
      return el;
    }

    /** Lewa kolumna wiersza zadania: kod, pełna nazwa i godziny (zarząd) albo upływ czasu (pracownik). */
    function nameCell(b) {
      var editable = !solo && canEdit(b.projectId);
      var side;
      if (solo) {
        var pct = elapsedOf(b);
        side = D.el('span', { class: 'pb-tn__side pb-tn__time' + (pct >= 100 ? ' is-late' : (pct >= 75 ? ' is-hot' : '')) }, [
          D.el('b', { class: 't-num', text: pct + '%' }), D.el('small', { text: timeText(b) }),
          D.el('i', { class: 'pb-tn__meter', style: { '--p': pct + '%' }, attrs: { 'aria-hidden': 'true' } })
        ]);
      } else {
        var hoursBtn = D.el('span', { class: 'pb-bar__hours t-num', text: workedText(b), attrs: editable ? { 'data-fk': 'pb-hours-' + b.taskId, 'data-tooltip': 'Przepracowano / zaplanowano — kliknij, żeby zmienić zaplanowane godziny' } : {} });
        if (editable) editHours(hoursBtn, b);
        side = D.el('span', { class: 'pb-tn__side' }, [
          hoursBtn,
          D.el('i', { class: 'pb-tn__meter', style: { '--p': (b.planned > 0 ? Math.min(100, b.logged / b.planned * 100) : 0) + '%' }, attrs: { 'aria-hidden': 'true' } })
        ]);
      }
      return D.el('div', { class: 'pb-tn' + (focusProject && focusProject !== b.projectId ? ' is-dim' : ''), style: Identity.hueStyle(b.code), dataset: { projectId: String(b.projectId), stageId: b.stageId, taskId: b.taskId } }, [
        D.el('span', { class: 'pb-bar__code', text: b.code }),
        D.el('button', { class: 'pb-tn__name', attrs: { type: 'button', title: b.name }, text: b.name, on: { click: function () { ctx.actions.inspect({ kind: 'task', projectId: b.projectId, stageId: b.stageId, taskId: b.taskId }); } } }),
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
        var iso = function (x) { return Plan.isoDay(x); };
        if (at.personId !== person.id) ctx.actions.reassignTask(ref.projectId, ref.stageId, ref.taskId, person.id, at.personId, iso(start), iso(endDay) + 'T16:00');
        else ctx.actions.setTaskSpan(ref.projectId, ref.stageId, ref.taskId, iso(start), iso(endDay) + 'T16:00', { message: 'Wyznaczono termin zadania „' + t.name + '”' });
      }
      chip.addEventListener('pointerup', function (e) { end(e, false); });
      chip.addEventListener('pointercancel', function (e) { end(e, true); });
      return chip;
    }

    /* ---------- wiersze osób: nagłówek z obciążeniem (tylko zarząd/lider) i wiersz na zadanie ---------- */
    function personRow(row) {
      var person = Team.findPerson(people, row.personId);
      var items = row.bars.map(function (b) {
        return { b: b, s: slotOf(plan.first, b.start, 1), e: slotOf(plan.first, b.end, -1), lane: 0 };
      }).filter(function (it) { return it.e >= 0 && it.s < N; });
      items.forEach(function (it) { it.e = Math.max(it.e, it.s); });
      items.sort(function (a, b) { return (rankOf[a.b.projectId] || 1e6) - (rankOf[b.b.projectId] || 1e6) || a.s - b.s; });
      function bandEls(interactive) {
        return (row.absences || []).map(function (a) {
          var bs = slotOf(plan.first, new Date(a.from + 'T00:00').getTime(), 1);
          var be = slotOf(plan.first, new Date(a.to + 'T00:00').getTime(), -1);
          if (be < 0 || bs >= N || be < bs) return null;
          var s0 = Math.max(0, bs), e0 = Math.min(N - 1, be);
          var tip = (E.Absences.KINDS[a.kind] || 'Nieobecność') + ' · ' + a.from.slice(8) + '.' + a.from.slice(5, 7) + ' – ' + a.to.slice(8) + '.' + a.to.slice(5, 7) + (a.note ? ' · ' + a.note : '') + (interactive && management ? ' — kliknij, żeby zmienić' : '');
          var el = D.el(interactive && management ? 'button' : 'span', {
            class: 'pb-absent' + (interactive ? ' is-head' : ''),
            style: { left: (s0 / N * 100) + '%', width: ((e0 - s0 + 1) / N * 100) + '%' },
            attrs: interactive ? { type: 'button', 'data-tooltip': tip, 'data-fk': 'pb-absent-' + a.id, 'aria-label': tip } : { 'aria-hidden': 'true' },
            text: interactive && (e0 - s0 + 1) >= 2 ? (E.Absences.KINDS[a.kind] || '') : ''
          });
          if (interactive && management) el.addEventListener('click', function () { ctx.actions.openAbsence(row.personId, a.id); });
          return el;
        }).filter(Boolean);
      }
      var holSlots = [];
      for (var hs = 0; hs < N; hs += 1) {
        if (Cal.isHoliday(Plan.isoDay(dateOfSlot(plan.first, hs)))) holSlots.push(hs);
      }
      function holColEls() {
        return holSlots.map(function (i) { return D.el('span', { class: 'pb-holcol', style: { left: (i / N * 100) + '%', width: (100 / N) + '%' }, attrs: { 'aria-hidden': 'true' } }); });
      }
      function trackOf(inner, bands) {
        var weekCols = D.el('div', { class: 'pb-wks', attrs: { 'aria-hidden': 'true' } }, plan.weeks.map(function (w) { return D.el('span', { class: 'pb-wk' + (w.current ? ' is-current' : '') }); }));
        var inTrack = todaySlot >= 0 && todaySlot < N;
        var colTint = inTrack && !Cal.isWeekend(Plan.isoDay(new Date(plan.today)));
        var children = [weekCols].concat(
          holColEls(),
          [colTint ? D.el('span', { class: 'pb-todaycol', style: { left: (todaySlot / N * 100) + '%', width: (100 / N) + '%' }, attrs: { 'aria-hidden': 'true' } }) : null],
          [inTrack ? D.el('span', { class: 'pb-today', style: { left: (todaySlot / N * 100) + '%' }, attrs: { 'aria-hidden': 'true' } }) : null],
          bands === undefined ? bandEls(false) : bands,
          inner
        );
        return D.el('div', { class: 'pb-track' }, children);
      }
      var rows = [];
      if (!solo) {
        var loads = D.el('div', { class: 'pb-loads', attrs: { role: 'row' } }, row.weeks.map(function (cell, i) {
          var isSel = selected && selected.personId === row.personId && selected.week === i;
          var chip = D.el('button', {
            class: chipState(cell) + (isSel ? ' is-selected' : ''),
            attrs: { type: 'button', role: 'cell', 'aria-pressed': String(!!isSel), 'data-fk': 'pl-cell-' + row.personId + '-' + i, 'data-tooltip': chipTip(cell) },
            on: { click: function () { ctx.actions.setTime(Object.fromEntries([[K.cell, isSel ? null : { personId: row.personId, week: i }]])); } }
          }, [chipText(cell)]);
          chips[row.personId + ':' + i] = chip;
          return chip;
        }));
        var total = row.weeks.reduce(function (t, c) { return t + c.planned; }, 0);
        var label = D.el('div', { class: 'pb-label' }, [
          E.Avatar.avatar(person, { size: 'sm', tooltip: false }),
          D.el('span', { class: 'pb-label__txt' }, [D.el('span', { class: 'pb-label__name truncate', text: Team.fullName(person) }), D.el('small', { class: 't-muted t-num', text: hh(total) + ' h w oknie' })]),
          management ? UI.iconButton({ icon: 'plus', label: 'Dodaj nieobecność: ' + Team.fullName(person), size: 'sm', attrs: { 'data-fk': 'pb-absence-add-' + row.personId, 'data-tooltip': 'Dodaj nieobecność' }, onClick: function () { ctx.actions.openAbsence(row.personId); } }) : null
        ]);
        rows.push(D.el('div', { class: 'pb-row pb-row--who' }, [label, D.el('div', { class: 'pb-cell' }, [trackOf([loads], bandEls(true))])]));
      }
      items.forEach(function (it) {
        var bars = D.el('div', { class: 'pb-bars' }, [barEl(it.b, person, it)]);
        rows.push(D.el('div', { class: 'pb-row pb-row--task' }, [D.el('div', { class: 'pb-label pb-label--task' }, [nameCell(it.b)]), D.el('div', { class: 'pb-cell' }, [trackOf([bars])])]));
      });
      if (row.unscheduled.tasks.length) {
        rows.push(D.el('div', { class: 'pb-free' }, [D.el('span', { class: 'pb-free__l t-muted', text: 'Bez terminu' })].concat(row.unscheduled.tasks.map(function (t) { return trayChip(t, person); }))));
      }
      if (!rows.length) rows.push(D.el('div', { class: 'pb-row pb-row--task' }, [D.el('div', { class: 'pb-label pb-label--task' }, [D.el('span', { class: 't-muted', text: 'Brak zadań z terminem' })]), D.el('div', { class: 'pb-cell' }, [trackOf([])])]));
      var el = D.el('div', { class: 'pb-person', dataset: { person: row.personId }, attrs: { role: 'group', 'aria-label': Team.fullName(person) } }, rows);
      rowEls[row.personId] = el;
      return el;
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
      D.el('div', { class: 'pb-label' }),
      D.el('div', { class: 'pb-cell' }, [D.el('div', { class: 'pb-track pb-track--head' }, [D.el('div', { class: 'pb-wks pb-wks--head' }, plan.weeks.map(function (w, wi) {
        var wkKey = Plan.isoDay(new Date(w.start));
        return D.el('span', { class: 'pb-wk pb-wk--head' + (w.current ? ' is-current' : '') }, [
          D.el('span', { class: 'pb-wk__top', attrs: { 'data-tooltip': 'Tydzień ' + Cal.weekNumber(wkKey) + ': ' + weekLabel(w.start) } }, [D.el('b', { text: 'Tydz. ' + Cal.weekNumber(wkKey) }), weeksN >= 6 ? null : D.el('small', { text: weekLabel(w.start) + (w.current ? ' · bieżący' : '') })]),
          dayCells(wi)
        ]);
      }))])])
    ]);

    function projectFilter() {
      var used = {};
      plan.rows.forEach(function (r) { r.bars.forEach(function (b) { used[b.projectId] = b.code; }); });
      var ids = Object.keys(used);
      if (ids.length < 2) return null;
      var select = UI.select({
        id: 'pb-project', value: focusProject ? String(focusProject) : '',
        options: [{ value: '', label: 'Wszystkie projekty' }].concat(ids.sort(function (a, b) { return used[a] < used[b] ? -1 : 1; }).map(function (id) { return { value: id, label: used[id] }; })),
        attrs: { 'data-fk': 'pb-project', 'aria-label': 'Wyróżnij projekt' },
        on: { change: function () { ctx.actions.setTime({ planProject: select.value }); } }
      });
      return select;
    }

    /** Priorytety projektów (tylko zarząd): przeciągnij chip albo użyj strzałek ←/→; kolejność porządkuje zadania w planie. */
    function priorityStrip() {
      if (solo || !management || ranked.length < 2) return null;
      var order = ranked.map(function (p) { return p.id; });
      var strip = D.el('div', { class: 'pb-prio', attrs: { role: 'list', 'aria-label': 'Priorytety projektów' } }, [D.el('span', { class: 'pb-prio__l', text: 'Priorytety' })]);
      var chipsEls = {};
      var dragging = null;
      function commit(ids) { if (ids.join() !== order.join()) ctx.actions.setProjectOrder(ids); }
      ranked.forEach(function (p, i) {
        var chip = D.el('button', {
          class: 'pb-prio__c', style: Identity.hueStyle(p.code),
          attrs: { type: 'button', role: 'listitem', 'data-fk': 'pb-prio-' + p.code, 'data-tooltip': p.name + ' · priorytet ' + (i + 1) + ' — przeciągnij albo użyj strzałek ←/→', 'aria-label': 'Priorytet ' + (i + 1) + ': ' + p.code + ' ' + p.name + '. Strzałki zmieniają kolejność.' }
        }, [D.el('span', { class: 'pb-prio__n', text: String(i + 1) }), D.el('span', { class: 'pb-prio__code', text: p.code })]);
        chipsEls[p.id] = chip;
        chip.addEventListener('keydown', function (e) {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          var at = order.indexOf(p.id) + (e.key === 'ArrowRight' ? 1 : -1);
          if (at < 0 || at >= order.length) return;
          pendingPrio = p.id;
          commit(Plan.moveInOrder(order, p.id, at));
        });
        chip.addEventListener('pointerdown', function (e) {
          if (e.button !== 0) return;
          dragging = { id: p.id, x0: e.clientX, moved: false, to: i };
          try { chip.setPointerCapture(e.pointerId); } catch (err) { /* testy */ }
          e.preventDefault();
        });
        chip.addEventListener('pointermove', function (e) {
          if (!dragging) return;
          var dx = e.clientX - dragging.x0;
          if (!dragging.moved && Math.abs(dx) < 4) return;
          dragging.moved = true;
          chip.classList.add('is-drag');
          chip.style.transform = 'translateX(' + dx + 'px)';
          var others = order.filter(function (id) { return id !== p.id; });
          var to = 0;
          others.forEach(function (id) { var r = chipsEls[id].getBoundingClientRect(); if (e.clientX > r.left + r.width / 2) to += 1; });
          dragging.to = to;
        });
        function end(e, cancel) {
          if (!dragging) return;
          var d = dragging; dragging = null;
          try { chip.releasePointerCapture(e.pointerId); } catch (err) { /* brak */ }
          chip.classList.remove('is-drag'); chip.style.transform = '';
          if (!d.moved || cancel) return;
          pendingPrio = p.id;
          commit(Plan.moveInOrder(order, p.id, d.to));
        }
        chip.addEventListener('pointerup', function (e) { end(e, false); });
        chip.addEventListener('pointercancel', function (e) { end(e, true); });
        strip.appendChild(chip);
        if (pendingPrio === p.id) { pendingPrio = null; window.setTimeout(function () { chip.focus({ preventScroll: true }); }, 30); }
      });
      return strip;
    }

    var toolbar = D.el('div', { class: 'pb-toolbar' }, [
      D.el('div', { class: 'pb-nav' }, [
        UI.iconButton({ icon: 'chevronLeft', label: 'Wcześniejsze tygodnie', size: 'sm', attrs: { 'data-fk': 'pb-prev' }, onClick: function () { ctx.actions.setTime(Object.fromEntries([[K.offset, offset - Math.max(1, weeksN - 2)]])); } }),
        UI.button({ label: 'Dziś', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'pb-today' }, onClick: function () { ctx.actions.setTime(Object.fromEntries([[K.offset, 0]])); } }),
        UI.iconButton({ icon: 'chevronRight', label: 'Późniejsze tygodnie', size: 'sm', attrs: { 'data-fk': 'pb-next' }, onClick: function () { ctx.actions.setTime(Object.fromEntries([[K.offset, offset + Math.max(1, weeksN - 2)]])); } })
      ]),
      solo ? null : projectFilter(),
      UI.segmented({
        label: 'Liczba tygodni', value: weeksN,
        items: RANGES.map(function (n) { return { value: n, label: n === 12 ? 'Kwartał' : n + ' tyg.' }; }),
        onChange: function (v) { ctx.actions.setTime(Object.fromEntries([[K.weeks, Number(v)]])); }
      }).node,
      solo ? null : D.el('div', { class: 'pl-legend pb-legend', attrs: { 'aria-hidden': 'true' } }, [
        D.el('span', { class: 'pl-legend__i pl-legend__i--ok', text: 'do 85% pojemności' }),
        D.el('span', { class: 'pl-legend__i pl-legend__i--tight', text: 'napięty' }),
        D.el('span', { class: 'pl-legend__i pl-legend__i--over', text: 'przeciążenie' }),
        D.el('span', { class: 'pl-legend__i pb-legend__i', text: 'wypełnienie = zrobione · znacznik = gdzie powinno być dziś' })
      ])
    ]);

    var board = D.el('div', { class: 'pb' + (solo ? ' pb--solo' : '') + (compact ? ' pb--compact' : ''), style: { '--n': String(N), '--weeks': String(weeksN) }, attrs: { 'aria-label': 'Plan tygodni' } }, [
      D.el('div', { class: 'pb-scroll' }, [D.el('div', { class: 'pb-grid' }, [head].concat(plan.rows.map(personRow)))])
    ]);

    return {
      summary: management ? (overCount ? E.Format.count(overCount, 'osoba przeciążona', 'osoby przeciążone', 'osób przeciążonych') + ' w oknie planu' : 'Nikt nie jest przeciążony w oknie planu') : 'Twój plan na najbliższe tygodnie',
      body: [
        toolbar,
        priorityStrip(),
        plan.rows.length ? board : UI.emptyState({ icon: 'people', title: 'Brak osób w planie', text: 'Dodaj osoby do zespołu i przypisz im zadania z terminami.' }),
        solo ? null : detail(selected, plan, people, ctx)
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
