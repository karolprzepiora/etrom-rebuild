/* ETROM — wyjazdy (teren, spotkanie). Czyste funkcje, bez DOM.
   Wyjazd nie zmienia godzin planu ani licznika czasu: to tylko informacja „gdzie ta osoba będzie”.
   Każdy dodaje wyjazdy sobie; Lider (swojego zespołu) i Dyrekcja mogą dodawać innym. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Team = node ? require('./team.js') : root.ETROM.Team;

  var KINDS = { field: 'Teren', meeting: 'Spotkanie' };

  function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00')); }
  function str(v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; }
  function stamp(v) { return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : ''; }

  function normalize(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).map(function (t) {
      if (!t || !isDay(t.from) || !isDay(t.to) || t.to < t.from) return null;
      var ids = (Array.isArray(t.personIds) ? t.personIds : []).filter(function (x, i, a) { return typeof x === 'string' && x && a.indexOf(x) === i; }).slice(0, 30);
      if (!ids.length) return null;
      var id = typeof t.id === 'string' && t.id && !seen[t.id] ? t.id : '';
      if (id) seen[id] = true;
      return {
        id: id, personIds: ids, kind: KINDS[t.kind] ? t.kind : 'field', from: t.from, to: t.to,
        place: str(t.place, 120), projectId: typeof t.projectId === 'string' && t.projectId ? t.projectId : null,
        note: str(t.note, 300), notify: t.notify === true, createdBy: str(t.createdBy, 40), createdAt: stamp(t.createdAt)
      };
    }).filter(Boolean).map(function (t, i, all) {
      if (!t.id) { var n = 1; var used = all.map(function (x) { return x.id; }); while (used.indexOf('t-' + n) >= 0) n += 1; t.id = 't-' + n; }
      return t;
    });
  }

  function validate(data, people) {
    var errors = {};
    var d = data || {};
    var ids = Array.isArray(d.personIds) ? d.personIds : [];
    if (!ids.length || !ids.every(function (id) { return (people || []).some(function (p) { return p.id === id; }); })) errors.personIds = 'Wybierz, kto jedzie.';
    if (!KINDS[d.kind]) errors.kind = 'Wybierz rodzaj wyjazdu.';
    if (!isDay(d.from)) errors.from = 'Podaj datę początku.';
    if (!isDay(d.to)) errors.to = 'Podaj datę końca.';
    else if (isDay(d.from) && d.to < d.from) errors.to = 'Koniec nie może być przed początkiem.';
    if (!str(d.place, 120)) errors.place = 'Podaj miejsce.';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function save(list, data, people, byId, now) {
    var check = validate(data, people);
    var current = normalize(list);
    if (!check.valid) return { valid: false, errors: check.errors, list: current };
    var existing = data.id ? current.filter(function (t) { return t.id === data.id; })[0] : null;
    var row = Object.assign({}, existing || { createdBy: byId || '', createdAt: (now instanceof Date ? now : new Date()).toISOString() }, {
      id: data.id || '', personIds: data.personIds, kind: data.kind, from: data.from, to: data.to, place: data.place,
      projectId: data.projectId || null, note: data.note || '', notify: data.notify === true
    });
    var next = data.id ? current.map(function (t) { return t.id === data.id ? row : t; }) : current.concat([row]);
    return { valid: true, errors: {}, list: normalize(next) };
  }

  function remove(list, id) { return normalize(list).filter(function (t) { return t.id !== id; }); }

  /** Wyjazdy obejmujące dzień `iso` (opcjonalnie tylko osoby `personId`). */
  function onDay(list, iso, personId) {
    return (list || []).filter(function (t) { return t.from <= iso && t.to >= iso && (!personId || t.personIds.indexOf(personId) >= 0); });
  }

  function leaderOfPerson(viewerId, personId, projects) {
    return (projects || []).some(function (p) { return p.team && p.team.leader === viewerId && Team.projectPeople(p.team).indexOf(personId) >= 0; });
  }

  /** Czy `viewerId` może dodać wyjazd osobie `personId`: sobie zawsze, innym — Dyrekcja i Lider jej projektu. */
  function canAddFor(viewerId, personId, people, projects) {
    if (!viewerId || !personId) return false;
    if (viewerId === personId) return true;
    var me = (people || []).filter(function (p) { return p.id === viewerId; })[0];
    if (me && me.orgRole === 'managing') return true;
    return leaderOfPerson(viewerId, personId, projects);
  }

  /** Osoby, którym `viewerId` może dodać wyjazd. */
  function assignable(viewerId, people, projects) {
    return (people || []).filter(function (p) { return canAddFor(viewerId, p.id, people, projects); });
  }

  /** Wyjazd może zmienić (usunąć) jego autor, Dyrekcja albo Lider wszystkich jadących. */
  function canEdit(viewerId, trip, people, projects) {
    if (!viewerId || !trip) return false;
    if (trip.createdBy === viewerId) return true;
    var me = (people || []).filter(function (p) { return p.id === viewerId; })[0];
    if (me && me.orgRole === 'managing') return true;
    return trip.personIds.every(function (id) { return id === viewerId || leaderOfPerson(viewerId, id, projects); });
  }

  var api = { KINDS: KINDS, normalize: normalize, validate: validate, save: save, remove: remove, onDay: onDay, canAddFor: canAddFor, assignable: assignable, canEdit: canEdit };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Trips = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
