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

  // Jedno kliknięcie do kolejnego sensownego kroku (pełne menu zostaje pod statusem).
  // Pracownik może zgłosić zadanie do zatwierdzenia albo zakończyć je samodzielnie.
  var NEXT_STEP = {
    working: [{ to: 'review', label: 'Do zatwierdzenia' }, { to: 'done', label: 'Zakończ' }],
    changes: [{ to: 'working', label: 'Wróć do pracy' }]
  };

  /** Pasek rozkładu statusów zadań etapu: gotowe → w toku → reszta. */
  function statusBar(tasks) {
    var order = ['done', 'review', 'working', 'changes', 'todo'];
    var counts = {};
    tasks.forEach(function (t) { counts[t.status] = (counts[t.status] || 0) + 1; });
    var label = order.filter(function (k) { return counts[k]; })
      .map(function (k) { return Tasks.TASK_STATUS[k] + ': ' + counts[k]; }).join(', ');
    return D.el('span', { class: 'sbar', attrs: { role: 'img', 'aria-label': 'Rozkład statusów — ' + label, 'data-tooltip': label } },
      order.filter(function (k) { return counts[k]; }).map(function (k) {
        return D.el('span', { class: 'sbar__seg sbar__seg--' + k, style: { '--n': String(counts[k]) } });
      }));
  }

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

  /** Termin zadania: data z rokiem i godziną oraz odliczanie (godziny w ostatniej dobie w podpowiedzi). */
  function deadlineBlock(task, info) {
    if (!task.deadline) return D.el('span', { class: 'due due--none', text: 'Bez terminu' });
    var done = task.status === 'done';
    var day = task.deadline.slice(0, 10);
    return D.el('span', {
      class: 'tdue' + (done ? ' tdue--done' : ''),
      attrs: { 'data-tooltip': 'Termin: ' + E.Format.dateLong(day) + (done ? '' : ' — ' + info.text) }
    }, [
      D.el('span', { class: 'tdue__date t-num', text: E.Format.dateTime(task.deadline, { year: 'always' }) }),
      done ? D.el('span', { class: 'countdown countdown--done', text: 'zakończone' }) : UI.countdown(day, {})
    ]);
  }

  /** Szybkie kroki statusu (jedno kliknięcie): Do zatwierdzenia, Zakończ, Wróć do pracy. */
  function stepButtons(project, stage, task, actions) {
    return (NEXT_STEP[task.status] || []).map(function (step) {
      return D.el('button', {
        class: 'trow__step' + (step.to === 'done' ? ' trow__step--done' : ''),
        text: step.label,
        attrs: { type: 'button', 'data-fk': 'task-step-' + step.to + '-' + task.id, 'data-tooltip': 'Przenieś do: ' + Tasks.TASK_STATUS[step.to] },
        on: { click: function () { actions.moveTask(project.id, stage.id, task.id, step.to); } }
      });
    });
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
      task.important ? UI.badge('Ważne', 'warning', { icon: 'flag' }) : null,
      task.draft ? UI.badge(task.fromReserve ? 'Zamrożone · z rezerwy' : 'Zamrożone', 'outline', { icon: 'clock', attrs: { 'data-tooltip': 'Szkic planu: bez osób i terminu, widzi go tylko zarząd i lider. Odmroź, aby dodać realizatorów.' } }) : null
    ]);

    var body = [title];
    if (task.status === 'changes' && task.feedback) {
      body.push(D.el('p', { class: 'trow__feedback' }, [
        Icons.icon('alert', 14),
        D.el('span', { text: 'Do poprawy: ' + task.feedback })
      ]));
    }

    var meta = [];
    var logged = actions.taskMinutes ? actions.taskMinutes(task.id) : 0;
    if (logged > 0) meta.push(D.el('span', { class: 't-num', text: 'zapisano ' + E.TimeLog.duration(logged) }));
    if (task.draft) {
      meta.push(D.el('button', { class: 'trow__step', text: 'Odmroź', attrs: { type: 'button', 'data-fk': 'task-unfreeze-' + task.id, 'data-tooltip': 'Dodaj realizatorów i termin' }, on: { click: function () { actions.editTask(project.id, stage.id, task.id); } } }));
    } else stepButtons(project, stage, task, actions).forEach(function (b) { meta.push(b); });
    if (meta.length) body.push(D.el('p', { class: 'trow__meta t-meta' }, meta));

    return D.el('li', {
      class: 'trow row trow--' + task.status + (task.draft ? ' trow--frozen' : '') + (motion && motion.flashTask === task.id ? ' is-flash' : '') + (actions.isInspected && actions.isInspected('task', task.id) ? ' is-inspected' : ''),
      dataset: { taskId: task.id }
    }, [
      statusControl(project, stage, task, actions),
      D.el('div', { class: 'trow__body' }, body),
      D.el('div', { class: 'trow__people' }, assigned.length
        ? assigned.map(function (person) { return partButton(project, stage, task, person, actions); })
        : [D.el('span', { class: 't-meta', text: 'Bez realizatora' })]),
      D.el('span', { class: 'trow__load' }, [E.UI.workloadMark(task.workload)]),
      D.el('span', { class: 'trow__deadline' }, [deadlineBlock(task, info)]),
      task.draft ? D.el('span') : E.Timer.timerButton(project, stage, task, actions),
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
      D.el('span', { class: 'tasks__summary' }, [D.el('span', { text: summary }), stats.total ? statusBar(stage.tasks) : null]),
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

  root.ETROM.TaskList = { taskList: taskList, taskRow: taskRow, statusControl: statusControl, deadlineBlock: deadlineBlock, stepButtons: stepButtons };
})(typeof globalThis !== 'undefined' ? globalThis : this);
