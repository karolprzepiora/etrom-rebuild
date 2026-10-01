'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Search = require('../src/core/search.js');

test('puste zapytanie pasuje do wszystkiego', () => {
  assert.ok(Search.score('cokolwiek', '') > 0);
  assert.ok(Search.score('cokolwiek', '   ') > 0);
});

test('brak dopasowania daje zero', () => {
  assert.equal(Search.score('Regulacja rzeki', 'xyz'), 0);
  assert.equal(Search.score('', 'cokolwiek'), 0);
});

test('wielkość liter i polskie znaki nie przeszkadzają', () => {
  assert.ok(Search.score('Łąki Zarzecze', 'ŁĄKI') > 0);
  assert.ok(Search.score('Dokumentacja wodnoprawna', 'WODNO') > 0);
});

test('dopasowanie od początku wyprzedza dopasowanie w środku', () => {
  const fromStart = Search.score('Lipnica Mała', 'lip');
  const inMiddle = Search.score('Przebudowa w Lipnicy', 'lip');
  assert.ok(fromStart > inMiddle, fromStart + ' powinno być większe niż ' + inMiddle);
});

test('początek wyrazu wyprzedza środek wyrazu', () => {
  const wordStart = Search.score('Przebudowa przepustu', 'prze');
  const inside = Search.score('Oczyszczalnia przelew', 'rzel');
  assert.ok(wordStart > inside);
});

test('litery rozsiane po nazwie też trafiają, ale słabiej', () => {
  const scattered = Search.score('Regulacja rzeki Białka', 'rrb');
  const exact = Search.score('Regulacja rzeki Białka', 'regulacja');
  assert.ok(scattered > 0, 'skrót powinien trafiać');
  assert.ok(exact > scattered, 'pełny fragment wygrywa ze skrótem');
});

test('kolejność liter ma znaczenie', () => {
  assert.ok(Search.score('Regulacja rzeki', 'reg') > 0);
  assert.equal(Search.score('abc', 'cba'), 0);
});

test('scoreFields bierze najlepsze z pól', () => {
  const fields = ['DEMO-002', 'Regulacja rzeki Białka', 'Wody Polskie'];
  assert.ok(Search.scoreFields(fields, 'demo') > 0);
  assert.ok(Search.scoreFields(fields, 'wody') > 0);
  assert.equal(Search.scoreFields(fields, 'zzz'), 0);
  assert.equal(Search.scoreFields([], 'cokolwiek'), 0);
});

test('rank zwraca tylko pasujące, od najlepszego', () => {
  const items = [
    { code: 'DEMO-001', name: 'Przebudowa przepustu w Lipnicy' },
    { code: 'DEMO-002', name: 'Regulacja rzeki Białka' },
    { code: 'LIP-9', name: 'Zbiornik Dąbrowa' }
  ];
  const fieldsOf = (p) => [p.code, p.name];
  const found = Search.rank(items, 'lip', fieldsOf);
  assert.equal(found.length, 2);
  assert.equal(found[0].code, 'LIP-9', 'trafienie od początku kodu jest pierwsze');
});

test('rank przycina listę do podanej długości', () => {
  const items = [{ n: 'aa' }, { n: 'ab' }, { n: 'ac' }];
  assert.equal(Search.rank(items, 'a', (i) => [i.n], 2).length, 2);
});

test('rank znosi brak pozycji', () => {
  assert.deepEqual(Search.rank(null, 'a', (i) => [i]), []);
  assert.deepEqual(Search.rank([], 'a', (i) => [i]), []);
});
