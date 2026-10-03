/* ETROM — stała identyfikacja wizualna projektu.
   Kolor okładki wynika z kodu projektu, więc ten sam projekt zawsze
   wygląda tak samo, a dwa sąsiednie rzadko mają zbliżoną barwę.
   Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  // Liczby pierwsze rozrzucają sąsiednie kody (W-1, W-2) po całym kole barw.
  var HUE_STEP = 137;

  function hash(value) {
    var text = String(value == null ? '' : value).toUpperCase();
    var result = 0;
    for (var i = 0; i < text.length; i += 1) {
      result = (result * 31 + text.charCodeAt(i)) % 100003;
    }
    return result;
  }

  /** @returns {number} barwa 0–359, zawsze ta sama dla tego samego kodu */
  function hue(code) {
    return (hash(code) * HUE_STEP) % 360;
  }

  /** Barwa tła kafla: tylko zielenie–fiolety (150–290), by czerwień i bursztyn znaczyły wyłącznie stan. */
  function tileHue(code) {
    return 150 + (hue(code) % 140);
  }

  /**
   * Zmienne CSS okładki projektu: dwa przygaszone odcienie i kąt warstwic.
   * Nasycenie trzymane nisko, żeby biała typografia pozostała czytelna.
   */
  function coverStyle(code) {
    var base = hue(code);
    var shift = (base + 24) % 360;
    var angle = 100 + (hash(code) % 60);
    return {
      '--cover-a': 'hsl(' + base + ' 30% 42%)',
      '--cover-b': 'hsl(' + shift + ' 34% 27%)',
      '--cover-angle': angle + 'deg'
    };
  }

  /** Inicjały osoby do awatara: „Anna Testowa” → „AT”. */
  function initials(name) {
    var parts = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('pl');
    return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('pl');
  }

  var api = { hue: hue, tileHue: tileHue, coverStyle: coverStyle, initials: initials };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Identity = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
