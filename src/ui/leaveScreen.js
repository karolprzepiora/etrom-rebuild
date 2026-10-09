/* ETROM — ekran „Urlopy”: saldo i wnioski pracownika (karty lub kalendarz roczny), kalendarz zespołu
   i skrzynka akceptacji dla zarządu (decyzja) oraz liderów (opinia). Kolory z motywu: urlop = barwa
   „zatwierdzenia” (--review), oczekuje = ostrzeżenie, zaakceptowany = sukces, odrzucony = alarm.
   Dane i reguły: core/absences.js. Pracownik nie widzi cudzego salda ani rodzaju cudzej nieobecności. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;
  var A = E.Absences;
  var Cal = E.Calendar;

  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var MON_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  var DOW1 = ['P', 'W', 'Ś', 'C', 'P', 'S', 'N'];
  var STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' };

  function n2(n) { return n < 10 ? '0' + n : String(n); }
  function iso(y, m, d) { return y + '-' + n2(m + 1) + '-' + n2(d); }
  function days(n) { return E.Format.count(n, 'dzień', 'dni', 'dni'); }
  function workdays(n) { return E.Format.count(n, 'dzień roboczy', 'dni robocze', 'dni roboczych'); }

  /** „9–12 października”, „28 listopada – 2 grudnia”, z rokiem, gdy inny niż bieżący. */
  function range(from, to, now) {
    var a = Cal.parse(from);
    var b = Cal.parse(to);
    var yr = function (d) { return d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''; };
    if (from === to) return a.getDate() + ' ' + MONTHS_GEN[a.getMonth()] + yr(a);
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return a.getDate() + '–' + b.getDate() + ' ' + MONTHS_GEN[b.getMonth()] + yr(b);
    return a.getDate() + ' ' + MONTHS_GEN[a.getMonth()] + yr(a) + ' – ' + b.getDate() + ' ' + MONTHS_GEN[b.getMonth()] + yr(b);
  }

  function kindLabel(a) { return a.kind === 'leave' && a.onDemand ? 'Urlop na żądanie' : (A.KINDS[a.kind] || 'Nieobecność'); }

  function statusBadge(status) { return UI.badge(A.STATUS[status] || status, STATUS_TONE[status] || null); }

  function card(title, children, cls) {
    return D.el('section', { class: 'lv-card' + (cls ? ' ' + cls : '') }, [title ? D.el('h2', { class: 'lv-card__title', text: title }) : null].concat(children));
  }

  /* ---------- Mój urlop: karty ---------- */
  function balanceCard(bal) {
    var total = Math.max(1, bal.total);
    var u = Math.min(100, bal.used / total * 100);
    var p = Math.min(100 - u, bal.planned / total * 100);
    var ring = D.el('div', { class: 'lv-ring', style: { '--u': u.toFixed(1) + '%', '--up': (u + p).toFixed(1) + '%' }, attrs: { role: 'img', 'aria-label': 'Pozostało ' + bal.left + ' z ' + bal.total + ' dni urlopu' } }, [
      D.el('b', { text: String(bal.left) }), D.el('span', { text: 'dni zostało' })
    ]);
    var legend = D.el('ul', { class: 'lv-legend' }, [
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--used' }), D.el('span', { text: 'wykorzystano ' }), D.el('b', { text: String(bal.used) })]),
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--plan' }), D.el('span', { text: 'zaplanowano ' }), D.el('b', { text: String(bal.planned) })]),
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--free' }), D.el('span', { text: 'wymiar roczny ' }), D.el('b', { text: String(bal.total) })]),
      bal.pending ? D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--wait' }), D.el('span', { text: 'czeka na decyzję ' }), D.el('b', { text: String(bal.pending) })]) : null
    ]);
    function stat(value, label) { return D.el('div', { class: 'lv-stat' }, [D.el('b', { text: value }), D.el('span', { text: label })]); }
    return card('Urlop wypoczynkowy ' + bal.year, [
      D.el('div', { class: 'lv-balance' }, [ring, legend]),
      D.el('div', { class: 'lv-stats' }, [stat(bal.onDemandUsed + ' / ' + bal.onDemandLimit, 'na żądanie'), stat(days(bal.sick), 'zwolnienia'), stat(days(bal.training), 'szkolenia')])
    ], 'lv-card--balance');
  }

  function requestRow(a, ctx, now, who) {
    var people = ctx.people;
    var decider = a.decidedBy ? Team.findPerson(people, a.decidedBy) : null;
    var meta = [workdays(A.workdays(a))];
    if (a.status === 'pending') meta.push('czeka na decyzję zarządu');
    if (a.status === 'rejected' && a.decisionNote) meta.push('powód: ' + a.decisionNote);
    var by = decider && a.status !== 'pending' ? (a.status === 'rejected' ? 'Odrzucił: ' : 'Zatwierdził: ') + Team.fullName(decider) : '';
    var past = a.status === 'approved' && a.to < Cal.isoOf(now);
    return D.el('li', { class: 'lv-req', dataset: { id: a.id, status: a.status } }, [
      D.el('span', { class: 'lv-kind' }, [kindLabel(a)]),
      D.el('div', { class: 'lv-req__main' }, [
        D.el('b', { text: (who ? who + ' · ' : '') + range(a.from, a.to, now) }),
        D.el('span', { class: 't-meta', text: meta.join(' · ') })
      ]),
      by ? D.el('span', { class: 't-meta lv-req__by', text: by }) : null,
      past ? UI.badge('Wykorzystany', null) : statusBadge(a.status),
      a.status === 'pending' && ctx.mine ? UI.button({ label: 'Wycofaj', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'lv-withdraw' }, onClick: function () { ctx.actions.withdrawLeave(a.id); } }) : null
    ]);
  }

  function yearBars(list, person, year) {
    var perMonth = [];
    for (var m = 0; m < 12; m += 1) {
      var from = iso(year, m, 1);
      var to = iso(year, m, new Date(year, m + 1, 0).getDate());
      var sum = { done: 0, plan: 0 };
      list.forEach(function (a) {
        if (a.personId !== person.id || a.kind !== 'leave' || a.status === 'rejected') return;
        var f = a.from > from ? a.from : from; var t = a.to < to ? a.to : to;
        if (t < f) return;
        var n = Cal.workdaysIn(f, t);
        if (a.status === 'pending') sum.plan += n; else if (t < Cal.isoOf(new Date())) sum.done += n; else sum.plan += n;
      });
      perMonth.push(sum);
    }
    var max = Math.max(5, Math.max.apply(null, perMonth.map(function (x) { return x.done + x.plan; })));
    return D.el('div', { class: 'lv-year' }, perMonth.map(function (x, i) {
      var tip = MONTHS[i] + ': ' + (x.done + x.plan) + ' dni';
      return D.el('div', { class: 'lv-year__col', attrs: { 'data-tooltip': tip } }, [
        D.el('div', { class: 'lv-year__bar' }, [
          D.el('i', { class: 'lv-year__plan', style: { height: (x.plan / max * 100) + '%' } }),
          D.el('i', { class: 'lv-year__done', style: { height: (x.done / max * 100) + '%' } })
        ]),
        D.el('span', { text: MON_SHORT[i] })
      ]);
    }));
  }

  function mineCards(state, ctx, me, now) {
    var list = state.workspace.absences || [];
    var bal = A.balance(list, me, now);
    var mine = list.filter(function (a) { return a.personId === me.id; }).sort(function (a, b) { return a.from < b.from ? 1 : -1; });
    var rows = mine.length
      ? D.el('ul', { class: 'lv-reqs' }, mine.map(function (a) { return requestRow(a, { people: ctx.people, actions: ctx.actions, mine: true }, now); }))
      : D.el('p', { class: 't-meta', text: 'Nie ma jeszcze żadnych wniosków. Wybierz „Złóż wniosek”.' });
    return D.el('div', { class: 'lv-grid' }, [
      balanceCard(bal),
      D.el('div', { class: 'lv-col' }, [card('Moje wnioski', [rows]), card('Rok w skrócie', [yearBars(list, me, bal.year)])])
    ]);
  }

  /* ---------- Mój urlop: kalendarz roczny ---------- */
  /** Miesiąc w siatce 7 kolumn. dayFn(key) zwraca { cls, tip, disabled, pressed, onClick } — wspólny wygląd Urlopów i Kalendarza. */
  function miniMonth(year, m, dayFn, today, titleExtra) {
    var first = new Date(year, m, 1);
    var count = new Date(year, m + 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < (first.getDay() + 6) % 7; i += 1) cells.push(D.el('span', { class: 'lv-day lv-day--blank' }));
    for (var d = 1; d <= count; d += 1) {
      (function (day) {
        var key = iso(year, m, day);
        var wk = Cal.isWeekend(key);
        var hol = Cal.holidayName(key);
        var info = dayFn(key, wk, hol) || {};
        var cls = 'lv-day' + (wk ? ' is-weekend' : '') + (hol ? ' is-holiday' : '') + (key === today ? ' is-today' : '') + (info.cls ? ' ' + info.cls : '');
        cells.push(D.el('button', {
          class: cls, text: String(day), style: info.style || null,
          attrs: { type: 'button', 'data-day': key, 'data-tooltip': info.tip || hol || null, 'aria-pressed': info.pressed ? 'true' : 'false', disabled: !!info.disabled },
          on: { click: function () { if (info.onClick) info.onClick(key); } }
        }));
      })(d);
    }
    return D.el('section', { class: 'lv-month' }, [
      D.el('h3', null, [MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1), titleExtra || null]),
      D.el('div', { class: 'lv-dow' }, DOW1.map(function (x) { return D.el('span', { text: x }); })),
      D.el('div', { class: 'lv-days' }, cells)
    ]);
  }

  function monthCard(year, m, ctx, mine, sel, today) {
    return miniMonth(year, m, function (key, wk, hol) {
      var rec = mine.filter(function (a) { return a.from <= key && a.to >= key && a.status !== 'rejected'; })[0];
      var inSel = sel && sel.from && key >= sel.from && key <= (sel.to || sel.from);
      var cls = '';
      if (rec && !wk && !hol) cls += rec.status === 'pending' ? ' is-pending' : (rec.kind === 'leave' ? ' is-leave' : ' is-other');
      if (inSel && !wk && !hol) cls += ' is-selected';
      return { cls: cls.trim(), tip: hol || (rec ? kindLabel(rec) + ' · ' + A.STATUS[rec.status].toLowerCase() : ''), pressed: inSel, disabled: wk || !!hol || !!rec, onClick: function (k) { ctx.actions.pickLeaveDay(k); } };
    }, today);
  }

  function yearCalendar(state, ctx, me, now) {
    var lv = state.leave || {};
    var year = Number(lv.year) || now.getFullYear();
    var list = state.workspace.absences || [];
    var mine = list.filter(function (a) { return a.personId === me.id; });
    var sel = lv.sel || null;
    var bal = A.balance(list, me, new Date(year, 5, 15));
    var months = [];
    for (var m = 0; m < 12; m += 1) months.push(monthCard(year, m, ctx, mine, sel, Cal.isoOf(now)));
    var bar;
    if (sel && sel.from) {
      var to = sel.to || sel.from;
      var n = Cal.workdaysIn(sel.from, to);
      var after = bal.free - n;
      bar = D.el('div', { class: 'lv-selbar', attrs: { role: 'status' } }, [
        D.el('b', { text: range(sel.from, to, now) }),
        D.el('span', { text: workdays(n) + (after >= 0 ? ' · po wniosku zostanie ' + days(after) : ' · brakuje ' + days(-after)) }),
        UI.button({ label: 'Złóż wniosek', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'lv-sel-request' }, onClick: function () { ctx.actions.openLeaveRequest({ from: sel.from, to: to, kind: 'leave' }); } }),
        UI.button({ label: 'Anuluj', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.setLeave({ sel: null }); } })
      ]);
    } else {
      bar = D.el('p', { class: 't-meta lv-selbar lv-selbar--hint', text: 'Kliknij pierwszy i ostatni dzień urlopu. Do wykorzystania: ' + days(Math.max(0, bal.free)) + ' z ' + bal.total + '.' });
    }
    var yearNav = D.el('div', { class: 'lv-yearnav' }, [
      UI.iconButton ? UI.iconButton({ icon: 'chevronLeft', label: 'Poprzedni rok', onClick: function () { ctx.actions.setLeave({ year: year - 1, sel: null }); } }) : null,
      D.el('b', { text: String(year) }),
      UI.iconButton ? UI.iconButton({ icon: 'chevronRight', label: 'Następny rok', onClick: function () { ctx.actions.setLeave({ year: year + 1, sel: null }); } }) : null
    ]);
    var legend = D.el('ul', { class: 'lv-legend lv-legend--row' }, [
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--used' }), D.el('span', { text: 'urlop' })]),
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--wait' }), D.el('span', { text: 'czeka na decyzję' })]),
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--other' }), D.el('span', { text: 'zwolnienie, szkolenie' })]),
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--holiday' }), D.el('span', { text: 'święto' })])
    ]);
    return D.el('div', { class: 'lv-yearcal' }, [yearNav, D.el('div', { class: 'lv-months' }, months), D.el('div', { class: 'lv-foot' }, [legend, bar])]);
  }

  /* ---------- Kalendarz zespołu: miesiąc, osoby w wierszach ---------- */
  /** Tabela osoby × dni. cellFn(person, key, off) zwraca { cls, tip }; extraRows: [{ label, cellFn(key, off) -> { cls, tip, text, style } }]. */
  function teamTable(year, m, people, cellFn, now, extraRows) {
    var count = new Date(year, m + 1, 0).getDate();
    var today = Cal.isoOf(now);
    var head = [D.el('span', { class: 'lv-t__name' })];
    for (var d = 1; d <= count; d += 1) {
      var key = iso(year, m, d);
      head.push(D.el('span', { class: 'lv-t__d' + (Cal.isWeekend(key) ? ' is-weekend' : '') + (Cal.isHoliday(key) ? ' is-holiday' : '') + (key === today ? ' is-today' : ''), text: String(d) }));
    }
    var rows = people.map(function (p) {
      var cells = [D.el('span', { class: 'lv-t__name' }, [E.Avatar.avatar(p, { size: 'sm' }), D.el('span', { class: 'truncate', text: Team.fullName(p) })])];
      for (var day = 1; day <= count; day += 1) {
        var k = iso(year, m, day);
        var off = Cal.isWeekend(k) || Cal.isHoliday(k);
        var info = cellFn(p, k, off) || {};
        cells.push(D.el('span', { class: 'lv-t__c' + (off ? ' is-weekend' : '') + (info.cls ? ' ' + info.cls : ''), attrs: { 'data-tooltip': info.tip || null } }));
      }
      return D.el('div', { class: 'lv-t__row' }, cells);
    });
    (extraRows || []).forEach(function (row) {
      var cells = [D.el('span', { class: 'lv-t__name lv-t__name--sum', text: row.label })];
      for (var day = 1; day <= count; day += 1) {
        var k = iso(year, m, day);
        var off = Cal.isWeekend(k) || Cal.isHoliday(k);
        var info = row.cellFn(k, off) || {};
        cells.push(D.el('span', { class: 'lv-t__c lv-t__c--sum' + (off ? ' is-weekend' : '') + (info.cls ? ' ' + info.cls : ''), style: info.style || null, text: info.text || '', attrs: { 'data-tooltip': info.tip || null } }));
      }
      rows.push(D.el('div', { class: 'lv-t__row lv-t__row--sum' }, cells));
    });
    return D.el('div', { class: 'lv-t', style: { '--days': String(count) } }, [D.el('div', { class: 'lv-t__row lv-t__row--head' }, head)].concat(rows));
  }

  function teamCalendar(state, ctx, me, now) {
    var lv = state.leave || {};
    var off = Number(lv.monthOffset) || 0;
    var base = new Date(now.getFullYear(), now.getMonth() + off, 1);
    var year = base.getFullYear();
    var m = base.getMonth();
    var people = ctx.people.filter(function (p) { return p.active !== false; });
    var all = state.workspace.absences || [];
    var projects = state.workspace.projects || [];
    var mode = (state.workspace.settings || {}).absenceVisibility;
    var management = E.Budget.isManagement(me.id, ctx.people);
    var table = teamTable(year, m, people, function (p, k, wk) {
      var rec = all.filter(function (a) { return a.personId === p.id && a.from <= k && a.to >= k && a.status !== 'rejected'; })[0];
      if (!rec || wk) return null;
      var seen = rec.status === 'pending' ? (A.canSee(me.id, rec, projects, ctx.people) ? 'full' : null) : A.peek(me.id, rec, projects, ctx.people, mode);
      if (!seen) return null;
      var detail = seen === 'full' ? kindLabel(rec) + (rec.status === 'pending' ? ' (czeka na decyzję)' : '') : 'Nieobecność';
      return { cls: rec.status === 'pending' ? 'is-pending' : 'is-away', tip: Team.fullName(p) + ' · ' + detail };
    }, now);
    var nav = D.el('div', { class: 'lv-yearnav' }, [
      UI.iconButton ? UI.iconButton({ icon: 'chevronLeft', label: 'Poprzedni miesiąc', onClick: function () { ctx.actions.setLeave({ monthOffset: off - 1 }); } }) : null,
      D.el('b', { text: MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1) + ' ' + year }),
      UI.iconButton ? UI.iconButton({ icon: 'chevronRight', label: 'Następny miesiąc', onClick: function () { ctx.actions.setLeave({ monthOffset: off + 1 }); } }) : null,
      off ? UI.button({ label: 'Ten miesiąc', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.setLeave({ monthOffset: 0 }); } }) : null
    ]);
    return D.el('div', { class: 'lv-team' }, [nav, table,
      D.el('p', { class: 't-meta', text: management || mode === 'kind' ? 'Widzisz rodzaj nieobecności' + (management ? ' i wnioski oczekujące.' : '.') : (mode === 'own' ? 'Widzisz tylko własne nieobecności.' : 'Widzisz, kto jest nieobecny, bez rodzaju nieobecności.') })]);
  }

  /* ---------- Skrzynka akceptacji ---------- */
  function impactList(items) {
    return D.el('ul', { class: 'lv-impact' }, items.map(function (x) { return D.el('li', { class: 'is-' + x.tone }, [D.el('i', { class: 'lv-dot lv-dot--' + x.tone }), D.el('span', { text: x.text })]); }));
  }

  function inboxCard(a, state, ctx, me, now, management) {
    var person = Team.findPerson(ctx.people, a.personId);
    var projects = state.workspace.projects || [];
    var bal = A.balance(state.workspace.absences || [], person, new Date(a.from + 'T12:00:00'));
    var leader = A.isLeaderOf(me.id, a, projects);
    var after = a.kind === 'leave' ? bal.left - A.workdays(a) : null;
    var impact = A.impact(a, { projects: projects, people: ctx.people, absences: state.workspace.absences || [] });
    var note = UI.input({ id: 'lv-note-' + a.id, placeholder: management ? 'Powód odrzucenia lub uwaga (opcjonalnie)' : 'Uwaga do opinii (opcjonalnie)', maxlength: 200 });
    var opinions = (a.opinions || []).map(function (o) {
      var by = Team.findPerson(ctx.people, o.by);
      return D.el('li', { class: 'lv-opinion is-' + o.verdict }, [D.el('b', { text: (by ? Team.fullName(by) : 'Lider') + ': ' }), D.el('span', { text: A.VERDICTS[o.verdict] + (o.note ? ' · ' + o.note : '') })]);
    });
    var actions = [];
    if (management) {
      actions.push(UI.button({ label: 'Zaakceptuj', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'lv-approve' }, onClick: function () { ctx.actions.decideLeave(a.id, 'approve', note.value); } }));
      actions.push(UI.button({ label: 'Odrzuć', size: 'sm', attrs: { 'data-fk': 'lv-reject' }, onClick: function () { ctx.actions.decideLeave(a.id, 'reject', note.value); } }));
    }
    if (leader && !management) {
      actions.push(UI.button({ label: 'Bez zastrzeżeń', size: 'sm', attrs: { 'data-fk': 'lv-op-ok' }, onClick: function () { ctx.actions.opinionLeave(a.id, 'ok', note.value); } }));
      actions.push(UI.button({ label: 'Mam zastrzeżenia', size: 'sm', attrs: { 'data-fk': 'lv-op-concern' }, onClick: function () { ctx.actions.opinionLeave(a.id, 'concern', note.value); } }));
    }
    if (leader && management) {
      actions.push(UI.button({ label: 'Opinia lidera: bez zastrzeżeń', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.opinionLeave(a.id, 'ok', note.value); } }));
    }
    return D.el('li', { class: 'lv-inbox', dataset: { id: a.id } }, [
      person ? E.Avatar.avatar(person, { size: 'md' }) : null,
      D.el('div', { class: 'lv-inbox__main' }, [
        D.el('div', { class: 'lv-inbox__head' }, [
          D.el('b', { text: person ? Team.fullName(person) : 'Osoba' }),
          D.el('span', { class: 'lv-kind', text: kindLabel(a) }),
          D.el('b', { text: range(a.from, a.to, now) }),
          D.el('span', { class: 't-meta', text: workdays(A.workdays(a)) + (after !== null ? ' · po wniosku zostanie ' + days(Math.max(0, after)) + (after < 0 ? ' (brakuje ' + days(-after) + ')' : '') : '') })
        ]),
        D.el('div', { class: 'lv-impactbox' }, [D.el('span', { class: 'lv-impactbox__t', text: 'WPŁYW NA PLAN' }), impactList(impact)]),
        a.note ? D.el('p', { class: 't-meta', text: 'Uwaga pracownika: ' + a.note }) : null,
        opinions.length ? D.el('ul', { class: 'lv-opinions' }, opinions) : null,
        actions.length ? D.el('div', { class: 'lv-inbox__actions' }, [note].concat(actions)) : null
      ])
    ]);
  }

  function inbox(state, ctx, me, now) {
    var management = E.Budget.isManagement(me.id, ctx.people);
    var projects = state.workspace.projects || [];
    var all = state.workspace.absences || [];
    var visible = all.filter(function (a) { return a.personId !== me.id && A.canSee(me.id, a, projects, ctx.people); });
    var pending = visible.filter(function (a) { return a.status === 'pending'; }).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    var cutoff = Cal.addDays ? Cal.isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45)) : '';
    var decided = visible.filter(function (a) { return a.status !== 'pending' && a.decidedAt && a.decidedAt.slice(0, 10) >= cutoff; }).sort(function (a, b) { return a.decidedAt < b.decidedAt ? 1 : -1; });
    var list = pending.length
      ? D.el('ul', { class: 'lv-inboxes' }, pending.map(function (a) { return inboxCard(a, state, ctx, me, now, management); }))
      : D.el('p', { class: 't-meta', text: 'Brak wniosków czekających na decyzję.' });
    var done = decided.length
      ? card('Rozpatrzone w ostatnich tygodniach', [D.el('ul', { class: 'lv-reqs' }, decided.map(function (a) { var p = Team.findPerson(ctx.people, a.personId); return requestRow(a, { people: ctx.people, actions: ctx.actions, mine: false }, now, p ? Team.fullName(p) : ''); }))])
      : null;
    return D.el('div', { class: 'lv-col' }, [list, done]);
  }

  /* ---------- Formularz wniosku ---------- */
  function requestForm(draft, errors, handlers, info) {
    var v = draft || {};
    var problems = errors || {};
    var kind = UI.select({ id: 'lv-kind', value: v.kind || 'leave', options: Object.keys(A.KINDS).map(function (k) { return { value: k, label: A.KINDS[k] }; }) });
    var from = UI.input({ id: 'lv-from', type: 'date', value: v.from || '', error: problems.from });
    var to = UI.input({ id: 'lv-to', type: 'date', value: v.to || '', error: problems.to });
    var onDemand = UI.checkbox({ id: 'lv-ondemand', label: 'Urlop na żądanie', hint: 'Limit ' + A.ON_DEMAND_LIMIT + ' dni w roku. Pozostało: ' + Math.max(0, info.onDemandLeft), checked: v.onDemand === true });
    var note = UI.input({ id: 'lv-note', value: v.note || '', maxlength: 200, placeholder: 'np. wyjazd rodzinny' });
    var count = D.el('p', { class: 't-meta', attrs: { 'data-fk': 'lv-days', 'aria-live': 'polite' } });
    function recount() {
      onDemand.hidden = kind.value !== 'leave';
      if (!from.value || !to.value) { count.textContent = ''; return; }
      var n = Cal.workdaysIn(from.value, to.value);
      var left = info.free - n;
      count.textContent = workdays(n) + ' (bez weekendów i świąt)' + (kind.value === 'leave' ? (left >= 0 ? ' · po wniosku zostanie ' + days(left) : ' · brakuje ' + days(-left)) : '');
    }
    from.addEventListener('change', function () { if (!to.value || to.value < from.value) to.value = from.value; recount(); });
    to.addEventListener('change', recount);
    kind.addEventListener('change', recount);
    recount();
    var form = E.Dialog.drawerForm({
      id: 'leave-form',
      submitLabel: info.auto ? 'Zapisz urlop' : 'Złóż wniosek',
      onCancel: handlers.onCancel,
      onSubmit: function () { handlers.onSubmit({ from: from.value, to: to.value, kind: kind.value, note: note.value, onDemand: kind.value === 'leave' && onDemand.querySelector('input').checked }); },
      body: [
        UI.field({ id: 'lv-kind', label: 'Rodzaj', control: kind, error: problems.kind }),
        D.el('div', { class: 'form__row' }, [UI.field({ id: 'lv-from', label: 'Od', control: from, error: problems.from }), UI.field({ id: 'lv-to', label: 'Do (włącznie)', control: to, error: problems.to })]),
        count,
        problems.onDemand ? D.el('p', { class: 'field__error', text: problems.onDemand }) : null,
        onDemand,
        UI.field({ id: 'lv-note', label: 'Uwaga', optional: true, control: note })
      ]
    });
    window.setTimeout(function () { from.focus(); }, 0);
    return form;
  }

  /* ---------- Ekran ---------- */
  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    if (!me) return { summary: 'Urlopy i nieobecności zespołu.', body: E.Welcome.card(state, ctx, 'Urlopy pokazują Twoje saldo i wnioski. Wybierz, kim jesteś.') };
    var now = new Date();
    var lv = state.leave || {};
    var projects = state.workspace.projects || [];
    var management = E.Budget.isManagement(me.id, people);
    var leader = projects.some(function (p) { return p.team && p.team.leader === me.id; });
    var canInbox = management || leader;
    var tab = lv.tab === 'team' || (lv.tab === 'inbox' && canInbox) ? lv.tab : 'mine';
    var pendingN = pendingFor(state, me);
    var vctx = { people: people, actions: ctx.actions };

    var tabs = UI.segmented({
      label: 'Widok urlopów', value: tab,
      items: [{ value: 'mine', label: 'Mój urlop' }, { value: 'team', label: 'Kalendarz zespołu' }].concat(canInbox ? [{ value: 'inbox', label: 'Do akceptacji' + (pendingN ? ' · ' + pendingN : '') }] : []),
      onChange: function (value) { ctx.actions.setLeave({ tab: value }); }
    });
    var sub = tab === 'mine' ? UI.segmented({
      label: 'Sposób pokazania', value: lv.view === 'year' ? 'year' : 'cards',
      items: [{ value: 'cards', label: 'Karty' }, { value: 'year', label: 'Kalendarz roczny' }],
      onChange: function (value) { ctx.actions.setLeave({ view: value, sel: null }); }
    }) : null;
    var toolbar = D.el('div', { class: 'lv-bar' }, [tabs.node, sub ? sub.node : null, D.el('span', { class: 'lv-bar__fill' }), UI.button({ label: management ? 'Dodaj urlop' : 'Złóż wniosek', variant: 'primary', icon: 'plus', attrs: { 'data-fk': 'lv-new' }, onClick: function () { ctx.actions.openLeaveRequest({ kind: 'leave' }); } })]);

    var content = tab === 'team' ? teamCalendar(state, vctx, me, now)
      : tab === 'inbox' ? inbox(state, vctx, me, now)
      : (lv.view === 'year' ? yearCalendar(state, vctx, me, now) : mineCards(state, vctx, me, now));
    var bal = A.balance(state.workspace.absences || [], me, now);
    return { summary: 'Do wykorzystania w ' + bal.year + ' roku: ' + days(bal.left) + ' z ' + bal.total + '.', body: D.el('div', { class: 'lv' }, [toolbar, content]) };
  }

  /** Liczba wniosków czekających na decyzję lub opinię osoby (do licznika w menu). */
  function pendingFor(state, me) {
    if (!me) return 0;
    var people = state.workspace.people || [];
    var projects = state.workspace.projects || [];
    var management = E.Budget.isManagement(me.id, people);
    return (state.workspace.absences || []).filter(function (a) {
      if (a.status !== 'pending' || a.personId === me.id) return false;
      if (management) return true;
      return A.isLeaderOf(me.id, a, projects) && !(a.opinions || []).some(function (o) { return o.by === me.id; });
    }).length;
  }

  E.LeaveScreen = { miniMonth: miniMonth, teamTable: teamTable, kindLabel: kindLabel, view: view, requestForm: requestForm, pendingFor: pendingFor, range: range };
})(typeof globalThis !== 'undefined' ? globalThis : this);
