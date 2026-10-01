/* ETROM — katalog 14 standardowych etapów i dziedzin.
   Czyste dane. Bez DOM, bez localStorage. */
(function (root) {
  'use strict';

  var DOMAINS = {
    general: { id: 'general', label: 'Ogólne', color: 'var(--domain-general)' },
    design: { id: 'design', label: 'Projektowanie', color: 'var(--domain-design)' },
    environment: { id: 'environment', label: 'Środowisko', color: 'var(--domain-environment)' },
    water: { id: 'water', label: 'Wodnoprawne', color: 'var(--domain-water)' },
    location: { id: 'location', label: 'Teren i lokalizacja', color: 'var(--domain-location)' },
    building: { id: 'building', label: 'Budowlane', color: 'var(--domain-building)' }
  };

  var RAW = [
    ['preparation', 'Przygotowanie projektu i materiały wyjściowe', 'general', 40],
    ['concept', 'Koncepcja i analizy projektowe', 'design', 80],
    ['environment-docs', 'Dokumentacja środowiskowa', 'environment', 60],
    ['environment-process', 'Postępowanie środowiskowe', 'environment', 30],
    ['location-docs', 'Dokumentacja lokalizacyjna', 'location', 40],
    ['location-process', 'Postępowanie lokalizacyjne', 'location', 24],
    ['water-docs', 'Dokumentacja wodnoprawna', 'water', 70],
    ['water-process', 'Postępowanie wodnoprawne', 'water', 32],
    ['land', 'Sprawy terenowe i pozostałe uzgodnienia', 'location', 48],
    ['building-docs', 'Dokumentacja do pozwolenia na budowę', 'building', 90],
    ['building-process', 'Postępowanie o pozwolenie na budowę', 'building', 32],
    ['technical', 'Projekt techniczny i dokumentacja wykonawcza', 'design', 120],
    ['estimates', 'Przedmiary, kosztorysy i specyfikacje', 'general', 56],
    ['handover', 'Przekazanie i odbiór dokumentacji', 'general', 24]
  ];

  var CATALOG = RAW.map(function (row, index) {
    return {
      id: row[0],
      name: row[1],
      domain: row[2],
      defaultHours: row[3],
      number: String(index + 1).padStart(2, '0')
    };
  });

  var BY_ID = {};
  CATALOG.forEach(function (entry) { BY_ID[entry.id] = entry; });

  /** Wpis katalogu albo null. */
  function find(id) {
    return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : null;
  }

  /** Opis dziedziny albo dziedzina "general" jako bezpieczny domyślny. */
  function domain(id) {
    return Object.prototype.hasOwnProperty.call(DOMAINS, id) ? DOMAINS[id] : DOMAINS.general;
  }

  var api = {
    DOMAINS: DOMAINS,
    all: CATALOG,
    find: find,
    domain: domain
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Catalog = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
