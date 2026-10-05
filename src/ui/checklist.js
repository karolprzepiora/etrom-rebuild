/* ETROM — lista punktów przy zadaniu (wspólna dla realizatorów).
   Zwinięty wiersz: kropki postępu + kółka z inicjałami autorów. Rozwinięcie w miejscu:
   punkty z kółkiem autora, filtr „Wszystkie / Moje”, dopisywanie Enterem. Lista nie zmienia
   statusu, godzin ani terminu zadania. Dane: task.checklist (core/tasks.js). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Tasks = E.Tasks;

  var opened = {};   // taskId -> true (stan rozwinięcia przeżywa przerysowanie)
  var filters = {};  // taskId -> 'all' | 'mine'

  function person(ctx, id) {
    return (ctx.people || []).filter(function (p) { return p.id === id; })[0] || null;
  }

  function avatarOf(ctx, id, size) {
    var p = person(ctx, id);
    return p ? E.Avatar.avatar(p, { size: size || 'sm' }) : D.el('span', { class: 'avatar avatar--' + (size || 'sm') + ' avatar--rest', text: '?' });
  }

  /** Ile kropek rysujemy; dłuższe listy dostają licznik. */
  var MAX_DOTS = 8;

  function indicator(task, onToggle, ctx) {
    var list = Tasks.checklistOf(task);
    var stats = Tasks.checklistStats(task);
    var open = !!opened[task.id];
    if (!list.length) {
      return D.el('button', {
        class: 'chk-ind chk-ind--empty', attrs: { type: 'button', 'aria-expanded': String(open), 'aria-label': 'Dodaj listę punktów do zadania ' + task.name, 'data-tooltip': 'Moja lista punktów', 'data-fk': 'chk-open-' + task.id },
        on: { click: onToggle }
      }, [D.el('span', { class: 'chk-ind__plus', text: '+' }), D.el('span', { text: 'lista' })]);
    }
    var authors = [];
    list.forEach(function (p) { if (p.by && authors.indexOf(p.by) < 0) authors.push(p.by); });
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
    var filter = filters[task.id] || 'all';
    var multi = (task.assignees || []).length > 1;
    var shown = filter === 'mine' ? list.filter(function (p) { return p.by === ctx.meId; }) : list;
    var canEdit = (task.assignees || []).indexOf(ctx.meId) >= 0;

    function input() {
      var field = D.el('input', {
        class: 'chk__input', attrs: { type: 'text', maxlength: String(Tasks.CHECK_LIMITS.text), placeholder: 'Dodaj punkt… (Enter)', 'aria-label': 'Nowy punkt listy', 'data-fk': 'chk-input-' + task.id },
        on: { keydown: function (e) {
          if (e.key !== 'Enter' || e.isComposing) return;
          e.preventDefault();
          var value = field.value.trim();
          if (!value) return;
          field.value = '';
          ctx.actions.addPoint(ref.projectId, ref.stageId, task.id, value);
        } }
      });
      return D.el('div', { class: 'chk__add' }, [D.el('span', { class: 'chk__plus', attrs: { 'aria-hidden': 'true' }, text: '+' }), field, avatarOf(ctx, ctx.meId, 'xs')]);
    }

    var head = D.el('div', { class: 'chk__head' }, [
      D.el('span', { class: 'chk__title', text: multi ? 'Lista zespołu' : 'Moja lista' }),
      D.el('span', { class: 'chk__spacer' }),
      multi ? D.el('span', { class: 'chk__seg', attrs: { role: 'group', 'aria-label': 'Filtr listy' } }, [['all', 'Wszystkie'], ['mine', 'Moje']].map(function (o) {
        return D.el('button', {
          class: 'chk__segbtn' + (filter === o[0] ? ' is-on' : ''), attrs: { type: 'button', 'aria-pressed': String(filter === o[0]), 'data-fk': 'chk-filter-' + o[0] + '-' + task.id }, text: o[1],
          on: { click: function () { filters[task.id] = o[0]; var fresh = panel(task, ref, ctx); var cur = root.document.querySelector('[data-checklist-for="' + task.id + '"]'); if (cur) cur.replaceWith(fresh); } }
        });
      })) : null
    ]);

    var items = shown.map(function (p) {
      return D.el('li', { class: 'chk__item' + (p.done ? ' is-done' : ''), dataset: { pointId: p.id } }, [
        D.el('button', {
          class: 'chk__box', attrs: { type: 'button', role: 'checkbox', 'aria-checked': String(p.done), 'aria-label': p.text, 'data-fk': 'chk-box-' + p.id, disabled: canEdit ? null : 'true' },
          on: { click: function () { ctx.actions.togglePoint(ref.projectId, ref.stageId, task.id, p.id); } }
        }),
        D.el('span', { class: 'chk__text', text: p.text }),
        canEdit ? D.el('button', { class: 'chk__del', attrs: { type: 'button', 'aria-label': 'Usuń punkt: ' + p.text, 'data-tooltip': 'Usuń punkt', 'data-fk': 'chk-del-' + p.id }, text: '×', on: { click: function () { ctx.actions.removePoint(ref.projectId, ref.stageId, task.id, p.id); } } }) : null,
        p.by ? D.el('span', { class: 'chk__by', attrs: { 'data-tooltip': (person(ctx, p.by) ? E.Team.fullName(person(ctx, p.by)) : '') + (p.done && p.doneBy && p.doneBy !== p.by ? ' · odhaczył(a): ' + (person(ctx, p.doneBy) ? E.Team.fullName(person(ctx, p.doneBy)) : '') : '') } }, [avatarOf(ctx, p.by, 'xs')]) : null
      ]);
    });

    return D.el('div', { class: 'chk', dataset: { checklistFor: task.id } }, [
      head,
      items.length ? D.el('ul', { class: 'chk__list' }, items) : (filter === 'mine' && list.length ? D.el('p', { class: 'chk__empty', text: 'Nie dodałeś(-aś) jeszcze punktów.' }) : null),
      canEdit ? input() : null
    ]);
  }

  function isOpen(taskId) { return !!opened[taskId]; }
  function toggle(taskId) { opened[taskId] = !opened[taskId]; if (!opened[taskId]) delete opened[taskId]; return !!opened[taskId]; }

  E.Checklist = { indicator: indicator, panel: panel, isOpen: isOpen, toggle: toggle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
