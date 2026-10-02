/* ETROM — formatowanie liczb, dat i odmiana przez liczby.
   Jedno miejsce dla mikrocopy z liczbami: „1 projekt”, „3 projekty”,
   „5 projektów” — zamiast obejść typu „projekty: 5”. Czyste funkcje. */
(function (root) {
  'use strict';

  var MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  var MONTHS_FULL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca',
    'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

  /** Polska odmiana: 1 → one, 2–4 (poza 12–14) → few, reszta → many. */
  function plural(count, one, few, many) {
    var n = Math.abs(Math.trunc(Number(count) || 0));
    if (n === 1) return one;
    var tens = n % 100;
    var units = n % 10;
    if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return few;
    return many;
  }

  /** „5 projektów” — liczba z odmienionym rzeczownikiem. */
  function count(n, one, few, many) {
    return number(n) + ' ' + plural(n, one, few, many);
  }

  /** Liczba z polskim separatorem tysięcy (spacja nierozdzielająca). */
  function number(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '—';
    var sign = n < 0 ? '-' : '';
    var parts = String(Math.abs(Math.round(n))).split('');
    var out = '';
    for (var i = 0; i < parts.length; i += 1) {
      var fromEnd = parts.length - i;
      out += parts[i];
      // Polska norma: grupujemy dopiero od 5 cyfr (1240, ale 12 400).
      if (parts.length > 4 && fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ' ';
    }
    return sign + out;
  }

  function hours(value) {
    return number(value) + ' h';
  }

  function parse(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
    if (!match) return null;
    return {
      year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]),
      hour: match[4] != null ? Number(match[4]) : null,
      minute: match[5] != null ? Number(match[5]) : null
    };
  }

  /**
   * „12 paź 2026”, a w bieżącym roku „12 paź”.
   * @param {string} value YYYY-MM-DD albo YYYY-MM-DDTHH:mm
   * @param {{now?: Date, year?: 'auto'|'always'}} [options]
   */
  function date(value, options) {
    var d = parse(value);
    if (!d) return '';
    var settings = options || {};
    var now = settings.now || new Date();
    var withYear = settings.year === 'always' || d.year !== now.getFullYear();
    return d.day + ' ' + MONTHS[d.month] + (withYear ? ' ' + d.year : '');
  }

  /** „12 października 2026” — pełna forma do podpowiedzi i opisów dostępnych. */
  function dateLong(value) {
    var d = parse(value);
    if (!d) return '';
    return d.day + ' ' + MONTHS_FULL[d.month] + ' ' + d.year;
  }

  /** „12 paź, 14:00” */
  function dateTime(value, options) {
    var d = parse(value);
    if (!d) return '';
    var base = date(value, options);
    if (d.hour == null) return base;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return base + ', ' + pad(d.hour) + ':' + pad(d.minute);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /**
   * Czas względny jak w mediach społecznościowych: „przed chwilą”, „5 min temu”,
   * „2 godz. temu”, „wczoraj, 14:05”, a dalej „28 wrz, 14:05”.
   * @param {string} iso znacznik czasu
   * @param {Date} [now]
   */
  function ago(iso, now) {
    var at = new Date(iso);
    if (!Number.isFinite(at.getTime())) return '';
    var ref = now instanceof Date ? now : new Date();
    var diff = ref.getTime() - at.getTime();
    var clock = pad2(at.getHours()) + ':' + pad2(at.getMinutes());
    if (diff < 0) return date(at.getFullYear() + '-' + pad2(at.getMonth() + 1) + '-' + pad2(at.getDate()), { now: ref }) + ', ' + clock;
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'przed chwilą';
    if (minutes < 60) return minutes + ' min temu';
    var startToday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
    if (at.getTime() >= startToday) return Math.floor(minutes / 60) + ' godz. temu';
    if (at.getTime() >= startToday - 86400000) return 'wczoraj, ' + clock;
    return date(at.getFullYear() + '-' + pad2(at.getMonth() + 1) + '-' + pad2(at.getDate()), { now: ref }) + ', ' + clock;
  }

  /** Etykieta dnia do separatorów strumienia: „Dziś”, „Wczoraj”, „pon., 28 wrz”. */
  function dayLabel(iso, now) {
    var at = new Date(iso);
    if (!Number.isFinite(at.getTime())) return '';
    var ref = now instanceof Date ? now : new Date();
    var day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
    var today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
    if (day === today) return 'Dziś';
    if (day === today - 86400000) return 'Wczoraj';
    var names = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
    return names[at.getDay()] + ', ' + date(at.getFullYear() + '-' + pad2(at.getMonth() + 1) + '-' + pad2(at.getDate()), { now: ref });
  }

  /** „57%” bez spacji, zgodnie z zapisem w tabelach. */
  function percent(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.round(n) + '%' : '—';
  }

  var api = {
    plural: plural,
    count: count,
    number: number,
    hours: hours,
    date: date,
    dateLong: dateLong,
    dateTime: dateTime,
    percent: percent,
    ago: ago,
    dayLabel: dayLabel,
    MONTHS: MONTHS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Format = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
