/* ETROM — tablica zadań projektu (Kanban): pięć kolumn statusów, przeciąganie kart
   z kontrolą dozwolonych przejść, szybkie kroki na karcie. Nie zmienia modelu:
   każdy ruch idzie przez actions.moveTask (przejścia i powód zwrotu pilnuje Tasks). */
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
  var F = E.Format;

  var COLUMNS = E.Board.COLUMNS;

  var STEPS = E.Board.STEPS;
  var cards = E.Board.cards;

  function card(project, entry, ctx, now) {
    var task = entry.task;
    var stage = entry.stage;
    var act = ctx.actions;
    var info = Tasks.deadlineInfo(task, now);
    var assigned = (task.assignees || []).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
    var logged = act.taskMinutes ? act.taskMinutes(task.id) : 0;
    var late = info.tone === 'overdue';

    var more = UI.iconButton({ icon: 'more', label: 'Przenieś lub edytuj: ' + task.name, size: 'sm', class: 'kb-card__more', attrs: { 'data-fk': 'kb-more-' + task.id } });
    Menu.bind(more, function () {
      var next = Tasks.nextStatuses(task.status);
      return {
        label: 'Działania zadania', align: 'end',
        items: [{ type: 'label', label: 'Przenieś do' }].concat(next.map(function (key) {
          return { label: Tasks.TASK_STATUS[key], value: key, leading: UI.statusGlyph('task', key), hint: key === 'changes' ? 'wymaga powodu' : '', onSelect: function () { act.moveTask(project.id, stage.id, task.id, key); } };
        })).concat([
          { type: 'separator' },
          { label: 'Szczegóły', icon: 'inspector', onSelect: function () { act.inspect({ kind: 'task', projectId: project.id, stageId: stage.id, taskId: task.id }); } },
          { label: 'Edytuj zadanie', icon: 'edit', onSelect: function () { act.editTask(project.id, stage.id, task.id); } }
        ])
      };
    });

    var el = D.el('article', {
      class: 'kb-card kb-card--' + task.status + (late ? ' is-late' : ''),
      attrs: { draggable: 'true' },
      dataset: { taskId: task.id, stageId: stage.id, status: task.status }
    }, [
      D.el('div', { class: 'kb-card__top' }, [
        D.el('span', { class: 'kb-chip', attrs: { 'data-tooltip': E.Model.describeStage(stage).name } }, [
          D.el('span', { class: 't-num', text: String(entry.stageIndex + 1) }),
          D.el('span', { class: 'truncate', text: E.Model.describeStage(stage).name })
        ]),
        more
      ]),
      D.el('button', {
        class: 'kb-card__name', text: task.name,
        attrs: { type: 'button', 'data-fk': 'kb-name-' + task.id },
        on: { click: function () { act.inspect({ kind: 'task', projectId: project.id, stageId: stage.id, taskId: task.id }); } }
      }),
      task.status === 'changes' && task.feedback ? D.el('p', { class: 'kb-card__feedback' }, [Icons.icon('alert', 14), D.el('span', { text: task.feedback })]) : null,
      D.el('div', { class: 'kb-card__meta' }, [
        assigned.length ? Avatar.avatarStack(assigned, { max: 3, size: 'xs' }) : D.el('span', { class: 't-muted', text: 'Bez realizatora' }),
        D.el('span', { class: 'kb-card__load', text: Tasks.WORKLOAD[task.workload] || '', attrs: { 'data-tooltip': 'Nakład pracy' } }),
        logged > 0 ? D.el('span', { class: 't-num t-muted', text: E.TimeLog.duration(logged) }) : null
      ]),
      D.el('div', { class: 'kb-card__foot' }, [
        task.deadline
          ? D.el('span', { class: 'kb-due' + (late ? ' is-overdue' : (info.tone === 'urgent' ? ' is-urgent' : '')), attrs: { 'data-tooltip': 'Termin: ' + F.dateLong(task.deadline.slice(0, 10)) } }, [
              D.el('span', { class: 't-num', text: F.dateTime(task.deadline) }),
              task.status === 'done' ? null : D.el('span', { class: 'kb-due__rel', text: info.text })
            ])
          : D.el('span', { class: 't-muted', text: 'Bez terminu' })
      ]),
      STEPS[task.status].length ? D.el('div', { class: 'kb-card__steps' }, STEPS[task.status].map(function (step) {
        return D.el('button', {
          class: 'kb-step' + (step.to === 'done' ? ' kb-step--done' : ''), text: step.label,
          attrs: { type: 'button', 'data-fk': 'kb-step-' + step.to + '-' + task.id },
          on: { click: function () { act.moveTask(project.id, stage.id, task.id, step.to); } }
        });
      })) : null
    ]);

    el.addEventListener('dragstart', function (event) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ s: stage.id, t: task.id, from: task.status }));
      el.classList.add('is-dragging');
      var board = el.closest('.kb');
      if (board) {
        board.classList.add('is-dragging');
        Array.prototype.forEach.call(board.querySelectorAll('.kb-col'), function (col) {
          var to = col.dataset.status;
          col.classList.toggle('is-allowed', E.Board.canDrop(task.status, to));
        });
      }
    });
    el.addEventListener('dragend', function () {
      el.classList.remove('is-dragging');
      var board = el.closest('.kb');
      if (board) {
        board.classList.remove('is-dragging');
        Array.prototype.forEach.call(board.querySelectorAll('.kb-col'), function (col) { col.classList.remove('is-allowed', 'is-over'); });
      }
    });
    return el;
  }

  function board(project, ctx) {
    var now = new Date();
    var filters = ctx.state.kanban || {};
    var me = ctx.state.prefs.me;
    var list = cards(project, filters, me, now);
    var grouped = filters.group === 'stage';
    var act = ctx.actions;

    var columns = COLUMNS.map(function (status) {
      var items = list.filter(function (e) { return e.task.status === status; });
      if (grouped) items.sort(function (a, b) { return a.stageIndex - b.stageIndex; });
      var body = [];
      var lastStage = null;
      items.forEach(function (entry) {
        if (grouped && entry.stage.id !== lastStage) {
          lastStage = entry.stage.id;
          body.push(D.el('h4', { class: 'kb-sub' }, [D.el('span', { class: 't-num', text: String(entry.stageIndex + 1) }), D.el('span', { class: 'truncate', text: E.Model.describeStage(entry.stage).name })]));
        }
        body.push(card(project, entry, ctx, now));
      });
      if (!items.length) body.push(D.el('p', { class: 'kb-col__empty', text: status === 'done' ? 'Nic nie zakończono w ostatnich 30 dniach.' : 'Brak zadań' }));
      var placeholder = D.el('div', { class: 'kb-drop', text: 'Upuść tutaj', attrs: { 'aria-hidden': 'true' } });

      var col = D.el('section', { class: 'kb-col kb-col--' + status, dataset: { status: status }, attrs: { 'aria-label': Tasks.TASK_STATUS[status] + ': ' + items.length } }, [
        D.el('header', { class: 'kb-col__head' }, [
          UI.statusGlyph('task', status),
          D.el('h3', { class: 'kb-col__title', text: Tasks.TASK_STATUS[status] }),
          D.el('span', { class: 'kb-col__n t-num', text: String(items.length) })
        ]),
        D.el('div', { class: 'kb-col__body' }, body.concat([placeholder]))
      ]);

      col.addEventListener('dragover', function (event) {
        if (!col.classList.contains('is-allowed')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        col.classList.add('is-over');
      });
      col.addEventListener('dragleave', function (event) {
        if (!col.contains(event.relatedTarget)) col.classList.remove('is-over');
      });
      col.addEventListener('drop', function (event) {
        event.preventDefault();
        col.classList.remove('is-over');
        var data;
        try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (e) { return; }
        if (!data || data.from === status) return;
        if (!E.Board.canDrop(data.from, status)) return;
        act.moveTask(project.id, data.s, data.t, status);
      });
      return col;
    });

    return D.el('div', { class: 'kb', attrs: { 'data-fk': 'kanban' } }, columns);
  }

  function toolbar(project, ctx) {
    var act = ctx.actions;
    var f = ctx.state.kanban || {};
    var hasMe = !!ctx.state.prefs.me;
    var stageSelect = UI.select({
      id: 'kb-stage', value: f.stage || 'all',
      attrs: { 'aria-label': 'Etap' },
      options: [{ value: 'all', label: 'Wszystkie etapy' }].concat(project.stages.filter(function (s) { return (s.tasks || []).length; }).map(function (s) { return { value: s.id, label: (project.stages.indexOf(s) + 1) + '. ' + E.Model.describeStage(s).name }; })),
      on: { change: function (event) { act.setKanban({ stage: event.target.value }); } }
    });
    var personSelect = UI.select({
      id: 'kb-person', value: f.person || 'all',
      attrs: { 'aria-label': 'Osoba', disabled: f.mine ? 'disabled' : null },
      options: [{ value: 'all', label: 'Wszystkie osoby' }].concat(Team.projectPeople(project.team).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean).map(function (p) { return { value: p.id, label: Team.fullName(p) }; })),
      on: { change: function (event) { act.setKanban({ person: event.target.value }); } }
    });
    var mine = UI.button({
      label: 'Tylko moje', variant: f.mine ? 'secondary' : 'ghost', size: 'sm',
      attrs: { 'aria-pressed': String(!!f.mine), id: 'kb-mine', title: hasMe ? null : 'Wybierz, kim jesteś, w „Moja praca”', disabled: hasMe ? null : 'disabled' },
      onClick: function () { act.setKanban({ mine: !f.mine }); }
    });
    var group = UI.segmented({
      label: 'Grupowanie', value: f.group || 'none',
      items: [{ value: 'none', label: 'Bez grup' }, { value: 'stage', label: 'Etapami' }],
      onChange: function (value) { act.setKanban({ group: value }); }
    });
    return D.el('div', { class: 'kb-toolbar' }, [stageSelect, personSelect, mine, D.el('span', { class: 'toolbar__spacer' }), group.node]);
  }

  root.ETROM.Kanban = { board: board, toolbar: toolbar };
})(typeof globalThis !== 'undefined' ? globalThis : this);
