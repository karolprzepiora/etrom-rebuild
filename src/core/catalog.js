/* ETROM — katalog standardowych etapów i dziedzin.
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

  /* Rodzaj pracy: czym etap jest dla biura. Niezależny od tematu (dziedziny)
     i od kolejności — etapy idą chronologicznie, rodzaj to znacznik.
     Rodzaj „decision” to etap, w którym czekamy na urząd i prowadzimy
     postępowanie; pokazuje go plakietka na ikonie etapu. */
  var KINDS = {
    materials: { id: 'materials', label: 'Materiały', hint: 'dane wyjściowe, pomiary, badania', icon: 'kindMaterials' },
    docs: { id: 'docs', label: 'Dokumentacja', hint: 'opracowania projektowe', icon: 'kindDocs' },
    decision: { id: 'decision', label: 'Decyzje', hint: 'postępowania i uzgodnienia', icon: 'kindDecision' }
  };
  var KIND_ORDER = ['materials', 'docs', 'decision'];

  // [id, nazwa, dziedzina (temat), godziny, rodzaj pracy, ikona]
  var RAW = [
    ['preparation', 'Przygotowanie projektu i materiały wyjściowe', 'general', 40, 'materials', 'stagePreparation'],
    ['survey', 'Inwentaryzacja i pomiary (geodezja)', 'location', 40, 'materials', 'stageSurvey'],
    ['studies', 'Badania i opinie (hydrologia, geotechnika)', 'water', 48, 'materials', 'stageStudies'],
    ['concept', 'Koncepcja i analizy projektowe', 'design', 80, 'docs', 'stageConcept'],
    ['environment-docs', 'Dokumentacja środowiskowa', 'environment', 60, 'docs', 'environment'],
    ['environment-process', 'Postępowanie środowiskowe', 'environment', 30, 'decision', 'environment'],
    ['location-docs', 'Dokumentacja lokalizacyjna', 'location', 40, 'docs', 'location'],
    ['location-process', 'Postępowanie lokalizacyjne', 'location', 24, 'decision', 'location'],
    ['water-docs', 'Dokumentacja wodnoprawna', 'water', 70, 'docs', 'water'],
    ['water-process', 'Postępowanie wodnoprawne', 'water', 32, 'decision', 'water'],
    ['land', 'Sprawy terenowe i pozostałe uzgodnienia', 'location', 48, 'decision', 'stageLand'],
    ['building-docs', 'Dokumentacja do pozwolenia na budowę', 'building', 90, 'docs', 'building'],
    ['building-process', 'Postępowanie o pozwolenie na budowę', 'building', 32, 'decision', 'building'],
    ['technical', 'Projekt techniczny i dokumentacja wykonawcza', 'design', 120, 'docs', 'stageTechnical'],
    ['estimates', 'Przedmiary, kosztorysy i specyfikacje', 'general', 56, 'docs', 'stageEstimates'],
    ['handover', 'Przekazanie i odbiór dokumentacji', 'general', 24, 'docs', 'stageHandover']
  ];

  var CATALOG = RAW.map(function (row, index) {
    return {
      id: row[0],
      name: row[1],
      domain: row[2],
      defaultHours: row[3],
      kind: row[4],
      icon: row[5],
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

  /** Opis rodzaju pracy; nieznany wraca jako „docs”. */
  function kind(id) {
    return Object.prototype.hasOwnProperty.call(KINDS, id) ? KINDS[id] : KINDS.docs;
  }

  var api = {
    DOMAINS: DOMAINS,
    KINDS: KINDS,
    KIND_ORDER: KIND_ORDER,
    kind: kind,
    all: CATALOG,
    find: find,
    domain: domain
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Catalog = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
