/* ETROM — zespół, zakładka „Konta i role" (tylko dyrekcja): konta, role, stawki, urlop,
   macierz „kto co widzi" i dziennik zmian. Dane kont to stan, nie hasła. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Team = E.Team;
  var Acc = E.Accounts;
  var Avatar = E.Avatar;
  var Insight = E.Insight;

  var STATUS_TONE = { none: 'outline', invited: 'warning', active: 'success', disabled: 'outline' };

  function dayLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    var same = d.toDateString() === now.toDateString();
    var yest = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (same) return 'dziś ' + hm;
    if (yest) return 'wczoraj';
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }

  function statusBadge(person) {
    var st = Acc.statusOf(person);
    var extra = '';
    if (st === 'active' && person.account.lastLoginAt) extra = ' · ' + dayLabel(person.account.lastLoginAt);
    return UI.badge(Acc.STATUS[st] + extra, STATUS_TONE[st], { attrs: { 'data-account-status': st } });
  }

  function roleBadge(person) {
    var coop = person.cooperation && person.cooperation !== 'internal' ? Team.COOPERATION[person.cooperation] : '';
    if (person.orgRole === 'managing') return UI.badge('Dyrekcja', 'info');
    return UI.badge(coop || Team.ORG_ROLES.member, coop ? 'warning' : 'outline');
  }

  function functions(person, projects, now) {
    var load = Insight.workload(person.id, projects, now);
    if (!load.functions.length) return D.el('span', { class: 't-muted', text: 'brak' });
    return D.el('div', { class: 'role-list' }, load.functions.slice(0, 4).map(function (entry) {
      return D.el('span', { class: 'role-link', attrs: { 'data-tooltip': entry.fn.label + ' — ' + entry.project.name } }, [
        D.el('span', { class: 'role-link__code', style: E.Identity.hueStyle(entry.project.code), text: entry.project.code }),
        D.el('span', { class: 'role-link__fn', text: entry.fn.short })
      ]);
    }));
  }

  function rowMenu(person, actions) {
    var st = Acc.statusOf(person);
    var btn = UI.iconButton({ icon: 'more', label: 'Działania konta: ' + Team.fullName(person), size: 'sm', class: 'row-actions', attrs: { 'data-fk': 'account-more-' + person.id } });
    Menu.bind(btn, function () {
      var items = [{ label: 'Zmień rolę, stawkę i urlop', icon: 'edit', onSelect: function () { actions.editPerson(person.id); } }];
      if (st === 'none') items.push({ label: 'Załóż konto', icon: 'person', onSelect: function () { actions.createAccount(person.id); } });
      else if (st !== 'disabled') items.push({ label: 'Ustaw nowe hasło tymczasowe', onSelect: function () { actions.resetPassword(person.id); } });
      if (st === 'disabled') items.push({ label: 'Przywróć konto', icon: 'power', onSelect: function () { actions.enableAccount(person.id); } });
      else if (st !== 'none') items.push({ type: 'separator' }, { label: 'Wyłącz konto', icon: 'power', tone: 'danger', hint: 'historia zostaje', onSelect: function () { actions.disableAccount(person.id); } });
      return { label: 'Działania konta', align: 'end', items: items };
    });
    return btn;
  }

  function row(person, projects, actions, now) {
    var st = Acc.statusOf(person);
    var rate = Number(person.hourlyCost) > 0 ? String(person.hourlyCost).replace('.', ',') + ' zł/h' : '—';
    var leave = person.cooperation === 'internal' || !person.cooperation ? String(person.leaveDays || E.Absences.DEFAULT_LEAVE_DAYS) : (person.leaveDays ? String(person.leaveDays) : '—');
    return D.el('tr', { class: 'prow table__row' + (st === 'disabled' ? ' prow--off' : ''), dataset: { personId: person.id } }, [
      D.el('td', { class: 'col-person' }, [D.el('span', { class: 'person' }, [
        Avatar.avatar(person, { size: 'md', tooltip: false }),
        D.el('span', { class: 'person__text' }, [
          D.el('span', { class: 'person__name', text: Team.fullName(person) }),
          D.el('span', { class: 'person__meta', text: person.email || 'brak adresu e-mail' })
        ])
      ])]),
      D.el('td', null, [roleBadge(person)]),
      D.el('td', null, [statusBadge(person)]),
      D.el('td', { class: 't-num', text: leave }),
      D.el('td', { class: 't-num', text: rate }),
      D.el('td', null, [functions(person, projects, now)]),
      D.el('td', { class: 'cell--actions' }, [rowMenu(person, actions)])
    ]);
  }

  var MATRIX = [
    ['Własne zadania, terminy, wpisy czasu', 'y', 'y', 'y', 'y'],
    ['Godziny zaplanowane i budżet projektu', 'y', 'y', 'n', 'n'],
    ['Cudzy czas pracy', 'y', 'y', 'n', 'n'],
    ['Stawki godzinowe', 'y', 'n', 'n', 'n'],
    ['Zamrożone zadania i plan wstępny', 'y', 'y', 'n', 'n'],
    ['Plan i wnioski urlopowe zespołu', 'y', 'o', 'n', 'n'],
    ['Sprawy w toku, korespondencja', 'y', 'y', 'y', 'y'],
    ['Nieobecność innych (bez rodzaju)', 'y', 'y', 'y', 'y']
  ];

  function matrix() {
    var mark = { y: ['✓', 'Tak'], n: ['—', 'Nie'], o: ['opinia', 'Tylko opinia'] };
    var head = D.el('thead', null, [D.el('tr', null, [D.el('th', { attrs: { scope: 'col' }, text: 'Dane' })].concat(['Dyrekcja', 'Lider*', 'Koordynator', 'Pracownik'].map(function (t) { return D.el('th', { class: 'ac-cell', attrs: { scope: 'col' }, text: t }); })))]);
    var body = D.el('tbody', null, MATRIX.map(function (r) {
      return D.el('tr', null, [D.el('th', { attrs: { scope: 'row' }, text: r[0] })].concat(r.slice(1).map(function (k) {
        return D.el('td', { class: 'ac-cell ac-cell--' + k, attrs: { 'aria-label': mark[k][1] }, text: mark[k][0] });
      })));
    }));
    return D.el('section', { class: 'ac-card' }, [
      D.el('h2', { class: 'ac-card__title', text: 'Kto co widzi' }),
      D.el('div', { class: 'table-wrap' }, [D.el('table', { class: 'table ac-matrix', attrs: { 'aria-label': 'Macierz uprawnień' } }, [head, body])]),
      D.el('p', { class: 't-meta', text: '* Lider widzi te dane tylko w projektach, w których jest liderem. Wnioski urlopowe rozpatruje dyrekcja, lider dopisuje opinię. Lider i koordynator to funkcje w projekcie, a nie konta.' }),
      D.el('p', { class: 't-meta', text: 'Do czasu przejścia na serwer aplikacja ukrywa te dane w interfejsie. Pełną ochronę zapewni dopiero serwer, który nie wyśle ich osobie bez uprawnień.' })
    ]);
  }

  function auditCard(state) {
    var log = (state.workspace.audit || []).slice(-8).reverse();
    var people = state.workspace.people || [];
    var name = function (id) { var p = Team.findPerson(people, id); return p ? Team.fullName(p) : '—'; };
    return D.el('section', { class: 'ac-card' }, [
      D.el('h2', { class: 'ac-card__title', text: 'Dziennik zmian' }),
      log.length
        ? D.el('ul', { class: 'ac-log' }, log.map(function (r) {
          return D.el('li', null, [
            D.el('span', { class: 'ac-log__when t-num', text: dayLabel(r.at) }),
            D.el('span', { text: Acc.ACTIONS[r.action] + ': ' + name(r.target) + (r.detail ? ' (' + r.detail + ')' : '') }),
            D.el('span', { class: 't-meta', text: 'przez ' + name(r.by) })
          ]);
        }))
        : D.el('p', { class: 't-meta', text: 'Zmiany ról, stawek, kont i haseł pojawią się tu z autorem i datą.' })
    ]);
  }

  /** Zakładka kont. Zwraca węzeł; `actions` dostarcza app.js. */
  function view(state, actions) {
    var list = (state.workspace.people || []).slice().sort(function (a, b) {
      var ao = a.active === false ? 1 : 0, bo = b.active === false ? 1 : 0;
      if (ao !== bo) return ao - bo;
      if (a.orgRole !== b.orgRole) return a.orgRole === 'managing' ? -1 : 1;
      return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' });
    });
    var now = new Date();
    var counts = { active: 0, invited: 0, none: 0 };
    list.forEach(function (p) { var s = Acc.statusOf(p); if (counts[s] != null) counts[s] += 1; });
    var head = D.el('thead', null, [D.el('tr', null, ['Osoba', 'Rola', 'Konto', 'Urlop (dni)', 'Stawka', 'Funkcje w projektach'].map(function (t) { return D.el('th', { attrs: { scope: 'col' }, text: t }); }).concat([D.el('th', { class: 'cell--actions', attrs: { scope: 'col' } }, [D.el('span', { class: 'sr-only', text: 'Działania' })])]))]);
    var table = D.el('div', { class: 'table-wrap team-table' }, [
      D.el('table', { class: 'table ac-table', attrs: { 'aria-label': 'Konta i role' } }, [head, D.el('tbody', null, list.map(function (p) { return row(p, state.workspace.projects, actions, now); }))])
    ]);
    return D.el('div', { class: 'ac' }, [
      D.el('div', { class: 'ac-bar' }, [
        D.el('span', { class: 't-meta', text: counts.active + ' aktywnych · ' + counts.invited + ' czeka na pierwsze logowanie · ' + counts.none + ' bez konta' }),
        UI.button({ label: 'Dodaj osobę z kontem', icon: 'plus', variant: 'primary', attrs: { id: 'ac-new' }, onClick: actions.newPerson })
      ]),
      table,
      D.el('p', { class: 't-meta', text: 'Konto wyłączamy, nie usuwamy: wpisy czasu i historia osoby zostają. Nie da się wyłączyć ostatniego konta dyrekcji.' }),
      D.el('div', { class: 'ac-grid' }, [matrix(), auditCard(state)])
    ]);
  }

  root.ETROM.AccountsScreen = { view: view };
})(typeof globalThis !== 'undefined' ? globalThis : this);
