/* ETROM — przebieg etapów jako rail.
   Pionowa linia przebiegu: ciągła przez etapy zakończone, w kolorze nurtu
   przez etap w toku, przerywana przez etapy przed nami — jak linie istniejące
   i projektowane na rysunku. Seria zakończonych etapów od początku zwija się
   do jednego wiersza, żeby uwaga szła tam, gdzie trwa praca. */
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

  function taskCell(stage) {
    var stats = Tasks.taskStats(stage.tasks || []);
    if (!stats.total) return D.el('span', { class: 'srow__tasks t-muted', text: '—', attrs: { 'aria-label': 'Brak zadań' } });
    return D.el('span', {
      class: 'srow__tasks' + (stats.overdue ? ' srow__tasks--alert' : ''),
      attrs: {
        'data-tooltip': 'Otwarte ' + stats.open + ' z ' + stats.total + (stats.overdue ? ', po terminie ' + stats.overdue : ''),
        'aria-label': 'Zadania otwarte: ' + stats.open + ' z ' + stats.total + (stats.overdue ? ', po terminie: ' + stats.overdue : '')
      }
    }, [stats.open + '/' + stats.total]);
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

  function railCell(stage, segment, flash) {
    var cls = 'rail__node rail__node--' + stage.status
      + (segment && segment.current ? ' rail__node--current' : '')
      + (segment && segment.overdue ? ' rail__node--overdue' : '')
      + (flash ? ' is-pop' : '');
    return D.el('span', { class: 'srow__rail rail--' + stage.status, attrs: { 'aria-hidden': 'true' } }, [D.el('span', { class: cls })]);
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

  /** Budżet godzin etapu; gdy zapisano czas, także ile z niego już zużyto. */
  function hoursCell(stage, loggedMinutes) {
    if (!loggedMinutes) return D.el('span', { class: 'srow__hours t-num', text: F.hours(stage.hours) });
    var used = E.TimeLog.hoursOf(loggedMinutes);
    var over = used > Number(stage.hours);
    return D.el('span', {
      class: 'srow__hours srow__hours--logged t-num' + (over ? ' is-over' : ''),
      attrs: { 'data-tooltip': 'Zapisano ' + E.TimeLog.duration(loggedMinutes) + ' z budżetu ' + F.hours(stage.hours) + (over ? ' — budżet przekroczony' : '') }
    }, [
      D.el('span', { class: 'srow__used', text: String(used).replace('.', ',') }),
      D.el('span', { class: 'srow__budget', text: ' / ' + F.hours(stage.hours) })
    ]);
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

  function stageRow(project, stage, position, count, ctx, segment) {
    var actions = ctx.actions;
    var info = Model.describeStage(stage);
    var open = isOpen(ctx.state.expandedStages, project, stage);
    var flash = ctx.motion && ctx.motion.flashStage === stage.id;
    var panelId = 'tasks-' + project.id + '-' + String(stage.id).replace(/[^a-zA-Z0-9_-]/g, '-');
    var meta = info.kindLabel + ' · ' + info.domainLabel.toLowerCase() + ' · ' + (info.isCustom ? 'własny' : 'standard ' + info.catalogNumber);
    var nextStatus = Model.STAGE_STATUS[Model.cycleStageStatus(stage.status)];
    // Rodzaj, temat i numer standardu są w podpowiedzi ikony — wiersz zostaje czysty.
    var icon = Icons.stageIcon(info, 15);
    icon.setAttribute('data-tooltip', meta);

    var row = D.el('div', {
      class: 'srow row srow--' + stage.status
        + (segment && segment.current ? ' srow--current' : '')
        + (segment && segment.overdue ? ' srow--overdue' : '')
        + (flash ? ' is-flash' : '') + (open ? ' srow--open' : '')
    }, [
      railCell(stage, segment, flash),
      D.el('button', {
        class: 'srow__expand',
        attrs: { type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': panelId, 'data-fk': 'stage-expand-' + stage.id }
      }, [
        D.el('span', { class: 'srow__no t-num', text: String(position + 1) }),
        icon,
        D.el('span', { class: 'srow__text' }, [
          D.el('span', { class: 'srow__name', text: info.name })
        ]),
        D.el('span', { class: 'srow__chevron' }, [Icons.icon('chevronDown', 14)]),
        D.el('span', { class: 'sr-only', text: open ? ', zwiń zadania' : ', pokaż zadania' })
      ]),
      taskCell(stage),
      hoursCell(stage, ctx.logged && ctx.logged[stage.id]),
      D.el('span', { class: 'srow__deadline' }, [
        nearestDue(stage)
      ]),
      UI.statusButton('stage', stage.status, {
        subject: info.name,
        class: 'srow__status',
        hint: 'Kliknij, aby przestawić na „' + nextStatus + '”',
        attrs: { 'data-fk': 'stage-status-' + stage.id, 'data-tooltip': 'Przestaw na „' + nextStatus + '”' },
        onClick: function () { actions.cycleStage(project.id, stage.id); }
      }),
      stageMenu(project, stage, position, count, actions)
    ]);
    row.querySelector('.srow__expand').addEventListener('click', function () { actions.toggleStage(project.id, stage.id); });

    var children = [row];
    if (open) {
      children.push(D.el('div', { class: 'srow__panel rail--' + stage.status, attrs: { id: panelId } }, [
        E.TaskList.taskList(project, stage, actions, ctx.people, ctx.motion)
      ]));
    }
    return D.el('li', { class: 'srow-wrap', dataset: { stageId: stage.id } }, children);
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

  /** Budżet godzin projektu według rodzaju pracy: pasek i legenda. */
  function kindBudget(rows) {
    var total = rows.reduce(function (sum, r) { return sum + r.hours; }, 0);
    if (!total) return null;
    return D.el('div', { class: 'kindbar', attrs: { role: 'group', 'aria-label': 'Budżet godzin według rodzaju pracy' } }, [
      D.el('div', { class: 'kindbar__track', attrs: { 'aria-hidden': 'true' } }, rows.filter(function (r) { return r.hours > 0; }).map(function (r) {
        return D.el('span', {
          class: 'kindbar__seg kindbar__seg--' + r.kind,
          style: { '--hours': String(r.hours), '--done': (r.hours ? Math.round(r.doneHours / r.hours * 100) : 0) + '%' }
        });
      })),
      D.el('ul', { class: 'kindbar__legend' }, rows.map(function (r) {
        return D.el('li', { class: 'kindbar__item' + (r.hours ? '' : ' is-zero') }, [
          D.el('span', { class: 'kindbar__swatch kindbar__swatch--' + r.kind, attrs: { 'aria-hidden': 'true' } }),
          D.el('span', { class: 'kindbar__label', text: r.label }),
          D.el('span', { class: 'kindbar__value t-num', text: r.hours ? F.hours(r.hours) + ' · ' + Math.round(r.share * 100) + '%' : 'brak' })
        ]);
      }))
    ]);
  }

  function stageList(project, ctx) {
    var count = project.stages.length;
    var stats = Progress.projectProgress(project);
    var prof = Insight.profile(project);
    var segments = {};
    prof.segments.forEach(function (seg) { segments[seg.id] = seg; });

    if (!count) {
      return D.el('section', { class: 'section' }, [D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'layers',
        title: 'Projekt nie ma jeszcze etapów',
        text: 'Etapy porządkują pracę i liczą postęp. Wybierz je ze standardu ETROM albo dopisz własne, gdy projekt wymaga czegoś nietypowego.',
        actions: [addStageButton(project, ctx.actions, 'primary')]
      })])]);
    }

    ctx = Object.assign({}, ctx, { logged: E.TimeLog.byStage(ctx.state.workspace.entries || [], project.id) });
    var done = leadingDone(project);
    var showDone = !!(ctx.state.showDone && ctx.state.showDone[project.id]);
    var collapse = !ctx.state.stageGroup && done >= COLLAPSE_FROM && done < count && !showDone;
    var items = [];

    if (collapse) {
      var hours = project.stages.slice(0, done).reduce(function (sum, s) { return sum + (Number(s.hours) || 0); }, 0);
      items.push(D.el('li', { class: 'srow-wrap srow-wrap--summary' }, [D.el('div', { class: 'srow srow--summary srow--done' }, [
        D.el('span', { class: 'srow__rail rail--done', attrs: { 'aria-hidden': 'true' } }, [D.el('span', { class: 'rail__node rail__node--done' })]),
        D.el('button', {
          class: 'srow__expand srow__expand--summary',
          attrs: { type: 'button', 'aria-expanded': 'false', id: 'show-done' },
          on: { click: function () { ctx.actions.toggleDone(project.id); } }
        }, [
          D.el('span', { class: 'srow__no t-num', text: '1–' + done }),
          D.el('span', { class: 'srow__text' }, [
            D.el('span', { class: 'srow__name', text: F.count(done, 'etap zakończony', 'etapy zakończone', 'etapów zakończonych') }),
            D.el('span', { class: 'srow__meta' }, [D.el('span', { text: F.hours(hours) + ' wykonanej pracy' })])
          ]),
          D.el('span', { class: 'srow__reveal', text: 'Pokaż' })
        ])
      ])]));
    }

    var grouped = !!ctx.state.stageGroup;
    var order = project.stages.map(function (stage, index) { return { stage: stage, index: index }; })
      .filter(function (entry) { return !(collapse && entry.index < done); });
    if (grouped) {
      var ranks = {};
      Catalog.KIND_ORDER.forEach(function (id, rank) { ranks[id] = rank; });
      order.sort(function (a, b) {
        return (ranks[Model.describeStage(a.stage).kind] - ranks[Model.describeStage(b.stage).kind]) || (a.index - b.index);
      });
    }
    var lastKind = null;
    var budget = Insight.budgetByKind(project);
    order.forEach(function (entry) {
      var kind = Model.describeStage(entry.stage).kind;
      if (grouped && kind !== lastKind) {
        var row = budget.filter(function (b) { return b.kind === kind; })[0];
        items.push(D.el('li', { class: 'srow-group', attrs: { role: 'presentation' } }, [
          Icons.icon(Catalog.kind(kind).icon, 14),
          D.el('span', { class: 'srow-group__label', text: Catalog.kind(kind).label }),
          D.el('span', { class: 'srow-group__meta t-num', text: F.hours(row.hours) + ' · ' + Math.round(row.share * 100) + '%' })
        ]));
        lastKind = kind;
      }
      items.push(stageRow(project, entry.stage, entry.index, count, ctx, segments[entry.stage.id]));
    });

    var late = prof.segments.filter(function (s) { return s.overdue; }).length;

    return D.el('section', { class: 'section stages', attrs: { 'aria-labelledby': 'stages-title' } }, [
      D.el('div', { class: 'section__head' }, [
        D.el('div', { class: 'section__titles' }, [
          D.el('h2', { class: 'section__title', text: 'Przebieg etapów', attrs: { id: 'stages-title' } }),
          D.el('span', { class: 'section__meta', text: stats.done + ' z ' + count + ' zakończonych' }),
          late ? D.el('span', { class: 'section__meta t-alarm', text: F.count(late, 'etap po terminie', 'etapy po terminie', 'etapów po terminie') }) : null
        ]),
        D.el('div', { class: 'section__actions' }, [
          !collapse && done >= COLLAPSE_FROM && done < count
            ? UI.button({ label: 'Zwiń zakończone', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.toggleDone(project.id); } })
            : null,
          UI.button({
            label: 'Grupuj wg rodzaju', icon: 'layers', variant: 'ghost', size: 'sm',
            attrs: { 'aria-pressed': grouped ? 'true' : 'false', 'data-fk': 'stage-group' },
            onClick: function () { ctx.actions.toggleStageGroup(); }
          }),
          addStageButton(project, ctx.actions)
        ])
      ]),
      kindBudget(budget),
      D.el('div', { class: 'srow srow--head', attrs: { 'aria-hidden': 'true' } }, [
        D.el('span'), D.el('span', { text: 'Etap' }), D.el('span', { class: 'srow__tasks', text: 'Zadania' }),
        D.el('span', { class: 'srow__hours', text: 'Godziny' }), D.el('span', { class: 'srow__deadline', text: 'Termin zadań' }),
        D.el('span', { text: 'Status' }), D.el('span')
      ]),
      D.el('ol', { class: 'srows rail' }, items)
    ]);
  }

  root.ETROM.StageList = { stageList: stageList, addStageButton: addStageButton, isOpen: isOpen };
})(typeof globalThis !== 'undefined' ? globalThis : this);
