/* ETROM — pomocniki DOM. Elementy budujemy przez API przeglądarki,
   nigdy przez składanie HTML ze stringów, więc dane użytkownika nie mogą
   wstrzyknąć znaczników. */
(function (root) {
  'use strict';

  /**
   * @param {string} tag
   * @param {Object} [options] class, text, attrs, dataset, on, style
   * @param {Array|Node|string} [children]
   */
  function el(tag, options, children) {
    var node = document.createElement(tag);
    var opts = options || {};

    if (opts.class) node.className = opts.class;
    if (opts.text != null) node.textContent = String(opts.text);

    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (key) {
        var value = opts.attrs[key];
        if (value === false || value == null) return;
        node.setAttribute(key, value === true ? '' : String(value));
      });
    }

    if (opts.dataset) {
      Object.keys(opts.dataset).forEach(function (key) {
        node.dataset[key] = String(opts.dataset[key]);
      });
    }

    if (opts.style) {
      Object.keys(opts.style).forEach(function (key) {
        node.style.setProperty(key, opts.style[key]);
      });
    }

    if (opts.on) {
      Object.keys(opts.on).forEach(function (type) {
        node.addEventListener(type, opts.on[type]);
      });
    }

    append(node, children);
    return node;
  }

  function append(parent, children) {
    if (children == null) return parent;
    var list = Array.isArray(children) ? children : [children];
    list.forEach(function (child) {
      if (child == null || child === false) return;
      parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return parent;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /** Podmienia zawartość kontenera jednym ruchem. */
  function render(container, children) {
    var fragment = document.createDocumentFragment();
    append(fragment, children);
    clear(container).appendChild(fragment);
    return container;
  }

  function byId(id) {
    var node = document.getElementById(id);
    if (!node) throw new Error('Brak elementu #' + id + ' w dokumencie.');
    return node;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Buduje element SVG. createElement nie działa dla SVG — potrzebna
   * przestrzeń nazw, inaczej przeglądarka tworzy nieznany element HTML.
   */
  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, String(attrs[key]));
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  var api = { el: el, append: append, clear: clear, render: render, byId: byId, svg: svg };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ETROM = root.ETROM || {}; root.ETROM.Dom = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
