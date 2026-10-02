/* ETROM — warstwa społecznościowa: wpisy osób, komentarze i reakcje.
   Czyste funkcje, bez DOM. Wszystko jest związane z „kluczem pozycji” strumienia
   (np. zdarzenia zadania albo wpisu), więc działa tak samo dla zdarzeń z pracy
   i dla wpisów napisanych przez ludzi. Stan: { reactions, comments, posts }. */
(function (root) {
  'use strict';

  var REACTIONS = [
    { id: 'like', emoji: '👍', label: 'Super' },
    { id: 'heart', emoji: '❤️', label: 'Dzięki' },
    { id: 'party', emoji: '🎉', label: 'Gratulacje' },
    { id: 'eyes', emoji: '👀', label: 'Widzę' }
  ];
  var LIMITS = { post: 1000, comment: 500, key: 120, posts: 500, comments: 3000, reactionKeys: 3000, images: 4, imageChars: 700000, imageTotal: 3500000, pollOptions: 5, pollOption: 80 };
  // Rodzaje wpisów: zwykły, ogłoszenie (zarząd), ankieta i wyróżnienie osoby.
  var TYPES = ['post', 'announcement', 'poll', 'kudos'];
  var IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function ids() { return REACTIONS.map(function (r) { return r.id; }); }
  function empty() { return { reactions: {}, comments: [], posts: [] }; }

  function nextId(prefix, list) {
    var max = 0;
    list.forEach(function (item) {
      var m = new RegExp('^' + prefix + '-(\\d+)$').exec(String(item && item.id));
      if (m) max = Math.max(max, Number(m[1]));
    });
    return prefix + '-' + (max + 1);
  }

  function isTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }

  /** Czyści zapis z dysku: nieznane reakcje, puste teksty i duplikaty znikają. */
  function normalize(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var out = empty();
    var valid = ids();

    var reactions = source.reactions && typeof source.reactions === 'object' && !Array.isArray(source.reactions) ? source.reactions : {};
    Object.keys(reactions).slice(0, LIMITS.reactionKeys).forEach(function (key) {
      if (!key || key.length > LIMITS.key || !reactions[key] || typeof reactions[key] !== 'object') return;
      var byReaction = {};
      valid.forEach(function (rid) {
        var list = Array.isArray(reactions[key][rid]) ? reactions[key][rid] : [];
        var seen = {};
        var clean = list.filter(function (p) {
          if (typeof p !== 'string' || !p || seen[p]) return false;
          seen[p] = true;
          return true;
        });
        if (clean.length) byReaction[rid] = clean;
      });
      if (Object.keys(byReaction).length) out.reactions[key] = byReaction;
    });

    var seenIds = {};
    (Array.isArray(source.comments) ? source.comments : []).forEach(function (c) {
      if (!c || out.comments.length >= LIMITS.comments) return;
      var body = text(c.text).slice(0, LIMITS.comment);
      var id = text(c.id);
      if (!id || seenIds[id] || !body || !text(c.key) || !text(c.personId) || !isTime(c.at)) return;
      seenIds[id] = true;
      out.comments.push({ id: id, key: text(c.key).slice(0, LIMITS.key), personId: text(c.personId), text: body, at: c.at });
    });

    var seenPosts = {};
    (Array.isArray(source.posts) ? source.posts : []).forEach(function (p) {
      if (!p || out.posts.length >= LIMITS.posts) return;
      var body = text(p.text).slice(0, LIMITS.post);
      var id = text(p.id);
      var withMedia = Array.isArray(p.images) && p.images.length > 0;
      if (!id || seenPosts[id] || (!body && !withMedia) || !text(p.personId) || !isTime(p.at)) return;
      seenPosts[id] = true;
      out.posts.push(cleanPost(p, id, body));
    });
    return out;
  }

  function cleanImages(list) {
    return (Array.isArray(list) ? list : []).filter(function (u) { return typeof u === 'string' && u.length <= LIMITS.imageChars && IMAGE.test(u); }).slice(0, LIMITS.images);
  }

  function cleanPoll(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var seen = {};
    var options = (Array.isArray(raw.options) ? raw.options : []).map(function (o) {
      var label = text(o && o.text).slice(0, LIMITS.pollOption);
      var id = text(o && o.id);
      return label && id && !seen[id] ? (seen[id] = true, { id: id, text: label }) : null;
    }).filter(Boolean).slice(0, LIMITS.pollOptions);
    if (options.length < 2) return null;
    var votes = {};
    var v = raw.votes && typeof raw.votes === 'object' && !Array.isArray(raw.votes) ? raw.votes : {};
    Object.keys(v).forEach(function (pid) { if (seen[v[pid]]) votes[pid] = v[pid]; });
    return { options: options, votes: votes };
  }

  /** Wspólne czyszczenie wpisu (normalize i addPost): rodzaj, zdjęcia, ankieta, wyróżniony, przypięcie. */
  function cleanPost(p, id, body) {
    var type = TYPES.indexOf(p.type) >= 0 ? p.type : 'post';
    var out = {
      id: id, personId: text(p.personId), projectId: Number.isSafeInteger(p.projectId) && p.projectId > 0 ? p.projectId : null,
      text: body, at: p.at, type: type, images: cleanImages(p.images)
    };
    if (type === 'poll') { out.poll = cleanPoll(p.poll); if (!out.poll) out.type = 'post'; }
    if (type === 'kudos') { if (text(p.to)) out.to = text(p.to); else out.type = 'post'; }
    if (out.type === 'announcement' && p.pinned === true) out.pinned = true;
    return out;
  }

  /** Dodaje reakcję osoby albo ją zdejmuje (ta sama reakcja drugi raz). */
  function toggleReaction(social, key, reactionId, personId) {
    var s = social || empty();
    if (ids().indexOf(reactionId) < 0 || !key || !personId) return s;
    var byKey = Object.assign({}, s.reactions[key] || {});
    var list = (byKey[reactionId] || []).slice();
    var at = list.indexOf(personId);
    if (at >= 0) list.splice(at, 1); else list.push(personId);
    if (list.length) byKey[reactionId] = list; else delete byKey[reactionId];
    var reactions = Object.assign({}, s.reactions);
    if (Object.keys(byKey).length) reactions[key] = byKey; else delete reactions[key];
    return Object.assign({}, s, { reactions: reactions });
  }

  /** Reakcje pozycji: lista { id, emoji, label, count, mine } tylko z użytymi reakcjami. */
  function reactionsOf(social, key, personId) {
    var byKey = (social && social.reactions && social.reactions[key]) || {};
    return REACTIONS.filter(function (r) { return (byKey[r.id] || []).length; }).map(function (r) {
      return { id: r.id, emoji: r.emoji, label: r.label, count: byKey[r.id].length, mine: byKey[r.id].indexOf(personId) >= 0, people: byKey[r.id].slice() };
    });
  }

  function addComment(social, key, personId, body, now) {
    var s = social || empty();
    var value = text(body);
    if (!value) return { valid: false, error: 'Napisz komentarz.', social: s };
    if (value.length > LIMITS.comment) return { valid: false, error: 'Komentarz może mieć najwyżej ' + LIMITS.comment + ' znaków.', social: s };
    if (!key || !personId) return { valid: false, error: 'Wybierz w „Mojej pracy”, kim jesteś.', social: s };
    if (s.comments.length >= LIMITS.comments) return { valid: false, error: 'Osiągnięto limit komentarzy.', social: s };
    var entry = { id: nextId('c', s.comments), key: key, personId: personId, text: value, at: (now instanceof Date ? now : new Date()).toISOString() };
    return { valid: true, error: '', social: Object.assign({}, s, { comments: s.comments.concat([entry]) }), comment: entry };
  }

  function removeComment(social, id) {
    var s = social || empty();
    return Object.assign({}, s, { comments: s.comments.filter(function (c) { return c.id !== id; }) });
  }

  function commentsOf(social, key) {
    return ((social && social.comments) || []).filter(function (c) { return c.key === key; })
      .sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
  }

  function imageChars(social) {
    var n = 0;
    ((social && social.posts) || []).forEach(function (p) { (p.images || []).forEach(function (u) { n += u.length; }); });
    return n;
  }

  /**
   * Nowy wpis osoby; projekt jest opcjonalny (bez projektu = dla całego biura).
   * input: { personId, projectId, text, type, images[], options[] (ankieta), to (wyróżnienie), pinned }
   */
  function addPost(social, input, now) {
    var s = social || empty();
    var data = input || {};
    var value = text(data.text);
    var type = TYPES.indexOf(data.type) >= 0 ? data.type : 'post';
    var images = cleanImages(data.images);
    var fail = function (error) { return { valid: false, error: error, social: s }; };
    if (!text(data.personId)) return fail('Wybierz w „Mojej pracy”, kim jesteś.');
    if (value.length > LIMITS.post) return fail('Wpis może mieć najwyżej ' + LIMITS.post + ' znaków.');
    if (Array.isArray(data.images) && data.images.length > LIMITS.images) return fail('Do wpisu można dodać najwyżej ' + LIMITS.images + ' zdjęcia.');
    if (Array.isArray(data.images) && images.length !== data.images.length) return fail('Nie wszystkie zdjęcia da się dodać (format albo rozmiar).');
    if (type === 'poll' && !value) return fail('Napisz pytanie ankiety.');
    if (type === 'kudos' && !text(data.to)) return fail('Wybierz, kogo wyróżniasz.');
    if (type === 'kudos' && !value) return fail('Napisz, za co jest wyróżnienie.');
    if (type !== 'poll' && !value && !images.length) return fail('Napisz coś albo dodaj zdjęcie.');
    var poll = null;
    if (type === 'poll') {
      var seenText = {};
      var options = (Array.isArray(data.options) ? data.options : []).map(function (o) { return text(o).slice(0, LIMITS.pollOption); })
        .filter(function (o) { var k = o.toLowerCase(); if (!o || seenText[k]) return false; seenText[k] = true; return true; }).slice(0, LIMITS.pollOptions);
      if (options.length < 2) return fail('Ankieta potrzebuje co najmniej dwóch różnych odpowiedzi.');
      poll = { options: options.map(function (o, i) { return { id: 'o' + (i + 1), text: o }; }), votes: {} };
    }
    if (s.posts.length >= LIMITS.posts) return fail('Osiągnięto limit wpisów.');
    var added = images.reduce(function (n, u) { return n + u.length; }, 0);
    if (imageChars(s) + added > LIMITS.imageTotal) return fail('Pamięć zdjęć w tej przeglądarce jest pełna — usuń stare wpisy ze zdjęciami.');
    var entry = cleanPost({
      personId: data.personId, projectId: data.projectId, type: type, images: images, poll: poll, to: data.to, pinned: data.pinned,
      at: (now instanceof Date ? now : new Date()).toISOString()
    }, nextId('w', s.posts), value);
    return { valid: true, error: '', social: Object.assign({}, s, { posts: s.posts.concat([entry]) }), post: entry };
  }

  /** Głos w ankiecie; ten sam głos drugi raz go cofa, inny odpowiedź zmienia. */
  function vote(social, postId, personId, optionId) {
    var s = social || empty();
    if (!personId) return s;
    return Object.assign({}, s, { posts: s.posts.map(function (p) {
      if (p.id !== postId || !p.poll || !p.poll.options.some(function (o) { return o.id === optionId; })) return p;
      var votes = Object.assign({}, p.poll.votes);
      if (votes[personId] === optionId) delete votes[personId]; else votes[personId] = optionId;
      return Object.assign({}, p, { poll: Object.assign({}, p.poll, { votes: votes }) });
    }) });
  }

  /** Wyniki ankiety: { total, options: [{ id, text, count, percent, mine }] }. */
  function pollResults(post, personId) {
    var poll = post && post.poll;
    if (!poll) return { total: 0, options: [] };
    var votes = poll.votes || {};
    var total = Object.keys(votes).length;
    return {
      total: total,
      options: poll.options.map(function (o) {
        var count = Object.keys(votes).filter(function (k) { return votes[k] === o.id; }).length;
        return { id: o.id, text: o.text, count: count, percent: total ? Math.round((count / total) * 100) : 0, mine: votes[personId] === o.id };
      })
    };
  }

  function togglePin(social, id) {
    var s = social || empty();
    return Object.assign({}, s, { posts: s.posts.map(function (p) {
      if (p.id !== id || p.type !== 'announcement') return p;
      var next = Object.assign({}, p);
      if (p.pinned) delete next.pinned; else next.pinned = true;
      return next;
    }) });
  }

  function removePost(social, id) {
    var s = social || empty();
    var key = 'post:' + id;
    var reactions = Object.assign({}, s.reactions);
    delete reactions[key];
    return Object.assign({}, s, {
      posts: s.posts.filter(function (p) { return p.id !== id; }),
      comments: s.comments.filter(function (c) { return c.key !== key; }),
      reactions: reactions
    });
  }

  var api = {
    REACTIONS: REACTIONS, LIMITS: LIMITS, TYPES: TYPES, empty: empty, normalize: normalize,
    toggleReaction: toggleReaction, reactionsOf: reactionsOf,
    addComment: addComment, removeComment: removeComment, commentsOf: commentsOf,
    addPost: addPost, removePost: removePost, vote: vote, pollResults: pollResults, togglePin: togglePin, imageChars: imageChars
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Social = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
