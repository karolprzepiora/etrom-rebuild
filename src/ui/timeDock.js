/* ETROM — pasek czasu: jedno miejsce do włączania, przełączania i zatrzymywania pracy, zawsze na dole ekranu.
   Bez zegara: pole „Nad czym pracujesz?” z podpowiedziami (wznów, termin dziś, ostatnio) i szukaniem po kodzie albo nazwie.
   Z zegarem: zadanie, licznik, cofnięcie startu („zacząłem wcześniej”), przełączenie (z 5 s na cofnięcie) i Stop.
   To, co zapisano, ogląda się w zakładce Czas. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Icons = E.Icons;
  var TL = E.TimeLog;
  var Menu = E.Menu;
  var Identity = E.Identity;
  function pill(code) { return code ? D.el('span', { class: 'ts-code', style: Identity.hueStyle(code), text: code }) : null; }

  var ui = { query: '', index: 0, open: false };
  var lastSig = '';
  var lastCtx = null;

  function lower(v) { return String(v || '').toLowerCase(); }

  /** Podpowiedzi: wznów ostatnie, zadania z bliskim terminem, ostatnio używane; przy wpisywaniu – wyszukiwanie. */
  function suggestions(ctx, query) {
    var a = ctx.actions;
    var all = (a.openTasks ? a.openTasks() : []).filter(function (c) { return c.ref && !a.isTiming(c.ref.projectId, c.ref.stageId, c.ref.taskId); });
    var key = function (c) { return c.ref.projectId + '|' + c.ref.stageId + '|' + c.ref.taskId; };
    var q = lower(query).split(/\s+/).filter(Boolean);
    if (q.length) {
      return all.filter(function (c) { var hay = lower(c.code + ' ' + c.name); return q.every(function (t) { return hay.indexOf(t) >= 0; }); })
        .slice(0, 7).map(function (c) { return { choice: c, why: '' }; });
    }
    var out = [];
    var seen = {};
    var push = function (c, why, lead) { if (!c || seen[key(c)] || out.length >= 6) return; seen[key(c)] = true; out.push({ choice: c, why: why, lead: lead || '' }); };
    var last = a.lastTimedTask ? a.lastTimedTask() : null;
    if (last) {
      var hit = all.filter(function (c) { return c.ref.projectId === last.projectId && c.ref.stageId === last.stageId && c.ref.taskId === last.taskId; })[0];
      push(hit, 'ostatnio', 'Wznów');
    }
    var today = TL.dayKey(Date.now());
    var tomorrow = TL.dayKey(Date.now() + 86400000);
    all.filter(function (c) { return c.deadline && c.deadline.slice(0, 10) <= tomorrow; })
      .sort(function (x, y) { return x.deadline < y.deadline ? -1 : 1; })
      .forEach(function (c) { var d = c.deadline.slice(0, 10); push(c, d < today ? 'po terminie' : (d === today ? 'termin dziś' : 'termin jutro')); });
    all.filter(function (c) { return c.rank < 1e6; }).forEach(function (c) { push(c, 'ostatnio używane'); });
    all.forEach(function (c) { push(c, ''); });
    return out;
  }

  function startChoice(ctx, c) {
    ui.query = ''; ui.index = 0; ui.open = false;
    ctx.actions.toggleTimer(c.ref.projectId, c.ref.stageId, c.ref.taskId);
  }

  function idleView(ctx, host) {
    var input = D.el('input', {
      class: 'tdock__input', attrs: { type: 'text', placeholder: 'Nad czym pracujesz? Wpisz zadanie lub kod projektu…', 'aria-label': 'Włącz zegar na zadaniu', 'data-fk': 'dock-input', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false' }
    });
    input.value = ui.query;
    var pop = D.el('div', { class: 'tdock__pop', attrs: { role: 'listbox', hidden: 'hidden', 'data-fk': 'dock-pop' } });
    var list = [];
    var paint = function () {
      list = suggestions(lastCtx || ctx, ui.query);
      if (ui.index >= list.length) ui.index = Math.max(0, list.length - 1);
      D.clear(pop);
      if (!ui.open) { pop.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      pop.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (!list.length) { pop.appendChild(D.el('p', { class: 'tdock__empty', text: ui.query ? 'Brak otwartych zadań pasujących do „' + ui.query + '”.' : 'Nie masz otwartych zadań. Dopisz czas ręcznie z menu zadania.' })); return; }
      list.forEach(function (s, i) {
        var c = s.choice;
        pop.appendChild(D.el('button', {
          class: 'tdock__opt' + (i === ui.index ? ' is-active' : ''), attrs: { type: 'button', role: 'option', 'aria-selected': String(i === ui.index), 'data-fk': 'dock-opt-' + i },
          on: { mousedown: function (e) { e.preventDefault(); }, click: function () { startChoice(lastCtx || ctx, c); } }
        }, [
          D.el('span', { class: 'tdock__play' }, [Icons.icon('play', 11)]),
          pill(c.code),
          D.el('span', { class: 'tdock__optname truncate', text: (s.lead ? s.lead + ': ' : '') + c.name }),
          s.why ? D.el('span', { class: 'tdock__why' + (s.why === 'po terminie' ? ' is-late' : ''), text: s.why }) : null
        ]));
      });
    };
    input.addEventListener('focus', function () { ui.open = true; paint(); });
    input.addEventListener('blur', function () { ui.open = false; paint(); });
    input.addEventListener('input', function () { ui.query = input.value; ui.index = 0; ui.open = true; paint(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); ui.open = true; ui.index = Math.min(list.length - 1, ui.index + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ui.index = Math.max(0, ui.index - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (list[ui.index]) startChoice(lastCtx || ctx, list[ui.index].choice); }
      else if (e.key === 'Escape') { input.blur(); }
    });
    return D.el('div', { class: 'tdock is-idle', attrs: { role: 'group', 'aria-label': 'Pasek czasu', 'data-fk': 'dock' } }, [
      pop,
      D.el('span', { class: 'tdock__ico', attrs: { 'aria-hidden': 'true' } }, [Icons.icon('clock', 18)]),
      input,
      D.el('kbd', { class: 'kbd', text: 'T', attrs: { 'data-tooltip': 'Skrót: T włącza ostatnie zadanie albo zatrzymuje zegar' } })
    ]);
  }

  function dayTotal(ctx, nowMs) {
    return (ctx.todays || []).reduce(function (sum, e) { return sum + TL.minutes(e, nowMs); }, 0);
  }

  var BACK = [5, 15, 30, 60];

  function runningView(ctx) {
    var run = ctx.running;
    var a = ctx.actions;
    var found = ctx.find(run);
    var pend = ctx.state.pendingSwitch;
    var name = (found && found.task && found.task.name) || run.label || 'Zadanie';
    var code = (found && found.project && found.project.code) || '';
    var startMs = Date.parse(run.start);

    if (pend) {
      var target = ctx.find({ projectId: pend.projectId, stageId: pend.stageId, taskId: pend.taskId });
      var to = (target && target.task && target.task.name) || 'zadanie';
      var toCode = (target && target.project && target.project.code) || '';
      return D.el('div', { class: 'tdock is-pending', attrs: { role: 'group', 'aria-label': 'Zaplanowane przełączenie zegara', 'data-fk': 'enow-pending' } }, [
        D.el('span', { class: 'tdock__bar', attrs: { 'aria-hidden': 'true' } }),
        D.el('span', { class: 'tdock__what' }, [
          D.el('small', { text: 'Za chwilę przełączę zegar' }),
          D.el('span', { class: 'tdock__line' }, [D.el('b', { class: 'truncate', text: name }), D.el('span', { text: ' → ' }), pill(toCode), D.el('b', { class: 'truncate', text: to })])
        ]),
        UI.button({ label: 'Cofnij', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'switch-cancel' }, onClick: function () { a.cancelSwitch(); } }),
        UI.button({ label: 'Przełącz teraz', size: 'sm', attrs: { 'data-fk': 'switch-now' }, onClick: function () { a.commitSwitch(); } })
      ]);
    }

    var back = UI.iconButton({ icon: 'history', label: 'Zacząłem wcześniej', size: 'sm', tooltip: 'Zacząłem wcześniej – cofnij start zegara', class: 'tdock__back', attrs: { 'data-fk': 'dock-back' } });
    Menu.bind(back.nodeType ? back : back.node, function () {
      return {
        label: 'Cofnij start zegara', items: BACK.map(function (m) {
          return { label: m < 60 ? m + ' min wcześniej' : '1 godzinę wcześniej', onSelect: function () { a.shiftTimerStart(m); } };
        })
      };
    });
    var canBack = TL.canShiftStart(ctx.state.workspace.entries || [], ctx.me);
    var more = UI.button({ label: 'Przełącz', variant: 'secondary', size: 'sm', iconRight: 'chevronDown', attrs: { 'data-fk': 'switch-menu' } });
    Menu.bind(more.nodeType ? more : more.node, function () {
      var list = (a.openTasks ? a.openTasks() : []).filter(function (c) { return !a.isTiming(c.ref.projectId, c.ref.stageId, c.ref.taskId); }).slice(0, 12);
      return {
        label: 'Przełącz zegar na zadanie',
        items: list.length ? list.map(function (c) { return { label: c.code + ' · ' + c.name, onSelect: function () { a.switchTimer(c.ref.projectId, c.ref.stageId, c.ref.taskId); } }; }) : [{ label: 'Brak innych otwartych zadań', disabled: true }]
      };
    });
    var now = Date.now();
    var forgotten = TL.isForgotten(run);
    var collapse = UI.iconButton({ icon: 'chevronDown', label: 'Zwiń pasek czasu', size: 'sm', tooltip: 'Zwiń do małej pigułki', class: 'tdock__fold', attrs: { 'data-fk': 'dock-fold' }, onClick: function () { a.setPref({ dockCompact: true }); } });
    if (ctx.state.prefs && ctx.state.prefs.dockCompact) {
      return D.el('div', { class: 'tdock is-on is-compact' + (forgotten ? ' is-forgotten' : ''), attrs: { role: 'group', 'aria-label': 'Zegar pracy (zwinięty)', 'data-fk': 'dock' } }, [
        D.el('span', { class: 'tdock__dot', attrs: { 'aria-hidden': 'true' } }),
        pill(code),
        D.el('time', { class: 'tdock__time t-num timer-pill__time', text: TL.clock(now - startMs), attrs: { 'data-timer-start': String(startMs), 'aria-hidden': 'true' } }),
        UI.iconButton({ icon: 'stop', label: 'Zatrzymaj zegar', size: 'sm', class: 'tdock__stop tdock__stop--icon', attrs: { 'data-fk': 'timer-stop' }, onClick: function () { a.stopTimer(); } }),
        UI.iconButton({ icon: 'chevronUp', label: 'Rozwiń pasek czasu', size: 'sm', tooltip: 'Rozwiń pasek', class: 'tdock__fold', attrs: { 'data-fk': 'dock-unfold' }, onClick: function () { a.setPref({ dockCompact: false }); } })
      ]);
    }
    return D.el('div', { class: 'tdock is-on' + (forgotten ? ' is-forgotten' : ''), attrs: { role: 'group', 'aria-label': 'Zegar pracy', 'data-fk': 'dock' } }, [
      D.el('span', { class: 'tdock__dot', attrs: { 'aria-hidden': 'true' } }),
      D.el('button', { class: 'tdock__what tdock__what--btn', attrs: { type: 'button', 'data-tooltip': 'Pokaż zadanie', 'data-fk': 'timer-open' }, on: { click: function () { if (found && found.project) a.inspect({ kind: 'task', projectId: found.project.id, stageId: found.stage.id, taskId: found.task.id }); } } }, [
        D.el('span', { class: 'tdock__line' }, [pill(code), D.el('b', { class: 'truncate', text: name })]),
        D.el('small', { class: 'tdock__sub' }, [
          D.el('span', { class: 'timer-pill__since t-num', text: 'od ' + E.Timer.hm(startMs) }),
          D.el('span', { text: ' · dziś łącznie ' }),
          D.el('span', { class: 't-num', text: TL.duration(dayTotal(ctx, now)), attrs: { 'data-dock-day': '1' } })
        ])
      ]),
      E.Timer.budgetChip(ctx.budget && ctx.budget(run)),
      D.el('time', { class: 'tdock__time t-num timer-pill__time', text: TL.clock(now - startMs), attrs: { 'data-timer-start': String(startMs), 'aria-hidden': 'true' } }),
      canBack ? back : null, more,
      UI.button({ label: 'Stop', icon: 'stop', size: 'sm', attrs: { 'data-fk': 'timer-stop' }, class: 'tdock__stop', onClick: function () { a.stopTimer(); } }),
      collapse
    ]);
  }

  /** Przebudowuje pasek tylko wtedy, gdy zmienił się stan zegara; pole wpisywania nie traci fokusu przy innych zmianach aplikacji. */
  function render(host, ctx) {
    if (!host) return;
    lastCtx = ctx;
    if (!ctx.me) { lastSig = 'none'; D.clear(host); document.body.classList.remove('has-dock', 'has-dock-compact'); return; }
    var run = ctx.running;
    var pend = ctx.state.pendingSwitch;
    var sig = [ctx.me, run ? run.id + '|' + run.start + '|' + run.taskId : 'idle', pend ? pend.taskId + '|' + pend.until : '', run ? '' : ctx.state.workspace.projects.length, run && ctx.state.prefs && ctx.state.prefs.dockCompact ? 'compact' : ''].join('~');
    document.body.classList.add('has-dock');
    document.body.classList.toggle('has-dock-compact', !!(run && ctx.state.prefs && ctx.state.prefs.dockCompact));
    if (!run && sig === lastSig && host.firstChild) return;
    lastSig = sig;
    var node = run ? runningView(ctx) : idleView(ctx, host);
    D.render(host, [node]);
  }

  /** Suma „dziś łącznie” żyje razem z zegarem. */
  window.setInterval(function () {
    var node = document.querySelector('[data-dock-day]');
    if (node && lastCtx) { var t = TL.duration(dayTotal(lastCtx, Date.now())); if (node.textContent !== t) node.textContent = t; }
  }, 15000);

  /** Skrót T w stanie bez zegara: fokus na polu. */
  function focus() { var i = document.querySelector('[data-fk=dock-input]'); if (i) i.focus(); }

  E.TimeDock = { render: render, focus: focus };
})(typeof globalThis !== 'undefined' ? globalThis : this);
