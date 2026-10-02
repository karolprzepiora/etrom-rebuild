/* ETROM — etapy projektu.
   Jeden wiersz na etap: rozwinięcie (zadania), status (klik przestawia),
   nazwa z dziedziną, zadania, godziny, termin i menu działań.
   Barwa należy do stanu i do terminów wymagających reakcji — dziedzina
   ma tylko drobną ikonę. */
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
  var F = E.Format;

  function taskCell(stage) {
    var stats = Tasks.taskStats(stage.tasks || []);
    if (!stats.total) {
      return D.el('span', { class: 'srow__tasks t-muted', text: '—', attrs: { 'aria-label': 'Brak zadań' } });
    }
    return D.el('span', {
      class: 'srow__tasks' + (stats.overdue ? ' srow__tasks--alert' : ''),
      attrs: {
        'data-tooltip': 'Otwarte ' + stats.open + ' z ' + stats.total + (stats.overdue ? ' · po terminie ' + stats.overdue : ''),
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

  function stageRow(project, stage, position, count, ctx) {
    var actions = ctx.actions;
    var info = Model.describeStage(stage);
    var key = project.id + ':' + stage.id;
    var open = !!(ctx.state.expandedStages && ctx.state.expandedStages[key]);
    var flash = ctx.motion && ctx.motion.flashStage === stage.id;
    var panelId = 'tasks-' + project.id + '-' + String(stage.id).replace(/[^a-zA-Z0-9_-]/g, '-');
    var meta = info.isCustom ? 'własny · ' + info.domainLabel : 'standard ' + info.catalogNumber + ' · ' + info.domainLabel;

    var row = D.el('div', {
      class: 'srow row srow--' + stage.status + (flash ? ' is-flash' : '') + (open ? ' srow--open' : '')
    }, [
      D.el('button', {
        class: 'srow__expand',
        attrs: {
          type: 'button',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': panelId,
          'data-fk': 'stage-expand-' + stage.id
        },
        on: { click: function () { actions.toggleStage(project.id, stage.id); } }
      }, [
        D.el('span', { class: 'srow__chevron' }, [Icons.icon('chevronRight', 14)]),
        D.el('span', { class: 'srow__no', text: String(position + 1) }),
        D.el('span', { class: 'srow__icon', style: { color: info.color }, attrs: { 'data-tooltip': info.domainLabel } }, [Icons.icon(info.domain, 16)]),
        D.el('span', { class: 'srow__text' }, [
          D.el('span', { class: 'srow__name', text: info.name }),
          D.el('span', { class: 'srow__meta', text: meta })
        ]),
        D.el('span', { class: 'sr-only', text: open ? ', zwiń zadania' : ', pokaż zadania' })
      ]),
      UI.statusButton('stage', stage.status, {
        subject: info.name,
        class: 'srow__status',
        hint: 'Kliknij, aby przestawić na „' + Model.STAGE_STATUS[Model.cycleStageStatus(stage.status)] + '”',
        attrs: {
          'data-fk': 'stage-status-' + stage.id,
          'data-tooltip': 'Przestaw na „' + Model.STAGE_STATUS[Model.cycleStageStatus(stage.status)] + '”'
        },
        onClick: function () { actions.cycleStage(project.id, stage.id); }
      }),
      taskCell(stage),
      D.el('span', { class: 'srow__hours t-num', text: F.hours(stage.hours) }),
      D.el('span', { class: 'srow__deadline' }, [
        UI.due(stage.deadline, Progress.deadlineInfo(stage.deadline), { done: stage.status === 'done', label: 'Termin etapu' })
      ]),
      stageMenu(project, stage, position, count, actions)
    ]);

    var children = [row];
    if (open) {
      children.push(D.el('div', { class: 'srow__panel', attrs: { id: panelId } }, [
        E.TaskList.taskList(project, stage, actions, ctx.people, ctx.motion)
      ]));
    }
    return D.el('li', { class: 'srow-wrap', dataset: { stageId: stage.id } }, children);
  }

  /** Menu „Dodaj etap”: etapy ze standardu, których jeszcze nie ma, i etap własny. */
  function addStageButton(project, actions, variant) {
    var btn = UI.button({ label: 'Dodaj etap', icon: 'plus', variant: variant || 'secondary', size: 'sm', iconRight: 'chevronDown', attrs: { 'data-fk': 'add-stage' } });
    Menu.bind(btn, function () {
      var used = {};
      project.stages.forEach(function (stage) { used[stage.id] = true; });
      var available = Catalog.all.filter(function (entry) { return !used[entry.id]; });
      var items = [{ label: 'Etap własny…', icon: 'edit', hint: 'spoza standardu', onSelect: function () { actions.openCustomStage(project.id); } }];
      items.push({ type: 'separator' });
      if (available.length) {
        items.push({ type: 'label', label: 'Ze standardu ETROM' });
        available.forEach(function (entry) {
          items.push({
            label: entry.number + '. ' + entry.name,
            hint: F.hours(entry.defaultHours),
            value: entry.id,
            onSelect: function () { actions.addStage(project.id, entry.id); }
          });
        });
      } else {
        items.push({ type: 'note', label: 'Wszystkie etapy ze standardu są już w projekcie.' });
      }
      return { label: 'Dodaj etap', items: items, minWidth: '22rem' };
    });
    return btn;
  }

  /**
   * @param {Object} project
   * @param {{state, people, actions, motion}} ctx
   */
  function stageList(project, ctx) {
    var count = project.stages.length;
    var stats = Progress.projectProgress(project);

    if (!count) {
      return D.el('section', { class: 'section' }, [
        D.el('div', { class: 'card' }, [UI.emptyState({
          icon: 'layers',
          title: 'Projekt nie ma jeszcze etapów',
          text: 'Etapy porządkują pracę i liczą postęp. Wybierz je ze standardu ETROM albo dopisz własne, gdy projekt wymaga czegoś nietypowego.',
          actions: [addStageButton(project, ctx.actions, 'primary')]
        })])
      ]);
    }

    return D.el('section', { class: 'section', attrs: { 'aria-labelledby': 'stages-title' } }, [
      D.el('div', { class: 'section__head' }, [
        D.el('div', { class: 'section__titles' }, [
          D.el('h2', { class: 'section__title', text: 'Etapy', attrs: { id: 'stages-title' } }),
          D.el('span', { class: 'section__meta', text: stats.done + ' z ' + count + ' zakończonych · ' + F.hours(stats.hoursTotal) + ' w budżecie' })
        ]),
        addStageButton(project, ctx.actions)
      ]),
      D.el('ul', { class: 'srows list' }, project.stages.map(function (stage, index) {
        return stageRow(project, stage, index, count, ctx);
      }))
    ]);
  }

  root.ETROM.StageList = { stageList: stageList, addStageButton: addStageButton };
})(typeof globalThis !== 'undefined' ? globalThis : this);
