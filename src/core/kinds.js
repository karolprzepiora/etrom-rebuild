/* ETROM — rodzaj projektu (jaz, zbiornik, pompownia…).
   Rodzaj jest wpisany ręcznie albo rozpoznany z nazwy projektu po słowach kluczowych.
   Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  /* Rodzaj = OBIEKT, który projektujemy. To, co klient zamawia (pełny projekt, ekspertyza, koncepcja…),
     opisuje osobno „zakres opracowania”. Kolejność ma znaczenie: pierwsze trafienie słowa wygrywa,
     więc „Zbiornik retencyjny” to zbiornik, a „Mała retencja leśna” to retencja. */
  var KINDS = [
    { key: 'pump', label: 'Pompownia', words: ['pompown', 'przepompown', 'pompy', 'pomp '] },
    { key: 'hydro', label: 'Mała elektrownia wodna', words: ['elektrown', 'mew', 'turbin', 'hydroelektr'] },
    { key: 'dam', label: 'Zapora', words: ['zapor'] },
    { key: 'weir', label: 'Jaz', words: ['jaz', 'jazy', 'jazu', 'stopien wodny', 'stopnia wodnego', 'zastawk', 'budowl piet', 'budowla piet'] },
    { key: 'levee', label: 'Wały przeciwpowodziowe', words: ['waly', 'wal ', 'walow', 'obwalowan', 'przeciwpowodz'] },
    { key: 'retention', label: 'Mała retencja leśna', words: ['mala retencj', 'retencja lesna', 'lesna', 'lesnej'] },
    { key: 'pond', label: 'Staw', words: ['staw', 'stawy', 'stawu', 'stawow'] },
    { key: 'reservoir', label: 'Zbiornik wodny', words: ['zbiornik', 'zalew', 'jezior'] },
    { key: 'culvert', label: 'Przepust / most', words: ['przepust', 'most', 'kladk', 'przejscie'] },
    { key: 'river', label: 'Rzeka / ciek / kanał', words: ['rzeki', 'rzeka', 'rz.', 'regulacj', 'potok', 'koryt', 'odmulen', 'kanal', 'rowu', 'rowy'] },
    { key: 'multi', label: 'Kilka obiektów', words: ['kompleks', 'zespol obiektow'] },
    { key: 'other', label: 'Inny', words: [] }
  ];

  function fold(text) {
    return String(text == null ? '' : text).toLowerCase()
      .replace(/ł/g, 'l').replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ń/g, 'n')
      .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
  }

  /** Rozpoznaje rodzaj z nazwy; słowa krótkie (ost, mew, jaz) tylko jako całe słowa. */
  function detect(name) {
    var text = ' ' + fold(name).replace(/[^a-z0-9. ]+/g, ' ') + ' ';
    for (var i = 0; i < KINDS.length; i += 1) {
      var words = KINDS[i].words;
      for (var j = 0; j < words.length; j += 1) {
        var w = words[j];
        var whole = w.length <= 4 && !/[ .]$/.test(w);
        if (whole ? text.indexOf(' ' + w + ' ') >= 0 || text.indexOf(' ' + w + '.') >= 0 : text.indexOf(w.slice(-1) === ' ' ? ' ' + w : w) >= 0) return KINDS[i].key;
      }
    }
    return 'other';
  }

  function isKey(value) {
    return KINDS.some(function (k) { return k.key === value; });
  }

  /** Rodzaj projektu: wybrany ręcznie albo rozpoznany z nazwy. */
  function of(project) {
    if (project && isKey(project.kind)) return project.kind;
    return detect(project && project.name);
  }

  function label(key) {
    var hit = KINDS.filter(function (k) { return k.key === key; })[0];
    return hit ? hit.label : 'Inny';
  }

  var api = { KINDS: KINDS, detect: detect, of: of, label: label, isKey: isKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Kinds = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
