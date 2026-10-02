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
  var Identity = E.Identity;

  function hm(value) {
    var d = value instanceof Date ? value : new Date(value);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

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

  var DAY_TARGET = 480; // minut: cel dnia pracy (8 h)

  /** Czas dnia podzielony na projekty: zamknięte wpisy (base) + chodzący zegar (liveStart). */
  function dayParts(entries, ctx) {
    var by = {};
    var order = [];
    (entries || []).forEach(function (entry) {
      var found = ctx.find(entry);
      var project = found && found.project;
      var key = String(entry.projectId);
      if (!by[key]) {
        by[key] = { key: key, code: project ? project.code : '—', name: project ? project.name : 'Usunięty projekt', hue: Identity.hue(project ? project.code : key), base: 0, liveStart: null };
        order.push(key);
      }
      if (entry.end) by[key].base += TL.minutes(entry);
      else by[key].liveStart = Date.parse(entry.start);
    });
    return order.map(function (k) { return by[k]; }).sort(function (a, b) { return b.base - a.base; });
  }

  function partMinutes(part, nowMs) {
    return part.base + (part.liveStart ? Math.max(0, Math.round((nowMs - part.liveStart) / 60000)) : 0);
  }

  function partsTotal(parts, nowMs) {
    return parts.reduce(function (sum, part) { return sum + partMinutes(part, nowMs); }, 0);
  }

  function partsTooltip(parts, nowMs) {
    var total = partsTotal(parts, nowMs);
    if (!total) return 'Dziś nic nie zapisano';
    return 'Dziś ' + TL.duration(total) + ' z ' + TL.duration(DAY_TARGET) + ': ' + parts.map(function (p) { return p.code + ' ' + TL.duration(partMinutes(p, nowMs)); }).join(' · ');
  }

  /** Pasek: segmenty w barwach projektów, szerokość ∝ minutom względem celu dnia. */
  function meterTrack(parts, nowMs, cls) {
    var total = partsTotal(parts, nowMs);
    var cap = Math.max(DAY_TARGET, total);
    var kids = parts.map(function (part) {
      return D.el('span', {
        class: 'dmseg' + (part.liveStart ? ' is-live' : ''),
        style: { '--seg-h': String(part.hue), '--m': String(partMinutes(part, nowMs)) },
        attrs: Object.assign({ 'data-base': String(part.base), 'data-code': part.code }, part.liveStart ? { 'data-live-start': String(part.liveStart) } : {})
      });
    });
    if (total > DAY_TARGET) kids.push(D.el('span', { class: 'dmgoal', style: { left: (DAY_TARGET / cap * 100) + '%' }, attrs: { 'aria-hidden': 'true' } }));
    return D.el('span', { class: 'dmtrack ' + (cls || ''), style: { '--cap': String(cap) }, attrs: { 'aria-hidden': 'true' } }, kids);
  }

  /** Pasek dnia w górnej belce: rośnie z godzinami i pokazuje, na których projektach był zapis. */
  function dayMeter(entries, ctx) {
    var now = Date.now();
    var parts = dayParts(entries, ctx);
    var total = partsTotal(parts, now);
    return D.el('button', {
      class: 'daymeter' + (total ? '' : ' is-empty'),
      attrs: { type: 'button', 'data-daymeter': '1', 'data-tooltip': partsTooltip(parts, now), 'aria-label': 'Czas zapisany dziś: ' + TL.duration(total) + ' z ' + TL.duration(DAY_TARGET) + '. Otwórz Moją pracę.', 'data-fk': 'daymeter' },
      on: { click: function () { ctx.actions.openMyWork(); } }
    }, [
      D.el('span', { class: 'daymeter__label t-num' }, [
        D.el('span', { class: 'daymeter__total', text: total ? TL.duration(total) : '0 min', attrs: { 'data-dm-total': '1' } }),
        D.el('span', { class: 'daymeter__of', text: ' / ' + Math.round(DAY_TARGET / 60) + ' h' })
      ]),
      meterTrack(parts, now, 'dmtrack--bar')
    ]);
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
      D.el('span', { class: 'timer-pill__since t-num', text: 'od ' + hm(startMs), attrs: { 'data-tooltip': 'Zegar włączony o ' + hm(startMs) } }),
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
        : D.el('span', { class: 'erow__dur t-num', text: TL.minutes(entry) < 1 ? '<1 min' : TL.duration(TL.minutes(entry)) }),
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

  /**
   * Oś dnia: gdzie w ciągu dnia pracowała osoba. Każdy wpis to odcinek
   * w barwie projektu; chodzący zegar rośnie do znacznika „teraz”.
   * Nad osią: pierwszy start i ostatni koniec dnia.
   */
  function dayAxis(entries, ctx, now) {
    var minutesOf = function (value) { var d = new Date(value); return d.getHours() * 60 + d.getMinutes(); };
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var list = (entries || []).slice().sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
    // Oś przybliża faktyczną pracę: od godziny przed pierwszym startem, minimum 6 godzin.
    var from = 8 * 60;
    var to = 14 * 60;
    if (list.length) {
      var lastMin = list.reduce(function (m, e) { return Math.max(m, e.end ? minutesOf(e.end) : nowMin); }, 0);
      from = Math.max(0, Math.floor(minutesOf(list[0].start) / 60) * 60 - 60);
      to = Math.min(24 * 60, Math.max(Math.ceil(lastMin / 60) * 60 + 60, from + 6 * 60));
      from = Math.max(0, Math.min(from, to - 6 * 60));
    }
    var span = to - from;
    var pct = function (m) { return Math.max(0, Math.min(100, (m - from) / span * 100)); };

    var ticks = [];
    for (var h = Math.ceil(from / 60); h * 60 <= to; h += 1) {
      if (span > 8 * 60 && (h - Math.ceil(from / 60)) % 2) continue;
      ticks.push(D.el('span', { class: 'dayaxis__tick t-num', style: { left: pct(h * 60) + '%' }, text: String(h).padStart(2, '0') }));
    }

    var segs = list.map(function (entry) {
      var found = ctx.find(entry);
      var begin = minutesOf(entry.start);
      var finish = entry.end ? minutesOf(entry.end) : nowMin;
      var width = Math.max(0.6, pct(Math.max(finish, begin)) - pct(begin));
      var code = found && found.project ? found.project.code : 'x';
      var name = (found && found.task && found.task.name) || entry.label || 'Zadanie';
      var label = name + ' — ' + (found && found.project ? found.project.code + ', ' : '') + hm(entry.start) + '–' + (entry.end ? hm(entry.end) : 'teraz') + ' (' + TL.duration(TL.minutes(entry)) + ')';
      return D.el('span', {
        class: 'dayaxis__seg' + (entry.end ? '' : ' is-live'),
        style: { left: pct(begin) + '%', width: width + '%', '--seg-h': String(Identity.hue(code)) },
        attrs: { 'data-tooltip': label, role: 'img', 'aria-label': label }
      });
    });

    var showNow = nowMin >= from && nowMin <= to;
    var first = list[0];
    var ended = list.filter(function (e) { return e.end; });
    var last = ended.length ? ended.reduce(function (a, b) { return Date.parse(a.end) > Date.parse(b.end) ? a : b; }) : null;
    var live = list.filter(function (e) { return !e.end; })[0];
    var summary = !first
      ? 'Dziś jeszcze nic nie zapisano.'
      : 'Start dnia ' + hm(first.start) + (live ? ' · zegar chodzi od ' + hm(live.start) : (last ? ' · ostatni zapis zakończony o ' + hm(last.end) : ''));

    return D.el('div', { class: 'dayaxis', attrs: { 'aria-label': 'Oś dnia pracy' } }, [
      D.el('p', { class: 'dayaxis__summary t-num', text: summary }),
      D.el('div', { class: 'dayaxis__track' }, segs.concat(showNow ? [D.el('span', { class: 'dayaxis__now', style: { left: pct(nowMin) + '%' }, attrs: { 'aria-hidden': 'true' } })] : [])),
      D.el('div', { class: 'dayaxis__ticks', attrs: { 'aria-hidden': 'true' } }, ticks)
    ]);
  }

  /** „Wznów ostatnie”: jedno kliknięcie wraca do zadania, przy którym zegar stał. */
  function resumeButton(ctx) {
    var last = ctx.actions.lastTimedTask && ctx.actions.lastTimedTask();
    if (!last) return null;
    var found = ctx.find(last);
    if (ctx.actions.isTiming(last.projectId, last.stageId, last.taskId)) return null;
    var name = (found && found.task && found.task.name) || last.label || 'zadanie';
    return D.el('button', {
      class: 'etoday__resume', attrs: { type: 'button', 'data-fk': 'timer-resume' },
      on: { click: function () { ctx.actions.resumeLast(); } }
    }, [
      E.Icons.icon('play', 14),
      D.el('span', { class: 'truncate', text: 'Wznów: ' + name }),
      D.el('kbd', { class: 'kbd', text: 'T' })
    ]);
  }

  /** Czas dnia na projektach: kropka w barwie projektu, kod, nazwa, czas i udział. */
  function projectShares(parts) {
    var now = Date.now();
    var total = partsTotal(parts, now) || 1;
    return D.el('ul', { class: 'eproj' }, parts.map(function (part) {
      var minutes = partMinutes(part, now);
      return D.el('li', { class: 'eproj__row' }, [
        D.el('span', { class: 'eproj__dot', style: { '--seg-h': String(part.hue) }, attrs: { 'aria-hidden': 'true' } }),
        D.el('span', { class: 'eproj__what' }, [
          D.el('span', { class: 'code', text: part.code }),
          D.el('span', { class: 'eproj__name truncate', text: part.name })
        ]),
        D.el('span', { class: 'eproj__time t-num', text: minutes < 1 ? '<1 min' : TL.duration(minutes) }),
        D.el('span', { class: 'eproj__share', style: { '--seg-h': String(part.hue), '--share': String(Math.round(minutes / total * 100)) + '%' }, attrs: { 'aria-hidden': 'true' } })
      ]);
    }));
  }

  /** Czas zapisany dziś: pasek celu dnia, podział na projekty, oś dnia i wpisy. */
  function todayBlock(entries, ctx) {
    var now = Date.now();
    var parts = dayParts(entries, ctx);
    var total = partsTotal(parts, now);
    var left = Math.max(0, DAY_TARGET - total);
    return D.el('section', { class: 'etoday', attrs: { 'aria-label': 'Czas zapisany dziś' } }, [
      D.el('div', { class: 'etoday__head' }, [
        D.el('h2', { class: 'msec__title', text: 'Dzisiaj' }),
        D.el('span', { class: 'etoday__total t-num', attrs: { 'data-total': '1' } }, [
          D.el('span', { text: total ? TL.duration(total) : '0 min', attrs: { 'data-dm-total': '1' } }),
          D.el('span', { class: 'etoday__goal', text: ' / ' + Math.round(DAY_TARGET / 60) + ' h' })
        ])
      ]),
      meterTrack(parts, now, 'dmtrack--big'),
      D.el('p', { class: 'etoday__hint t-meta', text: total >= DAY_TARGET ? 'Cel dnia osiągnięty' + (total > DAY_TARGET ? ' · +' + TL.duration(total - DAY_TARGET) : '') : (total ? 'Do celu dnia ' + TL.duration(left) : 'Cel dnia: ' + Math.round(DAY_TARGET / 60) + ' h') }),
      parts.length ? projectShares(parts) : null,
      dayAxis(entries, ctx, new Date()),
      resumeButton(ctx),
      entries.length
        ? D.el('details', { class: 'etoday__log', attrs: entries.length <= 4 ? { open: 'open' } : {} }, [
            D.el('summary', { class: 'etoday__logsum', text: 'Wpisy (' + entries.length + ')' }),
            D.el('ul', { class: 'erows' }, entries.map(function (entry) { return entryRow(entry, ctx); }))
          ])
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

  /** Rośnie segment chodzącego zegara, suma i podpowiedź — bez przerysowania. */
  function refreshMeter(host, nowMs) {
    var segs = host.querySelectorAll('.dmseg');
    if (!segs.length) return;
    var live = false;
    var total = 0;
    var tips = [];
    for (var i = 0; i < segs.length; i += 1) {
      var base = Number(segs[i].getAttribute('data-base')) || 0;
      var liveStart = Number(segs[i].getAttribute('data-live-start')) || 0;
      var minutes = base + (liveStart ? Math.max(0, Math.round((nowMs - liveStart) / 60000)) : 0);
      if (liveStart) live = true;
      segs[i].style.setProperty('--m', String(minutes));
      total += minutes;
      tips.push(segs[i].getAttribute('data-code') + ' ' + TL.duration(minutes));
    }
    if (!live) return;
    var track = host.querySelector('.dmtrack');
    if (track) track.style.setProperty('--cap', String(Math.max(DAY_TARGET, total)));
    var label = host.querySelector('[data-dm-total]');
    if (label) label.textContent = TL.duration(total);
    if (host.classList.contains('daymeter')) host.setAttribute('data-tooltip', 'Dziś ' + TL.duration(total) + ' z ' + TL.duration(DAY_TARGET) + ': ' + tips.join(' · '));
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
    var meters = document.querySelectorAll('.daymeter');
    for (var m = 0; m < meters.length; m += 1) refreshMeter(meters[m], now);
    var bigs = document.querySelectorAll('.etoday');
    for (var b = 0; b < bigs.length; b += 1) refreshMeter(bigs[b], now);
  }

  E.Timer = { dayMeter: dayMeter, hm: hm, timerButton: timerButton, pill: pill, todayBlock: todayBlock, timeForm: timeForm, tick: tick };
})(typeof globalThis !== 'undefined' ? globalThis : this);
