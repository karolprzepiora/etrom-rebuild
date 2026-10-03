/* ETROM — rejestr czasu pracy.
   Wpisy leżą osobno od zadań, jako lista dopisywanych rekordów: każdy ma własny
   identyfikator, osobę i znaczniki czasu w UTC. Tak dane nadają się do wspólnej
   bazy (dopisywanie nie powoduje konfliktów), a usunięcie zadania nie kasuje
   historii pracy. Zegar to wpis bez końca; osoba ma najwyżej jeden.
   Czyste funkcje: żadna nie zmienia danych wejściowych. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;

  var MAX_NOTE = 300;
  var MAX_MANUAL_HOURS = 24;
  // Zegar chodzący dłużej to prawie na pewno zapomniany — pytamy, ile liczyć.
  var FORGOTTEN_MINUTES = 10 * 60;

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function time(value) { var t = Date.parse(value); return Number.isFinite(t) ? t : null; }
  function pad(n) { return String(n).padStart(2, '0'); }

  var counter = 0;
  /** Identyfikator niezależny od innych urządzeń: czas + losowa końcówka. */
  function newId() {
    counter += 1;
    return 'e-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + counter.toString(36);
  }

  /** Dzień lokalny „RRRR-MM-DD” dla znacznika czasu. */
  function dayKey(value) {
    var d = new Date(typeof value === 'number' ? value : Date.parse(value));
    if (!Number.isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function nowMs(now) { return now instanceof Date ? now.getTime() : Date.now(); }

  /** Czas trwania wpisu w pełnych minutach; zegar liczy do `now`. */
  function minutes(entry, now) {
    var start = time(entry && entry.start);
    if (start === null) return 0;
    var end = entry.end ? time(entry.end) : nowMs(now);
    if (end === null) return 0;
    return Math.max(0, Math.round((end - start) / 60000));
  }

  function running(entries, personId) {
    var list = entries || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].personId === personId && !list[i].end) return list[i];
    }
    return null;
  }

  /**
   * Włącza zegar dla zadania. Zegar tej osoby, który już chodzi, zostaje
   * zatrzymany w tej samej chwili — jedna osoba pracuje nad jedną rzeczą naraz.
   * @returns {{entries: Array, started: Object, stopped: (Object|null), same: boolean}}
   */
  function start(entries, spec, now) {
    var at = nowMs(now);
    var current = running(entries, spec.personId);
    if (current && current.taskId === spec.taskId && current.projectId === spec.projectId && current.stageId === spec.stageId) {
      return { entries: (entries || []).slice(), started: current, stopped: null, same: true };
    }
    var stopped = null;
    var list = (entries || []).map(function (entry) {
      if (entry !== current) return entry;
      stopped = Object.assign({}, entry, { end: new Date(at).toISOString(), updatedAt: new Date(at).toISOString() });
      return stopped;
    });
    var started = {
      id: newId(), personId: spec.personId, projectId: spec.projectId, stageId: spec.stageId, taskId: spec.taskId,
      label: text(spec.label), start: new Date(at).toISOString(), end: null, note: '', source: 'timer',
      updatedAt: new Date(at).toISOString()
    };
    return { entries: list.concat([started]), started: started, stopped: stopped, same: false };
  }

  /**
   * Zatrzymuje zegar. `options.minutes` liczy tylko tyle minut od startu —
   * dla zegara zapomnianego przy komputerze.
   * @returns {{entries: Array, stopped: (Object|null)}}
   */
  function stop(entries, personId, now, options) {
    var current = running(entries, personId);
    if (!current) return { entries: (entries || []).slice(), stopped: null };
    var at = nowMs(now);
    var end = at;
    var cap = options && Number(options.minutes);
    if (Number.isFinite(cap) && cap >= 0) end = Math.min(at, time(current.start) + Math.round(cap) * 60000);
    var stopped = Object.assign({}, current, { end: new Date(end).toISOString(), updatedAt: new Date(at).toISOString() });
    return {
      entries: entries.map(function (entry) { return entry === current ? stopped : entry; }),
      stopped: stopped
    };
  }

  /**
   * Wpis ręczny: dzień i liczba godzin, do zadania. Kończy się w południe
   * wskazanego dnia, żeby nie wypadał poza dobę.
   * @returns {{valid: boolean, errors: Object, entries: Array, entry: (Object|null)}}
   */
  function addManual(entries, spec, now) {
    var errors = {};
    var hours = Number(String(spec.hours === undefined ? '' : spec.hours).replace(',', '.'));
    var date = text(spec.date);
    if (!Number.isFinite(hours) || hours <= 0) errors.hours = 'Podaj liczbę godzin większą od zera.';
    else if (hours > MAX_MANUAL_HOURS) errors.hours = 'Jeden wpis nie może mieć więcej niż ' + MAX_MANUAL_HOURS + ' godzin.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00'))) errors.date = 'Podaj poprawną datę.';
    else if (new Date(date + 'T00:00:00').getTime() > nowMs(now)) errors.date = 'Czasu nie można zapisać na przyszłość.';
    var note = text(spec.note);
    if (note.length > MAX_NOTE) errors.note = 'Notatka może mieć najwyżej ' + MAX_NOTE + ' znaków.';
    if (Object.keys(errors).length) return { valid: false, errors: errors, entries: (entries || []).slice(), entry: null };

    var startMs = new Date(date + 'T12:00:00').getTime() - Math.round(hours * 60) * 60000;
    var stamp = new Date(nowMs(now)).toISOString();
    var entry = {
      id: newId(), personId: spec.personId, projectId: spec.projectId, stageId: spec.stageId, taskId: spec.taskId,
      label: text(spec.label), start: new Date(startMs).toISOString(), end: new Date(startMs + Math.round(hours * 60) * 60000).toISOString(),
      note: note, source: 'manual', updatedAt: stamp
    };
    return { valid: true, errors: {}, entries: (entries || []).concat([entry]), entry: entry };
  }

  /** Zmiana godzin lub notatki istniejącego (zakończonego) wpisu. */
  function update(entries, id, patch, now) {
    var errors = {};
    var target = (entries || []).filter(function (e) { return e.id === id; })[0];
    if (!target || !target.end) return { valid: false, errors: { hours: 'Nie znaleziono wpisu.' }, entries: (entries || []).slice(), entry: null };
    var data = patch || {};
    var next = Object.assign({}, target, { updatedAt: new Date(nowMs(now)).toISOString() });
    if (data.hours !== undefined) {
      var hours = Number(String(data.hours).replace(',', '.'));
      if (!Number.isFinite(hours) || hours <= 0) errors.hours = 'Podaj liczbę godzin większą od zera.';
      else if (hours > MAX_MANUAL_HOURS) errors.hours = 'Jeden wpis nie może mieć więcej niż ' + MAX_MANUAL_HOURS + ' godzin.';
      else next.end = new Date(time(target.start) + Math.round(hours * 60) * 60000).toISOString();
    }
    if (data.note !== undefined) {
      var note = text(data.note);
      if (note.length > MAX_NOTE) errors.note = 'Notatka może mieć najwyżej ' + MAX_NOTE + ' znaków.';
      else next.note = note;
    }
    if (Object.keys(errors).length) return { valid: false, errors: errors, entries: entries.slice(), entry: null };
    return { valid: true, errors: {}, entries: entries.map(function (e) { return e === target ? next : e; }), entry: next };
  }

  function remove(entries, id) {
    return (entries || []).filter(function (entry) { return entry.id !== id; });
  }

  /** Wpisy osoby, które zaczęły się w danym dniu (domyślnie dziś), od najnowszego. */
  function forDay(entries, personId, now, day) {
    var key = day || dayKey(nowMs(now));
    return (entries || []).filter(function (entry) { return entry.personId === personId && dayKey(entry.start) === key; })
      .sort(function (a, b) { return time(b.start) - time(a.start); });
  }

  /** Suma minut. Opcjonalnie filtr po osobie i dniu. */
  function sum(list, now) {
    return (list || []).reduce(function (total, entry) { return total + minutes(entry, now); }, 0);
  }

  /** Minuty zapisane w projekcie, rozbite na etapy: { stageId: minuty }. */
  function byStage(entries, projectId, now) {
    var result = {};
    (entries || []).forEach(function (entry) {
      if (entry.projectId !== projectId) return;
      result[entry.stageId] = (result[entry.stageId] || 0) + minutes(entry, now);
    });
    return result;
  }

  /** Minuty zapisane na zadaniu, rozbite na osoby: { personId: minuty }. */
  function byPerson(entries, projectId, taskId, now) {
    var result = {};
    (entries || []).forEach(function (entry) {
      if (entry.projectId !== projectId || entry.taskId !== taskId) return;
      result[entry.personId] = (result[entry.personId] || 0) + minutes(entry, now);
    });
    return result;
  }

  function projectMinutes(entries, projectId, now) {
    return sum((entries || []).filter(function (e) { return e.projectId === projectId; }), now);
  }

  /** Czy chodzący zegar wygląda na zapomniany. */
  function isForgotten(entry, now) {
    return !!entry && !entry.end && minutes(entry, now) >= FORGOTTEN_MINUTES;
  }

  /** „1:05:09” — zegar na żywo. */
  function clock(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return h + ':' + pad(m) + ':' + pad(s);
  }

  /** „2 h 15 min”, „45 min”, „0 min”. */
  function duration(totalMinutes) {
    var n = Math.max(0, Math.round(totalMinutes));
    var h = Math.floor(n / 60);
    var m = n % 60;
    if (!h) return m + ' min';
    return m ? h + ' h ' + m + ' min' : h + ' h';
  }


  var DAYS_SHORT = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
  var DAYS_LONG = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  var MONTHS_LONG = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

  /** Numer tygodnia ISO 8601. */
  function isoWeek(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  /** Etykiety zegara w pasku: „sob. 3 paź”, „11:44” i pełna data do podpowiedzi. */
  function clockLabel(now) {
    var d = now instanceof Date ? now : new Date(now);
    return {
      day: DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()],
      time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
      long: DAYS_LONG[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_LONG[d.getMonth()] + ' ' + d.getFullYear() + ' · tydzień ' + isoWeek(d)
    };
  }

  /**
   * Tydzień pracy osoby (pon–ndz) z podziałem każdego dnia na projekty.
   * @returns {Array<{key:string,label:string,date:number,minutes:number,today:boolean,weekend:boolean,projects:Array<{projectId:string,minutes:number}>}>}
   */
  function weekDays(entries, personId, now) {
    var ref = now instanceof Date ? now : new Date(nowMs(now));
    var monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ((ref.getDay() + 6) % 7));
    var todayKey = dayKey(ref.getTime());
    var out = [];
    for (var i = 0; i < 7; i += 1) {
      var day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      var key = dayKey(day.getTime());
      var by = {};
      var order = [];
      var total = 0;
      (entries || []).forEach(function (entry) {
        if (entry.personId !== personId || dayKey(entry.start) !== key) return;
        var m = minutes(entry, now);
        if (!by[entry.projectId]) { by[entry.projectId] = 0; order.push(entry.projectId); }
        by[entry.projectId] += m;
        total += m;
      });
      out.push({
        key: key, date: day.getTime(), label: DAYS_SHORT[day.getDay()].replace('.', ''), minutes: total,
        today: key === todayKey, weekend: day.getDay() === 0 || day.getDay() === 6,
        projects: order.map(function (id) { return { projectId: id, minutes: by[id] }; })
      });
    }
    return out;
  }

  /**
   * Luki między zapisami tego samego dnia (od pierwszego startu do teraz lub końca ostatniego wpisu).
   * @param {Array} list wpisy dnia, w dowolnej kolejności
   * @param {number} [minGap] minimalna długość luki w minutach
   * @returns {Array<{from:number,to:number,minutes:number}>} znaczniki czasu ms
   */
  function gaps(list, now, minGap) {
    var limit = minGap || 20;
    var spans = (list || []).map(function (entry) {
      var a = time(entry.start);
      var b = entry.end ? time(entry.end) : nowMs(now);
      return a === null || b === null ? null : { a: a, b: Math.max(a, b) };
    }).filter(Boolean).sort(function (x, y) { return x.a - y.a; });
    var out = [];
    var reach = null;
    spans.forEach(function (span) {
      if (reach !== null && span.a - reach >= limit * 60000) {
        out.push({ from: reach, to: span.a, minutes: Math.round((span.a - reach) / 60000) });
      }
      reach = reach === null ? span.b : Math.max(reach, span.b);
    });
    return out;
  }

  /** Godziny jako liczba z przecinkiem: 12,5. */
  function hoursOf(totalMinutes) {
    return Math.round(totalMinutes / 6) / 10;
  }

  /**
   * Odczyt z zapisu: odrzuca uszkodzone wpisy i wpisy nieistniejących
   * projektów, pilnuje jednego zegara na osobę.
   */
  function normalizeEntries(raw, projectIds) {
    var known = {};
    (projectIds || []).forEach(function (id) { known[id] = true; });
    var seen = {};
    var runningBy = {};
    var out = [];
    (Array.isArray(raw) ? raw : []).forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var id = text(item.id);
      var personId = text(item.personId);
      var start = time(item.start);
      if (!id || seen[id] || !personId || start === null || !known[item.projectId]) return;
      var end = item.end ? time(item.end) : null;
      if (item.end && (end === null || end < start)) return;
      if (!end) {
        // Drugi chodzący zegar tej samej osoby: wcześniejszy zamykamy w chwili startu późniejszego.
        var prev = runningBy[personId];
        if (prev) {
          if (start >= time(prev.start)) { prev.end = new Date(start).toISOString(); runningBy[personId] = null; }
          else return;
        }
      }
      seen[id] = true;
      var entry = {
        id: id, personId: personId, projectId: item.projectId, stageId: String(item.stageId || ''), taskId: String(item.taskId || ''),
        label: text(item.label), start: new Date(start).toISOString(), end: end ? new Date(end).toISOString() : null,
        note: text(item.note).slice(0, MAX_NOTE), source: item.source === 'manual' ? 'manual' : 'timer',
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(start).toISOString()
      };
      if (!entry.end) runningBy[personId] = entry;
      out.push(entry);
    });
    return out;
  }

  var api = {
    FORGOTTEN_MINUTES: FORGOTTEN_MINUTES,
    newId: newId,
    dayKey: dayKey,
    minutes: minutes,
    running: running,
    start: start,
    stop: stop,
    addManual: addManual,
    update: update,
    remove: remove,
    forDay: forDay,
    sum: sum,
    byStage: byStage,
    byPerson: byPerson,
    projectMinutes: projectMinutes,
    isForgotten: isForgotten,
    clock: clock,
    duration: duration,
    hoursOf: hoursOf,
    clockLabel: clockLabel,
    isoWeek: isoWeek,
    weekDays: weekDays,
    gaps: gaps,
    normalizeEntries: normalizeEntries
  };

  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.TimeLog = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
