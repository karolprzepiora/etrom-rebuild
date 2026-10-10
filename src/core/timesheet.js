/* ETROM — karta czasu: zapisany czas osoby w tygodniu lub miesiącu, rozbity na projekty i zadania.
   Czyste funkcje, bez DOM. Eksport CSV (średnik i BOM: Excel w polskich ustawieniach otwiera od razu). */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var TL = node ? require('./timelog.js') : root.ETROM.TimeLog;
  var Absences = node ? require('./absences.js') : root.ETROM.Absences;
  var Cal = node ? require('./calendar.js') : root.ETROM.Calendar;
  function Trips() { return node ? require('./trips.js') : root.ETROM.Trips; }

  var DAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  var DAYS_LONG = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  /**
   * Okres: tydzień (pon–ndz) albo miesiąc kalendarzowy, przesunięty o `offset` okresów.
   * @returns {{mode: string, offset: number, from: Date, to: Date, days: Date[], title: string}}
   */
  function period(now, mode, offset) {
    var ref = startOfDay(now instanceof Date ? now : new Date(now));
    var shift = Number(offset) || 0;
    var from;
    var to;
    var title;
    if (mode === 'month') {
      from = new Date(ref.getFullYear(), ref.getMonth() + shift, 1);
      to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
      title = MONTHS[from.getMonth()] + ' ' + from.getFullYear();
    } else {
      from = addDays(ref, -((ref.getDay() + 6) % 7) + shift * 7);
      to = addDays(from, 6);
      title = from.getDate() + (from.getMonth() === to.getMonth() ? '' : ' ' + MONTHS_GEN[from.getMonth()]) + '–' + to.getDate() + ' ' + MONTHS_GEN[to.getMonth()] + ' ' + to.getFullYear();
    }
    var days = [];
    for (var d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) days.push(d);
    return { mode: mode === 'month' ? 'month' : 'week', offset: shift, from: from, to: to, days: days, title: title };
  }

  /** Próg żółtego: godzina poniżej celu dnia (przy 8 h celu: 7 h). */
  var WARN_BELOW = 60;

  /**
   * Ocena dnia: 'ok' (cel osiągnięty), 'warn' (do godziny brakuje), 'bad' (mniej),
   * 'run' (dziś, jeszcze w trakcie), 'off' (weekend, przyszłość, dni sprzed pierwszego wpisu osoby).
   */
  function dayState(day, target, firstKey) {
    if (day.weekend || day.holiday || day.future) return 'off';
    if (day.today) return day.minutes >= target ? 'ok' : 'run';
    if (!firstKey || day.key < firstKey) return 'off';
    if (day.minutes >= target) return 'ok';
    return day.minutes >= target - WARN_BELOW ? 'warn' : 'bad';
  }

  function ratioState(minutes, expected, days) {
    if (minutes >= expected) return 'ok';
    return minutes >= expected - WARN_BELOW * days ? 'warn' : 'bad';
  }

  /**
   * Karta czasu osoby.
   * @param {Array} entries wszystkie wpisy czasu
   * @param {string} personId
   * @param {Date} now
   * @param {{mode?: string, offset?: number, target?: number}} [options] target: minuty celu dnia (domyślnie 480)
   */
  function build(entries, personId, now, options) {
    var o = options || {};
    var target = Number(o.target) > 0 ? Number(o.target) : 480;
    var p = period(now, o.mode, o.offset);
    var todayKey = TL.dayKey(now instanceof Date ? now.getTime() : now);
    var index = {};
    var days = p.days.map(function (d, i) {
      var key = TL.dayKey(d.getTime());
      index[key] = i;
      return { key: key, date: d.getTime(), label: DAYS[d.getDay()], number: d.getDate(), weekend: d.getDay() === 0 || d.getDay() === 6, holiday: Cal.holidayName(key), today: key === todayKey, future: key > todayKey, minutes: 0 };
    });
    var rows = {};
    var order = [];
    var firstKey = '';
    var gone = Absences.daysOf(o.absences || [], personId);
    var goneInfo = Absences.dayInfo(o.absences || [], personId);
    (entries || []).forEach(function (entry) {
      if (entry.personId !== personId) return;
      var k = TL.dayKey(entry.start);
      if (!firstKey || k < firstKey) firstKey = k;
      var i = index[TL.dayKey(entry.start)];
      if (i === undefined) return;
      var m = TL.minutes(entry, now);
      var pid = String(entry.projectId);
      var row = rows[pid];
      if (!row) {
        row = rows[pid] = { projectId: entry.projectId, minutes: 0, cells: days.map(function () { return 0; }), tasks: {}, taskOrder: [] };
        order.push(pid);
      }
      row.minutes += m;
      row.cells[i] += m;
      days[i].minutes += m;
      var tk = entry.stageId + '|' + entry.taskId;
      var task = row.tasks[tk];
      if (!task) {
        task = row.tasks[tk] = { stageId: entry.stageId, taskId: entry.taskId, label: entry.label || '', minutes: 0, cells: days.map(function () { return 0; }) };
        row.taskOrder.push(tk);
      }
      task.minutes += m;
      task.cells[i] += m;
      if (entry.label) task.label = entry.label;
    });
    // Wyjazd lub spotkanie w dniu pracy: godziny wyjazdu (domyślnie 8:00–16:00) liczą się jako czas pracy tam, gdzie nie było rejestratora.
    if ((o.trips || []).length) days.forEach(function (d, i) {
      if (d.weekend || d.holiday || d.future || gone[Absences.isoOf(new Date(d.date))]) return;
      var win = Trips().windowOn(o.trips, personId, d.key, d.today && now instanceof Date ? now.getHours() * 60 + now.getMinutes() : null);
      if (!win) return;
      var spans = (entries || []).filter(function (e) { return e.personId === personId && TL.dayKey(e.start) === d.key; }).map(function (e) {
        var a = new Date(Date.parse(e.start));
        var b = new Date(e.end ? Date.parse(e.end) : (now instanceof Date ? now.getTime() : Date.now()));
        return { a: a.getHours() * 60 + a.getMinutes(), b: TL.dayKey(b.getTime()) === d.key ? b.getHours() * 60 + b.getMinutes() : 24 * 60 };
      });
      var extra = Trips().uncovered(win, spans);
      d.trip = { tripId: win.tripId, place: win.place, from: win.from, to: win.to, minutes: win.minutes, planned: win.planned, credited: extra, custom: win.custom };
      if (extra <= 0) return;
      if (!firstKey || d.key < firstKey) firstKey = d.key;
      d.minutes += extra;
      if (win.projectId) {
        var pid = String(win.projectId);
        var row = rows[pid];
        if (!row) { row = rows[pid] = { projectId: win.projectId, minutes: 0, cells: days.map(function () { return 0; }), tasks: {}, taskOrder: [] }; order.push(pid); }
        row.minutes += extra; row.cells[i] += extra;
        var tk = '|trip-' + win.tripId;
        var task = row.tasks[tk];
        if (!task) { task = row.tasks[tk] = { stageId: '', taskId: 'trip-' + win.tripId, label: 'Wyjazd · ' + win.place, minutes: 0, cells: days.map(function () { return 0; }) }; row.taskOrder.push(tk); }
        task.minutes += extra; task.cells[i] += extra;
      }
    });
    var list = order.map(function (k) {
      var row = rows[k];
      return {
        projectId: row.projectId, minutes: row.minutes, cells: row.cells,
        tasks: row.taskOrder.map(function (t) { return row.tasks[t]; }).sort(function (a, b) { return b.minutes - a.minutes; })
      };
    }).sort(function (a, b) { return b.minutes - a.minutes; });
    var total = days.reduce(function (sum, d) { return sum + d.minutes; }, 0);
    var workdays = days.filter(function (d) { return !d.weekend && !d.holiday; }).length;
    // Ocena dnia: zielony od celu dnia, żółty do godziny poniżej, czerwony niżej. Dziś liczy się dopiero po osiągnięciu celu.
    var settled = 0;
    days.forEach(function (d) {
      var iso = Absences.isoOf(new Date(d.date));
      d.absent = gone[iso] || '';
      d.state = d.absent && d.minutes < target ? 'off' : dayState(d, target, firstKey);
      if (d.state === 'ok' || d.state === 'warn' || d.state === 'bad') settled += 1;
    });
    var expected = settled * target;
    var settledMinutes = days.reduce(function (sum, d) { return sum + (d.state === 'ok' || d.state === 'warn' || d.state === 'bad' ? d.minutes : 0); }, 0);
    // Norma dnia: tylko dzień roboczy bez święta i bez zaakceptowanej nieobecności. Różnica liczy się dla dni już rozliczonych (co do minuty).
    var counts = { leave: 0, onDemand: 0, sick: 0, training: 0, other: 0, holidays: 0 };
    var normTotal = 0;
    var balance = 0;
    days.forEach(function (d) {
      var iso = Absences.isoOf(new Date(d.date));
      var info = goneInfo[iso];
      d.holidayName = d.holiday ? String(d.holiday) : '';
      d.absentKind = info ? info.kind : '';
      d.onDemand = !!(info && info.onDemand);
      d.norm = d.weekend || d.holiday || info ? 0 : target;
      d.diff = (d.state === 'ok' || d.state === 'warn' || d.state === 'bad') ? d.minutes - target : null;
      if (d.diff !== null) balance += d.diff;
      normTotal += d.norm;
      if (info) { counts[info.kind] = (counts[info.kind] || 0) + 1; if (info.onDemand) counts.onDemand += 1; }
      else if (d.holiday && !d.weekend) counts.holidays += 1;
    });
    // Tygodnie (pon–ndz) przecinające okres: etykieta ISO i sumy.
    var weeks = [];
    days.forEach(function (d, i) {
      var date = new Date(d.date);
      var monday = addDays(date, -((date.getDay() + 6) % 7));
      var key = TL.dayKey(monday.getTime());
      var w = weeks[weeks.length - 1];
      if (!w || w.key !== key) { w = { key: key, number: TL.isoWeek(monday), indices: [], minutes: 0, norm: 0 }; weeks.push(w); }
      w.indices.push(i); w.minutes += d.minutes; w.norm += d.norm;
    });
    return {
      state: expected ? ratioState(settledMinutes, expected, settled) : 'off',
      period: p, days: days, rows: list, total: total,
      target: normTotal, dayTarget: target, workdays: workdays, counts: counts, balance: balance, weeks: weeks,
      absentDays: counts.leave + counts.sick + counts.training + counts.other,
      activeDays: days.filter(function (d) { return d.minutes > 0; }).length
    };
  }

  /** Jedna komórka CSV (średnik jako separator). */
  function cell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    return /[";\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  /** Tablica wierszy → CSV z BOM i końcami CRLF. */
  function csv(rows) {
    return '﻿' + rows.map(function (row) { return row.map(cell).join(';'); }).join('\r\n') + '\r\n';
  }

  function hours(minutes) { return String(Math.round(minutes / 6) / 10).replace('.', ','); }

  /**
   * Wiersze CSV z podsumowaniem karty: projekt, zadanie, godziny w dniach i razem.
   * @param {Object} sheet wynik build()
   * @param {function(*): {code: string, name: string}} project
   */
  function summaryRows(sheet, project) {
    var head = ['Projekt', 'Nazwa projektu', 'Zadanie'].concat(sheet.days.map(function (d) { return d.number + '.' + (new Date(d.date).getMonth() + 1) + ' ' + d.label; }), ['Razem (h)']);
    var out = [head];
    sheet.rows.forEach(function (row) {
      var info = project(row.projectId) || { code: String(row.projectId), name: '' };
      out.push([info.code, info.name, 'RAZEM'].concat(row.cells.map(function (m) { return m ? hours(m) : ''; }), [hours(row.minutes)]));
      row.tasks.forEach(function (task) {
        out.push([info.code, info.name, task.label || task.taskId].concat(task.cells.map(function (m) { return m ? hours(m) : ''; }), [hours(task.minutes)]));
      });
    });
    out.push(['', '', 'SUMA'].concat(sheet.days.map(function (d) { return d.minutes ? hours(d.minutes) : ''; }), [hours(sheet.total)]));
    return out;
  }

  /**
   * Wiersze CSV z pojedynczymi wpisami okresu (do rozliczeń i faktur).
   * @param {function(Object): {project: {code: string, name: string}, stage: string, task: string}} resolve
   */
  function entryRows(entries, personId, now, options, resolve) {
    var p = period(now, options && options.mode, options && options.offset);
    var fromMs = p.from.getTime();
    var toMs = addDays(p.to, 1).getTime();
    var list = (entries || []).filter(function (e) {
      var t = Date.parse(e.start);
      return e.personId === personId && t >= fromMs && t < toMs;
    }).sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
    var out = [['Data', 'Dzień', 'Od', 'Do', 'Minuty', 'Godziny', 'Projekt', 'Nazwa projektu', 'Etap', 'Zadanie', 'Notatka', 'Źródło']];
    list.forEach(function (e) {
      var info = resolve(e) || { project: { code: String(e.projectId), name: '' }, stage: '', task: e.label || '' };
      var start = new Date(e.start);
      var minutes = TL.minutes(e, now);
      out.push([
        TL.dayKey(e.start), DAYS_LONG[start.getDay()], TL.clockOf(Date.parse(e.start)), e.end ? TL.clockOf(Date.parse(e.end)) : '', minutes, hours(minutes),
        info.project.code, info.project.name, info.stage, info.task, e.note || '', e.source === 'manual' ? 'ręcznie' : 'zegar'
      ]);
    });
    return out;
  }

  var api = { period: period, build: build, csv: csv, summaryRows: summaryRows, entryRows: entryRows, hours: hours };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Timesheet = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
