/* ETROM — okna aplikacji: potwierdzenia i panel boczny.
   Oparte na natywnym <dialog>, więc uwięzienie fokusa, tło i zamykanie
   klawiszem Escape działają bez dopisywania własnej obsługi. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Icons = root.ETROM.Icons;

  var openDrawerEl = null;
  var openCount = 0;
  var savedOverflow = '';

  function lockScroll() {
    // Natywne okno modalne nie blokuje przewijania strony pod spodem.
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
    document.body.appendChild(dialog);
    lockScroll();
    dialog.addEventListener('close', unlockScroll);
    dialog.showModal();
  }

  /**
   * Pytanie o potwierdzenie.
   * @param {{title: string, message: string, confirm?: string, cancel?: string, tone?: string}} options
   * @returns {Promise<boolean>}
   */
  function confirm(options) {
    var settings = options || {};
    return new Promise(function (resolve) {
      var dialog = D.el('dialog', {
        class: 'dialog',
        attrs: { 'aria-labelledby': 'dialog-title' }
      });

      var cancelBtn = D.el('button', {
        class: 'btn',
        text: settings.cancel || 'Anuluj',
        attrs: { type: 'button', 'data-dialog-cancel': '' },
        on: { click: function () { dialog.close('cancel'); } }
      });

      var confirmBtn = D.el('button', {
        class: 'btn ' + (settings.tone === 'danger' ? 'btn--solidDanger' : 'btn--primary'),
        text: settings.confirm || 'Potwierdź',
        attrs: { type: 'button', 'data-dialog-confirm': '' },
        on: { click: function () { dialog.close('ok'); } }
      });

      D.append(dialog, [
        D.el('div', { class: 'dialog__card' }, [
          D.el('h2', { class: 'dialog__title', text: settings.title || 'Potwierdź', attrs: { id: 'dialog-title' } }),
          D.el('p', { class: 'dialog__text', text: settings.message || '' }),
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
   * Pytanie z polem tekstowym. Zwraca wpisany tekst albo null przy anulowaniu.
   * @param {{title: string, message?: string, label: string, placeholder?: string,
   *          confirm?: string, required?: boolean}} options
   * @returns {Promise<string|null>}
   */
  function prompt(options) {
    var settings = options || {};
    return new Promise(function (resolve) {
      var dialog = D.el('dialog', { class: 'dialog', attrs: { 'aria-labelledby': 'dialog-title' } });
      var error = D.el('p', { class: 'field__error', attrs: { role: 'alert' } });
      var input = D.el('textarea', {
        class: 'input',
        attrs: {
          id: 'dialog-input', rows: '3',
          placeholder: settings.placeholder || '',
          'data-dialog-input': ''
        }
      });

      function accept() {
        var value = input.value.trim();
        if (settings.required !== false && !value) {
          error.textContent = 'To pole nie może zostać puste.';
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        dialog.returnValue = 'ok';
        dialog.dataset.value = value;
        dialog.close('ok');
      }

      var body = [
        D.el('h2', { class: 'dialog__title', text: settings.title || 'Podaj szczegóły', attrs: { id: 'dialog-title' } })
      ];
      if (settings.message) body.push(D.el('p', { class: 'dialog__text', text: settings.message }));
      body.push(
        D.el('div', { class: 'field', style: { 'margin-top': 'var(--space-4)' } }, [
          D.el('label', { class: 'field__label', text: settings.label || 'Treść', attrs: { for: 'dialog-input' } }),
          input,
          error
        ]),
        D.el('div', { class: 'dialog__actions' }, [
          D.el('button', {
            class: 'btn', text: 'Anuluj',
            attrs: { type: 'button', 'data-dialog-cancel': '' },
            on: { click: function () { dialog.close('cancel'); } }
          }),
          D.el('button', {
            class: 'btn btn--primary', text: settings.confirm || 'Zapisz',
            attrs: { type: 'button', 'data-dialog-confirm': '' },
            on: { click: accept }
          })
        ])
      );

      D.append(dialog, [D.el('div', { class: 'dialog__card' }, body)]);

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
   * Panel wysuwany z prawej krawędzi. Zwraca uchwyt z metodą close().
   * @param {{title: string, content: Node, onClose?: Function}} options
   */
  function openDrawer(options) {
    var settings = options || {};
    closeDrawer();

    var dialog = D.el('dialog', {
      class: 'drawer',
      attrs: { 'aria-label': settings.title || 'Panel' }
    });

    var closeBtn = D.el('button', {
      class: 'drawer__close',
      attrs: { type: 'button', 'aria-label': 'Zamknij panel', 'data-drawer-close': '' },
      on: { click: function () { dialog.close('cancel'); } }
    }, [Icons.icon('close', 18)]);

    D.append(dialog, [
      D.el('div', { class: 'drawer__inner' }, [
        D.el('div', { class: 'drawer__bar' }, [
          D.el('p', { class: 'drawer__title', text: settings.title || '' }),
          closeBtn
        ]),
        D.el('div', { class: 'drawer__body' }, [settings.content])
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
    prompt: prompt,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    isDrawerOpen: isDrawerOpen,
    anyOpen: anyOpen
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
