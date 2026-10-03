/* ETROM — rodzaj projektu (jaz, zbiornik, pompownia…).
   Rodzaj jest wpisany ręcznie albo rozpoznany z nazwy projektu po słowach kluczowych.
   Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  var KINDS = [
    { key: 'survey', label: 'Ekspertyza / OST', words: ['ekspertyz', 'ost', 'okst', 'ocena stanu', 'przeglad', 'inwentaryzac'] },
    { key: 'pump', label: 'Pompownia', words: ['pompown', 'pompy', 'pomp '] },
    { key: 'hydro', label: 'Elektrownia wodna', words: ['elektrown', 'mew', 'turbin', 'hydroelektr'] },
    { key: 'dam', label: 'Zapora', words: ['zapor'] },
    { key: 'weir', label: 'Jaz', words: ['jaz', 'jazy', 'jazu', 'stopien wodny', 'stopnia wodnego'] },
    { key: 'levee', label: 'Wały przeciwpowodziowe', words: ['waly', 'wal ', 'walow', 'obwalowan', 'przeciwpowodz'] },
    { key: 'retention', label: 'Mała retencja', words: ['retencj', 'lesna', 'lesnej'] },
    { key: 'reservoir', label: 'Zbiornik / staw', words: ['zbiornik', 'staw', 'zalew', 'jezior', 'stawy'] },
    { key: 'river', label: 'Rzeka / przepust', words: ['rzeki', 'rzeka', 'rz.', 'regulacj', 'potok', 'koryt', 'przepust', 'odmulen', 'kanal', 'most'] },
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
