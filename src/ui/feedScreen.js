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
    { value: 'events', label: 'Zdarzenia' },
    { value: 'mail', label: 'Pisma' },
    { value: 'posts', label: 'Wpisy' },
    { value: 'media', label: 'Zdjęcia' }
  ];
  var MODES = [
    { value: 'post', label: 'Wpis', icon: 'sparkle', placeholder: 'Co słychać w projektach' },
    { value: 'poll', label: 'Ankieta', icon: 'poll', placeholder: 'Zadaj pytanie zespołowi…' },
    { value: 'kudos', label: 'Wyróżnienie', icon: 'award', placeholder: 'Za co chcesz kogoś wyróżnić?' },
    { value: 'announcement', label: 'Ogłoszenie', icon: 'megaphone', placeholder: 'Ogłoszenie dla całego biura…', management: true }
  ];
  var BADGES = { announcement: 'Ogłoszenie', poll: 'Ankieta', kudos: 'Wyróżnienie' };

  var drafts = { post: '', project: '', comments: {}, mode: 'post', images: [], options: ['', ''], to: '', busy: 0 };
  var composerNode = null;

  /** „45 min”, „2 h”, „2 h 30 min” — czas pracy bez zaokrąglania do zera. */
  function minutesLabel(minutes) {
    var m = Math.max(1, Math.round(minutes));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }

  /** „DEMO-001” → „001”, „2601” zostaje: skrót numeru mieści się w kółku i na kafelku. */
  function shortCode(code) { return String(code).replace(/^[A-Za-z]+-?/, '') || String(code); }

  function person(people, id) { return Team.findPerson(people, id); }
  function name(p) { return p ? Team.fullName(p) : 'System'; }

  function actorAvatar(item, people) {
    var p = person(people, item.actorId);
    if (p) return E.Avatar.avatar(p, { size: 'md' });
    if (item.kind === 'event') {
      var ev = item.event;
      var icon = ev.event === 'stage-done' ? 'checkCircle' : (ev.event === 'health' ? (ev.level === 'alarm' ? 'alertCircle' : (ev.level === 'warning' ? 'alert' : 'checkCircle')) : (ev.event === 'project-done' ? 'flag' : 'clock'));
      return D.el('span', { class: 'fd__sysicon fd__sysicon--' + (ev.level || 'normal') }, [Icons.icon(icon, 18)]);
    }
    return D.el('span', { class: 'fd__sysicon' }, [Icons.icon(item.kind === 'mail' ? 'mail' : 'folder', 18)]);
  }

  function projectChip(project) {
    if (!project) return D.el('span', { class: 'fd__chip fd__chip--office', text: 'Całe biuro' });
    return D.el('a', { class: 'fd__chip', text: project.code + ' · ' + project.name, attrs: { href: E.ProjectList.projectHref(project) } });
  }

  function headline(item, people) {
    var who = name(person(people, item.actorId));
    if (item.kind === 'project') return { title: 'Nowy projekt w biurze', lead: item.project.name, text: '' };
    if (item.kind === 'event') {
      // Kontekst projektowy: „2601 → Postępowanie lokalizacyjne”, bez udawania wpisu człowieka.
      var ev = item.event;
      var st = ev.stageId ? (item.project.stages || []).filter(function (x) { return x.id === ev.stageId; })[0] : null;
      var where = item.project.code + ' → ' + (st ? E.Model.describeStage(st).name : item.project.name);
      return ev.event === 'stage-done'
        ? { title: ev.title, lead: where, text: ev.detail }
        : { title: ev.title, lead: where, text: ev.text + (ev.detail ? ' · ' + ev.detail : '') };
    }
    if (item.kind === 'mail') {
      var m = item.mail;
      return {
        title: (m.direction === 'out' ? 'Pismo wychodzące' : 'Pismo przychodzące') + ' · ' + (m.regNo || ''),
        lead: m.subject, text: (m.direction === 'out' ? 'Do: ' : 'Od: ') + m.counterparty
      };
    }
    if (item.kind === 'time') {
      return { title: who + ' — czas pracy', lead: item.label || 'Praca nad projektem', text: minutesLabel(item.minutes) };
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
    if (item.kind === 'event') {
      var stageEvent = item.event.event === 'stage-done' && item.event.stageId && ctx.actions.openStage;
      return [UI.button({ label: stageEvent ? 'Otwórz etap' : 'Otwórz projekt', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'fd-event-open-' + item.event.id }, onClick: function () { if (stageEvent) ctx.actions.openStage(item.project.id, item.event.stageId); else ctx.actions.openProject(item.project.id, 'etapy'); } })];
    }
    return [];
  }

  var lightbox = null;

  function closeLightbox() {
    if (!lightbox) return;
    document.removeEventListener('keydown', lightbox.onKey, true);
    lightbox.node.remove();
    var back = lightbox.back;
    lightbox = null;
    if (back && back.focus) back.focus({ preventScroll: true });
  }

  function openLightbox(images, index, caption) {
    closeLightbox();
    var at = index;
    var img = D.el('img', { class: 'fd__lbimg', attrs: { alt: caption } });
    var count = D.el('span', { class: 'fd__lbcount t-num' });
    var show = function (n) {
      at = (n + images.length) % images.length;
      img.src = images[at];
      count.textContent = images.length > 1 ? (at + 1) + ' / ' + images.length : '';
    };
    var close = UI.iconButton({ icon: 'close', label: 'Zamknij podgląd', onClick: closeLightbox, class: 'fd__lbbtn' });
    var node = D.el('div', { class: 'fd__lightbox', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Podgląd zdjęcia' } }, [
      D.el('div', { class: 'fd__lbback', on: { click: closeLightbox } }),
      D.el('figure', { class: 'fd__lbfig' }, [img, D.el('figcaption', { class: 'fd__lbcap' }, [D.el('span', { text: caption }), count])]),
      close,
      images.length > 1 ? UI.iconButton({ icon: 'chevronLeft', label: 'Poprzednie zdjęcie', class: 'fd__lbbtn fd__lbprev', onClick: function () { show(at - 1); } }) : null,
      images.length > 1 ? UI.iconButton({ icon: 'chevronRight', label: 'Następne zdjęcie', class: 'fd__lbbtn fd__lbnext', onClick: function () { show(at + 1); } }) : null
    ]);
    var onKey = function (event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLightbox(); }
      else if (event.key === 'ArrowRight' && images.length > 1) { event.preventDefault(); show(at + 1); }
      else if (event.key === 'ArrowLeft' && images.length > 1) { event.preventDefault(); show(at - 1); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(node);
    lightbox = { node: node, onKey: onKey, back: document.activeElement };
    show(index);
    close.focus();
  }

  function gallery(post, authorName) {
    var images = post.images || [];
    if (!images.length) return null;
    return D.el('div', { class: 'fd__gallery fd__gallery--n' + images.length }, images.map(function (src, i) {
      return D.el('button', {
        class: 'fd__shot', attrs: { type: 'button', 'aria-label': 'Powiększ zdjęcie ' + (i + 1) + ' z ' + images.length, 'data-fk': 'fd-shot-' + post.id + '-' + i },
        on: { click: function () { openLightbox(images, i, authorName); } }
      }, [D.el('img', { attrs: { src: src, alt: 'Zdjęcie ' + (i + 1) + ' z ' + images.length + ' we wpisie: ' + authorName, loading: 'lazy' } })]);
    }));
  }

  function pollBlock(item, ctx, state) {
    var res = Social.pollResults(item.post, state.prefs.me);
    var voted = res.options.some(function (o) { return o.mine; });
    return D.el('div', { class: 'fd__poll', attrs: { role: 'group', 'aria-label': 'Odpowiedzi w ankiecie' } }, res.options.map(function (o) {
      return D.el('button', {
        class: 'fd__opt' + (o.mine ? ' is-mine' : ''),
        attrs: { type: 'button', 'aria-pressed': String(o.mine), 'data-fk': 'fd-vote-' + item.post.id + '-' + o.id, disabled: state.prefs.me ? null : 'disabled' },
        on: { click: function () { ctx.actions.votePoll(item.post.id, o.id); } }
      }, [
        D.el('span', { class: 'fd__optbar', style: { width: (voted || res.total ? o.percent : 0) + '%' } }),
        D.el('span', { class: 'fd__optlabel', text: o.text }),
        D.el('span', { class: 'fd__optnum t-num', text: voted ? o.percent + '% · ' + o.count : '' })
      ]);
    }).concat([D.el('p', { class: 't-meta fd__polltotal', text: res.total ? Format.count(res.total, 'głos', 'głosy', 'głosów') + (voted ? '' : ' — zagłosuj, aby zobaczyć wyniki') : 'Nikt jeszcze nie głosował' })]));
  }

  function editor(post, ctx) {
    var area = D.el('textarea', { class: 'fd__textarea fd__edit', attrs: { rows: '3', maxlength: String(Social.LIMITS.post), 'aria-label': 'Treść wpisu', 'data-fk': 'fd-edit-text' } });
    area.value = post.text;
    var save = function () { ctx.actions.editPost(post.id, area.value); };
    area.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
      else if (event.key === 'Escape') { event.preventDefault(); ctx.actions.setFeedEditing(null); }
    });
    window.setTimeout(function () { if (area.isConnected) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); } }, 30);
    return D.el('div', { class: 'fd__editor' }, [area, D.el('div', { class: 'fd__editact' }, [
      UI.button({ label: 'Anuluj', variant: 'ghost', size: 'sm', onClick: function () { ctx.actions.setFeedEditing(null); } }),
      UI.button({ label: 'Zapisz', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'fd-edit-save' }, onClick: save })
    ])]);
  }

  function card(item, ctx, state, people, now) {
    var h = headline(item, people);
    var me = state.prefs.me;
    var post = item.kind === 'post' ? item.post : null;
    var type = post ? (post.type || 'post') : '';
    var author = name(person(people, item.actorId));
    var manage = Budget.isManagement(me, people);
    var canDelete = post && (post.personId === me || manage);
    var thread = commentsBlock(item, ctx, state, people);
    var target = type === 'kudos' ? person(people, post.to) : null;
    var editing = !!post && state.feedEditing === post.id;
    var canEdit = !!post && post.personId === me;
    var body;
    if (editing) {
      body = editor(post, ctx);
    } else if (type === 'kudos') {
      body = D.el('div', { class: 'fd__kudos' }, [
        D.el('span', { class: 'fd__trophy', attrs: { 'aria-hidden': 'true' } }, [Icons.icon('award', 26)]),
        D.el('div', { class: 'fd__kbody' }, [
          D.el('div', { class: 'fd__kto' }, [target ? E.Avatar.avatar(target, { size: 'md' }) : null, D.el('strong', { text: target ? Team.fullName(target) : 'Wyróżniona osoba' })]),
          D.el('p', { class: 'fd__text', text: post.text })
        ])
      ]);
    } else if (type === 'poll') {
      body = [D.el('p', { class: 'fd__text fd__question', text: post.text }), pollBlock(item, ctx, state)];
    } else {
      body = [
        h.lead ? D.el('p', { class: 'fd__lead', text: h.lead }) : null,
        h.text ? D.el('p', { class: item.kind === 'task' ? 'fd__quote' : (item.kind === 'post' ? 'fd__text' : 'fd__sub'), text: h.text }) : null
      ];
    }
    return D.el('article', { class: 'fd__card fd__card--' + item.kind + (item.kind === 'event' ? ' fd__card--lvl-' + (item.event.level || 'normal') : '') + (type && type !== 'post' ? ' fd__card--' + type : '') + (post && post.pinned ? ' is-pinned' : ''), dataset: { feedKey: item.key, kind: item.kind, postType: type || null } }, [
      D.el('header', { class: 'fd__head' }, [
        actorAvatar(item, people),
        D.el('div', { class: 'fd__who' }, [
          D.el('span', { class: 'fd__name' }, [D.el('span', { class: 'truncate', text: h.title }), BADGES[type] ? D.el('span', { class: 'fd__badge fd__badge--' + type, text: BADGES[type] }) : null]),
          D.el('span', { class: 't-meta', text: Format.ago(item.at, now) + (post && post.edited ? ' · edytowano' : '') + (post && post.pinned ? ' · przypięte' : '') })
        ]),
        projectChip(item.project),
        (type === 'announcement' && manage) ? UI.iconButton({ icon: post.pinned ? 'pinOff' : 'pin', label: post.pinned ? 'Odepnij ogłoszenie' : 'Przypnij na górze', size: 'sm', attrs: { 'data-fk': 'fd-pin-' + post.id }, onClick: function () { ctx.actions.togglePin(post.id); } }) : null,
        (canEdit && !editing) ? UI.iconButton({ icon: 'edit', label: 'Edytuj wpis', size: 'sm', attrs: { 'data-fk': 'fd-edit-' + post.id }, onClick: function () { ctx.actions.setFeedEditing(post.id); } }) : null,
        canDelete ? UI.iconButton({ icon: 'trash', label: 'Usuń wpis', size: 'sm', onClick: function () { ctx.actions.removePost(post.id); } }) : null
      ])
    ].concat(body, [
      post ? gallery(post, author) : null,
      D.el('footer', { class: 'fd__foot' }, [
        reactionBar(item, ctx, state),
        D.el('div', { class: 'fd__footright' }, [thread.toggle].concat(quickActions(item, ctx)))
      ]),
      thread.panel
    ]));
  }

  /** Prawa kolumna: projekty w toku, ostatnie wyróżnienia i zespół. */
  function sidebar(state, ctx, now, people) {
    var projects = (state.workspace.projects || []).filter(function (p) { return p.status !== 'done'; })
      .sort(function (a, b) { return String(a.code).localeCompare(String(b.code), 'pl', { numeric: true }); });
    var kudos = ((state.workspace.social && state.workspace.social.posts) || []).filter(function (p) { return p.type === 'kudos'; })
      .sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); }).slice(0, 3);
    var active = people.filter(function (p) { return p.active !== false; });
    function widget(title, body, extra) {
      return D.el('section', { class: 'fd__widget' }, [D.el('header', { class: 'fd__whead' }, [D.el('h2', { text: title }), extra || null]), body]);
    }
    return D.el('aside', { class: 'fd__side', attrs: { 'aria-label': 'Boczny panel aktualności' } }, [
      projects.length ? widget('Projekty w toku', D.el('ul', { class: 'fd__plist' }, projects.map(function (p) {
        var level = E.Insight.health(p, now).level;
        return D.el('li', null, [D.el('button', { class: 'fd__prow', attrs: { type: 'button', 'data-fk': 'fd-story-' + p.id, 'data-tooltip': p.name }, on: { click: function () { ctx.actions.openProject(p.id, 'etapy'); } } }, [
          E.Sig.datum(level, { label: false }),
          D.el('span', { class: 'fd__pcode t-num', text: shortCode(p.code) }),
          D.el('span', { class: 'fd__pname truncate', text: p.name })
        ])]);
      }))) : null,
      kudos.length ? widget('Wyróżnienia', D.el('ul', { class: 'fd__klist' }, kudos.map(function (k) {
        var to = person(people, k.to);
        return D.el('li', null, [D.el('span', { class: 'fd__ktrophy', attrs: { 'aria-hidden': 'true' } }, [Icons.icon('award', 16)]), D.el('span', null, [D.el('strong', { text: to ? Team.fullName(to) : 'Ktoś z zespołu' }), D.el('span', { class: 't-meta fd__kreason', text: k.text })])]);
      }))) : null,
      active.length ? widget('Zespół', D.el('div', { class: 'fd__team' }, active.slice(0, 12).map(function (p) {
        return D.el('span', { class: 'fd__tm', attrs: { 'data-tooltip': Team.fullName(p) } }, [E.Avatar.avatar(p, { size: 'md' })]);
      }).concat([D.el('a', { class: 'fd__all', text: 'Cały zespół', attrs: { href: '#/zespol' } })])), D.el('span', { class: 't-meta t-num', text: String(active.length) })) : null
    ]);
  }

  /* ---------- Zdjęcia: zmniejszenie w przeglądarce, żeby wpisy zmieściły się w pamięci ---------- */

  function shrink(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        var c = canvas.getContext('2d');
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('read')); };
      img.src = url;
    });
  }

  function prepare(file) {
    if (!/^image\//.test(file.type || '')) return Promise.reject(new Error('type'));
    return shrink(file, 1400, 0.78).then(function (data) {
      return data.length > Social.LIMITS.imageChars ? shrink(file, 1000, 0.6) : data;
    }).then(function (data) {
      if (data.length > Social.LIMITS.imageChars) throw new Error('size');
      return data;
    });
  }

  /** Dodaje pliki do szkicu wpisu; zwraca obietnicę z liczbą dodanych zdjęć. */
  function attach(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type || ''); });
    var room = Social.LIMITS.images - drafts.images.length;
    if (!list.length) { notify('To nie jest zdjęcie.'); return Promise.resolve(0); }
    if (room <= 0) { notify('Do wpisu można dodać najwyżej ' + Social.LIMITS.images + ' zdjęcia.'); return Promise.resolve(0); }
    if (list.length > room) notify('Dodaję tylko ' + room + ' — to limit zdjęć we wpisie.');
    drafts.busy += 1;
    paintComposer();
    return Promise.all(list.slice(0, room).map(function (f) { return prepare(f).catch(function () { return null; }); })).then(function (done) {
      var ok = done.filter(Boolean);
      if (ok.length < done.length) notify('Nie wszystkie zdjęcia udało się wczytać.');
      drafts.images = drafts.images.concat(ok).slice(0, Social.LIMITS.images);
      drafts.busy -= 1;
      paintComposer();
      return ok.length;
    });
  }

  function notify(message) {
    if (E.Toast) E.Toast.show({ message: message, tone: 'danger' });
  }

  /* ---------- Kompozytor ---------- */

  function resetDraft() {
    drafts.post = ''; drafts.images = []; drafts.options = ['', '']; drafts.to = ''; drafts.mode = 'post';
    if (composerNode) { composerNode.text.value = ''; composerNode.text.style.height = ''; }
  }

  function publish() {
    var c = composerNode;
    var value = c.text.value;
    var projectId = c.select.value ? Number(c.select.value) : null;
    var extra = { type: drafts.mode, images: drafts.images.slice() };
    if (drafts.mode === 'poll') { extra.options = drafts.options.slice(); extra.images = []; }
    if (drafts.mode === 'kudos') extra.to = drafts.to;
    if (drafts.mode === 'announcement') { extra.pinned = true; projectId = null; }
    if (c.ctx.actions.addPost(value, projectId, extra)) { resetDraft(); paintComposer(); }
  }

  function paintComposer() {
    var c = composerNode;
    if (!c || !c.state) return;
    var st = c.state;
    var mode = MODES.filter(function (m) { return m.value === drafts.mode; })[0] || MODES[0];
    if (mode.management && !st.manage) { drafts.mode = 'post'; mode = MODES[0]; }
    c.root.dataset.mode = drafts.mode;
    c.text.placeholder = !st.me ? 'Wybierz w „Mojej pracy”, kim jesteś, aby pisać'
      : (mode.value === 'post' ? mode.placeholder + ', ' + (st.me.firstName || Team.fullName(st.me)) + '?' : mode.placeholder);

    var chips = D.el('div', { class: 'fd__modes', attrs: { role: 'tablist', 'aria-label': 'Rodzaj wpisu' } }, MODES.filter(function (m) { return !m.management || st.manage; }).map(function (m) {
      var active = m.value === drafts.mode;
      return D.el('button', {
        class: 'fd__mode' + (active ? ' is-active' : ''),
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(active), 'data-fk': 'fd-mode-' + m.value, disabled: st.me ? null : 'disabled' },
        on: { click: function () { drafts.mode = m.value; paintComposer(); } }
      }, [Icons.icon(m.icon, 15), D.el('span', { text: m.label })]);
    }));

    var extras = [];
    if (drafts.mode === 'poll') {
      extras.push(D.el('div', { class: 'fd__opts' }, drafts.options.map(function (value, i) {
        var input = D.el('input', { class: 'fd__optin', attrs: { type: 'text', maxlength: String(Social.LIMITS.pollOption), placeholder: 'Odpowiedź ' + (i + 1), 'aria-label': 'Odpowiedź ' + (i + 1), 'data-fk': 'fd-opt-' + i } });
        input.value = value;
        input.addEventListener('input', function () { drafts.options[i] = input.value; });
        return D.el('div', { class: 'fd__optrow' }, [input, drafts.options.length > 2 ? UI.iconButton({ icon: 'close', label: 'Usuń odpowiedź ' + (i + 1), size: 'sm', onClick: function () { drafts.options.splice(i, 1); paintComposer(); } }) : null]);
      }).concat(drafts.options.length < Social.LIMITS.pollOptions ? [UI.button({ label: 'Dodaj odpowiedź', icon: 'plus', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'fd-opt-add' }, onClick: function () { drafts.options.push(''); paintComposer(); } })] : [])));
    }
    if (drafts.mode === 'kudos') {
      var who = D.el('select', { class: 'fd__select', attrs: { 'aria-label': 'Kogo wyróżniasz', 'data-fk': 'fd-kudos-to' } },
        [D.el('option', { text: 'Wybierz osobę…', attrs: { value: '' } })].concat(st.people.filter(function (p) { return p.active !== false && (!st.me || p.id !== st.me.id); }).map(function (p) { return D.el('option', { text: Team.fullName(p), attrs: { value: p.id } }); })));
      who.value = drafts.to;
      who.addEventListener('change', function () { drafts.to = who.value; });
      extras.push(D.el('label', { class: 'fd__kudosrow' }, [Icons.icon('award', 16), D.el('span', { text: 'Wyróżniasz:' }), who]));
    }
    if (drafts.images.length || drafts.busy) {
      extras.push(D.el('div', { class: 'fd__thumbs', attrs: { 'aria-label': 'Zdjęcia do wpisu' } }, drafts.images.map(function (src, i) {
        return D.el('div', { class: 'fd__thumb' }, [
          D.el('img', { attrs: { src: src, alt: 'Zdjęcie ' + (i + 1) + ' do wpisu' } }),
          D.el('button', { class: 'fd__thumbx', attrs: { type: 'button', 'aria-label': 'Usuń zdjęcie ' + (i + 1), 'data-fk': 'fd-unattach-' + i }, on: { click: function () { drafts.images.splice(i, 1); paintComposer(); } } }, [Icons.icon('close', 12)])
        ]);
      }).concat(drafts.busy ? [D.el('div', { class: 'fd__thumb fd__thumb--busy', attrs: { role: 'status' }, text: 'Wczytuję…' })] : [])));
    }

    var photoBtn = UI.button({ label: 'Zdjęcie', icon: 'image', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'fd-photo', disabled: (st.me && drafts.mode !== 'poll') ? null : 'disabled' }, onClick: function () { c.file.click(); } });
    var options = [D.el('option', { text: 'Całe biuro', attrs: { value: '' } })].concat(st.projects.map(function (p) {
      return D.el('option', { text: p.code + ' · ' + p.name, attrs: { value: String(p.id) } });
    }));
    D.render(c.select, options);
    c.select.value = drafts.project;
    c.select.disabled = !st.me || drafts.mode === 'announcement';
    c.send.disabled = !st.me;
    D.render(c.modes, [chips]);
    D.render(c.extra, extras);
    D.render(c.tools, [photoBtn, c.select, D.el('span', { class: 't-meta fd__hint', text: 'Ctrl + Enter publikuje' }), c.send]);
    c.send.querySelector('span').textContent = drafts.mode === 'announcement' ? 'Opublikuj ogłoszenie' : 'Opublikuj';
    c.text.disabled = !st.me;
    if (c.who.firstChild !== null) D.clear(c.who);
    c.who.appendChild(st.me ? E.Avatar.avatar(st.me, { size: 'md' }) : D.el('span', { class: 'avatar avatar--md' }));
  }

  function composer(state, ctx, me) {
    if (!composerNode) {
      composerNode = {
        root: D.el('section', { class: 'fd__composer' }),
        text: D.el('textarea', { class: 'fd__textarea', attrs: { rows: '2', maxlength: String(Social.LIMITS.post), 'aria-label': 'Nowy wpis' } }),
        select: D.el('select', { class: 'fd__select', attrs: { 'aria-label': 'Projekt wpisu' } }),
        who: D.el('span', { class: 'fd__cwho' }),
        modes: D.el('div', { class: 'fd__cmodes' }),
        extra: D.el('div', { class: 'fd__cextra' }),
        tools: D.el('div', { class: 'fd__cactions' }),
        file: D.el('input', { class: 'fd__file', attrs: { type: 'file', accept: 'image/*', multiple: 'multiple', tabindex: '-1', 'aria-hidden': 'true', 'data-fk': 'fd-file' } }),
        send: UI.button({ label: 'Opublikuj', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'fd-publish' } })
      };
      var c = composerNode;
      c.text.addEventListener('input', function () {
        drafts.post = c.text.value;
        c.text.style.height = 'auto';
        c.text.style.height = Math.min(c.text.scrollHeight, 320) + 'px';
      });
      c.select.addEventListener('change', function () { drafts.project = c.select.value; });
      c.send.addEventListener('click', publish);
      c.text.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); publish(); }
      });
      c.file.addEventListener('change', function () { attach(c.file.files); c.file.value = ''; });
      c.text.addEventListener('paste', function (event) {
        var files = event.clipboardData && event.clipboardData.files;
        if (files && files.length && /^image\//.test(files[0].type)) { event.preventDefault(); attach(files); }
      });
      c.root.addEventListener('dragover', function (event) { if (event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types || [], 'Files') >= 0) { event.preventDefault(); c.root.classList.add('is-drop'); } });
      c.root.addEventListener('dragleave', function (event) { if (!c.root.contains(event.relatedTarget)) c.root.classList.remove('is-drop'); });
      c.root.addEventListener('drop', function (event) { event.preventDefault(); c.root.classList.remove('is-drop'); attach(event.dataTransfer.files); });
      D.render(c.root, [
        D.el('div', { class: 'fd__crow' }, [c.who, c.text]),
        c.modes, c.extra, c.tools, c.file
      ]);
    }
    composerNode.ctx = ctx;
    composerNode.state = {
      me: me, people: state.workspace.people || [], projects: state.workspace.projects || [],
      manage: !!me && Budget.isManagement(me.id, state.workspace.people || [])
    };
    if (!composerNode.text.value) composerNode.text.value = drafts.post;
    paintComposer();
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
    var pinned = result.pinned && result.pinned.length ? D.el('section', { class: 'fd__pinned', attrs: { 'aria-label': 'Przypięte ogłoszenia' } }, result.pinned.map(function (item) { return card(item, ctx, state, people, now); })) : null;
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
      summary: me ? 'Firmowe media społecznościowe: wpisy, zdjęcia, ankiety, ogłoszenia i zdarzenia z projektów.' : 'Wybierz w „Mojej pracy”, kim jesteś, aby reagować i pisać.',
      body: D.el('div', { class: 'fd' }, [
        D.el('div', { class: 'fd__main' }, [me ? null : E.Welcome.card(state, ctx, 'Aktualności to firmowa tablica: wpisy, zdjęcia, ankiety i zdarzenia z projektów. Żeby pisać i reagować, system musi wiedzieć, kim jesteś.'), me ? composer(state, ctx, me) : null, pinned, filterBar(result, filter, ctx.actions), list, more]),
        sidebar(state, ctx, now, people)
      ]),
      result: result
    };
  }

  root.ETROM.FeedScreen = { view: view, FILTERS: FILTERS, attach: attach, shortCode: shortCode, minutesLabel: minutesLabel, drafts: drafts };
})(typeof globalThis !== 'undefined' ? globalThis : this);
