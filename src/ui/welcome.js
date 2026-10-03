/* ETROM — ekran startowy: trzy kroki do działającej aplikacji (zespół, „kim jestem”, pierwszy projekt).
   Jedna karta dla wszystkich ekranów, które bez tych kroków nie mają co pokazać. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Icons = E.Icons;
  var Team = E.Team;

  function step(n, done, title, text, body) {
    return D.el('li', { class: 'wl__step' + (done ? ' is-done' : ''), dataset: { step: n } }, [
      D.el('span', { class: 'wl__n', attrs: { 'aria-hidden': 'true' } }, [done ? Icons.icon('check', 14) : D.el('span', { text: String(n) })]),
      D.el('div', { class: 'wl__body' }, [
        D.el('strong', { text: title }),
        D.el('p', { class: 'wl__text', text: text }),
        body || null
      ])
    ]);
  }

  /** @param {string} lead zdanie o tym, czego ekran potrzebuje (np. „Skrzynka zbiera rzeczy…”) */
  function card(state, ctx, lead) {
    var people = (state.workspace.people || []).filter(function (p) { return p.active !== false; });
    var projects = state.workspace.projects || [];
    var me = Team.findPerson(state.workspace.people || [], state.prefs.me);
    var a = ctx.actions;

    var pick = people.length && !me ? D.el('div', { class: 'wl__who', attrs: { role: 'group', 'aria-label': 'Kim jesteś' } }, people.slice(0, 8).map(function (p) {
      return D.el('button', { class: 'wl__chip', attrs: { type: 'button', 'data-fk': 'wl-me-' + p.id }, on: { click: function () { a.setMe(p.id); } } }, [E.Avatar.avatar(p, { size: 'sm' }), D.el('span', { text: Team.fullName(p) })]);
    })) : null;

    return D.el('section', { class: 'wl', attrs: { 'aria-label': 'Pierwsze kroki' } }, [
      D.el('div', { class: 'wl__intro' }, [
        D.el('h2', { class: 'wl__title', text: 'Zacznijmy od trzech kroków' }),
        D.el('p', { class: 'wl__lead', text: lead })
      ]),
      D.el('ol', { class: 'wl__steps' }, [
        step(1, people.length > 0, 'Dodaj osoby do zespołu', people.length ? 'W katalogu jest ' + E.Format.count(people.length, 'osoba', 'osoby', 'osób') + '.' : 'Imię, stanowisko i rola w biurze — to z nich wybierasz lidera i wykonawców.',
          people.length ? null : UI.button({ label: 'Dodaj pierwszą osobę', icon: 'plus', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'wl-add-person' }, onClick: function () { a.newPerson(); } })),
        step(2, !!me, 'Wybierz, kim jesteś', me ? 'Pracujesz jako ' + Team.fullName(me) + '.' : (people.length ? 'Ekrany pokażą Twoje zadania i to, co czeka na Twoją decyzję.' : 'Najpierw dodaj osoby, potem wskażesz siebie jednym kliknięciem.'), pick),
        step(3, projects.length > 0, 'Załóż pierwszy projekt', projects.length ? 'W portfelu jest ' + E.Format.count(projects.length, 'projekt', 'projekty', 'projektów') + '.' : 'Umowa, etapy ze standardu ETROM i zespół. Reszta liczy się sama.',
          projects.length ? null : UI.button({ label: 'Nowy projekt', icon: 'plus', variant: people.length ? 'primary' : 'secondary', size: 'sm', attrs: { 'data-fk': 'wl-add-project' }, onClick: function () { a.openCreate(); } }))
      ]),
      D.el('div', { class: 'wl__foot' }, [
        D.el('span', { class: 't-meta', text: 'Chcesz tylko obejrzeć, jak to działa?' }),
        UI.button({ label: 'Wczytaj dane przykładowe', icon: 'sparkle', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'wl-demo' }, onClick: function () { a.loadDemo(); } })
      ])
    ]);
  }

  root.ETROM.Welcome = { card: card };
})(typeof globalThis !== 'undefined' ? globalThis : this);
