/* ETROM — biblioteka typowych zadań wg etapów. Zadania są duże (kilka na etap), bez godzin i wag:
   godziny wynikają z puli etapu, wagi ustawi się później. Wpisy z `reserve` to zadania z rezerwy
   postępowania („Uzupełnienia na wezwanie”). Źródło: raporty czasu biura (docs/BIBLIOTEKA_ZADAN_PROPOZYCJA.md). */
(function (root) {
  'use strict';

  var UPD = { name: 'Uzupełnienia na wezwanie', reserve: true };

  var TASKS = {
    preparation: [{ name: 'Dane wyjściowe i warunki techniczne' }],
    survey: [{ name: 'MDCP' }, { name: 'Prawa do gruntów i zgody' }, { name: 'Pomiary specjalne (np. batymetria)' }],
    studies: [{ name: 'Opinia geotechniczna' }, { name: 'Analiza hydrologiczno-hydrauliczna' }, { name: 'Inwentaryzacja stanu istniejącego' }],
    assessment: [{ name: 'Inwentaryzacja i ocena stanu' }, { name: 'Ekspertyza techniczna' }],
    concept: [{ name: 'Koncepcja techniczna' }, { name: 'Aktualizacja koncepcji' }],
    'environment-docs': [{ name: 'Karta Informacyjna Przedsięwzięcia' }, { name: 'Wniosek o decyzję środowiskową' }, { name: 'Zgłoszenie art. 118' }, { name: 'Wycinka drzew i nasadzenia' }],
    'environment-process': [UPD],
    'location-docs': [{ name: 'Wniosek o decyzję lokalizacyjną' }],
    'location-process': [UPD],
    'water-docs': [{ name: 'Operat wodnoprawny' }, { name: 'Wniosek o pozwolenie wodnoprawne' }, { name: 'Zwolnienie z zakazu (art. 176)' }],
    'water-process': [UPD],
    land: [{ name: 'Uzgodnienia i zgody terenowe' }],
    'building-docs': [{ name: 'Projekt zagospodarowania terenu' }, { name: 'Projekt architektoniczno-budowlany' }, { name: 'Wniosek o pozwolenie na budowę' }],
    'building-process': [UPD],
    technical: [{ name: 'Projekt techniczny i wykonawczy' }, { name: 'Uzgodnienia branżowe' }],
    estimates: [{ name: 'Przedmiar i kosztorys' }, { name: 'STWiORB' }],
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
