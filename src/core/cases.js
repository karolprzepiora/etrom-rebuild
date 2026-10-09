/* ETROM — sprawy w toku: wniosek złożony, materiał zamówiony, odpowiedź oczekiwana od organu lub klienta.
   Sprawa nie jest zadaniem: zostaje widoczna z licznikiem dni od złożenia, aż ją zakończysz.
   Czyste funkcje, bez DOM. Terminów ustawowych nie liczymy: tylko dni od złożenia. Bez przypomnień. */
(function (root) {
  'use strict';

  var STATUS = { open: 'W toku', closed: 'Zakończona', skipped: 'Pominięta' };
  var KINDS = { filed: 'Złożono', letter: 'Pismo od organu', call: 'Dopytano', filled: 'Uzupełniono', note: 'Notatka' };
  // Zadania, po których zwykle czeka się na kogoś z zewnątrz (organ, klient, dostawca): złożenie, zamówienie, wystąpienie, zgłoszenie.
  // Praca własna (opracowanie, operat, dokumentacja) i zwykłe „wyślij/przekaż” nie uruchamiają pytania.
  var FILING = /^\s*(z[łl]o[żz](yć|enie)|wystąpi(ć|enie)|zam[óo]wi(ć|enie)|zg[łl]o(si[ćc]|szenie)|skierowa(ć|nie)|wy[śs][łl]a(ć|nie)\s+(wniosek|wniosku|zapytanie|pro[śs]b|pism)|uzyska(ć|nie)|zapyta(ć|nie)\s+o)/i;

  function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00')); }
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayOf(iso) { return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))); }
  function addDays(iso, n) { var d = dayOf(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  function diffDays(from, to) { return Math.round((dayOf(to) - dayOf(from)) / 86400000); }
  function str(v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; }

  function looksLikeFiling(name) { return typeof name === 'string' && FILING.test(name); }

  function normalizeEvent(e, i) {
    if (!e || !KINDS[e.kind] || !isDay(e.at)) return null;
    return { id: str(e.id, 20) || 'e-' + (i + 1), kind: e.kind, at: e.at, note: str(e.note, 300), taskId: str(e.taskId, 40), stageId: str(e.stageId, 60), by: str(e.by, 40) };
  }

  function normalize(list, projectIds) {
    var seen = {};
    var known = Array.isArray(projectIds) ? projectIds : null;
    var out = (Array.isArray(list) ? list : []).map(function (c) {
      if (!c || !isDay(c.startedAt) || typeof c.name !== 'string' || !c.name.trim()) return null;
      if (known && known.indexOf(c.projectId) < 0) return null;
      var id = typeof c.id === 'string' && c.id && !seen[c.id] ? c.id : '';
      if (id) seen[id] = true;
      var status = STATUS[c.status] ? c.status : 'open';
      return {
        id: id, projectId: c.projectId, stageId: str(c.stageId, 60), name: str(c.name, 120), org: str(c.org, 120),
        ownerId: str(c.ownerId, 40), startedAt: c.startedAt,
        status: status, closedAt: status === 'closed' && isDay(c.closedAt) ? c.closedAt : '', closedNote: str(c.closedNote, 300),
        sourceTaskId: str(c.sourceTaskId, 40),
        events: (Array.isArray(c.events) ? c.events : []).map(normalizeEvent).filter(Boolean)
      };
    }).filter(Boolean);
    out.forEach(function (c) {
      if (!c.id) { var n = 1; while (seen['c-' + n]) n += 1; c.id = 'c-' + n; seen['c-' + n] = true; }
      c.events.forEach(function (e, i) { e.id = e.id || 'e-' + (i + 1); });
    });
    return out;
  }

  function validate(data, projectIds) {
    var d = data || {};
    var errors = {};
    if (!d.projectId || (projectIds && projectIds.indexOf(d.projectId) < 0)) errors.projectId = 'Wybierz projekt.';
    if (!str(d.name, 120)) errors.name = 'Podaj nazwę sprawy.';
    if (!str(d.org, 120) && d.status !== 'skipped') errors.org = 'Podaj, od kogo czekasz.';
    if (!isDay(d.startedAt)) errors.startedAt = 'Podaj datę złożenia.';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  /** Nowa sprawa. @returns {{valid, errors, list, item}} */
  function create(list, data, projectIds) {
    var check = validate(data, projectIds);
    var current = normalize(list, projectIds);
    if (!check.valid) return { valid: false, errors: check.errors, list: current, item: null };
    var raw = {
      id: '', projectId: data.projectId, stageId: data.stageId || '', name: data.name, org: data.org || '', ownerId: data.ownerId || '',
      startedAt: data.startedAt, status: data.status === 'skipped' ? 'skipped' : 'open',
      sourceTaskId: data.sourceTaskId || '',
      events: data.status === 'skipped' ? [] : [{ id: 'e-1', kind: 'filed', at: data.startedAt, note: '', taskId: data.sourceTaskId || '', by: data.ownerId || '' }]
    };
    var next = normalize(current.concat([raw]), projectIds);
    return { valid: true, errors: {}, list: next, item: next[next.length - 1] };
  }

  function update(list, id, change) {
    return (list || []).map(function (c) { return c.id === id ? Object.assign({}, c, change(c)) : c; });
  }

  /** Dopisuje wpis do historii; „dopytano” i notatka tylko trafiają do historii. */
  function addEvent(list, id, event, today) {
    return update(list, id, function (c) {
      var e = normalizeEvent(Object.assign({ at: today }, event), c.events.length);
      if (!e) return {};
      e.id = 'e-' + (c.events.length + 1);
      return { events: c.events.concat([e]) };
    });
  }

  /** Usuwa sprawę (pomyłka); zadanie przypięte zostaje bez zmian. */
  function remove(list, id) { return (list || []).filter(function (c) { return c.id !== id; }); }

  function close(list, id, day, note) { return update(list, id, function () { return { status: 'closed', closedAt: day, closedNote: str(note, 300) }; }); }
  function reopen(list, id) { return update(list, id, function () { return { status: 'open', closedAt: '' }; }); }

  function daysSince(c, today) { return Math.max(0, diffDays(c.startedAt, today)); }
  function open(list) { return (list || []).filter(function (c) { return c.status === 'open'; }); }
  function lastCall(c) { var calls = c.events.filter(function (e) { return e.kind === 'call'; }); return calls.length ? calls[calls.length - 1] : null; }

  /** Sprawa związana z zadaniem (źródło albo pismo dodane jako zadanie). */
  // Identyfikator zadania jest unikalny tylko w etapie (t-1 jest w wielu), więc sprawę dopasowujemy też po projekcie i etapie.
  function byTask(list, taskId, projectId, stageId) {
    if (!taskId) return null;
    return (list || []).filter(function (c) {
      return c.status === 'open' && (projectId == null || c.projectId === projectId) && (function () {
        function sameStage(sid) { return !stageId || !sid || sid === stageId; }
        return (c.sourceTaskId === taskId && sameStage(c.stageId)) || c.events.some(function (e) { return e.kind === 'letter' && e.taskId === taskId && sameStage(e.stageId || c.stageId); });
      })();
    })[0] || null;
  }

  /** Sprawy otwarte, które mają jeszcze swój projekt (po usunięciu projektu nie wiszą bez kontekstu). */
  function visible(list, projects) {
    var ids = {};
    (projects || []).forEach(function (p) { ids[p.id] = true; });
    return open(list).filter(function (c) { return ids[c.projectId]; });
  }

  /** Zadania projektu do wyboru w formularzu sprawy: etap · nazwa. */
  function projectTasks(project, stageName) {
    var out = [];
    ((project && project.stages) || []).forEach(function (st) {
      (st.tasks || []).forEach(function (t) { out.push({ taskId: t.id, stageId: st.id, label: (stageName ? stageName(st) + ' · ' : '') + t.name }); });
    });
    return out;
  }

  function doneDay(task) {
    var h = (task && task.history) || [];
    for (var i = h.length - 1; i >= 0; i -= 1) if (h[i].to === 'done' && typeof h[i].at === 'string') return isoOf(new Date(h[i].at));
    return '';
  }

  /** Zamknięte zadania (w etapach wskazanych przez stageFilter, u nas: etapy „Decyzje”) wyglądające na złożenie/zamówienie, o których nie zdecydowano, czy śledzić je jako sprawę. */
  function pendingDecisions(projects, list, today, windowDays, stageFilter) {
    var decided = {};
    (list || []).forEach(function (c) { if (c.sourceTaskId) decided[c.sourceTaskId] = true; });
    var from = addDays(today, -(windowDays || 30));
    var out = [];
    (projects || []).forEach(function (p) {
      (p.stages || []).forEach(function (st) {
        if (stageFilter && !stageFilter(st)) return;
        (st.tasks || []).forEach(function (t) {
          if (t.status !== 'done' || decided[t.id] || !looksLikeFiling(t.name)) return;
          var at = doneDay(t);
          if (!at || at < from) return;
          out.push({ projectId: p.id, stageId: st.id, taskId: t.id, name: t.name, at: at, assignees: (t.assignees || []).slice() });
        });
      });
    });
    return out.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }

  var api = {
    STATUS: STATUS, KINDS: KINDS, isDay: isDay, isoOf: isoOf, addDays: addDays, diffDays: diffDays,
    looksLikeFiling: looksLikeFiling, normalize: normalize, validate: validate, create: create, addEvent: addEvent,
    remove: remove, close: close, reopen: reopen, daysSince: daysSince, open: open, lastCall: lastCall,
    byTask: byTask, visible: visible, projectTasks: projectTasks, doneDay: doneDay, pendingDecisions: pendingDecisions
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Cases = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
