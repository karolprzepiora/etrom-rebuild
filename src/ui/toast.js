/* ETROM — powiadomienia z możliwością cofnięcia.
   Działanie wykonuje się od razu, a przez chwilę można je odwołać —
   zamiast pytania „Czy na pewno?” przed każdym usunięciem. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Icons = E.Icons;

  var DEFAULT_TIMEOUT = 8000;
  var MAX_VISIBLE = 3;
  var stack = null;

  function container() {
    if (stack && document.body.contains(stack)) return stack;
    stack = D.el('div', {
      class: 'toasts',
      attrs: { id: 'toast-stack', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' }
    });
    document.body.appendChild(stack);
    return stack;
  }

  var TONE_ICON = { success: 'checkCircle', danger: 'alertCircle', info: 'info' };

  /**
   * @param {{message: string, tone?: 'success'|'danger'|'info', actionLabel?: string,
   *          onAction?: Function, timeout?: number}} options
   * @returns {{dismiss: Function}}
   */
  function show(options) {
    var settings = options || {};
    var timeout = typeof settings.timeout === 'number' ? settings.timeout : DEFAULT_TIMEOUT;
    var timer = null;
    var closed = false;
    var remaining = timeout;
    var startedAt = 0;

    var toast = D.el('div', { class: 'toast' + (settings.tone ? ' toast--' + settings.tone : '') });

    function dismiss() {
      if (closed) return;
      closed = true;
      window.clearTimeout(timer);
      toast.classList.add('toast--leaving');
      window.setTimeout(function () { toast.remove(); }, 140);
    }

    function start() {
      if (timeout <= 0) return;
      startedAt = Date.now();
      timer = window.setTimeout(dismiss, remaining);
    }

    // Najechanie kursorem wstrzymuje odliczanie — czas na przeczytanie i decyzję.
    toast.addEventListener('pointerenter', function () {
      window.clearTimeout(timer);
      remaining -= Date.now() - startedAt;
    });
    toast.addEventListener('pointerleave', start);

    var children = [];
    if (settings.tone && TONE_ICON[settings.tone]) children.push(Icons.icon(TONE_ICON[settings.tone]));
    children.push(D.el('p', { class: 'toast__text', text: settings.message || '' }));

    if (settings.actionLabel && typeof settings.onAction === 'function') {
      children.push(D.el('button', {
        class: 'toast__action',
        text: settings.actionLabel,
        attrs: { type: 'button', 'data-toast-action': '' },
        on: { click: function () { settings.onAction(); dismiss(); } }
      }));
    }

    children.push(D.el('button', {
      class: 'toast__close',
      attrs: { type: 'button', 'aria-label': 'Zamknij powiadomienie' },
      on: { click: dismiss }
    }, [Icons.icon('close', 14)]));

    if (timeout > 0) {
      children.push(D.el('span', {
        class: 'toast__life',
        style: { 'animation-duration': timeout + 'ms' },
        attrs: { 'aria-hidden': 'true' }
      }));
    }

    D.append(toast, children);
    var host = container();
    host.appendChild(toast);
    while (host.children.length > MAX_VISIBLE) host.removeChild(host.firstChild);

    start();
    return { dismiss: dismiss };
  }

  function clear() {
    if (stack) D.clear(stack);
  }

  root.ETROM.Toast = { show: show, clear: clear };
})(typeof globalThis !== 'undefined' ? globalThis : this);
