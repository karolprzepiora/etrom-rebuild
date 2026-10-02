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
      D.el('div', { class: 'plan-row plan-row--head', attrs: { 'aria-hidden': 'true' } }, [
        D.el('span', { text: 'Etap' }), D.el('span', { text: 'Najbliższy termin' }), D.el('span', { text: 'Budżet etapu' }), D.el('span', { text: 'Status' }), D.el('span')
      ]),
      D.el('ol', { class: 'plan-rows' }, items)
    ]);
  }
  root.ETROM.StageList = { stageList: stageList, addStageButton: addStageButton, isOpen: isOpen };
})(typeof globalThis !== 'undefined' ? globalThis : this);
