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

  /* Paleta projektów: 12 barw „głównych” rozstawionych równo po kole (turkus, błękit, fiolet, róż, zieleń,
     limonka, miedź i kolejne), na przemian ciemniejszych i jaśniejszych. Kolejne numery projektów (2601, 2602, …)
     dostają kolejne pozycje, więc 12 projektów z rzędu różni się od siebie wyraźnie, a sąsiednie są zawsze
     odległe barwą i jasnością. Czerwień i bursztyn zostają dla stanów. Pozycje 12–39 to dodatkowe odcienie do ręcznego wyboru. */
  var PALETTE_SIZE = 40;
  var CORE = [
    { hue: 195, tone: 0.3 }, { hue: 255, tone: 0 }, { hue: 300, tone: 0.9 }, { hue: 340, tone: 1.1 },
    { hue: 150, tone: 0.7 }, { hue: 105, tone: 1.8 }, { hue: 55, tone: 1.2 }, { hue: 230, tone: -0.9 },
    { hue: 275, tone: -0.8 }, { hue: 320, tone: -0.9 }, { hue: 125, tone: -0.7 }, { hue: 175, tone: -0.9 }
  ];
  var CORE_N = CORE.length;
  // Tryb „według rodzaju”: każdy rodzaj ma swoją rodzinę barw, a numer projektu tylko ją odcienia.
  var KIND_HUE = { pump: 280, hydro: 190, dam: 262, weir: 212, levee: 48, retention: 150, pond: 168, reservoir: 232, culvert: 308, river: 246, multi: 328, other: 350 };
  var mode = 'number';
  var kindOf = {};
  var overrides = {};

  function swatch(index) {
    var i = ((Number(index) % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
    if (i < CORE_N) return { index: i, hue: CORE[i].hue, tone: CORE[i].tone };
    var j = i - CORE_N;
    var base = CORE[j % CORE_N];
    return { index: i, hue: (base.hue + 12 * (1 + Math.floor(j / CORE_N))) % 360, tone: base.tone > 0.5 ? -0.6 : 1 };
  }

  function swatches() {
    var list = [];
    for (var i = 0; i < PALETTE_SIZE; i += 1) list.push(swatch(i));
    return list;
  }

  /** Pozycja 0–11 z numeru projektu: ostatnie dwie cyfry kodu (2601 → 0, 2607 → 6), inaczej skrót kodu. */
  function autoIndex(code) {
    var text = String(code == null ? '' : code);
    var seq = /(\d{2})\s*$/.exec(text);
    var n = seq ? Number(seq[1]) - 1 : hash(text);
    return ((n % CORE_N) + CORE_N) % CORE_N;
  }

  function validIndex(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PALETTE_SIZE;
  }

  /** Zapamiętuje wybrane przez użytkownika kolory (kod → indeks), by każdy widok brał je automatycznie. */
  function setColors(projects) {
    var map = {};
    var kinds = {};
    var Kinds = root.ETROM && root.ETROM.Kinds;
    (projects || []).forEach(function (p) {
      if (!p) return;
      var key = String(p.code).toUpperCase();
      if (validIndex(p.color)) map[key] = p.color;
      else if (Kinds) kinds[key] = Kinds.of(p);
    });
    overrides = map;
    kindOf = kinds;
  }

  function setMode(value) { mode = value === 'kind' ? 'kind' : 'number'; }

  function seq(code) {
    var m = /(\d{2})\s*$/.exec(String(code == null ? '' : code));
    return m ? Number(m[1]) : hash(code);
  }

  /** Barwa i ton według rodzaju: rodzina barw rodzaju, drobne przesunięcie i ton z numeru. */
  function kindSwatch(code) {
    var key = String(code == null ? '' : code).toUpperCase();
    var kind = kindOf[key];
    if (mode !== 'kind' || !kind || Object.prototype.hasOwnProperty.call(overrides, key)) return null;
    var n = seq(code);
    return { hue: (KIND_HUE[kind] || KIND_HUE.other) + ((n % 5) - 2) * 6, tone: n % 2 ? 0.8 : -0.6 };
  }

  function colorIndex(code) {
    var key = String(code == null ? '' : code).toUpperCase();
    return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : autoIndex(code);
  }

  /** @returns {number} barwa (oklch) kafla projektu */
  function tileHue(code) { var k = kindSwatch(code); return k ? k.hue : swatch(colorIndex(code)).hue; }
  function tileTone(code) { var k = kindSwatch(code); return k ? k.tone : swatch(colorIndex(code)).tone; }

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

  var api = { PALETTE_SIZE: PALETTE_SIZE, swatch: swatch, swatches: swatches, autoIndex: autoIndex, validIndex: validIndex, setColors: setColors, setMode: setMode, colorIndex: colorIndex, tileTone: tileTone, segStyle: segStyle, hue: hue, tileHue: tileHue, hueStyle: hueStyle, coverStyle: coverStyle, initials: initials };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Identity = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
