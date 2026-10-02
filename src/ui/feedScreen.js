/* ETROM — ekran „Aktualności”: strumień w stylu mediów społecznościowych.
   Karty zdarzeń z pracy biura i wpisy ludzi, reakcje, komentarze, pasek projektów.
   Dane wylicza core/feed.js; tu jest tylko rysowanie. Szkic wpisu i komentarzy
   żyje poza przerysowaniem, żeby klik w reakcję nie kasował tego, co ktoś pisze. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Icons = E.Icons;
  var Feed = E.Feed;
  var Social = E.Social;
  var Team = E.Team;
  var Budget = E.Budget;
  var Format = E.Format;

  var FILTERS = [
    { value: 'all', label: 'Wszystko' },
    { value: 'mine', label: 'Moje' },
    { value: 'mail', label: 'Pisma' },
    { value: 'posts', label: 'Wpisy' }
  ];

  var drafts = { post: '', project: '', comments: {} };
  var composerNode = null;

  function person(people, id) { return Team.findPerson(people, id); }
  function name(p) { return p ? Team.fullName(p) : 'System'; }

  function actorAvatar(item, people) {
    var p = person(people, item.actorId);
    if (p) return E.Avatar.avatar(p, { size: 'md' });
    return D.el('span', { class: 'fd__sysicon' }, [Icons.icon(item.kind === 'mail' ? 'mail' : 'folder', 18)]);
  }

  function projectChip(project) {
    if (!project) return D.el('span', { class: 'fd__chip fd__chip--office', text: 'Całe biuro' });
    return D.el('a', { class: 'fd__chip', text: project.code + ' · ' + project.name, attrs: { href: E.ProjectList.projectHref(project) } });
  }

  function headline(item, people) {
    var who = name(person(people, item.actorId));
    if (item.kind === 'project') return { title: 'Nowy projekt w biurze', lead: item.project.name, text: '' };
    if (item.kind === 'mail') {
      var m = item.mail;
      return {
        title: (m.direction === 'out' ? 'Pismo wychodzące' : 'Pismo przychodzące') + ' · ' + (m.regNo || ''),
        lead: m.subject, text: (m.direction === 'out' ? 'Do: ' : 'Od: ') + m.counterparty
      };
    }
    if (item.kind === 'time') {
      return { title: who + ' — czas pracy', lead: item.label || 'Praca nad projektem', text: Format.hours(item.minutes / 60) };
    }
    if (item.kind === 'post') return { title: who, lead: '', text: item.post.text };
    var status = E.Tasks.TASK_STATUS[item.to] || item.to;
    return { title: who, lead: 'Zadanie «' + item.task.name + '» — nowy status: ' + status, text: item.to === 'changes' ? item.reason : '' };
  }

  function reactionBar(item, ctx, state) {
    var me = state.prefs.me;
    var used = Social.reactionsOf(state.workspace.social, item.key, me);
    var chips = used.map(function (r) {
      return D.el('button', {
        class: 'fd__react' + (r.mine ? ' is-mine' : ''),
        attrs: { type: 'button', 'aria-pressed': String(r.mine), 'data-tooltip': r.label, 'data-fk': 'fd-react-' + item.key + '-' + r.id },
        on: { click: function () { ctx.actions.toggleReaction(item.key, r.id); } }
      }, [D.el('span', { class: 'fd__emoji', text: r.emoji }), D.el('span', { class: 't-num', text: String(r.count) })]);
    });
    var picker = D.el('span', { class: 'fd__picker' }, Social.REACTIONS.map(function (r) {
      return D.el('button', {
        class: 'fd__pick', attrs: { type: 'button', 'aria-label': r.label, 'data-tooltip': r.label, 'data-fk': 'fd-pick-' + item.key + '-' + r.id },
        on: { click: function () { ctx.actions.toggleReaction(item.key, r.id); } }
      }, [D.el('span', { class: 'fd__emoji', text: r.emoji })]);
    }));
    return D.el('div', { class: 'fd__reactions' }, chips.concat([D.el('span', { class: 'fd__add' }, [
      D.el('span', { class: 'fd__addbtn', attrs: { 'aria-hidden': 'true' } }, [Icons.icon('plus', 14)]), picker
    ])]));
  }

  function commentsBlock(item, ctx, state, people) {
    var me = state.prefs.me;
    var list = Social.commentsOf(state.workspace.social, item.key);
    var open = (state.feedOpen || []).indexOf(item.key) >= 0;
    var manage = Budget.isManagement(me, people);
    var toggle = D.el('button', {
      class: 'fd__toggle' + (open ? ' is-open' : ''),
      attrs: { type: 'button', 'aria-expanded': String(open), 'data-fk': 'fd-comments-' + item.key },
      on: { click: function () { ctx.actions.toggleFeedComments(item.key); } }
    }, [Icons.icon('reply', 14), D.el('span', { text: list.length ? E.Format.count(list.length, 'komentarz', 'komentarze', 'komentarzy') : 'Skomentuj' })]);
    if (!open) return { toggle: toggle, panel: null };

    var rows = list.map(function (c) {
      var author = person(people, c.personId);
      return D.el('li', { class: 'fd__comment', dataset: { commentId: c.id } }, [
        author ? E.Avatar.avatar(author, { size: 'sm' }) : D.el('span', { class: 'avatar avatar--sm' }),
        D.el('div', { class: 'fd__cbody' }, [
          D.el('div', { class: 'fd__cmeta' }, [
            D.el('strong', { text: name(author) }),
            D.el('span', { class: 't-meta', text: Format.ago(c.at, new Date()) })
          ]),
          D.el('p', { class: 'fd__ctext', text: c.text })
        ]),
        (c.personId === me || manage) ? UI.iconButton({ icon: 'close', label: 'Usuń komentarz', size: 'sm', onClick: function () { ctx.actions.removeComment(c.id); } }) : null
      ]);
    });
    var input = D.el('input', {
      class: 'fd__cinput',
      attrs: { type: 'text', maxlength: String(Social.LIMITS.comment), placeholder: me ? 'Napisz komentarz…' : 'Wybierz w „Mojej pracy”, kim jesteś', 'data-fk': 'fd-cinput-' + item.key, disabled: me ? null : 'disabled', 'aria-label': 'Komentarz' }
    });
    input.value = drafts.comments[item.key] || '';
    input.addEventListener('input', function () { drafts.comments[item.key] = input.value; });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.isComposing && input.value.trim()) {
        event.preventDefault();
        var value = input.value;
        if (ctx.actions.addComment(item.key, value)) { drafts.comments[item.key] = ''; input.value = ''; }
      }
    });
    return { toggle: toggle, panel: D.el('div', { class: 'fd__thread' }, [rows.length ? D.el('ul', { class: 'fd__clist' }, rows) : null, input]) };
  }

  function quickActions(item, ctx) {
    if (item.kind === 'task' && item.task.status === 'review' && item.to === 'review') {
      return [UI.button({ label: 'Zatwierdź', icon: 'check', variant: 'secondary', size: 'sm', onClick: function () { ctx.actions.moveTask(item.project.id, item.stage.id, item.task.id, 'done'); } })];
    }
    if (item.kind === 'task') return [UI.button({ label: 'Otwórz zadanie', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.inspect({ kind: 'task', projectId: item.project.id, stageId: item.stage.id, taskId: item.task.id }); } })];
    if (item.kind === 'mail') return [UI.button({ label: 'Otwórz pismo', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.openProject(item.project.id, 'korespondencja'); } })];
    if (item.kind === 'project') return [UI.button({ label: 'Otwórz projekt', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.openProject(item.project.id, 'etapy'); } })];
    return [];
  }

  function card(item, ctx, state, people, now) {
    var h = headline(item, people);
    var me = state.prefs.me;
    var canDelete = item.kind === 'post' && (item.post.personId === me || Budget.isManagement(me, people));
    var thread = commentsBlock(item, ctx, state, people);
    return D.el('article', { class: 'fd__card fd__card--' + item.kind, dataset: { feedKey: item.key, kind: item.kind } }, [
      D.el('header', { class: 'fd__head' }, [
        actorAvatar(item, people),
        D.el('div', { class: 'fd__who' }, [
          D.el('span', { class: 'fd__name', text: h.title }),
          D.el('span', { class: 't-meta', text: Format.ago(item.at, now) })
        ]),
        projectChip(item.project),
        canDelete ? UI.iconButton({ icon: 'trash', label: 'Usuń wpis', size: 'sm', onClick: function () { ctx.actions.removePost(item.post.id); } }) : null
      ]),
      h.lead ? D.el('p', { class: 'fd__lead', text: h.lead }) : null,
      h.text ? D.el('p', { class: item.kind === 'task' ? 'fd__quote' : (item.kind === 'post' ? 'fd__text' : 'fd__sub'), text: h.text }) : null,
      D.el('footer', { class: 'fd__foot' }, [
        reactionBar(item, ctx, state),
        D.el('div', { class: 'fd__footright' }, [thread.toggle].concat(quickActions(item, ctx)))
      ]),
      thread.panel
    ]);
  }

  function stories(state, ctx, now) {
    var projects = (state.workspace.projects || []).filter(function (p) { return p.status !== 'done'; })
      .sort(function (a, b) { return String(a.code).localeCompare(String(b.code), 'pl', { numeric: true }); });
    if (!projects.length) return null;
    return D.el('div', { class: 'fd__stories', attrs: { role: 'list', 'aria-label': 'Projekty w toku' } }, projects.map(function (p) {
      var level = E.Insight.health(p, now).level;
      return D.el('button', {
        class: 'fd__story fd__story--' + level,
        attrs: { type: 'button', role: 'listitem', 'data-tooltip': p.name, 'data-fk': 'fd-story-' + p.id },
        on: { click: function () { ctx.actions.openProject(p.id, 'etapy'); } }
      }, [D.el('span', { class: 'fd__ring' }, [D.el('span', { class: 'fd__code', text: String(p.code) })]), D.el('span', { class: 'fd__sname truncate', text: p.name })]);
    }));
  }

  function composer(state, ctx, me) {
    if (!composerNode) {
      composerNode = {
        root: D.el('section', { class: 'fd__composer' }),
        text: D.el('textarea', { class: 'fd__textarea', attrs: { rows: '2', maxlength: String(Social.LIMITS.post), 'aria-label': 'Nowy wpis' } }),
        select: D.el('select', { class: 'fd__select', attrs: { 'aria-label': 'Projekt wpisu' } }),
        who: D.el('span', { class: 'fd__cwho' }),
        send: UI.button({ label: 'Opublikuj', variant: 'primary', size: 'sm' })
      };
      composerNode.text.addEventListener('input', function () { drafts.post = composerNode.text.value; });
      composerNode.select.addEventListener('change', function () { drafts.project = composerNode.select.value; });
      var publish = function () {
        var value = composerNode.text.value;
        if (!value.trim()) return;
        var projectId = composerNode.select.value ? Number(composerNode.select.value) : null;
        if (composerNode.ctx.actions.addPost(value, projectId)) { composerNode.text.value = ''; drafts.post = ''; }
      };
      composerNode.send.addEventListener('click', publish);
      composerNode.text.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); publish(); }
      });
      D.render(composerNode.root, [
        D.el('div', { class: 'fd__crow' }, [composerNode.who, composerNode.text]),
        D.el('div', { class: 'fd__cactions' }, [composerNode.select, D.el('span', { class: 't-meta', text: 'Ctrl + Enter publikuje' }), composerNode.send])
      ]);
    }
    composerNode.ctx = ctx;
    D.render(composerNode.who, [me ? E.Avatar.avatar(me, { size: 'md' }) : D.el('span', { class: 'avatar avatar--md' })]);
    composerNode.text.disabled = !me;
    composerNode.text.placeholder = me ? 'Co słychać w projektach, ' + (me.firstName || Team.fullName(me)) + '?' : 'Wybierz w „Mojej pracy”, kim jesteś, aby pisać';
    if (!composerNode.text.value) composerNode.text.value = drafts.post;
    var options = [D.el('option', { text: 'Całe biuro', attrs: { value: '' } })].concat((state.workspace.projects || []).map(function (p) {
      return D.el('option', { text: p.code + ' · ' + p.name, attrs: { value: String(p.id) } });
    }));
    D.render(composerNode.select, options);
    composerNode.select.value = drafts.project;
    composerNode.select.disabled = !me;
    composerNode.send.disabled = !me;
    return composerNode.root;
  }

  function dayGroups(items, now) {
    var out = [];
    var last = '';
    items.forEach(function (item) {
      var label = Format.dayLabel(item.at, now);
      if (label !== last) { out.push({ label: label, items: [] }); last = label; }
      out[out.length - 1].items.push(item);
    });
    return out;
  }

  function filterBar(result, filter, actions) {
    return D.el('div', { class: 'pf-views fd__filters', attrs: { role: 'tablist', 'aria-label': 'Rodzaj aktualności' } }, FILTERS.map(function (f) {
      var active = f.value === filter;
      return D.el('button', {
        class: 'pf-view' + (active ? ' is-active' : ''),
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(active), 'data-fk': 'fd-filter-' + f.value },
        on: { click: function () { actions.setFeedFilter(f.value); } }
      }, [D.el('span', { text: f.label }), D.el('span', { class: 'pf-view__count t-num', text: String(result.counts[f.value]) })]);
    }));
  }

  function view(state, ctx) {
    var people = state.workspace.people || [];
    var me = person(people, state.prefs.me);
    var now = new Date();
    var filter = state.feedFilter || 'all';
    var result = Feed.build(state.workspace, me ? me.id : null, now, { filter: filter, limit: state.feedLimit || 20 });
    var groups = dayGroups(result.items, now);
    var list;
    if (!result.items.length) {
      list = UI.emptyState({ icon: 'sparkle', title: 'Jeszcze cicho', text: filter === 'all' ? 'Gdy ktoś zmieni status zadania, zarejestruje pismo albo napisze wpis, zobaczysz to tutaj.' : 'Nic w tej kategorii.' });
    } else {
      list = D.el('div', { class: 'fd__stream' }, groups.map(function (g) {
        return D.el('section', { class: 'fd__day' }, [
          D.el('h2', { class: 'fd__daylabel', text: g.label }),
          D.el('div', { class: 'fd__cards' }, g.items.map(function (item) { return card(item, ctx, state, people, now); }))
        ]);
      }));
    }
    var more = result.hasMore
      ? D.el('div', { class: 'fd__more' }, [UI.button({ label: 'Pokaż starsze (' + (result.total - result.items.length) + ')', variant: 'secondary', onClick: function () { ctx.actions.loadMoreFeed(); }, attrs: { 'data-fk': 'fd-more' } })])
      : null;
    return {
      summary: me ? 'Co się dzieje w biurze — zdarzenia z projektów i wpisy zespołu.' : 'Wybierz w „Mojej pracy”, kim jesteś, aby reagować i pisać.',
      body: D.el('div', { class: 'fd' }, [stories(state, ctx, now), composer(state, ctx, me), filterBar(result, filter, ctx.actions), list, more]),
      result: result
    };
  }

  root.ETROM.FeedScreen = { view: view, FILTERS: FILTERS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
