/* ETROM — ekran „Urlopy”: jedna zakładka z kalendarzem w kaflach (jak w Czasie), saldo, własne wnioski oraz
   „Do akceptacji” dla zarządu (decyzja) i liderów (opinia). Przełącznik Ja / Zespół: w widoku zespołu każdy widzi
   urlopy i wnioski kolegów (L4 innych jako „nieobecność”). Dane i reguły: core/absences.js. Cudzego salda nie widać. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;
  var A = E.Absences;
  var Cal = E.Calendar;
  var CB = E.CalBars;

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
    return D.el('section', { class: 'an-card lv-card' + (cls ? ' ' + cls : '') }, [title ? D.el('h2', { class: 'lv-card__title', text: title }) : null].concat(children));
  }

  /* ---------- Mój urlop: karty ---------- */
  function requestRow(a, ctx, now, who) {
    var people = ctx.people;
    var decider = a.decidedBy ? Team.findPerson(people, a.decidedBy) : null;
    var meta = [workdays(A.workdays(a))];
    if (a.status === 'pending') meta.push('czeka na decyzję zarządu');
    if (a.cancelRequest) meta.push('prośba o anulowanie czeka na decyzję');
    if (a.status === 'rejected' && a.decisionNote) meta.push('powód: ' + a.decisionNote);
    var by = decider && a.status !== 'pending' ? (a.status === 'rejected' ? 'Odrzucił: ' : 'Zatwierdził: ') + Team.fullName(decider) : '';
    var past = a.status === 'approved' && a.to < Cal.isoOf(now);
    return D.el('li', { class: 'lv-req', dataset: { id: a.id, status: a.status } }, [
      D.el('span', { class: 'lv-kind' }, [kindLabel(a)]),
      D.el(ctx.mine ? 'button' : 'div', { class: 'lv-req__main' + (ctx.mine ? ' is-link' : ''), attrs: ctx.mine ? { type: 'button', 'data-fk': 'lv-req-open', 'aria-label': 'Szczegóły: ' + range(a.from, a.to, now) } : {}, on: ctx.mine ? { click: function () { openDetail(a, ctx, now); } } : null }, [
        D.el('b', { text: (who ? who + ' · ' : '') + range(a.from, a.to, now) }),
        D.el('span', { class: 't-meta', text: meta.join(' · ') })
      ]),
      by ? D.el('span', { class: 't-meta lv-req__by', text: by }) : null,
      past ? UI.badge('Wykorzystany', null) : statusBadge(a.status),
      a.status === 'pending' && ctx.mine ? UI.button({ label: 'Wycofaj', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'lv-withdraw' }, onClick: function () { ctx.actions.withdrawLeave(a.id); } }) : null
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
    function recAt(key) { return mine.filter(function (a) { return a.from <= key && a.to >= key && a.status !== 'rejected'; })[0]; }
    function kindAt(key) {
      var rec = recAt(key);
      return rec && !Cal.isWeekend(key) && !Cal.holidayName(key) ? CB.kindOf(rec.kind, rec.status === 'pending') : null;
    }
    return miniMonth(year, m, function (key, wk, hol) {
      var rec = recAt(key);
      var inSel = sel && sel.from && key >= sel.from && key <= (sel.to || sel.from);
      var cls = CB.stripCls(kindAt, key);
      if (inSel && !wk && !hol) cls += ' is-selected';
      var bo = !wk && !hol && !rec ? A.blackoutAt(ctx.blackouts, key, key) : null;
      if (bo) cls += ' is-closed';
      return { cls: cls.trim(), tip: hol || (bo ? 'Okres zamknięty dla urlopów' + (bo.note ? ': ' + bo.note : '') : '') || (rec ? kindLabel(rec) + ' · ' + A.STATUS[rec.status].toLowerCase() + ' (kliknij, by zobaczyć szczegóły)' : ''), pressed: inSel, disabled: wk || !!hol || (!!bo && !ctx.management), onClick: function (k) { if (rec) openDetail(rec, ctx, ctx.now); else ctx.actions.pickLeaveDay(k); } };
    }, today);
  }

  function selBar(state, ctx, me, now, year) {
    var lv = state.leave || {};
    var sel = lv.sel || null;
    var bal = A.balance(state.workspace.absences || [], me, new Date(year, 5, 15));
    if (sel && sel.from) {
      var to = sel.to || sel.from;
      var n = Cal.workdaysIn(sel.from, to);
      var after = bal.free - n;
      return D.el('div', { class: 'lv-selbar', attrs: { role: 'status' } }, [
        D.el('b', { text: range(sel.from, to, now) }),
        D.el('span', { text: workdays(n) + (after >= 0 ? ' · po wniosku zostanie ' + days(after) : ' · brakuje ' + days(-after)) }),
        UI.button({ label: 'Złóż wniosek', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'lv-sel-request' }, onClick: function () { ctx.actions.openLeaveRequest({ from: sel.from, to: to, kind: 'leave' }); } }),
        UI.button({ label: 'Anuluj', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.setLeave({ sel: null }); } })
      ]);
    }
    return D.el('p', { class: 't-meta lv-selbar lv-selbar--hint', text: 'Kliknij pierwszy i ostatni dzień urlopu. Do wykorzystania: ' + days(Math.max(0, bal.free)) + ' z ' + bal.total + '.' });
  }

  /** Lista osób nieobecnych (i z wnioskami) w wybranym dniu – panel boczny. */
  function openDay(key, away, ctx) {
    var rows = away.map(function (x) {
      var pend = x.rec.status === 'pending';
      var what = x.seen === 'who' ? 'nieobecność' : kindLabel(x.rec);
      return D.el('li', { class: 'lv-dayrow' + (pend ? ' is-pend' : '') }, [
        D.el('b', { text: Team.fullName(x.person) }),
        D.el('span', { class: 't-meta', text: what + (pend ? ' · wniosek czeka na decyzję' : '') + ' · ' + range(x.rec.from, x.rec.to, ctx.now) })
      ]);
    });
    E.Dialog.openDrawer({ title: range(key, key, ctx.now), subtitle: away.length + ' ' + E.Format.count(away.length, 'osoba', 'osoby', 'osób') + ' z urlopem lub wnioskiem', content: D.el('ul', { class: 'lv-daylist', attrs: { 'data-fk': 'lv-daylist' } }, rows) });
  }

  /** Rok: własny (wybór dni) albo zespołu (ile osób nieobecnych w dniu). */
  function yearCalendar(state, ctx, me, now, who) {
    var lv = state.leave || {};
    var year = Number(lv.year) || now.getFullYear();
    var list = state.workspace.absences || [];
    var months = [];
    if (who === 'team') {
      var projects = state.workspace.projects || [];
      var active = ctx.people.filter(function (p) { return p.active !== false; });
      for (var t = 0; t < 12; t += 1) {
        months.push(miniMonth(year, t, function (key, wk, hol) {
          if (wk || hol) return null;
          var away = awayOn(list, active, key, me, projects, ctx.people);
          var n = away.filter(function (x) { return x.rec.status !== 'pending'; }).length;
          var pn = away.length - n;
          if (!n && !pn) return null;
          var tip = (n ? n + ' ' + E.Format.count(n, 'osoba nieobecna', 'osoby nieobecne', 'osób nieobecnych') : '') + (pn ? (n ? ' · ' : '') + pn + ' ' + E.Format.count(pn, 'wniosek czeka', 'wnioski czekają', 'wniosków czeka') : '');
          return { cls: (n ? 'is-heat' + Math.min(3, n) : '') + (pn ? ' is-pend' : ''), tip: tip + ' (kliknij po listę)', onClick: function (k) { openDay(k, away, ctx); } };
        }, Cal.isoOf(now)));
      }
      return D.el('div', { class: 'lv-yearcal' }, [D.el('div', { class: 'lv-months' }, months), D.el('div', { class: 'lv-foot' }, [CB.legendBar('team')])]);
    }
    var mine = list.filter(function (a) { return a.personId === me.id; });
    var sel = lv.sel || null;
    for (var m = 0; m < 12; m += 1) months.push(monthCard(year, m, ctx, mine, sel, Cal.isoOf(now)));
    var legend = CB.legendBar('leave');
    return D.el('div', { class: 'lv-yearcal' }, [D.el('div', { class: 'lv-months' }, months), D.el('div', { class: 'lv-foot' }, [legend, selBar(state, ctx, me, now, year)])]);
  }

  /** Osoby nieobecne (lub z wnioskiem) w danym dniu, widoczne dla `me`: [{ person, rec, seen }]. */
  function awayOn(list, people, key, me, projects, allPeople) {
    var out = [];
    people.forEach(function (p) {
      var rec = list.filter(function (a) { return a.personId === p.id && a.from <= key && a.to >= key && a.status !== 'rejected'; })[0];
      if (!rec) return;
      var seen = A.peek(me.id, rec, projects, allPeople);
      if (seen) out.push({ person: p, rec: rec, seen: seen });
    });
    return out;
  }

  /** Miesiąc: tygodnie jako wiersze kafli. „Ja” – własne urlopy i wnioski jako ciągłe paski (klik w wolny dzień wybiera zakres),
      „Zespół” – paski wszystkich osób (L4 innych jako „nieobecność”). */
  function monthTiles(state, ctx, me, now, who) {
    var lv = state.leave || {};
    var off = Number(lv.monthOffset) || 0;
    var base = new Date(now.getFullYear(), now.getMonth() + off, 1);
    var year = base.getFullYear();
    var m = base.getMonth();
    var count = new Date(year, m + 1, 0).getDate();
    var today = Cal.isoOf(now);
    var list = state.workspace.absences || [];
    var projects = state.workspace.projects || [];
    var active = ctx.people.filter(function (p) { return p.active !== false; });
    var mine = list.filter(function (a) { return a.personId === me.id && a.status !== 'rejected'; });
    var sel = lv.sel || null;
    var mFirst = iso(year, m, 1);
    var mLast = iso(year, m, count);
    function clipTo(b) { return Object.assign(b, { from: b.from < mFirst ? mFirst : b.from, to: b.to > mLast ? mLast : b.to }); }

    var bars = [];
    if (who === 'me') {
      mine.forEach(function (a) {
        if (a.to < mFirst || a.from > mLast) return;
        var pend = a.status === 'pending';
        bars.push(clipTo({
          from: a.from, to: a.to, kind: CB.kindOf(a.kind, pend),
          label: pend ? 'Wniosek: ' + kindLabel(a).toLowerCase() + ' (czeka na decyzję)' : kindLabel(a),
          sub: range(a.from, a.to, now) + ' · ' + workdays(A.workdays(a)),
          tip: kindLabel(a) + ' · ' + A.STATUS[a.status].toLowerCase() + ' · ' + range(a.from, a.to, now), fk: 'lv-bar',
          onClick: function () { openDetail(a, ctx, now); }
        }));
      });
    } else {
      active.forEach(function (p) {
        list.filter(function (a) { return a.personId === p.id && a.status !== 'rejected' && a.to >= mFirst && a.from <= mLast; }).forEach(function (a) {
          var seen = A.peek(me.id, a, projects, ctx.people);
          if (!seen) return;
          var pend = a.status === 'pending';
          var full = seen === 'full';
          var nm = Team.fullName(p).split(' ');
          var short = nm[0] + (nm[1] ? ' ' + nm[1].charAt(0) + '.' : '');
          var text = pend ? 'wniosek (czeka)' : (full ? (a.kind === 'leave' ? (a.onDemand ? 'urlop na żądanie' : 'urlop') : (a.kind === 'sick' ? 'L4' : (a.kind === 'training' ? 'szkolenie' : 'nieobecność'))) : 'nieobecność');
          bars.push(clipTo({
            from: a.from, to: a.to, kind: CB.kindOf(full ? a.kind : 'other', pend), label: short + ' · ' + text,
            tip: Team.fullName(p) + ' · ' + (full ? (pend ? 'wniosek: ' + kindLabel(a).toLowerCase() : kindLabel(a).toLowerCase()) : 'nieobecność') + ' · ' + range(a.from, a.to, now), fk: 'lv-bar'
          }));
        });
      });
    }

    var first = new Date(year, m, 1);
    var lead = (first.getDay() + 6) % 7;
    var weeks = Math.ceil((lead + count) / 7);
    var grid = D.el('div', { class: 'cb-grid', attrs: { role: 'grid', 'aria-label': MONTHS[m] + ' ' + year } });
    for (var w = 0; w < weeks; w += 1) {
      var days = [];
      for (var c = 0; c < 7; c += 1) {
        var n = w * 7 + c - lead + 1;
        var out = n < 1 || n > count;
        var key = out ? Cal.addDays(mFirst, n - 1) : iso(year, m, n);
        days.push({ key: key, day: out ? 0 : n, out: out, weekend: Cal.isWeekend(key), holiday: out ? '' : Cal.holidayName(key), today: key === today });
      }
      grid.appendChild(CB.weekRow({
        days: days, bars: bars, minH: who === 'me' ? '3rem' : '2.4rem',
        tile: function (d) {
          if (d.out) return {};
          if (who !== 'me') return { cls: 'lv-c is-nopick', attrs: { role: 'gridcell', 'data-day': d.key } };
          var has = mine.some(function (a) { return a.from <= d.key && a.to >= d.key; });
          var pickable = !d.weekend && !d.holiday && !has;
          var inSel = sel && sel.from && d.key >= sel.from && d.key <= (sel.to || sel.from);
          if (!pickable) return { cls: 'lv-c is-nopick', attrs: { role: 'gridcell', 'data-day': d.key } };
          var pick = function () { ctx.actions.pickLeaveDay(d.key); };
          return {
            cls: 'lv-c is-pick' + (inSel ? ' is-picked' : ''),
            attrs: { role: 'gridcell', 'data-day': d.key, tabindex: '0', 'aria-pressed': inSel ? 'true' : 'false', 'aria-label': 'Wybierz ' + d.key },
            on: { click: pick, keydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } }
          };
        }
      }));
    }
    var head = D.el('div', { class: 'cb-dow' }, ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map(function (n) { return D.el('span', { text: n, attrs: { role: 'columnheader' } }); }));
    return D.el('div', { class: 'cb lv-tiles' }, [head, grid, CB.legendBar('leave'),
      who === 'me' ? selBar(state, ctx, me, now, year) : null]);
  }

  function kpi(label, value, sub, extra) {
    return D.el('div', { class: 'ts-stat' }, [D.el('span', { class: 'ts-stat__l', text: label }), D.el('b', { class: 'ts-stat__v', text: value }), D.el('span', { class: 'ts-stat__s', text: sub }), extra || null]);
  }

  /* ---------- Skrzynka akceptacji ---------- */
  function impactList(items) {
    return D.el('ul', { class: 'lv-impact' }, items.map(function (x) { return D.el('li', { class: 'is-' + x.tone }, [D.el('i', { class: 'lv-dot lv-dot--' + x.tone }), D.el('span', { text: x.text })]); }));
  }

  function inboxCard(a, state, ctx, me, now, management) {
    var person = Team.findPerson(ctx.people, a.personId);
    var projects = state.workspace.projects || [];
    var bal = A.balance(state.workspace.absences || [], person, new Date(a.from + 'T12:00:00'));
    var cancel = !!a.cancelRequest;
    var leader = !cancel && A.isLeaderOf(me.id, a, projects);
    var after = a.kind === 'leave' ? bal.left - A.workdays(a) : null;
    var impact = A.impact(a, { projects: projects, people: ctx.people, absences: state.workspace.absences || [] });
    var note = UI.input({ id: 'lv-note-' + a.id, placeholder: management ? 'Powód odrzucenia lub uwaga (opcjonalnie)' : 'Uwaga do opinii (opcjonalnie)', maxlength: 200 });
    var opinions = (a.opinions || []).map(function (o) {
      var by = Team.findPerson(ctx.people, o.by);
      return D.el('li', { class: 'lv-opinion is-' + o.verdict }, [D.el('b', { text: (by ? Team.fullName(by) : 'Lider') + ': ' }), D.el('span', { text: A.VERDICTS[o.verdict] + (o.note ? ' · ' + o.note : '') })]);
    });
    var actions = [];
    if (management) {
      actions.push(UI.button({ label: cancel ? 'Anuluj urlop' : 'Zaakceptuj', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'lv-approve' }, onClick: function () { ctx.actions.decideLeave(a.id, 'approve', note.value); } }));
      actions.push(UI.button({ label: cancel ? 'Zostaw urlop' : 'Odrzuć', size: 'sm', attrs: { 'data-fk': 'lv-reject' }, onClick: function () { ctx.actions.decideLeave(a.id, 'reject', note.value); } }));
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
          D.el('span', { class: 'lv-kind', text: cancel ? 'Prośba o anulowanie' : kindLabel(a) }),
          D.el('b', { text: range(a.from, a.to, now) }),
          D.el('span', { class: 't-meta', text: workdays(A.workdays(a)) + (after !== null ? ' · po wniosku zostanie ' + days(Math.max(0, after)) + (after < 0 ? ' (brakuje ' + days(-after) + ')' : '') : '') })
        ]),
        D.el('div', { class: 'lv-impactbox' }, [D.el('span', { class: 'lv-impactbox__t', text: 'WPŁYW NA PLAN' }), impactList(impact)]),
        a.note ? D.el('p', { class: 't-meta', text: 'Uwaga pracownika: ' + a.note }) : null,
        cancel && a.cancelRequest.note ? D.el('p', { class: 't-meta', text: 'Powód anulowania: ' + a.cancelRequest.note }) : null,
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
    var pending = visible.filter(function (a) { return a.status === 'pending' || (management && !!a.cancelRequest); }).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
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
    var kind = UI.select({ id: 'lv-kind', value: v.kind && A.isLeaveKind(v.kind) ? v.kind : 'leave', options: Object.keys(A.LEAVE_KINDS).map(function (k) { return { value: k, label: A.LEAVE_KINDS[k] }; }) });
    var closed = D.el('p', { class: 'field__error', attrs: { 'data-fk': 'lv-closed', role: 'status' } });
    var from = UI.input({ id: 'lv-from', type: 'date', value: v.from || '', error: problems.from });
    var to = UI.input({ id: 'lv-to', type: 'date', value: v.to || '', error: problems.to });
    var onDemand = UI.checkbox({ id: 'lv-ondemand', label: 'Urlop na żądanie', hint: 'Limit ' + A.ON_DEMAND_LIMIT + ' dni w roku. Pozostało: ' + Math.max(0, info.onDemandLeft), checked: v.onDemand === true });
    var note = UI.input({ id: 'lv-note', value: v.note || '', maxlength: 200, placeholder: 'np. wyjazd rodzinny' });
    var count = D.el('p', { class: 't-meta', attrs: { 'data-fk': 'lv-days', 'aria-live': 'polite' } });
    /* Podgląd wpływu: to samo, co zobaczy osoba decydująca (kolizje z terminami, obsada zespołów). */
    var preview = D.el('div', { class: 'lv-impactbox', attrs: { 'data-fk': 'lv-impact', 'aria-live': 'polite' } });
    function refreshPreview() {
      var items = info.impact && from.value && to.value && to.value >= from.value ? info.impact(from.value, to.value) : [];
      preview.hidden = !items.length;
      D.render(preview, items.length ? [D.el('span', { class: 'lv-impactbox__t', text: 'WPŁYW NA PLAN' }), impactList(items)] : []);
    }
    function recount() {
      refreshPreview();
      if (!from.value || !to.value) { count.textContent = ''; return; }
      var n = Cal.workdaysIn(from.value, to.value);
      var left = info.free - n;
      var tail = kind.value === 'leave' ? (left >= 0 ? ' · po wniosku zostanie ' + days(left) : ' · brakuje ' + days(-left))
        : (kind.value === 'childcare' ? ' · limit w roku: pozostało ' + days(Math.max(0, info.childcareLeft)) : ' · nie zmniejsza puli urlopu wypoczynkowego');
      count.textContent = workdays(n) + ' (bez weekendów i świąt)' + tail;
      var bo = to.value >= from.value && A.blackoutAt ? A.blackoutAt(info.blackouts, from.value, to.value) : null;
      closed.textContent = bo ? 'Okres zamknięty dla urlopów (' + range(bo.from, bo.to, new Date()) + (bo.note ? ': ' + bo.note : '') + ').' + (info.auto ? ' Jako zarząd możesz mimo to zapisać urlop.' : ' Wniosek zostanie odrzucony.') : '';
      onDemand.hidden = kind.value !== 'leave';
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
        UI.field({ id: 'lv-kind', label: 'Rodzaj', control: kind }),
        D.el('div', { class: 'form__row' }, [UI.field({ id: 'lv-from', label: 'Od', control: from, error: problems.from }), UI.field({ id: 'lv-to', label: 'Do (włącznie)', control: to, error: problems.to })]),
        count,
        closed,
        preview,
        problems.onDemand ? D.el('p', { class: 'field__error', text: problems.onDemand }) : null,
        onDemand,
        UI.field({ id: 'lv-note', label: 'Uwaga', optional: true, control: note })
      ]
    });
    window.setTimeout(function () { from.focus(); }, 0);
    return form;
  }

  /* ---------- Formularz zgłoszenia L4 ---------- */
  function sickForm(draft, errors, handlers, info) {
    var v = draft || {};
    var problems = errors || {};
    var person = info.canPick ? UI.select({ id: 'lv-person', value: v.personId || '', options: info.people.map(function (p) { return { value: p.id, label: Team.fullName(p) }; }) }) : null;
    var from = UI.input({ id: 'lv-from', type: 'date', value: v.from || '', error: problems.from });
    var to = UI.input({ id: 'lv-to', type: 'date', value: v.to || '', error: problems.to });
    var note = UI.input({ id: 'lv-note', value: v.note || '', maxlength: 200, placeholder: 'np. numer zwolnienia (nie wpisuj diagnozy)' });
    var count = D.el('p', { class: 't-meta', attrs: { 'data-fk': 'lv-days', 'aria-live': 'polite' } });
    function recount() { count.textContent = from.value && to.value ? workdays(Cal.workdaysIn(from.value, to.value)) + ' (bez weekendów i świąt). L4 nie zmniejsza puli urlopu.' : ''; }
    from.addEventListener('change', function () { if (!to.value || to.value < from.value) to.value = from.value; recount(); });
    to.addEventListener('change', recount);
    recount();
    var form = E.Dialog.drawerForm({
      id: 'leave-form',
      submitLabel: info.editing ? 'Zapisz zmiany' : 'Zgłoś L4',
      onCancel: handlers.onCancel,
      onSubmit: function () { handlers.onSubmit({ personId: person ? person.value : '', from: from.value, to: to.value, note: note.value }); },
      body: [
        person ? UI.field({ id: 'lv-person', label: 'Osoba', control: person, error: problems.personId }) : null,
        D.el('div', { class: 'form__row' }, [UI.field({ id: 'lv-from', label: 'Od', control: from, error: problems.from }), UI.field({ id: 'lv-to', label: 'Do (włącznie)', control: to, error: problems.to })]),
        count,
        UI.field({ id: 'lv-note', label: 'Uwaga', optional: true, control: note })
      ]
    });
    window.setTimeout(function () { from.focus(); }, 0);
    return form;
  }

  /* ---------- Szczegóły wniosku (panel boczny) ---------- */
  function fact(label, value) { return [D.el('div', { class: 'lv-detail__row' }, [D.el('span', { class: 'lv-detail__k', text: label }), D.el('span', { class: 'lv-detail__v' }, [value])])]; }

  /** Panel szczegółów własnego urlopu, wniosku albo L4 z dostępnymi działaniami. */
  function openDetail(a, ctx, now) {
    if (!a) return;
    var act = ctx.actions;
    var close = function () { E.Dialog.closeDrawer(); };
    var past = a.to < Cal.isoOf(now);
    var facts = [].concat(
      fact('Rodzaj', document.createTextNode(kindLabel(a))),
      fact('Termin', document.createTextNode(range(a.from, a.to, now))),
      fact('Dni robocze', document.createTextNode(workdays(A.workdays(a)))),
      fact('Status', a.kind === 'sick' ? document.createTextNode('Zgłoszone') : (past && a.status === 'approved' ? UI.badge('Wykorzystany', null) : statusBadge(a.status)))
    );
    if (a.note) facts = facts.concat(fact('Uwaga', document.createTextNode(a.note)));
    var decider = a.decidedBy ? Team.findPerson(ctx.people, a.decidedBy) : null;
    if (decider && a.status !== 'pending' && a.decidedBy !== a.personId) facts = facts.concat(fact(a.status === 'rejected' ? 'Odrzucił' : 'Zatwierdził', document.createTextNode(Team.fullName(decider))));
    if (a.status === 'rejected' && a.decisionNote) facts = facts.concat(fact('Powód', document.createTextNode(a.decisionNote)));
    var body = [D.el('div', { class: 'lv-detail__dl' }, facts)];
    var actions = [];
    var mine = a.personId === ctx.me.id;
    if (a.kind === 'sick') {
      body.push(D.el('p', { class: 't-meta', text: 'L4 nie zmniejsza puli urlopu. Zespół widzi tylko, że jesteś nieobecny/a, bez powodu.' }));
      if (mine || ctx.management) {
        actions.push(UI.button({ label: 'Zmień daty lub uwagę', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'lv-d-sick-edit' }, onClick: function () { close(); act.openSickEdit(a.id); } }));
        actions.push(UI.button({ label: 'Usuń zgłoszenie', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'lv-d-sick-del' }, onClick: function () { close(); act.deleteSick(a.id); } }));
      }
    } else if (mine && a.status === 'pending') {
      var preview = ctx.impact ? ctx.impact(a) : [];
      if (preview.length) body.push(D.el('div', { class: 'lv-impactbox' }, [D.el('span', { class: 'lv-impactbox__t', text: 'WPŁYW NA PLAN' }), impactList(preview)]));
      actions.push(UI.button({ label: 'Wycofaj wniosek', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'lv-d-withdraw' }, onClick: function () { close(); act.withdrawLeave(a.id); } }));
    } else if (mine && a.status === 'approved') {
      if (a.cancelRequest) {
        body.push(D.el('p', { class: 'lv-detail__note', text: 'Prośba o anulowanie czeka na decyzję zarządu.' }));
        actions.push(UI.button({ label: 'Wycofaj prośbę', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'lv-d-cancel-withdraw' }, onClick: function () { close(); act.withdrawCancelLeave(a.id); } }));
      } else if (A.cancellable(a, now)) {
        var why = UI.input({ id: 'lv-cancel-note', placeholder: 'Powód (opcjonalnie)', maxlength: 200 });
        if (!ctx.management) body.push(UI.field({ id: 'lv-cancel-note', label: 'Powód anulowania', optional: true, control: why }));
        actions.push(UI.button({ label: ctx.management ? 'Anuluj urlop' : 'Poproś o anulowanie', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'lv-d-cancel' }, onClick: function () { close(); act.cancelLeave(a.id, why.value); } }));
        if (!ctx.management) body.push(D.el('p', { class: 't-meta', text: 'Zatwierdzony urlop anuluje zarząd. Do czasu decyzji urlop zostaje w planie.' }));
      } else {
        body.push(D.el('p', { class: 't-meta', text: a.from <= Cal.isoOf(now) && !past ? 'Urlop już trwa. Zmiany ustal z zarządem.' : 'Ten urlop już się zakończył.' }));
      }
    }
    body.push(D.el('div', { class: 'lv-detail__actions' }, actions));
    E.Dialog.openDrawer({ title: a.kind === 'sick' ? 'Zwolnienie lekarskie' : (a.status === 'pending' ? 'Wniosek urlopowy' : 'Urlop'), subtitle: range(a.from, a.to, now), content: D.el('div', { class: 'lv-detail' }, body) });
  }

  /** Powiadomienia o decyzjach zarządu: baner nad kafelkami, znika po potwierdzeniu. */
  function noticeBanners(state, ctx, me, now) {
    var items = A.notices(state.workspace.absences || [], me.id);
    if (!items.length) return null;
    return D.el('div', { class: 'lv-notices', attrs: { role: 'status', 'data-fk': 'lv-notices' } }, items.map(function (a) {
      var by = a.decidedBy ? Team.findPerson(ctx.people, a.decidedBy) : null;
      var span = range(a.from, a.to, now);
      var text = a.notice === 'approved' ? 'Twój wniosek na ' + span + ' został zatwierdzony' + (by ? ' (' + Team.fullName(by) + ')' : '') + '.'
        : a.notice === 'rejected' ? 'Twój wniosek na ' + span + ' został odrzucony' + (a.decisionNote ? ': ' + a.decisionNote : '.')
        : 'Prośba o anulowanie urlopu ' + span + ' została odrzucona, urlop zostaje' + (a.noticeNote ? ' (' + a.noticeNote + ')' : '.');
      return D.el('div', { class: 'lv-notice is-' + (a.notice === 'approved' ? 'ok' : 'no'), dataset: { id: a.id } }, [
        D.el('span', { class: 'lv-notice__t', text: text }),
        UI.button({ label: 'OK', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'lv-notice-ok' }, onClick: function () { ctx.actions.ackLeave(a.id); } })
      ]);
    }));
  }

  /** Menu „Eksport” – to samo miejsce i styl co w Czasie. */
  function exportMenu(ctx, management) {
    var tools = D.el('div', { class: 'ts-export' }, [
      UI.button({ label: 'Eksport', icon: 'download', iconRight: 'chevronDown', variant: 'secondary', attrs: { 'data-fk': 'lv-export-menu' }, class: 'ts-export__btn' })
    ]);
    E.Menu.bind(tools.firstChild, function () {
      var items = [
        { type: 'label', label: 'Karta urlopowa' },
        { label: 'Karta urlopowa – wydruk', icon: 'download', onSelect: function () { ctx.actions.exportLeaveCard('print', 'me'); } },
        { label: 'Karta urlopowa – Excel (CSV)', icon: 'download', onSelect: function () { ctx.actions.exportLeaveCard('csv', 'me'); } }
      ];
      if (management) items = items.concat([
        { type: 'label', label: 'Cały zespół' },
        { label: 'Zestawienie zespołu – wydruk', icon: 'download', onSelect: function () { ctx.actions.exportLeaveCard('print', 'team'); } },
        { label: 'Zestawienie zespołu – Excel (CSV)', icon: 'download', onSelect: function () { ctx.actions.exportLeaveCard('csv', 'team'); } }
      ]);
      return { label: 'Eksport urlopów', items: items };
    });
    return tools;
  }

  /** Zaległy urlop przepada po 30 września: przypomnienie w ostatnich 90 dniach i po terminie. */
  function carryBanner(bal, ref, now, shownYear) {
    if (!bal.carry || shownYear !== now.getFullYear()) return null;
    var deadline = bal.carryDeadline;
    var today = Cal.isoOf(now);
    var left = bal.carryLeft;
    if (left <= 0) return null;
    var d = Math.round((Cal.parse(deadline) - Cal.parse(today)) / 86400000);
    if (d < 0) return D.el('div', { class: 'lv-notice is-no', attrs: { role: 'status', 'data-fk': 'lv-carry' } }, [D.el('span', { class: 'lv-notice__t', text: 'Urlop zaległy przepadł z dniem 30 września (' + days(left) + ' niewykorzystane).' })]);
    if (d > 90) return null;
    return D.el('div', { class: 'lv-notice is-no', attrs: { role: 'status', 'data-fk': 'lv-carry' } }, [D.el('span', { class: 'lv-notice__t', text: 'Urlop zaległy (' + days(left) + ') trzeba wykorzystać do 30 września – zostało ' + d + ' ' + E.Format.count(d, 'dzień', 'dni', 'dni') + '.' })]);
  }

  /** Panel zarządu: dni wolne firmy, okresy zamknięte dla urlopów, widoczność nieobecności. */
  function rulesPanel(state, ctx) {
    var st = state.workspace.settings || {};
    var company = st.companyDays || [];
    var blackouts = st.blackouts || [];
    var save = ctx.actions.saveLeaveSettings;
    var cDate = UI.input({ id: 'lv-cd-date', type: 'date' });
    var cName = UI.input({ id: 'lv-cd-name', maxlength: 60, placeholder: 'np. mostek majowy' });
    var bFrom = UI.input({ id: 'lv-bo-from', type: 'date' });
    var bTo = UI.input({ id: 'lv-bo-to', type: 'date' });
    var bNote = UI.input({ id: 'lv-bo-note', maxlength: 80, placeholder: 'np. inwentaryzacja' });
    var vis = UI.select({ id: 'lv-vis', value: st.absenceVisibility || 'who', options: Object.keys(A.VISIBILITY).map(function (k) { return { value: k, label: A.VISIBILITY[k] }; }) });
    vis.addEventListener('change', function () { save({ absenceVisibility: vis.value }); });
    function listOf(arr, label, remove) {
      return arr.length ? D.el('ul', { class: 'lv-rules__list' }, arr.map(function (x, i) {
        return D.el('li', null, [D.el('span', { text: label(x) }), UI.iconButton({ icon: 'close', label: 'Usuń', size: 'sm', onClick: function () { remove(i); } })]);
      })) : D.el('p', { class: 't-meta', text: 'Brak.' });
    }
    return D.el('div', { class: 'lv-rules', attrs: { 'data-fk': 'lv-rules' } }, [
      D.el('h4', { text: 'Dni wolne firmy (mostki)' }),
      D.el('p', { class: 't-meta', text: 'Liczą się jak święto: nie zmniejszają puli urlopu i nie wchodzą do norm czasu pracy.' }),
      listOf(company, function (x) { return range(x.date, x.date, ctx.now) + ' · ' + x.name; }, function (i) { save({ companyDays: company.filter(function (_, j) { return j !== i; }) }); }),
      UI.field({ id: 'lv-cd-date', label: 'Dzień', control: cDate }), UI.field({ id: 'lv-cd-name', label: 'Nazwa', optional: true, control: cName }),
      UI.button({ label: 'Dodaj dzień wolny', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'lv-cd-add' }, onClick: function () { if (cDate.value) save({ companyDays: company.concat([{ date: cDate.value, name: cName.value }]) }); } }),
      D.el('h4', { text: 'Okresy zamknięte dla urlopów' }),
      D.el('p', { class: 't-meta', text: 'Pracownicy nie złożą w nich wniosku. Zarząd może zapisać urlop mimo to.' }),
      listOf(blackouts, function (x) { return range(x.from, x.to, ctx.now) + (x.note ? ' · ' + x.note : ''); }, function (i) { save({ blackouts: blackouts.filter(function (_, j) { return j !== i; }) }); }),
      D.el('div', { class: 'form__row' }, [UI.field({ id: 'lv-bo-from', label: 'Od', control: bFrom }), UI.field({ id: 'lv-bo-to', label: 'Do', control: bTo })]),
      UI.field({ id: 'lv-bo-note', label: 'Powód', optional: true, control: bNote }),
      UI.button({ label: 'Dodaj okres', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'lv-bo-add' }, onClick: function () { if (bFrom.value && bTo.value && bTo.value >= bFrom.value) save({ blackouts: blackouts.concat([{ from: bFrom.value, to: bTo.value, note: bNote.value }]) }); } }),
      D.el('h4', { text: 'Widoczność nieobecności w zespole' }),
      UI.field({ id: 'lv-vis', label: 'Co widzą inni', control: vis })
    ]);
  }

  /* ---------- Ekran ---------- */
  function view(state, ctx) {
    /* Urlopy pokazują tylko urlopy i L4. Szkolenia i inne wyjazdy to „wyjazd lub spotkanie” w Kalendarzu. */
    state = Object.assign({}, state, { workspace: Object.assign({}, state.workspace, { absences: (state.workspace.absences || []).filter(function (a) { return A.isLeaveKind(a.kind) || a.kind === 'sick'; }) }) });
    var people = state.workspace.people || [];
    var me = Team.findPerson(people, state.prefs.me);
    if (!me) return { summary: 'Urlopy i nieobecności zespołu.', body: E.Welcome.card(state, ctx, 'Urlopy pokazują Twoje saldo i wnioski. Wybierz, kim jesteś.') };
    var now = new Date();
    var lv = state.leave || {};
    var projects = state.workspace.projects || [];
    var management = E.Budget.isManagement(me.id, people);
    var leader = projects.some(function (p) { return p.team && p.team.leader === me.id; });
    var canInbox = management || leader;
    var who = lv.who === 'team' ? 'team' : 'me';
    var mode = lv.view === 'month' ? 'month' : 'year';
    var pendingN = pendingFor(state, me);
    var vctx = {
      people: people, actions: ctx.actions, me: me, management: management, now: now, blackouts: (state.workspace.settings || {}).blackouts || [],
      /* Podgląd wpływu bez cudzych L4: do kolizji liczą się tylko urlopy. */
      impact: function (a) { return A.impact(a, { projects: projects, people: people, absences: (state.workspace.absences || []).filter(function (x) { return x.kind === 'leave'; }) }); }
    };
    var list = state.workspace.absences || [];
    var off = Number(lv.monthOffset) || 0;
    var base = new Date(now.getFullYear(), now.getMonth() + off, 1);
    var year = Number(lv.year) || now.getFullYear();
    /* Kafle sald dotyczą oglądanego roku: przeszły liczy się w całości jako wykorzystany, przyszły jako zaplanowany. */
    var shownYear = lv.view === 'month' ? base.getFullYear() : year;
    var ref = shownYear === now.getFullYear() ? now : (shownYear < now.getFullYear() ? new Date(shownYear, 11, 31, 12) : new Date(shownYear, 0, 1, 12));
    var bal = A.balance(list, me, ref);
    var title = mode === 'year' ? String(year) : MONTHS[base.getMonth()][0].toUpperCase() + MONTHS[base.getMonth()].slice(1) + ' ' + base.getFullYear();
    function shift(dir) { if (mode === 'year') ctx.actions.setLeave({ year: year + dir, sel: null }); else ctx.actions.setLeave({ monthOffset: off + dir }); }

    var whoSeg = UI.segmented({ label: 'Czyje urlopy', value: who, items: [{ value: 'me', label: 'Ja' }, { value: 'team', label: 'Zespół' }], onChange: function (v) { ctx.actions.setLeave({ who: v, sel: null }); } });
    var viewSeg = UI.segmented({ label: 'Zakres kalendarza', value: mode, items: [{ value: 'month', label: 'Miesiąc' }, { value: 'year', label: 'Rok' }], onChange: function (v) { ctx.actions.setLeave({ view: v, sel: null }); } });
    var toolbar = D.el('div', { class: 'ts-bar lv-bar' }, [whoSeg.node, viewSeg.node,
      D.el('div', { class: 'ts-nav', attrs: { role: 'group', 'aria-label': 'Przesuń okres' } }, [
      UI.iconButton({ icon: 'chevronLeft', label: mode === 'year' ? 'Poprzedni rok' : 'Poprzedni miesiąc', size: 'sm', attrs: { 'data-fk': 'lv-prev' }, onClick: function () { shift(-1); } }),
      D.el('h2', { class: 'ts-title' }, [CB.dateJump({ text: title, value: mode === 'year' ? year + '-' + n2(now.getMonth() + 1) + '-' + n2(now.getDate()) : iso(base.getFullYear(), base.getMonth(), 1), fk: 'lv-jump', onPick: function (v) {
        var d = Cal.parse(v);
        if (mode === 'year') ctx.actions.setLeave({ year: d.getFullYear(), sel: null });
        else ctx.actions.setLeave({ monthOffset: (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth() });
      } })]),
      UI.iconButton({ icon: 'chevronRight', label: mode === 'year' ? 'Następny rok' : 'Następny miesiąc', size: 'sm', attrs: { 'data-fk': 'lv-next' }, onClick: function () { shift(1); } }),
      (mode === 'month' && off) || (mode === 'year' && year !== now.getFullYear()) ? UI.button({ label: 'Dziś', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.setLeave({ monthOffset: 0, year: now.getFullYear() }); } }) : null
      ]),
      D.el('span', { class: 'lv-bar__fill' }),
      UI.button({ label: 'Zgłoś L4', variant: 'secondary', icon: 'plus', attrs: { 'data-fk': 'lv-sick' }, onClick: function () { ctx.actions.openSickReport(); } }),
      UI.button({ label: management ? 'Dodaj urlop' : 'Złóż wniosek', variant: 'primary', icon: 'plus', attrs: { 'data-fk': 'lv-new' }, onClick: function () { ctx.actions.openLeaveRequest({ kind: 'leave' }); } })]);

    var pct = bal.total ? Math.round(bal.left / bal.total * 100) : 0;
    var stats = D.el('div', { class: 'ts-stats lv-stats-row' }, [
      kpi('Pozostało' + (shownYear !== now.getFullYear() ? ' w ' + shownYear : ''), days(bal.left), 'z ' + bal.total + (bal.carry ? ' (w tym ' + bal.carry + ' zaległych)' : '') + ' · ' + pct + '%', D.el('div', { class: 'lv-meter' }, [D.el('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } })])),
      kpi('Wykorzystano', days(bal.used), 'zaplanowano ' + bal.planned + (bal.sick ? ' · zwolnienia ' + bal.sick : '')),
      kpi('Na żądanie', bal.onDemandUsed + ' z ' + bal.onDemandLimit, 'pozostało ' + Math.max(0, bal.onDemandLimit - bal.onDemandUsed)),
      kpi('Wnioski', String(bal.pending ? bal.pending : 0), bal.pending ? 'czeka na decyzję' : 'nic nie czeka')
    ]);

    var calendar = mode === 'year' ? yearCalendar(state, vctx, me, now, who) : monthTiles(state, vctx, me, now, who);

    var mine = list.filter(function (a) { return a.personId === me.id; }).sort(function (a, b) { return a.from < b.from ? 1 : -1; });
    var items = [{ id: 'mine', title: 'Moje wnioski', icon: 'sun', tone: 'accent', badge: mine.filter(function (a) { return a.status === 'pending'; }).length || '', side: [mine.length
      ? D.el('ul', { class: 'lv-reqs' }, mine.slice(0, 8).map(function (a) { return requestRow(a, Object.assign({}, vctx, { mine: true }), now); }))
      : D.el('p', { class: 't-meta', text: 'Nie ma jeszcze żadnych wniosków. Wybierz „Złóż wniosek”.' })] }];
    if (canInbox) items.push({ id: 'inbox', title: 'Do akceptacji' + (pendingN ? ' · ' + pendingN : ''), label: 'Do akceptacji', icon: 'check', tone: 'violet', badge: pendingN ? String(pendingN) : '', late: !!pendingN, side: [inbox(state, vctx, me, now)] });
    if (management) items.push({ id: 'rules', title: 'Zasady urlopów', icon: 'settings', tone: 'violet', side: [rulesPanel(state, vctx)] });
    var railPref = lv.rail || 'none';
    var openId = railPref === 'none' ? null : (items.some(function (it) { return it.id === railPref; }) ? railPref : null);
    return { tools: exportMenu(ctx, management), summary: 'Do wykorzystania w ' + bal.year + ' roku: ' + days(bal.left) + ' z ' + bal.total + '.', body: D.el('div', { class: 'lv lv-page' }, [toolbar,
      UI.railLayout({ id: 'leave', cls: 'lv-rl', mainCls: 'lv-main', items: items, active: openId, main: [noticeBanners(state, vctx, me, now), carryBanner(bal, ref, now, shownYear), stats, D.el('section', { class: 'an-card ts-calcard lv-layout__main' }, [calendar])].filter(Boolean), onSelect: function (id) { ctx.actions.setLeave({ rail: id || 'none' }); } })]) };
  }

  /** Liczba wniosków czekających na decyzję lub opinię osoby (do licznika w menu). */
  function pendingFor(state, me) {
    if (!me) return 0;
    var people = state.workspace.people || [];
    var projects = state.workspace.projects || [];
    var management = E.Budget.isManagement(me.id, people);
    return (state.workspace.absences || []).filter(function (a) {
      if (a.personId === me.id) return false;
      if (management) return a.status === 'pending' || !!a.cancelRequest;
      if (a.status !== 'pending') return false;
      return A.isLeaderOf(me.id, a, projects) && !(a.opinions || []).some(function (o) { return o.by === me.id; });
    }).length;
  }

  /** Licznik w menu Urlopów: sprawy do decyzji plus nieprzeczytane decyzje o własnych wnioskach. */
  function badgeFor(state, me) {
    return me ? pendingFor(state, me) + A.notices(state.workspace.absences || [], me.id).length : 0;
  }

  E.LeaveScreen = { miniMonth: miniMonth, kindLabel: kindLabel, view: view, requestForm: requestForm, sickForm: sickForm, pendingFor: pendingFor, badgeFor: badgeFor, openDetail: openDetail, range: range };
})(typeof globalThis !== 'undefined' ? globalThis : this);
