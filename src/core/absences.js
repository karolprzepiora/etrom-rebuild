/* ETROM — nieobecności osób (urlop, zwolnienie, szkolenie). Czyste funkcje, bez DOM.
   Nieobecność zmniejsza pojemność tygodnia w planie i nie liczy się jako dzień z niedoborem godzin w karcie czasu. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Cal = node ? require('./calendar.js') : root.ETROM.Calendar;
  var Team = node ? require('./team.js') : root.ETROM.Team;

  var KINDS = { leave: 'Urlop', sick: 'Zwolnienie', training: 'Szkolenie', other: 'Inna nieobecność' };
  var STATUS = { pending: 'Oczekuje', approved: 'Zaakceptowany', rejected: 'Odrzucony' };
  var DEFAULT_LEAVE_DAYS = 26;
  var ON_DEMAND_LIMIT = 4;
  var VERDICTS = { ok: 'Bez zastrzeżeń', concern: 'Mam zastrzeżenia' };

  function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00')); }
  function dayOf(iso) { return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))); }
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function str(v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; }
  function stamp(v) { return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : ''; }

  /** Rekordy bez `status` (dawne, dodane przez zarząd) uznajemy za zaakceptowane. */
  function normalize(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).map(function (a) {
      if (!a || typeof a.personId !== 'string' || !isDay(a.from) || !isDay(a.to) || a.to < a.from) return null;
      var id = typeof a.id === 'string' && a.id && !seen[a.id] ? a.id : '';
      var kind = KINDS[a.kind] ? a.kind : 'leave';
      var opinions = (Array.isArray(a.opinions) ? a.opinions : []).filter(function (o) { return o && typeof o.by === 'string' && VERDICTS[o.verdict]; }).slice(0, 8).map(function (o) {
        return { by: o.by, verdict: o.verdict, note: str(o.note, 200), at: stamp(o.at) };
      });
      return {
        id: id, personId: a.personId, from: a.from, to: a.to, kind: kind, note: str(a.note, 200),
        status: STATUS[a.status] ? a.status : 'approved',
        onDemand: kind === 'leave' && a.onDemand === true,
        requestedBy: str(a.requestedBy, 40), requestedAt: stamp(a.requestedAt),
        decidedBy: str(a.decidedBy, 40), decidedAt: stamp(a.decidedAt), decisionNote: str(a.decisionNote, 200),
        opinions: opinions
      };
    }).filter(Boolean).map(function (a, i, all) {
      if (!a.id) { var n = 1; var used = all.map(function (x) { return x.id; }); while (used.indexOf('a-' + n) >= 0) n += 1; a.id = 'a-' + n; }
      seen[a.id] = true;
      return a;
    });
  }

  function validate(data, people) {
    var errors = {};
    var d = data || {};
    if (!d.personId || !(people || []).some(function (p) { return p.id === d.personId; })) errors.personId = 'Wybierz osobę.';
    if (!isDay(d.from)) errors.from = 'Podaj datę początku.';
    if (!isDay(d.to)) errors.to = 'Podaj datę końca.';
    else if (isDay(d.from) && d.to < d.from) errors.to = 'Koniec nie może być przed początkiem.';
    if (!KINDS[d.kind]) errors.kind = 'Wybierz rodzaj nieobecności.';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  /** Dodaje albo zmienia (gdy jest `id`) nieobecność. @returns {{valid, errors, list}} */
  function save(list, data, people) {
    var check = validate(data, people);
    var current = normalize(list);
    if (!check.valid) return { valid: false, errors: check.errors, list: current };
    var existing = data.id ? current.filter(function (a) { return a.id === data.id; })[0] : null;
    var row = Object.assign({}, existing || { status: 'approved' }, { id: data.id || '', personId: data.personId, from: data.from, to: data.to, kind: data.kind, note: data.note || '' });
    if (data.onDemand !== undefined) row.onDemand = data.onDemand === true;
    var next = data.id ? current.map(function (a) { return a.id === data.id ? row : a; }) : current.concat([row]);
    return { valid: true, errors: {}, list: normalize(next) };
  }

  function remove(list, id) { return normalize(list).filter(function (a) { return a.id !== id; }); }

  /** Dni robocze nieobecności osoby: { 'YYYY-MM-DD': rodzaj } (soboty i niedziele pomijane). */
  function daysOf(list, personId) {
    var out = {};
    (list || []).forEach(function (a) {
      if (a.personId !== personId || a.status === 'pending' || a.status === 'rejected') return;
      for (var d = dayOf(a.from); isoOf(d) <= a.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6 && !Cal.isHoliday(isoOf(d))) out[isoOf(d)] = a.kind;
      }
    });
    return out;
  }


  /** Tylko zaakceptowane nieobecności wpływają na plan, kalendarz zespołu i kartę czasu. */
  function approved(list) { return (list || []).filter(function (a) { return a.status !== 'pending' && a.status !== 'rejected'; }); }

  function workdays(a) { return Cal.workdaysIn(a.from, a.to); }

  function clip(a, fromIso, toIso) {
    var from = a.from > fromIso ? a.from : fromIso;
    var to = a.to < toIso ? a.to : toIso;
    return to < from ? null : { from: from, to: to };
  }

  function entitlementOf(person) {
    var n = person && Number(person.leaveDays);
    return Number.isFinite(n) && n > 0 && n <= 60 ? Math.round(n) : DEFAULT_LEAVE_DAYS;
  }

  /**
   * Saldo urlopu osoby w roku `now`. Dni robocze, bez weekendów i świąt.
   * left = wymiar − wykorzystane − zaplanowane (zaakceptowane); free uwzględnia też wnioski oczekujące.
   */
  function balance(list, person, now) {
    var ref = now instanceof Date ? now : new Date();
    var year = ref.getFullYear();
    var todayIso = isoOf(ref);
    var first = year + '-01-01';
    var last = year + '-12-31';
    var out = { year: year, total: entitlementOf(person), used: 0, planned: 0, pending: 0, left: 0, free: 0, onDemandUsed: 0, onDemandPending: 0, onDemandLimit: ON_DEMAND_LIMIT, sick: 0, training: 0 };
    (list || []).forEach(function (a) {
      if (!person || a.personId !== person.id || a.status === 'rejected') return;
      var c = clip(a, first, last);
      if (!c) return;
      var n = Cal.workdaysIn(c.from, c.to);
      if (!n) return;
      if (a.status === 'pending') {
        if (a.kind === 'leave') { out.pending += n; if (a.onDemand) out.onDemandPending += n; }
        return;
      }
      if (a.kind === 'sick') { out.sick += n; return; }
      if (a.kind === 'training') { out.training += n; return; }
      if (a.kind !== 'leave') return;
      var past = c.from <= todayIso ? Cal.workdaysIn(c.from, c.to < todayIso ? c.to : todayIso) : 0;
      out.used += past;
      out.planned += n - past;
      if (a.onDemand) out.onDemandUsed += n;
    });
    out.left = out.total - out.used - out.planned;
    out.free = out.left - out.pending;
    return out;
  }

  function overlaps(a, from, to) { return a.from <= to && a.to >= from; }

  /**
   * Nowy wniosek. Składający go zarząd dostaje od razu decyzję „zaakceptowany”; pozostali czekają na zarząd.
   * @returns {{valid, errors, list, absence?}}
   */
  function request(list, data, people, opts) {
    var o = opts || {};
    var now = o.now instanceof Date ? o.now : new Date();
    var current = normalize(list);
    var check = validate(data, people);
    var errors = Object.assign({}, check.errors);
    var d = data || {};
    var person = (people || []).filter(function (p) { return p.id === d.personId; })[0];
    if (check.valid) {
      var n = Cal.workdaysIn(d.from, d.to);
      if (!n) errors.to = 'W tym zakresie nie ma dni roboczych.';
      else if (current.some(function (a) { return a.personId === d.personId && a.status !== 'rejected' && a.id !== d.id && overlaps(a, d.from, d.to); })) errors.from = 'W tym terminie masz już wniosek lub nieobecność.';
      else if (d.kind === 'leave') {
        var bal = balance(current.filter(function (a) { return a.id !== d.id; }), person, new Date(d.from + 'T12:00:00'));
        if (n > bal.free) errors.to = 'Brakuje dni urlopu: do wykorzystania ' + Math.max(0, bal.free) + ', wniosek obejmuje ' + n + '.';
        else if (d.onDemand === true && bal.onDemandUsed + bal.onDemandPending + n > ON_DEMAND_LIMIT) errors.onDemand = 'Limit urlopu na żądanie to ' + ON_DEMAND_LIMIT + ' dni w roku.';
      }
    }
    if (Object.keys(errors).length) return { valid: false, errors: errors, list: current };
    var by = o.by || d.personId;
    var auto = !!o.autoApprove;
    var stampNow = now.toISOString();
    var row = {
      id: '', personId: d.personId, from: d.from, to: d.to, kind: d.kind, note: str(d.note, 200),
      status: auto ? 'approved' : 'pending', onDemand: d.kind === 'leave' && d.onDemand === true,
      requestedBy: by, requestedAt: stampNow, decidedBy: auto ? by : '', decidedAt: auto ? stampNow : '', decisionNote: '', opinions: []
    };
    var next = normalize(current.concat([row]));
    return { valid: true, errors: {}, list: next, absence: next[next.length - 1] };
  }

  /** Decyzja zarządu o oczekującym wniosku. decision: 'approve' | 'reject'. */
  function decide(list, id, decision, by, note, now) {
    var stampNow = (now instanceof Date ? now : new Date()).toISOString();
    return normalize(list).map(function (a) {
      if (a.id !== id || a.status !== 'pending') return a;
      return Object.assign({}, a, { status: decision === 'approve' ? 'approved' : 'rejected', decidedBy: by || '', decidedAt: stampNow, decisionNote: str(note, 200) });
    });
  }

  /** Opinia lidera projektu do oczekującego wniosku (jedna na osobę, nowa zastępuje starą). */
  function addOpinion(list, id, by, verdict, note, now) {
    if (!VERDICTS[verdict]) return normalize(list);
    var stampNow = (now instanceof Date ? now : new Date()).toISOString();
    return normalize(list).map(function (a) {
      if (a.id !== id || a.status !== 'pending') return a;
      var others = a.opinions.filter(function (op) { return op.by !== by; });
      return Object.assign({}, a, { opinions: others.concat([{ by: by, verdict: verdict, note: str(note, 200), at: stampNow }]) });
    });
  }

  function shortDay(iso) { var m = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']; return Number(iso.slice(8)) + ' ' + m[Number(iso.slice(5, 7)) - 1]; }

  /**
   * Wpływ nieobecności na plan: kolidujące terminy zadań osoby i obłożenie zespołów jej projektów.
   * @returns {Array<{tone:'alarm'|'warn'|'ok', text:string}>}
   */
  function impact(absence, ctx) {
    var c = ctx || {};
    var out = [];
    var crowd = [];
    (c.projects || []).forEach(function (p) {
      var roster = Team.projectPeople(p.team || {});
      if (roster.indexOf(absence.personId) < 0) return;
      (p.stages || []).forEach(function (st) {
        (st.tasks || []).forEach(function (t) {
          if (!t || t.status === 'done' || t.status === 'cancelled' || (t.assignees || []).indexOf(absence.personId) < 0) return;
          var day = typeof t.deadline === 'string' ? t.deadline.slice(0, 10) : '';
          if (day && day >= absence.from && day <= absence.to) out.push({ tone: 'alarm', text: 'Termin zadania „' + t.name + '” (' + p.code + ') przypada na ' + shortDay(day) });
        });
      });
      var away = {};
      approved(c.absences).forEach(function (a) {
        if (a.personId === absence.personId || a.id === absence.id || roster.indexOf(a.personId) < 0 || !overlaps(a, absence.from, absence.to)) return;
        away[a.personId] = true;
      });
      var n = Object.keys(away).length;
      if (n) crowd.push(p.code + ' (' + n + ' z ' + roster.length + ')');
    });
    if (crowd.length) out.push({ tone: 'warn', text: 'W tym czasie nieobecne są też osoby z zespołów: ' + crowd.join(', ') });
    if (!out.some(function (x) { return x.tone === 'alarm'; })) out.unshift({ tone: 'ok', text: 'Brak kolizji z terminami zadań' });
    return out;
  }

  /** Kto widzi wniosek: właściciel, zarząd i lider projektu, w którym pracuje osoba. */
  function canSee(viewerId, absence, projects, people) {
    if (!viewerId || !absence) return false;
    if (absence.personId === viewerId) return true;
    var me = (people || []).filter(function (p) { return p.id === viewerId; })[0];
    if (me && me.orgRole === 'managing') return true;
    return (projects || []).some(function (p) { return p.team && p.team.leader === viewerId && Team.projectPeople(p.team).indexOf(absence.personId) >= 0; });
  }

  /** Czy `viewerId` jest liderem projektu, w którym pracuje osoba z wniosku. */
  function isLeaderOf(viewerId, absence, projects) {
    return (projects || []).some(function (p) { return p.team && p.team.leader === viewerId && Team.projectPeople(p.team).indexOf(absence.personId) >= 0; });
  }

  var api = { STATUS: STATUS, VERDICTS: VERDICTS, DEFAULT_LEAVE_DAYS: DEFAULT_LEAVE_DAYS, ON_DEMAND_LIMIT: ON_DEMAND_LIMIT, approved: approved, workdays: workdays, balance: balance, request: request, decide: decide, addOpinion: addOpinion, impact: impact, canSee: canSee, isLeaderOf: isLeaderOf, entitlementOf: entitlementOf, KINDS: KINDS, normalize: normalize, validate: validate, save: save, remove: remove, daysOf: daysOf, isoOf: isoOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Absences = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
