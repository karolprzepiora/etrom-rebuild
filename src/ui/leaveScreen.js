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

  function legendRow(items) {
    return D.el('div', { class: 'ts-legend' }, items.map(function (x) { return D.el('span', { class: 'ts-legend__i ' + x[0], text: x[1] }); }));
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
          var n = awayOn(list, active, key, me, projects, ctx.people).length;
          return n ? { cls: 'is-heat' + Math.min(3, n), tip: n + ' ' + E.Format.count(n, 'osoba nieobecna', 'osoby nieobecne', 'osób nieobecnych') } : null;
        }, Cal.isoOf(now)));
      }
      return D.el('div', { class: 'lv-yearcal' }, [D.el('div', { class: 'lv-months' }, months), D.el('div', { class: 'lv-foot' }, [D.el('ul', { class: 'lv-legend lv-legend--row' }, [
        D.el('li', null, [D.el('i', { class: 'lv-dot cv-dot--h1' }), D.el('span', { text: '1 osoba nieobecna' })]),
        D.el('li', null, [D.el('i', { class: 'lv-dot cv-dot--h2' }), D.el('span', { text: '2 osoby' })]),
        D.el('li', null, [D.el('i', { class: 'lv-dot cv-dot--h3' }), D.el('span', { text: '3 lub więcej' })])
      ])])]);
    }
    var mine = list.filter(function (a) { return a.personId === me.id; });
    var sel = lv.sel || null;
    for (var m = 0; m < 12; m += 1) months.push(monthCard(year, m, ctx, mine, sel, Cal.isoOf(now)));
    var legend = D.el('ul', { class: 'lv-legend lv-legend--row' }, [
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--used' }), D.el('span', { text: 'urlop' })]),
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--wait' }), D.el('span', { text: 'czeka na decyzję' })]),
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--other' }), D.el('span', { text: 'zwolnienie, szkolenie' })]),
      D.el('li', null, [D.el('i', { class: 'lv-dot lv-dot--holiday' }), D.el('span', { text: 'święto' })])
    ]);
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

  var SHORT = { leave: 'U', sick: 'L4', training: 'Sz', other: 'N' };

  /** Miesiąc w kaflach: „Ja” – własne urlopy i wnioski (klik wybiera dni), „Zespół” – kółka osób nieobecnych. */
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
    var parts = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map(function (n) { return D.el('span', { class: 'ts-cal__dh', text: n, attrs: { role: 'columnheader' } }); });
    for (var i = 0; i < (new Date(year, m, 1).getDay() + 6) % 7; i += 1) parts.push(D.el('div', { class: 'ts-day is-out', attrs: { 'aria-hidden': 'true' } }));
    for (var d = 1; d <= count; d += 1) {
      (function (day) {
        var key = iso(year, m, day);
        var wk = Cal.isWeekend(key);
        var hol = Cal.holidayName(key);
        var cls = 'ts-day lv-c' + (wk ? ' is-weekend' : '') + (hol ? ' is-hol' : '') + (key === today ? ' is-today' : '');
        var kids = [D.el('span', { class: 'ts-day__n', text: String(day) })];
        var attrs = { role: 'gridcell', 'data-day': key };
        var onClick = null;
        if (hol) kids.push(D.el('span', { class: 'ts-day__tag' }, ['Ś', D.el('small', { text: hol })]));
        if (who === 'me') {
          var rec = mine.filter(function (a) { return a.from <= key && a.to >= key; })[0];
          var inSel = sel && sel.from && key >= sel.from && key <= (sel.to || sel.from);
          if (rec && !wk && !hol) {
            var pend = rec.status === 'pending';
            cls += pend ? ' is-req' : (rec.kind === 'sick' ? ' is-sick' : ' is-vac');
            kids.push(D.el('span', { class: 'ts-day__tag' }, [pend ? 'wniosek' : (rec.kind === 'leave' && rec.onDemand ? 'UŻ' : SHORT[rec.kind] || 'N'), D.el('small', { text: pend ? 'czeka na decyzję' : kindLabel(rec).toLowerCase() })]));
            attrs['data-tooltip'] = kindLabel(rec) + ' · ' + A.STATUS[rec.status].toLowerCase();
          } else if (!wk && !hol) {
            cls += ' is-pick' + (inSel ? ' is-sel' : '');
            attrs.tabindex = '0'; attrs['aria-pressed'] = inSel ? 'true' : 'false';
            onClick = function () { ctx.actions.pickLeaveDay(key); };
          }
        } else if (!wk && !hol) {
          var away = awayOn(list, active, key, me, projects, ctx.people);
          if (away.length) {
            var shown = away.slice(0, 4);
            kids.push(D.el('span', { class: 'cv-who' }, shown.map(function (x) {
              var tip = Team.fullName(x.person) + ' · ' + (x.seen === 'full' ? (x.rec.status === 'pending' ? 'wniosek: ' + kindLabel(x.rec).toLowerCase() : kindLabel(x.rec).toLowerCase()) : 'nieobecność') + ' · ' + range(x.rec.from, x.rec.to, now);
              return D.el('span', { class: 'cv-av ' + (x.rec.status === 'pending' ? 'is-pending' : (x.seen === 'full' && x.rec.kind === 'leave' ? 'is-leave' : 'is-other')), attrs: { 'data-tooltip': tip, 'aria-label': tip } }, [E.Avatar.avatar(x.person, { size: 'xs' })]);
            }).concat(away.length > shown.length ? [D.el('small', { text: '+' + (away.length - shown.length) })] : [])));
          }
        }
        parts.push(D.el('div', { class: cls, attrs: attrs, on: onClick ? { click: onClick, keydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } } : null }, kids));
      })(d);
    }
    var legend = who === 'me'
      ? legendRow([['is-vac', 'urlop zatwierdzony'], ['is-req', 'wniosek czeka'], ['is-sick', 'zwolnienie'], ['is-hol', 'święto']])
      : legendRow([['is-vac', 'urlop'], ['is-req', 'wniosek o urlop'], ['is-other', 'inna nieobecność'], ['is-hol', 'święto']]);
    return D.el('div', { class: 'ts-cal is-week lv-tiles' }, [D.el('div', { class: 'ts-cal__grid', attrs: { role: 'grid', 'aria-label': MONTHS[m] + ' ' + year } }, parts), legend,
      who === 'me' ? selBar(state, ctx, me, now, year) : D.el('p', { class: 't-meta', text: 'Wszyscy widzą urlopy i wnioski kolegów. Zwolnienia lekarskie innych osób są pokazane jako „nieobecność”.' })]);
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
    var who = lv.who === 'team' ? 'team' : 'me';
    var mode = lv.view === 'year' ? 'year' : 'month';
    var pendingN = pendingFor(state, me);
    var vctx = { people: people, actions: ctx.actions };
    var list = state.workspace.absences || [];
    var bal = A.balance(list, me, now);
    var off = Number(lv.monthOffset) || 0;
    var base = new Date(now.getFullYear(), now.getMonth() + off, 1);
    var year = Number(lv.year) || now.getFullYear();
    var title = mode === 'year' ? String(year) : MONTHS[base.getMonth()][0].toUpperCase() + MONTHS[base.getMonth()].slice(1) + ' ' + base.getFullYear();
    function shift(dir) { if (mode === 'year') ctx.actions.setLeave({ year: year + dir, sel: null }); else ctx.actions.setLeave({ monthOffset: off + dir }); }

    var whoSeg = UI.segmented({ label: 'Czyje urlopy', value: who, items: [{ value: 'me', label: 'Ja' }, { value: 'team', label: 'Zespół' }], onChange: function (v) { ctx.actions.setLeave({ who: v, sel: null }); } });
    var viewSeg = UI.segmented({ label: 'Zakres kalendarza', value: mode, items: [{ value: 'month', label: 'Miesiąc' }, { value: 'year', label: 'Rok' }], onChange: function (v) { ctx.actions.setLeave({ view: v, sel: null }); } });
    var toolbar = D.el('div', { class: 'ts-bar lv-bar' }, [whoSeg.node, viewSeg.node,
      UI.iconButton({ icon: 'chevronLeft', label: mode === 'year' ? 'Poprzedni rok' : 'Poprzedni miesiąc', size: 'sm', attrs: { 'data-fk': 'lv-prev' }, onClick: function () { shift(-1); } }),
      D.el('h2', { class: 'ts-title', text: title }),
      UI.iconButton({ icon: 'chevronRight', label: mode === 'year' ? 'Następny rok' : 'Następny miesiąc', size: 'sm', attrs: { 'data-fk': 'lv-next' }, onClick: function () { shift(1); } }),
      (mode === 'month' && off) || (mode === 'year' && year !== now.getFullYear()) ? UI.button({ label: 'Dziś', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.setLeave({ monthOffset: 0, year: now.getFullYear() }); } }) : null,
      D.el('span', { class: 'lv-bar__fill' }),
      UI.button({ label: management ? 'Dodaj urlop' : 'Złóż wniosek', variant: 'primary', icon: 'plus', attrs: { 'data-fk': 'lv-new' }, onClick: function () { ctx.actions.openLeaveRequest({ kind: 'leave' }); } })]);

    var pct = bal.total ? Math.round(bal.left / bal.total * 100) : 0;
    var stats = D.el('div', { class: 'ts-stats lv-stats-row' }, [
      kpi('Pozostało', days(bal.left), 'z ' + bal.total + ' · ' + pct + '%', D.el('div', { class: 'lv-meter' }, [D.el('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } })])),
      kpi('Wykorzystano', days(bal.used), 'zaplanowano ' + bal.planned + (bal.sick ? ' · zwolnienia ' + bal.sick : '')),
      kpi('Na żądanie', bal.onDemandUsed + ' z ' + bal.onDemandLimit, 'pozostało ' + Math.max(0, bal.onDemandLimit - bal.onDemandUsed)),
      kpi('Wnioski', String(bal.pending ? bal.pending : 0), bal.pending ? 'czeka na decyzję' : 'nic nie czeka')
    ]);

    var calendar = mode === 'year' ? yearCalendar(state, vctx, me, now, who) : monthTiles(state, vctx, me, now, who);

    var mine = list.filter(function (a) { return a.personId === me.id; }).sort(function (a, b) { return a.from < b.from ? 1 : -1; });
    var items = [{ id: 'mine', title: 'Moje wnioski', icon: 'sun', tone: 'accent', badge: mine.filter(function (a) { return a.status === 'pending'; }).length || '', side: [mine.length
      ? D.el('ul', { class: 'lv-reqs' }, mine.slice(0, 8).map(function (a) { return requestRow(a, { people: people, actions: ctx.actions, mine: true }, now); }))
      : D.el('p', { class: 't-meta', text: 'Nie ma jeszcze żadnych wniosków. Wybierz „Złóż wniosek”.' })] }];
    if (canInbox) items.push({ id: 'inbox', title: 'Do akceptacji' + (pendingN ? ' · ' + pendingN : ''), label: 'Do akceptacji', icon: 'check', tone: 'violet', badge: pendingN ? String(pendingN) : '', late: !!pendingN, side: [inbox(state, vctx, me, now)] });
    var railPref = lv.rail || (canInbox && pendingN ? 'inbox' : 'mine');
    var openId = railPref === 'none' ? null : (items.some(function (it) { return it.id === railPref; }) ? railPref : null);
    return { summary: 'Do wykorzystania w ' + bal.year + ' roku: ' + days(bal.left) + ' z ' + bal.total + '.', body: D.el('div', { class: 'lv lv-page' }, [toolbar,
      UI.railLayout({ id: 'leave', cls: 'lv-rl', mainCls: 'lv-main', items: items, active: openId, main: [stats, D.el('section', { class: 'an-card ts-calcard lv-layout__main' }, [calendar])], onSelect: function (id) { ctx.actions.setLeave({ rail: id || 'none' }); } })]) };
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

  E.LeaveScreen = { miniMonth: miniMonth, kindLabel: kindLabel, view: view, requestForm: requestForm, pendingFor: pendingFor, range: range };
})(typeof globalThis !== 'undefined' ? globalThis : this);
