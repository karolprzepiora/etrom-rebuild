/* ETROM — odczyt sytuacji projektu: stan (na wzór stanów wód), profil przebiegu,
   zgodność z czasem, najbliższe zdarzenie, przegląd portfela i obciążenie osób.
   Czyste funkcje, bez DOM. Interfejs tylko to rysuje. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var Model = node ? require('./model.js') : root.ETROM.Model;
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

  var api = {
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
    portfolio: portfolio,
    workload: workload
  };

  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Insight = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
