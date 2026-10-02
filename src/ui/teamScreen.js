/* ETROM — ekran Zespołu: katalog osób z rolami i funkcjami w projektach. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Team = root.ETROM.Team;
  var Icons = root.ETROM.Icons;
  var Avatar = root.ETROM.Avatar;
  var Search = root.ETROM.Search;

  var MAX_ROLE_CHIPS = 2;

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

  function roleChips(person, projects, handlers) {
    var entries = [];
    (projects || []).forEach(function (project) {
      Team.functionsOf(person.id, project.team).forEach(function (fn) {
        entries.push({ project: project, fn: fn });
      });
    });

    if (!entries.length) {
      return D.el('span', { class: 'prow__quiet', text: 'bez przypisań' });
    }

    var shown = entries.slice(0, MAX_ROLE_CHIPS);
    var rest = entries.length - shown.length;

    var children = shown.map(function (entry) {
      return D.el('button', {
        class: 'chip chip--link',
        text: entry.project.code + ' · ' + entry.fn.short,
        attrs: {
          type: 'button',
          title: entry.fn.label + ' w projekcie ' + entry.project.name
        },
        on: { click: function () { handlers.onOpenProject(entry.project); } }
      });
    });

    if (rest > 0) {
      children.push(D.el('span', {
        class: 'prow__quiet',
        text: '+' + rest,
        attrs: {
          title: entries.slice(MAX_ROLE_CHIPS).map(function (e) {
            return e.project.code + ' — ' + e.fn.label;
          }).join('\n')
        }
      }));
    }

    return D.el('div', { class: 'prow__roles' }, children);
  }

  function personRow(person, projects, handlers) {
    var inactive = person.active === false;
    var meta = [person.position, Team.COOPERATION[person.cooperation]].filter(Boolean).join(' · ');

    return D.el('li', { class: 'prow' + (inactive ? ' prow--off' : ''), dataset: { personId: person.id } }, [
      Avatar.avatar(person, { size: 'md' }),
      D.el('div', { class: 'prow__body' }, [
        D.el('p', { class: 'prow__name' }, [
          D.el('span', { text: Team.fullName(person) }),
          inactive ? D.el('span', { class: 'chip', text: 'wyłączona' }) : null
        ].filter(Boolean)),
        D.el('p', { class: 'prow__meta', text: meta || 'Bez stanowiska' })
      ]),
      D.el('span', {
        class: 'chip ' + (person.orgRole === 'managing' ? 'chip--accent' : ''),
        text: Team.ORG_ROLES[person.orgRole]
      }),
      roleChips(person, projects, handlers),
      D.el('div', { class: 'prow__tools' }, [
        D.el('button', {
          class: 'btn btn--small btn--ghost', text: 'Edytuj',
          attrs: { type: 'button' },
          on: { click: function () { handlers.onEditPerson(person.id); } }
        }),
        D.el('button', {
          class: 'btn btn--small btn--ghost',
          text: inactive ? 'Włącz' : 'Wyłącz',
          attrs: {
            type: 'button',
            title: inactive ? 'Przywróć osobę do obiegu' : 'Wyłącz osobę z obiegu, zachowując historię'
          },
          on: { click: function () { handlers.onTogglePerson(person.id); } }
        }),
        D.el('button', {
          class: 'btn btn--icon',
          attrs: { type: 'button', title: 'Usuń z katalogu', 'aria-label': 'Usuń ' + Team.fullName(person) + ' z katalogu' },
          on: { click: function () { handlers.onDeletePerson(person.id); } }
        }, [Icons.icon('close', 15)])
      ])
    ]);
  }

  /**
   * @param {Array} people katalog osób
   * @param {Array} projects projekty (do wyliczenia funkcji)
   * @param {Object} filters {query, role, showInactive}
   * @param {Object} handlers onEditPerson, onTogglePerson, onDeletePerson, onOpenProject, onNewPerson
   */
  function teamList(people, projects, filters, handlers) {
    var all = people || [];
    var visible = visiblePeople(all, filters);

    if (!all.length) {
      return D.el('div', { class: 'empty' }, [
        D.el('p', { class: 'empty__title', text: 'Katalog osób jest pusty' }),
        D.el('p', {
          class: 'empty__text',
          text: 'Dodaj osoby, żeby przypisywać im funkcje w projektach: Lidera, Koordynatora i Pełnomocników.'
        }),
        D.el('button', {
          class: 'btn btn--primary', text: 'Nowa osoba',
          attrs: { type: 'button' }, on: { click: handlers.onNewPerson }
        })
      ]);
    }

    if (!visible.length) {
      return D.el('div', { class: 'empty' }, [
        D.el('p', { class: 'empty__title', text: 'Nikt nie pasuje do filtrów' }),
        D.el('p', { class: 'empty__text', text: 'Zmień wyszukiwaną frazę albo pokaż osoby wyłączone.' })
      ]);
    }

    return D.el('ul', { class: 'prows' }, visible.map(function (person) {
      return personRow(person, projects, handlers);
    }));
  }

  root.ETROM.TeamScreen = { teamList: teamList, visiblePeople: visiblePeople };
})(typeof globalThis !== 'undefined' ? globalThis : this);
