/* ETROM — sekcja „Wymaga reakcji” w „Mojej pracy” (dawna Skrzynka): zatwierdzenia i pisma
   do odpowiedzi jednej osoby oraz pasek projektów w alarmie. Osobnego ekranu już nie ma —
   jedno miejsce na „co mam zrobić”. Objaśnienia są w dymkach (po najechaniu), nie na ekranie.
   Pozycje wynikają ze stanu pracy (core/inbox.js) — nie ma „oznacz jako przeczytane”:
   pozycja znika, gdy człowiek zrobi to, czego od niej oczekuje. Można ją odłożyć do jutra. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Icons = E.Icons;
  var Inbox = E.Inbox;
  var Team = E.Team;

  var ICONS = { approve: 'checkCircle', returned: 'alert', mail: 'mail', project: 'alertCircle' };

  function dateOf(item) {
    if (item.kind === 'mail') return item.entry.replyDue;
    if (item.task) return item.task.deadline;
    return '';
  }

  function openItem(item, actions) {
    if (item.task) actions.inspect({ kind: 'task', projectId: item.project.id, stageId: item.stage.id, taskId: item.task.id });
    else if (item.kind === 'mail') actions.openProject(item.project.id, 'korespondencja');
    else actions.openProject(item.project.id, 'etapy');
  }

  function primaryActions(item, actions) {
    if (item.kind === 'approve') {
      return [
        UI.button({ label: 'Zatwierdź', icon: 'check', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'inbox-approve-' + item.task.id }, onClick: function () { actions.moveTask(item.project.id, item.stage.id, item.task.id, 'done'); } }),
        UI.button({ label: 'Zwróć', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-return-' + item.task.id }, onClick: function () { actions.moveTask(item.project.id, item.stage.id, item.task.id, 'changes'); } })
      ];
    }
    if (item.kind === 'mail') {
      var linked = item.linked || [];
      return [
        linked.length
          ? UI.button({ label: 'Otwórz zadanie', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'inbox-task-' + item.entry.id }, onClick: function () { actions.inspect({ kind: 'task', projectId: item.project.id, stageId: linked[0].stage.id, taskId: linked[0].task.id }); } })
          : UI.button({ label: 'Utwórz zadanie', icon: 'plus', variant: 'secondary', size: 'sm', attrs: { 'data-fk': 'inbox-mailtask-' + item.entry.id }, onClick: function () { actions.mailTask(item.entry.id); } }),
        UI.button({ label: 'Napisz odpowiedź', icon: 'reply', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'inbox-reply-' + item.entry.id }, onClick: function () { actions.replyMail(item.entry.id); } })
      ];
    }
    var label = item.kind === 'project' ? 'Otwórz projekt' : 'Otwórz zadanie';
    return [UI.button({ label: label, variant: 'secondary', size: 'sm', onClick: function () { openItem(item, actions); } })];
  }

  function linkedChips(item, actions) {
    if (item.kind !== 'mail' || !(item.linked || []).length) return null;
    return D.el('span', { class: 'ibx__linked' }, item.linked.map(function (row) {
      return D.el('button', {
        class: 'mrow2__task', attrs: { type: 'button', 'data-tooltip': 'Otwórz zadanie' },
        on: { click: function () { actions.inspect({ kind: 'task', projectId: item.project.id, stageId: row.stage.id, taskId: row.task.id }); } }
      }, [Icons.icon('checklist', 13), D.el('span', { class: 'truncate', text: row.task.name }), D.el('span', { class: 'mrow2__task-meta t-num', text: E.Tasks.TASK_STATUS[row.task.status] + ' · ' + E.Format.hours(row.hours) })]);
    }));
  }

  function row(item, ctx, now) {
    var date = dateOf(item);
    var context = [
      D.el('a', { class: 'mrow__project', text: item.project.code, attrs: { href: E.ProjectList.projectHref(item.project), 'data-tooltip': item.project.name } }),
      item.stage ? D.el('span', { class: 'truncate', text: E.Model.describeStage(item.stage).name }) : null,
      item.detail ? D.el('span', { class: 'truncate ibx__detail', text: item.detail }) : null
    ];
    return D.el('li', { class: 'ibx__row' + (item.urgent ? ' is-urgent' : ''), dataset: { inboxKey: item.key, kind: item.kind } }, [
      D.el('span', { class: 'ibx__kind', attrs: { 'data-tooltip': Inbox.KINDS[item.kind].label } }, [Icons.icon(ICONS[item.kind], 16)]),
      D.el('div', { class: 'ibx__body' }, [
        D.el('span', { class: 'ibx__titleline' }, [
          D.el('button', {
            class: 'ibx__title trow__name',
            text: item.title,
            attrs: { type: 'button', 'data-fk': 'inbox-open-' + item.key },
            on: { click: function () { openItem(item, ctx.actions); } }
          }),
          D.el('span', { class: 'ibx__info', attrs: { tabindex: '0', role: 'img', 'aria-label': item.why, 'data-tooltip': item.why } }, [Icons.icon('info', 14)])
        ]),
        D.el('span', { class: 'mrow__context' }, context.filter(Boolean)),
        linkedChips(item, ctx.actions)
      ]),
      D.el('span', { class: 'ibx__when' }, [date ? UI.countdown(String(date).slice(0, 10), { now: now }) : null]),
      D.el('div', { class: 'ibx__actions' }, primaryActions(item, ctx.actions).concat([
        UI.iconButton({ icon: 'clock', label: 'Odłóż do jutra', size: 'sm', attrs: { 'data-fk': 'inbox-snooze-' + item.key }, onClick: function () { ctx.actions.snoozeInbox(item.key, item.title); } })
      ]))
    ]);
  }

  var SECTION_HINT = 'Rzeczy, na które czeka ktoś inny: zadania do zatwierdzenia i pisma, którym zbliża się termin odpowiedzi. Pojawiają się same, a znikają, gdy je załatwisz.';

  /** Dzieli wynik Inbox.build na to, co idzie do sekcji „Wymaga reakcji”, i alarmy projektów.
   *  Zadania wrócone do poprawy zostają na zwykłej liście zadań (mają tam uwagę i termin). */
  function split(result) {
    var react = result.items.filter(function (i) { return i.kind === 'approve' || i.kind === 'mail'; });
    var alarms = result.items.filter(function (i) { return i.kind === 'project'; });
    var hiddenTasks = {};
    react.forEach(function (item) {
      (item.linked || []).forEach(function (r) { hiddenTasks[r.task.id] = true; });
    });
    var later = result.snoozed.filter(function (i) { return i.kind === 'approve' || i.kind === 'mail'; });
    return { react: react, alarms: alarms, hiddenTasks: hiddenTasks, snoozed: later, urgent: react.filter(function (i) { return i.urgent; }).length };
  }

  /** Sekcja „Wymaga reakcji” — ten sam szkielet co sekcje zadań. */
  function section(items, ctx, now) {
    if (!items.length) return null;
    var urgent = items.some(function (i) { return i.urgent; });
    return D.el('section', { class: 'msec' + (urgent ? ' msec--alarm' : ''), dataset: { group: 'react' }, attrs: { 'aria-label': 'Wymaga reakcji' } }, [
      D.el('div', { class: 'msec__head' }, [
        D.el('h2', { class: 'msec__title', text: 'Wymaga reakcji' }),
        D.el('span', { class: 'msec__count t-num', text: String(items.length) }),
        D.el('span', { class: 'ibx__info', attrs: { tabindex: '0', role: 'img', 'aria-label': SECTION_HINT, 'data-tooltip': SECTION_HINT } }, [Icons.icon('info', 14)])
      ]),
      D.el('ul', { class: 'ibx__list', attrs: { 'aria-label': 'Wymaga reakcji' } }, items.map(function (item) { return row(item, ctx, now); }))
    ]);
  }

  /** Wąski pasek projektów w alarmie (tylko dla liderów). */
  function alarmStrip(items, ctx) {
    if (!items.length) return null;
    return D.el('div', { class: 'ibx__alarms', attrs: { role: 'group', 'aria-label': 'Projekty w alarmie' } }, [
      D.el('span', { class: 'ibx__alarms-label' }, [Icons.icon('alertCircle', 14), D.el('span', { text: 'Projekty w alarmie' })])
    ].concat(items.map(function (item) {
      return D.el('button', {
        class: 'ibx__alarm', dataset: { inboxKey: item.key, kind: 'project' },
        attrs: { type: 'button', 'data-fk': 'inbox-open-' + item.key, 'data-tooltip': item.title + ' — ' + item.detail + '. ' + item.why },
        on: { click: function () { openItem(item, ctx.actions); } }
      }, [D.el('span', { class: 'code', text: item.project.code }), D.el('span', { class: 'truncate', text: item.detail })]);
    })));
  }

  function snoozedBlock(list, actions) {
    if (!list.length) return null;
    return D.el('details', { class: 'ibx__later' }, [
      D.el('summary', null, [Icons.icon('clock', 14), D.el('span', { text: 'Odłożone (' + list.length + ')' })]),
      D.el('ul', { class: 'ibx__list' }, list.map(function (item) {
        return D.el('li', { class: 'ibx__row ibx__row--later', dataset: { inboxKey: item.key } }, [
          D.el('span', { class: 'ibx__kind' }, [Icons.icon(ICONS[item.kind], 16)]),
          D.el('div', { class: 'ibx__body' }, [
            D.el('span', { class: 'ibx__title', text: item.title }),
            D.el('span', { class: 'mrow__context' }, [D.el('span', { class: 'code', text: item.project.code }), D.el('span', { text: 'wróci ' + E.Format.date(item.until) })])
          ]),
          D.el('span'), D.el('span'),
          D.el('div', { class: 'ibx__actions' }, [UI.button({ label: 'Przywróć', variant: 'ghost', size: 'sm', onClick: function () { actions.unsnoozeInbox(item.key); } })])
        ]);
      }))
    ]);
  }

  root.ETROM.InboxScreen = { split: split, section: section, alarmStrip: alarmStrip, snoozedBlock: snoozedBlock };
})(typeof globalThis !== 'undefined' ? globalThis : this);
