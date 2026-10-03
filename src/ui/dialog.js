/* ETROM — okna: potwierdzenie, pytanie z polem i panel boczny (drawer).
   Natywny <dialog>: uwięzienie fokusa, tło i Escape działają bez własnej
   obsługi. Panel boczny służy formularzom — kontekst strony zostaje widoczny. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Icons = E.Icons;

  var openDrawerEl = null;
  var openCount = 0;
  var savedOverflow = '';

  function lockScroll() {
    if (openCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openCount += 1;
  }

  function unlockScroll() {
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.style.overflow = savedOverflow;
  }

  function mount(dialog) {
    var returnFocus = document.activeElement;
    document.body.appendChild(dialog);
    lockScroll();
    dialog.addEventListener('close', function () {
      unlockScroll();
      // Fokus wraca tam, skąd przyszedł — o ile ten element jeszcze istnieje.
      if (returnFocus && document.contains(returnFocus) && typeof returnFocus.focus === 'function') {
        returnFocus.focus({ preventScroll: true });
      }
    });
    dialog.showModal();
  }

  function button(label, variant, attrs, onClick) {
    return E.UI.button({ label: label, variant: variant, attrs: attrs, onClick: onClick });
  }

  /**
   * Pytanie o potwierdzenie czynności nieodwracalnej.
   * @param {{title: string, message: string, confirm?: string, cancel?: string, tone?: 'danger'}} options
   * @returns {Promise<boolean>}
   */
  function confirm(options) {
    var settings = options || {};
    return new Promise(function (resolve) {
      var dialog = D.el('dialog', {
        class: 'dialog',
        attrs: { 'aria-labelledby': 'dialog-title', 'aria-describedby': 'dialog-text' }
      });

      var cancelBtn = button(settings.cancel || 'Anuluj', 'secondary', { 'data-dialog-cancel': '' },
        function () { dialog.close('cancel'); });
      var confirmBtn = button(settings.confirm || 'Potwierdź', settings.tone === 'danger' ? 'danger-solid' : 'primary',
        { 'data-dialog-confirm': '' }, function () { dialog.close('ok'); });

      D.append(dialog, [
        D.el('div', { class: 'dialog__card' }, [
          D.el('div', { class: 'dialog__head' }, [
            D.el('h2', { class: 'dialog__title', text: settings.title || 'Potwierdź', attrs: { id: 'dialog-title' } }),
            D.el('p', { class: 'dialog__text', text: settings.message || '', attrs: { id: 'dialog-text' } })
          ]),
          D.el('div', { class: 'dialog__actions' }, [cancelBtn, confirmBtn])
        ])
      ]);

      dialog.addEventListener('close', function () {
        var accepted = dialog.returnValue === 'ok';
        dialog.remove();
        resolve(accepted);
      });

      mount(dialog);
      // Domyślnie podświetlone jest wyjście, nie akcja nieodwracalna.
      cancelBtn.focus();
    });
  }


  /**
   * Pytanie z kilkoma wyborami. Zwraca `value` wybranego przycisku albo null (Esc).
   * @param {{title: string, message?: string, options: Array<{value: string, label: string, variant?: string}>}} options
   * @returns {Promise<string|null>}
   */
  function choose(options) {
    var settings = options || {};
    return new Promise(function (resolve) {
      var dialog = D.el('dialog', { class: 'dialog', attrs: { 'aria-labelledby': 'dialog-title', 'aria-describedby': 'dialog-text' } });
      var buttons = (settings.options || []).map(function (opt, index) {
        var b = button(opt.label, opt.variant || (index === 0 ? 'primary' : 'secondary'), { 'data-choice': opt.value }, function () { dialog.close(opt.value); });
        return b;
      });
      D.append(dialog, [
        D.el('div', { class: 'dialog__card' }, [
          D.el('div', { class: 'dialog__head' }, [
            D.el('h2', { class: 'dialog__title', text: settings.title || 'Wybierz', attrs: { id: 'dialog-title' } }),
            D.el('p', { class: 'dialog__text', text: settings.message || '', attrs: { id: 'dialog-text' } })
          ]),
          D.el('div', { class: 'dialog__actions dialog__actions--stack' }, buttons)
        ])
      ]);
      dialog.addEventListener('close', function () {
        var value = dialog.returnValue && dialog.returnValue !== 'cancel' ? dialog.returnValue : null;
        dialog.remove();
        resolve(value);
      });
      mount(dialog);
      if (buttons[0]) buttons[0].focus();
    });
  }

  /**
   * Pytanie z polem tekstowym. Zwraca tekst albo null przy anulowaniu.
   * @param {{title: string, message?: string, label: string, placeholder?: string,
   *          confirm?: string, required?: boolean}} options
   * @returns {Promise<string|null>}
   */
  function prompt(options) {
    var settings = options || {};
    return new Promise(function (resolve) {
      var dialog = D.el('dialog', { class: 'dialog', attrs: { 'aria-labelledby': 'dialog-title' } });
      var input = E.UI.textarea({
        id: 'dialog-input', rows: 3, placeholder: settings.placeholder || '',
        attrs: { 'data-dialog-input': '' }
      });
      var fieldWrap = D.el('div');

      function drawField(error) {
        D.render(fieldWrap, [E.UI.field({
          id: 'dialog-input', label: settings.label || 'Treść', control: input,
          required: settings.required !== false, error: error,
          hint: 'Ctrl + Enter zatwierdza.'
        })]);
      }
      drawField('');

      function accept() {
        var value = input.value.trim();
        if (settings.required !== false && !value) {
          drawField('Wpisz powód — trafi do osoby, która poprawia zadanie.');
          input.focus();
          return;
        }
        dialog.dataset.value = value;
        dialog.close('ok');
      }

      D.append(dialog, [D.el('div', { class: 'dialog__card' }, [
        D.el('div', { class: 'dialog__head' }, [
          D.el('h2', { class: 'dialog__title', text: settings.title || 'Podaj szczegóły', attrs: { id: 'dialog-title' } }),
          settings.message ? D.el('p', { class: 'dialog__text', text: settings.message }) : null
        ]),
        fieldWrap,
        D.el('div', { class: 'dialog__actions' }, [
          button('Anuluj', 'secondary', { 'data-dialog-cancel': '' }, function () { dialog.close('cancel'); }),
          button(settings.confirm || 'Zapisz', 'primary', { 'data-dialog-confirm': '' }, accept)
        ])
      ])]);

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          accept();
        }
      });

      dialog.addEventListener('close', function () {
        var accepted = dialog.returnValue === 'ok';
        var value = dialog.dataset.value || '';
        dialog.remove();
        resolve(accepted ? value : null);
      });

      mount(dialog);
      input.focus();
    });
  }

  /**
   * Układ formularza w panelu: przewijana treść i przyklejona stopka z akcjami.
   * Ctrl+Enter zapisuje z dowolnego pola.
   * @param {{id: string, body: Array, submitLabel: string, onSubmit: Function, onCancel: Function, collect?: Function}} o
   */
  function drawerForm(o) {
    var form = D.el('form', {
      class: 'drawer__form',
      attrs: { id: o.id, novalidate: true },
      on: {
        submit: function (event) {
          event.preventDefault();
          o.onSubmit();
        },
        keydown: function (event) {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            form.requestSubmit();
          }
        }
      }
    }, [
      D.el('div', { class: 'drawer__body' }, [D.el('div', { class: 'form' }, o.body)]),
      D.el('div', { class: 'drawer__foot' }, [
        D.el('span', { class: 'drawer__foot-hint' }, [E.UI.kbd('Ctrl'), E.UI.kbd('Enter'), D.el('span', { text: 'zapisuje' })]),
        E.UI.button({ label: 'Anuluj', variant: 'secondary', onClick: o.onCancel }),
        E.UI.button({ label: o.submitLabel, variant: 'primary', type: 'submit' })
      ])
    ]);
    return form;
  }

  /**
   * Panel wysuwany z prawej krawędzi.
   * @param {{title: string, subtitle?: string, content: Node, onClose?: Function}} options
   */
  function openDrawer(options) {
    var settings = options || {};
    closeDrawer();

    var dialog = D.el('dialog', {
      class: 'drawer',
      attrs: { 'aria-labelledby': 'drawer-title' }
    });

    D.append(dialog, [
      D.el('div', { class: 'drawer__panel' }, [
        D.el('div', { class: 'drawer__head' }, [
          D.el('div', { class: 'drawer__titles' }, [
            D.el('h2', { class: 'drawer__title', text: settings.title || '', attrs: { id: 'drawer-title' } }),
            D.el('p', { class: 'drawer__subtitle', text: settings.subtitle || '', attrs: { hidden: !settings.subtitle } })
          ]),
          E.UI.iconButton({
            icon: 'close', label: 'Zamknij panel', kbd: 'Esc',
            attrs: { 'data-drawer-close': '' },
            onClick: function () { dialog.close('cancel'); }
          })
        ]),
        D.el('div', { class: 'drawer__content' }, [settings.content])
      ])
    ]);

    dialog.addEventListener('close', function () {
      dialog.remove();
      if (openDrawerEl === dialog) openDrawerEl = null;
      if (typeof settings.onClose === 'function') settings.onClose();
    });

    // Kliknięcie w tło zamyka panel; kliknięcie w jego wnętrze nie.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close('cancel');
    });

    openDrawerEl = dialog;
    mount(dialog);
    return dialog;
  }

  /** Podmienia treść otwartego panelu bez animacji wejścia. */
  function updateDrawer(dialog, settings) {
    dialog.querySelector('.drawer__title').textContent = settings.title || '';
    var sub = dialog.querySelector('.drawer__subtitle');
    sub.textContent = settings.subtitle || '';
    sub.hidden = !settings.subtitle;
    D.render(dialog.querySelector('.drawer__content'), [settings.content]);
  }

  function closeDrawer() {
    if (openDrawerEl) openDrawerEl.close('cancel');
  }

  function isDrawerOpen() {
    return !!openDrawerEl;
  }

  function anyOpen() {
    return !!document.querySelector('dialog[open]');
  }

  root.ETROM.Dialog = {
    confirm: confirm,
    choose: choose,
    prompt: prompt,
    drawerForm: drawerForm,
    openDrawer: openDrawer,
    updateDrawer: updateDrawer,
    closeDrawer: closeDrawer,
    isDrawerOpen: isDrawerOpen,
    anyOpen: anyOpen
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
