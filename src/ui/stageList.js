/* ETROM — plan pracy projektu jako tabela etapów.
   Wiersz odpowiada na trzy pytania: co (etap), do kiedy (najbliższy termin zadania)
   i ile godzin (budżet etapu i zużycie przez cały zespół). Postęp i rozbicie godzin
   według rodzaju pracy należą do analizy projektu, nie do planu. Godziny widzą lider
   i zarząd, pozostali tylko procent zużycia (core/budget.js). Zakończone etapy od
   początku zwijają się do jednego wiersza. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Catalog = E.Catalog;
  var Model = E.Model;
  var Progress = E.Progress;
  var Icons = E.Icons;
  var Tasks = E.Tasks;
  var Insight = E.Insight;
  var F = E.Format;

  var COLLAPSE_FROM = 3;

  /** Druga linia pod nazwą etapu: ile zadań i czy któreś jest spóźnione. */
  function taskLine(stage) {
    var stats = Tasks.taskStats(stage.tasks || []);
    if (!stats.total) return D.el('span', { class: 'plan-row__sub t-muted', text: 'Brak zadań' });
    var text = stats.open ? 'Otwarte ' + stats.open + ' z ' + stats.total : 'Wszystkie zadania zakończone (' + stats.total + ')';
    return D.el('span', { class: 'plan-row__sub' }, [
      D.el('span', { text: text }),
      stats.overdue ? D.el('span', { class: 'plan-row__late', text: ' · ' + stats.overdue + ' po terminie' }) : null
    ]);
  }

  function stageMenu(project, stage, position, count, actions) {
    var info = Model.describeStage(stage);
    var btn = UI.iconButton({
      icon: 'more', label: 'Działania etapu: ' + info.name, size: 'sm', class: 'row-actions srow__more',
      attrs: { 'data-fk': 'stage-more-' + stage.id }
    });
    Menu.bind(btn, function () {
      return {
        label: 'Działania etapu', align: 'end',
        items: [
          { label: 'Dodaj zadanie', icon: 'plus', onSelect: function () { actions.addTask(project.id, stage.id); } },
          { label: 'Edytuj etap', icon: 'edit', hint: 'termin, godziny', onSelect: function () { actions.editStage(project.id, stage.id); } },
          { type: 'separator' },
          { label: 'Przesuń wyżej', icon: 'arrowUp', disabled: position === 0, onSelect: function () { actions.moveStage(project.id, stage.id, -1); } },
          { label: 'Przesuń niżej', icon: 'arrowDown', disabled: position === count - 1, onSelect: function () { actions.moveStage(project.id, stage.id, 1); } },
          { type: 'separator' },
          { label: 'Usuń etap z projektu', icon: 'trash', tone: 'danger', onSelect: function () { actions.removeStage(project.id, stage.id); } }
        ]
      };
    });
    return btn;
  }

  /**
   * Czy etap jest rozwinięty. Bieżący etap otwiera się sam — to, co dzieje się
   * teraz, widać bez klikania — dopóki użytkownik go nie zwinie.
   */
  function isOpen(expandedStages, project, stage) {
    var value = (expandedStages || {})[project.id + ':' + stage.id];
    if (value === true || value === false) return value;
    return Progress.activeStage(project) === stage && stage.status === 'working';
  }

  /** Etap nie ma własnego terminu: pokazujemy termin najbliższego otwartego zadania, z rokiem i odliczaniem. */
  function nearestDue(stage) {
    var at = stage.status === 'done' ? '' : E.Tasks.nearestDeadline(stage);
    if (!at) return D.el('span', { class: 'due due--none', text: '—', attrs: { 'data-tooltip': stage.status === 'done' ? 'Etap zakończony' : 'Brak zadań z terminem' } });
    var day = at.slice(0, 10);
    var info = Progress.deadlineInfo(day);
    return D.el('span', { class: 'srow__due', attrs: { 'data-tooltip': 'Termin najbliższego zadania: ' + F.dateLong(day) } }, [
      D.el('span', { class: 'srow__due-date t-num', text: F.date(day, { year: 'always' }) }),
      UI.countdown(day, {})
    ]);
  }

  /**
   * Budżet etapu: wskaźnik zużycia przez cały zespół. Godziny (zapisane + korekty zarządu)
   * widzi lider projektu i zarząd; pozostali tylko procent.
   */
  function budgetCell(project, stage, ctx) {
    if (!E.Budget.canSeeHours(ctx.state.prefs.me, project, ctx.people)) {
      return stage.budgetFlag && stage.status !== 'done' ? E.BudgetFlag.badge(stage.budgetFlag, ctx.people, { text: true }) : null;
    }
    var view = E.Budget.view(project, stage, ctx.state.workspace.entries || [], ctx.state.prefs.me, ctx.people, new Date());
    var width = Math.max(0, Math.min(100, view.percent));
    var tip = view.exact
      ? 'Zapisano ' + F.hours(Math.round(view.logged * 10) / 10) + (view.bonus ? ', korekta zarządu ' + F.hours(view.bonus) : '') + ' z budżetu ' + F.hours(view.planned)
      : 'Zużycie budżetu etapu przez cały zespół';
    var text = view.exact
      ? String(Math.round(view.used * 10) / 10).replace('.', ',') + ' / ' + F.hours(view.planned)
      : view.percent + '%';
    return D.el('div', {
      class: 'plan-budget plan-budget--' + view.state + (stage.status === 'done' ? ' is-done' : ''),
      attrs: { 'data-tooltip': tip, role: 'img', 'aria-label': 'Zużycie budżetu etapu: ' + (view.exact ? text : text + ' budżetu') + (view.state === 'over' ? ', przekroczone' : '') }
    }, [
      D.el('span', { class: 'plan-meter', attrs: { 'aria-hidden': 'true' } }, [D.el('i', { style: { width: width + '%' } })]),
      D.el('span', { class: 'plan-budget__text t-num', text: text })
    ]);
  }

  function stageRow(project, stage, position, count, ctx) {
    var actions = ctx.actions;
    var info = Model.describeStage(stage);
    var open = isOpen(ctx.state.expandedStages, project, stage);
    var flash = ctx.motion && ctx.motion.flashStage === stage.id;
    var panelId = 'tasks-' + project.id + '-' + String(stage.id).replace(/[^a-zA-Z0-9_-]/g, '-');
    var nextStatus = Model.STAGE_STATUS[Model.cycleStageStatus(stage.status)];
    var current = Progress.activeStage(project) === stage;
    var late = stage.status !== 'done' && Tasks.taskStats(stage.tasks || []).overdue > 0;
    var meta = info.kindLabel + ' · ' + info.domainLabel.toLowerCase() + ' · ' + (info.isCustom ? 'własny' : 'standard ' + info.catalogNumber);

    var row = D.el('div', {
      class: 'plan-row plan-row--' + stage.status + (current ? ' is-current' : '') + (late ? ' is-late' : '') + (flash ? ' is-flash' : '') + (open ? ' is-open' : '')
    }, [
      D.el('button', {
        class: 'plan-row__main',
        attrs: { type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': panelId, 'data-fk': 'stage-expand-' + stage.id, 'data-tooltip': meta }
      }, [
        D.el('span', { class: 'plan-row__no t-num', text: String(position + 1) }),
        D.el('span', { class: 'plan-row__text' }, [
          D.el('span', { class: 'plan-row__name', text: info.name }),
          taskLine(stage)
        ]),
        D.el('span', { class: 'plan-row__chevron' }, [Icons.icon('chevronDown', 14)]),
        D.el('span', { class: 'sr-only', text: open ? ', zwiń zadania' : ', pokaż zadania' })
      ]),
      D.el('span', { class: 'plan-row__due' }, [nearestDue(stage)]),
      budgetCell(project, stage, ctx),
      UI.statusButton('stage', stage.status, {
        subject: info.name,
        class: 'srow__status',
        hint: 'Kliknij, aby przestawić na „' + nextStatus + '”',
        attrs: { 'data-fk': 'stage-status-' + stage.id, 'data-tooltip': 'Przestaw na „' + nextStatus + '”' },
        onClick: function () { actions.cycleStage(project.id, stage.id); }
      }),
      stageMenu(project, stage, position, count, actions)
    ]);
    row.querySelector('.plan-row__main').addEventListener('click', function () { actions.toggleStage(project.id, stage.id); });

    var children = [row];
    var ask = E.StageAuto ? E.StageAuto.suggest(stage, { decision: info.decision }) : null;
    if (ask && ask.mode === 'ask') {
      var canClose = !!(actions.canManageList && actions.canManageList(project.id));
      children.push(D.el('div', { class: 'plan-ask', attrs: { 'data-fk': 'stage-ask-' + stage.id, role: 'status' } }, [
        D.el('span', { class: 'plan-ask__dot', text: '?', attrs: { 'aria-hidden': 'true' } }),
        D.el('span', { class: 'plan-ask__text', text: 'Wszystkie zadania tego etapu są zakończone. Zakończyć etap?' }),
        canClose ? UI.button({ label: 'Tak, zakończ', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'stage-ask-yes-' + stage.id }, onClick: function () { actions.confirmStageDone(project.id, stage.id); } }) : D.el('span', { class: 'plan-ask__hint', text: 'Potwierdza lider lub zarząd.' }),
        canClose ? UI.button({ label: 'Jeszcze nie', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'stage-ask-no-' + stage.id }, onClick: function () { actions.dismissStageAsk(project.id, stage.id); } }) : null
      ]));
    }
    if (open) {
      children.push(D.el('div', { class: 'plan-panel', attrs: { id: panelId } }, [
        E.TaskList.taskList(project, stage, actions, ctx.people, ctx.motion)
      ]));
    }
    return D.el('li', { class: 'plan-item', dataset: { stageId: stage.id } }, children);
  }
  /** Menu „Dodaj etap”: etapy ze standardu, których jeszcze nie ma, i etap własny. */
  function addStageButton(project, actions, variant) {
    var btn = UI.button({ label: 'Dodaj etap', icon: 'plus', variant: variant || 'ghost', size: 'sm', attrs: { 'data-fk': 'add-stage' } });
    Menu.bind(btn, function () {
      var used = {};
      project.stages.forEach(function (stage) { used[stage.id] = true; });
      var available = Catalog.all.filter(function (entry) { return !used[entry.id]; });
      var items = [{ label: 'Etap własny…', icon: 'edit', hint: 'spoza standardu', onSelect: function () { actions.openCustomStage(project.id); } }, { type: 'separator' }];
      if (available.length) {
        items.push({ type: 'label', label: 'Ze standardu ETROM' });
        available.forEach(function (entry) {
          items.push({ label: entry.number + '. ' + entry.name, hint: F.hours(entry.defaultHours), value: entry.id, onSelect: function () { actions.addStage(project.id, entry.id); } });
        });
      } else {
        items.push({ type: 'note', label: 'Wszystkie etapy ze standardu są już w projekcie.' });
      }
      return { label: 'Dodaj etap', items: items, minWidth: '22rem', align: 'end' };
    });
    return btn;
  }

  /** Liczba zakończonych etapów od początku — to one zwijają się do jednego wiersza. */
  function leadingDone(project) {
    var n = 0;
    while (n < project.stages.length && project.stages[n].status === 'done') n += 1;
    return n;
  }

  /** Termin etapu do podglądu: najbliższy termin otwartego zadania albo termin etapu. */
  function stageDue(stage) {
    var at = stage.status === 'done' ? '' : (E.Tasks.nearestDeadline(stage) || stage.deadline || '');
    return at ? String(at).slice(0, 10) : '';
  }

  /** Które etapy pokazuje lupa: bieżące (w toku) obok siebie albo sąsiedzi, gdy żaden nie jest w toku. */
  function lensStages(project, expanded) {
    var stages = project.stages;
    var working = [];
    stages.forEach(function (st, i) { if (st.status === 'working') working.push(i); });
    var firstTodo = -1;
    stages.forEach(function (st, i) { if (firstTodo < 0 && st.status === 'todo') firstTodo = i; });
    var lastDone = -1;
    stages.forEach(function (st, i) { if (st.status === 'done') lastDone = i; });
    if (!working.length) return { main: [], side: [lastDone, firstTodo].filter(function (i) { return i >= 0; }), hidden: 0 };
    if (working.length === 1) {
      var at = working[0];
      return { main: working, side: [at - 1, at + 1].filter(function (i) { return i >= 0 && i < stages.length; }), hidden: 0, sideLabels: true };
    }
    var ordered = working.slice().sort(function (x, y) {
      var dx = stageDue(stages[x]) || '9999'; var dy = stageDue(stages[y]) || '9999';
      return dx < dy ? -1 : dx > dy ? 1 : x - y;
    });
    var shown = (working.length > 3 && !expanded) ? ordered.slice(0, 3) : ordered;
    shown = shown.slice().sort(function (x, y) { return x - y; });
    var next = -1;
    for (var i = working[0] + 1; i < stages.length; i += 1) { if (stages[i].status === 'todo') { next = i; break; } }
    return { main: shown, side: working.length <= 3 && next >= 0 ? [next] : [], hidden: working.length - shown.length, nextOnly: true };
  }

  function lensMain(project, stage, index, ctx) {
    var info = Model.describeStage(stage);
    var stats = Tasks.taskStats(stage.tasks || []);
    var due = stageDue(stage);
    var days = due ? Progress.daysUntil(due, new Date()) : null;
    var late = days !== null && days < 0;
    var dueText = due ? (days < 0 ? Math.abs(days) + ' dni po terminie' : days === 0 ? 'dziś' : days === 1 ? 'jutro' : days + ' dni do końca') + ' · ' + F.date(due) : 'bez terminu';
    var pct = stats.total ? Math.round(100 * stats.done / stats.total) : 0;
    var hoursLine = null;
    if (E.Budget.canSeeHours(ctx.state.prefs.me, project, ctx.people)) {
      var view = E.Budget.view(project, stage, ctx.state.workspace.entries || [], ctx.state.prefs.me, ctx.people, new Date());
      if (view.exact) { pct = Math.max(0, Math.min(100, view.percent)); hoursLine = String(Math.round(view.used * 10) / 10).replace('.', ',') + ' / ' + F.hours(view.planned); }
    }
    var names = (stage.tasks || []).reduce(function (acc, t) { (t.assignees || []).forEach(function (id) { if (acc.indexOf(id) < 0) acc.push(id); }); return acc; }, [])
      .map(function (id) { var p = E.Team.findPerson(ctx.people || [], id); return p ? p.firstName + ' ' + (p.lastName || '').slice(0, 1) + '.' : ''; }).filter(Boolean).slice(0, 3).join(', ');
    return D.el('button', {
      class: 'jl__main' + (late ? ' is-late' : ''), attrs: { type: 'button', 'data-fk': 'jl-main-' + stage.id, 'data-tooltip': 'Pokaż zadania etapu' },
      on: { click: function () { ctx.actions.toggleStage(project.id, stage.id); } }
    }, [
      D.el('span', { class: 'jl__top' }, [
        D.el('span', { class: 'jl__pill', text: 'Etap ' + (index + 1) + ' z ' + project.stages.length }),
        D.el('span', { class: 'jl__state', text: '◐ W toku' }),
        D.el('span', { class: 'jl__grow' }),
        D.el('span', { class: 'jl__due', text: dueText })
      ]),
      D.el('span', { class: 'jl__name', text: info.name }),
      D.el('span', { class: 'jl__bar' }, [D.el('i', { style: { width: pct + '%' } })]),
      D.el('span', { class: 'jl__meta' }, [
        hoursLine ? D.el('span', { class: 't-num', text: hoursLine }) : null,
        D.el('span', { text: stats.total ? 'zadania ' + stats.done + ' z ' + stats.total : 'brak zadań' }),
        names ? D.el('span', { text: names }) : null
      ])
    ]);
  }

  function lensSide(project, stage, index, label, ctx) {
    var info = Model.describeStage(stage);
    var st = Model.STAGE_STATUS[stage.status] || '';
    return D.el('button', {
      class: 'jl__side' + (info.decision ? ' is-post' : ''), attrs: { type: 'button', 'data-fk': 'jl-side-' + stage.id },
      on: { click: function () { ctx.actions.toggleStage(project.id, stage.id); } }
    }, [
      D.el('span', { class: 'jl__label', text: label + ' · ' + (index + 1) }),
      D.el('span', { class: 'jl__sname', text: (info.decision ? '⏳ ' : '') + info.name }),
      D.el('span', { class: 'jl__sstate', text: st })
    ]);
  }

  /** Oś przebiegu SP3-C: minimapa całego projektu w skali godzin i „lupa” na bieżące etapy. */
  function journey(project, ctx) {
    var stages = project.stages;
    var wrap = D.el('div', { class: 'jr', attrs: { 'aria-label': 'Przebieg etapów' } });
    var expanded = false;

    var mini = D.el('ol', { class: 'jm' }, stages.map(function (stage, index) {
      var info = Model.describeStage(stage);
      var late = stage.status !== 'done' && Tasks.taskStats(stage.tasks || []).overdue > 0;
      return D.el('li', {
        class: 'jm__seg jm__seg--' + stage.status + (late ? ' is-late' : '') + (info.decision ? ' is-post' : ''),
        style: { 'flex-grow': String(Math.max(8, Number(stage.hours) || 8)) },
        attrs: { 'data-tooltip': (index + 1) + '. ' + info.name + ' — ' + (Model.STAGE_STATUS[stage.status] || ''), 'data-stage': stage.id }
      });
    }));
    var lens = D.el('div', { class: 'jl' });

    function paint() {
      var plan = lensStages(project, expanded);
      D.clear ? D.clear(lens) : (lens.textContent = '');
      plan.main.forEach(function (i) { lens.appendChild(lensMain(project, stages[i], i, ctx)); });
      var firstMain = plan.main.length ? plan.main[0] : null;
      plan.side.forEach(function (i) {
        var label = plan.nextOnly ? 'Następny' : (firstMain === null ? (stages[i].status === 'done' ? 'Poprzedni' : 'Następny') : (i < firstMain ? 'Poprzedni' : 'Następny'));
        lens.appendChild(lensSide(project, stages[i], i, label, ctx));
      });
      if (plan.hidden > 0 || (expanded && plan.main.length > 3)) {
        lens.appendChild(D.el('button', {
          class: 'jl__more', attrs: { type: 'button', 'data-fk': 'jl-more' },
          text: expanded ? 'Zwiń' : '+' + plan.hidden + ' w toku',
          on: { click: function () { expanded = !expanded; paint(); } }
        }));
      }
      Array.prototype.forEach.call(mini.children, function (li, i) { li.classList.toggle('is-active', plan.main.indexOf(i) >= 0); });
    }
    paint();
    wrap.appendChild(mini);
    wrap.appendChild(lens);
    return wrap;
  }

  function stageList(project, ctx) {
    var count = project.stages.length;
    var stats = Progress.projectProgress(project);

    if (!count) {
      return D.el('section', { class: 'section' }, [D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'layers',
        title: 'Projekt nie ma jeszcze etapów',
        text: 'Etapy porządkują pracę i budżet godzin. Wybierz je ze standardu ETROM albo dopisz własne, gdy projekt wymaga czegoś nietypowego.',
        actions: [addStageButton(project, ctx.actions, 'primary')]
      })])]);
    }

    var done = leadingDone(project);
    var showDone = !!(ctx.state.showDone && ctx.state.showDone[project.id]);
    var collapse = done >= COLLAPSE_FROM && done < count && !showDone;
    var items = [];

    if (collapse) {
      items.push(D.el('li', { class: 'plan-item plan-item--summary' }, [D.el('div', { class: 'plan-row plan-row--done plan-row--summary' }, [
        D.el('button', {
          class: 'plan-row__main',
          attrs: { type: 'button', 'aria-expanded': 'false', id: 'show-done' },
          on: { click: function () { ctx.actions.toggleDone(project.id); } }
        }, [
          D.el('span', { class: 'plan-row__no t-num', text: '1–' + done }),
          D.el('span', { class: 'plan-row__text' }, [
            D.el('span', { class: 'plan-row__name', text: F.count(done, 'etap zakończony', 'etapy zakończone', 'etapów zakończonych') })
          ]),
          D.el('span', { class: 'plan-row__reveal', text: 'Pokaż' })
        ])
      ])]));
    }

    project.stages.forEach(function (stage, index) {
      if (collapse && index < done) return;
      items.push(stageRow(project, stage, index, count, ctx));
    });

    var late = project.stages.filter(function (st) { return st.status !== 'done' && Tasks.taskStats(st.tasks || []).overdue > 0; }).length;

    return D.el('section', { class: 'section plan', attrs: { 'aria-labelledby': 'stages-title' } }, [
      D.el('div', { class: 'section__head' }, [
        D.el('div', { class: 'section__titles' }, [
          D.el('h2', { class: 'section__title', text: 'Etapy', attrs: { id: 'stages-title' } }),
          D.el('span', { class: 'section__meta', text: stats.done + ' z ' + count + ' zakończonych' }),
          late ? D.el('span', { class: 'section__meta t-alarm', text: F.count(late, 'etap ma zadania po terminie', 'etapy mają zadania po terminie', 'etapów ma zadania po terminie') }) : null
        ]),
        D.el('div', { class: 'section__actions' }, [
          !collapse && done >= COLLAPSE_FROM && done < count
            ? UI.button({ label: 'Zwiń zakończone', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.toggleDone(project.id); } })
            : null,
          addStageButton(project, ctx.actions)
        ])
      ]),
      journey(project, ctx),
      D.el('div', { class: 'plan-row plan-row--head', attrs: { 'aria-hidden': 'true' } }, [
        D.el('span', { text: 'Etap' }), D.el('span', { text: 'Najbliższy termin' }), D.el('span', { text: 'Budżet etapu' }), D.el('span', { text: 'Status' }), D.el('span')
      ]),
      D.el('ol', { class: 'plan-rows' }, items)
    ]);
  }
  root.ETROM.StageList = { stageList: stageList, addStageButton: addStageButton, isOpen: isOpen };
})(typeof globalThis !== 'undefined' ? globalThis : this);
