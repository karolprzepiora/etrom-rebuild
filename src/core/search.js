/* ETROM — dopasowywanie tekstu dla palety poleceń.
   Czyste funkcje: wynik 0 znaczy „nie pasuje”, wyższy znaczy „lepiej pasuje”. */
(function (root) {
  'use strict';

  function normalize(value) {
    return String(value == null ? '' : value).toLocaleLowerCase('pl');
  }

  /**
   * Punktacja dopasowania zapytania do tekstu.
   * Pełny fragment liczy się wyżej niż litery rozsiane po wyrazie,
   * a trafienie na początku słowa wyżej niż w jego środku.
   * @returns {number} 0 gdy brak dopasowania
   */
  function score(text, query) {
    var haystack = normalize(text);
    var needle = normalize(query).trim();
    if (!needle) return 1;
    if (!haystack) return 0;

    var at = haystack.indexOf(needle);
    if (at === 0) return 1000 - haystack.length;
    if (at > 0) {
      var startsWord = haystack[at - 1] === ' ' || haystack[at - 1] === '-' || haystack[at - 1] === '/';
      return (startsWord ? 700 : 500) - at - haystack.length / 10;
    }

    // Litery po kolei, ale nie obok siebie — np. „rrb” trafia w „Regulacja Rzeki Białka”.
    var index = 0;
    var hits = 0;
    var wordStarts = 0;
    for (var i = 0; i < haystack.length && index < needle.length; i += 1) {
      if (haystack[i] !== needle[index]) continue;
      if (i === 0 || haystack[i - 1] === ' ' || haystack[i - 1] === '-') wordStarts += 1;
      hits += 1;
      index += 1;
    }
    if (index < needle.length) return 0;
    return 100 + wordStarts * 20 + hits - haystack.length / 20;
  }

  /** Najwyższy wynik spośród kilku pól (kod, nazwa, zamawiający). */
  function scoreFields(fields, query) {
    var best = 0;
    (fields || []).forEach(function (field) {
      var value = score(field, query);
      if (value > best) best = value;
    });
    return best;
  }

  /**
   * Filtruje i porządkuje pozycje według dopasowania.
   * @param {Array} items
   * @param {string} query
   * @param {Function} fieldsOf zwraca tablicę tekstów dla pozycji
   * @param {number} [limit]
   */
  function rank(items, query, fieldsOf, limit) {
    var scored = (items || []).map(function (item) {
      return { item: item, value: scoreFields(fieldsOf(item), query) };
    }).filter(function (entry) {
      return entry.value > 0;
    });

    scored.sort(function (a, b) { return b.value - a.value; });
    var result = scored.map(function (entry) { return entry.item; });
    return typeof limit === 'number' ? result.slice(0, limit) : result;
  }

  var api = { score: score, scoreFields: scoreFields, rank: rank };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Search = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
