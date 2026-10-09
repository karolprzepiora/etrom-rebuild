/* ETROM — decyzje o pismie przychodzącym (Skrzynka): wymaga odpowiedzi, dołączenie do sprawy, przekazanie.
   Każda decyzja to krótki formularz w panelu; „Do akt” i „Odpowiedź niepotrzebna” nie potrzebują formularza. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Mail = E.Mail;

  function addDays(key, n) { return Mail.addDaysKey(key, n); }

  /** Rząd chipów, które wpisują datę do pola (bez przerysowywania formularza). */
  function chips(input, items) {
    return D.el('div', { class: 'mflow__chips' }, items.map(function (item) {
      return UI.button({
        label: item.label, variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'mflow-chip-' + item.key },
        onClick: function () { input.value = item.value(); }
      });
    }));
  }

  /**
   * @param {{kind:'reply'|'case'|'reassign', entry:Object, draft:Object, errors:Object, cases:Array, people:Array}} spec
   * @param {{onSubmit:Function, onCancel:Function}} handlers
   */
  function stepForm(spec, handlers) {
    var d = spec.draft || {};
    var er = spec.errors || {};
    var today = Mail.todayKey(new Date());
    var body;
    var read;

    if (spec.kind === 'reply') {
      var due = UI.input({ id: 'mf-due', type: 'date', value: d.responseDue || '', error: er.responseDue });
      var taskDue = UI.input({ id: 'mf-task', type: 'date', value: d.taskDeadline || '' });
      var from = function () { return due.value || today; };
      body = [
        UI.field({
          id: 'mf-due', label: 'Termin odpowiedzi', optional: true, control: due, error: er.responseDue,
          hint: 'Termin dla organu, z pisma. Ustawowych terminów program nie liczy.'
        }),
        chips(due, [
          { key: 'due7', label: '+7 dni', value: function () { return addDays(today, 7); } },
          { key: 'due14', label: '+14 dni', value: function () { return addDays(today, 14); } },
          { key: 'due30', label: '+30 dni', value: function () { return addDays(today, 30); } },
          { key: 'dueno', label: 'Brak', value: function () { return ''; } }
        ]),
        UI.field({
          id: 'mf-task', label: 'Termin zadania', optional: true, control: taskDue,
          hint: 'Wewnętrzny, zwykle krótszy niż termin odpowiedzi.'
        }),
        chips(taskDue, [
          { key: 'task1', label: '−1 dzień', value: function () { return addDays(from(), -1); } },
          { key: 'task3', label: '−3 dni', value: function () { return addDays(from(), -3); } },
          { key: 'task7', label: '−7 dni', value: function () { return addDays(from(), -7); } },
          { key: 'tasksame', label: 'Taki sam', value: function () { return from(); } }
        ]),
        D.el('p', { class: 'form__note', text: 'Po zapisaniu otworzy się zadanie „Odpowiedź na pismo”: wybierzesz wykonawcę i etap.' })
      ];
      read = function () { return { responseDue: due.value, taskDeadline: taskDue.value }; };
    } else if (spec.kind === 'case') {
      var pick = UI.select({
        id: 'mf-case', value: d.caseId || '',
        options: [{ value: '', label: '— wybierz sprawę —' }].concat((spec.cases || []).map(function (c) {
          return { value: c.id, label: c.name + (c.org ? ' · ' + c.org : '') };
        }))
      });
      body = [
        UI.field({ id: 'mf-case', label: 'Sprawa w toku', required: true, control: pick, error: er.caseId, hint: spec.suggested ? 'Podpowiedź: ta sama strona co nadawca pisma. Potwierdź albo zmień.' : 'Pismo trafi do historii sprawy i nie wróci do Skrzynki.' })
      ];
      read = function () { return { caseId: pick.value }; };
    } else {
      var who = UI.select({ id: 'mf-owner', value: d.ownerId || '', options: spec.people || [] });
      body = [UI.field({ id: 'mf-owner', label: 'Kto zajmie się pismem', required: true, control: who, hint: 'Pismo pojawi się w Skrzynce tej osoby.' })];
      read = function () { return { ownerId: who.value }; };
    }

    var labels = { reply: 'Zapisz i utwórz zadanie', case: 'Dołącz do sprawy', reassign: 'Przekaż' };
    return E.Dialog.drawerForm({
      id: 'mail-step',
      submitLabel: labels[spec.kind],
      onCancel: handlers.onCancel,
      onSubmit: function () { handlers.onSubmit(read()); },
      body: [
        D.el('div', { class: 'mflow__who' }, [
          D.el('strong', { text: spec.entry.regNo + ' · ' + spec.entry.subject }),
          D.el('span', { text: spec.entry.counterparty })
        ])
      ].concat(body)
    });
  }

  /** Lista plików jednego pisma: pierwszy to pismo główne, reszta to załączniki. */
  function fileList(files, onRemove) {
    if (!files || !files.length) return null;
    return D.el('ul', { class: 'mflow__files' }, files.map(function (f, i) {
      return D.el('li', { class: 'mflow__file', attrs: { 'data-file': f.name } }, [
        E.Icons.icon('kindDocs', 14),
        D.el('span', { class: 'truncate', text: f.name }),
        D.el('span', { class: 'mflow__size t-num', text: size(f.size) }),
        UI.badge(i === 0 ? 'pismo główne' : 'załącznik', i === 0 ? 'accent' : 'neutral'),
        onRemove ? UI.iconButton({ icon: 'close', label: 'Usuń plik ' + f.name, size: 'sm', onClick: function () { onRemove(i); } }) : null
      ]);
    }));
  }

  function size(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (Math.round(bytes / 104857.6) / 10) + ' MB';
  }


  function field(label, value) {
    return D.el('div', { class: 'mcard__f' }, [D.el('span', { class: 'mcard__k', text: label }), D.el('span', { class: 'mcard__v', text: value || '—' })]);
  }

  /**
   * Karta pisma: stan, pliki, daty, właściciel, powiązania i historia decyzji w jednym miejscu.
   * @param {{entry:Object, project:Object, flow:Object, ownerName:string, tasks:Array, caseItem:Object, replies:Array, history:Array}} spec
   * history: [{at, who, text}] ze zdekodowanymi nazwiskami
   */
  function card(spec, h) {
    var e = spec.entry;
    var F = E.Format;
    var incoming = e.direction === 'in';
    var links = [];
    (spec.tasks || []).forEach(function (row) {
      links.push(D.el('button', { class: 'mrow2__task', attrs: { type: 'button', 'data-fk': 'mcard-task-' + row.task.id }, on: { click: function () { h.onTask(row); } } }, [
        E.Icons.icon('checklist', 13), D.el('span', { class: 'truncate', text: 'Zadanie: ' + row.task.name }),
        D.el('span', { class: 'mrow2__task-meta t-num', text: E.Tasks.TASK_STATUS[row.task.status] + ' · ' + F.hours(row.hours) })
      ]));
    });
    if (spec.caseItem) links.push(D.el('span', { class: 'mcard__link', attrs: { 'data-fk': 'mcard-case' }, text: 'Sprawa: ' + spec.caseItem.name + (spec.caseItem.org ? ' · ' + spec.caseItem.org : '') }));
    (spec.replies || []).forEach(function (r) {
      links.push(D.el('span', { class: 'mcard__link', attrs: { 'data-fk': 'mcard-reply-' + r.id }, text: 'Odpowiedź: ' + r.regNo + ' · ' + F.date(r.registeredDate, { year: 'always' }) }));
    });
    var buttons = [];
    if (incoming) {
      var b = function (label, fk, fn, variant) { return UI.button({ label: label, variant: variant || 'ghost', size: 'sm', attrs: { 'data-fk': 'mcard-' + fk }, onClick: fn }); };
      if (spec.flow.state !== 'answered') {
        buttons.push(b('Do akt', 'file', function () { h.onDecide('file'); }, 'secondary'));
        buttons.push(b('Wymaga odpowiedzi', 'reply', function () { h.onDecide('reply'); }, 'secondary'));
        buttons.push(b('Dołącz do sprawy', 'case', function () { h.onDecide('case'); }));
        buttons.push(b('Odpowiedź niepotrzebna', 'none', function () { h.onDecide('none'); }));
      }
      buttons.push(b('Przekaż', 'pass', function () { h.onDecide('reassign'); }));
      buttons.push(b('Napisz odpowiedź', 'answer', function () { h.onAnswer(); }));
    }
    buttons.push(UI.button({ label: 'Edytuj wpis', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'mcard-edit' }, onClick: h.onEdit }));
    return D.el('div', { class: 'mcard', attrs: { 'data-mcard': e.id } }, [
      D.el('div', { class: 'mcard__head' }, [
        UI.badge(spec.flow.label, spec.flow.tone),
        UI.badge(Mail.KINDS[e.kind], 'neutral'),
        D.el('strong', { class: 'mcard__subject', text: e.subject })
      ]),
      D.el('div', { class: 'mcard__grid' }, [
        field(incoming ? 'Nadawca' : 'Adresat', e.counterparty),
        field('Numer w dzienniku', e.regNo),
        field(incoming ? 'Data wpływu' : 'Data wysłania', F.date(e.registeredDate, { year: 'always' })),
        field('Data pisma', e.letterDate ? F.date(e.letterDate, { year: 'always' }) : ''),
        field('Znak pisma', e.number),
        incoming ? field('Znak sprawy organu', e.caseRef) : null,
        incoming ? field('Zajmuje się', spec.ownerName) : null,
        incoming ? field('Termin odpowiedzi', e.responseDue ? F.date(e.responseDue, { year: 'always' }) + (spec.flow.days !== null ? ' · ' + (spec.flow.days < 0 ? 'po terminie o ' + (-spec.flow.days) + ' dni' : spec.flow.days === 0 ? 'dziś' : 'za ' + spec.flow.days + ' dni') : '') : '') : null
      ].filter(Boolean)),
      e.summary ? D.el('p', { class: 'mcard__summary', text: e.summary }) : null,
      D.el('h3', { class: 'mcard__h', text: 'Pliki' }),
      (e.files || []).length ? fileList(e.files, null) : D.el('p', { class: 't-meta', text: 'Bez plików.' + (e.where ? ' Oryginał: ' + e.where + '.' : '') }),
      D.el('h3', { class: 'mcard__h', text: 'Powiązania' }),
      links.length ? D.el('div', { class: 'mcard__links' }, links) : D.el('p', { class: 't-meta', text: 'Brak zadania, sprawy i odpowiedzi.' }),
      D.el('h3', { class: 'mcard__h', text: 'Historia' }),
      (spec.history || []).length
        ? D.el('ol', { class: 'mcard__hist' }, spec.history.map(function (x) {
          return D.el('li', {}, [D.el('span', { class: 't-num mcard__when', text: x.at ? F.date(x.at, { year: 'always' }) : '' }), D.el('span', { text: x.text + (x.who ? ' · ' + x.who : '') })]);
        }))
        : D.el('p', { class: 't-meta', text: 'Brak zapisanej historii.' }),
      D.el('div', { class: 'mcard__actions' }, buttons)
    ]);
  }

  E.MailFlow = { card: card, stepForm: stepForm, fileList: fileList, size: size };
})(window);
