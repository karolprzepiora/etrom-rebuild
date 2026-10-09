/* ETROM — ekran „Zlecenia” (wewnętrzne): karty „Do mnie”, „Wysłane przeze mnie”, „Zrobione”,
   formularz nowego zlecenia i zamykanie ze zwrotem (plik, link albo samo potwierdzenie).
   Reguły i dane: core/orders.js. Pliki to tylko nazwa (+ mały plik jako data URL) albo link — aplikacja nie ma serwera plików. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var UI = E.UI;
  var Team = E.Team;
  var O = E.Orders;

  var GLYPH = { sign: 'edit', send: 'upload', pay: '$', other: 'checklist' };
  var TONE_LABEL = { n: '', warn: 'warn', late: 'alarm', ok: 'ok' };

  function glyph(kind) {
    var g = GLYPH[kind];
    return g === '$' ? D.el('b', { class: 'zl-dollar', text: '$', attrs: { 'aria-hidden': 'true' } }) : E.Icons.icon(g);
  }

  function kindCap(kind) {
    return D.el('span', { class: 'zl-kind zl-kind--' + kind }, [glyph(kind), D.el('span', { text: O.KINDS[kind] })]);
  }

  function personOf(people, id) { return Team.findPerson(people, id); }
  function nameOf(people, id) { var p = personOf(people, id); return p ? Team.fullName(p) : 'ktoś'; }
  function projectOf(projects, id) { return id == null ? null : (projects || []).filter(function (p) { return String(p.id) === String(id); })[0] || null; }

  function copy(text) {
    try { if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(text); } catch (e) { /* bez schowka też działa */ }
    E.Toast.show({ message: 'Skopiowano', tone: 'success', timeout: 1800 });
  }

  /** Plik lub link jako klikalny znacznik. */
  function refChip(ref, label) {
    if (!ref) return null;
    var icon = E.Icons.icon(ref.type === 'link' ? 'external' : 'download');
    var text = D.el('span', { class: 'zl-ref__name', text: ref.name });
    var node;
    if (ref.type === 'link') node = D.el('a', { class: 'zl-ref', attrs: { href: ref.url, target: '_blank', rel: 'noopener noreferrer' } }, [icon, text]);
    else if (ref.data) node = D.el('a', { class: 'zl-ref', attrs: { href: ref.data, download: ref.name } }, [icon, text]);
    else node = D.el('span', { class: 'zl-ref zl-ref--plain', attrs: { title: 'Plik leży poza aplikacją — nazwa służy tylko do rozpoznania' } }, [E.Icons.icon('list'), text]);
    return D.el('div', { class: 'zl-refrow' }, [label ? D.el('span', { class: 't-meta', text: label }) : null, node]);
  }

  function payCard(pay) {
    if (!pay) return null;
    function row(label, value, copyIt) {
      if (!value) return null;
      return D.el('div', { class: 'zl-pay__row' }, [
        D.el('span', { class: 'zl-pay__k', text: label }), D.el('b', { class: 'zl-pay__v', text: value }),
        copyIt ? UI.button({ label: 'kopiuj', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'zl-copy' }, onClick: function () { copy(value); } }) : null
      ]);
    }
    return D.el('div', { class: 'zl-pay', attrs: { 'data-fk': 'zl-pay' } }, [row('Odbiorca', pay.payee, true), row('Konto', pay.account, true), row('Tytuł', pay.title, true), row('Kwota', pay.amount, true)]);
  }

  function timerCap(o, now) {
    var tone = O.tone(o, now);
    var text = o.status === 'done' ? 'zamknięte po ' + O.ageText(O.elapsedMs(o, now)) : (o.status === 'cancelled' ? 'anulowane' : (o.status === 'waiting' ? 'czeka na poprzedni krok' : '⏱ ' + O.ageText(O.elapsedMs(o, now))));
    return D.el('span', { class: 'zl-timer zl-timer--' + (o.status === 'open' ? tone : (o.status === 'done' ? 'ok' : 'n')), attrs: { 'data-fk': 'zl-timer', title: o.status === 'open' ? 'Czas od chwili, gdy zlecenie trafiło do wykonawcy' : '' }, text: text });
  }

  function readFile(file, done) {
    var ref = { type: 'file', name: file.name, size: file.size };
    if (file.size > O.LIMITS.file * 0.7) { done(ref); return; }
    try {
      var r = new root.FileReader();
      r.onload = function () { if (typeof r.result === 'string') ref.data = r.result; done(ref); };
      r.onerror = function () { done(ref); };
      r.readAsDataURL(file);
    } catch (e) { done(ref); }
  }

  /** Pole „plik albo link”: zwraca { node, get() }. */
  function sourcePicker(id, initial, labels) {
    var current = initial || null;
    var mode = current && current.type === 'link' ? 'link' : 'file';
    var status = D.el('span', { class: 't-meta zl-src__status', text: current && current.type === 'file' ? current.name : '' });
    var fileIn = D.el('input', { class: 'zl-src__file', attrs: { type: 'file', id: id + '-file', 'data-fk': id + '-file' } });
    var linkIn = UI.input({ id: id + '-link', value: current && current.type === 'link' ? current.url : '', placeholder: labels.link || 'Wklej link do pliku na serwerze', maxlength: 500 });
    var fileBox = D.el('div', { class: 'zl-src__box' }, [D.el('label', { class: 'btn btn--secondary btn--sm', attrs: { for: id + '-file' } }, [E.Icons.icon('upload'), D.el('span', { text: labels.file || 'Załącz plik' })]), status]);
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      status.textContent = f.name;
      readFile(f, function (ref) { current = ref; });
    });
    var seg = UI.segmented({ label: 'Źródło', value: mode, items: [{ value: 'file', label: 'Plik' }, { value: 'link', label: 'Link' }], onChange: function (v) { mode = v; sync(); seg.set(v); } });
    function sync() { fileBox.hidden = mode !== 'file'; linkIn.parentNode && (linkIn.hidden = mode !== 'link'); linkIn.style.display = mode === 'link' ? '' : 'none'; }
    var node = D.el('div', { class: 'zl-src', attrs: { 'data-fk': id } }, [seg.node, fileIn, fileBox, linkIn]);
    fileIn.style.display = 'none';
    sync();
    return {
      node: node,
      get: function () {
        if (mode === 'link') return linkIn.value.trim() ? { type: 'link', url: linkIn.value.trim() } : null;
        return current && current.type === 'file' ? current : null;
      }
    };
  }

  /* ---------- Karta zlecenia ---------- */
  function orderCard(o, c) {
    var now = c.now;
    var people = c.people;
    var proj = projectOf(c.projects, o.projectId);
    var chain = O.chainOf(c.orders, o);
    var after = chain.filter(function (x) { return x.step > o.step && x.status !== 'cancelled'; })[0];
    var mineToClose = O.canClose(c.me, o, people);
    var manage = O.canManage(c.me, o, people);
    var panel = c.panel && c.panel.id === o.id ? c.panel.mode : null;
    var who = c.tab === 'sent' ? 'do ' + nameOf(people, o.assigneeId) : 'od ' + nameOf(people, o.createdBy);
    var step = chain.length > 1 ? ' · krok ' + o.step + ' z ' + chain.length : '';

    var head = D.el('div', { class: 'zl-card__head' }, [
      kindCap(o.kind), proj ? D.el('span', { class: 'zl-proj', text: proj.code }) : null, D.el('span', { class: 'zl-spacer' }),
      o.nudgedAt && o.status === 'open' ? D.el('span', { class: 'zl-nudge', text: 'przypomniano', attrs: { title: E.Format.ago(o.nudgedAt, now) } }) : null,
      timerCap(o, now)
    ]);
    var body = [
      D.el('p', { class: 'zl-card__text', text: o.text }),
      refChip(o.doc, 'Dokument'),
      o.kind === 'send' && o.dest ? D.el('div', { class: 'zl-dest' }, [E.Icons.icon('pin'), D.el('span', { text: 'Dokąd: ' }), D.el('b', { text: o.dest })]) : null,
      payCard(o.pay),
      D.el('div', { class: 't-meta zl-card__meta', text: who + ' · ' + E.Format.ago(o.createdAt, now) + step }),
      after ? D.el('div', { class: 'zl-next' }, [D.el('span', { text: 'Potem: ' }), kindCap(after.kind), D.el('span', { text: ' → ' + nameOf(people, after.assigneeId) })]) : null,
      o.status === 'done' ? D.el('div', { class: 'zl-result' }, [
        D.el('span', { class: 't-meta', text: (O.DONE_LABEL[o.kind] || 'Zrobione') + ' · ' + nameOf(people, o.doneBy) + ' · ' + E.Format.ago(o.doneAt, now) }),
        refChip(o.result, 'Zwrot'), o.resultNote ? D.el('span', { class: 't-meta', text: '„' + o.resultNote + '”' }) : null
      ]) : null
    ];

    var actions = [];
    if (o.status === 'open' && mineToClose) {
      actions.push(UI.button({ label: '✔ ' + O.DONE_LABEL[o.kind], variant: 'primary', size: 'sm', attrs: { 'data-fk': 'zl-done' }, onClick: function () { c.actions.setOrderPanel(panel === 'close' ? null : { id: o.id, mode: 'close' }); } }));
      actions.push(UI.button({ label: 'Przekaż dalej', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'zl-pass' }, onClick: function () { c.actions.setOrderPanel(panel === 'pass' ? null : { id: o.id, mode: 'pass' }); } }));
    }
    if (o.status === 'open' && manage && o.assigneeId !== c.me) {
      actions.push(UI.button({ label: 'Przypomnij', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'zl-nudge' }, onClick: function () { c.actions.nudgeOrder(o.id); } }));
    }
    if ((o.status === 'open' || o.status === 'waiting') && manage) {
      actions.push(UI.button({ label: 'Anuluj', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'zl-cancel' }, onClick: function () { c.actions.cancelOrder(o.id); } }));
    }

    var extra = null;
    if (panel === 'close') extra = closePanel(o, c);
    if (panel === 'pass') extra = passPanel(o, c);

    return D.el('article', { class: 'zl-card zl-card--' + o.status + (o.status === 'open' ? ' zl-card--' + O.tone(o, now) : ''), dataset: { orderId: o.id, kind: o.kind }, attrs: { 'data-fk': 'zl-card' } },
      [head].concat(body, [actions.length ? D.el('div', { class: 'zl-actions' }, actions) : null, extra]));
  }

  function closePanel(o, c) {
    var picker = sourcePicker('zl-ret', null, { file: 'Załącz zwrotnie plik', link: 'Wklej link do wyniku' });
    var note = UI.input({ id: 'zl-ret-note', placeholder: 'Uwaga (opcjonalnie)', maxlength: 200 });
    return D.el('div', { class: 'zl-panel', attrs: { 'data-fk': 'zl-close-panel' } }, [
      D.el('p', { class: 't-meta', text: 'Zwrot jest opcjonalny: możesz dodać plik albo link, albo tylko potwierdzić.' }),
      picker.node, note,
      D.el('div', { class: 'zl-actions' }, [
        UI.button({ label: 'Potwierdź: ' + O.DONE_LABEL[o.kind].toLowerCase(), variant: 'primary', size: 'sm', attrs: { 'data-fk': 'zl-confirm' }, onClick: function () { c.actions.completeOrder(o.id, picker.get(), note.value); } }),
        UI.button({ label: 'Anuluj', variant: 'ghost', size: 'sm', onClick: function () { c.actions.setOrderPanel(null); } })
      ])
    ]);
  }

  function passPanel(o, c) {
    var sel = UI.select({ id: 'zl-pass-to', value: '', options: [{ value: '', label: 'Wybierz osobę' }].concat(c.people.filter(function (p) { return p.active !== false && p.id !== o.assigneeId; }).map(function (p) { return { value: p.id, label: Team.fullName(p) }; })) });
    return D.el('div', { class: 'zl-panel', attrs: { 'data-fk': 'zl-pass-panel' } }, [
      D.el('p', { class: 't-meta', text: 'Zlecenie trafi do wybranej osoby, a licznik zacznie od początku jej listy.' }), sel,
      D.el('div', { class: 'zl-actions' }, [
        UI.button({ label: 'Przekaż', variant: 'primary', size: 'sm', attrs: { 'data-fk': 'zl-pass-ok' }, onClick: function () { if (sel.value) c.actions.passOrder(o.id, sel.value); } }),
        UI.button({ label: 'Anuluj', variant: 'ghost', size: 'sm', onClick: function () { c.actions.setOrderPanel(null); } })
      ])
    ]);
  }

  /* ---------- Ekran ---------- */
  function visible(state, tab) {
    var me = state.prefs.me;
    var orders = state.workspace.orders || [];
    var now = new Date();
    if (tab === 'mine') return O.oldestFirst(O.forAssignee(orders, me), now);
    if (tab === 'sent') return orders.filter(function (o) { return o.createdBy === me && (o.status === 'open' || o.status === 'waiting'); }).sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; });
    return orders.filter(function (o) { return (o.status === 'done') && (o.createdBy === me || o.assigneeId === me); }).sort(function (a, b) { return b.doneAt < a.doneAt ? -1 : 1; }).slice(0, 40);
  }

  function view(state, ctx) {
    var now = new Date();
    var me = state.prefs.me;
    var people = state.workspace.people || [];
    var projects = state.workspace.projects || [];
    var orders = state.workspace.orders || [];
    var tab = (state.ordersView && state.ordersView.tab) || 'mine';
    var counts = { mine: O.openCount(orders, me), sent: visible(state, 'sent').length, done: visible(state, 'done').length };
    var c = { now: now, me: me, people: people, projects: projects, orders: orders, tab: tab, panel: state.orderPanel, actions: ctx.actions };

    var tabs = UI.segmented({
      label: 'Zlecenia', value: tab,
      items: [{ value: 'mine', label: 'Do mnie · ' + counts.mine }, { value: 'sent', label: 'Wysłane przeze mnie · ' + counts.sent }, { value: 'done', label: 'Zrobione' }],
      onChange: function (v) { ctx.actions.setOrders({ tab: v }); }
    });
    var list = visible(state, tab);
    var empty = { mine: 'Nic na Ciebie nie czeka.', sent: 'Nie masz żadnych otwartych zleceń wysłanych innym.', done: 'Zamknięte zlecenia pojawią się tutaj.' }[tab];
    var body = D.el('div', { class: 'zl', attrs: { 'data-fk': 'zl-screen' } }, [
      D.el('div', { class: 'zl-bar' }, [tabs.node, D.el('span', { class: 'zl-spacer' }),
        UI.button({ label: 'Nowe zlecenie', icon: 'plus', variant: 'primary', attrs: { 'data-fk': 'zl-new' }, onClick: function () { ctx.actions.openOrder(); } })]),
      list.length ? D.el('div', { class: 'zl-list' }, list.map(function (o) { return orderCard(o, c); })) : D.el('p', { class: 'zl-empty t-meta', text: empty })
    ]);
    var summary = counts.mine ? 'Do zrobienia: ' + counts.mine + '. Najstarsze są na górze.' : 'Poproś kogoś o podpis, wysyłkę lub opłatę — bez maili i karteczek.';
    return { summary: summary, body: body };
  }

  /* ---------- Formularz ---------- */
  function stepFields(prefix, s, o) {
    var kindSel = UI.select({ id: prefix + '-kind', value: s.kind, options: Object.keys(O.KINDS).map(function (k) { return { value: k, label: O.KINDS[k] }; }) });
    var text = UI.input({ id: prefix + '-text', value: s.text || '', maxlength: 300, placeholder: 'Co trzeba zrobić?', error: o.errors[prefix + '.text'] });
    var who = UI.select({ id: prefix + '-who', value: s.assigneeId || '', options: [{ value: '', label: 'Wybierz osobę' }].concat(o.people.map(function (p) { return { value: p.id, label: Team.fullName(p) }; })) });
    var dest = UI.input({ id: prefix + '-dest', value: s.dest || '', maxlength: 160, placeholder: 'np. e-Doręczenia, RZGW Kraków', error: null });
    var dl = o.dests.length ? D.el('div', { class: 'zl-sugg' }, o.dests.map(function (d) { return D.el('button', { class: 'zl-chip', attrs: { type: 'button' }, text: d, on: { click: function () { dest.value = d; } } }); })) : null;
    return { kindSel: kindSel, text: text, who: who, dest: dest, dl: dl };
  }

  function orderForm(draft, errors, handlers, opts) {
    var v = draft || {};
    var problems = errors || {};
    var people = opts.people;
    var kind = v.kind || 'sign';
    var f = stepFields('zf', { kind: kind, text: v.text, assigneeId: v.assigneeId, dest: v.dest }, { errors: problems, people: people, dests: opts.dests });
    var project = UI.select({ id: 'zf-project', value: v.projectId == null ? '' : String(v.projectId), options: [{ value: '', label: 'Bez projektu' }].concat(opts.projects.map(function (p) { return { value: String(p.id), label: p.code + ' · ' + p.name }; })) });
    var src = sourcePicker('zf-src', v.doc, { file: 'Załącz plik', link: 'Wklej link do pliku na serwerze' });
    var pay = v.pay || {};
    var payInputs = {
      payee: UI.input({ id: 'zf-payee', value: pay.payee || '', maxlength: 120, placeholder: 'Odbiorca' }),
      account: UI.input({ id: 'zf-account', value: pay.account || '', maxlength: 40, placeholder: 'Numer konta' }),
      title: UI.input({ id: 'zf-ptitle', value: pay.title || '', maxlength: 140, placeholder: 'Tytuł przelewu' }),
      amount: UI.input({ id: 'zf-amount', value: pay.amount || '', maxlength: 20, placeholder: 'Kwota, np. 17,00 zł' })
    };
    var nextStep = v.next || null;
    var nf = nextStep ? stepFields('zn', nextStep, { errors: problems, people: people, dests: opts.dests }) : null;

    function collect() {
      var out = {
        kind: f.kindSel.value || kind, text: f.text.value, assigneeId: f.who.value, projectId: project.value || null, doc: src.get(), dest: f.dest.value,
        pay: { payee: payInputs.payee.value, account: payInputs.account.value, title: payInputs.title.value, amount: payInputs.amount.value },
        next: nf ? { kind: nf.kindSel.value, text: nf.text.value, assigneeId: nf.who.value, dest: nf.dest.value } : null
      };
      return out;
    }

    var chips = D.el('div', { class: 'zl-kinds', attrs: { role: 'group', 'aria-label': 'Rodzaj zlecenia', 'data-fk': 'zf-kinds' } }, Object.keys(O.KINDS).map(function (k) {
      return D.el('button', { class: 'zl-kindchip zl-kindchip--' + k, attrs: { type: 'button', 'aria-pressed': String(k === kind), 'data-kind': k }, on: { click: function () { handlers.onChange(Object.assign(collect(), { kind: k })); } } }, [glyph(k), D.el('span', { text: O.KINDS[k] })]);
    }));

    var hint = opts.suggested && !v.assigneeId ? null : null;
    var suggestNote = opts.suggestedName ? D.el('p', { class: 't-meta', attrs: { 'data-fk': 'zf-suggest' }, text: 'Podpowiedź: zwykle zlecasz to osobie ' + opts.suggestedName + '.' }) : null;

    var form = E.Dialog.drawerForm({
      id: 'order-form',
      submitLabel: nextStep ? 'Wyślij zlecenia' : 'Wyślij zlecenie',
      onCancel: handlers.onCancel,
      onSubmit: function () { handlers.onSubmit(collect()); },
      body: [
        chips,
        UI.field({ id: 'zf-text', label: kind === 'other' ? 'Co trzeba zrobić' : 'Opis', control: f.text, error: problems.text }),
        kind === 'pay' ? D.el('div', { class: 'zl-paygrid', attrs: { 'data-fk': 'zf-pay' } }, [payInputs.payee, payInputs.account, payInputs.title, payInputs.amount]) : null,
        UI.field({ id: 'zf-src', label: kind === 'pay' ? 'Dokument (opcjonalnie)' : 'Dokument', optional: true, control: src.node }),
        kind === 'send' ? UI.field({ id: 'zf-dest', label: 'Dokąd wysłać', control: D.el('div', null, [f.dest, f.dl]) }) : null,
        UI.field({ id: 'zf-who', label: 'Kto ma to zrobić', control: D.el('div', null, [f.who, suggestNote]), error: problems.assigneeId }),
        UI.field({ id: 'zf-project', label: 'Projekt', optional: true, control: project }),
        nextStep ? D.el('div', { class: 'zl-nextbox', attrs: { 'data-fk': 'zf-next' } }, [
          D.el('div', { class: 'zl-nextbox__head' }, [D.el('b', { text: 'Potem' }), UI.button({ label: 'Usuń krok', variant: 'ghost', size: 'sm', onClick: function () { handlers.onChange(Object.assign(collect(), { next: null })); } })]),
          UI.field({ id: 'zn-kind', label: 'Rodzaj', control: nf.kindSel }),
          UI.field({ id: 'zn-text', label: 'Opis', control: nf.text, error: problems['step2.text'] }),
          nf.kindSel.value === 'send' ? UI.field({ id: 'zn-dest', label: 'Dokąd wysłać', control: D.el('div', null, [nf.dest, nf.dl]) }) : null,
          UI.field({ id: 'zn-who', label: 'Kto', control: nf.who, error: problems['step2.assigneeId'] }),
          D.el('p', { class: 't-meta', text: 'Ruszy dopiero, gdy pierwszy krok zostanie zamknięty. Dostanie jego plik zwrotny.' })
        ]) : UI.button({ label: '+ potem: kolejny krok', variant: 'ghost', size: 'sm', attrs: { 'data-fk': 'zf-add-next' }, onClick: function () { handlers.onChange(Object.assign(collect(), { next: { kind: kind === 'sign' ? 'send' : 'other', text: '', assigneeId: '', dest: '' } })); } })
      ]
    });
    if (nf) nf.kindSel.addEventListener('change', function () { handlers.onChange(Object.assign(collect())); });
    window.setTimeout(function () { f.text.focus(); }, 0);
    return form;
  }

  E.OrdersScreen = { view: view, orderForm: orderForm, visible: visible };
})(typeof globalThis !== 'undefined' ? globalThis : this);
