/* ETROM — portfel projektów: kokpit stanu, lista grupowana według stanu i karty.
   Lista czyta się od lewej: znak stanu → projekt → profil przebiegu → termin → ludzie. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Menu = E.Menu;
  var Model = E.Model;
  var Progress = E.Progress;
  var Team = E.Team;
  var Tasks = E.Tasks;
  var Avatar = E.Avatar;
  var Insight = E.Insight;
  var Sig = E.Sig;
  var Icons = E.Icons;
  var F = E.Format;

  var PAGE_SIZE = 50;

  // Kolumny, które można ukryć w opcjach widoku (klucze zgodne z Prefs.COLUMNS).
  var COLUMNS = [
    { key: 'client', label: 'Zamawiający (pod nazwą)', optional: true },
    { key: 'team', label: 'Lider', optional: true },
    { key: 'time', label: 'Czas umowy', optional: true },
    { key: 'deadline', label: 'Najbliższy termin', sort: 'deadline', optional: true },
    { key: 'tasks', label: 'Sygnały', optional: true }
  ];

  var GROUP_ORDER = {
    health: ['alarm', 'warning', 'normal', 'closed'],
    status: ['active', 'planned', 'paused', 'done']
  };

  function projectHref(project, tab) {
    return '#/projekty/' + project.id + (tab ? '/' + tab : '');
  }

  function people(ctx, project) {
    var ids = Team.projectPeople(project.team);
    return ids.map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
  }

  function projectMenuItems(project, actions, options) {
    var settings = options || {};
    var pinned = actions.isPinned && actions.isPinned(project.id);
    var items = [];
    if (!settings.inDetail) {
      items.push({ label: 'Otwórz', icon: 'arrowUpRight', onSelect: function () { actions.openProject(project.id); } });
      items.push({ label: 'Podgląd', icon: 'inspector', hint: 'Spacja', onSelect: function () { actions.inspect({ kind: 'project', projectId: project.id }); } });
    }
    items.push({ label: 'Edytuj dane i zespół', icon: 'edit', onSelect: function () { actions.editProject(project.id); } });
    if (actions.togglePin) items.push({ label: pinned ? 'Odepnij z panelu' : 'Przypnij w panelu', icon: pinned ? 'pinOff' : 'pin', onSelect: function () { actions.togglePin(project.id); } });
    items.push({ type: 'separator' }, { type: 'label', label: 'Status projektu' });
    Object.keys(Model.PROJECT_STATUS).forEach(function (key) {
      items.push({
        type: 'radio', label: Model.PROJECT_STATUS[key], checked: project.status === key, value: key,
        leading: UI.statusGlyph('project', key),
        onSelect: function () { actions.setProjectStatus([project.id], key); }
      });
    });
    items.push({ type: 'separator' });
    items.push({ label: 'Usuń projekt', icon: 'trash', tone: 'danger', onSelect: function () { actions.deleteProjects([project.id]); } });
    return items;
  }

  function moreButton(project, actions, extraClass) {
    var btn = UI.iconButton({
      icon: 'more', label: 'Działania: ' + project.code, size: 'sm',
      class: UI.cx('row-actions', extraClass),
      attrs: { 'data-fk': 'more-' + project.id }
    });
    Menu.bind(btn, function () {
      return { label: 'Działania projektu ' + project.code, align: 'end', items: projectMenuItems(project, actions) };
    });
    return btn;
  }

  /* ---------- Wspólne drobiazgi ---------- */

  function shortName(person) {
    if (!person) return '';
    var last = String(person.lastName || '').trim();
    return String(person.firstName || '').trim() + (last ? ' ' + last.charAt(0) + '.' : '');
  }

  function relDays(days) {
    if (days === 0) return 'dziś';
    if (days === 1) return 'jutro';
    if (days === -1) return '1 dzień po terminie';
    if (days < 0) return (-days) + ' dni po terminie';
    return 'za ' + days + ' dni';
  }

  function mailList(ctx) {
    return (ctx.state.workspace && ctx.state.workspace.mail) || [];
  }

  /** Najbliższy termin projektu: zadanie, odpowiedź na pismo albo termin umowy (zaległe pierwsze). */
  function nearest(project, ctx, now) {
    return Insight.dueItems([project], mailList(ctx), now, 3650)[0] || null;
  }

  /** Grupy listy: uwaga / w normie / zakończone zamiast czterech poziomów stanu. */
  var GROUP_LABELS = { attention: 'Wymaga uwagi', normal: 'W normie', closed: 'Zakończone' };
  function groupKey(project, groupBy, now) {
    if (groupBy === 'status') return project.status;
    if (groupBy === 'health') {
      var level = Insight.health(project, now).level;
      return level === 'alarm' || level === 'warning' ? 'attention' : level;
    }
    return 'all';
  }
  GROUP_ORDER.health = ['attention', 'normal', 'closed'];

  function dueCell(project, ctx, now) {
    if (project.status === 'done') return D.el('span', { class: 't-muted', text: '—' });
    var item = nearest(project, ctx, now);
    if (!item) return D.el('span', { class: 't-muted', text: 'Bez terminu' });
    return D.el('div', { class: 'pf-due' + (item.overdue ? ' is-overdue' : ''), attrs: { 'data-tooltip': item.label } }, [
      D.el('span', { class: 'pf-due__date t-num', text: F.date(item.date) }),
      D.el('span', { class: 'pf-due__rel', text: relDays(item.days) })
    ]);
  }

  function signalsCell(project, ctx, now) {
    var stats = Tasks.projectTaskStats(project, now);
    var waiting = E.Mail.pending(mailList(ctx), project.id, now);
    var late = waiting.filter(function (x) { return x.reply.state === 'overdue'; }).length;
    var parts = [];
    if (stats.overdue) parts.push(D.el('span', { class: 'pf-sig is-alert', attrs: { 'data-tooltip': F.count(stats.overdue, 'zadanie', 'zadania', 'zadań') + ' po terminie' } }, [Icons.icon('alertCircle', 14), D.el('span', { class: 't-num', text: String(stats.overdue) })]));
    if (waiting.length) parts.push(D.el('span', { class: 'pf-sig' + (late ? ' is-alert' : ''), attrs: { 'data-tooltip': 'Czeka na odpowiedź: ' + waiting.length + (late ? ' (po terminie: ' + late + ')' : '') } }, [Icons.icon('mail', 14), D.el('span', { class: 't-num', text: String(waiting.length) })]));
    return parts.length ? D.el('div', { class: 'pf-sigs' }, parts) : D.el('span', { class: 't-muted', text: '—' });
  }

  /** Lider: klik w komórkę otwiera wybór osoby (edycja bez wchodzenia w projekt). */
  function leaderCell(project, ctx) {
    var person = Team.findPerson(ctx.people, project.team && project.team.leader);
    var btn = D.el('button', {
      class: 'pf-leader',
      attrs: { type: 'button', 'aria-label': 'Lider projektu ' + project.code + ': ' + (person ? Team.fullName(person) : 'brak') + '. Zmień', 'data-fk': 'leader-' + project.id }
    }, [
      person ? Avatar.avatar(person, { size: 'xs', tooltip: false }) : D.el('span', { class: 'pf-leader__none', text: '+' }),
      D.el('span', { class: 'truncate' + (person ? '' : ' t-muted'), text: person ? shortName(person) : 'Przypisz' })
    ]);
    if (ctx.actions.setLeader) {
      Menu.bind(btn, function () {
        var roster = ctx.people.filter(function (p) { return p.active !== false; }).sort(function (a, b) { return Team.fullName(a).localeCompare(Team.fullName(b), 'pl', { sensitivity: 'base' }); });
        return {
          label: 'Lider projektu ' + project.code,
          items: roster.map(function (p) {
            return { type: 'radio', label: Team.fullName(p), value: p.id, checked: person && person.id === p.id, leading: Avatar.avatar(p, { size: 'xs', tooltip: false }), onSelect: function () { ctx.actions.setLeader(project.id, p.id); } };
          }).concat(roster.length ? [] : [{ type: 'note', label: 'Katalog osób jest pusty.' }])
        };
      });
    }
    return btn;
  }

  function reasonLine(project, health, hidden, ctx) {
    if (health.level === 'alarm' || health.level === 'warning') {
      return E.Flow.stateButton(project, ctx, { text: health.reasons[0].text + (health.reasons.length > 1 ? ' · +' + (health.reasons.length - 1) : ''), className: 'pf-reason pf-reason--' + health.level });
    }
    return D.el('span', { class: 'truncate', text: hidden.indexOf('client') < 0 ? (project.client || '') : '' });
  }

  /** „DEMO-002” → „002”: w wąskich miejscach numer bez prefiksu; pełny kod jest w podpowiedzi. */
  function shortCode(code) { return String(code).replace(/^[A-Za-z]+-?/, '') || String(code); }

  function nameCell(project, health, hidden, ctx) {
    return D.el('div', { class: 'stack' }, [
      D.el('a', {
        class: 'project-link stack__main',
        text: project.name,
        attrs: { href: projectHref(project), 'data-fk': 'open-' + project.id },
        dataset: { projectTitle: project.id }
      }),
      D.el('span', { class: 'stack__sub stack__sub--row' }, [reasonLine(project, health, hidden, ctx)])
    ]);
  }

  function header(column, ctx) {
    var sort = ctx.state.filters.sort;
    var className = 'col-' + column.key;
    if (!column.sort) return D.el('th', { class: className, attrs: { scope: 'col' }, text: column.label });
    var active = sort === column.sort;
    var direction = active && ctx.state.filters.dir === 'desc' ? 'descending' : 'ascending';
    return D.el('th', { class: className, attrs: { scope: 'col', 'aria-sort': active ? direction : null } }, [
      D.el('button', {
        class: 'table__sort',
        attrs: { type: 'button', 'aria-sort': active ? direction : null, 'aria-label': 'Sortuj: ' + column.label + (active ? ' (aktywne, ' + (direction === 'descending' ? 'malejąco' : 'rosnąco') + ')' : '') },
        dataset: { sort: column.sort },
        on: { click: function () { ctx.actions.setSort(column.sort); } }
      }, [D.el('span', { text: column.label }), Icons.icon(direction === 'descending' ? 'arrowDown' : 'arrowUp', 12)])
    ]);
  }

  function visibleColumns(hidden) {
    return [
      { key: 'code', label: 'Nr', sort: 'code' },
      { key: 'name', label: 'Projekt', sort: 'name' },
      hidden.indexOf('team') < 0 ? { key: 'team', label: 'Lider' } : null,
      hidden.indexOf('time') < 0 ? { key: 'time', label: 'Czas umowy' } : null,
      hidden.indexOf('deadline') < 0 ? { key: 'deadline', label: 'Najbliższy termin', sort: 'deadline' } : null,
      hidden.indexOf('tasks') < 0 ? { key: 'tasks', label: 'Sygnały' } : null
    ].filter(Boolean);
  }

  function row(project, columns, ctx, now) {
    var hidden = ctx.state.prefs.hiddenColumns || [];
    var selected = !!(ctx.state.selection || {})[project.id];
    var health = Insight.health(project, now);
    var box = UI.checkbox({
      id: 'select-' + project.id,
      checked: selected,
      attrs: { 'aria-label': 'Zaznacz projekt ' + project.code, 'data-fk': 'select-' + project.id },
      on: { change: function (event) { ctx.actions.selectProjects([project.id], event.target.checked); } }
    });
    var cells = {
      code: D.el('span', { class: 'pf-num pf-num--pill t-num' }, [project.code]),
      time: timeRibbon(project, now) || D.el('span', { class: 't-muted', text: '—' }),
      name: nameCell(project, health, hidden, ctx),
      team: leaderCell(project, ctx),
      deadline: dueCell(project, ctx, now),
      tasks: signalsCell(project, ctx, now)
    };
    return D.el('tr', {
      class: 'table__row prow-project level-' + health.level + (project.status === 'done' ? ' is-closed' : '') + (ctx.motion && ctx.motion.flashProject === project.id ? ' is-flash' : ''),
      attrs: { 'aria-selected': selected ? 'true' : null },
      dataset: { projectCode: project.code, projectId: project.id },
      style: { '--hue': String(E.Identity.tileHue(project.code)) },
      on: {
        click: function (event) {
          if (event.target.closest('a, button, input, label, [role="menu"]')) return;
          if (window.getSelection && String(window.getSelection())) return;
          ctx.actions.openProject(project.id);
        }
      }
    }, [
      D.el('td', { class: 'cell--check' }, [
        D.el('span', { class: 'pick' }, [E.Flow.stateButton(project, ctx, { now: now }), box])
      ])
    ].concat(columns.map(function (column) {
      return D.el('td', { class: 'col-' + column.key }, [cells[column.key]]);
    })).concat([D.el('td', { class: 'cell--actions' }, [moreButton(project, ctx.actions)])]));
  }

  function groupHeader(key, groupBy, count, colspan) {
    var label = groupBy === 'status' ? Model.PROJECT_STATUS[key] : GROUP_LABELS[key];
    var glyph = groupBy === 'status' ? UI.statusGlyph('project', key) : (key === 'attention' ? Sig.datum('alarm', { label: false }) : Sig.datum(key, { label: false }));
    return D.el('tr', { class: 'group-row' }, [
      D.el('th', { attrs: { colspan: String(colspan), scope: 'rowgroup' } }, [
        D.el('span', { class: 'group-row__inner' }, [glyph, D.el('span', { class: 'group-row__label', text: label }), D.el('span', { class: 'group-row__count', text: String(count) })])
      ])
    ]);
  }

  function table(visible, ctx) {
    var now = new Date();
    var hidden = ctx.state.prefs.hiddenColumns || [];
    var columns = visibleColumns(hidden);
    var selection = ctx.state.selection || {};
    var groupBy = ctx.state.prefs.groupBy || 'none';
    var page = Math.min(ctx.state.page || 0, Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1));
    var rows = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    var selectedVisible = visible.filter(function (p) { return selection[p.id]; }).length;
    var all = UI.checkbox({
      id: 'select-all',
      checked: selectedVisible > 0 && selectedVisible === visible.length,
      attrs: { 'aria-label': 'Zaznacz wszystkie widoczne projekty' },
      on: { change: function (event) { ctx.actions.selectProjects(visible.map(function (p) { return p.id; }), event.target.checked); } }
    });
    all.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;

    var head = D.el('thead', null, [D.el('tr', null, [D.el('th', { class: 'cell--check', attrs: { scope: 'col' } }, [all])]
      .concat(columns.map(function (column) { return header(column, ctx); }))
      .concat([D.el('th', { class: 'cell--actions', attrs: { scope: 'col' } }, [D.el('span', { class: 'sr-only', text: 'Działania' })])]))]);

    // Nagłówek grupy obejmuje tylko kolumny stałe (znak + nazwa): chowane kolumny nie tworzą pustych miejsc.
    var colspan = 2;
    var bodies = [];
    if (groupBy === 'none') {
      bodies.push(D.el('tbody', null, rows.map(function (p) { return row(p, columns, ctx, now); })));
    } else {
      var groups = {};
      rows.forEach(function (p) {
        var key = groupKey(p, groupBy, now);
        (groups[key] = groups[key] || []).push(p);
      });
      GROUP_ORDER[groupBy].forEach(function (key) {
        if (!groups[key]) return;
        bodies.push(D.el('tbody', { class: 'group group--' + key }, [groupHeader(key, groupBy, groups[key].length, colspan)]
          .concat(groups[key].map(function (p) { return row(p, columns, ctx, now); }))));
      });
    }

    return D.el('div', { class: 'table-wrap project-table pf-table' + (selectedVisible ? ' is-selecting' : '') }, [
      D.el('table', { class: 'table', attrs: { 'aria-label': 'Projekty' } }, [head].concat(bodies)),
      visible.length > PAGE_SIZE ? UI.pagination({ page: page, pageSize: PAGE_SIZE, total: visible.length, onPage: ctx.actions.setPage }) : null
    ]);
  }

  /* ---------- Karty ---------- */

  /** Wstęga czasu umowy: od założenia projektu do terminu, ze znacznikiem „dziś”. */
  function timeRibbon(project, now) {
    var start = Date.parse(project.createdAt || '');
    var end = Date.parse(project.deadline || '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    var pct = Math.max(0, Math.min(100, ((now.getTime() - start) / (end - start)) * 100));
    var late = now.getTime() > end && project.status !== 'done';
    return D.el('div', { class: 'pc-ribbon' + (late ? ' is-late' : ''), attrs: { 'data-tooltip': 'Upłynęło ' + Math.round(pct) + '% czasu umowy' } }, [
      D.el('div', { class: 'pc-ribbon__dates t-num' }, [D.el('span', { text: F.date(project.createdAt.slice(0, 10)) }), D.el('span', { text: F.date(project.deadline) })]),
      D.el('div', { class: 'pc-ribbon__track' }, [
        D.el('span', { class: 'pc-ribbon__fill', style: { width: pct + '%' } }),
        D.el('span', { class: 'pc-ribbon__now', style: { left: pct + '%' } })
      ])
    ]);
  }

  function card(project, ctx, now) {
    var health = Insight.health(project, now);
    var risk = health.level === 'alarm' || health.level === 'warning';
    var done = project.status === 'done';
    var pinned = ctx.actions.isPinned && ctx.actions.isPinned(project.id);
    var team = Team.projectPeople(project.team).map(function (id) { return Team.findPerson(ctx.people, id); }).filter(Boolean);
    var leaderId = project.team && project.team.leader;
    team.sort(function (a, b) { return (b.id === leaderId) - (a.id === leaderId); });

    return D.el('article', {
      class: 'pcard pf-card pc project level-' + health.level + (done ? ' is-closed' : ''),
      dataset: { projectCode: project.code, projectId: project.id },
      style: { '--hue': String(E.Identity.tileHue(project.code)) },
      on: {
        click: function (event) {
          if (event.target.closest('a, button, input, label, [role="menu"]')) return;
          ctx.actions.openProject(project.id);
        }
      }
    }, [
      D.el('div', { class: 'pc__top' }, [
        D.el('span', { class: 'pc__num t-num', text: '#' + project.code }),
        risk ? D.el('span', { class: 'pc__state pc__state--' + health.level }, [Sig.datum(health.level, { size: 12, label: false }), D.el('span', { text: health.level === 'alarm' ? 'Alarm' : 'Uwaga' })]) : (done ? D.el('span', { class: 'pc__state pc__state--done', text: 'Zakończony' }) : null),
        D.el('span', { class: 'pcard__spacer' }),
        ctx.actions.togglePin ? UI.iconButton({ icon: 'star', label: pinned ? 'Odepnij z panelu' : 'Przypnij w panelu', size: 'sm', class: 'pc__star' + (pinned ? ' is-on' : ''), attrs: { 'aria-pressed': String(!!pinned) }, onClick: function () { ctx.actions.togglePin(project.id); } }) : null,
        moreButton(project, ctx.actions, 'pcard__more')
      ]),
      D.el('h3', { class: 'pc__name' }, [
        D.el('a', { class: 'project-link clamp-2', text: project.name, attrs: { href: projectHref(project), 'data-fk': 'open-' + project.id }, dataset: { projectTitle: project.id } })
      ]),
      D.el('p', { class: 'pc__client truncate', text: project.client || 'Bez zamawiającego' }),
      risk ? D.el('p', { class: 'pc__reason' }, [E.Flow.stateButton(project, ctx, { text: health.reasons[0].text + (health.reasons.length > 1 ? ' · +' + (health.reasons.length - 1) : ''), className: 'pf-reason pf-reason--' + health.level })]) : null,
      timeRibbon(project, now),
      D.el('div', { class: 'pc__foot' }, [
        team.length ? Avatar.avatarStack(team, { max: 4, size: 'sm' }) : D.el('span', { class: 't-muted', text: 'Bez zespołu' }),
        D.el('span', { class: 'pcard__spacer' }),
        signalsCell(project, ctx, now),
        dueCell(project, ctx, now)
      ])
    ]);
  }

  function cards(visible, ctx) {
    var now = new Date();
    var groupBy = ctx.state.prefs.groupBy || 'none';
    if (groupBy === 'none') {
      var pins = (ctx.state.prefs.pinned || []);
      var ordered = visible.filter(function (p) { return pins.indexOf(p.id) >= 0; }).concat(visible.filter(function (p) { return pins.indexOf(p.id) < 0; }));
      return D.el('div', { class: 'pcard-grid' }, ordered.map(function (project) { return card(project, ctx, now); }));
    }
    var groups = {};
    visible.forEach(function (p) {
      var key = groupKey(p, groupBy, now);
      (groups[key] = groups[key] || []).push(p);
    });
    return D.el('div', { class: 'pf-cardgroups' }, GROUP_ORDER[groupBy].filter(function (k) { return groups[k]; }).map(function (key) {
      return D.el('section', { class: 'pf-cardgroup pf-cardgroup--' + key }, [
        D.el('h2', { class: 'pf-cardgroup__head' }, [
          groupBy === 'status' ? UI.statusGlyph('project', key) : Sig.datum(key === 'attention' ? 'alarm' : key, { label: false }),
          D.el('span', { text: groupBy === 'status' ? Model.PROJECT_STATUS[key] : GROUP_LABELS[key] }),
          D.el('span', { class: 'group-row__count', text: String(groups[key].length) })
        ]),
        D.el('div', { class: 'pcard-grid' }, groups[key].map(function (project) { return card(project, ctx, now); }))
      ]);
    }));
  }

  /* ---------- Zakładki widoków ---------- */

  var BUILTIN = [
    { id: 'all', label: 'Wszystkie', filters: { health: 'all', person: 'all', status: 'all', query: '' } },
    { id: 'mine', label: 'Moje', filters: { health: 'all', status: 'all', query: '' }, mine: true },
    { id: 'attention', label: 'Wymaga uwagi', filters: { health: 'attention', person: 'all', status: 'all', query: '' } },
    { id: 'overdue', label: 'Po terminie', filters: { health: 'overdue', person: 'all', status: 'all', query: '' } },
    { id: 'done', label: 'Zakończone', filters: { health: 'closed', person: 'all', status: 'all', query: '' } }
  ];

  /** Filtry widoku; „Moje” korzysta z osoby przypisanej do tego urządzenia. */
  function viewFilters(view, prefs) {
    if (view.mine) return Object.assign({}, view.filters, { person: prefs.me || 'all' });
    return view.filters;
  }

  function allViews(prefs) {
    return BUILTIN.concat((prefs.customViews || []).map(function (v) { return { id: v.id, label: v.name, filters: v.filters, custom: true }; }));
  }

  function views(projects, ctx) {
    var state = ctx.state;
    var now = new Date();
    var mail = mailList(ctx);
    return D.el('div', { class: 'pf-views', attrs: { role: 'tablist', 'aria-label': 'Widoki listy projektów' } }, allViews(state.prefs).map(function (view) {
      var f = viewFilters(view, state.prefs);
      var count = view.mine && !state.prefs.me ? null : E.Query.filterAndSort(projects, Object.assign({}, f, { now: now, mail: mail, sort: 'deadline' })).length;
      var cur = state.filters;
      var active = state.prefs.projectView === view.id && f.health === cur.health && f.person === cur.person && f.status === cur.status && (f.query || '') === String(cur.query || '').trim() && !cur.horizon;
      var tab = D.el('button', {
        class: 'pf-view' + (active ? ' is-active' : ''),
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(active), 'data-fk': 'view-' + view.id, title: view.mine && !state.prefs.me ? 'Wybierz, kim jesteś, w „Moja praca”' : null },
        on: { click: function () { ctx.actions.applyView(view.id); } }
      }, [D.el('span', { text: view.label }), count !== null ? D.el('span', { class: 'pf-view__count t-num', text: String(count) }) : null]);
      if (view.custom) {
        return D.el('span', { class: 'pf-view-wrap' }, [tab, D.el('button', {
          class: 'pf-view__remove', attrs: { type: 'button', 'aria-label': 'Usuń widok ' + view.label },
          on: { click: function () { ctx.actions.removeView(view.id); } }
        }, [Icons.icon('close', 12)])]);
      }
      return tab;
    }));
  }

  /* ---------- Panel najbliższych terminów ---------- */

  function bucketOf(item) {
    if (item.days < 0) return 'late';
    return item.days <= 7 ? 'week' : 'later';
  }

  function biuroDzis(projects, ctx) {
    var all = (ctx.state.workspace && ctx.state.workspace.entries) || [];
    var now = new Date();
    var key = E.TimeLog.dayKey(now.getTime());
    var today = all.filter(function (e) { return E.TimeLog.dayKey(e.start) === key; });
    var total = today.reduce(function (sum, e) { return sum + E.TimeLog.minutes(e, now); }, 0);
    var live = today.filter(function (e) { return !e.end; }).length;
    return D.el('div', { class: 'pf-rail__foot' }, [
      D.el('div', { class: 'pf-rail__row' }, [
        D.el('span', { text: 'Biuro dziś' }),
        D.el('b', { class: 't-num', text: today.length ? E.TimeLog.duration(total) : '—' })
      ]),
      live ? D.el('p', { class: 'pf-rail__note', text: 'Teraz pracuje: ' + live }) : null
    ]);
  }

  function rail(projects, ctx) {
    var now = new Date();
    var act = ctx.actions;
    var items = Insight.dueItems(projects, mailList(ctx), now, 60);
    var buckets = { late: [], week: [], later: [] };
    items.forEach(function (item) { buckets[bucketOf(item)].push(item); });
    var TITLES = { late: 'Po terminie', week: 'Ten tydzień', later: 'Później' };
    var MAX = { late: 6, week: 8, later: 6 };

    function open(item) {
      if (item.kind === 'task') act.openStage(item.project.id, item.ref.stage.id);
      else if (item.kind === 'mail') act.openProject(item.project.id, 'korespondencja');
      else act.openProject(item.project.id);
    }

    var sections = ['late', 'week', 'later'].filter(function (k) { return buckets[k].length; }).map(function (key) {
      var list = buckets[key];
      return D.el('section', { class: 'pf-rail__sec pf-rail__sec--' + key }, [
        D.el('h3', { class: 'pf-rail__h' }, [(function () {
          // Nagłówek to filtr listy projektów: Po terminie → projekty z zaległościami, Ten tydzień / Później → projekty z terminem w tym horyzoncie.
          var patch = key === 'late' ? { health: 'overdue' } : { horizon: key === 'week' ? 7 : 60 };
          var cur = ctx.state.filters || {};
          var on = key === 'late' ? cur.health === 'overdue' : cur.horizon === patch.horizon;
          return D.el('button', {
            class: 'pf-rail__filter' + (on ? ' is-on' : ''),
            attrs: { type: 'button', 'aria-pressed': String(on), 'data-fk': 'rail-filter-' + key, 'data-tooltip': on ? 'Zdejmij filtr listy' : 'Pokaż na liście tylko te projekty' },
            on: { click: function () { act.filterPortfolio(patch); } }
          }, [D.el('span', { text: TITLES[key] }), D.el('span', { class: 'pf-rail__n t-num', text: String(list.length) }), Icons.icon('filter', 12)]);
        })()]),
        D.el('ul', { class: 'pf-rail__list' }, list.slice(0, MAX[key]).map(function (item) {
          return D.el('li', null, [D.el('button', {
            class: 'pf-due-item',
            attrs: { type: 'button', 'data-fk': 'due-' + item.project.id + '-' + item.kind, 'aria-label': item.label + ', ' + item.project.code + ', ' + F.date(item.date) + ', ' + relDays(item.days) },
            on: { click: function () { open(item); } }
          }, [
            D.el('span', { class: 'pf-due-item__icon', attrs: { 'aria-hidden': 'true' } }, [Icons.icon(item.kind === 'mail' ? 'mail' : (item.kind === 'project' ? 'flag' : 'checklist'), 14)]),
            D.el('span', { class: 'pf-due-item__what' }, [
              D.el('span', { class: 'pf-due-item__title', text: item.label }),
              D.el('span', { class: 'pf-due-item__proj truncate' }, [D.el('span', { class: 'pf-due-item__code t-num', text: shortCode(item.project.code) }), D.el('span', { class: 'truncate', text: item.project.name })])
            ]),
            D.el('span', { class: 'pf-due-item__when t-num' }, [D.el('b', { text: F.date(item.date) }), D.el('span', { text: relDays(item.days) })])
          ])]);
        })),
        list.length > MAX[key] ? D.el('p', { class: 'pf-rail__more', text: 'i ' + (list.length - MAX[key]) + ' więcej' }) : null
      ]);
    });

    var collapsed = !!ctx.state.prefs.railCollapsed;
    var toggle = D.el('button', {
      class: 'pf-rail__toggle',
      attrs: { type: 'button', 'aria-expanded': String(!collapsed), 'aria-label': collapsed ? 'Rozwiń panel Najbliższe terminy' : 'Zwiń panel Najbliższe terminy', 'data-tooltip': collapsed ? 'Rozwiń panel' : 'Zwiń panel', 'data-fk': 'rail-toggle' },
      on: { click: function () { act.setPref({ railCollapsed: !collapsed }); } }
    }, [Icons.icon(collapsed ? 'chevronLeft' : 'chevronRight', 16)]);
    if (collapsed) {
      var late = buckets.late.length;
      return D.el('div', { class: 'pf-rail__inner pf-rail__inner--collapsed' }, [
        toggle,
        D.el('span', { class: 'pf-rail__vtitle', text: 'Najbliższe terminy' }),
        items.length ? D.el('span', { class: 'pf-rail__vcount t-num' + (late ? ' is-late' : ''), text: String(late || items.length), attrs: { 'aria-label': late ? late + ' po terminie' : items.length + ' terminów' } }) : null
      ]);
    }

    return D.el('div', { class: 'pf-rail__inner' }, [
      D.el('div', { class: 'pf-rail__head' }, [D.el('h2', { class: 'pf-rail__title', text: 'Najbliższe terminy' }), toggle])
    ].concat(sections.length ? sections : [D.el('p', { class: 'cockpit__empty', text: 'Brak terminów w najbliższych 60 dniach.' })]).concat([biuroDzis(projects, ctx)]));
  }

  /* ---------- Pierwsze uruchomienie ---------- */

  function projectsPreview() {
    // Profil z zaślepek: zakończone, w toku, przed nami — język ekranu przed pierwszymi danymi.
    function track(done, working, todo) {
      var segs = [];
      for (var i = 0; i < done; i += 1) segs.push(D.el('span', { class: 'flow__seg flow__seg--done', style: { 'flex-grow': String(2 + (i % 3)) } }));
      for (var j = 0; j < working; j += 1) segs.push(D.el('span', { class: 'flow__seg flow__seg--working is-current', style: { 'flex-grow': '3' } }));
      for (var k = 0; k < todo; k += 1) segs.push(D.el('span', { class: 'flow__seg flow__seg--todo', style: { 'flex-grow': String(2 + (k % 2)) } }));
      return D.el('div', { class: 'flow flow--mini' }, [D.el('div', { class: 'flow__track' }, segs)]);
    }
    var rows = [
      { level: 'alarm', w: ['11rem', '7rem'], t: [6, 1, 4], d: '3.5rem' },
      { level: 'warning', w: ['9rem', '8.5rem'], t: [3, 1, 7], d: '3rem' },
      { level: 'normal', w: ['12rem', '6rem'], t: [8, 1, 2], d: '4rem' },
      { level: 'closed', w: ['8rem', '7.5rem'], t: [11, 0, 0], d: '3.25rem' }
    ];
    return D.el('div', { class: 'preview preview--projects' }, [
      D.el('div', { class: 'preview__head' }, [D.el('span', { text: 'Projekt' }), D.el('span', { text: 'Przebieg' }), D.el('span', { text: 'Termin' })])
    ].concat(rows.map(function (r, index) {
      return D.el('div', { class: 'preview__row' + (index === 0 ? ' preview__row--lit' : '') }, [
        D.el('span', { class: 'preview__person' }, [
          Sig.datum(r.level, { size: 14, label: false }),
          D.el('span', { class: 'preview__lines' }, [UI.ghost(r.w[0]), UI.ghost(r.w[1])])
        ]),
        track(r.t[0], r.t[1], r.t[2]),
        UI.ghost(r.d)
      ]);
    })));
  }

  /**
   * @param {{create: Function, demo: Function, importCopy: Function, people: number}} o
   */
  function onboarding(o) {
    return UI.onboarding({
      id: 'projects-onboard-title',
      class: 'onboard--projects',
      title: 'Załóż pierwszy projekt',
      text: 'Projekt łączy umowę, etapy ze standardu ETROM, zadania i zespół. Z tych danych ETROM sam liczy postęp, pilnuje terminów i ostrzega, gdy coś jest zagrożone.',
      steps: [
        { title: 'Dane umowy', text: 'Kod, nazwa, zamawiający i termin umowy.' },
        { title: 'Etapy ze standardu', text: 'Wybierasz tylko te, które dotyczą projektu; budżet godzin waży postęp.' },
        { title: 'Zespół i zadania', text: o.people ? 'Przypisujesz osoby z katalogu i rozpisujesz pracę w etapach.' : 'Najpierw dodaj osoby na ekranie Zespół, potem rozpisz pracę w etapach.' }
      ],
      actions: [
        UI.button({ label: 'Nowy projekt', icon: 'plus', variant: 'primary', kbd: 'N', attrs: { id: 'empty-new' }, onClick: o.create }),
        UI.button({ label: 'Dodaj dane przykładowe', icon: 'sparkle', variant: 'secondary', attrs: { id: 'empty-demo' }, onClick: o.demo })
      ],
      note: D.el('span', null, [
        D.el('span', { text: 'Masz kopię z innego komputera? ' }),
        D.el('button', { class: 'link-btn', text: 'Wczytaj kopię zapasową', attrs: { type: 'button' }, on: { click: o.importCopy } })
      ]),
      preview: projectsPreview(),
      previewLabel: 'Tak wygląda portfel z danymi: stan, przebieg etapów i termin każdego projektu w jednym wierszu.'
    });
  }

  root.ETROM.ProjectList = {
    onboarding: onboarding,
    table: table,
    cards: cards,
    views: views,
    relDays: relDays,
    leaderCell: leaderCell,
    shortName: shortName,
    rail: rail,
    BUILTIN_VIEWS: BUILTIN,
    viewFilters: viewFilters,
    allViews: allViews,
    COLUMNS: COLUMNS,
    projectHref: projectHref,
    timeRibbon: timeRibbon,
    projectMenuItems: projectMenuItems,
    PAGE_SIZE: PAGE_SIZE
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
