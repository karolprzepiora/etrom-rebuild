/* ETROM — dziennik korespondencji projektu (poczta przychodząca i wychodząca).
   Czyste funkcje, bez DOM. Wpisy tworzy człowiek; ten sam model przyjmie później
   propozycje z odczytu pism przez AI (patrz docs/KORESPONDENCJA.md).
   Wątek: pismo może wskazywać pismo, na które odpowiada (replyTo) — wtedy
   oczekujące pismo uznajemy za załatwione. */
(function (root) {
  'use strict';

  var nodeEnv = typeof module !== 'undefined' && module.exports;
  var TimeLog = nodeEnv ? require('./timelog.js') : root.ETROM.TimeLog;

  var DIRECTIONS = { in: 'Przychodzące', out: 'Wychodzące' };
  // Przedrostki numeru w dzienniku: P — przychodzące, W — wychodzące.
  var PREFIX = { in: 'P', out: 'W' };

  var KINDS = {
    decision: 'Decyzja',
    ruling: 'Postanowienie',
    summons: 'Wezwanie',
    notice: 'Zawiadomienie',
    opinion: 'Opinia / uzgodnienie',
    application: 'Wniosek',
    inquiry: 'Zapytanie',
    reply: 'Odpowiedź',
    contract: 'Umowa / aneks',
    other: 'Inne'
  };
  var KIND_ORDER = ['decision', 'ruling', 'summons', 'notice', 'opinion', 'application', 'inquiry', 'reply', 'contract', 'other'];

  var LIMITS = { subject: 300, counterparty: 200, number: 120, summary: 2000, where: 300, caseRef: 120, fileName: 200, files: 20, history: 40 };
  // Decyzja o pismie przychodzącym. Puste = nowe (czeka w Skrzynce na decyzję).
  var DECISIONS = { filed: 'Do akt', reply: 'Wymaga odpowiedzi', none: 'Odpowiedź niepotrzebna', case: 'W sprawie' };

  /** Pliki jednego pisma: zapisujemy nazwę, rozmiar i miejsce, nie sam plik (wspólny magazyn plików dojdzie później). */
  function cleanFiles(value) {
    return (Array.isArray(value) ? value : []).slice(0, LIMITS.files).map(function (f) {
      if (!f || typeof f !== 'object') return null;
      var name = text(f.name).slice(0, LIMITS.fileName);
      if (!name) return null;
      var size = Number(f.size);
      return { name: name, size: isFinite(size) && size > 0 ? Math.round(size) : 0, location: text(f.location).slice(0, LIMITS.where) };
    }).filter(Boolean);
  }

  function cleanHistory(value) {
    return (Array.isArray(value) ? value : []).slice(-LIMITS.history).map(function (h) {
      if (!h || typeof h !== 'object' || !text(h.text)) return null;
      return { at: text(h.at).slice(0, 10), by: text(h.by).slice(0, 40), text: text(h.text).slice(0, 200) };
    }).filter(Boolean);
  }

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }

  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var p = value.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }

  function todayKey(now) {
    var d = now instanceof Date ? now : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function nextId(list) {
    var max = 0;
    (list || []).forEach(function (entry) {
      var match = /^m-(\d+)$/.exec(String(entry && entry.id));
      if (match) max = Math.max(max, Number(match[1]));
    });
    return 'm-' + (max + 1);
  }

  /**
   * Numer w dzienniku projektu: P/2026/001 (przychodzące) albo W/2026/001 (wychodzące),
   * rok z daty wpływu/wysłania, numeracja osobno dla projektu, kierunku i roku.
   */
  function registryNumber(list, projectId, direction, date) {
    var year = String(date).slice(0, 4);
    var max = 0;
    (list || []).forEach(function (entry) {
      if (entry.projectId !== projectId || entry.direction !== direction) return;
      var m = /^[PW]\/(\d{4})\/(\d+)$/.exec(entry.regNo || '');
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    });
    return PREFIX[direction] + '/' + year + '/' + String(max + 1).padStart(3, '0');
  }

  /**
   * @param {Object} input pola formularza
   * @param {Array} list wszystkie wpisy (do sprawdzenia replyTo)
   * @returns {{valid: boolean, errors: Object, value: Object}}
   */
  function validate(input, list, projectId) {
    var data = input || {};
    var errors = {};
    var direction = text(data.direction);
    var kind = text(data.kind) || 'other';
    var subject = text(data.subject);
    var counterparty = text(data.counterparty);
    var registeredDate = text(data.registeredDate);
    var letterDate = text(data.letterDate);
    var replyTo = text(data.replyTo);
    var responseDue = text(data.responseDue);

    if (!Object.prototype.hasOwnProperty.call(DIRECTIONS, direction)) errors.direction = 'Wybierz kierunek: przychodzące albo wychodzące.';
    if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) errors.kind = 'Wybierz rodzaj pisma.';
    if (!subject) errors.subject = 'Podaj temat pisma.';
    else if (subject.length > LIMITS.subject) errors.subject = 'Temat może mieć najwyżej ' + LIMITS.subject + ' znaków.';
    if (!counterparty) errors.counterparty = direction === 'out' ? 'Podaj adresata.' : 'Podaj nadawcę.';
    else if (counterparty.length > LIMITS.counterparty) errors.counterparty = 'Najwyżej ' + LIMITS.counterparty + ' znaków.';
    if (!isDate(registeredDate)) errors.registeredDate = direction === 'out' ? 'Podaj datę wysłania.' : 'Podaj datę wpływu.';
    if (letterDate && !isDate(letterDate)) errors.letterDate = 'Użyj poprawnej daty.';
    if (responseDue && !isDate(responseDue)) errors.responseDue = 'Użyj poprawnej daty.';
    if (text(data.caseRef).length > LIMITS.caseRef) errors.caseRef = 'Najwyżej ' + LIMITS.caseRef + ' znaków.';
    if (text(data.number).length > LIMITS.number) errors.number = 'Najwyżej ' + LIMITS.number + ' znaków.';
    if (text(data.summary).length > LIMITS.summary) errors.summary = 'Najwyżej ' + LIMITS.summary + ' znaków.';
    if (replyTo) {
      var target = (list || []).filter(function (e) { return e.id === replyTo && e.projectId === projectId; })[0];
      if (!target) errors.replyTo = 'Pismo, na które odpowiadasz, nie istnieje w tym projekcie.';
      else if (target.direction === direction) errors.replyTo = 'Odpowiedź musi być pismem w przeciwnym kierunku.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      value: {
        direction: direction, kind: kind, subject: subject, counterparty: counterparty,
        registeredDate: registeredDate, letterDate: letterDate, replyTo: replyTo,
        number: text(data.number), summary: text(data.summary), where: text(data.where).slice(0, LIMITS.where),
        // Dziennik jest zwykły; pismo trafia do „Wymaga reakcji” tylko, gdy sam je tak oznaczysz.
        needsAction: direction === 'in' && data.needsAction === true,
        files: cleanFiles(data.files),
        ownerId: direction === 'in' ? text(data.ownerId).slice(0, 40) : '',
        responseDue: direction === 'in' ? responseDue : '',
        caseRef: direction === 'in' ? text(data.caseRef).slice(0, LIMITS.caseRef) : '',
        decision: direction === 'in' && DECISIONS[text(data.decision)] ? text(data.decision) : '',
        caseId: direction === 'in' ? text(data.caseId).slice(0, 40) : '',
        history: cleanHistory(data.history)
      }
    };
  }

  function create(list, projectId, input, meta) {
    var check = validate(input, list, projectId);
    if (!check.valid) return { valid: false, errors: check.errors, entries: list };
    var stamp = (meta && meta.now instanceof Date ? meta.now : new Date()).toISOString();
    var entry = Object.assign({
      id: nextId(list),
      projectId: projectId,
      regNo: registryNumber(list, projectId, check.value.direction, check.value.registeredDate),
      createdBy: meta && meta.personId ? meta.personId : '',
      createdAt: stamp,
      updatedAt: stamp
    }, check.value);
    return { valid: true, errors: {}, entry: entry, entries: (list || []).concat([entry]) };
  }

  function update(list, id, input, meta) {
    var target = (list || []).filter(function (e) { return e.id === id; })[0];
    if (!target) return { valid: false, errors: { id: 'Nie ma takiego pisma.' }, entries: list };
    var check = validate(input, list, target.projectId);
    if (!check.valid) return { valid: false, errors: check.errors, entries: list };
    if (check.value.direction !== target.direction && list.some(function (e) { return e.replyTo === id; })) {
      return { valid: false, errors: { direction: 'Na to pismo są już odpowiedzi — nie można zmienić kierunku.' }, entries: list };
    }
    var stamp = (meta && meta.now instanceof Date ? meta.now : new Date()).toISOString();
    // Numer w dzienniku nie zmienia się przy edycji; wyjątek — zmiana kierunku albo roku.
    var keepNumber = target.direction === check.value.direction && String(target.registeredDate).slice(0, 4) === check.value.registeredDate.slice(0, 4);
    var next = Object.assign({}, target, check.value, {
      decision: check.value.direction === 'in' ? target.decision || '' : '', caseId: check.value.direction === 'in' ? target.caseId || '' : '', history: cleanHistory(target.history),
      regNo: keepNumber ? target.regNo : registryNumber(list.filter(function (e) { return e.id !== id; }), target.projectId, check.value.direction, check.value.registeredDate),
      updatedAt: stamp
    });
    return { valid: true, errors: {}, entry: next, entries: list.map(function (e) { return e.id === id ? next : e; }) };
  }

  /** Usunięcie pisma odpina odpowiedzi, które się na nie powoływały. */
  function remove(list, id) {
    return (list || []).filter(function (e) { return e.id !== id; }).map(function (e) {
      return e.replyTo === id ? Object.assign({}, e, { replyTo: '' }) : e;
    });
  }

  /**
   * Stan oczekiwania na odpowiedź.
   *  - 'none': brak terminu odpowiedzi albo odpowiedź nie jest wymagana,
   *  - 'answered': istnieje pismo w przeciwnym kierunku z replyTo = to pismo,
   *  - 'waiting' / 'overdue': termin przed nami / minął (days: ujemne po terminie).
   */
  function replyState(entry, list, now) {
    if (!entry || !entry.needsAction) return { state: 'none', due: '', days: null };
    var answered = (list || []).some(function (e) { return e.replyTo === entry.id; });
    if (answered) return { state: 'answered', due: '', days: null };
    return { state: 'waiting', due: '', days: null };
  }

  /** Pisma czekające na odpowiedź w projekcie, najpilniejsze pierwsze. */
  function pending(list, projectId, now) {
    return (list || [])
      .filter(function (e) { return e.projectId === projectId; })
      .map(function (e) { return { entry: e, reply: replyState(e, list, now) }; })
      .filter(function (x) { return x.reply.state === 'waiting' || x.reply.state === 'overdue'; })
      .sort(function (a, b) { return a.entry.registeredDate < b.entry.registeredDate ? -1 : (a.entry.registeredDate > b.entry.registeredDate ? 1 : 0); });
  }

  function forProject(list, projectId) {
    return (list || []).filter(function (e) { return e.projectId === projectId; });
  }

  /**
   * Filtr i kolejność dziennika: najnowsze pierwsze (po dacie w dzienniku).
   * @param {{direction?: string, query?: string, waiting?: boolean, now?: Date}} options
   */
  function filter(list, options) {
    var o = options || {};
    var q = text(o.query).toLowerCase();
    return (list || []).filter(function (e) {
      if (o.direction && o.direction !== 'all' && e.direction !== o.direction) return false;
      if (o.waiting) {
        var s = replyState(e, list, o.now).state;
        if (s !== 'waiting' && s !== 'overdue') return false;
      }
      if (q) {
        var hay = [e.subject, e.counterparty, e.number, e.regNo, e.summary, KINDS[e.kind]].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      if (a.registeredDate !== b.registeredDate) return a.registeredDate < b.registeredDate ? 1 : -1;
      return a.regNo < b.regNo ? 1 : (a.regNo > b.regNo ? -1 : 0);
    });
  }

  function normalizeEntries(source, projectIds) {
    var ids = Array.isArray(projectIds) ? projectIds : [];
    var seen = {};
    var out = [];
    (Array.isArray(source) ? source : []).forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      if (ids.indexOf(item.projectId) < 0) return;
      if (typeof item.id !== 'string' || seen[item.id]) return;
      var check = validate(item, [], item.projectId);
      // Nie odrzucamy wpisu przez replyTo: powiązanie sprawdzamy osobno poniżej.
      var errors = Object.assign({}, check.errors);
      delete errors.replyTo;
      if (Object.keys(errors).length) return;
      seen[item.id] = true;
      out.push(Object.assign({}, check.value, {
        id: item.id,
        projectId: item.projectId,
        regNo: typeof item.regNo === 'string' ? item.regNo : '',
        createdBy: typeof item.createdBy === 'string' ? item.createdBy : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
        replyTo: text(item.replyTo),
        decision: check.value.direction === 'in' && DECISIONS[text(item.decision)] ? text(item.decision) : ''
      }));
    });
    var byId = {};
    out.forEach(function (e) { byId[e.id] = e; });
    return out.map(function (e) {
      var target = e.replyTo ? byId[e.replyTo] : null;
      return target && target.projectId === e.projectId && target.direction !== e.direction ? e : Object.assign({}, e, { replyTo: '' });
    });
  }

  /** Zadania wywołane pismem (task.mailId) wraz z etapem i zapisanym czasem w godzinach. */
  function linkedTasks(project, mailId, entries, now) {
    var out = [];
    ((project && project.stages) || []).forEach(function (stage) {
      (stage.tasks || []).forEach(function (task) {
        if (task.mailId !== mailId) return;
        var minutes = (entries || []).filter(function (e) { return e.projectId === project.id && e.taskId === task.id; })
          .reduce(function (t, e) { return t + TimeLog.minutes(e, now); }, 0);
        out.push({ stage: stage, task: task, hours: Math.round(minutes / 6) / 10 });
      });
    });
    return out;
  }

  /**
   * Kto „trzyma” pismo oczekujące na odpowiedź:
   *  new      — nikt się nie zajął (brak zadania z pisma) → czeka w „Wymaga reakcji”,
   *  taken    — jest otwarte zadanie → sprawę prowadzi zadanie (termin, wykonawca, czas),
   *  finished — zadania zakończone, a odpowiedzi nie zarejestrowano → trzeba ją wpisać do dziennika.
   * @param {Array} linked wynik linkedTasks
   */
  function handling(linked) {
    var rows = linked || [];
    if (!rows.length) return 'new';
    return 'taken';
  }

  function dayDiff(from, to) {
    var a = from.split('-').map(Number);
    var b = to.split('-').map(Number);
    return Math.round((new Date(b[0], b[1] - 1, b[2]) - new Date(a[0], a[1] - 1, a[2])) / 86400000);
  }

  function addDaysKey(key, n) {
    var p = key.split('-').map(Number);
    return todayKey(new Date(p[0], p[1] - 1, p[2] + n));
  }

  /** Kto zajmuje się pismem: wskazana osoba, a bez niej lider, koordynator i na końcu rejestrujący. */
  function ownerOf(entry, project) {
    if (entry && entry.ownerId) return entry.ownerId;
    var team = (project && project.team) || {};
    return team.leader || team.coordinator || (entry && entry.createdBy) || '';
  }

  var STATES = {
    new: { label: 'Nowe', tone: 'accent' },
    filed: { label: 'Do akt', tone: 'neutral' },
    inprogress: { label: 'Odpowiedź w toku', tone: 'info' },
    atrisk: { label: 'Odpowiedź zagrożona', tone: 'danger' },
    finished: { label: 'Zadanie zakończone, brak odpowiedzi', tone: 'warning' },
    case: { label: 'W sprawie', tone: 'review' },
    answered: { label: 'Odpowiedziano', tone: 'success' },
    out: { label: 'Wychodzące', tone: 'neutral' }
  };

  /**
   * Stan pisma przychodzącego w obiegu: nowe → decyzja → odpowiedź.
   * @param {Object} project projekt pisma (do zadań z pisma); bez niego liczymy tylko z samego wpisu
   * @returns {{state: string, label: string, tone: string, due: string, days: (number|null)}}
   */
  function incomingState(entry, list, project, entries, now) {
    function out(state, due, days) { return { state: state, label: STATES[state].label, tone: STATES[state].tone, due: due || '', days: days === undefined ? null : days }; }
    if (!entry || entry.direction !== 'in') return out('out');
    if ((list || []).some(function (e) { return e.replyTo === entry.id; })) return out('answered');
    var today = todayKey(now);
    var due = entry.responseDue || '';
    var days = due ? dayDiff(today, due) : null;
    var linked = project ? linkedTasks(project, entry.id, entries, now) : [];
    // Pismo ze starego dziennika, z którego zrobiono zadanie, traktujemy jak „wymaga odpowiedzi”.
    var decision = entry.decision || (entry.needsAction && linked.length ? 'reply' : '');
    if (decision === 'case') return out('case');
    if (decision === 'filed' || decision === 'none') return out('filed');
    if (decision === 'reply') {
      if (!linked.length) return out('new', due, days);
      var open = linked.filter(function (x) { return x.task.status !== 'done'; });
      if (!open.length) return out('finished', due, days);
      var late = open.some(function (x) { return due && x.task.deadline && String(x.task.deadline).slice(0, 10) > due; });
      return out(days !== null && (days <= 2 || late) ? 'atrisk' : 'inprogress', due, days);
    }
    if (entry.needsAction) return out('new', due, days);
    return out('filed');
  }

  function stamp(entry, textLine, meta) {
    var now = meta && meta.now instanceof Date ? meta.now : new Date();
    var history = cleanHistory(entry.history).concat([{ at: todayKey(now), by: meta && meta.personId ? meta.personId : '', text: textLine }]);
    return history.slice(-LIMITS.history);
  }

  /**
   * Decyzja o pismie przychodzącym.
   * choice: 'file' (do akt), 'none' (odpowiedź niepotrzebna), 'reply' (wymaga odpowiedzi; opts.responseDue),
   * 'case' (opts.caseId), 'reassign' (opts.ownerId).
   */
  function decide(list, id, choice, opts, meta) {
    var o = opts || {};
    var target = (list || []).filter(function (e) { return e.id === id; })[0];
    if (!target || target.direction !== 'in') return { valid: false, errors: { id: 'Nie ma takiego pisma przychodzącego.' }, entries: list };
    var patch;
    if (choice === 'file') patch = { decision: 'filed', needsAction: false, line: 'Do akt' };
    else if (choice === 'none') patch = { decision: 'none', needsAction: false, line: 'Odpowiedź niepotrzebna' };
    else if (choice === 'case') {
      if (!text(o.caseId)) return { valid: false, errors: { caseId: 'Wybierz sprawę.' }, entries: list };
      patch = { decision: 'case', caseId: text(o.caseId), needsAction: false, line: 'Dołączono do sprawy' };
    } else if (choice === 'reply') {
      if (o.responseDue && !isDate(o.responseDue)) return { valid: false, errors: { responseDue: 'Użyj poprawnej daty.' }, entries: list };
      patch = { decision: 'reply', needsAction: true, responseDue: text(o.responseDue) || target.responseDue || '', line: 'Wymaga odpowiedzi' + (o.responseDue ? ' do ' + o.responseDue : '') };
    } else if (choice === 'reassign') {
      patch = { ownerId: text(o.ownerId), line: 'Przekazano' };
    } else return { valid: false, errors: { choice: 'Nieznana decyzja.' }, entries: list };
    var line = patch.line;
    delete patch.line;
    var stampIso = (meta && meta.now instanceof Date ? meta.now : new Date()).toISOString();
    var next = Object.assign({}, target, patch, { history: stamp(target, line, meta), updatedAt: stampIso });
    return { valid: true, errors: {}, entry: next, entries: list.map(function (e) { return e.id === id ? next : e; }) };
  }

  /** Pismo wpisane do dziennika po raz pierwszy ma wpis w historii. */
  function withRegistered(entry, meta) {
    return Object.assign({}, entry, { history: stamp(entry, 'Zarejestrowano', meta) });
  }

  /** Pisma przychodzące projektu czekające w Skrzynce: nowe, z zakończonym zadaniem bez odpowiedzi albo z zagrożonym terminem. */
  function inboxEntries(list, project, entries, now) {
    var wanted = { new: 1, finished: 1, atrisk: 1 };
    return (list || []).filter(function (e) { return e.projectId === project.id && e.direction === 'in'; })
      .map(function (e) { return { entry: e, flow: incomingState(e, list, project, entries, now) }; })
      .filter(function (x) { return wanted[x.flow.state]; })
      .sort(function (a, b) { return a.entry.registeredDate < b.entry.registeredDate ? -1 : (a.entry.registeredDate > b.entry.registeredDate ? 1 : 0); });
  }

  var api = {
    DECISIONS: DECISIONS,
    STATES: STATES,
    cleanFiles: cleanFiles,
    ownerOf: ownerOf,
    incomingState: incomingState,
    decide: decide,
    withRegistered: withRegistered,
    inboxEntries: inboxEntries,
    addDaysKey: addDaysKey,
    handling: handling,
    linkedTasks: linkedTasks,
    DIRECTIONS: DIRECTIONS,
    KINDS: KINDS,
    KIND_ORDER: KIND_ORDER,
    LIMITS: LIMITS,
    isDate: isDate,
    todayKey: todayKey,
    nextId: nextId,
    registryNumber: registryNumber,
    validate: validate,
    create: create,
    update: update,
    remove: remove,
    replyState: replyState,
    pending: pending,
    forProject: forProject,
    filter: filter,
    normalizeEntries: normalizeEntries
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Mail = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
