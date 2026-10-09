/* ETROM — zlecenia wewnętrzne: prośba od osoby do osoby („podpisz”, „wyślij”, „opłać”, „zrób”).
   Bez terminu: zamiast niego liczy się czas, jaki upłynął od chwili, gdy zlecenie trafiło do wykonawcy.
   Zlecenia mogą tworzyć łańcuch (podpisz → wyślij): następny krok rusza po zamknięciu poprzedniego.
   Czyste funkcje, bez DOM. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;

  var KINDS = { sign: 'Do podpisu', send: 'Do wysłania', pay: 'Do opłacenia', other: 'Inne' };
  var DONE_LABEL = { sign: 'Podpisane', send: 'Wysłane', pay: 'Opłacone', other: 'Zrobione' };
  var WARN_MS = 86400000;
  var LATE_MS = 3 * 86400000;
  var LIMITS = { text: 300, dest: 160, note: 200, url: 500, name: 160, file: 250000, filesTotal: 1500000 };

  function str(v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; }
  function stamp(v) { return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : ''; }
  function isoOf(now) { return (now instanceof Date ? now : new Date()).toISOString(); }

  /** Plik albo link: { type: 'file'|'link', name, url?, size?, data? }. `data` (data URL) tylko dla małych plików. */
  function cleanRef(r) {
    if (!r || typeof r !== 'object') return null;
    if (r.type === 'link') {
      var url = str(r.url, LIMITS.url);
      return url ? { type: 'link', name: str(r.name, LIMITS.name) || url.replace(/^https?:\/\//, '').slice(0, 60), url: url } : null;
    }
    if (r.type === 'file') {
      var name = str(r.name, LIMITS.name);
      if (!name) return null;
      var out = { type: 'file', name: name, size: Number(r.size) > 0 ? Math.round(Number(r.size)) : 0 };
      if (typeof r.data === 'string' && /^data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+$/.test(r.data) && r.data.length <= LIMITS.file) out.data = r.data;
      return out;
    }
    return null;
  }

  function cleanPay(p) {
    if (!p || typeof p !== 'object') return null;
    var out = { payee: str(p.payee, 120), account: str(p.account, 40), title: str(p.title, 140), amount: str(p.amount, 20) };
    return out.payee || out.account || out.title || out.amount ? out : null;
  }

  function normalize(list) {
    var seen = {};
    var total = 0;
    var rows = (Array.isArray(list) ? list : []).map(function (o) {
      if (!o || typeof o.assigneeId !== 'string' || !o.assigneeId || typeof o.createdBy !== 'string' || !KINDS[o.kind]) return null;
      var text = str(o.text, LIMITS.text);
      if (!text) return null;
      var status = o.status === 'done' || o.status === 'cancelled' || o.status === 'waiting' ? o.status : 'open';
      var id = typeof o.id === 'string' && o.id && !seen[o.id] ? o.id : '';
      if (id) seen[id] = true;
      var doc = cleanRef(o.doc);
      var result = cleanRef(o.result);
      [doc, result].forEach(function (r) {
        if (r && r.data) { if (total + r.data.length > LIMITS.filesTotal) delete r.data; else total += r.data.length; }
      });
      return {
        id: id, chainId: typeof o.chainId === 'string' && o.chainId ? o.chainId : '', step: Number(o.step) > 0 ? Math.round(Number(o.step)) : 1,
        kind: o.kind, text: text, projectId: o.projectId === null || o.projectId === undefined || o.projectId === '' ? null : o.projectId,
        assigneeId: o.assigneeId, createdBy: o.createdBy, createdAt: stamp(o.createdAt), startedAt: stamp(o.startedAt) || stamp(o.createdAt),
        doc: doc, dest: str(o.dest, LIMITS.dest), pay: o.kind === 'pay' ? cleanPay(o.pay) : null,
        status: status, doneAt: stamp(o.doneAt), doneBy: str(o.doneBy, 40), result: result, resultNote: str(o.resultNote, LIMITS.note), nudgedAt: stamp(o.nudgedAt)
      };
    }).filter(Boolean);
    rows.forEach(function (o) { if (o.id) seen[o.id] = true; });
    var n = 0;
    rows.forEach(function (o) { if (!o.id) { do { n += 1; } while (seen['z-' + n]); o.id = 'z-' + n; seen[o.id] = true; } });
    var cn = 0;
    var chains = {};
    rows.forEach(function (o) { if (o.chainId) chains[o.chainId] = true; });
    rows.forEach(function (o) { if (!o.chainId) { do { cn += 1; } while (chains['zc-' + cn]); o.chainId = 'zc-' + cn; chains[o.chainId] = true; } });
    return rows;
  }

  function validateStep(s, people, index) {
    var e = {};
    var p = index > 0 ? 'step' + index + '.' : '';
    if (!KINDS[s.kind]) e[p + 'kind'] = 'Wybierz rodzaj zlecenia.';
    if (!str(s.text, LIMITS.text)) e[p + 'text'] = 'Napisz, co trzeba zrobić.';
    if (!s.assigneeId || !(people || []).some(function (x) { return x.id === s.assigneeId; })) e[p + 'assigneeId'] = 'Wybierz osobę.';
    return e;
  }

  /**
   * Tworzy zlecenie (lub łańcuch zleceń). input: { createdBy, projectId, steps: [{kind, text, assigneeId, doc, dest, pay}] }.
   * Pierwszy krok jest od razu otwarty, kolejne czekają na poprzedni.
   * @returns {{valid, errors, list, ids}}
   */
  function create(list, input, people, now) {
    var current = normalize(list);
    var steps = (input && Array.isArray(input.steps) ? input.steps : []).slice(0, 5);
    var errors = {};
    if (!steps.length) errors.text = 'Napisz, co trzeba zrobić.';
    steps.forEach(function (s, i) { Object.assign(errors, validateStep(s || {}, people, i)); });
    if (!input || !input.createdBy) errors.createdBy = 'Wybierz, kim jesteś.';
    if (Object.keys(errors).length) return { valid: false, errors: errors, list: current, ids: [] };
    var at = isoOf(now);
    var chainId = 'zc-new-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    var added = steps.map(function (s, i) {
      return {
        id: '', chainId: chainId, step: i + 1, kind: s.kind, text: s.text, projectId: input.projectId || null, assigneeId: s.assigneeId,
        createdBy: input.createdBy, createdAt: at, startedAt: at, doc: i === 0 ? (s.doc || null) : (s.doc || null), dest: s.dest || '', pay: s.pay || null,
        status: i === 0 ? 'open' : 'waiting', doneAt: '', doneBy: '', result: null, resultNote: '', nudgedAt: ''
      };
    });
    var next = normalize(current.concat(added));
    var ids = next.filter(function (o) { return o.chainId === chainId || added.some(function (a) { return false; }); }).map(function (o) { return o.id; });
    // chainId nadany tymczasowo zostaje unikalny — ids to wszystkie zlecenia tego łańcucha
    return { valid: true, errors: {}, list: next, ids: ids };
  }

  function byId(list, id) { return (list || []).filter(function (o) { return o.id === id; })[0] || null; }
  function chainOf(list, order) {
    return (list || []).filter(function (o) { return o.chainId === order.chainId; }).sort(function (a, b) { return a.step - b.step; });
  }

  function isManagement(personId, people) {
    var p = (people || []).filter(function (x) { return x.id === personId; })[0];
    return !!p && p.orgRole === 'managing';
  }

  function canClose(viewerId, order, people) {
    return !!order && order.status === 'open' && (order.assigneeId === viewerId || isManagement(viewerId, people));
  }
  function canManage(viewerId, order, people) {
    return !!order && (order.createdBy === viewerId || isManagement(viewerId, people));
  }
  function canSee(viewerId, order, people) {
    return !!order && (order.createdBy === viewerId || order.assigneeId === viewerId || isManagement(viewerId, people));
  }

  /** Zamyka zlecenie. result: plik/link lub null (samo potwierdzenie). Następny krok łańcucha rusza i dziedziczy dokument. */
  function complete(list, id, byIdv, result, note, people, now) {
    var current = normalize(list);
    var o = byId(current, id);
    if (!o || !canClose(byIdv, o, people)) return { ok: false, list: current };
    var at = isoOf(now);
    var res = cleanRef(result);
    var next = current.map(function (x) {
      if (x.id === id) return Object.assign({}, x, { status: 'done', doneAt: at, doneBy: byIdv, result: res, resultNote: str(note, LIMITS.note) });
      return x;
    });
    var follow = next.filter(function (x) { return x.chainId === o.chainId && x.step === o.step + 1 && x.status === 'waiting'; })[0];
    if (follow) {
      next = next.map(function (x) {
        if (x.id !== follow.id) return x;
        var inherited = x.doc || res || o.doc || null;
        return Object.assign({}, x, { status: 'open', startedAt: at, doc: inherited });
      });
    }
    return { ok: true, list: normalize(next), nextId: follow ? follow.id : null };
  }

  /** Anuluje zlecenie i wszystkie jeszcze nieotwarte kroki za nim. */
  function cancel(list, id, byIdv, people, now) {
    var current = normalize(list);
    var o = byId(current, id);
    if (!o || o.status === 'done' || !canManage(byIdv, o, people)) return { ok: false, list: current };
    var at = isoOf(now);
    var next = current.map(function (x) {
      if (x.chainId === o.chainId && x.step >= o.step && (x.status === 'open' || x.status === 'waiting')) return Object.assign({}, x, { status: 'cancelled', doneAt: at, doneBy: byIdv });
      return x;
    });
    return { ok: true, list: normalize(next) };
  }

  /** Przypomnienie: tylko zgłaszający (lub Dyrekcja) wyróżnia zlecenie u wykonawcy. */
  function nudge(list, id, byIdv, people, now) {
    var current = normalize(list);
    var o = byId(current, id);
    if (!o || o.status !== 'open' || !canManage(byIdv, o, people)) return { ok: false, list: current };
    return { ok: true, list: normalize(current.map(function (x) { return x.id === id ? Object.assign({}, x, { nudgedAt: isoOf(now) }) : x; })) };
  }

  function reassign(list, id, byIdv, toId, people) {
    var current = normalize(list);
    var o = byId(current, id);
    if (!o || o.status !== 'open' || !(people || []).some(function (p) { return p.id === toId; }) || !(canClose(byIdv, o, people) || canManage(byIdv, o, people))) return { ok: false, list: current };
    return { ok: true, list: normalize(current.map(function (x) { return x.id === id ? Object.assign({}, x, { assigneeId: toId }) : x; })) };
  }

  /** Czas od chwili, gdy zlecenie trafiło do wykonawcy (zamknięte: czas trwania). */
  function elapsedMs(o, now) {
    var from = Date.parse(o.startedAt || o.createdAt);
    var to = o.status === 'done' && o.doneAt ? Date.parse(o.doneAt) : (now instanceof Date ? now : new Date()).getTime();
    return Math.max(0, to - from);
  }

  /** „7 min”, „3 h”, „2 d 4 h”, „6 d”. */
  function ageText(ms) {
    var min = Math.floor(ms / 60000);
    if (min < 1) return '<1 min';
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' h';
    var d = Math.floor(h / 24);
    var rest = h - d * 24;
    return d + ' d' + (rest ? ' ' + rest + ' h' : '');
  }

  /** neutral → warn (od doby) → late (od 3 dni); zamknięte: ok. */
  function tone(o, now) {
    if (o.status === 'done') return 'ok';
    if (o.status !== 'open') return 'n';
    var ms = elapsedMs(o, now);
    return ms >= LATE_MS ? 'late' : (ms >= WARN_MS ? 'warn' : 'n');
  }

  function forAssignee(list, personId) { return (list || []).filter(function (o) { return o.assigneeId === personId && o.status === 'open'; }); }
  function sentBy(list, personId) { return (list || []).filter(function (o) { return o.createdBy === personId; }); }
  function openCount(list, personId) { return forAssignee(list, personId).length; }

  /** Najstarsze otwarte zlecenia osoby — pierwsze na liście. */
  function oldestFirst(list, now) { return (list || []).slice().sort(function (a, b) { return elapsedMs(b, now) - elapsedMs(a, now); }); }

  /** Kogo zaproponować: osobę, której ten zgłaszający najczęściej zlecał ten rodzaj; potem wszyscy; brak → null. */
  function suggestAssignee(list, kind, createdBy) {
    function top(rows) {
      var n = {};
      rows.forEach(function (o) { n[o.assigneeId] = (n[o.assigneeId] || 0) + 1; });
      var best = null;
      Object.keys(n).forEach(function (k) { if (!best || n[k] > n[best]) best = k; });
      return best ? { personId: best, count: n[best] } : null;
    }
    var rows = (list || []).filter(function (o) { return o.kind === kind; });
    return top(rows.filter(function (o) { return o.createdBy === createdBy; })) || top(rows);
  }

  /** Ostatnie adresy „Dokąd wysłać” (bez powtórzeń). */
  function recentDest(list, limit) {
    var seen = {};
    var out = [];
    (list || []).slice().reverse().forEach(function (o) {
      if (o.kind === 'send' && o.dest && !seen[o.dest]) { seen[o.dest] = true; out.push(o.dest); }
    });
    return out.slice(0, limit || 4);
  }

  var api = {
    KINDS: KINDS, DONE_LABEL: DONE_LABEL, LIMITS: LIMITS, normalize: normalize, create: create, complete: complete, cancel: cancel, nudge: nudge, reassign: reassign,
    chainOf: chainOf, byId: byId, canClose: canClose, canManage: canManage, canSee: canSee, elapsedMs: elapsedMs, ageText: ageText, tone: tone,
    forAssignee: forAssignee, sentBy: sentBy, openCount: openCount, oldestFirst: oldestFirst, suggestAssignee: suggestAssignee, recentDest: recentDest, cleanRef: cleanRef
  };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Orders = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
