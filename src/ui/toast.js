/* ETROM — paski zdarzeń z możliwością cofnięcia.
   Działanie wykonuje się od razu, a przez chwilę można je odwołać. */
(function (root) {
  'use strict';

  var D = root.ETROM.Dom;
  var Icons = root.ETROM.Icons;

  var DEFAULT_TIMEOUT = 8000;
  var stack = null;

  function container() {
    if (stack && document.body.contains(stack)) return stack;
    stack = D.el('div', {
      class: 'toasts',
      attrs: { id: 'toast-stack', role: 'status', 'aria-live': 'polite' }
    });
    document.body.appendChild(stack);
    return stack;
  }

  /**
   * @param {{message: string, actionLabel?: string, onAction?: Function, timeout?: number}} options
   * @returns {{dismiss: Function}}
   */
  function show(options) {
    var settings = options || {};
    var timeout = typeof settings.timeout === 'number' ? settings.timeout : DEFAULT_TIMEOUT;
    var timer = null;
    var closed = false;

    var toast = D.el('div', { class: 'toast' });

    function dismiss() {
      if (closed) return;
      closed = true;
      if (timer) window.clearTimeout(timer);
      toast.classList.add('toast--leaving');
      window.setTimeout(function () { toast.remove(); }, 180);
    }

    var children = [D.el('p', { class: 'toast__text', text: settings.message || '' })];

    if (settings.actionLabel && typeof settings.onAction === 'function') {
      children.push(D.el('button', {
        class: 'toast__action',
        text: settings.actionLabel,
        attrs: { type: 'button', 'data-toast-action': '' },
        on: {
          click: function () {
            settings.onAction();
            dismiss();
          }
        }
      }));
    }

    children.push(D.el('button', {
      class: 'toast__close',
      attrs: { type: 'button', 'aria-label': 'Zamknij komunikat' },
      on: { click: dismiss }
    }, [Icons.icon('close', 14)]));

    children.push(D.el('span', {
      class: 'toast__life',
      style: { 'animation-duration': timeout + 'ms' },
      attrs: { 'aria-hidden': 'true' }
    }));

    D.append(toast, children);
    container().appendChild(toast);

    if (timeout > 0) timer = window.setTimeout(dismiss, timeout);
    return { dismiss: dismiss };
  }

  function clear() {
    if (stack) D.clear(stack);
  }

  root.ETROM.Toast = { show: show, clear: clear };
})(typeof globalThis !== 'undefined' ? globalThis : this);
