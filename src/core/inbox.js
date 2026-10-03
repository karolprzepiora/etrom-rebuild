/* ETROM — Skrzynka: to, co wymaga reakcji jednej osoby. Czyste funkcje, bez DOM.
   Pozycje nie są osobnymi rekordami — wynikają ze stanu pracy, więc znikają same,
   gdy człowiek zrobi to, czego od niego chcą (zatwierdzi, poprawi, odpowie).
   Jedyny zapis to „odłóż do jutra”: klucz pozycji i data, do której jest ukryta. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Insight = node ? require('./insight.js') : root.ETROM.Insight;
  var Mail = node ? require('./mail.js') : root.ETROM.Mail;
  var Team = node ? require('./team.js') : root.ETROM.Team;
  var Progress = node ? require('./progress.js') : root.ETROM.Progress;

  var KINDS = {
    approve: { label: 'Do zatwierdzenia', order: 0 },
    returned: { label: 'Zwrócone do poprawy', order: 1 },
    mail: { label: 'Pismo czeka na odpowiedź', order: 2 },
    project: { label: 'Projekt w alarmie', order: 3 }
  };
  var KIND_ORDER = ['approve', 'returned', 'mail', 'project'];
  var MAX_SNOOZED = 200;

  function dateKey(now) {
    var d = now instanceof Date ? now : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDays(now, n) {
    var d = now instanceof Date ? new Date(now.getTime()) : new Date();
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  function taskKey(kind, row) {
    return kind + ':' + row.project.id + ':' + row.stage.id + ':' + row.task.id;
  }

  /** Dzień (0 = dziś, ujemne = po terminie) albo null, gdy bez terminu. */
  function daysOf(date, now) {
    return date ? Progress.daysUntil(String(date).slice(0, 10), now) : null;
  }

  /**
   * @param {string} personId
   * @param {Array} projects
   * @param {Array} mail
   * @param {Date} now
   * @param {Object<string,string>} snoozed klucz → data (RRRR-MM-DD), do której ukryta
   * @returns {{items: Array, snoozed: Array, counts: Object, total: number, urgent: number}}
   */
  function build(personId, projects, mail, now, snoozed, entries) {
    var ref = now instanceof Date ? now : new Date();
    var today = dateKey(ref);
    var hidden = snoozed && typeof snoozed === 'object' ? snoozed : {};
    var all = [];
    if (personId) {
      var work = Insight.myWork(personId, projects, ref);
      work.toApprove.forEach(function (row) {
        var days = daysOf(row.task.deadline, ref);
        all.push({ key: taskKey('approve', row), kind: 'approve', project: row.project, stage: row.stage, task: row.task, title: row.task.name, why: 'Realizatorzy zgłosili to zadanie do zatwierdzenia. Zatwierdź albo zwróć z uwagą.', days: days, urgent: days !== null && days < 0 });
      });
      work.returned.forEach(function (row) {
        all.push({ key: taskKey('returned', row), kind: 'returned', project: row.project, stage: row.stage, task: row.task, title: row.task.name, detail: row.task.feedback || '', why: 'Zadanie wróciło do poprawy. Popraw i zgłoś ponownie do zatwierdzenia.', days: row.days, urgent: !!row.overdue });
      });
      (projects || []).forEach(function (project) {
        if (project.status === 'done') return;
        var fns = Team.functionsOf(personId, project.team).map(function (fn) { return fn.key; });
        var owner = fns.indexOf('leader') >= 0 || fns.indexOf('coordinator') >= 0;
        if (!owner) return;
        Mail.pending(mail || [], project.id, ref).forEach(function (x) {
          // Tylko pisma przychodzące: na wychodzące czekamy my, to nie jest „do zrobienia” dla lidera.
          if (x.entry.direction !== 'in') return;
          // Jeden właściciel sprawy: dopóki trwa zadanie z pisma, pismo nie dubluje go w reakcjach.
          var linked = Mail.linkedTasks(project, x.entry.id, entries, ref);
          var state = Mail.handling(linked);
          if (state === 'taken') return;
          var late = x.reply.state === 'overdue';
          var why = state === 'finished'
            ? 'Zadanie z tego pisma jest zakończone, ale nie zarejestrowano odpowiedzi. Wpisz wysłane pismo do dziennika, a pismo zniknie stąd.'
            : (late ? 'Termin odpowiedzi na to pismo minął, a nikt się nim nie zajął. ' : 'Nowe pismo wymaga odpowiedzi i nikt się nim jeszcze nie zajął. ') + 'Jesteś liderem lub koordynatorem projektu. Utwórz zadanie (żeby zapisywać czas i przydzielić osobę) albo od razu napisz odpowiedź.';
          all.push({ key: 'mail:' + project.id + ':' + x.entry.id, kind: 'mail', handling: state, project: project, entry: x.entry, title: x.entry.subject || 'Pismo bez tematu', detail: x.entry.counterparty || '', linked: linked, why: why, days: x.reply.days, urgent: late });
        });
        if (fns.indexOf('leader') >= 0 && Insight.healthOf(project, ref, mail).level === 'alarm') {
          all.push({ key: 'project:' + project.id, kind: 'project', project: project, title: project.name, detail: Insight.healthOf(project, ref, mail).label, why: 'Jesteś liderem tego projektu, a ma przekroczony termin lub budżet. Otwórz projekt i zdecyduj, co dalej.', days: null, urgent: true });
        }
      });
    }

    all.sort(function (a, b) {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      var da = a.days === null ? 9999 : a.days;
      var db = b.days === null ? 9999 : b.days;
      if (da !== db) return da - db;
      return KINDS[a.kind].order - KINDS[b.kind].order;
    });

    var items = [];
    var later = [];
    all.forEach(function (item) {
      var until = hidden[item.key];
      if (typeof until === 'string' && until > today) later.push(Object.assign({}, item, { until: until }));
      else items.push(item);
    });
    var counts = {};
    KIND_ORDER.forEach(function (k) { counts[k] = 0; });
    items.forEach(function (item) { counts[item.kind] += 1; });
    return {
      items: items, snoozed: later, counts: counts, total: items.length,
      urgent: items.filter(function (i) { return i.urgent; }).length
    };
  }

  /** Ukrywa pozycję do wskazanego dnia (domyślnie jutra). Stare wpisy są sprzątane. */
  function snooze(snoozed, key, now, days) {
    var today = dateKey(now);
    var next = {};
    Object.keys(snoozed || {}).forEach(function (k) {
      if (typeof snoozed[k] === 'string' && snoozed[k] > today) next[k] = snoozed[k];
    });
    next[key] = addDays(now, days || 1);
    var keys = Object.keys(next);
    if (keys.length > MAX_SNOOZED) {
      keys.sort(function (a, b) { return next[a].localeCompare(next[b]); }).slice(0, keys.length - MAX_SNOOZED).forEach(function (k) { delete next[k]; });
    }
    return next;
  }

  function unsnooze(snoozed, key) {
    var next = Object.assign({}, snoozed || {});
    delete next[key];
    return next;
  }

  /** Walidacja zapisu z pamięci przeglądarki. */
  function cleanSnoozed(value) {
    var out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    Object.keys(value).slice(0, MAX_SNOOZED).forEach(function (k) {
      if (k.length <= 80 && /^\d{4}-\d{2}-\d{2}$/.test(String(value[k]))) out[k] = value[k];
    });
    return out;
  }

  var api = { KINDS: KINDS, KIND_ORDER: KIND_ORDER, build: build, snooze: snooze, unsnooze: unsnooze, cleanSnoozed: cleanSnoozed };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Inbox = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
