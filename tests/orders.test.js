'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../src/core/orders.js');

const people = [{ id: 'p-1', orgRole: 'managing' }, { id: 'p-2', orgRole: 'member' }, { id: 'p-3', orgRole: 'member' }];
const t0 = new Date('2026-10-06T12:20:00Z');
const at = (h) => new Date(t0.getTime() + h * 3600000);

function chain() {
  return O.create([], {
    createdBy: 'p-3', projectId: 1,
    steps: [
      { kind: 'sign', text: 'Podpisać pełnomocnictwo', assigneeId: 'p-1', doc: { type: 'file', name: 'Pelnomocnictwo.pdf', size: 1200 } },
      { kind: 'send', text: 'Wysłać e-Doręczeniem', assigneeId: 'p-2', dest: 'e-Doręczenia · RZGW' }
    ]
  }, people, t0);
}

test('walidacja: rodzaj, opis i osoba są obowiązkowe', () => {
  const r = O.create([], { createdBy: 'p-3', steps: [{ kind: 'x', text: ' ', assigneeId: 'p-9' }] }, people, t0);
  assert.equal(r.valid, false);
  assert.ok(r.errors.kind && r.errors.text && r.errors.assigneeId);
  assert.equal(O.create([], { createdBy: 'p-3', steps: [] }, people, t0).valid, false);
});

test('łańcuch: pierwszy krok otwarty, kolejny czeka i rusza po zamknięciu poprzedniego', () => {
  const r = chain();
  assert.equal(r.valid, true);
  assert.deepEqual(r.list.map(o => [o.id, o.step, o.status]), [['z-1', 1, 'open'], ['z-2', 2, 'waiting']]);
  assert.equal(r.list[0].chainId, r.list[1].chainId);
  assert.equal(O.forAssignee(r.list, 'p-2').length, 0);
  const d = O.complete(r.list, 'z-1', 'p-1', { type: 'file', name: 'Podpisane.pdf', size: 900 }, '', people, at(3));
  assert.equal(d.ok, true);
  assert.equal(d.nextId, 'z-2');
  const second = O.byId(d.list, 'z-2');
  assert.equal(second.status, 'open');
  assert.equal(second.startedAt, at(3).toISOString());
  assert.equal(second.doc.name, 'Podpisane.pdf');
  assert.equal(O.forAssignee(d.list, 'p-2').length, 1);
});

test('zamknąć może wykonawca albo Dyrekcja, nikt inny', () => {
  const r = chain();
  assert.equal(O.complete(r.list, 'z-1', 'p-2', null, '', people, at(1)).ok, false);
  assert.equal(O.complete(r.list, 'z-1', 'p-3', null, '', people, at(1)).ok, false);
  assert.equal(O.complete(r.list, 'z-1', 'p-1', null, '', people, at(1)).ok, true);
  const waiting = O.complete(r.list, 'z-2', 'p-2', null, '', people, at(1));
  assert.equal(waiting.ok, false);
});

test('licznik: czas od startu, progi doby i trzech dni, po zamknięciu czas trwania', () => {
  const r = chain();
  const o = r.list[0];
  assert.equal(O.ageText(O.elapsedMs(o, at(0.1))), '6 min');
  assert.equal(O.ageText(O.elapsedMs(o, at(3))), '3 h');
  assert.equal(O.ageText(O.elapsedMs(o, at(52))), '2 d 4 h');
  assert.equal(O.ageText(O.elapsedMs(o, at(144))), '6 d');
  assert.equal(O.tone(o, at(5)), 'n');
  assert.equal(O.tone(o, at(25)), 'warn');
  assert.equal(O.tone(o, at(73)), 'late');
  const d = O.complete(r.list, 'z-1', 'p-1', null, '', people, at(5)).list[0];
  assert.equal(O.tone(d, at(500)), 'ok');
  assert.equal(O.ageText(O.elapsedMs(d, at(500))), '5 h');
});

