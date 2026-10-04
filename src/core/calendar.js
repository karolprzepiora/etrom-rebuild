/* ETROM — kalendarz: polskie święta, numer tygodnia, dni robocze. Czyste funkcje, daty jako 'RRRR-MM-DD'.
   Wspólne dla wybieracza dat, planu tygodni i ekranu Kalendarz. */
(function (root) {
  'use strict';

  var NAMES = {
    '01-01': 'Nowy Rok', '01-06': 'Trzech Króli', '05-01': 'Święto Pracy', '05-03': 'Święto Konstytucji 3 Maja',
    '08-15': 'Wniebowzięcie NMP', '11-01': 'Wszystkich Świętych', '11-11': 'Święto Niepodległości',
    '12-24': 'Wigilia', '12-25': 'Boże Narodzenie', '12-26': 'Drugi dzień Świąt'
  };
  var cache = {};

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(iso) { return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))); }
  function addDays(iso, n) { var d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); }

  /** Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera). */
  function easter(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return year + '-' + pad(month) + '-' + pad(day);
  }

  /** Mapa 'RRRR-MM-DD' → nazwa święta dla danego roku (stałe i ruchome; Wigilia wolna od 2025). */
  function holidays(year) {
    if (cache[year]) return cache[year];
    var map = {};
    Object.keys(NAMES).forEach(function (k) {
      if (k === '12-24' && year < 2025) return;
      map[year + '-' + k] = NAMES[k];
    });
    var e = easter(year);
    map[e] = 'Wielkanoc';
    map[addDays(e, 1)] = 'Poniedziałek Wielkanocny';
    map[addDays(e, 49)] = 'Zielone Świątki';
    map[addDays(e, 60)] = 'Boże Ciało';
    cache[year] = map;
    return map;
  }

  function holidayName(iso) { return holidays(Number(iso.slice(0, 4)))[iso] || ''; }
  function isHoliday(iso) { return !!holidayName(iso); }
  function isWeekend(iso) { var w = parse(iso).getDay(); return w === 0 || w === 6; }
  function isWorkday(iso) { return !isWeekend(iso) && !isHoliday(iso); }

  /** Liczba dni roboczych w zakresie włącznie (bez weekendów i świąt). */
  function workdaysIn(from, to) {
    if (!from || !to || to < from) return 0;
    var n = 0, d = from, guard = 0;
    while (d <= to && guard++ < 4000) { if (isWorkday(d)) n += 1; d = addDays(d, 1); }
    return n;
  }

  /** Numer tygodnia ISO. */
  function weekNumber(iso) {
    var d = parse(iso);
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var n = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - n);
    var y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y) / 86400000 + 1) / 7);
  }

  /** Poniedziałek tygodnia, w którym leży dzień. */
  function mondayOf(iso) { var w = (parse(iso).getDay() + 6) % 7; return addDays(iso, -w); }

  /** 42 dni siatki miesiąca (6 tygodni od poniedziałku). month: 0–11. */
  function monthGrid(year, month) {
    var first = year + '-' + pad(month + 1) + '-01';
    var start = mondayOf(first), out = [];
    for (var i = 0; i < 42; i++) out.push(addDays(start, i));
    return out;
  }


  /** Czytanie wpisanego tekstu. Zwraca 'RRRR-MM-DD', '' (puste) albo null (nie rozumiem). */
  function parseInput(text, base) {
    var t = String(text == null ? '' : text).trim().toLowerCase();
    var today = base || isoOf(new Date());
    if (!t) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return Number.isNaN(Date.parse(t + 'T00:00:00')) ? null : t;
    var m;
    if (t === 'dziś' || t === 'dzis' || t === 'dz') return today;
    if (t === 'jutro') return addDays(today, 1);
    if (t === 'pojutrze') return addDays(today, 2);
    if (t === 'wczoraj') return addDays(today, -1);
    if ((m = /^([+-])\s*(\d{1,3})\s*(d|dn|dni|t|tyg|tydz)?$/.exec(t))) {
      var n = Number(m[2]) * (m[3] && m[3].charAt(0) === 't' ? 7 : 1) * (m[1] === '-' ? -1 : 1);
      return addDays(today, n);
    }
    var names = { pn: 1, pon: 1, poniedziałek: 1, wt: 2, wto: 2, wtorek: 2, 'śr': 3, sr: 3, 'środa': 3, srode: 3, cz: 4, czw: 4, czwartek: 4, pt: 5, pia: 5, 'piątek': 5, sb: 6, sob: 6, sobota: 6, nd: 0, nie: 0, niedz: 0, niedziela: 0 };
    if (Object.prototype.hasOwnProperty.call(names, t)) {
      var cur = parse(today).getDay();
      var diff = (names[t] - cur + 7) % 7;
      return addDays(today, diff === 0 ? 7 : diff);
    }
    if ((m = /^(\d{1,2})[.\-/ ](\d{1,2})(?:[.\-/ ](\d{2}|\d{4}))?\.?$/.exec(t))) {
      var day = Number(m[1]);
      var month = Number(m[2]);
      var y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
      if (m[3] && m[3].length === 2) y += 2000;
      var iso = y + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
      var back = parse(iso);
      if (month < 1 || month > 12 || back.getDate() !== day || back.getMonth() !== month - 1) return null;
      // Bez roku: najbliższa taka data, nie dalej niż pół roku wstecz.
      if (!m[3] && iso < addDays(today, -183)) return isoOf(new Date(y + 1, month - 1, day));
      return iso;
    }
    if ((m = /^(\d{1,2})$/.exec(t))) {
      var dd = Number(m[1]);
      if (dd < 1 || dd > 31) return null;
      var d0 = parse(today);
      var cand = new Date(d0.getFullYear(), d0.getMonth(), dd);
      if (cand.getDate() !== dd) return null;
      if (isoOf(cand) < today) cand = new Date(d0.getFullYear(), d0.getMonth() + 1, dd);
      return cand.getDate() === dd ? isoOf(cand) : null;
    }
    return null;
  }

  var api = {
    parseInput: parseInput,
    isoOf: isoOf, parse: parse, addDays: addDays, easter: easter, holidays: holidays, holidayName: holidayName,
    isHoliday: isHoliday, isWeekend: isWeekend, isWorkday: isWorkday, workdaysIn: workdaysIn,
    weekNumber: weekNumber, mondayOf: mondayOf, monthGrid: monthGrid
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Calendar = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
