/* ETROM — zestaw ikon. Rysowane w kodzie, więc nie trzeba pobierać
   żadnego pliku i wszystko działa po dwukliku z dysku. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;

  // Ścieżki 24×24, rysowane konturem w kolorze tekstu.
  var PATHS = {
    // Dziedziny etapów
    general: ['M9 4h6v3H9z', 'M7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17', 'M8 12h8', 'M8 16h5'],
    design: ['M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z', 'M10 19h4', 'M10.5 21.5h3'],
    environment: ['M5 20c0-7 4.5-12 14-12 0 8-4.5 12-10 12H5Z', 'M5 20c2-4 5-6.5 9-8'],
    water: ['M12 3.5s6 6.2 6 10.1A6 6 0 0 1 6 13.6C6 9.7 12 3.5 12 3.5Z', 'M9.5 14.5a2.6 2.6 0 0 0 2.5 2.4'],
    location: ['M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
    building: ['M4 21V6.5L12 3l8 3.5V21', 'M4 21h16', 'M9 21v-5h6v5', 'M8.5 9h2', 'M13.5 9h2', 'M8.5 12.5h2', 'M13.5 12.5h2'],

    // Interfejs
    folder: ['M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 18V7.5Z'],
    board: ['M4 5h16v14H4z', 'M9 5v14', 'M14 5v14'],
    calendar: ['M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-12Z', 'M4 9.5h16', 'M8.5 3v4', 'M15.5 3v4'],
    alert: ['M12 4 2.8 20h18.4L12 4Z', 'M12 10v4.5', 'M12 17.2v.2'],
    people: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5', 'M16 4.6a3.5 3.5 0 0 1 0 6.8', 'M17.5 14.9c2.4.6 4 2.4 4 5.1'],
    close: ['M6 6l12 12', 'M18 6 6 18'],
    search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'M16.2 16.2 21 21'],
    sun: ['M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.2 5.2l1.4 1.4', 'M17.4 17.4l1.4 1.4', 'M18.8 5.2l-1.4 1.4', 'M6.6 17.4l-1.4 1.4'],
    moon: ['M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z'],
    auto: ['M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 14.5v-9Z', 'M9 20h6', 'M12 16v4'],
    cards: ['M4 5h7v6H4z', 'M13 5h7v6h-7z', 'M4 13h7v6H4z', 'M13 13h7v6h-7z'],
    rows: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
    chevron: ['M6 9.5 12 15l6-5.5']
  };

  /**
   * @param {string} name klucz z PATHS
   * @param {number} [size] bok w pikselach
   */
  function icon(name, size) {
    var side = size || 18;
    var paths = PATHS[name] || PATHS.folder;
    return D.svg('svg', {
      viewBox: '0 0 24 24',
      width: side,
      height: side,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.7',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false'
    }, paths.map(function (d) { return D.svg('path', { d: d }); }));
  }

  root.ETROM.Icons = { icon: icon, has: function (name) { return !!PATHS[name]; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
