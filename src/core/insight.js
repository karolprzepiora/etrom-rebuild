/* ETROM — odczyt sytuacji projektu: stan (na wzór stanów wód), profil przebiegu,
   zgodność z czasem, najbliższe zdarzenie, przegląd portfela i obciążenie osób.
   Czyste funkcje, bez DOM. Interfejs tylko to rysuje. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Model = node ? require('./model.js') : root.ETROM.Model;
  var Catalog = node ? require('./catalog.js') : root.ETROM.Catalog;
  var Progress = node ? require('./progress.js') : root.ETROM.Progress;
  var Tasks = node ? require('./tasks.js') : root.ETROM.Tasks;
  var Team = node ? require('./team.js') : root.ETROM.Team;

  var DAY_MS = 86400000;

  /** Poziomy stanu w kolejności ważności — jak stany wód: alarmowy, ostrzegawczy, normalny. */
  var LEVELS = {
    alarm: { rank: 0, label: 'Stan alarmowy', short: 'Alarm' },
    warning: { rank: 1, label: 'Stan ostrzegawczy', short: 'Ostrzeżenie' },
    normal: { rank: 2, label: 'W normie', short: 'W normie' },
    closed: { rank: 3, label: 'Zakończony', short: 'Zakończony' }
  };

  // Progi opóźnienia wobec upływu czasu, w punktach procentowych.
  var LAG_WARNING = 15;
  var LAG_ALARM = 30;
  // Termin umowy bliżej niż tyle dni przy niedokończonej pracy — ostrzeżenie.
  var DEADLINE_SOON = 14;
  var DEADLINE_SOON_PROGRESS = 85;
  // Termin etapu bliżej niż tyle dni — znacznik ostrzegawczy na torze przebiegu.
  var STAGE_SOON = 7;

  function plural(n, one, few, many) {
    var t = n % 100;
    var u = n % 10;
    if (n === 1) return one;
    if (u >= 2 && u <= 4 && (t < 12 || t > 14)) return few;
    return many;
  }

  function days(n) { return n + ' ' + plural(n, 'dzień', 'dni', 'dni'); }

  function startOf(project) {
    var stamp = project && project.createdAt ? Date.parse(project.createdAt) : NaN;
    return Number.isFinite(stamp) ? new Date(stamp) : null;
  }

  function dateValue(value) {
    if (!Model.isDate(value)) return null;
    var p = value.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function overdueStages(project, now) {
    if (!project || project.status === 'done') return [];
    return (project.stages || []).filter(function (stage) {
      if (stage.status === 'done') return false;
      var d = Progress.daysUntil(stage.deadline, now);
      return d !== null && d < 0;
    });
  }

  function allTasks(project) {
    var list = [];
    (project.stages || []).forEach(function (stage) {
      (stage.tasks || []).forEach(function (task) { list.push({ task: task, stage: stage }); });
    });
    return list;
  }

  /**
   * Zgodność z czasem: jaka część okresu umowy minęła, a jaka część pracy jest zrobiona.
   * @returns {null|{elapsed: number, expected: number, progress: number, lag: number, daysLeft: number}}
   *   elapsed: 0..1+ (powyżej 1 — po terminie), lag: punkty procentowe opóźnienia (ujemne = zapas)
   */
  function schedule(project, now) {
    var reference = now instanceof Date ? now : new Date();
    var start = startOf(project);
    var end = dateValue(project && project.deadline);
    if (!start || !end) return null;
    var startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    var total = (end - startDay) / DAY_MS;
    var today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    var spent = (today - startDay) / DAY_MS;
    var elapsed = total > 0 ? Math.max(0, spent / total) : 1;
    var progress = Progress.projectProgress(project).percent;
    var expected = Math.round(Math.min(1, elapsed) * 100);
    return {
      elapsed: elapsed,
      expected: expected,
      progress: progress,
      lag: expected - progress,
      daysLeft: Progress.daysUntil(project.deadline, reference)
    };
  }

  /**
   * Stan projektu z powodami. Pierwszy powód jest najważniejszy i służy za nagłówek.
   * @returns {{level: string, label: string, reasons: Array<{level: string, text: string}>}}
   */
  function health(project, now) {
    var reference = now instanceof Date ? now : new Date();
    var reasons = [];

    if (!project) return { level: 'normal', label: LEVELS.normal.label, reasons: [] };
    if (project.status === 'done') {
      return { level: 'closed', label: LEVELS.closed.label, reasons: [{ rule: 'closed', level: 'closed', text: 'Projekt zakończony' }] };
    }

    var left = Progress.daysUntil(project.deadline, reference);
    var progress = Progress.projectProgress(project).percent;
    var plan = schedule(project, reference);

    if (left !== null && left < 0) {
      reasons.push({ rule: 'deadline-passed', level: 'alarm', text: 'Termin umowy minął ' + days(-left) + ' temu' });
    } else if (left !== null && left <= DEADLINE_SOON && progress < DEADLINE_SOON_PROGRESS) {
      reasons.push({
        rule: 'deadline-near',
        level: 'warning',
        text: (left === 0 ? 'Termin umowy dzisiaj' : 'Do terminu umowy ' + days(left)) + ', postęp ' + progress + '%'
      });
    }

    if (plan && left !== null && left >= 0 && plan.lag >= LAG_WARNING) {
      reasons.push({
        rule: 'schedule-lag',
        level: plan.lag >= LAG_ALARM ? 'alarm' : 'warning',
        text: 'Postęp ' + progress + '% przy ' + plan.expected + '% czasu umowy'
      });
    }

    var tasks = allTasks(project);
    var lateTasks = tasks.filter(function (entry) { return Tasks.isOverdue(entry.task, reference); });
    if (lateTasks.length) {
      reasons.push({
        rule: 'tasks-late',
        level: 'warning',
        text: lateTasks.length + ' ' + plural(lateTasks.length, 'zadanie', 'zadania', 'zadań') + ' po terminie'
      });
    }

    var lateStages = overdueStages(project, reference);
    if (lateStages.length) {
      reasons.push({
        rule: 'stages-late',
        level: 'warning',
        text: lateStages.length === 1
          ? 'Etap „' + Model.describeStage(lateStages[0]).name + '” po terminie'
          : lateStages.length + ' ' + plural(lateStages.length, 'etap', 'etapy', 'etapów') + ' po terminie'
      });
    }

    var returned = tasks.filter(function (entry) { return entry.task.status === 'changes'; });
    if (returned.length) {
      reasons.push({
        rule: 'tasks-returned',
        level: 'warning',
        text: returned.length + ' ' + plural(returned.length, 'zadanie zwrócone', 'zadania zwrócone', 'zadań zwróconych') + ' do poprawy'
      });
    }

    if (project.status === 'paused') reasons.push({ rule: 'project-paused', level: 'warning', text: 'Projekt wstrzymany' });

    reasons.sort(function (a, b) { return LEVELS[a.level].rank - LEVELS[b.level].rank; });
    var level = reasons.length ? reasons[0].level : 'normal';
    return { level: level, label: LEVELS[level].label, reasons: reasons };
  }

  /**
   * Profil przebiegu: etapy jako odcinki o długości proporcjonalnej do godzin.
   * @returns {{segments: Array, percent: number, current: (Object|null), currentIndex: number, hoursTotal: number}}
   */
  function profile(project, now) {
    var reference = now instanceof Date ? now : new Date();
    var stages = (project && project.stages) || [];
    var stats = Progress.projectProgress(project || { stages: [] });
    var current = Progress.activeStage(project || { stages: [] });
    var late = overdueStages(project, reference).map(function (s) { return s.id; });
    var paused = !!project && project.status === 'paused';
    var total = stats.hoursTotal || stages.length || 1;
    var offset = 0;

    var segments = stages.map(function (stage, index) {
      var hours = Number(stage.hours) > 0 ? Number(stage.hours) : (stats.hoursTotal ? 0 : 1);
      var weight = hours / total;
      var info = Model.describeStage(stage);
      var segment = {
        id: stage.id,
        index: index,
        name: info.name,
        domain: info.domain,
        hours: Number(stage.hours) || 0,
        status: stage.status,
        start: offset,
        weight: weight,
        overdue: late.indexOf(stage.id) >= 0,
        current: !!current && current.id === stage.id,
        deadline: stage.deadline || '',
        soon: false
      };
      var left = stage.status === 'done' ? null : Progress.daysUntil(stage.deadline, reference);
      segment.soon = left !== null && left >= 0 && left <= STAGE_SOON;
      segment.blocked = paused && segment.current;
      segment.state = stage.status === 'done' ? 'done'
        : segment.overdue ? 'delayed'
        : segment.blocked ? 'blocked'
        : segment.current ? 'current'
        : segment.soon ? 'warning'
        : 'upcoming';
      offset += weight;
      return segment;
    });

    return {
      segments: segments,
      percent: stats.percent,
      current: current,
      currentIndex: current ? stages.indexOf(current) : -1,
      hoursTotal: stats.hoursTotal,
      hoursDone: stats.hoursDone,
      done: stats.done,
      total: stats.total
    };
  }

  /**
   * Miernik postępu: skala 0–100% z progami na granicach etapów (odcinki ∝ godzinom),
   * położenie rzeczywiste i planowane oraz sąsiedztwo bieżącego etapu.
   * Plan = jaka część okresu umowy już minęła; odchylenie = plan − postęp (punkty %).
   * @returns {{percent: number, expected: (number|null), lag: (number|null), stages: Array,
   *   current: (Object|null), previous: (Object|null), next: (Object|null), majors: number[]}}
   */
  function gauge(project, now) {
    var data = profile(project, now);
    var plan = project && project.status !== 'done' ? schedule(project, now) : null;
    var stages = data.segments.map(function (seg) {
      return {
        id: seg.id, index: seg.index, name: seg.name, status: seg.status, state: seg.state,
        from: seg.start * 100, to: Math.min(100, (seg.start + seg.weight) * 100), current: seg.current
      };
    });
    var at = data.currentIndex;
    return {
      percent: data.percent,
      expected: plan ? plan.expected : null,
      lag: plan ? plan.lag : null,
      hoursDone: data.hoursDone,
      hoursTotal: data.hoursTotal,
      done: data.done,
      total: data.total,
      stages: stages,
      current: at >= 0 ? stages[at] : null,
      previous: at > 0 ? stages[at - 1] : null,
      next: at >= 0 && at < stages.length - 1 ? stages[at + 1] : null,
      majors: [0, 25, 50, 75, 100]
    };
  }

  /**
   * Stan projektu jako poziom względem progów: alarm → ostrzeżenie → norma.
   * Każdy próg niesie powody, które go przekroczyły (reguły w health()).
   * @returns {{level: string, label: string, closed: boolean, rungs: Array<{level, label, active, reasons}>}}
   */
  function ladder(project, now) {
    var state = health(project, now);
    var rungs = ['alarm', 'warning', 'normal'].map(function (level) {
      return {
        level: level,
        label: LEVELS[level].label,
        active: state.level === level,
        reasons: state.reasons.filter(function (r) { return r.level === level; })
      };
    });
    return { level: state.level, label: state.label, closed: state.level === 'closed', rungs: rungs, reasons: state.reasons };
  }

  /**
   * Najbliższe zdarzenie w projekcie: termin zadania, etapu albo umowy — co pierwsze w przyszłości.
   * @returns {null|{kind: string, label: string, date: string, days: number}}
   */
  function nextEvent(project, now) {
    var reference = now instanceof Date ? now : new Date();
    if (!project || project.status === 'done') return null;
    var events = [];
    var left = Progress.daysUntil(project.deadline, reference);
    if (left !== null && left >= 0) events.push({ kind: 'project', label: 'Termin umowy', date: project.deadline, days: left, at: dateValue(project.deadline).getTime() + DAY_MS - 1 });

    (project.stages || []).forEach(function (stage) {
      if (stage.status === 'done') return;
      var d = Progress.daysUntil(stage.deadline, reference);
      if (d !== null && d >= 0) {
        events.push({ kind: 'stage', label: Model.describeStage(stage).name, date: stage.deadline, days: d, at: dateValue(stage.deadline).getTime() + DAY_MS - 2 });
      }
    });

    allTasks(project).forEach(function (entry) {
      var task = entry.task;
      if (task.status === 'done' || !task.deadline) return;
      var at = Date.parse(task.deadline);
      if (!Number.isFinite(at) || at < reference.getTime()) return;
      events.push({
        kind: 'task', label: task.name, date: task.deadline,
        days: Progress.daysUntil(task.deadline.slice(0, 10), reference), at: at
      });
    });

    events.sort(function (a, b) { return a.at - b.at; });
    if (!events.length) return null;
    var first = events[0];
    return { kind: first.kind, label: first.label, date: first.date, days: first.days };
  }

  /**
   * Przegląd portfela: liczba projektów w każdym stanie i terminy w najbliższym horyzoncie.
   * @param {number} [horizon] dni do przodu (domyślnie 60)
   */
  /**
   * Terminy projektu w oknie [0, limit] dni: termin umowy i niezakończone etapy.
   * Ta sama definicja zasila oś terminów i filtr „terminy w najbliższych dniach”.
   */
  function upcomingFor(project, now, limit, level) {
    var reference = now instanceof Date ? now : new Date();
    var result = [];
    if (!project || project.status === 'done') return result;
    var d = Progress.daysUntil(project.deadline, reference);
    if (d !== null && d >= 0 && d <= limit) result.push({ project: project, kind: 'project', date: project.deadline, days: d, level: level });
    (project.stages || []).forEach(function (stage) {
      if (stage.status === 'done') return;
      var sd = Progress.daysUntil(stage.deadline, reference);
      if (sd !== null && sd >= 0 && sd <= limit) {
        result.push({ project: project, kind: 'stage', stage: stage, date: stage.deadline, days: sd, level: level });
      }
    });
    return result;
  }

  /**
   * Budżet godzin projektu według rodzaju pracy (materiały, dokumentacja,
   * decyzje). Zawsze trzy pozycje w stałej kolejności; udział liczony od
   * budżetu całego projektu. `doneHours` to godziny etapów zakończonych.
   */
  function budgetByKind(project) {
    var rows = {};
    Catalog.KIND_ORDER.forEach(function (id) {
      rows[id] = { kind: id, label: Catalog.kind(id).label, hours: 0, doneHours: 0, count: 0, share: 0 };
    });
    var total = 0;
    ((project && project.stages) || []).forEach(function (stage) {
      var info = Model.describeStage(stage);
      var hours = Number(stage.hours) || 0;
      var row = rows[info.kind];
      row.hours += hours;
      row.count += 1;
      if (stage.status === 'done') row.doneHours += hours;
      total += hours;
    });
    return Catalog.KIND_ORDER.map(function (id) {
      rows[id].share = total > 0 ? rows[id].hours / total : 0;
      return rows[id];
    });
  }

  var APPROVER_KEYS = ['leader', 'coordinator'];

  /**
   * Praca jednej osoby: jej zadania w przedziałach czasu oraz to, co wymaga
   * jej decyzji. Zadanie z udziałem już zamkniętym przez tę osobę nie wraca.
   * Zatwierdzają lider i koordynator projektu; własnego zadania nie zatwierdza się samemu.
   * @returns {{
   *   open: number, overdue: number, today: number,
   *   buckets: {overdue: Array, today: Array, week: Array, later: Array, none: Array},
   *   returned: Array, toApprove: Array, projects: Array
   * }}
   */
  function myWork(personId, projects, now) {
    var reference = now instanceof Date ? now : new Date();
    var result = {
      open: 0, overdue: 0, today: 0,
      buckets: { overdue: [], today: [], week: [], later: [], none: [] },
      returned: [], toApprove: [], projects: []
    };
    if (!personId) return result;

    (projects || []).forEach(function (project) {
      var fns = Team.functionsOf(personId, project.team);
      var approver = fns.some(function (fn) { return APPROVER_KEYS.indexOf(fn.key) >= 0; });
      if (fns.length && project.status !== 'done') result.projects.push({ project: project, functions: fns });

      allTasks(project).forEach(function (entry) {
        var task = entry.task;
        var mine = (task.assignees || []).indexOf(personId) >= 0;
        var item = { project: project, stage: entry.stage, task: task };

        if (approver && task.status === 'review' && !(mine && (task.assignees || []).length === 1)) {
          result.toApprove.push(item);
        }
        if (!mine || task.status === 'done' || Tasks.partStatus(task, personId) === 'done') return;

        var day = task.deadline ? Progress.daysUntil(String(task.deadline).slice(0, 10), reference) : null;
        var late = Tasks.isOverdue(task, reference);
        var row = { project: project, stage: entry.stage, task: task, days: day, overdue: late };
        result.open += 1;
        if (task.status === 'changes') result.returned.push(row);

        var bucket = 'none';
        if (late) bucket = 'overdue';
        else if (day === null) bucket = 'none';
        else if (day <= 0) bucket = 'today';
        else if (day <= 7) bucket = 'week';
        else bucket = 'later';
        if (bucket === 'overdue') result.overdue += 1;
        if (bucket === 'today') result.today += 1;
        result.buckets[bucket].push(row);
      });
    });

    var byDeadline = function (a, b) {
      return String(a.task.deadline || '9999').localeCompare(String(b.task.deadline || '9999'));
    };
    Object.keys(result.buckets).forEach(function (key) { result.buckets[key].sort(byDeadline); });
    result.returned.sort(byDeadline);
    result.toApprove.sort(byDeadline);
    return result;
  }

  function portfolio(projects, now, horizon) {
    var reference = now instanceof Date ? now : new Date();
    var limit = horizon || 60;
    var counts = { alarm: 0, warning: 0, normal: 0, closed: 0 };
    var byLevel = { alarm: [], warning: [], normal: [], closed: [] };
    var upcoming = [];
    var hoursDone = 0;
    var hoursTotal = 0;

    (projects || []).forEach(function (project) {
      var state = health(project, reference);
      counts[state.level] += 1;
      byLevel[state.level].push({ project: project, health: state });
      if (project.status !== 'done') {
        var stats = Progress.projectProgress(project);
        hoursDone += stats.hoursDone;
        hoursTotal += stats.hoursTotal;
        upcoming = upcoming.concat(upcomingFor(project, reference, limit, state.level));
      }
    });

    upcoming.sort(function (a, b) { return a.days - b.days; });
    return { counts: counts, byLevel: byLevel, upcoming: upcoming, horizon: limit, hoursDone: hoursDone, hoursTotal: hoursTotal, total: (projects || []).length };
  }

  /**
   * Obciążenie osoby: otwarte zadania (jej udział niedomknięty), zadania po terminie,
   * czynne projekty i pełnione funkcje.
   */
  function workload(personId, projects, now) {
    var reference = now instanceof Date ? now : new Date();
    var result = { open: 0, overdue: 0, projects: 0, functions: [], tasks: [] };
    (projects || []).forEach(function (project) {
      var fns = Team.functionsOf(personId, project.team);
      if (fns.length) {
        fns.forEach(function (fn) { result.functions.push({ project: project, fn: fn }); });
        if (project.status !== 'done') result.projects += 1;
      }
      allTasks(project).forEach(function (entry) {
        var task = entry.task;
        if ((task.assignees || []).indexOf(personId) < 0 || task.status === 'done') return;
        if (Tasks.partStatus(task, personId) === 'done') return;
        result.open += 1;
        var late = Tasks.isOverdue(task, reference);
        if (late) result.overdue += 1;
        result.tasks.push({ project: project, stage: entry.stage, task: task, overdue: late });
      });
    });
    result.tasks.sort(function (a, b) {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return String(a.task.deadline || '9999').localeCompare(String(b.task.deadline || '9999'));
    });
    return result;
  }

  /** „za 7 dni”, „dziś”, „jutro” */
  function when(n) { return n === 0 ? 'dziś' : (n === 1 ? 'jutro' : 'za ' + days(n)); }

  var EVENT_NAME = { project: 'Termin umowy', stage: 'Termin etapu', task: 'Termin zadania' };

  /**
   * Najbliższy próg: co zmieni stan projektu albo co jest następne w kolejce.
   * Alarm — nic wyżej już nie ma; ostrzeżenie — próg to termin umowy; norma — najbliższy termin.
   * @returns {null|{text: string, kind: string, days: number}}
   */
  function threshold(project, now) {
    var reference = now instanceof Date ? now : new Date();
    if (!project || project.status === 'done') return null;
    var state = health(project, reference);
    if (state.level === 'alarm') return null;
    var left = Progress.daysUntil(project.deadline, reference);
    if (state.level === 'warning' && left !== null && left >= 0) {
      return { kind: 'project', days: left, text: 'Alarm, jeśli termin umowy minie (' + when(left) + ').' };
    }
    var next = nextEvent(project, reference);
    if (!next) return null;
    var label = next.kind === 'project' ? '' : ' „' + next.label + '”';
    return { kind: next.kind, days: next.days, text: EVENT_NAME[next.kind] + label + ' ' + when(next.days) + '.' };
  }

  /**
   * Odchylenia od planu. Nic nie jest zgadywane: pole bez danych ma available=false
   * i powód. Plan = upływ czasu umowy (liniowo od utworzenia projektu).
   *  - postęp: rzeczywisty % vs % czasu umowy (pp, ujemne = za planem),
   *  - godziny: zapisane z zegara vs oczekiwane na dziś (h, dodatnie = ponad plan),
   *  - termin: prognoza liniowa wg dotychczasowego tempa (dni, dodatnie = po terminie),
   *    liczona dopiero przy ≥ 7 dniach pracy i ≥ 5% postępu.
   * @returns {{progress: Object, hours: Object, schedule: Object, primary: (string|null)}}
   */
  function variance(project, now, loggedMinutes) {
    var reference = now instanceof Date ? now : new Date();
    var stats = Progress.projectProgress(project || { stages: [] });
    var plan = project && project.status !== 'done' ? schedule(project, reference) : null;
    var actual = stats.percent;

    var progress = plan
      ? { available: true, actual: actual, plan: plan.expected, variance: actual - plan.expected }
      : { available: false, actual: actual, plan: null, variance: null, reason: project && project.status === 'done' ? 'done' : 'no-deadline' };

    var used = Math.round((loggedMinutes || 0) / 6) / 10;
    var hours;
    if (!plan || !stats.hoursTotal) hours = { available: false, used: used, expected: null, variance: null, budget: stats.hoursTotal, reason: stats.hoursTotal ? 'no-deadline' : 'no-budget' };
    else if (!loggedMinutes) hours = { available: false, used: 0, expected: Math.round(plan.expected / 100 * stats.hoursTotal), variance: null, budget: stats.hoursTotal, reason: 'no-time-logged' };
    else {
      var expectedHours = Math.round(plan.expected / 100 * stats.hoursTotal);
      hours = { available: true, used: used, expected: expectedHours, variance: Math.round((used - expectedHours) * 10) / 10, budget: stats.hoursTotal };
    }

    var contract = project && project.deadline ? project.deadline : null;
    var sched = { contract: contract, forecast: null, days: null, available: false, reason: null };
    var start = startOf(project);
    if (!project || project.status === 'done') sched.reason = 'done';
    else if (!contract) sched.reason = 'no-deadline';
    else if (!start) sched.reason = 'no-start';
    else {
      var startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      var today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
      var spent = (today - startDay) / DAY_MS;
      if (spent < 7) sched.reason = 'too-early';
      else if (actual < 5) sched.reason = 'no-progress';
      else if (actual >= 100) sched.reason = 'done';
      else {
        var finish = new Date(startDay.getTime() + Math.round(spent / (actual / 100)) * DAY_MS);
        var end = dateValue(contract);
        sched.available = true;
        sched.forecast = finish.getFullYear() + '-' + String(finish.getMonth() + 1).padStart(2, '0') + '-' + String(finish.getDate()).padStart(2, '0');
        sched.days = Math.round((finish - end) / DAY_MS);
      }
    }

    var primary = null;
    if (sched.available && sched.days >= 7) primary = 'schedule';
    else if (progress.available && progress.variance <= -5) primary = 'progress';
    else if (hours.available && stats.hoursTotal && hours.variance > 0.1 * stats.hoursTotal) primary = 'hours';
    else if (progress.available) primary = 'progress';
    return { progress: progress, hours: hours, schedule: sched, primary: primary };
  }

  /**
   * „Co powinienem zrobić teraz?” — jedna pozycja, najpilniejsza:
   * zwrócone do poprawy → zaległe → czekające na zatwierdzenie → bez realizatora → najbliższy termin (≤ 14 dni).
   * @returns {null|{rule: string, kind: string, title: string, parts: string[], tone: string, stageId: (string|null), taskId: (string|null)}}
   */
  function nextAction(project, now) {
    var reference = now instanceof Date ? now : new Date();
    if (!project || project.status === 'done') return null;
    var open = allTasks(project).filter(function (e) { return e.task.status !== 'done'; });
    function pick(entry, rule, parts, tone) {
      return { rule: rule, kind: 'task', title: entry.task.name, parts: parts, tone: tone, stageId: entry.stage.id, taskId: entry.task.id };
    }
    function unassigned(entry) { return !(entry.task.assignees || []).length ? ['Brak realizatora'] : []; }
    function byDeadline(a, b) { return (Date.parse(a.task.deadline) || Infinity) - (Date.parse(b.task.deadline) || Infinity); }

    var returned = open.filter(function (e) { return e.task.status === 'changes'; }).sort(byDeadline)[0];
    if (returned) return pick(returned, 'returned', ['Zwrócone do poprawy'].concat(returned.task.feedback ? [returned.task.feedback] : [], unassigned(returned)), 'warning');

    var late = open.filter(function (e) { return Tasks.isOverdue(e.task, reference); }).sort(byDeadline)[0];
    if (late) {
      var d = -Progress.daysUntil(late.task.deadline.slice(0, 10), reference);
      return pick(late, 'overdue', [d <= 0 ? 'Termin minął dziś' : days(d) + ' po terminie'].concat(unassigned(late)), 'alarm');
    }

    var review = open.filter(function (e) { return e.task.status === 'review'; }).sort(byDeadline)[0];
    if (review) return pick(review, 'review', ['Czeka na zatwierdzenie'].concat(unassigned(review)), 'normal');

    var active = Progress.activeStage(project);
    var orphan = open.filter(function (e) { return !(e.task.assignees || []).length && (!active || e.stage.id === active.id); }).sort(byDeadline)[0];
    if (orphan) return pick(orphan, 'unassigned', ['Brak realizatora'].concat(orphan.task.deadline ? ['Termin ' + when(Math.max(0, Progress.daysUntil(orphan.task.deadline.slice(0, 10), reference)))] : []), 'warning');

    var next = nextEvent(project, reference);
    if (next && next.days <= 14) {
      var target = next.kind === 'task' ? open.filter(function (e) { return e.task.name === next.label && e.task.deadline === next.date; })[0] : null;
      var stageTarget = next.kind === 'stage' ? (project.stages || []).filter(function (st) { return Model.describeStage(st).name === next.label && st.deadline === next.date; })[0] : null;
      return {
        rule: 'next-event', kind: target ? 'task' : (stageTarget ? 'stage' : 'project'), title: next.kind === 'project' ? 'Termin umowy' : next.label,
        parts: [EVENT_NAME[next.kind] + ' ' + when(next.days)].concat(target ? unassigned(target) : []),
        tone: next.days <= 3 ? 'warning' : 'normal',
        stageId: target ? target.stage.id : (stageTarget ? stageTarget.id : null), taskId: target ? target.task.id : null
      };
    }
    return null;
  }

  var api = {
    threshold: threshold,
    variance: variance,
    nextAction: nextAction,
    LEVELS: LEVELS,
    LAG_WARNING: LAG_WARNING,
    LAG_ALARM: LAG_ALARM,
    upcomingFor: upcomingFor,
    health: health,
    profile: profile,
    gauge: gauge,
    ladder: ladder,
    schedule: schedule,
    nextEvent: nextEvent,
    budgetByKind: budgetByKind,
    portfolio: portfolio,
    workload: workload,
    myWork: myWork
  };

  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Insight = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
