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

  /* Paleta 40 kolorów projektów: 20 barw (od żółtozielonej po różową; czerwień i bursztyn
     zostają dla stanów) w dwóch tonach — jaśniejszym i głębszym.
     Kolejne numery projektów dostają kolory odległe o ~94° barwy (krok 7 w permutacji),
     więc 40 projektów w roku różni się od siebie i sąsiednie nigdy nie są podobne. */
  var PALETTE_SIZE = 40;
  var HUES = 20;
  var HUE_FROM = 125;
  var HUE_TO = 350;
  var PERM_STEP = 7;
  var overrides = {};

  function swatch(index) {
    var i = ((Number(index) % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
    var h = i % HUES;
    return { index: i, hue: Math.round(HUE_FROM + h * (HUE_TO - HUE_FROM) / (HUES - 1)), tone: i < HUES ? 1 : -1 };
  }

  function swatches() {
    var list = [];
    for (var i = 0; i < PALETTE_SIZE; i += 1) list.push(swatch(i));
    return list;
  }

  /** Indeks 0–39 z numeru projektu: ostatnie dwie cyfry kodu (2607 → 7), inaczej skrót kodu. */
  function autoIndex(code) {
    var text = String(code == null ? '' : code);
    var seq = /(\d{2})\s*$/.exec(text);
    var n = seq ? Number(seq[1]) : hash(text);
    return (n * PERM_STEP) % PALETTE_SIZE;
  }

  function validIndex(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PALETTE_SIZE;
  }

  /** Zapamiętuje wybrane przez użytkownika kolory (kod → indeks), by każdy widok brał je automatycznie. */
  function setColors(projects) {
    var map = {};
    (projects || []).forEach(function (p) {
      if (p && validIndex(p.color)) map[String(p.code).toUpperCase()] = p.color;
    });
    overrides = map;
  }

  function colorIndex(code) {
    var key = String(code == null ? '' : code).toUpperCase();
    return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : autoIndex(code);
  }

  /** @returns {number} barwa (oklch) kafla projektu */
  function tileHue(code) { return swatch(colorIndex(code)).hue; }
  function tileTone(code) { return swatch(colorIndex(code)).tone; }

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

  /** Zmienna CSS --hue dla znaczków i kafli projektu. */
  function hueStyle(code) {
    return { '--hue': String(tileHue(code)), '--tone': String(tileTone(code)) };
  }

  /** Zmienne dla segmentów paska czasu. */
  function segStyle(code) {
    return { '--seg-h': String(tileHue(code)), '--seg-t': String(tileTone(code)) };
  }

  var api = { PALETTE_SIZE: PALETTE_SIZE, swatch: swatch, swatches: swatches, autoIndex: autoIndex, validIndex: validIndex, setColors: setColors, colorIndex: colorIndex, tileTone: tileTone, segStyle: segStyle, hue: hue, tileHue: tileHue, hueStyle: hueStyle, coverStyle: coverStyle, initials: initials };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Identity = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
