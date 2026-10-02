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
  var LIMITS = { post: 1000, comment: 500, key: 120, posts: 500, comments: 3000, reactionKeys: 3000 };

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
      if (!id || seenPosts[id] || !body || !text(p.personId) || !isTime(p.at)) return;
      seenPosts[id] = true;
      out.posts.push({ id: id, personId: text(p.personId), projectId: Number.isSafeInteger(p.projectId) && p.projectId > 0 ? p.projectId : null, text: body, at: p.at });
    });
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

  /** Nowy wpis osoby; projekt jest opcjonalny (bez projektu = dla całego biura). */
  function addPost(social, input, now) {
    var s = social || empty();
    var data = input || {};
    var value = text(data.text);
    if (!value) return { valid: false, error: 'Napisz, co chcesz przekazać zespołowi.', social: s };
    if (value.length > LIMITS.post) return { valid: false, error: 'Wpis może mieć najwyżej ' + LIMITS.post + ' znaków.', social: s };
    if (!text(data.personId)) return { valid: false, error: 'Wybierz w „Mojej pracy”, kim jesteś.', social: s };
    if (s.posts.length >= LIMITS.posts) return { valid: false, error: 'Osiągnięto limit wpisów.', social: s };
    var entry = {
      id: nextId('w', s.posts), personId: text(data.personId),
      projectId: Number.isSafeInteger(data.projectId) && data.projectId > 0 ? data.projectId : null,
      text: value, at: (now instanceof Date ? now : new Date()).toISOString()
    };
    return { valid: true, error: '', social: Object.assign({}, s, { posts: s.posts.concat([entry]) }), post: entry };
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
    REACTIONS: REACTIONS, LIMITS: LIMITS, empty: empty, normalize: normalize,
    toggleReaction: toggleReaction, reactionsOf: reactionsOf,
    addComment: addComment, removeComment: removeComment, commentsOf: commentsOf,
    addPost: addPost, removePost: removePost
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Social = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
