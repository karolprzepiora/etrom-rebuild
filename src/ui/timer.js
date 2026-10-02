/* ETROM — zegar rejestracji czasu pracy.
   Przycisk start/stop przy zadaniu, pływający zegar w pasku górnym (widoczny
   na każdym ekranie), lista czasu zapisanego dziś i formularz wpisu.
   Czas ticka bez przerysowania aplikacji: elementy z `data-timer-start`
   odświeża jeden licznik co sekundę. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Icons = E.Icons;
  var TL = E.TimeLog;
  var Team = E.Team;
  var F = E.Format;

  /** Przycisk start/stop w wierszu zadania. */
  function timerButton(project, stage, task, actions) {
    var on = actions.isTiming(project.id, stage.id, task.id);
    var done = task.status === 'done';
    var label = on ? 'Zatrzymaj zegar: ' + task.name : 'Włącz zegar: ' + task.name;
    return UI.iconButton({
      icon: on ? 'stop' : 'play', label: label, size: 'sm', disabled: done && !on,
      tooltip: done && !on ? 'Zadanie jest zakończone' : (on ? 'Zatrzymaj zegar' : 'Włącz zegar'),
      class: 'timer-btn' + (on ? ' is-running' : ''),
      attrs: { 'data-fk': 'timer-' + task.id, 'aria-pressed': on ? 'true' : 'false' },
      onClick: function () { actions.toggleTimer(project.id, stage.id, task.id); }
    });
  }

  /** Pływający zegar w pasku górnym; null, gdy nic nie chodzi. */
  function pill(entry, ctx) {
    if (!entry) return null;
    var found = ctx.find(entry);
    var forgotten = TL.isForgotten(entry);
    var startMs = Date.parse(entry.start);
    var name = (found && found.task && found.task.name) || entry.label || 'Zadanie';
    var code = (found && found.project && found.project.code) || '';
    return D.el('div', { class: 'timer-pill' + (forgotten ? ' is-forgotten' : ''), attrs: { role: 'group', 'aria-label': 'Zegar pracy' } }, [
      D.el('span', { class: 'timer-pill__dot', attrs: { 'aria-hidden': 'true' } }),
      D.el('time', {
        class: 'timer-pill__time t-num', text: TL.clock(Date.now() - startMs),
        attrs: { 'data-timer-start': String(startMs), 'aria-hidden': 'true' }
      }),
      D.el('button', {
        class: 'timer-pill__what',
        attrs: { type: 'button', 'data-tooltip': 'Pokaż zadanie', 'data-fk': 'timer-open' },
        on: { click: function () { if (found) ctx.actions.inspect({ kind: 'task', projectId: found.project.id, stageId: found.stage.id, taskId: found.task.id }); } }
      }, [
        code ? D.el('span', { class: 'code', text: code }) : null,
        D.el('span', { class: 'truncate', text: name })
      ]),
      UI.iconButton({
        icon: 'stop', label: 'Zatrzymaj zegar', size: 'sm', class: 'timer-pill__stop', attrs: { 'data-fk': 'timer-stop' },
        onClick: function () { ctx.actions.stopTimer(); }
      })
    ]);
  }

  /** Jeden wpis na liście czasu. */
  function entryRow(entry, ctx) {
    var found = ctx.find(entry);
    var live = !entry.end;
    var start = new Date(entry.start);
    var end = entry.end ? new Date(entry.end) : null;
    var hm = function (d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    var name = (found && found.task && found.task.name) || entry.label || 'Usunięte zadanie';
    var project = found && found.project;
    var more = live ? null : UI.iconButton({ icon: 'more', label: 'Działania wpisu: ' + name, size: 'sm', class: 'row-actions', attrs: { 'data-fk': 'entry-more-' + entry.id } });
    if (more) {
      Menu.bind(more, function () {
        return {
          label: 'Działania wpisu', align: 'end',
          items: [
            { label: 'Zmień godziny i notatkę', icon: 'edit', onSelect: function () { ctx.actions.editEntry(entry.id); } },
            { type: 'separator' },
            { label: 'Usuń wpis', icon: 'trash', tone: 'danger', onSelect: function () { ctx.actions.deleteEntry(entry.id); } }
          ]
        };
      });
    }
    return D.el('li', { class: 'erow' + (live ? ' erow--live' : ''), dataset: { entryId: entry.id } }, [
      live
        ? D.el('span', { class: 'erow__dur t-num', attrs: { 'data-timer-start': String(start.getTime()), 'data-timer-short': '1' }, text: TL.duration(TL.minutes(entry)) })
        : D.el('span', { class: 'erow__dur t-num', text: TL.duration(TL.minutes(entry)) }),
      D.el('span', { class: 'erow__what' }, [
        D.el('span', { class: 'erow__name truncate', text: name }),
        D.el('span', { class: 'erow__meta truncate' }, [
          project ? D.el('span', { class: 'code', text: project.code }) : null,
          D.el('span', { class: 't-num', text: entry.source === 'manual' ? 'ręcznie' : hm(start) + '–' + (end ? hm(end) : 'teraz') }),
          entry.note ? D.el('span', { class: 'truncate', text: entry.note }) : null
        ])
      ]),
      more
    ]);
  }

  /** Czas zapisany dziś: suma i lista wpisów. */
  function todayBlock(entries, ctx) {
    var total = TL.sum(entries);
    return D.el('section', { class: 'etoday', attrs: { 'aria-label': 'Czas zapisany dziś' } }, [
      D.el('div', { class: 'etoday__head' }, [
        D.el('h2', { class: 'msec__title', text: 'Zapisany czas dziś' }),
        D.el('span', { class: 'etoday__total t-num', text: total ? TL.duration(total) : '0 min', attrs: { 'data-total': '1' } })
      ]),
      entries.length
        ? D.el('ul', { class: 'erows' }, entries.map(function (entry) { return entryRow(entry, ctx); }))
        : D.el('p', { class: 'maside__empty', text: 'Włącz zegar przy zadaniu (▶) albo dopisz czas ręcznie z menu zadania.' })
    ]);
  }

  /**
   * Formularz czasu w panelu bocznym.
   * @param {{mode: 'manual'|'edit'|'stop', draft: Object, errors: Object, title: string}} spec
   */
  function timeForm(spec, handlers) {
    var d = spec.draft || {};
    var errors = spec.errors || {};
    var manual = spec.mode === 'manual';
    var date = manual ? UI.input({ id: 'tm-date', type: 'date', value: d.date, error: errors.date }) : null;
    var hours = UI.input({
      id: 'tm-hours', value: d.hours, error: errors.hours, placeholder: 'np. 1,5',
      attrs: { inputmode: 'decimal', autocomplete: 'off' }
    });
    var note = UI.textarea({ id: 'tm-note', value: d.note, placeholder: 'Co zostało zrobione (nieobowiązkowe)', attrs: { maxlength: '300' } });
    return E.Dialog.drawerForm({
      id: 'time-form',
      submitLabel: spec.mode === 'stop' ? 'Zakończ i zapisz' : (spec.mode === 'edit' ? 'Zapisz zmiany' : 'Dodaj wpis'),
      onCancel: handlers.onCancel,
      onSubmit: function () { handlers.onSubmit({ date: date ? date.value : undefined, hours: hours.value, note: note.value }); },
      body: [
        spec.hint ? UI.alert({ tone: 'warning', text: spec.hint }) : null,
        manual ? UI.field({ id: 'tm-date', label: 'Dzień', required: true, control: date, error: errors.date }) : null,
        UI.field({ id: 'tm-hours', label: 'Godziny', required: true, control: hours, error: errors.hours, hint: 'Liczba z przecinkiem: 1,5 to godzina i pół.' }),
        UI.field({ id: 'tm-note', label: 'Notatka', optional: true, control: note, error: errors.note })
      ]
    });
  }

  /** Jedno odświeżenie wszystkich żywych liczników na stronie. */
  function tick() {
    var nodes = document.querySelectorAll('[data-timer-start]');
    var now = Date.now();
    for (var i = 0; i < nodes.length; i += 1) {
      var start = Number(nodes[i].getAttribute('data-timer-start'));
      if (!Number.isFinite(start)) continue;
      nodes[i].textContent = nodes[i].hasAttribute('data-timer-short') ? TL.duration((now - start) / 60000) : TL.clock(now - start);
    }
  }

  E.Timer = { timerButton: timerButton, pill: pill, todayBlock: todayBlock, timeForm: timeForm, tick: tick };
})(typeof globalThis !== 'undefined' ? globalThis : this);
