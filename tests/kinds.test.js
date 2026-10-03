'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Kinds = require('../src/core/kinds.js');

test('rozpoznaje rodzaj z nazw folderów biura', () => {
  const cases = {
    '1901 - Remont Zapór - Żywiec': 'dam',
    '1903 - Pompownia Styków': 'pump',
    '2005 - Pompownie Wilczkowice': 'pump',
    '2006 - OST ZW Skrzyszów': 'survey',
    '2107 - ZW Bernatka': 'other',
    '2109 - Jazy ZZ Zamość': 'weir',
    '2210 - OST Jaz rz. Uherka': 'survey',
    '2208 - Wały Nowy Breń - NI': 'levee',
    '2212 - Staw Chuchółka': 'reservoir',
    '2508 - Staw Kielce': 'reservoir',
    'Regulacja rzeki Białka — odcinek III': 'river',
    'Przebudowa przepustu w Lipnicy': 'river',
    'Zbiornik retencyjny Dąbrowa': 'reservoir',
    '2301 - Mała retencja leśna': 'retention',
    '2407 - Mała elektrownia wodna Rudnik': 'hydro',
    '2404 - OST MEW Bronocice': 'survey'
  };
  Object.keys(cases).forEach((name) => assert.equal(Kinds.detect(name), cases[name], name));
});

test('ręcznie wybrany rodzaj wygrywa z rozpoznanym; zły klucz jest ignorowany', () => {
  assert.equal(Kinds.of({ name: 'Staw Kielce', kind: 'weir' }), 'weir');
  assert.equal(Kinds.of({ name: 'Staw Kielce', kind: 'xyz' }), 'reservoir');
  assert.equal(Kinds.of({ name: '' }), 'other');
});
