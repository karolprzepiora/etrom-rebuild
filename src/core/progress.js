/* ETROM — wyliczenia postępu i terminów. Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  var Model = (typeof module !== 'undefined' && module.exports)
    ? require('./model.js')
    : root.ETROM.Model;

  var DAY_MS = 86400000;

  function dayNumber(year, month, day) {
    return Math.floor(Date.UTC(year, month, day) / DAY_MS);
  }

  /**
   * Liczba pełnych dni między dzisiaj a terminem (dodatnia = termin w przyszłości).
   * Porównanie po dniach kalendarzowych, więc godzina nie zmienia wyniku.
   */
  function daysUntil(deadline, now) {
    if (!Model.isDate(deadline)) return null;
    var reference = now instanceof Date ? now : new Date();
    var parts = deadline.split('-').map(Number);
    return dayNumber(parts[0], parts[1] - 1, parts[2])
      - dayNumber(reference.getFullYear(), reference.getMonth(), reference.getDate());
  }

  function plDays(count) {
    if (count === 1) return '1 dzień';
    return count + ' dni';
  }

  /**
   * Opis terminu gotowy do pokazania w interfejsie.
   * @returns {{tone: string, text: string, days: (number|null)}}
   */
  /**
   * Licznik dni do końca terminu — do pokazania obok daty.
   * @returns {{days: (number|null), tone: string, number: (number|null), rest: string, text: string}}
   *   `number` to wartość do wyróżnienia, `rest` reszta zdania („dni do końca”).
   */
  function countdown(deadline, now) {
    var days = daysUntil(deadline, now);
    if (days === null) return { days: null, tone: 'none', number: null, rest: '', text: '' };
    var n = Math.abs(days);
    var word = n === 1 ? 'dzień' : 'dni';
    var tone = days < 0 ? 'overdue' : (days <= 7 ? 'urgent' : (days <= 30 ? 'warning' : 'normal'));
    if (days === 0) return { days: 0, tone: 'urgent', number: null, rest: 'termin dzisiaj', text: 'termin dzisiaj' };
    var rest = word + (days < 0 ? ' po terminie' : ' do końca');
    return { days: days, tone: tone, number: n, rest: rest, text: n + ' ' + rest };
  }

  function deadlineInfo(deadline, now) {
    var days = daysUntil(deadline, now);
    if (days === null) return { tone: 'none', text: 'Bez terminu', days: null };
    if (days < 0) return { tone: 'overdue', text: plDays(Math.abs(days)) + ' po terminie', days: days };
    if (days === 0) return { tone: 'urgent', text: 'Termin dzisiaj', days: 0 };
    if (days <= 7) return { tone: 'urgent', text: 'Pozostało ' + plDays(days), days: days };
    if (days <= 30) return { tone: 'warning', text: 'Pozostało ' + plDays(days), days: days };
    return { tone: 'normal', text: 'Pozostało ' + plDays(days), days: days };
  }

  /* Zasady liczenia postępu (zmieniane w Ustawieniach → Budżet i postęp):
     method 'auto'   — etap w toku liczy się wg zadań (godziny z oszacowań, a bez nich liczba zadań),
                       a gdy nie ma zadań — wg wagi „w toku”;
     method 'status' — tylko status etapu: zakończony = 100%, w toku = waga „w toku”, reszta 0;
     method 'done'   — tylko zakończone etapy (jak dotąd). */
  var rules = { method: 'auto', workingWeight: 0.5 };

  function setRules(next) {
    var n = next || {};
    if (n.method === 'auto' || n.method === 'status' || n.method === 'done') rules.method = n.method;
    var w = Number(n.workingWeight);
    if (Number.isFinite(w) && w >= 0 && w <= 0.95) rules.workingWeight = w;
    return getRules();
  }
  function getRules() { return { method: rules.method, workingWeight: rules.workingWeight }; }

  /** Udział wykonania etapu (0–1) wg bieżących zasad. */
  function stageFraction(stage, custom) {
    var r = custom || rules;
    if (stage.status === 'done') return 1;
    if (stage.status !== 'working' || r.method === 'done') return 0;
    var cap = 0.95;
    if (r.method === 'auto') {
      var tasks = stage.tasks || [];
      if (tasks.length) {
        var est = 0, estDone = 0;
        tasks.forEach(function (t) {
          var h = Number(t.estimate);
          if (Number.isFinite(h) && h > 0) { est += h; if (t.status === 'done') estDone += h; }
        });
        var share = est > 0 && tasks.every(function (t) { return Number(t.estimate) > 0; })
          ? estDone / est
          : tasks.filter(function (t) { return t.status === 'done'; }).length / tasks.length;
        return Math.min(cap, share);
      }
    }
    return Math.min(cap, r.workingWeight);
  }

  /**
   * Postęp rzeczowy projektu: udział godzin wykonanych (wg zasad postępu) w całości.
   * @returns {{percent: number, done: number, total: number, hoursDone: number, hoursTotal: number}}
   */
  function projectProgress(project) {
    var stages = (project && Array.isArray(project.stages)) ? project.stages : [];
    var hoursTotal = 0;
    var hoursDone = 0;
    var done = 0;

    stages.forEach(function (stage) {
      var hours = Number(stage.hours);
      if (!Number.isFinite(hours) || hours <= 0) hours = 0;
      hoursTotal += hours;
      hoursDone += hours * stageFraction(stage);
      if (stage.status === 'done') done += 1;
    });

    return {
      percent: hoursTotal > 0 ? Math.round((hoursDone / hoursTotal) * 100) : 0,
      done: done,
      total: stages.length,
      hoursDone: Math.round(hoursDone * 10) / 10,
      hoursTotal: hoursTotal
    };
  }

  /** Czy projekt wymaga uwagi: przekroczony termin przy niezakończonym projekcie. */
  function isOverdue(project, now) {
    if (!project || project.status === 'done') return false;
    var days = daysUntil(project.deadline, now);
    return days !== null && days < 0;
  }

  /**
   * Etap, na którym stoi projekt: najpierw pierwszy w toku,
   * potem pierwszy jeszcze niezaczęty. Null, gdy nie ma czego robić.
   * @returns {(Object|null)}
   */
  function activeStage(project) {
    var stages = (project && Array.isArray(project.stages)) ? project.stages : [];
    var working = null;
    var todo = null;
    for (var i = 0; i < stages.length; i += 1) {
      if (stages[i].status === 'working' && !working) working = stages[i];
      if (stages[i].status === 'todo' && !todo) todo = stages[i];
    }
    return working || todo || null;
  }

  var api = {
    daysUntil: daysUntil,
    deadlineInfo: deadlineInfo,
    countdown: countdown,
    projectProgress: projectProgress,
    stageFraction: stageFraction,
    setRules: setRules,
    getRules: getRules,
    isOverdue: isOverdue,
    activeStage: activeStage
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Progress = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
