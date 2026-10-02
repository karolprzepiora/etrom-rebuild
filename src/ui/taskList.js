/* ETROM — zadania etapu.
   Status zmienia się przez menu z dozwolonymi przejściami: przepływ pilnuje
   modelu, interfejs pokazuje tylko to, co wolno zrobić. Udział realizatora
   to awatar z kształtem stanu — klik przestawia jego część pracy. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Tasks = E.Tasks;
  var Team = E.Team;
  var Avatar = E.Avatar;
  var Icons = E.Icons;

  var PART_SHAPE = { todo: 'empty', working: 'half', done: 'done' };
  var PART_TONE = { todo: 'neutral', working: 'flow', done: 'done' };

  function statusControl(project, stage, task, actions) {
    var btn = UI.statusButton('task', task.status, {
      subject: task.name,
      menu: true,
      class: 'trow__status',
      attrs: { 'data-fk': 'task-status-' + task.id }
    });
    Menu.bind(btn, function () {
      var next = Tasks.nextStatuses(task.status);
      return {
        label: 'Zmień status zadania',
        items: [{ type: 'label', label: 'Przenieś do' }].concat(next.map(function (key) {
          return {
            label: Tasks.TASK_STATUS[key],
            value: key,
            leading: UI.statusGlyph('task', key),
            hint: key === 'changes' ? 'wymaga powodu' : '',
            onSelect: function () { actions.moveTask(project.id, stage.id, task.id, key); }
          };
        })).concat(next.length ? [] : [{ type: 'note', label: 'Brak dozwolonych przejść.' }])
      };
    });
    return btn;
  }

  function partButton(project, stage, task, person, actions) {
    var state = Tasks.partStatus(task, person.id);
    var label = Team.fullName(person) + ': ' + Tasks.PART_STATUS[state].toLowerCase();
    return D.el('button', {
      class: 'part part--' + state,
      attrs: {
        type: 'button',
        'aria-label': 'Udział: ' + label + '. Kliknij, aby przestawić.',
        'data-tooltip': label + ' — kliknij, aby przestawić',
        'data-fk': 'part-' + task.id + '-' + person.id
      },
      on: { click: function () { actions.cyclePart(project.id, stage.id, task.id, person.id); } }
    }, [
      Avatar.avatar(person, { size: 'sm', tooltip: false }),
      D.el('span', { class: 'part__state status status--' + PART_TONE[state] }, [UI.statusIcon(PART_SHAPE[state])])
    ]);
  }

  function taskMenu(project, stage, task, actions) {
    var btn = UI.iconButton({
      icon: 'more', label: 'Działania zadania: ' + task.name, size: 'sm', class: 'row-actions',
      attrs: { 'data-fk': 'task-more-' + task.id }
    });
    Menu.bind(btn, function () {
      return {
        label: 'Działania zadania', align: 'end',
        items: [
          { label: 'Szczegóły', icon: 'inspector', onSelect: function () { actions.inspect({ kind: 'task', projectId: project.id, stageId: stage.id, taskId: task.id }); } },
          { label: 'Dopisz czas…', icon: 'clock', hint: 'ręcznie', onSelect: function () { actions.logTime(project.id, stage.id, task.id); } },
          { label: 'Edytuj zadanie', icon: 'edit', onSelect: function () { actions.editTask(project.id, stage.id, task.id); } },
          { type: 'separator' },
          { label: 'Usuń zadanie', icon: 'trash', tone: 'danger', onSelect: function () { actions.deleteTask(project.id, stage.id, task.id); } }
        ]
      };
    });
    return btn;
  }

  function taskRow(project, stage, task, actions, people, motion) {
    var info = Tasks.deadlineInfo(task);
    var assigned = (task.assignees || [])
      .map(function (id) { return Team.findPerson(people, id); })
      .filter(Boolean);

    var title = D.el('div', { class: 'trow__title' }, [
      D.el('button', {
        class: 'trow__name',
        text: task.name,
        attrs: { type: 'button', 'aria-label': 'Szczegóły zadania: ' + task.name, 'data-fk': 'task-name-' + task.id },
        on: { click: function () { actions.inspect({ kind: 'task', projectId: project.id, stageId: stage.id, taskId: task.id }); } }
      }),
      task.important ? UI.badge('Ważne', 'warning', { icon: 'flag' }) : null
    ]);

    var body = [title];
    if (task.status === 'changes' && task.feedback) {
      body.push(D.el('p', { class: 'trow__feedback' }, [
        Icons.icon('alert', 14),
        D.el('span', { text: 'Do poprawy: ' + task.feedback })
      ]));
    }

    return D.el('li', {
      class: 'trow row trow--' + task.status + (motion && motion.flashTask === task.id ? ' is-flash' : '') + (actions.isInspected && actions.isInspected('task', task.id) ? ' is-inspected' : ''),
      dataset: { taskId: task.id }
    }, [
      statusControl(project, stage, task, actions),
      D.el('div', { class: 'trow__body' }, body),
      D.el('div', { class: 'trow__people' }, assigned.length
        ? assigned.map(function (person) { return partButton(project, stage, task, person, actions); })
        : [D.el('span', { class: 't-meta', text: 'Bez realizatora' })]),
      D.el('span', { class: 'trow__load t-meta', text: Tasks.WORKLOAD[task.workload], attrs: { 'data-tooltip': 'Nakład pracy' } }),
      D.el('span', { class: 'trow__deadline' }, [
        task.deadline
          ? UI.due(task.deadline, info, { done: task.status === 'done', relativeOnly: info.tone === 'overdue' || info.tone === 'urgent' })
          : D.el('span', { class: 'due due--none', text: 'Bez terminu' })
      ]),
      E.Timer.timerButton(project, stage, task, actions),
      taskMenu(project, stage, task, actions)
    ]);
  }

  /**
   * Zadania jednego etapu.
   * @param {{compact?: boolean, filter?: 'open'|'all'}} [options]
   */
  function taskList(project, stage, actions, people, motion, options) {
    var settings = options || {};
    var tasks = (stage.tasks || []).filter(function (task) {
      return settings.filter !== 'open' || task.status !== 'done';
    });
    var stats = Tasks.taskStats(stage.tasks || []);

    var summary = stats.total
      ? 'Otwarte ' + stats.open + ' z ' + stats.total
        + (stats.overdue ? ' · po terminie ' + stats.overdue : '')
        + (stats.review ? ' · do zatwierdzenia ' + stats.review : '')
      : 'Brak zadań';

    var head = settings.hideHead ? null : D.el('div', { class: 'tasks__head' }, [
      D.el('span', { class: 'tasks__summary', text: summary }),
      UI.button({
        label: 'Dodaj zadanie', icon: 'plus', variant: 'ghost', size: 'sm',
        attrs: { 'data-fk': 'add-task-' + stage.id },
        dataset: { action: 'add-task' },
        onClick: function () { actions.addTask(project.id, stage.id); }
      })
    ]);

    var body = tasks.length
      ? D.el('ul', { class: 'trows', attrs: { 'aria-label': 'Zadania etapu ' + E.Model.describeStage(stage).name } }, tasks.map(function (task) {
          return taskRow(project, stage, task, actions, people, motion);
        }))
      : (stats.total
          ? null
          : D.el('p', { class: 'tasks__empty', text: 'Rozpisz pracę w tym etapie na zadania z realizatorami i terminami.' }));

    return D.el('div', { class: 'tasks' }, [head, body]);
  }

  root.ETROM.TaskList = { taskList: taskList, taskRow: taskRow, statusControl: statusControl };
})(typeof globalThis !== 'undefined' ? globalThis : this);
