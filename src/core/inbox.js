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
  var Orders = node ? require('./orders.js') : root.ETROM.Orders;
  var Absences = node ? require('./absences.js') : root.ETROM.Absences;
  var Budget = node ? require('./budget.js') : root.ETROM.Budget;
  var Calendar = node ? require('./calendar.js') : root.ETROM.Calendar;

  var KINDS = {
    approve: { label: 'Do zatwierdzenia', order: 0 },
    order: { label: 'Zlecenie do wykonania', order: 1 },
    leave: { label: 'Wniosek do decyzji', order: 2 },
    timeweek: { label: 'Tydzień czasu do zatwierdzenia', order: 2.5 },
    mail: { label: 'Pismo czeka na odpowiedź', order: 3 },
    project: { label: 'Projekt w alarmie', order: 4 },
    returned: { label: 'Zwrócone do poprawy', order: 5 }
  };
  var KIND_ORDER = ['approve', 'order', 'leave', 'timeweek', 'mail', 'project', 'returned'];
  // Skrzynka = to, czego czekają ode mnie inni. Zadania zwrócone do poprawy to moja własna praca,
  // więc zostają w „Mojej pracy” i nie wchodzą na ekran Skrzynki ani do jej licznika.
  var SCREEN_KINDS = ['approve', 'order', 'leave', 'timeweek', 'mail', 'project'];
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
  function shortDay(iso) { return iso.slice(8, 10) + '.' + iso.slice(5, 7); }

  /** Zlecenia otwarte i przypisane do osoby: najstarsze pierwsze, od doby „ostrzegają”, od 3 dni są pilne. */
  function orderItems(personId, orders, people, projects, ref) {
    return Orders.oldestFirst(Orders.forAssignee(orders || [], personId), ref).map(function (o) {
      var from = Team.findPerson(people || [], o.createdBy);
      var project = o.projectId == null ? null : (projects || []).filter(function (p) { return String(p.id) === String(o.projectId); })[0] || null;
      return {
        key: 'order:' + o.id, kind: 'order', order: o, project: project, title: o.text || 'Zlecenie',
        detail: (Orders.KINDS[o.kind] || 'Zlecenie') + ' · od ' + (from ? Team.fullName(from) : 'kogoś') + ' · ' + Orders.ageText(Orders.elapsedMs(o, ref)),
        why: 'Ktoś zlecił Ci to jako osobny krok. Zamknij zlecenie albo przekaż je dalej na ekranie Zleceń.',
        days: null, urgent: Orders.tone(o, ref) === 'late'
      };
    });
  }

  /** Tygodnie czasu pracy zgłoszone do zatwierdzenia: zarząd albo lider projektu osoby. */
  function weekItems(personId, locks, people, projects, ref) {
    var WL = typeof module !== 'undefined' && module.exports ? require('./weeklock.js') : root.ETROM.WeekLock;
    var management = Budget.isManagement(personId, people || []);
    return (locks || []).filter(function (l) { return l.status === 'submitted' && WL.canDecide(personId, l.personId, projects || [], management); }).map(function (l) {
      var who = Team.findPerson(people || [], l.personId);
      var end = Calendar.addDays(l.week, 6);
      return {
        key: 'week:' + l.id, kind: 'timeweek', lock: l, project: null,
        title: (who ? Team.fullName(who) : 'Osoba') + ' · tydzień ' + shortDay(l.week) + '–' + shortDay(end),
        detail: 'Czas pracy zamknięty przez pracownika',
        why: 'Zatwierdź tydzień albo zwróć go do poprawy. Do decyzji wpisy są zablokowane.',
        days: null, urgent: false
      };
    });
  }

  /** Wnioski urlopowe czekające na tę osobę: zarząd decyduje, lider projektu dopisuje opinię (raz). */
  function leaveItems(personId, absences, people, projects, ref) {
    var management = Budget.isManagement(personId, people || []);
    return (absences || []).filter(function (a) {
      if (a.personId === personId) return false;
      if (management) return a.status === 'pending' || !!a.cancelRequest;
      if (a.status !== 'pending') return false;
      return Absences.isLeaderOf(personId, a, projects || []) && !(a.opinions || []).some(function (o) { return o.by === personId; });
    }).map(function (a) {
      var who = Team.findPerson(people || [], a.personId);
      var days = Progress.daysUntil(a.from, ref);
      var worst = Absences.impact(a, { projects: projects, people: people, absences: absences }).filter(function (x) { return x.tone === 'alarm'; })[0];
      var span = a.from === a.to ? shortDay(a.from) : shortDay(a.from) + '–' + shortDay(a.to);
      return {
        key: 'leave:' + a.id + (a.cancelRequest ? ':cancel' : ''), kind: 'leave', absence: a, management: management, project: null, cancel: !!a.cancelRequest,
        title: (who ? Team.fullName(who) : 'Osoba') + ' · ' + (a.cancelRequest ? 'prośba o anulowanie urlopu ' : (Absences.KINDS[a.kind] || 'Nieobecność') + ' ') + span,
        detail: (Absences.workdays(a) === 1 ? '1 dzień roboczy' : Absences.workdays(a) + ' dni rob.') + (worst ? ' · ' + worst.text : ''),
        why: a.cancelRequest ? 'Pracownik prosi o anulowanie zatwierdzonego urlopu' + (a.cancelRequest.note ? ': ' + a.cancelRequest.note : '.') : management ? 'Wniosek czeka na decyzję zarządu. Wpływ na plan jest w pełnym widoku Urlopów.' : 'Jesteś liderem projektu tej osoby. Dopisz opinię, a decyzję podejmie zarząd.',
        days: days, urgent: days !== null && days <= 2 && !!worst
      };
    });
  }

  function build(personId, projects, mail, now, snoozed, entries, extra) {
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
        Mail.inboxEntries(mail || [], project, entries, ref).forEach(function (x) {
          if (Mail.ownerOf(x.entry, project) !== personId) return;
          var st = x.flow.state;
          var days = x.flow.days;
          var files = (x.entry.files || []).length;
          var why = st === 'new'
            ? 'Nowe pismo czeka na Twoją decyzję: do akt, wymaga odpowiedzi, dołączyć do sprawy albo przekazać dalej.'
            : st === 'finished'
              ? 'Zadanie z pisma jest zakończone, a odpowiedzi nie ma w dzienniku. Zarejestruj wysłaną odpowiedź albo uznaj, że jest niepotrzebna.'
              : 'Termin odpowiedzi dla organu jest bliski albo zadanie kończy się po nim. Sprawdź zadanie i wykonawcę.';
          all.push({
            key: 'mail:' + project.id + ':' + x.entry.id, kind: 'mail', handling: st, flow: x.flow, project: project, entry: x.entry,
            title: x.entry.subject || 'Pismo bez tematu',
            detail: (x.entry.counterparty || '') + (files ? ' · ' + files + (files === 1 ? ' plik' : ' pliki') : ''),
            linked: Mail.linkedTasks(project, x.entry.id, entries, ref), why: why, days: days,
            urgent: st === 'atrisk' || (days !== null && days <= 2)
          });
        });
      });
      (projects || []).forEach(function (project) {
        if (project.status === 'done') return;
        var fns = Team.functionsOf(personId, project.team).map(function (fn) { return fn.key; });
        if (fns.indexOf('leader') >= 0 && Insight.healthOf(project, ref, mail).level === 'alarm') {
          all.push({ key: 'project:' + project.id, kind: 'project', project: project, title: project.name, detail: Insight.healthOf(project, ref, mail).label, why: 'Jesteś liderem tego projektu, a ma przekroczony termin lub budżet. Otwórz projekt i zdecyduj, co dalej.', days: null, urgent: true });
        }
      });
    }

    if (personId && extra) {
      all = all.concat(orderItems(personId, extra.orders, extra.people, projects, ref), leaveItems(personId, extra.absences, extra.people, projects, ref), weekItems(personId, extra.timeLocks, extra.people, projects, ref));
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

  /** Widok ekranu Skrzynki: bez zadań zwróconych do poprawy (to praca własna). Liczniki i suma liczone od nowa. */
  function forScreen(result) {
    function keep(i) { return SCREEN_KINDS.indexOf(i.kind) >= 0; }
    var items = result.items.filter(keep);
    var counts = {};
    SCREEN_KINDS.forEach(function (k) { counts[k] = 0; });
    items.forEach(function (i) { counts[i.kind] += 1; });
    return { items: items, snoozed: result.snoozed.filter(keep), counts: counts, total: items.length, urgent: items.filter(function (i) { return i.urgent; }).length };
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

  var api = { KINDS: KINDS, KIND_ORDER: KIND_ORDER, SCREEN_KINDS: SCREEN_KINDS, build: build, forScreen: forScreen, snooze: snooze, unsnooze: unsnooze, cleanSnoozed: cleanSnoozed };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Inbox = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