test('przypomnienie i anulowanie: tylko zgłaszający lub Dyrekcja; anulowanie zatrzymuje dalsze kroki', () => {
  const r = chain();
  assert.equal(O.nudge(r.list, 'z-1', 'p-2', people, at(1)).ok, false);
  const n = O.nudge(r.list, 'z-1', 'p-3', people, at(1));
  assert.equal(n.ok, true);
  assert.equal(O.byId(n.list, 'z-1').nudgedAt, at(1).toISOString());
  assert.equal(O.cancel(r.list, 'z-1', 'p-2', people, at(2)).ok, false);
  const c = O.cancel(r.list, 'z-1', 'p-3', people, at(2));
  assert.deepEqual(c.list.map(o => o.status), ['cancelled', 'cancelled']);
});

test('przekazanie dalej zmienia wykonawcę, ale tylko otwartemu zleceniu', () => {
  const r = chain();
  assert.equal(O.reassign(r.list, 'z-1', 'p-1', 'p-2', people).ok, true);
  assert.equal(O.byId(O.reassign(r.list, 'z-1', 'p-1', 'p-2', people).list, 'z-1').assigneeId, 'p-2');
  assert.equal(O.reassign(r.list, 'z-1', 'p-1', 'p-9', people).ok, false);
  assert.equal(O.reassign(r.list, 'z-2', 'p-1', 'p-3', people).ok, false);
});

test('normalizacja czyści pliki i linki; duże pliki zostają bez treści', () => {
  const big = 'data:application/pdf;base64,' + 'A'.repeat(260000);
  const ok = 'data:application/pdf;base64,QUJD';
  const [o] = O.normalize([{ kind: 'pay', text: 'Opłata', assigneeId: 'p-2', createdBy: 'p-3', pay: { payee: ' Urząd ', account: '12 3456', title: 'T', amount: '17,00 zł' },
    doc: { type: 'file', name: 'a.pdf', size: 5, data: big }, result: { type: 'file', name: 'b.pdf', data: ok }, status: 'weird' }]);
  assert.equal(o.status, 'open');
  assert.equal(o.pay.payee, 'Urząd');
  assert.equal(o.doc.data, undefined);
  assert.equal(o.result.data, ok);
  assert.equal(O.cleanRef({ type: 'link', url: 'https://serwer/a.pdf' }).name, 'serwer/a.pdf');
  assert.equal(O.cleanRef({ type: 'link', url: ' ' }), null);
  assert.equal(O.normalize([{ kind: 'sign', text: 'x', assigneeId: 'p-2', createdBy: 'p-3', pay: { payee: 'x' } }])[0].pay, null);
});

test('podpowiedzi: wykonawca z historii zgłaszającego i ostatnie adresy', () => {
  let list = [];
  for (let i = 0; i < 3; i += 1) list = O.create(list, { createdBy: 'p-3', steps: [{ kind: 'sign', text: 'x', assigneeId: 'p-1' }] }, people, t0).list;
  list = O.create(list, { createdBy: 'p-2', steps: [{ kind: 'sign', text: 'x', assigneeId: 'p-2' }] }, people, t0).list;
  assert.equal(O.suggestAssignee(list, 'sign', 'p-3').personId, 'p-1');
  assert.equal(O.suggestAssignee(list, 'pay', 'p-3'), null);
  list = O.create(list, { createdBy: 'p-3', steps: [{ kind: 'send', text: 'w', assigneeId: 'p-2', dest: 'RZGW' }] }, people, t0).list;
  list = O.create(list, { createdBy: 'p-3', steps: [{ kind: 'send', text: 'w', assigneeId: 'p-2', dest: 'RDOŚ' }] }, people, t0).list;
  list = O.create(list, { createdBy: 'p-3', steps: [{ kind: 'send', text: 'w', assigneeId: 'p-2', dest: 'RZGW' }] }, people, t0).list;
  assert.deepEqual(O.recentDest(list, 4), ['RZGW', 'RDOŚ']);
});
