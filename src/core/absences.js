/* ETROM — nieobecności osób (urlop, zwolnienie, szkolenie). Czyste funkcje, bez DOM.
   Nieobecność zmniejsza pojemność tygodnia w planie i nie liczy się jako dzień z niedoborem godzin w karcie czasu. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Cal = node ? require('./calendar.js') : root.ETROM.Calendar;

  var KINDS = { leave: 'Urlop', sick: 'Zwolnienie', training: 'Szkolenie', other: 'Inna nieobecność' };

  function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00')); }
  function dayOf(iso) { return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))); }
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function normalize(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).map(function (a) {
      if (!a || typeof a.personId !== 'string' || !isDay(a.from) || !isDay(a.to) || a.to < a.from) return null;
      var id = typeof a.id === 'string' && a.id && !seen[a.id] ? a.id : '';
      return { id: id, personId: a.personId, from: a.from, to: a.to, kind: KINDS[a.kind] ? a.kind : 'leave', note: typeof a.note === 'string' ? a.note.trim().slice(0, 200) : '' };
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
    var row = { id: data.id || '', personId: data.personId, from: data.from, to: data.to, kind: data.kind, note: data.note || '' };
    var next = data.id ? current.map(function (a) { return a.id === data.id ? row : a; }) : current.concat([row]);
    return { valid: true, errors: {}, list: normalize(next) };
  }

  function remove(list, id) { return normalize(list).filter(function (a) { return a.id !== id; }); }

  /** Dni robocze nieobecności osoby: { 'YYYY-MM-DD': rodzaj } (soboty i niedziele pomijane). */
  function daysOf(list, personId) {
    var out = {};
    (list || []).forEach(function (a) {
      if (a.personId !== personId) return;
      for (var d = dayOf(a.from); isoOf(d) <= a.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6 && !Cal.isHoliday(isoOf(d))) out[isoOf(d)] = a.kind;
      }
    });
    return out;
  }

  var api = { KINDS: KINDS, normalize: normalize, validate: validate, save: save, remove: remove, daysOf: daysOf, isoOf: isoOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Absences = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
