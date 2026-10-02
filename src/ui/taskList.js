/* ETROM — lista zadań wewnątrz etapu.
   Status zmienia się przez listę dozwolonych przejść, a nie dowolnie:
   przepływ pilnuje modelu, nie interfejs. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Tasks = root.ETROM.Tasks;
  var Team = root.ETROM.Team;
  var Icons = root.ETROM.Icons;
  var Avatar = root.ETROM.Avatar;

  var STATUS_TONE = {
    todo: '',
    working: 'trow__status--working',
    review: 'trow__status--review',
    changes: 'trow__status--changes',
    done: 'trow__status--done'
  };

  var DEADLINE_CHIP = { overdue: 'chip--danger', urgent: 'chip--danger' };

  function statusControl(project, stage, task, handlers) {
    var options = [task.status].concat(Tasks.nextStatuses(task.status));
    var select = D.el('select', {
      class: 'trow__status ' + (STATUS_TONE[task.status] || ''),
      attrs: {
        'aria-label': 'Status zadania: ' + task.name,
        title: 'Status zadania'
      },
      on: {
        change: function () {
          var next = select.value;
          select.value = task.status;
          if (next !== task.status) handlers.onMoveTask(project.id, stage.id, task.id, next);
        }
      }
    }, options.map(function (key) {
      return D.el('option', {
        text: Tasks.TASK_STATUS[key],
        attrs: { value: key, selected: key === task.status }
      });
    }));
    return select;
  }

  function partButton(project, stage, task, person, handlers) {
    var state = Tasks.partStatus(task, person.id);
    return D.el('button', {
      class: 'part part--' + state,
      attrs: {
        type: 'button',
        title: Team.fullName(person) + ' — ' + Tasks.PART_STATUS[state] + '. Kliknij, aby zmienić.',
        'aria-label': 'Udział: ' + Team.fullName(person) + ', ' + Tasks.PART_STATUS[state]
      },
      on: { click: function () { handlers.onCyclePart(project.id, stage.id, task.id, person.id); } }
    }, [
      Avatar.avatar(person, { size: 'sm' }),
      D.el('span', { class: 'part__name', text: Team.fullName(person) })
    ]);
  }

  function taskRow(project, stage, task, handlers, people, motion) {
    var deadline = Tasks.deadlineInfo(task);
    var assigned = (task.assignees || [])
      .map(function (id) { return Team.findPerson(people, id); })
      .filter(Boolean);

    var head = [D.el('span', { class: 'trow__name', text: task.name })];
    if (task.important) {
      head.push(D.el('span', { class: 'chip chip--warn', text: 'ważne' }));
    }

    var body = [D.el('p', { class: 'trow__head' }, head)];

    if (assigned.length) {
      body.push(D.el('div', { class: 'trow__people' }, assigned.map(function (person) {
        return partButton(project, stage, task, person, handlers);
      })));
    } else {
      body.push(D.el('p', { class: 'trow__quiet', text: 'bez realizatora' }));
    }

    if (task.status === 'changes' && task.feedback) {
      body.push(D.el('p', { class: 'trow__feedback', text: 'Do poprawy: ' + task.feedback }));
    }

    var chip = DEADLINE_CHIP[deadline.tone];

    return D.el('li', {
      class: 'trow trow--' + task.status + (motion && motion.flashTask === task.id ? ' trow--flash' : ''),
      dataset: { taskId: task.id }
    }, [
      statusControl(project, stage, task, handlers),
      D.el('div', { class: 'trow__body' }, body),
      D.el('span', { class: 'trow__load', text: Tasks.WORKLOAD[task.workload] }),
      D.el('span', { class: 'trow__deadline' }, [
        chip
          ? D.el('span', { class: 'chip ' + chip, text: deadline.text })
          : D.el('span', { class: 'trow__quiet', text: deadline.text })
      ]),
      D.el('div', { class: 'trow__tools' }, [
        D.el('button', {
          class: 'btn btn--small btn--ghost', text: 'Edytuj',
          attrs: { type: 'button' },
          on: { click: function () { handlers.onEditTask(project.id, stage.id, task.id); } }
        }),
        D.el('button', {
          class: 'btn btn--icon',
          attrs: { type: 'button', title: 'Usuń zadanie', 'aria-label': 'Usuń zadanie ' + task.name },
          on: { click: function () { handlers.onDeleteTask(project.id, stage.id, task.id); } }
        }, [Icons.icon('close', 14)])
      ])
    ]);
  }

  /**
   * @param {Object} project
   * @param {Object} stage
   * @param {Object} handlers onAddTask, onEditTask, onDeleteTask, onMoveTask, onCyclePart
   * @param {Array} people katalog osób
   * @param {Object} [motion]
   */
  function taskList(project, stage, handlers, people, motion) {
    var tasks = stage.tasks || [];
    var stats = Tasks.taskStats(tasks);

    var summary = tasks.length
      ? 'otwarte: ' + stats.open + ' z ' + stats.total
        + (stats.overdue ? ' · po terminie: ' + stats.overdue : '')
        + (stats.review ? ' · do zatwierdzenia: ' + stats.review : '')
      : 'Brak zadań w tym etapie';

    var body = tasks.length
      ? D.el('ul', { class: 'trows' }, tasks.map(function (task) {
          return taskRow(project, stage, task, handlers, people, motion);
        }))
      : D.el('p', { class: 'stages__note', text: 'Dodaj pierwsze zadanie, żeby rozpisać pracę w tym etapie.' });

    return D.el('div', { class: 'tasks' }, [
      D.el('div', { class: 'tasks__head' }, [
        D.el('span', { class: 'label', text: 'Zadania' }),
        D.el('span', { class: 'stages__note', text: summary }),
        D.el('button', {
          class: 'btn btn--small',
          text: 'Nowe zadanie',
          attrs: { type: 'button' },
          on: { click: function () { handlers.onAddTask(project.id, stage.id); } }
        })
      ]),
      body
    ]);
  }

  root.ETROM.TaskList = { taskList: taskList };
})(typeof globalThis !== 'undefined' ? globalThis : this);
