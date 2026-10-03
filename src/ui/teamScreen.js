/* ETROM — zespół: osoby pogrupowane według roli, z obciążeniem i udziałem
   w projektach. Tożsamość (awatar, nazwisko, stanowisko), obciążenie jako
   mikro-wykres zadań, funkcje ze znakiem stanu projektu. Klik otwiera inspektor. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Team = E.Team;
  var Avatar = E.Avatar;
  var Search = E.Search;
  var Insight = E.Insight;
  var Sig = E.Sig;
  var F = E.Format;

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
    if (query) return Search.rank(list, query, function (person) { return [Team.fullName(person), person.position]; });
    return list.slice().sort(function (a, b) {
      return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' });
    });
  }

  function roleBadges(load, now) {
    var entries = load.functions;
    if (!entries.length) return D.el('span', { class: 't-muted', text: 'Bez przypisań' });
    var shown = entries.slice(0, MAX_ROLE_BADGES);
    var rest = entries.length - shown.length;
    var children = shown.map(function (entry) {
      var h = Insight.health(entry.project, now);
      return D.el('a', {
        class: 'role-link',
        attrs: {
          href: E.ProjectList.projectHref(entry.project, 'zespol'),
          'data-tooltip': entry.fn.label + ' — ' + entry.project.name + ' (' + h.label.toLowerCase() + ')',
          'aria-label': entry.fn.label + ' w projekcie ' + entry.project.code + ' ' + entry.project.name
        }
      }, [Sig.datum(h.level, { size: 11, label: false }), D.el('span', { class: 'role-link__code', style: E.Identity.hueStyle(entry.project.code), text: entry.project.code }), D.el('span', { class: 'role-link__fn', text: entry.fn.short })]);
    });
    if (rest > 0) {
      children.push(D.el('span', {
        class: 'role-more',
        text: '+' + rest,
        attrs: { 'data-tooltip': entries.slice(MAX_ROLE_BADGES).map(function (e) { return e.project.code + ' ' + e.fn.label; }).join(', '), tabindex: '0' }
      }));
    }
    return D.el('div', { class: 'role-list' }, children);
  }

  /**
   * Obciążenie: liczba otwartych zadań i zaległości; dla zarządu dodatkowo wskaźnik pojemności
   * (średnia godzin z 4 tygodni wobec 40 h): procent, pasek i godziny.
   * @param {{open:number, overdue:number}} load
   * @param {{utilization:number, avg4:number, capacity:number}} [cap]
   */
  function loadMeter(load, cap) {
    var tasks = D.el('span', { class: 'load__tasks t-num' + (load.overdue ? ' t-alarm' : (load.open ? '' : ' t-muted')), text: load.open
      ? F.count(load.open, 'zadanie', 'zadania', 'zadań') + (load.overdue ? ' · ' + load.overdue + ' po term.' : '')
      : 'brak zadań' });
    var label = 'Otwarte zadania: ' + load.open + (load.overdue ? ', po terminie: ' + load.overdue : '');
    if (!cap) return D.el('div', { class: 'load', attrs: { role: 'img', 'aria-label': label } }, [tasks]);
    var u = cap.utilization;
    var tone = u > 110 ? 'over' : (u >= 85 ? 'high' : (u < 40 ? 'free' : 'ok'));
    var note = { over: 'przeciążenie', high: 'pełne obłożenie', ok: 'w normie', free: 'wolna przepustowość' }[tone];
    return D.el('div', { class: 'load load--cap load--' + tone, attrs: { role: 'img', 'aria-label': label + '. Obciążenie ' + u + '% (' + cap.avg4 + ' z ' + cap.capacity + ' godzin tygodniowo, średnia z 4 tygodni) — ' + note }, dataset: { util: String(u) } }, [
      D.el('span', { class: 'load__pct t-num', text: u + '%' }),
      D.el('span', { class: 'load__bar', attrs: { 'aria-hidden': 'true' } }, [D.el('span', { class: 'load__fill', style: { width: Math.min(100, u) + '%' } })]),
      D.el('span', { class: 'load__sub' }, [
        D.el('span', { class: 't-num', text: cap.avg4 + ' / ' + cap.capacity + ' h' }),
        D.el('span', { class: 'load__note', text: ' · ' + note })
      ]),
      tasks
    ]);
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
          { label: 'Szczegóły', icon: 'inspector', onSelect: function () { actions.inspect({ kind: 'person', personId: person.id }); } },
          { label: 'Edytuj dane', icon: 'edit', onSelect: function () { actions.editPerson(person.id); } },
          { label: inactive ? 'Przywróć do obiegu' : 'Wyłącz z obiegu', icon: 'power', value: 'toggle', hint: inactive ? '' : 'historia zostaje', onSelect: function () { actions.togglePerson(person.id); } },
          { type: 'separator' },
          { label: 'Usuń z katalogu', icon: 'trash', tone: 'danger', onSelect: function () { actions.deletePerson(person.id); } }
        ]
      };
    });
    return btn;
  }

  function personRow(person, projects, actions, now, cap) {
    var inactive = person.active === false;
    var load = Insight.workload(person.id, projects, now);
    var inspected = actions.isInspected && actions.isInspected('person', person.id);
    return D.el('tr', {
      class: 'prow table__row' + (inactive ? ' prow--off' : '') + (inspected ? ' is-inspected' : ''),
      dataset: { personId: person.id },
      on: {
        click: function (event) {
          if (event.target.closest('a, button, input, label')) return;
          actions.inspect({ kind: 'person', personId: person.id });
        }
      }
    }, [
      D.el('td', { class: 'col-person' }, [D.el('span', { class: 'person' }, [
        Avatar.avatar(person, { size: 'md', tooltip: false }),
        D.el('span', { class: 'person__text' }, [
          D.el('button', {
            class: 'person__name person__link',
            text: Team.fullName(person),
            attrs: { type: 'button', 'aria-label': 'Szczegóły: ' + Team.fullName(person), 'data-fk': 'person-' + person.id },
            on: { click: function () { actions.inspect({ kind: 'person', personId: person.id }); } }
          }),
          D.el('span', { class: 'person__meta', text: [person.position || 'Bez stanowiska', Team.COOPERATION[person.cooperation]].filter(Boolean).join(', ') })
        ])
      ])]),
      D.el('td', { class: 'col-load' }, [loadMeter(load, cap)]),
      D.el('td', { class: 'col-projects t-num' }, [D.el('span', { class: load.projects ? '' : 't-muted', text: load.projects ? String(load.projects) : '—', attrs: { 'aria-label': 'Czynne projekty: ' + load.projects } })]),
      D.el('td', { class: 'col-functions' }, [roleBadges(load, now)]),
      D.el('td', { class: 'col-state' }, [inactive ? UI.badge('Wyłączona', 'warning') : null]),
      D.el('td', { class: 'cell--actions' }, [personMenu(person, actions)])
    ]);
  }

  var GROUPS = [
    { key: 'managing', label: 'Zarządzający', test: function (p) { return p.active !== false && p.orgRole === 'managing'; } },
    { key: 'member', label: 'Zespół projektowy', test: function (p) { return p.active !== false && p.orgRole !== 'managing'; } },
    { key: 'off', label: 'Wyłączeni z obiegu', test: function (p) { return p.active === false; } }
  ];

  /** Podgląd katalogu z danymi: prawdziwe składniki, w miejscu tekstu zaślepki. */
  function teamPreview() {
    var rows = [
      { load: { open: 3, overdue: 0 }, fns: ['alarm', 'normal'], w: ['7.5rem', '10rem'] },
      { load: { open: 6, overdue: 1 }, fns: ['warning', 'normal'], w: ['6rem', '8.5rem'] },
      { load: { open: 1, overdue: 0 }, fns: ['normal'], w: ['8.5rem', '6.5rem'] },
      { load: { open: 0, overdue: 0 }, fns: [], w: ['6.5rem', '9rem'] }
    ];
    return D.el('div', { class: 'preview preview--team' }, [
      D.el('div', { class: 'preview__head' }, [D.el('span', { text: 'Osoba' }), D.el('span', { text: 'Otwarte zadania' }), D.el('span', { text: 'Funkcje' })]),
      D.el('div', { class: 'preview__group', text: 'Zarządzający' })
    ].concat(rows.map(function (r, index) {
      return D.el('div', { class: 'preview__row' + (index === 1 ? ' preview__row--lit' : '') }, [
        D.el('span', { class: 'preview__person' }, [
          D.el('span', { class: 'preview__avatar', style: { '--avatar-h': String([210, 150, 30, 280][index]) } }),
          D.el('span', { class: 'preview__lines' }, [UI.ghost(r.w[0]), UI.ghost(r.w[1])])
        ]),
        loadMeter(r.load),
        D.el('span', { class: 'preview__chips' }, r.fns.map(function (level) {
          return D.el('span', { class: 'preview__chip' }, [Sig.datum(level, { size: 10, label: false }), UI.ghost('3.25rem')]);
        }))
      ]);
    })));
  }

  function emptyTeam(projects, actions) {
    var count = (projects || []).length;
    return UI.onboarding({
      id: 'team-onboard-title',
      class: 'onboard--team',
      title: 'Zbuduj katalog zespołu',
      text: count
        ? 'W portfelu jest już ' + F.count(count, 'projekt', 'projekty', 'projektów') + ' bez przypisanego zespołu. Dodaj osoby biura — potem wskażesz je jako Lidera, Koordynatora czy realizatorów zadań.'
        : 'Osoby z katalogu pełnią funkcje w projektach i realizują zadania. Tu zobaczysz, ile pracy ma każda z nich i w których projektach.',
      steps: [
        { title: 'Dodaj osoby', text: 'Imię, stanowisko, rola w biurze i forma współpracy.' },
        { title: 'Przypisz funkcje w projektach', text: 'Lider, Koordynator i Pełnomocnicy — w edycji projektu.' },
        { title: 'Rozdzielaj zadania', text: 'Obciążenie każdej osoby policzy się samo.' }
      ],
      actions: [
        UI.button({ label: 'Dodaj pierwszą osobę', icon: 'plus', variant: 'primary', kbd: 'N', attrs: { id: 'team-empty-new' }, onClick: actions.newPerson }),
        actions.loadDemo ? UI.button({ label: 'Dodaj dane przykładowe', icon: 'sparkle', variant: 'secondary', onClick: actions.loadDemo }) : null
      ].filter(Boolean),
      preview: teamPreview(),
      previewLabel: 'Tak wygląda katalog z danymi: obciążenie i funkcje każdej osoby w jednym wierszu.'
    });
  }

  function teamList(people, projects, filters, actions, capacity) {
    var all = people || [];
    var visible = visiblePeople(all, filters);
    var now = new Date();

    if (!all.length) return emptyTeam(projects, actions);
    if (!visible.length) {
      return D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'search', compact: true,
        title: 'Nikt nie pasuje do filtrów',
        text: 'Zmień frazę, wybierz inną rolę albo pokaż także osoby wyłączone z obiegu.',
        actions: [UI.button({ label: 'Wyczyść filtry', variant: 'secondary', onClick: actions.clearTeamFilters })]
      })]);
    }

    var head = D.el('thead', null, [D.el('tr', null, [
      D.el('th', { class: 'col-person', attrs: { scope: 'col' }, text: 'Osoba' }),
      D.el('th', { class: 'col-load', attrs: { scope: 'col' }, text: capacity ? 'Obciążenie' : 'Otwarte zadania' }),
      D.el('th', { class: 'col-projects', attrs: { scope: 'col' }, text: 'Projekty' }),
      D.el('th', { class: 'col-functions', attrs: { scope: 'col' }, text: 'Funkcje' }),
      D.el('th', { class: 'col-state', attrs: { scope: 'col' } }, [D.el('span', { class: 'sr-only', text: 'Stan' })]),
      D.el('th', { class: 'cell--actions', attrs: { scope: 'col' } }, [D.el('span', { class: 'sr-only', text: 'Działania' })])
    ])]);

    var bodies = GROUPS.map(function (group) {
      var members = visible.filter(group.test);
      if (!members.length) return null;
      return D.el('tbody', { class: 'group' }, [D.el('tr', { class: 'group-row' }, [
        D.el('th', { attrs: { colspan: '6', scope: 'rowgroup' } }, [D.el('span', { class: 'group-row__inner' }, [
          D.el('span', { class: 'group-row__label', text: group.label }),
          D.el('span', { class: 'group-row__count', text: String(members.length) })
        ])])
      ])].concat(members.map(function (person) { return personRow(person, projects, actions, now, capacity ? capacity[person.id] : null); })));
    }).filter(Boolean);

    return D.el('div', { class: 'table-wrap team-table' }, [
      D.el('table', { class: 'table', attrs: { 'aria-label': 'Katalog osób' } }, [head].concat(bodies))
    ]);
  }

  /** Podsumowanie zespołu do nagłówka: kto jest najbardziej obciążony. */
  function summary(people, projects) {
    var active = (people || []).filter(function (p) { return p.active !== false; });
    var now = new Date();
    var loads = active.map(function (p) { return { person: p, load: Insight.workload(p.id, projects, now) }; });
    var busy = loads.filter(function (l) { return l.load.projects > 0; }).length;
    var top = loads.slice().sort(function (a, b) { return b.load.open - a.load.open; })[0];
    var late = loads.reduce(function (sum, l) { return sum + l.load.overdue; }, 0);
    return { active: active.length, busy: busy, top: top && top.load.open ? top : null, late: late };
  }

  root.ETROM.TeamScreen = { teamList: teamList, visiblePeople: visiblePeople, summary: summary };
})(typeof globalThis !== 'undefined' ? globalThis : this);
