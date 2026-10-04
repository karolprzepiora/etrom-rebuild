/* ETROM — zakładka „Budżet” w projekcie: jedno miejsce do planowania.
   Krok 1: całość budżetu w dniach i rozdział na etapy wg wag.
   Krok 2: w każdym etapie szkice zadań (bez osób i terminów, widoczne tylko dla zarządu i lidera).
   Krok 3: odmrażanie szkicu — osoby, termin i dni z puli etapu.
   Widoczna dla zarządu i lidera projektu (jak Analiza). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var P = E.Planning;
  var Model = E.Model;

  function fmt(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function days(hours) { return fmt(P.toDays(hours)); }
  function parseNum(value) {
    var n = Number(String(value || '').trim().replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }
  function daysInput(id, hours, onCommit, label, extra) {
    var input = UI.input({
      id: id, value: hours > 0 ? days(hours) : '', class: 'bp-days', placeholder: '—',
      attrs: Object.assign({ inputmode: 'decimal', 'aria-label': label, 'data-fk': id }, extra || {}),
      on: { change: function () { onCommit(input.value.trim() === '' ? 0 : parseNum(input.value)); } }
    });
    return input;
  }

  function poolBar(p) {
    var total = Math.max(p.budget, p.reserve + p.scheduled + p.drafts, 1);
    function seg(cls, h, tip) { return h > 0 ? D.el('i', { class: 'bp-seg bp-seg--' + cls, style: { width: (h / total) * 100 + '%' }, attrs: { 'data-tooltip': tip + ': ' + days(h) + ' dni' } }) : null; }
    return D.el('div', { class: 'bp-bar' + (p.over ? ' is-over' : ''), attrs: { role: 'img', 'aria-label': 'Pula etapu: zaplanowane ' + days(p.scheduled) + ', szkice ' + days(p.drafts) + ', rezerwa ' + days(p.reserve) + ', wolne ' + days(Math.max(0, p.free)) + ' dni' } }, [
      seg('sched', p.scheduled, 'Zaplanowane w zadaniach'), seg('draft', p.drafts, 'Szkice zadań'), seg('reserve', p.reserve, 'Rezerwa na uzupełnienia')
    ]);
  }

  function legend(p) {
    function item(cls, label, h, warn) {
      return D.el('span', { class: 'bp-lg' + (warn ? ' is-warn' : '') }, [D.el('i', { class: 'bp-dot bp-dot--' + cls }), D.el('span', { class: 't-num', text: fmt(P.toDays(h)) }), D.el('span', { class: 't-muted', text: ' ' + label })]);
    }
    var out = [item('sched', 'zaplanowane', p.scheduled), item('draft', 'szkice', p.drafts)];
    if (p.reserve > 0) out.push(item('reserve', 'rezerwa (wolne ' + fmt(P.toDays(Math.max(0, p.reserveLeft))) + ')', p.reserve, p.reserveOver));
    out.push(D.el('span', { class: 'bp-lg bp-lg--free' + (p.over ? ' is-warn' : '') }, [
      D.el('span', { class: 't-num', text: (p.over ? '−' : '') + fmt(P.toDays(Math.abs(p.free))) }), D.el('span', { class: 't-muted', text: p.over ? ' ponad pulę' : ' wolne do rozplanowania' })
    ]));
    return D.el('div', { class: 'bp-legend' }, out);
  }

  function taskRow(project, stage, task, ctx) {
    var a = ctx.actions;
    var state = task.fromReserve ? 'z rezerwy' : (task.draft ? 'szkic' : 'zaplanowane');
    var who = (task.assignees || []).length ? ' · ' + task.assignees.map(function (id) { var pe = ctx.people.filter(function (x) { return x.id === id; })[0]; return pe ? E.Team.fullName(pe) : ''; }).filter(Boolean).join(', ') : '';
    var when = task.deadline && !task.draft ? ' · do ' + E.Format.date(task.deadline.slice(0, 10), { year: 'always' }) : '';
    return D.el('li', { class: 'bp-task' + (task.draft ? ' is-draft' : ''), dataset: { taskId: task.id } }, [
      D.el('span', { class: 'bp-task__name' }, [D.el('span', { class: 'truncate', text: task.name }), D.el('span', { class: 'bp-task__meta t-muted', text: state + who + when })]),
      daysInput('bp-th-' + stage.id + '-' + task.id, task.estimate || 0, function (n) {
        if (Number.isNaN(n) || n < 0) { E.Toast.show({ message: 'Podaj liczbę dni, np. 2 lub 0,5.', tone: 'danger' }); return; }
        a.setTaskHours(project.id, stage.id, task.id, P.toHours(n));
      }, 'Dni zadania ' + task.name),
      D.el('span', { class: 'bp-task__unit t-muted', text: 'dni' }),
      D.el('span', { class: 'bp-task__act' }, [
        task.draft ? UI.button({ label: 'Odmroź', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'bp-unfreeze-' + task.id }, onClick: function () { a.editTask(project.id, stage.id, task.id); } })
          : UI.button({ label: 'Edytuj', variant: 'ghost', size: 'sm', onClick: function () { a.editTask(project.id, stage.id, task.id); } }),
        task.draft ? UI.iconButton({ icon: 'trash', label: 'Usuń szkic ' + task.name, size: 'sm', tone: 'danger', onClick: function () { a.removeDraftTask(project.id, stage.id, task.id); } }) : null
      ])
    ]);
  }

  /** Typowe zadania etapu z biblioteki: pojedyncze albo wszystkie naraz. */
  function libraryRow(project, stage, a) {
    var left = E.Library.missing(stage);
    if (!left.length) return null;
    return D.el('div', { class: 'bp-lib' }, [
      D.el('span', { class: 'bp-lib__l t-muted', text: 'Z biblioteki:' }),
      D.el('span', { class: 'bp-lib__chips' }, left.map(function (item) {
        return D.el('button', { class: 'bp-chip', attrs: { type: 'button', 'data-fk': 'bp-lib-' + stage.id + '-' + item.name, 'aria-label': 'Dodaj szkic: ' + item.name }, text: '+ ' + item.name, on: { click: function () { a.addLibraryTasks(project.id, stage.id, [item.name]); } } });
      })),
      left.length > 1 ? UI.button({ label: 'Dodaj wszystkie', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'bp-lib-all-' + stage.id }, onClick: function () { a.addLibraryTasks(project.id, stage.id); } }) : null
    ]);
  }

  function stageBlock(project, stage, index, ctx, totalWeight) {
    var a = ctx.actions;
    var meta = Model.describeStage(stage);
    var p = P.pool(stage);
    var open = !!ctx.state.expandedStages['bp:' + project.id + ':' + stage.id];
    var weightPct = totalWeight > 0 ? Math.round((P.weightOf(stage) / totalWeight) * 100) : 0;
    var locked = stage.locked || stage.status === 'done';
    var tasks = stage.tasks || [];
    var add = UI.input({ id: 'bp-add-' + stage.id, placeholder: 'Dodaj szkic zadania i naciśnij Enter', attrs: { 'aria-label': 'Nowy szkic zadania w etapie ' + meta.name, 'data-fk': 'bp-add-' + stage.id }, on: { keydown: function (e) {
      if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); a.addDraftTask(project.id, stage.id, add.value.trim()); }
    } } });
    var head = D.el('div', { class: 'bp-stage__head' }, [
      D.el('button', { class: 'bp-stage__toggle', attrs: { type: 'button', 'aria-expanded': open ? 'true' : 'false', 'data-fk': 'bp-toggle-' + stage.id }, on: { click: function () { a.toggleBudgetStage(project.id, stage.id); } } }, [
        D.el('span', { class: 't-num t-muted', text: String(index + 1).padStart(2, '0') }),
        D.el('span', { class: 'bp-stage__name truncate', text: meta.name }),
        meta.kind === 'decision' ? D.el('span', { class: 'bp-tag', text: 'postępowanie' }) : null
      ]),
      D.el('span', { class: 'bp-stage__weight t-muted t-num', attrs: { 'data-tooltip': 'Udział w budżecie wg wagi' }, text: weightPct + '%' }),
      daysInput('bp-sd-' + stage.id, stage.hours, function (n) {
        if (!(n > 0)) { E.Toast.show({ message: 'Budżet etapu musi być większy od zera.', tone: 'danger' }); return; }
        a.patchStage(project.id, stage.id, { hours: P.toHours(n), locked: true });
      }, 'Dni budżetu etapu ' + meta.name),
      D.el('span', { class: 't-muted', text: 'dni' }),
      D.el('button', { class: 'bp-lock' + (stage.locked ? ' is-on' : ''), attrs: { type: 'button', 'aria-pressed': stage.locked ? 'true' : 'false', 'data-tooltip': 'Zablokowany etap zachowuje dni przy ponownym rozdziale budżetu', disabled: stage.status === 'done' ? 'disabled' : null }, text: stage.status === 'done' ? 'zakończony' : (stage.locked ? 'zablokowany' : 'blokuj'), on: { click: function () { a.patchStage(project.id, stage.id, { locked: !stage.locked }); } } })
    ]);
    var body = null;
    if (open) {
      var reserveRow = p.reserve > 0 || P.isProcedure(stage) ? D.el('div', { class: 'bp-reserve' }, [
        D.el('span', { class: 'bp-reserve__l', text: 'Rezerwa na uzupełnienia' }),
        daysInput('bp-rs-' + stage.id, p.reserve, function (n) {
          if (Number.isNaN(n) || n < 0) { E.Toast.show({ message: 'Podaj liczbę dni, np. 2.', tone: 'danger' }); return; }
          a.patchStage(project.id, stage.id, { reserve: P.toHours(n) });
        }, 'Rezerwa etapu ' + meta.name),
        D.el('span', { class: 't-muted', text: 'dni · zadanie oznaczone jako „uzupełnienie” zużywa rezerwę, nie pulę' })
      ]) : null;
      body = D.el('div', { class: 'bp-stage__body' }, [
        reserveRow,
        tasks.length ? D.el('ul', { class: 'bp-tasks' }, tasks.map(function (t) { return taskRow(project, stage, t, ctx); })) : D.el('p', { class: 'bp-empty t-muted', text: 'Nie ma jeszcze zadań. Wpisz poniżej, co Twoim zdaniem wystąpi w tym etapie — bez osób i terminów.' }),
        libraryRow(project, stage, a),
        D.el('div', { class: 'bp-add' }, [
          add,
          UI.button({ label: 'Rozdziel wolną pulę po równo', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'bp-fill-' + stage.id, disabled: p.unsized && p.free > 0 ? null : 'disabled' }, onClick: function () { a.fillStageHours(project.id, stage.id); } })
        ])
      ]);
    }
    return D.el('section', { class: 'bp-stage' + (p.over ? ' is-over' : ''), dataset: { stageId: stage.id } }, [head, poolBar(p), legend(p), body]);
  }

  function budgetTab(project, ctx) {
    var a = ctx.actions;
    var total = project.stages.reduce(function (t, s) { return t + (Number(s.hours) || 0); }, 0);
    var sum = P.summary(project);
    var totalWeight = project.stages.reduce(function (t, s) { return t + P.weightOf(s); }, 0);
    var input = UI.input({
      id: 'bp-total', value: fmt(P.toDays(total)), class: 'bp-days bp-days--big',
      attrs: { inputmode: 'decimal', 'aria-label': 'Budżet całego projektu w dniach', 'data-fk': 'bp-total' }
    });
    var distribute = UI.button({ label: 'Rozdziel według wag', variant: 'primary', icon: 'check', attrs: { 'data-fk': 'bp-distribute' }, onClick: function () {
      var n = parseNum(input.value);
      if (!(n > 0)) { E.Toast.show({ message: 'Podaj budżet projektu w dniach, np. 125.', tone: 'danger' }); return; }
      a.distributeBudget(project.id, P.toHours(n));
    } });
    var dayH = P.getRules().dayHours;
    var drafts = project.stages.reduce(function (t, s) { return t + (s.tasks || []).filter(function (x) { return x.draft; }).length; }, 0);
    var libAll = UI.button({ label: 'Wstaw typowe szkice do wszystkich etapów', variant: 'secondary', icon: 'plus', attrs: { 'data-fk': 'bp-lib-project' }, onClick: function () { a.addLibraryTasks(project.id, null); } });
    var steps = D.el('ol', { class: 'bp-steps' }, [
      ['1', 'Budżet', 'wpisz dni i rozdziel na etapy'],
      ['2', 'Szkice', 'dopisz zadania do etapów, bez osób i terminów'],
      ['3', 'Odmrożenie', 'gdy projekt rusza: osoby, termin, dni z puli']
    ].map(function (s) { return D.el('li', { class: 'bp-step' }, [D.el('b', { class: 'bp-step__n', text: s[0] }), D.el('span', null, [D.el('b', { text: s[1] + ' ' }), D.el('span', { class: 't-muted', text: s[2] })])]); }));
    return D.el('section', { class: 'section bp' }, [
      D.el('div', { class: 'an-card bp-head' }, [
        D.el('div', { class: 'bp-head__main' }, [
          D.el('label', { class: 'bp-head__label', attrs: { for: 'bp-total' }, text: 'Budżet projektu' }),
          D.el('div', { class: 'bp-head__row' }, [input, D.el('span', { class: 'bp-head__unit', text: 'dni roboczych' }), distribute]),
          D.el('div', { class: 'bp-head__lib' }, [libAll]),
          D.el('p', { class: 't-meta', text: '= ' + fmt(total) + ' h · dzień = ' + fmt(dayH) + ' h (zmienisz w Ustawieniach: Cel dnia) · zablokowane etapy zachowują swoje dni' })
        ]),
        D.el('dl', { class: 'bp-head__stats' }, [
          ['Zaplanowane w zadaniach', sum.plannedPct + '%'],
          ['Szkice do odmrożenia', String(drafts)],
          ['Wolne do rozplanowania', fmt(P.toDays(sum.free)) + ' dni']
        ].map(function (r) { return D.el('div', null, [D.el('dd', { class: 't-num', text: r[1] }), D.el('dt', { class: 't-muted', text: r[0] })]); }))
      ]),
      steps,
      D.el('div', { class: 'bp-stages' }, project.stages.map(function (stage, i) { return stageBlock(project, stage, i, ctx, totalWeight); }))
    ]);
  }

  root.ETROM.BudgetTab = { budgetTab: budgetTab };
})(typeof globalThis !== 'undefined' ? globalThis : this);
