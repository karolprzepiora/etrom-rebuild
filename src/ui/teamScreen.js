/* ETROM — ekran Zespołu: katalog osób w tabeli.
   Osoba, stanowisko, rola, forma współpracy, funkcje w projektach (linki)
   i stan. Rzadkie działania (wyłączenie, usunięcie) siedzą w menu wiersza. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Team = E.Team;
  var Avatar = E.Avatar;
  var Search = E.Search;

  var MAX_ROLE_BADGES = 2;

  /** Filtruje i porządkuje katalog osób. Czysta funkcja. */
  function visiblePeople(people, filters) {
    var options = filters || {};
    var list = (people || []).filter(function (person) {
      if (!options.showInactive && person.active === false) return false;
      if (options.role && options.role !== 'all' && person.orgRole !== options.role) return false;
      return true;
    });

    var query = typeof options.query === 'string' ? options.query.trim() : '';
    if (query) {
      return Search.rank(list, query, function (person) {
        return [Team.fullName(person), person.position];
      });
    }

    return list.slice().sort(function (a, b) {
      return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' });
    });
  }

  function roleBadges(person, projects) {
    var entries = [];
    (projects || []).forEach(function (project) {
      Team.functionsOf(person.id, project.team).forEach(function (fn) {
        entries.push({ project: project, fn: fn });
      });
    });

    if (!entries.length) return D.el('span', { class: 't-muted', text: 'Bez przypisań' });

    var shown = entries.slice(0, MAX_ROLE_BADGES);
    var rest = entries.length - shown.length;
    var children = shown.map(function (entry) {
      return D.el('a', {
        class: 'badge badge--outline role-link',
        attrs: {
          href: E.ProjectList.projectHref(entry.project, 'zespol'),
          'data-tooltip': entry.fn.label + ' — ' + entry.project.name,
          'aria-label': entry.fn.label + ' w projekcie ' + entry.project.code + ' ' + entry.project.name
        }
      }, [
        D.el('span', { class: 't-mono', text: entry.project.code }),
        D.el('span', { text: '· ' + entry.fn.short })
      ]);
    });
    if (rest > 0) {
      children.push(D.el('span', {
        class: 'badge',
        text: '+' + rest,
        attrs: {
          'data-tooltip': entries.slice(MAX_ROLE_BADGES).map(function (e) { return e.project.code + ' — ' + e.fn.label; }).join(', '),
          tabindex: '0'
        }
      }));
    }
    return D.el('div', { class: 'role-list' }, children);
  }

  function personMenu(person, actions) {
    var inactive = person.active === false;
    var btn = UI.iconButton({
      icon: 'more', label: 'Działania: ' + Team.fullName(person), size: 'sm', class: 'row-actions',
      attrs: { 'data-fk': 'person-more-' + person.id }
    });
    Menu.bind(btn, function () {
      return {
        label: 'Działania osoby', align: 'end',
        items: [
          { label: 'Edytuj dane', icon: 'edit', onSelect: function () { actions.editPerson(person.id); } },
          {
            label: inactive ? 'Przywróć do obiegu' : 'Wyłącz z obiegu', icon: 'power', value: 'toggle',
            hint: inactive ? '' : 'historia zostaje',
            onSelect: function () { actions.togglePerson(person.id); }
          },
          { type: 'separator' },
          { label: 'Usuń z katalogu', icon: 'trash', tone: 'danger', onSelect: function () { actions.deletePerson(person.id); } }
        ]
      };
    });
    return btn;
  }

  function personRow(person, projects, actions) {
    var inactive = person.active === false;
    return D.el('tr', {
      class: 'prow table__row' + (inactive ? ' prow--off' : ''),
      dataset: { personId: person.id },
      on: {
        click: function (event) {
          if (event.target.closest('a, button, input, label')) return;
          actions.editPerson(person.id);
        }
      }
    }, [
      D.el('td', null, [D.el('span', { class: 'person' }, [
        Avatar.avatar(person, { size: 'md', tooltip: false }),
        D.el('span', { class: 'person__text' }, [
          D.el('button', {
            class: 'person__name person__link',
            text: Team.fullName(person),
            attrs: { type: 'button', 'aria-label': 'Edytuj: ' + Team.fullName(person), 'data-fk': 'person-' + person.id },
            on: { click: function () { actions.editPerson(person.id); } }
          }),
          D.el('span', {
            class: 'person__meta',
            text: [person.position || 'Bez stanowiska', Team.COOPERATION[person.cooperation]].filter(Boolean).join(' · ')
          })
        ])
      ])]),
      D.el('td', { class: 'col-role' }, [
        person.orgRole === 'managing'
          ? UI.badge(Team.ORG_ROLES[person.orgRole])
          : D.el('span', { class: 't-secondary-cell', text: Team.ORG_ROLES[person.orgRole] })
      ]),
      D.el('td', { class: 'col-functions' }, [roleBadges(person, projects)]),
      D.el('td', { class: 'col-state' }, [
        inactive
          ? D.el('span', { class: 'status status--neutral' }, [UI.statusIcon('paused'), D.el('span', { text: 'Wyłączona' })])
          : D.el('span', { class: 'status status--success' }, [UI.statusIcon('done'), D.el('span', { text: 'Aktywna' })])
      ]),
      D.el('td', { class: 'cell--actions' }, [personMenu(person, actions)])
    ]);
  }

  /**
   * @param {Array} people katalog osób
   * @param {Array} projects projekty (do wyliczenia funkcji)
   * @param {Object} filters {query, role, showInactive}
   * @param {Object} actions editPerson, togglePerson, deletePerson, newPerson, clearTeamFilters
   */
  function teamList(people, projects, filters, actions) {
    var all = people || [];
    var visible = visiblePeople(all, filters);

    if (!all.length) {
      return D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'people',
        title: 'Katalog osób jest pusty',
        text: 'Dodaj osoby, żeby przypisywać im funkcje w projektach — Lidera, Koordynatora, Pełnomocników — i wskazywać realizatorów zadań.',
        actions: [UI.button({ label: 'Nowa osoba', icon: 'plus', variant: 'primary', onClick: actions.newPerson })]
      })]);
    }

    if (!visible.length) {
      return D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'search',
        title: 'Nikt nie pasuje do filtrów',
        text: 'Zmień frazę, wybierz inną rolę albo pokaż także osoby wyłączone z obiegu.',
        actions: [UI.button({ label: 'Wyczyść filtry', variant: 'secondary', onClick: actions.clearTeamFilters })]
      })]);
    }

    var head = D.el('thead', null, [D.el('tr', null, [
      D.el('th', { attrs: { scope: 'col' }, text: 'Osoba' }),
      D.el('th', { class: 'col-role', attrs: { scope: 'col' }, text: 'Rola' }),
      D.el('th', { class: 'col-functions', attrs: { scope: 'col' }, text: 'Funkcje w projektach' }),
      D.el('th', { class: 'col-state', attrs: { scope: 'col' }, text: 'Stan' }),
      D.el('th', { class: 'cell--actions', attrs: { scope: 'col' } }, [D.el('span', { class: 'sr-only', text: 'Działania' })])
    ])]);

    return D.el('div', { class: 'table-wrap team-table' }, [
      D.el('table', { class: 'table', attrs: { 'aria-label': 'Katalog osób' } }, [
        head,
        D.el('tbody', null, visible.map(function (person) { return personRow(person, projects, actions); }))
      ])
    ]);
  }

  root.ETROM.TeamScreen = { teamList: teamList, visiblePeople: visiblePeople };
})(typeof globalThis !== 'undefined' ? globalThis : this);
