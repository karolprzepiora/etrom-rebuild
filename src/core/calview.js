/* ETROM — dane ekranu Kalendarz: co dzieje się w dniach (terminy projektów, etapów i zadań, nieobecności, wyjazdy, święta).
   Czyste funkcje, bez DOM. Zakres wg roli: zarząd widzi wszystko, lider swoje projekty i ich osoby, pracownik własne zadania
   i terminy projektów, w których jest w zespole. Cudze nieobecności widać wg ustawienia zarządu (Absences.peek).
   Filtry: zakres (Moje / Mój zespół / Wszyscy), ukryte osoby, projekty i rodzaje wpisów.
   Wynik: dni z wpisami i obsadą, paski wielodniowe (nieobecności, wyjazdy, zadania ze startem), konflikty i lista do eksportu .ics.
   Godzin i obciążenia tu nie ma. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Cal = node ? require('./calendar.js') : root.ETROM.Calendar;
  var Team = node ? require('./team.js') : root.ETROM.Team;
  var Budget = node ? require('./budget.js') : root.ETROM.Budget;
  var Model = node ? require('./model.js') : root.ETROM.Model;
  var Absences = node ? require('./absences.js') : root.ETROM.Absences;

  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var KINDS = { deadline: 'Terminy', task: 'Zadania', absence: 'Nieobecności', trip: 'Wyjazdy' };
  var SCOPES = { mine: 'Moje', team: 'Mój zespół', all: 'Wszyscy' };
  var ABSENCE_LABEL = { leave: 'Urlop', sick: 'Zwolnienie', training: 'Szkolenie', other: 'Nieobecność' };
  var THIN = 3;

  function stageLabel(s) { try { return Model.describeStage(s).name || s.name || ''; } catch (e) { return s.name || ''; } }
  function dayOf(text) { return typeof text === 'string' && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : ''; }
  function isOff(key) { return Cal.isWeekend(key) || Cal.isHoliday(key); }

  function cleanFilters(f) {
    var src = f && typeof f === 'object' ? f : {};
    function list(v) { return Array.isArray(v) ? v.filter(function (x, i, a) { return (typeof x === 'string' || typeof x === 'number') && a.indexOf(x) === i; }).slice(0, 200) : []; }
    return {
      scope: SCOPES[src.scope] ? src.scope : '',
      hiddenPeople: list(src.hiddenPeople), hiddenProjects: list(src.hiddenProjects),
      hiddenKinds: list(src.hiddenKinds).filter(function (k) { return KINDS[k]; })
    };
  }

  /** Domyślny zakres: zarząd widzi wszystkich, pozostali swój zespół. */
  function defaultScope(management) { return management ? 'all' : 'team'; }

  /** Dni siatki: miesiąc (42 dni) albo dowolny zakres { from, to }. */
  function gridKeys(input) {
    if (input.range && input.range.from && input.range.to) {
      var keys = [];
      for (var d = input.range.from; d <= input.range.to && keys.length < 800; d = Cal.addDays(d, 1)) keys.push(d);
      return keys;
    }
    return Cal.monthGrid(input.year, input.month);
  }

  /**
   * @param {{projects: Array, people: Array, absences?: Array, trips?: Array, meId: string, now: Date, year?: number, month?: number,
   *          range?: {from: string, to: string}, filters?: Object, visibility?: string}} input
   */
  function build(input) {
    var projects = input.projects || [];
    var people = input.people || [];
    var me = input.meId;
    var management = Budget.isManagement(me, people);
    var today = Cal.isoOf(input.now);
    var f = cleanFilters(input.filters);
    var scope = f.scope || defaultScope(management);
    var hidePeople = {}; f.hiddenPeople.forEach(function (id) { hidePeople[id] = true; });
    var hideProj = {}; f.hiddenProjects.forEach(function (id) { hideProj[String(id)] = true; });
    var hideKind = {}; f.hiddenKinds.forEach(function (k) { hideKind[k] = true; });
    var active = people.filter(function (p) { return p.active !== false; });

    var teamIds = {};
    teamIds[me] = true;
    projects.forEach(function (p) {
      if (!p.team) return;
      var inTeam = Team.projectPeople(p.team).indexOf(me) >= 0;
      if (inTeam || p.team.leader === me) Team.projectPeople(p.team).forEach(function (id) { teamIds[id] = true; });
    });
    function inScope(personId) {
      if (scope === 'mine') return personId === me;
      if (scope === 'team') return !!teamIds[personId];
      return true;
    }
    var scopePeople = active.filter(function (p) { return inScope(p.id) && !hidePeople[p.id]; });
    var candidates = active.filter(function (p) { return inScope(p.id); });
    var scopeIds = {}; scopePeople.forEach(function (p) { scopeIds[p.id] = true; });

    var events = {};
    var legend = {};
    var spans = [];
    var items = [];
    var personName = function (id) { var x = Team.findPerson(people, id); return x ? Team.fullName(x) : ''; };

    function add(key, ev) { if (key) (events[key] = events[key] || []).push(ev); }

    var visibleProjects = [];
    projects.forEach(function (p) {
      if (p.status === 'done') return;
      var inTeam = !!p.team && Team.projectPeople(p.team).indexOf(me) >= 0;
      var leads = !!p.team && p.team.leader === me;
      var seeAll = management || leads;
      var seeProject = seeAll || inTeam;
      var hasTask = (p.stages || []).some(function (s) { return (s.tasks || []).some(function (t) { return (t.assignees || []).indexOf(me) >= 0; }); });
      if (!seeProject && !hasTask) return;
      visibleProjects.push({ projectId: p.id, code: p.code, name: p.name });
      if (hideProj[String(p.id)]) return;
      legend[p.id] = { projectId: p.id, code: p.code, name: p.name };
      var leaderId = p.team && p.team.leader;
      function deadline(kindEv, key) { if (!hideKind.deadline) { kindEv.leaderId = leaderId || ''; add(key, kindEv); items.push({ uid: 'd-' + p.id + '-' + (kindEv.stageId || 'p') + '-' + key, kind: 'deadline', from: key, to: key, title: p.code + ' · ' + kindEv.title, sub: kindEv.sub }); } }
      if (seeProject && dayOf(p.deadline)) deadline({ kind: 'project', projectId: p.id, code: p.code, title: 'Termin umowy', sub: p.name }, dayOf(p.deadline));
      (p.stages || []).forEach(function (s) {
        if (seeAll && s.status !== 'done' && dayOf(s.deadline)) deadline({ kind: 'stage', projectId: p.id, stageId: s.id, code: p.code, project: p.name, title: stageLabel(s), sub: 'Termin etapu' }, dayOf(s.deadline));
        (s.tasks || []).forEach(function (t) {
          if (t.status === 'done' || !dayOf(t.deadline) || hideKind.task) return;
          var who = (t.assignees || []).filter(function (id) { return scopeIds[id] && (seeAll || id === me); });
          if (!who.length) return;
          var onlyMe = who.length === 1 && who[0] === me;
          var end = dayOf(t.deadline);
          var start = dayOf(t.start);
          var base = { kind: 'task', projectId: p.id, stageId: s.id, taskId: t.id, code: p.code, project: p.name, title: t.name, assigneeIds: who, sub: onlyMe ? 'Twoje zadanie' : who.map(personName).filter(Boolean).join(', ') };
          if (start && start < end && onlyMe) {
            spans.push(Object.assign({ spanKind: 'task', from: start, to: end }, base));
            for (var d = start; d <= end; d = Cal.addDays(d, 1)) add(d, Object.assign({ bar: true, edge: d === end, from: start, to: end }, base));
          } else add(end, base);
          items.push({ uid: 't-' + t.id, kind: 'task', from: start && start < end ? start : end, to: end, title: p.code + ' · ' + t.name, sub: onlyMe ? 'Zadanie' : 'Zadanie: ' + who.map(personName).filter(Boolean).join(', ') });
        });
      });
    });

    // Nieobecności: widoczność wg ustawienia zarządu, zakres i filtry osób.
    var mode = input.visibility;
    var awayByDay = {};
    function markAway(key, personId) { (awayByDay[key] = awayByDay[key] || {})[personId] = true; }
    (input.absences || []).forEach(function (a) {
      if (a.status === 'rejected') return;
      var pending = a.status === 'pending';
      var seen = Absences.peek(me, a, projects, people, mode);
      if (!seen) return;
      if (!inScope(a.personId) || hidePeople[a.personId]) return;
      if (hideKind.absence) return;
      var kindText = seen === 'full' ? (pending ? 'Wniosek: ' + (ABSENCE_LABEL[a.kind] || 'nieobecność').toLowerCase() : (ABSENCE_LABEL[a.kind] || 'Nieobecność')) : 'Nieobecność';
      var title = personName(a.personId);
      var ev = { kind: 'absence', bar: true, personId: a.personId, absenceId: a.id, title: title, sub: kindText, absKind: seen === 'full' ? a.kind : 'other', detail: seen, pending: pending, from: a.from, to: a.to };
      spans.push(Object.assign({ spanKind: 'absence', from: a.from, to: a.to }, ev));
      if (!pending) items.push({ uid: 'a-' + a.id, kind: 'absence', from: a.from, to: a.to, title: title + ' · ' + kindText.toLowerCase(), sub: kindText });
      for (var d = a.from; d <= a.to; d = Cal.addDays(d, 1)) {
        add(d, ev);
        if (!isOff(d) && !pending) markAway(d, a.personId);
        if (d > '9999') break;
      }
    });

    // Wyjazdy widzą wszyscy (to informacja „gdzie kto będzie”).
    (input.trips || []).forEach(function (t) {
      if (hideKind.trip) return;
      var ids = t.personIds.filter(function (id) { return inScope(id) && !hidePeople[id]; });
      if (!ids.length) return;
      var proj = t.projectId ? projects.filter(function (p) { return p.id === t.projectId; })[0] : null;
      if (proj && hideProj[String(proj.id)]) return;
      var who = ids.map(personName).filter(Boolean).join(', ');
      var title = (t.kind === 'meeting' ? 'Spotkanie' : 'Teren') + ' · ' + t.place;
      var ev = { kind: 'trip', bar: true, tripId: t.id, tripKind: t.kind, personIds: ids, code: proj ? proj.code : '', projectId: proj ? proj.id : '', title: title, sub: who, from: t.from, to: t.to };
      spans.push(Object.assign({ spanKind: 'trip', from: t.from, to: t.to }, ev));
      items.push({ uid: 'w-' + t.id, kind: 'trip', from: t.from, to: t.to, title: title, sub: who });
      for (var d = t.from; d <= t.to; d = Cal.addDays(d, 1)) { add(d, ev); if (d > '9999') break; }
    });

    var total = scopePeople.length;
    var keys = gridKeys(input);
    var inMonth = input.range ? null : input.month;
    var order = { project: 0, stage: 1, trip: 2, task: 3, absence: 4 };
    var cells = keys.map(function (key) {
      var d = Cal.parse(key);
      var list = (events[key] || []).slice().sort(function (a, b) { return order[a.kind] - order[b.kind]; });
      var away = Object.keys(awayByDay[key] || {}).filter(function (id) { return scopeIds[id]; });
      return {
        key: key, day: d.getDate(), out: inMonth === null ? false : d.getMonth() !== inMonth, weekend: Cal.isWeekend(key), holiday: Cal.holidayName(key),
        today: key === today, weekNumber: (d.getDay() + 6) % 7 === 0 ? Cal.weekNumber(key) : 0, events: list,
        away: away, awayCount: away.length, present: Math.max(0, total - away.length), total: total, workday: !isOff(key)
      };
    });

    // Konflikty: tylko dla zarządu i liderów (pracownik nie zarządza terminami).
    var conflicts = [];
    var firstKey = keys[0] || '';
    var lastKey = keys[keys.length - 1] || '';
    var canJudge = management || projects.some(function (p) { return p.team && p.team.leader === me; });
    if (canJudge) {
      cells.forEach(function (c) {
        c.events.forEach(function (e) {
          if (e.kind !== 'project' && e.kind !== 'stage') return;
          var lead = projects.filter(function (p) { return p.id === e.projectId; })[0];
          var leaderId = lead && lead.team && lead.team.leader;
          if (!(management || leaderId === me)) return;
          if (leaderId && (awayByDay[c.key] || {})[leaderId]) {
            e.warn = true;
            conflicts.push({ type: 'leader', day: c.key, projectId: e.projectId, code: e.code, title: e.title, personId: leaderId, text: e.code + ': lider ' + personName(leaderId) + ' jest nieobecny w dniu terminu.' });
          } else if (!c.workday && c.key >= today) {
            e.warn = true;
            conflicts.push({ type: 'offday', day: c.key, projectId: e.projectId, code: e.code, title: e.title, text: e.code + ' ' + e.title + ': termin wypada w dniu wolnym.' });
          }
        });
      });
      var run = null;
      cells.forEach(function (c) {
        var thin = c.workday && c.awayCount >= THIN;
        if (thin) { if (!run) run = { type: 'thin', day: c.key, to: c.key, max: c.awayCount, ids: {} }; run.to = c.key; run.max = Math.max(run.max, c.awayCount); c.away.forEach(function (id) { run.ids[id] = true; }); }
        else if (run && c.workday) { conflicts.push(run); run = null; }
      });
      if (run) conflicts.push(run);
      conflicts.forEach(function (x) { if (x.type === 'thin') { x.people = Object.keys(x.ids).map(personName).filter(Boolean); delete x.ids; x.text = x.max + ' z ' + total + ' osób nieobecnych' + (x.people.length ? ': ' + x.people.join(', ') : '') + '.'; } });
      conflicts.sort(function (a, b) { return a.day < b.day ? -1 : (a.day > b.day ? 1 : 0); });
    }

    var upcoming = [];
    Object.keys(events).sort().forEach(function (k) {
      if (k < today) return;
      events[k].forEach(function (e) { if (e.kind !== 'absence' && e.kind !== 'trip' && !(e.bar && !e.edge)) upcoming.push(Object.assign({ key: k }, e)); });
    });

    var title = input.range ? (input.range.from.slice(0, 4)) : MONTHS[input.month] + ' ' + input.year;
    return {
      title: title, cells: cells, upcoming: upcoming.slice(0, 8), projects: Object.keys(legend).map(function (k) { return legend[k]; }),
      allProjects: visibleProjects, people: scopePeople, candidates: candidates, scope: scope, spans: spans, conflicts: conflicts, items: items, first: firstKey, last: lastKey, total: total
    };
  }

  /** Plik .ics z listy `items` (całodzienne wydarzenia). */
  function toIcs(items, now, name) {
    function esc(t) { return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    function compact(iso) { return iso.replace(/-/g, ''); }
    var stamp = (now instanceof Date ? now : new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ETROM//Kalendarz//PL', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc(name || 'ETROM')];
    (items || []).forEach(function (it) {
      lines.push('BEGIN:VEVENT', 'UID:' + esc(it.uid) + '@etrom', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + compact(it.from),
        'DTEND;VALUE=DATE:' + compact(Cal.addDays(it.to, 1)), 'SUMMARY:' + esc(it.title), it.sub ? 'DESCRIPTION:' + esc(it.sub) : null, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.filter(Boolean).join('\r\n') + '\r\n';
  }

  var api = { build: build, toIcs: toIcs, cleanFilters: cleanFilters, defaultScope: defaultScope, KINDS: KINDS, SCOPES: SCOPES, THIN: THIN };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.CalView = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
