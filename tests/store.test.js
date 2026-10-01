'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../src/core/store.js');

test('getState zwraca stan początkowy', () => {
  const store = Store.createStore({ count: 1 });
  assert.deepEqual(store.getState(), { count: 1 });
});

test('update podmienia stan i powiadamia subskrybentów', () => {
  const store = Store.createStore({ count: 1 });
  const seen = [];
  store.subscribe((state) => seen.push(state.count));
  store.update((state) => ({ count: state.count + 1 }));
  assert.equal(store.getState().count, 2);
  assert.deepEqual(seen, [2]);
});

test('update zwracające ten sam stan nie powiadamia', () => {
  const store = Store.createStore({ count: 1 });
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.update((state) => state);
  assert.equal(calls, 0);
});

test('update wymaga zwrócenia stanu', () => {
  const store = Store.createStore({});
  assert.throws(() => store.update(() => undefined), /musi zwrócić/);
});

test('set scala pola bez gubienia pozostałych', () => {
  const store = Store.createStore({ a: 1, b: 2 });
  store.set({ b: 3 });
  assert.deepEqual(store.getState(), { a: 1, b: 3 });
});

test('subscribe zwraca funkcję odsubskrybowania', () => {
  const store = Store.createStore({ count: 0 });
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  store.set({ count: 1 });
  off();
  store.set({ count: 2 });
  assert.equal(calls, 1);
});

test('subscribe odrzuca wartości, które nie są funkcją', () => {
  const store = Store.createStore({});
  assert.throws(() => store.subscribe('nie funkcja'), /wymaga funkcji/);
});

test('wielu subskrybentów dostaje ten sam stan', () => {
  const store = Store.createStore({ count: 0 });
  const seen = [];
  store.subscribe((s) => seen.push('a' + s.count));
  store.subscribe((s) => seen.push('b' + s.count));
  store.set({ count: 5 });
  assert.deepEqual(seen, ['a5', 'b5']);
});

test('odsubskrybowanie w trakcie powiadamiania nie gubi pozostałych', () => {
  const store = Store.createStore({ count: 0 });
  const seen = [];
  const off = store.subscribe(() => { off(); seen.push('pierwszy'); });
  store.subscribe(() => seen.push('drugi'));
  store.set({ count: 1 });
  assert.deepEqual(seen, ['pierwszy', 'drugi']);
});

test('update z subskrybenta powtarza przebieg, aż stan się uspokoi', () => {
  const store = Store.createStore({ count: 0 });
  const seen = [];
  store.subscribe((state) => {
    seen.push(state.count);
    if (state.count < 3) store.set({ count: state.count + 1 });
  });
  store.set({ count: 1 });
  assert.deepEqual(seen, [1, 2, 3], 'każdy kolejny stan dociera do widoku');
  assert.equal(store.getState().count, 3);
});

test('subskrybent zmieniający stan bez końca nie zawiesza aplikacji', () => {
  const store = Store.createStore({ count: 0 });
  let calls = 0;
  store.subscribe((state) => {
    calls += 1;
    store.set({ count: state.count + 1 });
  });
  store.set({ count: 1 });
  assert.ok(calls <= 10, 'liczba przebiegów jest ograniczona, dostaliśmy ' + calls);
  assert.ok(calls > 1);
});
