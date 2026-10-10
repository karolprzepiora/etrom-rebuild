/* ETROM — karta urlopowa: zestawienie urlopów osoby w roku (wydruk i CSV) oraz zbiorcze dla zespołu.
   Czyste funkcje, bez DOM. Zwolnienia lekarskie (L4) są wykazane tylko liczbą dni, bez dat i uwag. */
(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var A = node ? require('./absences.js') : root.ETROM.Absences;
  var Cal = node ? require('./calendar.js') : root.ETROM.Calendar;
  var Team = node ? require('./team.js') : root.ETROM.Team;

  var STATUS = { approved: 'zatwierdzony', pending: 'czeka na decyzję' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dmy(iso) { return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /** Karta jednej osoby za rok. */
  function build(list, person, year, now) {
    var ref = year === now.getFullYear() ? now : (year < now.getFullYear() ? new Date(year, 11, 31, 12) : new Date(year, 0, 1, 12));
    var bal = A.balance(list, person, ref);
    var rows = (list || []).filter(function (a) {
      return a.personId === person.id && A.isLeaveKind(a.kind) && (a.status === 'approved' || a.status === 'pending') && a.from.slice(0, 4) <= String(year) && a.to.slice(0, 4) >= String(year);
    }).sort(function (a, b) { return a.from < b.from ? -1 : 1; }).map(function (a) {
      var from = a.from < year + '-01-01' ? year + '-01-01' : a.from;
      var to = a.to > year + '-12-31' ? year + '-12-31' : a.to;
      return { from: a.from, to: a.to, kind: A.KINDS[a.kind] || 'Urlop', days: Cal.workdaysIn(from, to), status: STATUS[a.status] || a.status, onDemand: !!a.onDemand, note: a.note || '' };
    });
    return {
      year: year, name: Team.fullName(person), entitlement: bal.entitlement, carry: bal.carry, total: bal.total,
      used: bal.used, planned: bal.planned, pending: bal.pending, left: bal.left, onDemand: bal.onDemandUsed, sick: bal.sick, rows: rows
    };
  }

  /** Zbiorczo dla zespołu: jeden wiersz na osobę. */
  function team(list, people, year, now) {
    return (people || []).filter(function (p) { return p.active !== false; }).map(function (p) { return build(list, p, year, now); });
  }

  function csvRows(card, meta) {
    var m = meta || {};
    var out = [
      ['Karta urlopowa ' + card.year, card.name],
      ['Wymiar', card.entitlement], ['Urlop zaległy', card.carry], ['Razem do wykorzystania', card.total],
      ['Wykorzystano', card.used], ['Zaplanowano', card.planned], ['Czeka na decyzję', card.pending], ['Pozostało', card.left],
      ['Na żądanie', card.onDemand], ['Zwolnienia lekarskie (dni)', card.sick], [],
      ['Od', 'Do', 'Rodzaj', 'Dni robocze', 'Status', 'Na żądanie', 'Uwaga']
    ];
    card.rows.forEach(function (r) { out.push([dmy(r.from), dmy(r.to), r.kind, r.days, r.status, r.onDemand ? 'tak' : '', r.note]); });
    if (m.generatedAt) out.push([], ['Wygenerowano', m.generatedAt]);
    return out;
  }

  function teamCsvRows(cards, year) {
    var out = [['Zestawienie urlopów ' + year], [], ['Osoba', 'Wymiar', 'Zaległy', 'Razem', 'Wykorzystano', 'Zaplanowano', 'Czeka', 'Pozostało', 'Na żądanie', 'L4 (dni)']];
    cards.forEach(function (c) { out.push([c.name, c.entitlement, c.carry, c.total, c.used, c.planned, c.pending, c.left, c.onDemand, c.sick]); });
    return out;
  }

  var CSS = '@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:11px/1.35 "Segoe UI",Arial,sans-serif;color:#111;margin:0}'
    + 'h1{font-size:17px;margin:0 0 2px}h2{font-size:12px;font-weight:500;margin:0 0 10px;color:#444}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #888;padding:2px 5px;text-align:center}th{background:#eee;font-weight:600}'
    + 'td.l{text-align:left}tr.sum td{background:#eee;font-weight:600}.sign{display:flex;justify-content:space-between;margin-top:34px}'
    + '.sign span{width:42%;border-top:1px solid #444;padding-top:3px;text-align:center;color:#444}.basis{color:#444;margin:8px 0 0;font-size:10px}'
    + '@media screen{body{padding:18px;max-width:820px;margin:0 auto}}';

  function wrap(title, body, m) {
    return '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>' + body
      + (m && m.generatedAt ? '<p class="basis">Wygenerowano ' + esc(m.generatedAt) + '.</p>' : '')
      + (m && m.autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});</script>' : '')
      + '</body></html>';
  }

  function html(card, meta) {
    var m = meta || {};
    var sum = '<table><thead><tr><th>Wymiar</th><th>Zaległy</th><th>Razem</th><th>Wykorzystano</th><th>Zaplanowano</th><th>Czeka</th><th>Pozostało</th><th>Na żądanie</th><th>L4 (dni)</th></tr></thead><tbody><tr>'
      + [card.entitlement, card.carry, card.total, card.used, card.planned, card.pending, card.left, card.onDemand, card.sick].map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr></tbody></table>';
    var rows = card.rows.map(function (r) {
      return '<tr><td>' + dmy(r.from) + '</td><td>' + dmy(r.to) + '</td><td class="l">' + esc(r.kind + (r.onDemand ? ' (na żądanie)' : '')) + '</td><td>' + r.days + '</td><td>' + esc(r.status) + '</td><td class="l">' + esc(r.note) + '</td></tr>';
    }).join('') || '<tr><td colspan="6">Brak urlopów w tym roku.</td></tr>';
    var body = '<h1>Karta urlopowa ' + card.year + '</h1><h2>' + esc(card.name) + (m.employer ? ' · ' + esc(m.employer) : '') + '</h2>' + sum
      + '<table><thead><tr><th>Od</th><th>Do</th><th>Rodzaj</th><th>Dni robocze</th><th>Status</th><th>Uwaga</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<p class="basis">Zwolnienia lekarskie wykazano wyłącznie liczbą dni. Dni robocze bez weekendów i świąt.</p>'
      + '<div class="sign"><span>podpis pracownika</span><span>podpis pracodawcy</span></div>';
    return wrap('Karta urlopowa ' + card.year + ' – ' + card.name, body, m);
  }

  function teamHtml(cards, year, meta) {
    var rows = cards.map(function (c) {
      return '<tr><td class="l">' + esc(c.name) + '</td>' + [c.entitlement, c.carry, c.total, c.used, c.planned, c.pending, c.left, c.onDemand, c.sick].map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr>';
    }).join('');
    var body = '<h1>Zestawienie urlopów ' + year + '</h1><h2>Wszystkie osoby</h2><table><thead><tr><th>Osoba</th><th>Wymiar</th><th>Zaległy</th><th>Razem</th><th>Wykorzystano</th><th>Zaplanowano</th><th>Czeka</th><th>Pozostało</th><th>Na żądanie</th><th>L4 (dni)</th></tr></thead><tbody>' + rows + '</tbody></table>';
    return wrap('Zestawienie urlopów ' + year, body, meta);
  }

  var api = { build: build, team: team, csvRows: csvRows, teamCsvRows: teamCsvRows, html: html, teamHtml: teamHtml };
  if (node) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.LeaveCard = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
