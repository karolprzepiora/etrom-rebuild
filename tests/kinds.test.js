'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Kinds = require('../src/core/kinds.js');

test('rozpoznaje obiekt z nazw folderów biura (zakres, np. OST, nie jest obiektem)', () => {
  const cases = {
    '1901 - Remont Zapór - Żywiec': 'dam',
    '1903 - Pompownia Styków': 'pump',
    '2005 - Pompownie Wilczkowice': 'pump',
    '2006 - OST ZW Skrzyszów': 'other',
    '2107 - ZW Bernatka': 'other',
    '2109 - Jazy ZZ Zamość': 'weir',
    '2210 - OST Jaz rz. Uherka': 'weir',
    '2208 - Wały Nowy Breń - NI': 'levee',
    '2212 - Staw Chuchółka': 'pond',
    '2508 - Staw Kielce': 'pond',
    '2409 - Zalew Kamienna Góra': 'reservoir',
    'Regulacja rzeki Białka — odcinek III': 'river',
    'Przebudowa przepustu w Lipnicy': 'culvert',
    'Odmulenie zbiornika Wąwolnica': 'reservoir',
    'Zbiornik retencyjny Dąbrowa': 'reservoir',
    '2301 - Mała retencja leśna': 'retention',
    '2407 - Mała elektrownia wodna Rudnik': 'hydro',
    '2404 - OST MEW Bronocice': 'hydro'
  };
  Object.keys(cases).forEach((name) => assert.equal(Kinds.detect(name), cases[name], name));
});

test('lista rodzajów ma jedenaście obiektów plus „inny”, bez ekspertyzy (to zakres)', () => {
  assert.equal(Kinds.KINDS.length, 12);
  assert.ok(!Kinds.isKey('survey'));
  assert.equal(Kinds.label('retention'), 'Mała retencja leśna');
});

test('ręcznie wybrany rodzaj wygrywa z rozpoznanym; zły klucz jest ignorowany', () => {
  assert.equal(Kinds.of({ name: 'Staw Kielce', kind: 'weir' }), 'weir');
  assert.equal(Kinds.of({ name: 'Staw Kielce', kind: 'xyz' }), 'pond');
  assert.equal(Kinds.of({ name: '' }), 'other');
});
