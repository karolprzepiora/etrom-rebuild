/* ETROM — zamykanie tygodnia czasu pracy i mapa kompletności. Czyste funkcje, bez DOM.
   Zamknięcie: osoba zgłasza tydzień (pon–ndz) do zatwierdzenia. Od zgłoszenia wpisy tygodnia są zablokowane do edycji,
   dopóki tydzień nie zostanie zwrócony do poprawy. Zarząd zamykający własny tydzień zatwierdza go od razu.
   Zatwierdza zarząd albo lider projektu, w którym osoba ma zadania. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Cal = node ? require('./calendar.js') : root.ETROM.Calendar;
  var TS = node ? require('./timesheet.js') : root.ETROM.Timesheet;

  var STATUS = { submitted: 'czeka na zatwierdzenie', approved: 'zatwierdzony', returned: 'zwrócony do poprawy' };

  function mondayOf(iso) {
    var d = Cal.parse(iso);
    return Cal.isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12));
  }
  function idOf(personId, monday) { return personId + ':' + monday; }

  function normalize(raw) {
    var seen = {};
    return (Array.isArray(raw) ? raw : []).filter(function (l) {
      return l && l.personId && /^\d{4}-\d{2}-\d{2}$/.test(l.week) && STATUS[l.status] && !seen[idOf(l.personId, l.week)] && (seen[idOf(l.personId, l.week)] = true);
    }).map(function (l) {
      return { id: idOf(l.personId, l.week), personId: l.personId, week: l.week, status: l.status, at: String(l.at || ''), decidedBy: l.decidedBy || '', decidedAt: String(l.decidedAt || ''), note: String(l.note || '').slice(0, 200) };
    });
  }

  function find(locks, personId, monday) {
    return (locks || []).filter(function (l) { return l.personId === personId && l.week === monday; })[0] || null;
  }

  /** Czy dzień jest zablokowany do edycji (tydzień zgłoszony lub zatwierdzony). */
  function isLocked(locks, personId, dayIso) {
    var l = find(locks, personId, mondayOf(dayIso));
    return !!l && (l.status === 'submitted' || l.status === 'approved');
  }

  function iso(now) { return Cal.isoOf(now); }

  /** Zgłoszenie tygodnia. autoApprove: zarząd zamyka własny tydzień. */
  function submit(locks, personId, dayIso, now, autoApprove) {
    var monday = mondayOf(dayIso);
    if (monday > iso(now)) return { valid: false, error: 'Tydzień jeszcze się nie zaczął.', locks: locks };
    var cur = find(locks, personId, monday);
    if (cur && (cur.status === 'submitted' || cur.status === 'approved')) return { valid: false, error: 'Ten tydzień jest już zamknięty.', locks: locks };
    var rec = { id: idOf(personId, monday), personId: personId, week: monday, status: autoApprove ? 'approved' : 'submitted', at: now.toISOString(), decidedBy: autoApprove ? personId : '', decidedAt: autoApprove ? now.toISOString() : '', note: '' };
    return { valid: true, lock: rec, locks: (locks || []).filter(function (l) { return l.id !== rec.id; }).concat([rec]) };
  }

  /** Decyzja: 'approve' albo 'return' (z notatką). */
  function decide(locks, personId, monday, verdict, by, note, now) {
    var cur = find(locks, personId, monday);
    if (!cur || cur.status !== 'submitted') return { valid: false, error: 'Ten tydzień nie czeka na decyzję.', locks: locks };
    var next = Object.assign({}, cur, { status: verdict === 'approve' ? 'approved' : 'returned', decidedBy: by, decidedAt: now.toISOString(), note: String(note || '').slice(0, 200) });
    return { valid: true, lock: next, locks: locks.map(function (l) { return l.id === cur.id ? next : l; }) };
  }

  /** Cofnięcie zgłoszenia przez osobę (do czasu decyzji) albo ponowne otwarcie przez zatwierdzającego. */
  function reopen(locks, personId, monday) {
    var cur = find(locks, personId, monday);
    if (!cur) return { valid: false, error: 'Tydzień nie jest zamknięty.', locks: locks };
    return { valid: true, locks: locks.filter(function (l) { return l.id !== cur.id; }) };
  }

  /** Czy `byId` może zatwierdzać tydzień osoby (zarząd albo lider projektu z jej zadaniami; nie własny). */
  function canDecide(byId, personId, projects, isManagement) {
    if (!byId || byId === personId) return false;
    if (isManagement) return true;
    return (projects || []).some(function (p) {
      if (!p.team || p.team.leader !== byId) return false;
      return (p.stages || []).some(function (s) { return (s.tasks || []).some(function (t) { return (t.assignees || []).indexOf(personId) >= 0; }); });
    });
  }

  /** Przypomnienia o uzupełnieniu czasu: jedno na osobę i tydzień (ponowne przypomnienie odświeża datę). */
  function normalizeNudges(raw) {
    var seen = {};
    return (Array.isArray(raw) ? raw : []).filter(function (n) {
      return n && n.personId && n.by && /^\d{4}-\d{2}-\d{2}$/.test(n.week) && !seen[idOf(n.personId, n.week)] && (seen[idOf(n.personId, n.week)] = true);
    }).map(function (n) { return { id: idOf(n.personId, n.week), personId: n.personId, week: n.week, by: n.by, at: String(n.at || '') }; }).slice(-200);
  }
  function nudge(nudges, personIds, monday, by, now) {
    var ids = {};
    personIds.forEach(function (id) { ids[id] = true; });
    var kept = (nudges || []).filter(function (n) { return !(n.week === monday && ids[n.personId]); });
    return kept.concat(personIds.map(function (id) { return { id: idOf(id, monday), personId: id, week: monday, by: by, at: now.toISOString() }; }));
  }

  /** Mapa kompletności tygodnia: wiersz na osobę, komórka na dzień roboczy ('ok' | 'warn' | 'bad' | 'off' | 'run'), plus blokada. */
  function completeness(entries, people, mondayIso, now, opts) {
    var o = opts || {};
    var d = Cal.parse(mondayIso);
    var offset = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12) - mondayRef(now)) / (7 * 86400000));
    return (people || []).map(function (p) {
      var sheet = TS.build(entries, p.id, now, { mode: 'week', offset: offset, target: o.target, absences: o.absences || [], trips: o.trips || [] });
      var days = sheet.days.slice(0, 5).map(function (x) { return { key: x.key, state: x.state, minutes: x.minutes, absent: x.absent || '', holiday: !!x.holiday }; });
      var missing = days.filter(function (x) { return x.state === 'bad'; }).length;
      return { personId: p.id, days: days, total: sheet.total, norm: sheet.target, missing: missing, lock: find(o.locks, p.id, mondayIso) };
    });
  }
  function mondayRef(now) {
    var n = now instanceof Date ? now : new Date(now);
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7), 12).getTime();
  }

  var api = { normalizeNudges: normalizeNudges, nudge: nudge, STATUS: STATUS, mondayOf: mondayOf, normalize: normalize, find: find, isLocked: isLocked, submit: submit, decide: decide, reopen: reopen, canDecide: canDecide, completeness: completeness };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.WeekLock = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
