/* ETROM — Popover i DropdownMenu.
   Jedno menu naraz, w warstwie górnej (Popover API), więc działa także
   nad otwartym panelem bocznym. Obsługa klawiatury jak w menu systemowym:
   strzałki, Home/End, pierwsza litera, Enter/Spacja, Escape wraca do przycisku. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Icons = E.Icons;

  var current = null;
  var lastClosed = { anchor: null, at: 0 };
  var GAP = 4;
  var supportsPopover = typeof HTMLElement !== 'undefined' && HTMLElement.prototype.hasOwnProperty('popover');

  function place(panel, anchor, align, side) {
    var rect = anchor.getBoundingClientRect();
    var width = panel.offsetWidth;
    var height = panel.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;

    var left = align === 'end' ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, vw - width - 8));

    var below = rect.bottom + GAP;
    var above = rect.top - GAP - height;
    var top = (side === 'top' || below + height > vh - 8) && above > 8 ? above : below;
    top = Math.max(8, Math.min(top, vh - height - 8));

    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  function focusables(panel) {
    return Array.prototype.slice.call(panel.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])'));
  }

  function close(options) {
    if (!current) return;
    var closing = current;
    current = null;
    closing.anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', closing.outside, true);
    window.removeEventListener('resize', closing.reposition);
    window.removeEventListener('scroll', closing.reposition, true);
    try { if (supportsPopover && closing.panel.matches(':popover-open')) closing.panel.hidePopover(); } catch (error) { /* już zamknięte */ }
    closing.panel.remove();
    if (!options || options.restoreFocus !== false) {
      if (document.contains(closing.anchor)) closing.anchor.focus({ preventScroll: true });
    }
    if (typeof closing.onClose === 'function') closing.onClose();
  }

  function renderItem(item, run) {
    if (item.type === 'separator') return D.el('div', { class: 'menu__separator', attrs: { role: 'separator' } });
    if (item.type === 'label') return D.el('div', { class: 'menu__group', text: item.label, attrs: { role: 'presentation' } });
    if (item.type === 'note') return D.el('p', { class: 'menu__note', text: item.label, attrs: { role: 'presentation' } });

    var role = item.type === 'radio' ? 'menuitemradio' : (item.type === 'checkbox' ? 'menuitemcheckbox' : 'menuitem');
    var checkable = role !== 'menuitem';
    var node = D.el('button', {
      class: 'menu__item' + (item.tone === 'danger' ? ' menu__item--danger' : ''),
      attrs: {
        type: 'button',
        role: role,
        tabindex: '-1',
        'aria-checked': checkable ? String(!!item.checked) : null,
        'aria-disabled': item.disabled ? 'true' : null,
        'data-tooltip': item.tooltip || null
      },
      dataset: item.value != null ? { value: String(item.value) } : null,
      on: { click: function () { if (!item.disabled) run(item, node); } }
    }, [
      item.icon ? Icons.icon(item.icon) : (item.leading || null),
      D.el('span', { class: 'menu__label', text: item.label }),
      item.hint ? D.el('span', { class: 'menu__hint', text: item.hint }) : null,
      checkable ? D.el('span', { class: 'menu__check' }, [Icons.icon('check')]) : null
    ]);
    return node;
  }

  /**
   * Otwiera menu przy przycisku.
   * @param {{anchor: Element, items?: Array, content?: Node, label: string,
   *          align?: 'start'|'end', side?: 'top'|'bottom', onClose?: Function,
   *          minWidth?: string, className?: string}} o
   *   item: {type?: 'item'|'radio'|'checkbox'|'separator'|'label'|'note', label, icon,
   *          hint, checked, tone, disabled, keepOpen, onSelect, value}
   */
  function open(o) {
    var anchor = o.anchor;
    if (current && current.anchor === anchor) { close(); return null; }
    close({ restoreFocus: false });
    if (lastClosed.anchor === anchor && Date.now() - lastClosed.at < 400) {
      lastClosed = { anchor: null, at: 0 };
      return null;
    }

    var isMenu = !o.content;
    var panel = D.el('div', {
      class: 'popover' + (isMenu ? ' menu' : ' popover--panel') + (o.className ? ' ' + o.className : ''),
      attrs: {
        role: isMenu ? 'menu' : 'dialog',
        'aria-label': o.label,
        popover: supportsPopover ? 'manual' : null
      },
      style: o.minWidth ? { 'min-width': o.minWidth } : null
    });

    function run(item, node) {
      if (item.keepOpen) {
        if (item.type === 'checkbox') {
          item.checked = !item.checked;
          node.setAttribute('aria-checked', String(item.checked));
        }
        if (typeof item.onSelect === 'function') item.onSelect(item.checked);
        return;
      }
      close();
      if (typeof item.onSelect === 'function') item.onSelect(item.value);
    }

    if (isMenu) {
      D.append(panel, (o.items || []).filter(Boolean).map(function (item) { return renderItem(item, run); }));
    } else {
      D.append(panel, [o.content]);
    }

    // Wewnątrz modalnego <dialog> wszystko poza nim jest bezczynne — menu musi mieszkać w nim.
    var host = anchor.closest('dialog[open]') || document.body;
    host.appendChild(panel);
    if (supportsPopover) panel.showPopover(); else panel.classList.add('popover--open');

    function reposition() { place(panel, anchor, o.align, o.side); }
    reposition();

    function outside(event) {
      if (panel.contains(event.target)) return;
      // Wciśnięcie przycisku, który otworzył menu, zamyka je — a następujący po nim
      // „click” nie może otworzyć go od nowa.
      if (anchor.contains(event.target)) lastClosed = { anchor: anchor, at: Date.now() };
      close({ restoreFocus: false });
    }

    panel.addEventListener('keydown', function (event) {
      var items = focusables(panel);
      var index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        close({ restoreFocus: false });
      } else if (!isMenu) {
        return;
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(index + 1) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (event.key.length === 1 && /\S/.test(event.key)) {
        var letter = event.key.toLocaleLowerCase('pl');
        var ordered = items.slice(index + 1).concat(items.slice(0, index + 1));
        var match = ordered.filter(function (node) {
          return node.textContent.trim().toLocaleLowerCase('pl').indexOf(letter) === 0;
        })[0];
        if (match) match.focus();
      }
    });

    // Escape na przycisku zamyka menu bez zamykania panelu, w którym przycisk stoi.
    anchor.setAttribute('aria-expanded', 'true');
    current = { panel: panel, anchor: anchor, outside: outside, reposition: reposition, onClose: o.onClose };

    window.setTimeout(function () {
      if (!current || current.panel !== panel) return;
      document.addEventListener('pointerdown', outside, true);
    }, 0);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    if (isMenu) {
      var items = focusables(panel);
      var checked = items.filter(function (node) { return node.getAttribute('aria-checked') === 'true'; })[0];
      (checked || items[0] || panel).focus({ preventScroll: true });
    } else {
      var first = panel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus({ preventScroll: true });
    }
    return { panel: panel, close: close };
  }

  /**
   * Podpina menu pod przycisk: aria-haspopup, aria-expanded i strzałka w dół otwierająca menu.
   * @param {Element} anchor
   * @param {Function} build () => opcje dla open() bez anchor
   */
  function bind(anchor, build) {
    anchor.setAttribute('aria-haspopup', 'menu');
    anchor.setAttribute('aria-expanded', 'false');
    anchor.addEventListener('click', function (event) {
      event.stopPropagation();
      open(Object.assign({ anchor: anchor }, build()));
    });
    anchor.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' && anchor.getAttribute('aria-expanded') !== 'true') {
        event.preventDefault();
        open(Object.assign({ anchor: anchor }, build()));
      }
    });
    return anchor;
  }

  function isOpen() {
    return !!current;
  }

  // Escape w otwartym menu nie może zamknąć leżącego pod spodem panelu (<dialog> reaguje na „cancel”).
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && current) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }, true);

  root.ETROM.Menu = { open: open, close: close, bind: bind, isOpen: isOpen };
})(typeof globalThis !== 'undefined' ? globalThis : this);
