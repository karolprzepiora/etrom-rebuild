/* ETROM — karta „Podsumowanie dnia” w Moja praca: godziny względem celu, zadania z dziś i najbliższe terminy.
   Pracownik widzi tu tylko upływ czasu terminów w procentach, bez godzin zaplanowanych na zadania. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var TL = E.TimeLog;

  var VERDICT = {
    ok: 'Cel dnia osiągnięty',
    run: 'Dzień trwa',
    warn: 'Prawie, brakuje do celu',
    bad: 'Poniżej celu dnia'
  };

  function dur(min) { return TL.duration(Math.round(min)); }

  /** @param {Object} summary wynik DaySummary.build @param {{actions: Object}} ctx */
  function card(summary, ctx, opts) {
    var compact = !!(opts && opts.compact);
    var s = summary;
    var line = s.state === 'ok'
      ? (s.minutes > s.target ? 'Cel dnia osiągnięty, +' + dur(s.minutes - s.target) : 'Cel dnia osiągnięty')
      : 'Do celu brakuje ' + dur(s.missing);
    var weekLine = s.week.days ? 'Tydzień: ' + dur(s.week.minutes) + ' z ' + dur(s.week.expected) + ' w rozliczonych dniach' : '';
    return D.el('section', { class: 'dsum is-' + s.state, attrs: { 'aria-label': 'Podsumowanie dnia', 'data-fk': 'day-summary' } }, [
      D.el('div', { class: 'dsum__head' }, [
        D.el('h2', { class: 'msec__title', text: 'Podsumowanie dnia' }),
        D.el('span', { class: 'dsum__pill', text: VERDICT[s.state] })
      ]),
      compact ? null : D.el('p', { class: 'dsum__big t-num' }, [D.el('b', { text: dur(s.minutes) }), D.el('span', { text: ' z ' + dur(s.target) })]),
      compact ? null : D.el('p', { class: 'dsum__line', text: line }),
      weekLine ? D.el('p', { class: 'dsum__week is-' + (s.week.state || 'off'), text: weekLine }) : null,
      s.tasks.length && !compact ? D.el('div', { class: 'dsum__sec' }, [
        D.el('h3', { class: 'dsum__h', text: 'Dziś pracowałeś nad' }),
        D.el('ul', { class: 'dsum__tasks' }, s.tasks.slice(0, 4).map(function (t) {
          return D.el('li', null, [D.el('span', { class: 'dsum__code', style: E.Identity.hueStyle(t.code), text: t.code }), D.el('span', { class: 'dsum__name truncate', text: t.name }), D.el('span', { class: 't-num t-muted', text: dur(t.minutes) })]);
        }))
      ]) : null,
      s.upcoming.length ? D.el('div', { class: 'dsum__sec' }, [
        D.el('h3', { class: 'dsum__h', text: 'Czas ucieka' }),
        D.el('ul', { class: 'dsum__due' }, s.upcoming.map(function (u) {
          var hot = u.overdue || (u.elapsed !== null && u.elapsed >= 75);
          var when = u.overdue ? 'po terminie' : (u.daysLeft <= 0 ? 'termin dziś' : 'zostało ' + u.daysLeft + ' ' + (u.daysLeft === 1 ? 'dzień' : 'dni'));
          return D.el('li', { class: hot ? 'is-hot' : '' }, [
            D.el('button', { class: 'dsum__task', attrs: { type: 'button', 'data-fk': 'dsum-task-' + u.taskId }, on: { click: function () { ctx.actions.inspect({ kind: 'task', projectId: u.projectId, stageId: u.stageId, taskId: u.taskId }); } } }, [
              D.el('span', { class: 'dsum__code', style: E.Identity.hueStyle(u.code), text: u.code }),
              D.el('span', { class: 'dsum__name truncate', text: u.name }),
              D.el('span', { class: 'dsum__when t-num', text: u.elapsed === null ? when : when + ' · ' + u.elapsed + '%' })
            ]),
            u.elapsed !== null ? D.el('i', { class: 'dsum__meter' + (u.overdue ? ' is-late' : (hot ? ' is-hot' : '')), style: { '--p': u.elapsed + '%' }, attrs: { 'aria-hidden': 'true' } }) : null
          ]);
        }))
      ]) : null
    ]);
  }

  E.DaySummary = Object.assign(E.DaySummary || {}, { card: card });
})(typeof globalThis !== 'undefined' ? globalThis : this);
