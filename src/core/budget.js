/* ETROM — budżet godzin etapu: ile zaplanowano, ile zużył cały zespół i kto to widzi.
   Czyste funkcje, bez DOM.
   Zużycie = zapisany czas wszystkich osób na etapie + korekty dyrekcji (sztucznie dopisane
   godziny, np. gdy budżet został zaplanowany z zapasem i trzeba zmobilizować zespół).
   Zasada widoczności: godziny (zapisane i korekty) widzą lider projektu i zarząd;
   pozostali widzą wyłącznie procent zużycia budżetu etapu przez cały zespół. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var TimeLog = node ? require('./timelog.js') : root.ETROM.TimeLog;

  var WARN_AT = 0.8;
  var LIMITS = { note: 200, hours: 1000, perStage: 50 };

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }

  function sumAdjustments(stage) {
    return (stage && Array.isArray(stage.adjustments) ? stage.adjustments : []).reduce(function (total, a) {
      return total + (Number(a.hours) || 0);
    }, 0);
  }

  /**
   * Zużycie budżetu etapu.
   * @returns {{planned:number, logged:number, bonus:number, used:number, ratio:number, percent:number, state:string}}
   *   state: ok | warn (od 80%) | over (powyżej 100%)
   */
  function usage(project, stage, entries, now) {
    var planned = Number(stage && stage.hours) || 0;
    var minutes = (TimeLog.byStage(entries || [], project.id, now) || {})[stage.id] || 0;
    var logged = minutes / 60;
    var bonus = sumAdjustments(stage);
    var used = logged + bonus;
    var ratio = planned > 0 ? used / planned : 0;
    return {
      planned: planned,
      logged: logged,
      bonus: bonus,
      used: used,
      ratio: ratio,
      percent: Math.round(ratio * 100),
      state: ratio > 1 ? 'over' : (ratio >= WARN_AT ? 'warn' : 'ok')
    };
  }

  function findPerson(people, id) {
    return (people || []).filter(function (p) { return p.id === id; })[0] || null;
  }

  function isManagement(personId, people) {
    var person = findPerson(people, personId);
    return !!person && person.orgRole === 'managing';
  }

  /** Czy osoba widzi godziny (a nie tylko procent) w projekcie. */
  function canSeeHours(personId, project, people) {
    if (!personId) return false;
    if (isManagement(personId, people)) return true;
    return !!project && !!project.team && project.team.leader === personId;
  }

  /** Korekty godzin dodaje tylko zarząd. */
  function canAdjust(personId, people) {
    return isManagement(personId, people);
  }

  /** Dopisuje korektę do etapu. Zwraca nowy etap albo błędy. */
  function addAdjustment(stage, input, personId, now) {
    var data = input || {};
    var errors = {};
    var hours = Number(String(data.hours == null ? '' : data.hours).replace(',', '.'));
    var note = text(data.note);
    if (!Number.isFinite(hours) || hours <= 0) errors.hours = 'Podaj liczbę godzin większą od zera.';
    else if (hours > LIMITS.hours) errors.hours = 'Najwyżej ' + LIMITS.hours + ' godzin naraz.';
    if (note.length > LIMITS.note) errors.note = 'Opis może mieć najwyżej ' + LIMITS.note + ' znaków.';
    var list = Array.isArray(stage.adjustments) ? stage.adjustments : [];
    if (list.length >= LIMITS.perStage) errors.hours = 'Etap ma już maksymalną liczbę korekt.';
    if (Object.keys(errors).length) return { valid: false, errors: errors, stage: null };

    var max = 0;
    list.forEach(function (a) {
      var m = /^a-(\d+)$/.exec(String(a.id));
      if (m) max = Math.max(max, Number(m[1]));
    });
    var at = (now instanceof Date ? now : new Date()).toISOString();
    var entry = { id: 'a-' + (max + 1), hours: Math.round(hours * 100) / 100, note: note, by: personId || '', at: at };
    return { valid: true, errors: {}, stage: Object.assign({}, stage, { adjustments: list.concat([entry]) }) };
  }

  function removeAdjustment(stage, id) {
    var list = Array.isArray(stage.adjustments) ? stage.adjustments : [];
    return Object.assign({}, stage, { adjustments: list.filter(function (a) { return a.id !== id; }) });
  }

  /** Czyszczenie korekt z zapisu (kolekcja dowolnego pochodzenia). */
  function normalizeAdjustments(raw) {
    var seen = {};
    return (Array.isArray(raw) ? raw : []).reduce(function (acc, item) {
      if (!item || typeof item !== 'object') return acc;
      var hours = Number(item.hours);
      var id = text(item.id);
      if (!Number.isFinite(hours) || hours <= 0 || hours > LIMITS.hours || !id || seen[id] || acc.length >= LIMITS.perStage) return acc;
      seen[id] = true;
      acc.push({
        id: id,
        hours: Math.round(hours * 100) / 100,
        note: text(item.note).slice(0, LIMITS.note),
        by: text(item.by),
        at: typeof item.at === 'string' ? item.at : ''
      });
      return acc;
    }, []);
  }

  /**
   * Zużycie etapu z uwzględnieniem tego, co widzi osoba:
   * `hours` jest null, gdy osoba widzi tylko procent.
   */
  function view(project, stage, entries, personId, people, now) {
    var u = usage(project, stage, entries, now);
    var exact = canSeeHours(personId, project, people);
    return {
      percent: u.percent, ratio: u.ratio, state: u.state, exact: exact,
      planned: exact ? u.planned : null,
      used: exact ? u.used : null,
      logged: exact ? u.logged : null,
      bonus: exact ? u.bonus : null
    };
  }

  var api = {
    WARN_AT: WARN_AT, LIMITS: LIMITS,
    usage: usage, view: view, canSeeHours: canSeeHours, canAdjust: canAdjust, isManagement: isManagement,
    addAdjustment: addAdjustment, removeAdjustment: removeAdjustment, normalizeAdjustments: normalizeAdjustments
  };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Budget = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
