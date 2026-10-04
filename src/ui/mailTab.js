/* ETROM — zakładka Korespondencja: dziennik poczty przychodzącej i wychodzącej projektu
   oraz formularz wpisu. Wpisy prowadzi człowiek; kształt formularza odpowiada temu,
   co później zaproponuje AI po odczytaniu pisma (patrz docs/KORESPONDENCJA.md). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var F = E.Format;
  var Mail = E.Mail;
  var Menu = E.Menu;

  
  function options(map, order) {
    return (order || Object.keys(map)).map(function (key) { return { value: key, label: map[key] }; });
  }

  function rowMenu(entry, project, actions) {
    var btn = UI.iconButton({
      icon: 'more', label: 'Działania pisma: ' + entry.subject, size: 'sm', class: 'row-actions',
      attrs: { 'data-fk': 'mail-more-' + entry.id }
    });
    Menu.bind(btn, function () {
      var items = [
        { label: 'Edytuj wpis', icon: 'edit', onSelect: function () { actions.editMail(entry.id); } }
      ];
      if (entry.direction === 'in' && !Mail.linkedTasks(project, entry.id, [], new Date()).length) items.push({ label: entry.needsAction ? 'Zdejmij z „Wymaga reakcji”' : 'Oznacz jako wymaga reakcji', icon: 'flag', onSelect: function () { actions.toggleMailAction(entry.id); } });
      if (entry.direction === 'in') items.unshift({ label: 'Napisz odpowiedź…', icon: 'reply', onSelect: function () { actions.replyMail(entry.id); } });
      if (entry.direction === 'in') items.push({ label: 'Utwórz zadanie z pisma…', icon: 'checklist', onSelect: function () { actions.mailTask(entry.id); } });
      items.push({ type: 'separator' });
      items.push({ label: 'Usuń wpis', icon: 'trash', tone: 'danger', onSelect: function () { actions.deleteMail(entry.id); } });
      return { label: 'Działania pisma', align: 'end', items: items };
    });
    return btn;
  }

  /** Zadania powstałe z pisma (z czasem pracy) albo przycisk, który je zakłada. */
  function taskLine(entry, project, ctx, now) {
    var linked = Mail.linkedTasks(project, entry.id, ctx.state.workspace.entries, now);
    if (!linked.length) {
      if (entry.direction !== 'in') return null;
      return D.el('span', { class: 'mrow2__tasks' }, [
        UI.button({ label: 'Zrób z tego zadanie', icon: 'plus', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'mail-task-' + entry.id }, onClick: function () { ctx.actions.mailTask(entry.id); } })
      ]);
    }
    return D.el('span', { class: 'mrow2__tasks' }, linked.map(function (row) {
      return D.el('button', {
        class: 'mrow2__task', attrs: { type: 'button', 'data-fk': 'mail-linked-' + row.task.id, 'data-tooltip': 'Otwórz zadanie' },
        on: { click: function () { ctx.actions.inspect({ kind: 'task', projectId: project.id, stageId: row.stage.id, taskId: row.task.id }); } }
      }, [
        E.Icons.icon('checklist', 13),
        D.el('span', { class: 'truncate', text: row.task.name }),
        D.el('span', { class: 'mrow2__task-meta t-num', text: E.Tasks.TASK_STATUS[row.task.status] + ' · ' + F.hours(row.hours) })
      ]);
    }));
  }

  function mailRow(entry, list, project, ctx, now) {
    var incoming = entry.direction === 'in';
    var parent = entry.replyTo ? list.filter(function (e) { return e.id === entry.replyTo; })[0] : null;
    return D.el('div', { class: 'mrow2 mrow2--' + entry.direction, attrs: { 'data-mail': entry.id } }, [
      D.el('span', { class: 'mrow2__dir', attrs: { 'data-tooltip': incoming ? 'Pismo przychodzące' : 'Pismo wychodzące' } }, [
        E.Icons.icon(incoming ? 'arrowDown' : 'arrowUp', 14)
      ]),
      D.el('span', { class: 'mrow2__no t-num', text: entry.regNo }),
      D.el('span', { class: 'mrow2__date t-num', text: F.date(entry.registeredDate, { year: 'always' }) }),
      D.el('span', { class: 'mrow2__main' }, [
        D.el('span', { class: 'mrow2__subject truncate', text: entry.subject }),
        D.el('span', { class: 'mrow2__meta truncate' }, [
          D.el('span', { text: (incoming ? 'Od: ' : 'Do: ') + entry.counterparty }),
          entry.number ? D.el('span', { class: 't-num', text: ' · ' + entry.number }) : null,
          parent ? D.el('span', { text: ' · odpowiedź na ' + parent.regNo }) : null
        ])
      ]),
      UI.badge(Mail.KINDS[entry.kind], 'neutral'),
      entry.needsAction ? UI.badge('Wymaga reakcji', 'warning', { icon: 'flag' }) : D.el('span'),
      rowMenu(entry, project, ctx.actions),
      taskLine(entry, project, ctx, now)
    ]);
  }

  function mailTab(project, ctx) {
    var now = new Date();
    var all = Mail.forProject(ctx.state.workspace.mail || [], project.id);
    var view = ctx.state.mailView || { direction: 'all', waiting: false, query: '' };
    var pending = Mail.pending(all, project.id, now);

    var toolbar = D.el('div', { class: 'section__head' }, [
      D.el('div', { class: 'section__titles' }, [
        D.el('h2', { class: 'section__title', text: 'Korespondencja' }),
        D.el('span', { class: 'section__meta', text: all.length
          ? F.count(all.length, 'pismo', 'pisma', 'pism') + (pending.length ? ' · wymaga reakcji: ' + pending.length : '')
          : 'dziennik pusty' })
      ]),
      D.el('div', { class: 'section__tools' }, [
        UI.button({ label: 'Pismo wychodzące', icon: 'arrowUp', variant: 'secondary', size: 'sm', attrs: { id: 'mail-add-out' }, onClick: function () { ctx.actions.addMail(project.id, 'out'); } }),
        UI.button({ label: 'Pismo przychodzące', icon: 'arrowDown', variant: 'primary', size: 'sm', attrs: { id: 'mail-add-in' }, onClick: function () { ctx.actions.addMail(project.id, 'in'); } })
      ])
    ]);

    if (!all.length) {
      return D.el('section', { class: 'section' }, [toolbar, D.el('div', { class: 'card' }, [UI.emptyState({
        icon: 'mail',
        title: 'Dziennik korespondencji jest pusty',
        text: 'Zapisuj pisma wpływające i wysyłane w tym projekcie: numer w dzienniku nadaje się sam. Gdy pismo wymaga działania, zrób z niego zadanie.',
        actions: [UI.button({ label: 'Zapisz pierwsze pismo', icon: 'plus', variant: 'secondary', onClick: function () { ctx.actions.addMail(project.id, 'in'); } })]
      })])]);
    }

    var rows = Mail.filter(all, { direction: view.direction, waiting: view.waiting, query: view.query, now: now });

    var search = UI.input({ id: 'mail-search', value: view.query, placeholder: 'Szukaj: temat, nadawca, znak, numer', attrs: { type: 'search', 'data-fk': 'mail-search' } });
    search.addEventListener('input', function () { ctx.actions.setMailView({ query: search.value }); });

    var filters = D.el('div', { class: 'mail-filters' }, [
      UI.segmented({
        label: 'Kierunek korespondencji',
        value: view.waiting ? 'waiting' : view.direction,
        items: [
          { value: 'all', label: 'Wszystkie' },
          { value: 'in', label: 'Przychodzące' },
          { value: 'out', label: 'Wychodzące' },
          { value: 'waiting', label: 'Wymaga reakcji' + (pending.length ? ' (' + pending.length + ')' : '') }
        ],
        onChange: function (value) {
          ctx.actions.setMailView(value === 'waiting' ? { waiting: true, direction: 'all' } : { waiting: false, direction: value });
        }
      }).node,
      search
    ]);

    var body = rows.length
      ? D.el('div', { class: 'mail-list' }, rows.map(function (entry) { return mailRow(entry, all, project, ctx, now); }))
      : D.el('div', { class: 'card' }, [UI.emptyState({ icon: 'search', compact: true, title: 'Nic nie pasuje', text: 'Zmień filtr albo frazę wyszukiwania.' })]);

    return D.el('section', { class: 'section' }, [toolbar, filters, body]);
  }

  /**
   * @param {{mode:'new'|'edit', draft:Object, errors:Object, replies:Array}} spec
   * replies: pisma w przeciwnym kierunku, na które można odpowiedzieć (value, label)
   */
  function mailForm(spec, handlers) {
    var d = spec.draft || {};
    var er = spec.errors || {};
    var incoming = d.direction !== 'out';

    var direction = UI.select({ id: 'ml-direction', value: d.direction || 'in', options: options(Mail.DIRECTIONS), attrs: { disabled: spec.mode === 'edit' && spec.locked ? true : null } });
    var kind = UI.select({ id: 'ml-kind', value: d.kind || 'other', options: options(Mail.KINDS, Mail.KIND_ORDER) });
    var counterparty = UI.input({ id: 'ml-party', value: d.counterparty, error: er.counterparty, maxlength: 200, placeholder: incoming ? 'np. RZGW Kraków' : 'np. Starostwo Powiatowe' });
    var subject = UI.input({ id: 'ml-subject', value: d.subject, error: er.subject, maxlength: 300, placeholder: 'np. Wezwanie do uzupełnienia wniosku' });
    var number = UI.input({ id: 'ml-number', value: d.number, error: er.number, maxlength: 120, placeholder: 'np. KR.ZZ.2.4210.12.2026' });
    var registered = UI.input({ id: 'ml-registered', type: 'date', value: d.registeredDate, error: er.registeredDate });
    var letterDate = UI.input({ id: 'ml-letter', type: 'date', value: d.letterDate, error: er.letterDate });
    var summary = UI.textarea({ id: 'ml-summary', rows: 4, value: d.summary, placeholder: 'O co chodzi, czego pismo wymaga (nieobowiązkowe)', attrs: { maxlength: '2000' } });
    var where = UI.input({ id: 'ml-where', value: d.where, maxlength: 300, placeholder: 'np. segregator 3 · folder na dysku' });
    var needs = incoming ? UI.checkbox({ id: 'ml-needs', checked: !!d.needsAction, label: 'Wymaga reakcji', hint: 'Zwykle zostaw odznaczone. Zaznaczone pismo trafia do „Wymaga reakcji”, dopóki nie zrobisz z niego zadania.' }) : null;
    var replyTo = UI.select({
      id: 'ml-replyto', value: d.replyTo || '',
      options: [{ value: '', label: '— to nie jest odpowiedź —' }].concat(spec.replies || [])
    });

    // Zmiana kierunku przestawia podpowiedzi (nadawca/adresat, data wpływu/wysłania) bez utraty wpisanego tekstu.
    var fresh = function () {
      return {
        id: d.id, direction: direction.value, kind: kind.value, counterparty: counterparty.value, subject: subject.value,
        number: number.value, registeredDate: registered.value, letterDate: letterDate.value,
        summary: summary.value, where: where.value,
        needsAction: incoming && needs ? needs.querySelector('input').checked : false,
        replyTo: replyTo.value
      };
    };
    direction.addEventListener('change', function () { handlers.onRedraft(fresh()); });
    return E.Dialog.drawerForm({
      id: 'mail-form',
      submitLabel: spec.mode === 'edit' ? 'Zapisz zmiany' : 'Wpisz do dziennika',
      onCancel: handlers.onCancel,
      onSubmit: function () { handlers.onSubmit(fresh()); },
      body: [
        UI.field({ id: 'ml-direction', label: 'Kierunek', required: true, control: direction, error: er.direction }),
        UI.field({ id: 'ml-kind', label: 'Rodzaj pisma', required: true, control: kind, error: er.kind }),
        UI.field({ id: 'ml-subject', label: 'Temat', required: true, control: subject, error: er.subject }),
        UI.field({ id: 'ml-party', label: incoming ? 'Nadawca' : 'Adresat', required: true, control: counterparty, error: er.counterparty }),
        UI.field({ id: 'ml-number', label: 'Znak pisma', optional: true, control: number, error: er.number, hint: 'Numer sprawy nadany przez urząd albo przez nas.' }),
        UI.field({ id: 'ml-registered', label: incoming ? 'Data wpływu' : 'Data wysłania', required: true, control: registered, error: er.registeredDate }),
        UI.field({ id: 'ml-letter', label: 'Data pisma', optional: true, control: letterDate, error: er.letterDate, hint: 'Jeśli różni się od daty w dzienniku.' }),
        needs,
        (spec.replies && spec.replies.length) ? UI.field({ id: 'ml-replyto', label: incoming ? 'To jest odpowiedź na nasze pismo' : 'To jest odpowiedź na pismo', optional: true, control: replyTo, error: er.replyTo }) : null,
        UI.field({ id: 'ml-summary', label: 'Streszczenie', optional: true, control: summary, error: er.summary }),
        UI.field({ id: 'ml-where', label: 'Gdzie jest oryginał', optional: true, control: where, hint: 'Segregator, folder na dysku. Załączniki w programie dojdą później.' })
      ]
    });
  }

  E.MailTab = { mailTab: mailTab, mailForm: mailForm };
})(window);
