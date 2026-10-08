/* ETROM — zadania wewnątrz etapu.
   Przepływ statusów przeniesiony z poprzedniej wersji ETROM.
   Czyste funkcje: żadna z nich nie zmienia danych wejściowych. */
(function (root) {
  'use strict';

  var TASK_STATUS = {
    todo: 'Do wykonania',
    working: 'W toku',
    review: 'Do zatwierdzenia',
    changes: 'Do poprawy',
    done: 'Zakończone'
  };

  // Dozwolone przejścia. Do poprawy wymaga podania powodu.
  var TRANSITIONS = {
    todo: ['working', 'review', 'done'],
    working: ['review', 'done'],
    review: ['done', 'changes'],
    changes: ['working', 'review', 'done'],
    done: ['todo']
  };

  // Dawne „małe / średnie / duże” zadania nie są już nigdzie pokazywane ani wybierane (nakład wynika z czasu na zadanie).
  // Zostają tylko jako ukryta podpowiedź godzin dla starych danych bez szacunku (core/plan.js).
  var LEGACY_WORKLOAD = ['small', 'medium', 'large', 'veryLarge'];

  // Stan udziału pojedynczego realizatora w zadaniu wieloosobowym.
  var PART_STATUS = { todo: 'Do wykonania', working: 'W toku', done: 'Gotowe' };
  var PART_CYCLE = ['todo', 'working', 'done'];

  var LIMITS = { name: 200, reason: 500, description: 2000 };

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function isDateTime(value) {
    return typeof value === 'string' && value !== '' && Number.isFinite(Date.parse(value));
  }

  function isDay(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!m) return false;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
  }

  function nextTaskId(tasks) {
    var max = 0;
    (tasks || []).forEach(function (task) {
      var match = /^t-(\d+)$/.exec(String(task && task.id));
      if (match) max = Math.max(max, Number(match[1]));
    });
    return 't-' + (max + 1);
  }

  /**
   * @param {Object} input
   * @param {Array} available identyfikatory osób, które wolno przypisać
   * @returns {{valid: boolean, errors: Object, value: Object}}
   */
  function validateTask(input, available) {
    var data = input || {};
    var allowed = Array.isArray(available) ? available : [];
    var errors = {};

    var name = text(data.name);
    var deadline = text(data.deadline);
    var start = text(data.start).slice(0, 10);
    var estimateRaw = String(data.estimate === undefined || data.estimate === null ? '' : data.estimate).trim().replace(',', '.');
    var estimate = estimateRaw === '' ? 0 : Number(estimateRaw);
    var assignees = Array.isArray(data.assignees) ? data.assignees.filter(Boolean) : [];

    if (!name) errors.name = 'Podaj nazwę zadania.';
    else if (name.length > LIMITS.name) errors.name = 'Nazwa może mieć najwyżej ' + LIMITS.name + ' znaków.';

    if (deadline && data.draft !== true && !isDateTime(deadline)) errors.deadline = 'Użyj poprawnej daty.';
    if (!Number.isFinite(estimate) || estimate < 0 || estimate > 2000) errors.estimate = 'Podaj czas pracy od pół godziny do 250 dni albo zostaw puste.';
    else if (estimate > 0 && estimate < 0.5) errors.estimate = 'Najmniejszy szacunek to pół godziny.';

    if (start && !isDay(start)) errors.start = 'Użyj poprawnej daty.';
    else if (start && deadline && isDateTime(deadline) && start > deadline.slice(0, 10)) errors.start = 'Start nie może być po terminie.';

    var isDraft = data.draft === true;
    if (isDraft) { assignees = []; deadline = ''; start = ''; }
    var unknown = assignees.filter(function (id) { return allowed.indexOf(id) < 0; });
    if (unknown.length) errors.assignees = 'Realizatorem może być tylko osoba z zespołu projektu.';

    var unique = [];
    assignees.forEach(function (id) { if (unique.indexOf(id) < 0) unique.push(id); });

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      value: {
        name: name,
        start: start,
        deadline: deadline,
        estimate: estimate > 0 ? Math.round(estimate * 10) / 10 : 0,
        assignees: unique,
        description: text(data.description).slice(0, LIMITS.description),
        important: data.important === true,
        // Szkic: zadanie zaplanowane z góry, bez osób i terminu; widzi je tylko zarząd i lider.
        draft: data.draft === true,
        // Zadanie z rezerwy etapu (np. uzupełnienia w postępowaniu).
        fromReserve: data.fromReserve === true,
        mailId: text(data.mailId).slice(0, 60)
      }
    };
  }

  function emptyParts(assignees) {
    var parts = {};
    (assignees || []).forEach(function (id) { parts[id] = 'todo'; });
    return parts;
  }

  function createTask(input, tasks, available) {
    var check = validateTask(input, available);
    if (!check.valid) throw new Error('Dane zadania są niepoprawne.');
    return Object.assign({
      id: nextTaskId(tasks),
      status: 'todo',
      parts: emptyParts(check.value.assignees),
      history: [],
      createdAt: new Date().toISOString()
    }, check.value);
  }

  /** Zmiana danych zadania. Zachowuje status, historię i stany udziału. */
  function updateTask(task, input, available) {
    var check = validateTask(input, available);
    if (!check.valid) throw new Error('Dane zadania są niepoprawne.');
    var parts = {};
    check.value.assignees.forEach(function (id) {
      parts[id] = (task.parts && task.parts[id]) || 'todo';
    });
    return Object.assign({}, task, check.value, { parts: parts });
  }

  function canMove(from, to) {
    return (TRANSITIONS[from] || []).indexOf(to) >= 0;
  }

  /** Lista statusów, na które wolno przejść z bieżącego. */
  function nextStatuses(status) {
    return (TRANSITIONS[status] || []).slice();
  }

  /**
   * Przenosi zadanie do nowego statusu.
   * @returns {{ok: boolean, error: string, task: (Object|null)}}
   */
  function moveTask(task, next, reason, by) {
    if (!task) return { ok: false, error: 'Brak zadania.', task: null };
    if (!canMove(task.status, next)) {
      return { ok: false, error: 'Niedozwolona zmiana statusu.', task: null };
    }
    var note = text(reason);
    if (next === 'changes' && !note) {
      return { ok: false, error: 'Opisz, co wymaga poprawy.', task: null };
    }

    var entry = {
      from: task.status,
      to: next,
      reason: note.slice(0, LIMITS.reason),
      at: new Date().toISOString(),
      by: text(by)
    };

    var moved = Object.assign({}, task, {
      status: next,
      history: (task.history || []).concat([entry])
    });

    if (next === 'changes') moved.feedback = entry.reason;
    // Zamknięcie zadania zamyka udziały wszystkich realizatorów.
    if (next === 'done') {
      moved.parts = {};
      (task.assignees || []).forEach(function (id) { moved.parts[id] = 'done'; });
    }
    // Wznowienie otwiera je z powrotem.
    if (next === 'todo') moved.parts = emptyParts(task.assignees);

    return { ok: true, error: '', task: moved };
  }

  function partStatus(task, personId) {
    if (!task || !task.parts) return 'todo';
    return Object.prototype.hasOwnProperty.call(task.parts, personId) ? task.parts[personId] : 'todo';
  }

  /** Przestawia udział jednej osoby na kolejny stan w cyklu. */
  function cyclePart(task, personId) {
    if (!task || (task.assignees || []).indexOf(personId) < 0) return task;
    var current = partStatus(task, personId);
    var next = PART_CYCLE[(PART_CYCLE.indexOf(current) + 1) % PART_CYCLE.length];
    var parts = Object.assign({}, task.parts);
    parts[personId] = next;
    return Object.assign({}, task, { parts: parts });
  }

  /** Czy wszyscy realizatorzy zamknęli swój udział. */
  function allPartsDone(task) {
    var list = (task && task.assignees) || [];
    if (!list.length) return false;
    return list.every(function (id) { return partStatus(task, id) === 'done'; });
  }

  function isOpen(task) {
    return !!task && task.status !== 'done';
  }

  function isOverdue(task, now) {
    if (!isOpen(task) || !isDateTime(task.deadline)) return false;
    var reference = now instanceof Date ? now.getTime() : Date.now();
    return Date.parse(task.deadline) < reference;
  }

  /**
   * Termin etapu nie jest wpisywany: to termin najbliższego niezakończonego zadania.
   * @returns {string} data i godzina zadania (ISO) albo ''
   */
  function nearestDeadline(stage) {
    var best = '';
    ((stage && stage.tasks) || []).forEach(function (task) {
      if (!isOpen(task) || !isDateTime(task.deadline)) return;
      if (!best || Date.parse(task.deadline) < Date.parse(best)) best = task.deadline;
    });
    return best;
  }

  /** Jak nearestDeadline, ale sama data „RRRR-MM-DD” — dla osi i progów liczonych w dniach. */
  function stageDue(stage) {
    var at = nearestDeadline(stage);
    return at ? at.slice(0, 10) : '';
  }

  function plDays(count) { return count === 1 ? '1 dzień' : count + ' dni'; }
  function plHours(count) { return count === 1 ? '1 godzina' : count + ' h'; }

  /**
   * Opis terminu zadania. W odróżnieniu od etapu termin ma godzinę,
   * więc ostatnia doba liczona jest w godzinach.
   * @returns {{tone: string, text: string}}
   */
  function deadlineInfo(task, now) {
    if (!task || !isDateTime(task.deadline)) return { tone: 'none', text: 'bez terminu' };
    if (task.status === 'done') return { tone: 'none', text: 'zakończone' };

    var reference = now instanceof Date ? now.getTime() : Date.now();
    var diff = Date.parse(task.deadline) - reference;
    var hours = Math.floor(Math.abs(diff) / 3600000);
    var days = Math.floor(hours / 24);

    if (diff < 0) {
      return {
        tone: 'overdue',
        text: (days >= 1 ? plDays(days) : plHours(Math.max(1, hours))) + ' po terminie'
      };
    }
    if (hours < 24) return { tone: 'urgent', text: 'zostało ' + plHours(Math.max(1, hours)) };
    if (days <= 7) return { tone: 'warning', text: 'zostało ' + plDays(days) };
    return { tone: 'normal', text: 'zostało ' + plDays(days) };
  }

  /**
   * Podsumowanie zadań — używane przez wiersz etapu i kartę projektu.
   * @returns {{total: number, open: number, done: number, overdue: number,
   *            review: number, nearest: string}}
   */
  function taskStats(tasks, now) {
    var list = Array.isArray(tasks) ? tasks : [];
    var stats = { total: list.length, open: 0, done: 0, overdue: 0, review: 0, nearest: '' };

    list.forEach(function (task) {
      if (task.status === 'done') stats.done += 1;
      else stats.open += 1;
      if (task.status === 'review') stats.review += 1;
      if (isOverdue(task, now)) stats.overdue += 1;
      if (isOpen(task) && isDateTime(task.deadline)) {
        if (!stats.nearest || Date.parse(task.deadline) < Date.parse(stats.nearest)) {
          stats.nearest = task.deadline;
        }
      }
    });

    return stats;
  }

  /** Podsumowanie dla całego projektu. */
  function projectTaskStats(project, now) {
    var all = [];
    ((project && project.stages) || []).forEach(function (stage) {
      (stage.tasks || []).forEach(function (task) { all.push(task); });
    });
    return taskStats(all, now);
  }

  /* ---------- Lista punktów przy zadaniu (wspólna dla realizatorów) ---------- */
  var CHECK_LIMITS = { items: 40, text: 160 };

  function normalizeChecklist(raw) {
    var taken = {};
    var out = [];
    (Array.isArray(raw) ? raw : []).forEach(function (item) {
      if (!item || typeof item !== 'object' || out.length >= CHECK_LIMITS.items) return;
      var label = text(item.text).slice(0, CHECK_LIMITS.text);
      var id = text(item.id);
      if (!label || !id || taken[id]) return;
      taken[id] = true;
      out.push({
        id: id, text: label, done: item.done === true,
        by: text(item.by), to: text(item.to), doneBy: item.done === true ? text(item.doneBy) : '',
        at: typeof item.at === 'string' ? item.at : ''
      });
    });
    return out;
  }

  function checklistOf(task) { return (task && Array.isArray(task.checklist)) ? task.checklist : []; }

  function nextPointId(list) {
    var max = 0;
    list.forEach(function (p) { var m = /^c-(\d+)$/.exec(p.id); if (m) max = Math.max(max, Number(m[1])); });
    return 'c-' + (max + 1);
  }

  /** Dopisuje punkt; ignoruje pusty tekst i przekroczenie limitu. */
  function addPoint(task, label, by, now, to) {
    var value = text(label).slice(0, CHECK_LIMITS.text);
    var list = checklistOf(task);
    if (!task || !value || list.length >= CHECK_LIMITS.items) return task;
    var point = { id: nextPointId(list), text: value, done: false, by: text(by), to: text(to), doneBy: '', at: now || '' };
    return Object.assign({}, task, { checklist: list.concat([point]) });
  }

  function togglePoint(task, id, by) {
    var list = checklistOf(task);
    if (!list.some(function (p) { return p.id === id; })) return task;
    return Object.assign({}, task, { checklist: list.map(function (p) {
      if (p.id !== id) return p;
      return Object.assign({}, p, { done: !p.done, doneBy: !p.done ? text(by) : '' });
    }) });
  }

  function renamePoint(task, id, label) {
    var value = text(label).slice(0, CHECK_LIMITS.text);
    if (!value) return task;
    return Object.assign({}, task, { checklist: checklistOf(task).map(function (p) { return p.id === id ? Object.assign({}, p, { text: value }) : p; }) });
  }

  /** Wskazuje osobę odpowiedzialną za punkt ('' = cały zespół). */
  function assignPoint(task, id, to) {
    return Object.assign({}, task, { checklist: checklistOf(task).map(function (p) { return p.id === id ? Object.assign({}, p, { to: text(to) }) : p; }) });
  }

  function removePoint(task, id) {
    return Object.assign({}, task, { checklist: checklistOf(task).filter(function (p) { return p.id !== id; }) });
  }

  /** {done, total} dla paska/kropek. */
  function checklistStats(task) {
    var list = checklistOf(task);
    return { done: list.filter(function (p) { return p.done; }).length, total: list.length };
  }

  /**
   * Nakład zadania z czasu, jaki na nie przewidziano (od startu — a gdy go brak, od założenia — do terminu):
   * do 2 dni = 1 kreska, do 2 tygodni = 2, do ok. 7 tygodni = 3, dłużej (kwartał) = 4. Bez terminu: level 0.
   * Progi to środki geometryczne między „1 dzień / 1 tydzień / 1 miesiąc / 1 kwartał”.
   * @returns {{level: number, days: number}}
   */
  function effortLevel(task) {
    var end = task && isDateTime(task.deadline) ? task.deadline.slice(0, 10) : '';
    var begin = task && isDay(String(task.start || '').slice(0, 10)) ? String(task.start).slice(0, 10)
      : (task && isDateTime(task.createdAt) ? task.createdAt.slice(0, 10) : '');
    if (!end || !begin) return { level: 0, days: 0 };
    var a = Date.UTC(Number(begin.slice(0, 4)), Number(begin.slice(5, 7)) - 1, Number(begin.slice(8, 10)));
    var b = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)));
    var days = Math.max(1, Math.round((b - a) / 86400000) + 1);
    return { level: days <= 2 ? 1 : (days <= 14 ? 2 : (days <= 52 ? 3 : 4)), days: days };
  }

  /** Czyści zadania wczytane z dysku. Nigdy nie rzuca. */
  function normalizeTasks(raw, available) {
    var list = Array.isArray(raw) ? raw : [];
    var allowed = Array.isArray(available) ? available : null;
    var taken = {};
    var result = [];

    list.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var name = text(item.name);
      if (!name) return;
      var id = text(item.id);
      if (!id || taken[id]) return;

      var assignees = (Array.isArray(item.assignees) ? item.assignees : [])
        .map(text)
        .filter(function (personId, index, self) {
          if (!personId || self.indexOf(personId) !== index) return false;
          return allowed ? allowed.indexOf(personId) >= 0 : true;
        });

      var status = Object.prototype.hasOwnProperty.call(TASK_STATUS, item.status) ? item.status : 'todo';

      var parts = {};
      assignees.forEach(function (personId) {
        var value = item.parts && item.parts[personId];
        parts[personId] = Object.prototype.hasOwnProperty.call(PART_STATUS, value) ? value : 'todo';
      });

      var history = (Array.isArray(item.history) ? item.history : []).filter(function (entry) {
        return entry && TASK_STATUS[entry.to] && isDateTime(entry.at);
      }).map(function (entry) {
        return {
          from: TASK_STATUS[entry.from] ? entry.from : 'todo',
          to: entry.to,
          reason: text(entry.reason).slice(0, LIMITS.reason),
          at: entry.at,
          by: text(entry.by)
        };
      });

      var estimate = Number(item.estimate);
      taken[id] = true;
      result.push(Object.assign({
        id: id,
        name: name.slice(0, LIMITS.name),
        status: status,
        start: isDay(String(item.start || '').slice(0, 10)) && (!isDateTime(item.deadline) || String(item.start).slice(0, 10) <= item.deadline.slice(0, 10)) && item.draft !== true ? String(item.start).slice(0, 10) : '',
        deadline: isDateTime(item.deadline) ? item.deadline : '',
        assignees: assignees,
        parts: parts,
        description: text(item.description).slice(0, LIMITS.description),
        important: item.important === true,
        draft: item.draft === true,
        fromReserve: item.fromReserve === true,
        mailId: text(item.mailId).slice(0, 60),
        feedback: text(item.feedback).slice(0, LIMITS.reason),
        history: history,
        checklist: normalizeChecklist(item.checklist),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : ''
      }, LEGACY_WORKLOAD.indexOf(item.workload) >= 0 ? { workload: item.workload } : {}, Number.isFinite(estimate) && estimate >= 0.5 && estimate <= 2000 ? { estimate: Math.round(estimate * 10) / 10 } : {}));
    });

    return result;
  }

  var api = {
    TASK_STATUS: TASK_STATUS,
    TRANSITIONS: TRANSITIONS,
    effortLevel: effortLevel,
    PART_STATUS: PART_STATUS,
    PART_CYCLE: PART_CYCLE,
    nextTaskId: nextTaskId,
    validateTask: validateTask,
    createTask: createTask,
    updateTask: updateTask,
    canMove: canMove,
    nextStatuses: nextStatuses,
    moveTask: moveTask,
    partStatus: partStatus,
    cyclePart: cyclePart,
    allPartsDone: allPartsDone,
    isOpen: isOpen,
    isOverdue: isOverdue,
    nearestDeadline: nearestDeadline,
    stageDue: stageDue,
    deadlineInfo: deadlineInfo,
    taskStats: taskStats,
    projectTaskStats: projectTaskStats,
    normalizeTasks: normalizeTasks,
    CHECK_LIMITS: CHECK_LIMITS,
    normalizeChecklist: normalizeChecklist,
    checklistOf: checklistOf,
    addPoint: addPoint,
    togglePoint: togglePoint,
    renamePoint: renamePoint,
    removePoint: removePoint,
    assignPoint: assignPoint,
    checklistStats: checklistStats
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Tasks = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
