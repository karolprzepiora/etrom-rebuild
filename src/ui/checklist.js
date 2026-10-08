/* ETROM — lista punktów przy zadaniu (wspólna dla realizatorów).
   Zwinięty wiersz: kropki postępu + kółka z inicjałami autorów. Rozwinięcie w miejscu:
   punkty z kółkiem osoby (wskazanej albo autora), filtr „Wszystkie / Moje”, dopisywanie Enterem.
   Listę prowadzi realizator, zarząd albo lider projektu; ci dwaj mogą wskazać osobę przy punkcie.
   Lista nie zmienia statusu, godzin ani terminu zadania. Dane: task.checklist (core/tasks.js). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Tasks = E.Tasks;

  var opened = {};   // taskId -> true (stan rozwinięcia przeżywa przerysowanie)
  var filters = {};  // taskId -> 'all' | 'mine'
  var targets = {};  // taskId -> osoba, której przypisujemy nowy punkt ('' = zespół)

  /** Kto może zmieniać listę: realizator zadania, zarząd i lider projektu (manage = może wskazywać osoby). */
  function access(task, ref, ctx) {
    var assignee = (task.assignees || []).indexOf(ctx.meId) >= 0;
    var manage = !!(ref && ctx.actions && ctx.actions.canManageList && ctx.actions.canManageList(ref.projectId));
    return { assignee: assignee, manage: manage, edit: assignee || manage };
  }
  function ownerOf(point) { return point.to || point.by || ''; }

  function person(ctx, id) {
    return (ctx.people || []).filter(function (p) { return p.id === id; })[0] || null;
  }

  function avatarOf(ctx, id, size) {
    var p = person(ctx, id);
    return p ? E.Avatar.avatar(p, { size: size || 'sm' }) : D.el('span', { class: 'avatar avatar--' + (size || 'sm') + ' avatar--rest', text: '?' });
  }

  /** Ile kropek rysujemy; dłuższe listy dostają licznik. */
  var MAX_DOTS = 8;

  function indicator(task, onToggle, ctx, ref) {
    var list = Tasks.checklistOf(task);
    var stats = Tasks.checklistStats(task);
    var open = !!opened[task.id];
    if (!list.length && !access(task, ref, ctx).edit) return null;
    if (!list.length) {
      return D.el('button', {
        class: 'chk-ind chk-ind--empty', attrs: { type: 'button', 'aria-expanded': String(open), 'aria-label': 'Dodaj listę punktów do zadania ' + task.name, 'data-tooltip': 'Lista punktów', 'data-fk': 'chk-open-' + task.id },
        on: { click: onToggle }
      }, [D.el('span', { class: 'chk-ind__plus', text: '+' }), D.el('span', { text: 'lista' })]);
    }
    var authors = [];
    list.forEach(function (p) { var o = ownerOf(p); if (o && authors.indexOf(o) < 0) authors.push(o); });
    var dots = list.length <= MAX_DOTS
      ? D.el('span', { class: 'chk-ind__dots', attrs: { 'aria-hidden': 'true' } }, list.map(function (p) { return D.el('i', { class: p.done ? 'is-done' : '' }); }))
      : D.el('span', { class: 'chk-ind__count t-num', text: stats.done + '/' + stats.total });
    return D.el('button', {
      class: 'chk-ind' + (stats.total && stats.done === stats.total ? ' is-all' : ''),
      attrs: { type: 'button', 'aria-expanded': String(open), 'aria-label': 'Lista punktów: ' + stats.done + ' z ' + stats.total + ' gotowe', 'data-fk': 'chk-open-' + task.id },
      on: { click: onToggle }
    }, [dots].concat(authors.length > 1 || (authors.length === 1 && (task.assignees || []).length > 1)
      ? [D.el('span', { class: 'chk-ind__who', attrs: { 'aria-hidden': 'true' } }, authors.slice(0, 3).map(function (id) { return avatarOf(ctx, id, 'xs'); }))]
      : []));
  }

  function panel(task, ref, ctx) {
    var list = Tasks.checklistOf(task);
    var stats = Tasks.checklistStats(task);
    var filter = filters[task.id] || 'all';
    var acc = access(task, ref, ctx);
    var canEdit = acc.edit;
    var owners = [];
    list.forEach(function (p) { var o = ownerOf(p); if (o && owners.indexOf(o) < 0) owners.push(o); });
    var multi = canEdit && (owners.length > 1 || (task.assignees || []).length > 1 || acc.manage);
    var shown = filter === 'mine' ? list.filter(function (p) { return ownerOf(p) === ctx.meId; }) : list;
    var target = Object.prototype.hasOwnProperty.call(targets, task.id) ? targets[task.id] : (acc.assignee ? ctx.meId : '');

    function redraw() { var fresh = panel(task, ref, ctx); var cur = root.document.querySelector('[data-checklist-for="' + task.id + '"]'); if (cur) cur.replaceWith(fresh); }

    /** Wybór osoby (zespół albo jeden z realizatorów); nowy punkt dostaje wskazaną, istniejący zmienia właściciela. */
    function pick(anchor, current, onChoose) {
      var items = [{ type: 'radio', label: 'Cały zespół', checked: !current, onSelect: function () { onChoose(''); } }];
      (task.assignees || []).forEach(function (id) {
        var p = person(ctx, id);
        if (p) items.push({ type: 'radio', label: E.Team.fullName(p), leading: avatarOf(ctx, id, 'xs'), checked: current === id, onSelect: function () { onChoose(id); } });
      });
      E.Menu.open({ anchor: anchor, items: items, label: 'Wskaż osobę', align: 'end' });
    }
    function whoLabel(id) { return id ? (person(ctx, id) ? E.Team.fullName(person(ctx, id)) : '') : 'Cały zespół'; }
    function teamMark() { return D.el('span', { class: 'chk__team', text: 'Z', attrs: { 'aria-hidden': 'true' } }); }

    function input() {
      var field = D.el('input', {
        class: 'chk__input', attrs: { type: 'text', maxlength: String(Tasks.CHECK_LIMITS.text), placeholder: 'Dodaj punkt…', 'aria-label': 'Nowy punkt listy', 'data-fk': 'chk-input-' + task.id },
        on: { keydown: function (e) {
          if (e.key !== 'Enter' || e.isComposing) return;
          e.preventDefault();
          var value = field.value.trim();
          if (!value) return;
          field.value = '';
          ctx.actions.addPoint(ref.projectId, ref.stageId, task.id, value, acc.manage ? target : '');
        } }
      });
      var who = acc.manage
        ? D.el('button', { class: 'chk__who', attrs: { type: 'button', 'aria-label': 'Dla kogo jest punkt: ' + whoLabel(target), 'data-tooltip': 'Dla: ' + whoLabel(target), 'data-fk': 'chk-target-' + task.id },
            on: { click: function (e) { pick(e.currentTarget, target, function (id) { targets[task.id] = id; redraw(); var f = root.document.querySelector('[data-checklist-for="' + task.id + '"] .chk__input'); if (f) f.focus(); }); } } },
            [target ? avatarOf(ctx, target, 'xs') : teamMark()])
        : avatarOf(ctx, ctx.meId, 'xs');
      return D.el('div', { class: 'chk__add' }, [D.el('span', { class: 'chk__plus', attrs: { 'aria-hidden': 'true' }, text: '+' }), field, D.el('kbd', { class: 'chk__enter', text: 'Enter' }), who]);
    }

    var head = D.el('div', { class: 'chk__head' }, [
      D.el('span', { class: 'chk__title', text: (multi || !canEdit ? 'Lista zespołu' : 'Moja lista') + (canEdit ? '' : ' · podgląd') }),
      stats.total ? D.el('span', { class: 'chk__stat t-num', text: stats.done + ' z ' + stats.total }) : null,
      stats.total ? D.el('span', { class: 'chk__bar', attrs: { 'aria-hidden': 'true' } }, [D.el('i', { style: { width: Math.round(stats.done / stats.total * 100) + '%' } })]) : null,
      D.el('span', { class: 'chk__spacer' }),
      multi && list.length ? D.el('span', { class: 'chk__seg', attrs: { role: 'group', 'aria-label': 'Filtr listy' } }, [['all', 'Wszystkie'], ['mine', 'Moje']].map(function (o) {
        return D.el('button', {
          class: 'chk__segbtn' + (filter === o[0] ? ' is-on' : ''), attrs: { type: 'button', 'aria-pressed': String(filter === o[0]), 'data-fk': 'chk-filter-' + o[0] + '-' + task.id }, text: o[1],
          on: { click: function () { filters[task.id] = o[0]; redraw(); } }
        });
      })) : null
    ]);

    var items = shown.map(function (p) {
      var o = ownerOf(p);
      var tip = (p.to ? 'Dla: ' + whoLabel(p.to) : (o ? 'Dodał(a): ' + whoLabel(o) : 'Cały zespół')) + (p.to && p.by && p.by !== p.to ? ' · dodał(a): ' + whoLabel(p.by) : '') + (p.done && p.doneBy && p.doneBy !== o ? ' · odhaczył(a): ' + whoLabel(p.doneBy) : '');
      var mark = o ? avatarOf(ctx, o, 'xs') : teamMark();
      var owner = acc.manage
        ? D.el('button', { class: 'chk__by chk__by--btn', attrs: { type: 'button', 'data-tooltip': tip, 'aria-label': 'Zmień osobę: ' + p.text, 'data-fk': 'chk-assign-' + p.id },
            on: { click: function (e) { pick(e.currentTarget, p.to || '', function (id) { ctx.actions.assignPoint(ref.projectId, ref.stageId, task.id, p.id, id); }); } } }, [mark])
        : D.el('span', { class: 'chk__by', attrs: { 'data-tooltip': tip } }, [mark]);
      return D.el('li', { class: 'chk__item' + (p.done ? ' is-done' : ''), dataset: { pointId: p.id } }, [
        D.el('button', {
          class: 'chk__box', attrs: { type: 'button', role: 'checkbox', 'aria-checked': String(p.done), 'aria-label': p.text, 'data-fk': 'chk-box-' + p.id, disabled: canEdit ? null : 'true' },
          on: { click: function () { ctx.actions.togglePoint(ref.projectId, ref.stageId, task.id, p.id); } }
        }),
        D.el('span', { class: 'chk__text', text: p.text }),
        canEdit ? D.el('button', { class: 'chk__del', attrs: { type: 'button', 'aria-label': 'Usuń punkt: ' + p.text, 'data-tooltip': 'Usuń punkt', 'data-fk': 'chk-del-' + p.id }, text: '×', on: { click: function () { ctx.actions.removePoint(ref.projectId, ref.stageId, task.id, p.id); } } }) : null,
        owner
      ]);
    });

    return D.el('div', { class: 'chk', dataset: { checklistFor: task.id } }, [
      head,
      items.length ? D.el('ul', { class: 'chk__list' }, items) : (filter === 'mine' && list.length ? D.el('p', { class: 'chk__empty', text: 'Nie masz jeszcze punktów.' }) : null),
      canEdit ? input() : null
    ]);
  }

  function isOpen(taskId) { return !!opened[taskId]; }
  function toggle(taskId) { opened[taskId] = !opened[taskId]; if (!opened[taskId]) delete opened[taskId]; return !!opened[taskId]; }

  E.Checklist = { access: access, indicator: indicator, panel: panel, isOpen: isOpen, toggle: toggle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
