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

  var LIMITS = { subject: 300, counterparty: 200, number: 120, summary: 2000, where: 300 };

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

    if (!Object.prototype.hasOwnProperty.call(DIRECTIONS, direction)) errors.direction = 'Wybierz kierunek: przychodzące albo wychodzące.';
    if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) errors.kind = 'Wybierz rodzaj pisma.';
    if (!subject) errors.subject = 'Podaj temat pisma.';
    else if (subject.length > LIMITS.subject) errors.subject = 'Temat może mieć najwyżej ' + LIMITS.subject + ' znaków.';
    if (!counterparty) errors.counterparty = direction === 'out' ? 'Podaj adresata.' : 'Podaj nadawcę.';
    else if (counterparty.length > LIMITS.counterparty) errors.counterparty = 'Najwyżej ' + LIMITS.counterparty + ' znaków.';
    if (!isDate(registeredDate)) errors.registeredDate = direction === 'out' ? 'Podaj datę wysłania.' : 'Podaj datę wpływu.';
    if (letterDate && !isDate(letterDate)) errors.letterDate = 'Użyj poprawnej daty.';
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
        needsAction: direction === 'in' && data.needsAction === true
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
        replyTo: text(item.replyTo)
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

  var api = {
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
