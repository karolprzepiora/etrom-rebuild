/* ETROM — konta osób, role, stawki z historią i dziennik zmian. Czyste funkcje, bez DOM.
   Hasła nie są przechowywane: aplikacja zna tylko stan konta. Hasło tymczasowe powstaje raz,
   pokazuje się zarządowi i osoba zmienia je przy pierwszym logowaniu (po stronie serwera). */
(function (root) {
  'use strict';

  var STATUS = { none: 'Bez konta', invited: 'Czeka na pierwsze logowanie', active: 'Aktywne', disabled: 'Wyłączone' };
  var ACTIONS = {
    'account.create': 'Założono konto',
    'account.reset': 'Ustawiono nowe hasło tymczasowe',
    'account.invite': 'Wysłano zaproszenie ponownie',
    'account.disable': 'Wyłączono konto',
    'account.enable': 'Przywrócono konto',
    'role.change': 'Zmieniono rolę',
    'rate.change': 'Zmieniono stawkę',
    'leave.change': 'Zmieniono wymiar urlopu',
    'email.change': 'Zmieniono e-mail'
  };
  var AUDIT_LIMIT = 500;
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

  function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00')); }
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function stamp(v) { return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : ''; }

  /** Hasło tymczasowe w formacie Xxx-xxx-xxx bez znaków łatwych do pomylenia. `rand` zwraca liczbę z [0,1). */
  function generatePassword(rand) {
    var next = typeof rand === 'function' ? rand : function () {
      var c = typeof globalThis !== 'undefined' && globalThis.crypto;
      if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 4294967296;
      return Math.random();
    };
    var out = '';
    for (var i = 0; i < 9; i += 1) {
      if (i === 3 || i === 6) out += '-';
      out += ALPHABET.charAt(Math.floor(next() * ALPHABET.length));
    }
    return out;
  }

  function validEmail(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }
  function normEmail(v) { return typeof v === 'string' ? v.trim().toLowerCase() : ''; }

  function emailTaken(people, email, ignoreId) {
    var e = normEmail(email);
    if (!e) return false;
    return (people || []).some(function (p) { return p.id !== ignoreId && normEmail(p.email) === e; });
  }

  function statusOf(person) {
    var s = person && person.account && person.account.status;
    return STATUS[s] ? s : 'none';
  }

  /** Czyści blok konta wczytany z dysku. */
  function normalizeAccount(raw) {
    if (!raw || typeof raw !== 'object' || !STATUS[raw.status] || raw.status === 'none') return null;
    return {
      status: raw.status,
      mustChange: raw.mustChange === true,
      createdAt: stamp(raw.createdAt),
      createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : '',
      lastLoginAt: stamp(raw.lastLoginAt),
      passwordSetAt: stamp(raw.passwordSetAt)
    };
  }

  /** Historia stawek: rosnąco po dacie „od", bez powtórzeń daty. */
  function normalizeRates(raw) {
    var seen = {};
    return (Array.isArray(raw) ? raw : []).map(function (r) {
      var rate = Number(r && r.rate);
      if (!r || !isDay(r.from) || !Number.isFinite(rate) || rate <= 0 || rate > 10000 || seen[r.from]) return null;
      seen[r.from] = true;
      return { from: r.from, rate: Math.round(rate * 100) / 100 };
    }).filter(Boolean).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
  }

  /** Stawka obowiązująca w danym dniu (YYYY-MM-DD); bez historii zwraca bieżący koszt godziny. */
  function rateOn(person, iso) {
    if (!person) return 0;
    var list = person.rates || [];
    var hit = null;
    list.forEach(function (r) { if (r.from <= iso && (!hit || r.from >= hit.from)) hit = r; });
    return hit ? hit.rate : (list.length ? 0 : Number(person.hourlyCost) || 0);
  }

  /** Dodaje stawkę od dnia `from` i przelicza bieżący koszt godziny. */
  function addRate(person, rate, from, today) {
    var value = Math.round(Number(rate) * 100) / 100;
    if (!Number.isFinite(value) || value <= 0 || value > 10000) return { ok: false, error: 'Podaj stawkę od 0,01 do 10 000 zł.' };
    if (!isDay(from)) return { ok: false, error: 'Podaj datę, od której stawka obowiązuje.' };
    var base = person.rates && person.rates.length ? person.rates : (Number(person.hourlyCost) > 0 ? [{ from: '1970-01-01', rate: Number(person.hourlyCost) }] : []);
    var rates = normalizeRates(base.filter(function (r) { return r.from !== from; }).concat([{ from: from, rate: value }]));
    var now = today || isoOf(new Date());
    var next = Object.assign({}, person, { rates: rates });
    next.hourlyCost = rateOn(next, now) || value;
    return { ok: true, person: next };
  }

  function activeManagers(people, exceptId) {
    return (people || []).filter(function (p) { return p.id !== exceptId && p.active !== false && p.orgRole === 'managing' && statusOf(p) !== 'disabled'; });
  }

  /** Zakłada konto: stan „czeka na pierwsze logowanie", hasło do zmiany. */
  function createAccount(person, by, now) {
    var at = (now || new Date()).toISOString();
    return Object.assign({}, person, { active: true, account: { status: 'invited', mustChange: true, createdAt: at, createdBy: by || '', lastLoginAt: '', passwordSetAt: at } });
  }

  function resetPassword(person, now) {
    var cur = person.account || { status: 'invited', createdAt: '', createdBy: '', lastLoginAt: '' };
    var at = (now || new Date()).toISOString();
    return Object.assign({}, person, { account: Object.assign({}, cur, { mustChange: true, passwordSetAt: at, status: cur.status === 'disabled' ? 'disabled' : cur.status }) });
  }

  /** Wyłącza konto (osoba zostaje w historii). Zwraca {ok, error?, people}. */
  function disable(people, id) {
    var person = (people || []).filter(function (p) { return p.id === id; })[0];
    if (!person) return { ok: false, error: 'Nie ma takiej osoby.', people: people };
    if (person.orgRole === 'managing' && statusOf(person) !== 'none' && activeManagers(people, id).filter(function (p) { return statusOf(p) !== 'none'; }).length === 0) {
      return { ok: false, error: 'To ostatnie aktywne konto dyrekcji. Najpierw nadaj tę rolę komuś innemu.', people: people };
    }
    return { ok: true, people: people.map(function (p) {
      return p.id === id ? Object.assign({}, p, { active: false, account: Object.assign({}, p.account || { createdAt: '', createdBy: '', lastLoginAt: '' }, { status: 'disabled' }) }) : p;
    }) };
  }

  function enable(people, id) {
    return people.map(function (p) {
      if (p.id !== id) return p;
      var acc = p.account || null;
      var status = acc && acc.lastLoginAt ? 'active' : 'invited';
      return Object.assign({}, p, { active: true, account: acc ? Object.assign({}, acc, { status: status }) : acc });
    });
  }

  /** Zmienia rolę; nie pozwala odebrać dyrekcji ostatniej aktywnej osobie. */
  function setRole(people, id, role) {
    var person = (people || []).filter(function (p) { return p.id === id; })[0];
    if (!person) return { ok: false, error: 'Nie ma takiej osoby.', people: people };
    if (role !== 'managing' && role !== 'member') return { ok: false, error: 'Nieznana rola.', people: people };
    if (person.orgRole === 'managing' && role !== 'managing' && activeManagers(people, id).length === 0) {
      return { ok: false, error: 'W biurze musi zostać co najmniej jedna aktywna osoba z dyrekcji.', people: people };
    }
    return { ok: true, people: people.map(function (p) { return p.id === id ? Object.assign({}, p, { orgRole: role }) : p; }) };
  }

  function normalizeAudit(raw) {
    return (Array.isArray(raw) ? raw : []).map(function (r) {
      if (!r || !ACTIONS[r.action] || !stamp(r.at)) return null;
      return { at: r.at, by: typeof r.by === 'string' ? r.by : '', action: r.action, target: typeof r.target === 'string' ? r.target : '', detail: typeof r.detail === 'string' ? r.detail.slice(0, 200) : '' };
    }).filter(Boolean).slice(-AUDIT_LIMIT);
  }

  function addAudit(log, entry, now) {
    return normalizeAudit((log || []).concat([{ at: (now || new Date()).toISOString(), by: entry.by || '', action: entry.action, target: entry.target || '', detail: entry.detail || '' }]));
  }

  var api = {
    STATUS: STATUS, ACTIONS: ACTIONS, generatePassword: generatePassword, validEmail: validEmail, normEmail: normEmail, emailTaken: emailTaken,
    statusOf: statusOf, normalizeAccount: normalizeAccount, normalizeRates: normalizeRates, rateOn: rateOn, addRate: addRate,
    createAccount: createAccount, resetPassword: resetPassword, disable: disable, enable: enable, setRole: setRole,
    normalizeAudit: normalizeAudit, addAudit: addAudit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Accounts = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
