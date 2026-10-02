'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Social = require('../src/core/social.js');
const Feed = require('../src/core/feed.js');

const NOW = new Date('2026-10-02T12:00:00.000Z');
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const add = (social, input) => Social.addPost(social, Object.assign({ personId: 'p-1' }, input), NOW);

test('wpis ze zdjęciem bez tekstu jest dozwolony, bez niczego — nie', () => {
  assert.equal(add(Social.empty(), { text: '', images: [IMG] }).valid, true);
  assert.equal(add(Social.empty(), { text: '' }).valid, false);
});

test('zdjęcia: tylko obrazy data:, najwyżej cztery, zły format odrzuca cały wpis', () => {
  assert.equal(add(Social.empty(), { text: 'x', images: [IMG, IMG, IMG, IMG, IMG] }).valid, false);
  assert.equal(add(Social.empty(), { text: 'x', images: ['http://x/y.jpg'] }).valid, false);
  assert.equal(add(Social.empty(), { text: 'x', images: ['data:text/html;base64,AAAA'] }).valid, false);
  const ok = add(Social.empty(), { text: 'x', images: [IMG, IMG] });
  assert.equal(ok.post.images.length, 2);
});

test('pamięć zdjęć ma limit łączny', () => {
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(Social.LIMITS.imageChars - 30);
  let s = Social.empty();
  let last;
  for (let i = 0; i < 6; i += 1) { last = add(s, { text: 'x' + i, images: [big] }); if (last.valid) s = last.social; }
  assert.equal(last.valid, false);
  assert.match(last.error, /Pamięć zdjęć/);
});

test('ankieta: pytanie i co najmniej dwie różne odpowiedzi', () => {
  assert.equal(add(Social.empty(), { type: 'poll', text: 'Gdzie?', options: ['A'] }).valid, false);
  assert.equal(add(Social.empty(), { type: 'poll', text: 'Gdzie?', options: ['A', 'a'] }).valid, false);
  assert.equal(add(Social.empty(), { type: 'poll', text: '', options: ['A', 'B'] }).valid, false);
  const r = add(Social.empty(), { type: 'poll', text: 'Gdzie?', options: ['A', 'B', ' '] });
  assert.equal(r.valid, true);
  assert.equal(r.post.poll.options.length, 2);
});

test('głosowanie: zmiana odpowiedzi, cofnięcie, wyniki w procentach', () => {
  let s = add(Social.empty(), { type: 'poll', text: 'Gdzie?', options: ['A', 'B'] }).social;
  const id = s.posts[0].id;
  s = Social.vote(s, id, 'p-1', 'o1');
  s = Social.vote(s, id, 'p-2', 'o1');
  s = Social.vote(s, id, 'p-3', 'o2');
  let res = Social.pollResults(s.posts[0], 'p-1');
  assert.equal(res.total, 3);
  assert.equal(res.options[0].count, 2);
  assert.equal(res.options[0].percent, 67);
  assert.equal(res.options[0].mine, true);
  s = Social.vote(s, id, 'p-1', 'o2');
  res = Social.pollResults(s.posts[0], 'p-1');
  assert.equal(res.options[1].count, 2);
  s = Social.vote(s, id, 'p-1', 'o2');
  assert.equal(Social.pollResults(s.posts[0], 'p-1').total, 2);
  assert.equal(Social.vote(s, id, 'p-1', 'zly').posts[0].poll.votes['p-1'], undefined);
});

test('wyróżnienie wymaga osoby i uzasadnienia', () => {
  assert.equal(add(Social.empty(), { type: 'kudos', text: 'Dzięki' }).valid, false);
  assert.equal(add(Social.empty(), { type: 'kudos', to: 'p-2', text: '' }).valid, false);
  const r = add(Social.empty(), { type: 'kudos', to: 'p-2', text: 'Za nocną robotę' });
  assert.equal(r.post.to, 'p-2');
});

