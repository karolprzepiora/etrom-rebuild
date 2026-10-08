/* ETROM — ekran „Przegląd”: co w tym tygodniu wymaga decyzji zarządu albo lidera.
   Tylko fakty z klikalnymi wierszami; aplikacja niczego nie podpowiada. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;

  function hh(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }
  function shortDay(ms) { return E.PlanBoard.weekLabel(ms); }
  function names(ids, people) {
    return (ids || []).map(function (id) { var p = Team.findPerson(people, id); return p ? Team.fullName(p) : ''; }).filter(Boolean).join(', ');
  }

  function section(title, count, rows, empty) {
    return D.el('section', { class: 'rv-sec' + (count ? '' : ' is-clear'), attrs: { 'aria-label': title, 'data-fk': 'rv-' + title.toLowerCase().replace(/[^a-ząćęłńóśźż]+/g, '-') } }, [
      D.el('div', { class: 'rv-sec__head' }, [
        D.el('h2', { class: 'rv-sec__title', text: title }),
        D.el('span', { class: 'rv-sec__count t-num', text: count ? String(count) : '0' })
      ]),
      count ? D.el('ul', { class: 'rv-list' }, rows) : D.el('p', { class: 'rv-empty', text: empty })
    ]);
  }

  function row(code, main, side, onClick, tone) {
    return D.el('li', null, [D.el('button', { class: 'rv-row' + (tone ? ' is-' + tone : '') + (code ? '' : ' no-code'), attrs: { type: 'button' }, on: { click: onClick } }, [
      code ? D.el('span', { class: 'rv-row__code', style: E.Identity.hueStyle(code), text: code }) : null,
      D.el('span', { class: 'rv-row__main truncate', text: main }),
      D.el('span', { class: 'rv-row__side t-num', text: side })
    ])]);
  }

  /** Zakres: zarząd widzi wszystko, lider swoje projekty i ich osoby. */
  function scope(state, me) {
    var people = state.workspace.people || [];
    var projects = state.workspace.projects || [];
    if (E.Budget.isManagement(me.id, people)) return {};
    var led = projects.filter(function (p) { return p.team && p.team.leader === me.id; });
    var ids = {};
    led.forEach(function (p) { E.Team.projectPeople(p.team).forEach(function (id) { ids[id] = true; }); });
    return { projectIds: led.map(function (p) { return p.id; }), personIds: Object.keys(ids) };
  }

  function allowed(state, me) {
    var people = state.workspace.people || [];
    return E.Budget.isManagement(me.id, people) || (state.workspace.projects || []).some(function (p) { return p.team && p.team.leader === me.id; });
  }

  function view(state, ctx) {
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    if (!me) return { summary: 'Przegląd tygodnia dla zarządu i liderów.', body: E.Welcome.card(state, ctx, 'Przegląd pokazuje, co wymaga decyzji. Wybierz, kim jesteś.') };
    if (!allowed(state, me)) {
      return { summary: 'Przegląd tygodnia jest dla zarządu i liderów projektów.', body: UI.emptyState({ icon: 'checklist', title: 'Twoje sprawy są w Moja praca', text: 'Tam zobaczysz swoje zadania, terminy i podsumowanie dnia.' }) };
    }
    var people = state.workspace.people || [];
    var sc = scope(state, me);
    var now = new Date();
    var r = E.Review.build({
      projects: state.workspace.projects || [], people: people, entries: state.workspace.entries || [], mail: state.workspace.mail || [],
      absences: state.workspace.absences || [], now: now, target: state.prefs.dayTarget, projectIds: sc.projectIds, personIds: sc.personIds
    });
    var open = function (t) { return function () { ctx.actions.inspect({ kind: 'task', projectId: t.projectId, stageId: t.stageId, taskId: t.taskId }); }; };
    var code = function (id) { var p = (state.workspace.projects || []).filter(function (x) { return x.id === id; })[0]; return p ? p.code : ''; };

    var cards = [
      section('Przeciążeni', r.overload.length, r.overload.map(function (o) {
        var p = Team.findPerson(people, o.personId);
        return row('', (p ? Team.fullName(p) : '') + ' · tydzień ' + shortDay(o.weekStart), hh(o.planned) + ' / ' + hh(o.capacity) + ' h (+' + hh(o.over) + ')', function () {
          ctx.actions.setTime({ planCell: { personId: o.personId, week: o.week }, planOffset: 0 });
          ctx.actions.goTo('plan');
        }, 'bad');
      }), 'Nikt nie jest przeciążony w najbliższych czterech tygodniach.'),
      section('Zadania po terminie', r.late.length, r.late.map(function (t) {
        return row(t.code, t.name + (t.personIds.length ? ' · ' + names(t.personIds, people) : ''), t.daysLate + ' ' + (t.daysLate === 1 ? 'dzień' : 'dni') + ' po terminie', open(t), 'bad');
      }), 'Brak zadań po terminie.'),
      section('Za mało czasu na zadanie', r.tight.length, r.tight.map(function (t) {
        return row(t.code, t.name + ' · ' + names(t.personIds, people), t.squeezed ? 'za mało czasu' : 'musi ruszyć teraz', open(t), t.squeezed ? 'bad' : 'warn');
      }), 'Każde zadanie ma dość dni do terminu.'),
      section('Niska norma w zeszłym tygodniu', r.lowTime.length, r.lowTime.map(function (l) {
        var p = Team.findPerson(people, l.personId);
        return row('', p ? Team.fullName(p) : '', E.TimeLog.duration(l.minutes) + ' z ' + E.TimeLog.duration(l.expected) + (l.badDays ? ' · ' + l.badDays + ' ' + (l.badDays === 1 ? 'czerwony dzień' : 'czerwone dni') : ''), function () { ctx.actions.inspect({ kind: 'person', personId: l.personId }); }, l.state === 'bad' ? 'bad' : 'warn');
      }), 'Wszyscy zeszłego tygodnia dobili do normy.'),
      section('Projekty bez ruchu', r.idle.length, r.idle.map(function (i) {
        return row(i.code, i.name, i.days === null ? 'brak śladu pracy' : i.days + ' dni bez pracy', function () { ctx.actions.openProject(i.projectId); }, 'warn');
      }), 'Każdy aktywny projekt miał ruch w ostatnim tygodniu.'),
      section('Pisma wymagające reakcji', r.mail.length, r.mail.map(function (m) {
        return row(m.code, m.name, m.count + ' ' + (m.count === 1 ? 'pismo' : 'pisma'), function () { ctx.actions.openProject(m.projectId, 'korespondencja'); }, 'warn');
      }), 'Brak pism czekających na reakcję.')
    ];
    // Sprawy w toku to nie „decyzje”: pokazujemy je osobno, z licznikiem dni od złożenia.
    var caseRows = E.CaseUI.reviewRows(state, ctx, sc.projectIds);
    var caseSec = section('Sprawy w toku', caseRows.length, caseRows, 'Żadna sprawa nie czeka na odpowiedź.');
    caseSec.classList.add('rv-sec--cases');
    cards.push(caseSec);
    return {
      summary: r.total ? E.Format.count(r.total, 'sprawa do decyzji', 'sprawy do decyzji', 'spraw do decyzji') : 'Nic nie wymaga teraz decyzji.',
      body: D.el('div', { class: 'rv' }, cards)
    };
  }

  E.ReviewScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
