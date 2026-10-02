/* ETROM — jeden zestaw ikon. Siatka 24×24, kontur 1,6, zaokrąglone końce.
   Rysowane w kodzie: działa po dwukliku z dysku, bez pobierania plików.
   Zasada: ikona wspiera tekst. Ikona bez tekstu musi mieć etykietę
   dostępną i podpowiedź (UI.iconButton pilnuje obu). */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;

  var PATHS = {
    // Dziedziny etapów
    general: ['M9 4h6v3H9z', 'M7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17', 'M8 12h8', 'M8 16h5'],
    design: ['M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z', 'M10 19h4', 'M10.5 21.5h3'],
    environment: ['M5 20c0-7 4.5-12 14-12 0 8-4.5 12-10 12H5Z', 'M5 20c2-4 5-6.5 9-8'],
    water: ['M12 3.5s6 6.2 6 10.1A6 6 0 0 1 6 13.6C6 9.7 12 3.5 12 3.5Z', 'M9.5 14.5a2.6 2.6 0 0 0 2.5 2.4'],
    location: ['M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
    building: ['M4 21V6.5L12 3l8 3.5V21', 'M4 21h16', 'M9 21v-5h6v5', 'M8.5 9h2', 'M13.5 9h2', 'M8.5 12.5h2', 'M13.5 12.5h2'],

    // Korespondencja
    mail: ['M4 6.5h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11Z', 'M4.5 7.5 12 13l7.5-5.5'],
    reply: ['M9.5 6 4 11.5 9.5 17', 'M4 11.5h9a6.5 6.5 0 0 1 6.5 6.5'],

    // Zegar
    play: ['M8 5.5v13l10.5-6.5L8 5.5Z'],
    stop: ['M7 7h10v10H7z'],

    // Rodzaje pracy
    kindMaterials: ['M4 13l2-7h12l2 7', 'M4 13v5.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V13', 'M4 13h4.5a3.5 3.5 0 0 0 7 0H20'],
    kindDocs: ['M6 3.5h8l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z', 'M14 3.5v4h4', 'M8.5 12h7', 'M8.5 15.5h5'],
    kindDecision: ['M12 4a2.8 2.8 0 0 0-1.6 5.1c.4.3.6.7.6 1.2V12h2v-1.7c0-.5.2-.9.6-1.2A2.8 2.8 0 0 0 12 4Z', 'M6.5 12h11a1.5 1.5 0 0 1 1.5 1.5V16H5v-2.5A1.5 1.5 0 0 1 6.5 12Z', 'M4.5 20h15'],

    // Etapy standardu, które mają własny rysunek (reszta używa symbolu tematu)
    stagePreparation: ['M9 4h6v3H9z', 'M7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17', 'M8 12h8', 'M8 16h5'],
    stageSurvey: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z'],
    stageStudies: ['M9 3.5h6', 'M10 3.5v6.2L5.2 18a1.8 1.8 0 0 0 1.6 2.7h10.4a1.8 1.8 0 0 0 1.6-2.7L14 9.7V3.5', 'M7.8 15h8.4'],
    stageConcept: ['M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z', 'M10 19h4', 'M10.5 21.5h3'],
    stageLand: ['M4 6l5.5-2 5 2L20 4v14l-5.5 2-5-2L4 20V6Z', 'M9.5 4v14', 'M14.5 6v14'],
    stageTechnical: ['M4.5 4.5v15h15Z', 'M4.5 8.5h2.5', 'M4.5 12h2.5', 'M4.5 15.5h2.5'],
    stageEstimates: ['M6 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z', 'M8.5 7.5h7', 'M9 12h.01', 'M12 12h.01', 'M15 12h.01', 'M9 16h.01', 'M12 16h.01', 'M15 16h.01'],
    stageHandover: ['M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z', 'M3.5 8 12 12.5 20.5 8', 'M12 12.5v8'],

    // Nawigacja i obiekty
    folder: ['M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V7Z'],
    people: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5', 'M16 4.6a3.5 3.5 0 0 1 0 6.8', 'M17.5 14.9c2.4.6 4 2.4 4 5.1'],
    person: ['M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6'],
    layers: ['m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z', 'm3.5 12 8.5 4.5 8.5-4.5', 'm3.5 16 8.5 4.5 8.5-4.5'],
    checklist: ['M10 6.5h10', 'M10 12h10', 'M10 17.5h10', 'm3.5 6.5 1.5 1.5 2.5-3', 'm3.5 12 1.5 1.5 2.5-3', 'm3.5 17.5 1.5 1.5 2.5-3'],
    calendar: ['M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12Z', 'M4 9.5h16', 'M8.5 3v4', 'M15.5 3v4'],
    clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5V12l3 2'],
    hours: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5V12h4'],
    flag: ['M5 21V4', 'M5 4.5h11l-2 4 2 4H5'],
    database: ['M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3Z', 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],

    // Działania
    plus: ['M12 5v14', 'M5 12h14'],
    star: ['m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.8L12 3.6Z'],
    search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-4-4'],
    close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
    more: ['M5.5 12h.01', 'M12 12h.01', 'M18.5 12h.01'],
    edit: ['M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z', 'm13.5 6.5 4 4'],
    trash: ['M4.5 7h15', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19l1-12', 'M9 7V4.5h6V7'],
    download: ['M12 4v11', 'm7.5 10.5 4.5 4.5 4.5-4.5', 'M5 20h14'],
    upload: ['M12 15V4', 'm7.5 8.5 4.5-4.5 4.5 4.5', 'M5 20h14'],
    chart: ['M4 20V4', 'M4 20h16.5', 'm7.5 15 3.5-4.5 3 2.5 5-7'],
    sparkle: ['M12 3.5 13.8 9a1.5 1.5 0 0 0 1 1l5.7 2-5.7 2a1.5 1.5 0 0 0-1 1L12 20.5 10.2 15a1.5 1.5 0 0 0-1-1L3.5 12l5.7-2a1.5 1.5 0 0 0 1-1L12 3.5Z'],
    arrowUp: ['M12 19V5', 'm6 11 6-6 6 6'],
    arrowDown: ['M12 5v14', 'm6 13 6 6 6-6'],
    arrowLeft: ['M19 12H5', 'm11 6-6 6 6 6'],
    external: ['M14 4h6v6', 'M20 4 11 13', 'M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10'],
    power: ['M12 3v8', 'M7 6.3a7.5 7.5 0 1 0 10 0'],
    columns: ['M4 5h16v14H4z', 'M10 5v14', 'M15 5v14'],
    filter: ['M4 6h16', 'M7 12h10', 'M10 18h4'],
    sort: ['M7 4v16', 'm3.5 7.5 3.5-3.5 3.5 3.5', 'M17 20V4', 'm13.5 16.5 3.5 3.5 3.5-3.5'],
    settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
    menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
    pin: ['M9.5 4h5l-.8 5.2 3.3 3.3V14H7v-1.5l3.3-3.3L9.5 4Z', 'M12 14v6'],
    pinOff: ['M9.5 4h5l-.8 5.2 3.3 3.3V14H7v-1.5l3.3-3.3L9.5 4Z', 'M12 14v6', 'M4 4l16 16'],
    keyboard: ['M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-9Z', 'M7 10h.01', 'M10.5 10h.01', 'M14 10h.01', 'M17.5 10h.01', 'M8 14.5h8'],
    history: ['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4v4.5h4.5', 'M12 8v4l3 2'],
    arrowUpRight: ['M7 17 17 7', 'M8 7h9v9'],
    inspector: ['M4 5h16v14H4z', 'M14.5 5v14'],
    datum: ['M3.5 5h17L12 18.5Z', 'M7 21h10'],
    sidebar: ['M4 5h16v14H4z', 'M9.5 5v14'],

    // Kierunki
    chevronDown: ['m7 10 5 5 5-5'],
    chevronUp: ['m7 14 5-5 5 5'],
    chevronRight: ['m10 7 5 5-5 5'],
    chevronLeft: ['m14 7-5 5 5 5'],
    chevronsUpDown: ['m8 9 4-4 4 4', 'm8 15 4 4 4-4'],
    check: ['m5 12.5 4.5 4.5L19 7.5'],
    enter: ['M20 5v7a3 3 0 0 1-3 3H5', 'm9 11-4 4 4 4'],

    // Motyw i stany
    sun: ['M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.2 5.2l1.4 1.4', 'M17.4 17.4l1.4 1.4', 'M18.8 5.2l-1.4 1.4', 'M6.6 17.4l-1.4 1.4'],
    moon: ['M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z'],
    monitor: ['M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 14.5v-9Z', 'M9 20h6', 'M12 16v4'],
    grid: ['M4 4.5h7v7H4z', 'M13 4.5h7v7h-7z', 'M4 13.5h7v7H4z', 'M13 13.5h7v7h-7z'],
    list: ['M8.5 6h11.5', 'M8.5 12h11.5', 'M8.5 18h11.5', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
    alert: ['M12 3.8 2.6 20h18.8L12 3.8Z', 'M12 10v4.5', 'M12 17.3v.1'],
    alertCircle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5v5', 'M12 16.2v.1'],
    info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5.5', 'M12 7.8v.1'],
    checkCircle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm8 12.3 2.8 2.7 5.2-5.5'],
    cloudCheck: ['M7 18.5a4.5 4.5 0 1 1 1-8.9 6 6 0 0 1 11.5 2.4A3.5 3.5 0 0 1 18 18.5H7Z', 'm9.5 14 2 2 3.5-3.5'],
    cloudOff: ['M7 18.5a4.5 4.5 0 1 1 1-8.9 6 6 0 0 1 11.5 2.4A3.5 3.5 0 0 1 18 18.5H7Z', 'M4 4l16 16']
  };

  // Aliasy zachowują zgodność nazw używanych dawniej w kodzie.
  var ALIASES = { chevron: 'chevronDown', auto: 'monitor', cards: 'grid', rows: 'list', board: 'columns' };

  /**
   * @param {string} name klucz z PATHS
   * @param {number} [size] bok w pikselach (domyślnie 16)
   */
  function icon(name, size) {
    var side = size || 16;
    var key = ALIASES[name] || name;
    var paths = PATHS[key] || PATHS.folder;
    return D.svg('svg', {
      viewBox: '0 0 24 24',
      width: side,
      height: side,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.6',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false'
    }, paths.map(function (d) { return D.svg('path', { d: d }); }));
  }

  /**
   * Ikona etapu: rysunek etapu (albo symbol tematu) na kafelku. Etap
   * decyzyjny dostaje plakietkę ✓ w rogu — ten sam temat widać wtedy
   * od razu jako dokumentację albo postępowanie.
   * @param {{icon: string, decision: boolean, kindLabel: string}} info z Model.describeStage
   */
  function stageIcon(info, size) {
    var side = size || 15;
    return D.el('span', { class: 'stageicon' + (info.decision ? ' stageicon--decision' : '') }, [
      icon(info.icon, side),
      info.decision ? D.el('span', { class: 'stageicon__badge' }, [D.svg('svg', {
        viewBox: '0 0 24 24', width: 8, height: 8, fill: 'none', stroke: 'currentColor',
        'stroke-width': '3.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false'
      }, [D.svg('path', { d: 'm5 12.5 4.5 4.5L19 7.5' })])]) : null
    ]);
  }

  root.ETROM.Icons = {
    icon: icon,
    stageIcon: stageIcon,
    has: function (name) { return !!PATHS[ALIASES[name] || name]; },
    names: function () { return Object.keys(PATHS); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
