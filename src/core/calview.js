/* ETROM — dane ekranu Kalendarz: co dzieje się w dniach miesiąca (terminy projektów, etapów i zadań, nieobecności, święta).
   Czyste funkcje, bez DOM. Zakres: zarząd widzi wszystko, lider swoje projekty i ich osoby, pracownik własne zadania,
   terminy projektów, w których jest w zespole, i własne nieobecności. Godzin i obciążenia tu nie ma. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Cal = node ? require('./calendar.js') : root.ETROM.Calendar;
  var Team = node ? require('./team.js') : root.ETROM.Team;
  var Budget = node ? require('./budget.js') : root.ETROM.Budget;
  var Model = node ? require('./model.js') : root.ETROM.Model;

  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

  function stageLabel(s) { try { return Model.describeStage(s).name || s.name || ''; } catch (e) { return s.name || ''; } }

  function dayOf(text) { return typeof text === 'string' && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : ''; }

  /**
   * @param {{projects: Array, people: Array, absences?: Array, meId: string, now: Date, year: number, month: number}} input
   * @returns {{title: string, cells: Array, upcoming: Array, projects: Array}}
   */
  function build(input) {
    var projects = input.projects || [];
    var people = input.people || [];
    var absences = input.absences || [];
    var me = input.meId;
    var management = Budget.isManagement(me, people);
    var today = Cal.isoOf(input.now);
    var events = {};
    var legend = {};

    function add(key, ev) {
      if (!key) return;
      (events[key] = events[key] || []).push(ev);
    }

    // Zakres osób dla nieobecności.
    var seePeople = null;
    if (!management) {
      seePeople = {};
      seePeople[me] = true;
      projects.forEach(function (p) {
        if (p.team && p.team.leader === me) Team.projectPeople(p.team).forEach(function (id) { seePeople[id] = true; });
      });
    }

    projects.forEach(function (p) {
      if (p.status === 'done') return;
      var inTeam = !!p.team && Team.projectPeople(p.team).indexOf(me) >= 0;
      var leads = !!p.team && p.team.leader === me;
      var seeAll = management || leads;
      var seeProject = seeAll || inTeam;
      if (!seeProject && !(p.stages || []).some(function (s) { return (s.tasks || []).some(function (t) { return (t.assignees || []).indexOf(me) >= 0; }); })) return;
      legend[p.id] = { projectId: p.id, code: p.code, name: p.name };
      if (seeProject && dayOf(p.deadline)) add(dayOf(p.deadline), { kind: 'project', projectId: p.id, code: p.code, title: 'Termin umowy', sub: p.name });
      (p.stages || []).forEach(function (s) {
        if (seeAll && s.status !== 'done' && dayOf(s.deadline)) add(dayOf(s.deadline), { kind: 'stage', projectId: p.id, stageId: s.id, code: p.code, project: p.name, title: stageLabel(s), sub: 'Termin etapu' });
        (s.tasks || []).forEach(function (t) {
          if (t.status === 'done' || !dayOf(t.deadline)) return;
          var mine = (t.assignees || []).indexOf(me) >= 0;
          if (!mine) return;
          add(dayOf(t.deadline), { kind: 'task', projectId: p.id, stageId: s.id, taskId: t.id, code: p.code, project: p.name, title: t.name, sub: 'Twoje zadanie' });
        });
      });
    });

    var personName = function (id) { var x = Team.findPerson(people, id); return x ? Team.fullName(x) : ''; };
    absences.forEach(function (a) {
      if (seePeople && !seePeople[a.personId]) return;
      for (var d = a.from; d <= a.to; d = Cal.addDays(d, 1)) {
        add(d, { kind: 'absence', personId: a.personId, absenceId: a.id, title: personName(a.personId), sub: a.kind === 'sick' ? 'Zwolnienie' : (a.kind === 'training' ? 'Szkolenie' : (a.kind === 'other' ? 'Nieobecność' : 'Urlop')) });
        if (d > '9999') break;
      }
    });

    var cells = Cal.monthGrid(input.year, input.month).map(function (key) {
      var d = Cal.parse(key);
      var list = (events[key] || []).slice().sort(function (a, b) {
        var order = { project: 0, stage: 1, task: 2, absence: 3 };
        return order[a.kind] - order[b.kind];
      });
      return {
        key: key, day: d.getDate(), out: d.getMonth() !== input.month, weekend: Cal.isWeekend(key), holiday: Cal.holidayName(key),
        today: key === today, weekNumber: (d.getDay() + 6) % 7 === 0 ? Cal.weekNumber(key) : 0, events: list
      };
    });

    var upcoming = [];
    Object.keys(events).sort().forEach(function (k) {
      if (k < today) return;
      events[k].forEach(function (e) { if (e.kind !== 'absence') upcoming.push(Object.assign({ key: k }, e)); });
    });

    return { title: MONTHS[input.month] + ' ' + input.year, cells: cells, upcoming: upcoming.slice(0, 8), projects: Object.keys(legend).map(function (k) { return legend[k]; }) };
  }

  var api = { build: build };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.CalView = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
