/* ETROM — biblioteka typowych zadań wg etapów. Zadania są duże (kilka na etap), bez godzin i wag:
   godziny wynikają z puli etapu, wagi ustawi się później. Źródło: raporty czasu biura (docs/BIBLIOTEKA_ZADAN_PROPOZYCJA.md). */
(function (root) {
  'use strict';

  // Dokumentacja i postępowanie to osobne etapy: wnioski należą do etapów-postępowań; uzupełnienia na wezwanie powstają z pism, gdy się pojawią.
  var TASKS = {
    preparation: [{ name: 'Dane wyjściowe i warunki techniczne' }],
    survey: [{ name: 'Mapa do celów projektowych (MDCP)' }, { name: 'Prawa do gruntów i zgody' }],
    studies: [{ name: 'Opinia geotechniczna' }, { name: 'Analiza hydrologiczno-hydrauliczna' }],
    assessment: [{ name: 'Ekspertyza techniczna' }],
    concept: [{ name: 'Koncepcja techniczna' }],
    'environment-docs': [{ name: 'Karta Informacyjna Przedsięwzięcia' }],
    'environment-process': [{ name: 'Wniosek o decyzję środowiskową' }],
    'location-docs': [{ name: 'Opracowanie do wniosku lokalizacyjnego' }],
    'location-process': [{ name: 'Wniosek o decyzję lokalizacyjną' }],
    'water-docs': [{ name: 'Operat wodnoprawny' }],
    'water-process': [{ name: 'Wniosek o pozwolenie wodnoprawne' }],
    land: [{ name: 'Uzgodnienia i zgody terenowe' }],
    'building-docs': [{ name: 'Projekt zagospodarowania terenu' }, { name: 'Projekt architektoniczno-budowlany' }],
    'building-process': [{ name: 'Wniosek o pozwolenie na budowę' }],
    technical: [{ name: 'Projekt techniczny i wykonawczy' }],
    estimates: [{ name: 'Przedmiary, kosztorysy i STWiORB' }],
    handover: [{ name: 'Przekazanie i odbiór dokumentacji' }]
  };

  /** Typowe zadania etapu (kopie, żeby nikt nie zmienił biblioteki przez przypadek). */
  function forStage(stageId) {
    return (Object.prototype.hasOwnProperty.call(TASKS, stageId) ? TASKS[stageId] : []).map(function (t) {
      return { name: t.name, reserve: t.reserve === true };
    });
  }

  /** Pozycje biblioteki, których etap jeszcze nie ma (po nazwie, bez względu na wielkość liter). */
  function missing(stage) {
    var have = {};
    (stage.tasks || []).forEach(function (t) { have[String(t.name).trim().toLowerCase()] = true; });
    return forStage(stage.id).filter(function (t) { return !have[t.name.toLowerCase()]; });
  }

  var api = { TASKS: TASKS, forStage: forStage, missing: missing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Library = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
