/* ETROM — podpowiedzi.
   Jedna podpowiedź naraz, podpięta delegacją do [data-tooltip].
   Najechanie myszą: po chwili (żeby nie migało przy przejeżdżaniu kursorem).
   Fokus z klawiatury: od razu. Gdy podpowiedź była widoczna przed chwilą,
   kolejna pojawia się bez zwłoki. Treść dubluje aria-label, więc
   dla czytnika ekranu podpowiedź jest ukryta (brak podwójnego czytania). */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;

  var DELAY = 450;
  var WARM = 600;
  var tip = null;
  var target = null;
  var timer = null;
  var hiddenAt = 0;
  var supportsPopover = typeof HTMLElement !== 'undefined' && HTMLElement.prototype.hasOwnProperty('popover');

  function element() {
    if (tip) return tip;
    tip = D.el('div', { class: 'tooltip', attrs: { role: 'tooltip', 'aria-hidden': 'true', popover: supportsPopover ? 'manual' : null } });
    tip.style.margin = '0';
    tip.style.border = '0';
    tip.style.inset = 'auto';
    return tip;
  }

  function place(anchor) {
    var rect = anchor.getBoundingClientRect();
    var width = tip.offsetWidth;
    var height = tip.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - 8));
    var top = rect.top - height - 6;
    if (top < 8) top = rect.bottom + 6;
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  function show(anchor) {
    var text = anchor.getAttribute('data-tooltip');
    if (!text || !document.contains(anchor)) return;
    var node = element();
    var key = anchor.getAttribute('data-tooltip-kbd');
    D.render(node, [D.el('span', { text: text }), key ? D.el('kbd', { class: 'kbd', text: key }) : null]);

    var host = anchor.closest('dialog[open]') || document.body;
    if (node.parentNode !== host) host.appendChild(node);
    if (supportsPopover) {
      try { if (!node.matches(':popover-open')) node.showPopover(); } catch (error) { /* bez znaczenia */ }
    }
    place(anchor);
    node.classList.add('tooltip--visible');
    target = anchor;
  }

  function hide() {
    window.clearTimeout(timer);
    timer = null;
    if (!tip || !target) return;
    tip.classList.remove('tooltip--visible');
    if (supportsPopover) {
      try { if (tip.matches(':popover-open')) tip.hidePopover(); } catch (error) { /* bez znaczenia */ }
    }
    target = null;
    hiddenAt = Date.now();
  }

  function schedule(anchor, delay) {
    window.clearTimeout(timer);
    if (delay <= 0) { show(anchor); return; }
    timer = window.setTimeout(function () { show(anchor); }, delay);
  }

  function find(node) {
    return node && node.closest ? node.closest('[data-tooltip]') : null;
  }

  document.addEventListener('pointerover', function (event) {
    if (event.pointerType === 'touch') return;
    var anchor = find(event.target);
    if (!anchor || anchor === target) return;
    hide();
    schedule(anchor, Date.now() - hiddenAt < WARM ? 0 : DELAY);
  });

  document.addEventListener('pointerout', function (event) {
    var anchor = find(event.target);
    if (!anchor) return;
    if (event.relatedTarget && anchor.contains(event.relatedTarget)) return;
    hide();
  });

  document.addEventListener('focusin', function (event) {
    var anchor = find(event.target);
    if (!anchor) return;
    var keyboard = false;
    try { keyboard = event.target.matches(':focus-visible'); } catch (error) { keyboard = false; }
    if (keyboard) schedule(anchor, 0);
  });

  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);

  root.ETROM.Tooltip = { hide: hide };
})(typeof globalThis !== 'undefined' ? globalThis : this);