test('przypinać można tylko ogłoszenia', () => {
  let s = add(Social.empty(), { type: 'announcement', text: 'Spotkanie', pinned: true }).social;
  s = add(s, { text: 'zwykły' }).social;
  assert.equal(s.posts[0].pinned, true);
  s = Social.togglePin(s, s.posts[1].id);
  assert.equal(s.posts[1].pinned, undefined);
  s = Social.togglePin(s, s.posts[0].id);
  assert.equal(s.posts[0].pinned, undefined);
});

test('normalizacja zapisu: stare wpisy bez rodzaju działają, śmieci znikają', () => {
  const raw = { posts: [
    { id: 'w-1', personId: 'p-1', text: 'stary', at: NOW.toISOString() },
    { id: 'w-2', personId: 'p-1', text: 'z fotką', at: NOW.toISOString(), images: [IMG, 'zly', 5] },
    { id: 'w-3', personId: 'p-1', text: 'ank', at: NOW.toISOString(), type: 'poll', poll: { options: [{ id: 'a', text: 'A' }] } },
    { id: 'w-4', personId: 'p-1', text: 'kudos bez osoby', at: NOW.toISOString(), type: 'kudos' }
  ] };
  const s = Social.normalize(raw);
  assert.equal(s.posts[0].type, 'post');
  assert.deepEqual(s.posts[1].images, [IMG]);
  assert.equal(s.posts[2].type, 'post', 'ankieta z jedną odpowiedzią degraduje się do wpisu');
  assert.equal(s.posts[3].type, 'post');
});

test('strumień: przypięte ogłoszenia osobno, filtr zdjęć, okno czasu pracy', () => {
  const project = { id: 1, code: '2601', name: 'P', createdAt: '2026-01-01T00:00:00.000Z', stages: [], team: {} };
  let social = add(Social.empty(), { type: 'announcement', text: 'Ważne', pinned: true }).social;
  social = add(social, { text: 'fotka', images: [IMG] }).social;
  social = add(social, { text: 'zwykły' }).social;
  const old = { id: 'e1', personId: 'p-1', projectId: 1, stageId: 's', taskId: 't', start: '2026-09-01T08:00:00.000Z', end: '2026-09-01T10:00:00.000Z', label: 'stare' };
  const fresh = { id: 'e2', personId: 'p-1', projectId: 1, stageId: 's', taskId: 't', start: '2026-10-02T08:00:00.000Z', end: '2026-10-02T10:00:00.000Z', label: 'świeże' };
  const ws = { projects: [project], people: [], entries: [old, fresh], mail: [], social };
  const all = Feed.build(ws, 'p-1', NOW, { filter: 'all', limit: 50 });
  assert.equal(all.pinned.length, 1);
  assert.ok(all.items.every((i) => !(i.post && i.post.pinned)), 'przypięte nie powtarzają się w osi czasu');
  assert.equal(all.items.filter((i) => i.kind === 'time').length, 1, 'tylko świeży czas pracy');
  assert.equal(all.counts.media, 1);
  const media = Feed.build(ws, 'p-1', NOW, { filter: 'media' });
  assert.equal(media.items.length, 1);
  assert.equal(media.pinned.length, 0);
});

test('edycja wpisu: zmienia treść i zostawia ślad, pustego tekstu bez zdjęcia nie przyjmuje', () => {
  let s = add(Social.empty(), { text: 'pierwsza wersja' }).social;
  const id = s.posts[0].id;
  assert.equal(Social.editPost(s, id, '  ').valid, false);
  assert.equal(Social.editPost(s, 'brak', 'x').valid, false);
  const same = Social.editPost(s, id, 'pierwsza wersja');
  assert.equal(same.social.posts[0].edited, undefined);
  s = Social.editPost(s, id, 'druga wersja').social;
  assert.equal(s.posts[0].text, 'druga wersja');
  assert.equal(s.posts[0].edited, true);
  assert.equal(Social.normalize(s).posts[0].edited, true);
  const photo = add(Social.empty(), { text: 'x', images: [IMG] }).social;
  assert.equal(Social.editPost(photo, photo.posts[0].id, '').valid, true, 'wpis ze zdjęciem może mieć pusty opis');
});
