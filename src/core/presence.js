/* ETROM — „kto gdzie jest”: status każdej osoby na wybrany dzień i tydzień (pn–pt) z nieobecności, wniosków i wyjazdów.
   Czyste funkcje, bez DOM. Wszyscy widzą wszystko; zwolnienie lekarskie innych osób jest pokazane jako „Nieobecny/a”
   (Absences.peek). Wnioski czekające na decyzję nie zmieniają statusu dnia – pokazują się osobno. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Absences = node ? require('./absences.js') : root.ETROM.Absences;
  var Calendar = node ? require('./calendar.js') : root.ETROM.Calendar;
  var Team = node ? require('./team.js') : root.ETROM.Team;

  var LABEL = { ok: 'Dostępny', leave: 'Urlop', field: 'W terenie', meeting: 'Spotkanie', away: 'Nieobecny', off: 'Dzień wolny' };
  var ABSENCE = { leave: 'Urlop', sick: 'Zwolnienie', training: 'Szkolenie', other: 'Nieobecność' };
  var ORDER = ['field', 'meeting', 'leave', 'away', 'ok'];

  function female(person) { return !!(person && /a$/i.test(String(person.firstName || ''))); }
  function word(kind, person) {
    if (kind === 'ok') return female(person) ? 'Dostępna' : 'Dostępny';
    if (kind === 'away') return female(person) ? 'Nieobecna' : 'Nieobecny';
    return LABEL[kind];
  }

  /** Status osoby w jednym dniu: { kind, label, sub, pending }. kind: ok | leave | field | meeting | away | off. */
  function dayStatus(person, key, ctx) {
    var offDay = Calendar.isWeekend(key) || Calendar.isHoliday(key);
    var pending = null;
    var res = null;
    (ctx.absences || []).forEach(function (a) {
      if (a.personId !== person.id || a.from > key || a.to < key) return;
      var seen = Absences.peek(ctx.viewerId, a, ctx.projects, ctx.people);
      if (!seen) return;
      if (a.status === 'pending') { pending = pending || a; return; }
      if (offDay) return;
      var full = seen === 'full';
      var kind = full && a.kind === 'leave' ? 'leave' : 'away';
      res = { kind: kind, label: kind === 'leave' ? (a.onDemand ? 'Urlop na żądanie' : 'Urlop') : (full ? ABSENCE[a.kind] || 'Nieobecność' : word('away', person)), sub: 'do ' + shortDate(a.to), absenceId: a.id };
    });
    (ctx.trips || []).forEach(function (t) {
      if (t.personIds.indexOf(person.id) < 0 || t.from > key || t.to < key) return;
      var kind = t.kind === 'meeting' ? 'meeting' : 'field';
      var cand = { kind: kind, label: LABEL[kind], sub: t.place + (t.to > t.from ? ' · do ' + shortDate(t.to) : ''), tripId: t.id };
      if (!res || ORDER.indexOf(kind) < ORDER.indexOf(res.kind)) res = cand;
    });
    if (!res) res = offDay ? { kind: 'off', label: LABEL.off, sub: Calendar.holidayName(key) || (Calendar.isWeekend(key) ? 'weekend' : '') } : { kind: 'ok', label: word('ok', person), sub: '' };
    res.pending = !!pending;
    if (pending && res.kind === 'ok') res.pendingRange = [pending.from, pending.to];
    return res;
  }

  function shortDate(key) { var d = Calendar.parse(key); return d.getDate() + '.' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1); }

  /**
   * @param {{people: Array, absences: Array, trips: Array, projects: Array, viewerId: string, today: string}} input
   * @returns {{rows: Array, counts: Object}} rows: { person, today: status, week: [{key, label, status}], requests: [absence] }
   */
  function build(input) {
    var ctx = { people: input.people || [], absences: input.absences || [], trips: input.trips || [], projects: input.projects || [], viewerId: input.viewerId };
    var today = input.today;
    var d = Calendar.parse(today);
    var monday = Calendar.addDays(today, -((d.getDay() + 6) % 7));
    var counts = { all: 0, ok: 0, field: 0, meeting: 0, leave: 0, away: 0, off: 0, requests: 0 };
    var rows = ctx.people.filter(function (p) { return p.active !== false; }).map(function (p) {
      var st = dayStatus(p, today, ctx);
      var week = [];
      for (var i = 0; i < 5; i += 1) {
        var key = Calendar.addDays(monday, i);
        week.push({ key: key, status: dayStatus(p, key, ctx) });
      }
      var requests = ctx.absences.filter(function (a) { return a.personId === p.id && a.status === 'pending' && a.to >= today && Absences.peek(ctx.viewerId, a, ctx.projects, ctx.people); });
      counts.all += 1; counts[st.kind] += 1; if (requests.length) counts.requests += 1;
      return { person: p, today: st, week: week, requests: requests };
    });
    return { rows: rows, counts: counts, monday: monday };
  }

  var api = { build: build, dayStatus: dayStatus, LABEL: LABEL };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Presence = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
