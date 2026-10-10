/* ETROM — ewidencja czasu pracy do rozliczeń (księgowość, kadry). Czyste funkcje, bez DOM.
   Dwa warianty tego samego miesiąca osoby:
   1. „rzeczywisty” – godziny od–do, przerwy i czas co do minuty z zapisów;
   2. „ewidencja” – układ ewidencji czasu pracy: w każdym dniu z pracą równa norma dnia od 8:00 (domyślnie 8 h, 8:00–16:00),
      z dniami wolnymi (z tytułem) i nieobecnościami (rodzaj i wymiar). Wariant 2 wymaga potwierdzenia, że odpowiada faktycznemu czasowi pracy;
      aplikacja pokazuje różnice względem zapisów (differences), żeby nie dało się ich przemilczeć. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var TL = node ? require('./timelog.js') : root.ETROM.TimeLog;
  var Absences = node ? require('./absences.js') : root.ETROM.Absences;
  var Cal = node ? require('./calendar.js') : root.ETROM.Calendar;

  var DAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  var DAYS_LONG = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var ABSENCE = { leave: 'Urlop wypoczynkowy', sick: 'Zwolnienie lekarskie', training: 'Szkolenie', other: 'Inna usprawiedliwiona nieobecność' };
  var ABSENCE_CODE = { leave: 'U', sick: 'L4', training: 'SZ', other: 'OP' };
  var START = 8 * 60;

  function pad(n) { return String(n).padStart(2, '0'); }
  /** „7:50”. */
  function hm(minutes) { var n = Math.max(0, Math.round(minutes)); return Math.floor(n / 60) + ':' + pad(n % 60); }
  function clock(minutesOfDay) { return pad(Math.floor(minutesOfDay / 60)) + ':' + pad(minutesOfDay % 60); }

  /**
   * Miesiąc osoby dzień po dniu.
   * @param {Array} entries wpisy czasu
   * @param {string} personId
   * @param {Date} now
   * @param {{year: number, month: number, absences?: Array, target?: number, project?: function(*): {code: string}}} o month: 0–11
   */
  function build(entries, personId, now, o) {
    var opt = o || {};
    var target = Number(opt.target) > 0 ? Math.round(Number(opt.target)) : 480;
    var year = opt.year;
    var month = opt.month;
    var nowMs = now instanceof Date ? now.getTime() : Date.now();
    var todayKey = TL.dayKey(nowMs);
    var gone = Absences.dayInfo(opt.absences || [], personId);
    var byDay = {};
    (entries || []).forEach(function (e) {
      if (e.personId !== personId) return;
      var k = TL.dayKey(Date.parse(e.start));
      (byDay[k] = byDay[k] || []).push(e);
    });
    var last = new Date(year, month + 1, 0).getDate();
    var days = [];
    var totals = { minutes: 0, workDays: 0, norm: 0, counts: { leave: 0, onDemand: 0, sick: 0, training: 0, other: 0, holidays: 0, weekends: 0 } };
    for (var d = 1; d <= last; d += 1) {
      var date = new Date(year, month, d);
      var key = TL.dayKey(date.getTime());
      var dow = date.getDay();
      var weekend = dow === 0 || dow === 6;
      var holiday = Cal.holidayName(key);
      var info = gone[key];
      var list = (byDay[key] || []).slice().sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
      var minutes = list.reduce(function (sum, e) { return sum + TL.minutes(e, nowMs); }, 0);
      var row = {
        key: key, number: d, dow: dow, label: DAYS[dow], long: DAYS_LONG[dow], kind: 'idle', minutes: Math.round(minutes),
        from: '', to: '', breakMinutes: 0, projects: [], absenceCode: '', title: '', onDemand: false, future: key > todayKey, norm: 0
      };
      if (minutes > 0) {
        var startMs = Date.parse(list[0].start);
        var endMs = list.reduce(function (m, e) { return Math.max(m, e.end ? Date.parse(e.end) : nowMs); }, 0);
        row.kind = 'work';
        row.from = TL.clockOf(startMs);
        row.to = TL.clockOf(endMs);
        row.breakMinutes = Math.max(0, Math.round((endMs - startMs) / 60000 - minutes));
        var seen = {};
        list.forEach(function (e) {
          var p = opt.project ? opt.project(e.projectId) : null;
          var code = p && p.code ? p.code : String(e.projectId);
          if (!seen[code]) { seen[code] = true; row.projects.push(code); }
        });
        totals.minutes += row.minutes; totals.workDays += 1;
      } else if (info) {
        row.kind = 'absence'; row.absenceKind = info.kind; row.absenceCode = info.onDemand ? 'UŻ' : ABSENCE_CODE[info.kind];
        row.title = ABSENCE[info.kind] + (info.onDemand ? ' (na żądanie)' : ''); row.onDemand = info.onDemand;
        totals.counts[info.kind] += 1; if (info.onDemand) totals.counts.onDemand += 1;
      } else if (holiday) {
        row.kind = 'holiday'; row.title = 'Dzień wolny – święto: ' + holiday;
        if (!weekend) totals.counts.holidays += 1; else totals.counts.weekends += 1;
      } else if (weekend) {
        row.kind = 'weekend'; row.title = 'Dzień wolny – ' + (dow === 0 ? 'niedziela' : 'sobota'); totals.counts.weekends += 1;
      }
      if (!weekend && !holiday && !info) { row.norm = target; totals.norm += target; }
      days.push(row);
    }
    return {
      year: year, month: month, title: MONTHS[month] + ' ' + year, target: target, days: days, totals: totals,
      from: TL.dayKey(new Date(year, month, 1).getTime()), to: TL.dayKey(new Date(year, month, last).getTime())
    };
  }

  /** Dni, w których zapis różni się od normy dnia (wariant 2 ich nie pokazuje): do ostrzeżenia przed eksportem. */
  function differences(record) {
    var out = [];
    record.days.forEach(function (d) {
      if (d.kind === 'work' && d.minutes !== record.target) out.push({ key: d.key, number: d.number, label: d.label, actual: d.minutes, diff: d.minutes - record.target });
    });
    return out;
  }

  /** Wariant 2: równa norma od 8:00 w każdym dniu z pracą. */
  function normative(record) {
    var end = START + record.target;
    var days = record.days.map(function (d) {
      if (d.kind !== 'work') return Object.assign({}, d, { from: '', to: '', minutes: 0, breakMinutes: 0, overtime: 0 });
      return Object.assign({}, d, { from: clock(START), to: clock(end), minutes: record.target, breakMinutes: 0, overtime: 0 });
    });
    var worked = days.filter(function (d) { return d.kind === 'work'; }).length;
    return Object.assign({}, record, { days: days, normative: true, totals: Object.assign({}, record.totals, { minutes: worked * record.target, workDays: worked }) });
  }

  function esc(v) { return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /** Podsumowanie nieobecności w jednym zdaniu: „urlop 3 dni (w tym 1 na żądanie), zwolnienie lekarskie 4 dni”. */
  function absenceLine(record) {
    var c = record.totals.counts;
    var parts = [];
    if (c.leave) parts.push('urlop wypoczynkowy ' + c.leave + (c.leave === 1 ? ' dzień' : ' dni') + (c.onDemand ? ' (w tym ' + c.onDemand + ' na żądanie)' : ''));
    if (c.sick) parts.push('zwolnienie lekarskie ' + c.sick + (c.sick === 1 ? ' dzień' : ' dni'));
    if (c.training) parts.push('szkolenie ' + c.training + (c.training === 1 ? ' dzień' : ' dni'));
    if (c.other) parts.push('inne nieobecności ' + c.other + (c.other === 1 ? ' dzień' : ' dni'));
    if (c.holidays) parts.push('święta ' + c.holidays);
    return parts.join(', ');
  }

  /** Wiersze CSV (średnik, BOM dodaje Timesheet.csv). */
  function csvRows(record, variant, meta) {
    var m = meta || {};
    var out = [];
    out.push([variant === 2 ? 'Ewidencja czasu pracy' : 'Zestawienie czasu pracy (rzeczywisty czas)', m.personName || '', record.title]);
    out.push([]);
    if (variant === 2) {
      out.push(['Data', 'Dzień', 'Rozpoczęcie pracy', 'Zakończenie pracy', 'Godziny pracy', 'Nadgodziny', 'Dzień wolny / nieobecność']);
      record.days.forEach(function (d) {
        out.push([d.key, d.long, d.from, d.to, d.kind === 'work' ? hm(d.minutes) : '', d.kind === 'work' ? '0:00' : '', d.kind === 'work' ? '' : (d.title || '')]);
      });
      out.push(['', '', '', 'Razem', hm(record.totals.minutes), '0:00', absenceLine(record)]);
    } else {
      out.push(['Data', 'Dzień', 'Od', 'Do', 'Przerwy (min)', 'Przepracowano (g:mm)', 'Przepracowano (min)', 'Projekty / nieobecność']);
      record.days.forEach(function (d) {
        out.push([d.key, d.long, d.from, d.to, d.kind === 'work' ? d.breakMinutes : '', d.kind === 'work' ? hm(d.minutes) : '', d.kind === 'work' ? d.minutes : '', d.kind === 'work' ? d.projects.join(', ') : (d.title || '')]);
      });
      out.push(['', '', '', 'Razem', '', hm(record.totals.minutes), record.totals.minutes, absenceLine(record)]);
    }
    return out;
  }

  /**
   * Dokument do wydruku / zapisu jako PDF (pełna strona HTML z arkuszem stylów do druku A4).
   * @param {Object} record wynik build() (dla wariantu 2: normative(build()))
   * @param {1|2} variant
   * @param {{personName?: string, employer?: string, generatedAt?: string, confirmedBy?: string, autoPrint?: boolean}} meta
   */
  function html(record, variant, meta) {
    var m = meta || {};
    var v2 = variant === 2;
    var title = v2 ? 'Ewidencja czasu pracy' : 'Zestawienie czasu pracy – rzeczywisty czas';
    var head = v2
      ? '<tr><th>Data</th><th>Dzień</th><th>Rozpoczęcie</th><th>Zakończenie</th><th>Godziny pracy</th><th>Nadgodziny</th><th>Dzień wolny / nieobecność</th></tr>'
      : '<tr><th>Data</th><th>Dzień</th><th>Od</th><th>Do</th><th>Przerwy</th><th>Przepracowano</th><th>Projekty / nieobecność</th></tr>';
    var rows = record.days.map(function (d) {
      var off = d.kind !== 'work';
      var cls = d.kind === 'weekend' || d.kind === 'holiday' ? ' class="off"' : (d.kind === 'absence' ? ' class="abs"' : '');
      var date = pad(d.number) + '.' + pad(record.month + 1) + '.' + record.year;
      if (v2) return '<tr' + cls + '><td>' + date + '</td><td>' + esc(d.long) + '</td><td>' + esc(d.from) + '</td><td>' + esc(d.to) + '</td><td>' + (off ? '' : hm(d.minutes)) + '</td><td>' + (off ? '' : '0:00') + '</td><td class="l">' + esc(off ? d.title : '') + '</td></tr>';
      return '<tr' + cls + '><td>' + date + '</td><td>' + esc(d.long) + '</td><td>' + esc(d.from) + '</td><td>' + esc(d.to) + '</td><td>' + (off ? '' : (d.breakMinutes ? hm(d.breakMinutes) : '0:00')) + '</td><td>' + (off ? '' : '<b>' + hm(d.minutes) + '</b>') + '</td><td class="l">' + esc(off ? d.title : d.projects.join(', ')) + '</td></tr>';
    }).join('');
    var t = record.totals;
    var foot = '<tr class="sum"><td colspan="4" class="r">Razem (dni z pracą: ' + t.workDays + ')</td>' + (v2 ? '<td>' + hm(t.minutes) + '</td><td>0:00</td>' : '<td></td><td><b>' + hm(t.minutes) + '</b></td>') + '<td class="l">' + esc(absenceLine(record)) + '</td></tr>';
    var basis = v2 ? '' : 'Zestawienie sporządzone na podstawie zapisów czasu pracy w aplikacji ETROM; godziny podano co do minuty.';
    var note = '';
    return '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>' + esc(title + ' – ' + record.title + (m.personName ? ' – ' + m.personName : '')) + '</title><style>'
      + '@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:11px/1.35 "Segoe UI",Arial,sans-serif;color:#111;margin:0}'
      + 'h1{font-size:17px;margin:0 0 2px}h2{font-size:12px;font-weight:500;margin:0 0 10px;color:#444}'
      + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:2px 5px;text-align:center}th{background:#eee;font-weight:600}'
      + 'td.l{text-align:left}td.r{text-align:right}tr.off td{background:#f3f3f3;color:#555}tr.abs td{background:#eaf3fb}tr.sum td{background:#eee;font-weight:600}'
      + '.meta{display:flex;justify-content:space-between;margin-bottom:8px}.sign{display:flex;justify-content:space-between;margin-top:34px}.sign span{width:42%;border-top:1px solid #444;padding-top:3px;text-align:center;color:#444}'
      + '.note,.basis{color:#444;margin:8px 0 0;font-size:10px}@media screen{body{padding:18px;max-width:820px;margin:0 auto}}'
      + '</style></head><body>'
      + '<h1>' + esc(title) + '</h1><h2>' + esc(record.title) + (m.personName ? ' · ' + esc(m.personName) : '') + (m.employer ? ' · ' + esc(m.employer) : '') + '</h2>'
      + '<table><thead>' + head + '</thead><tbody>' + rows + foot + '</tbody></table>'
      + (basis ? '<p class="basis">' + esc(basis) + '</p>' : '')
      + '<div class="sign"><span>podpis pracownika</span><span>podpis pracodawcy</span></div>'
      + (m.generatedAt ? '<p class="basis">Wygenerowano ' + esc(m.generatedAt) + '.</p>' : '')
      + (m.autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});</script>' : '')
      + '</body></html>';
  }

  var api = { build: build, differences: differences, normative: normative, csvRows: csvRows, html: html, absenceLine: absenceLine, hm: hm, ABSENCE: ABSENCE };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.WorkRecord = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
