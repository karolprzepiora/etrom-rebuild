/* ETROM — UI/UX Standard v1.0 · komponenty bazowe w JS.
   Widoki nie składają klas ręcznie: wołają te funkcje, więc przycisk,
   pole, status czy pusty stan wyglądają i zachowują się wszędzie tak samo.
   Wygląd w styles/components.css, zasady w docs/DESIGN_SYSTEM.md. */
(function (root) {
  'use strict';

  var E = root.ETROM;
  var D = E.Dom;
  var Icons = E.Icons;

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  /* ---------- Button ---------- */

  /**
   * @param {{label: string, variant?: 'primary'|'secondary'|'tertiary'|'ghost'|'danger'|'danger-solid',
   *          size?: 'sm'|'md'|'lg', icon?: string, iconRight?: string, kbd?: string,
   *          onClick?: Function, type?: string, attrs?: Object, class?: string,
   *          dataset?: Object, tooltip?: string, disabled?: boolean}} o
   */
  function button(o) {
    var children = [];
    if (o.icon) children.push(Icons.icon(o.icon));
    children.push(D.el('span', { text: o.label }));
    if (o.iconRight) children.push(Icons.icon(o.iconRight));
    if (o.kbd) children.push(kbd(o.kbd));

    return D.el('button', {
      class: cx('btn', 'btn--' + (o.variant || 'secondary'), o.size && o.size !== 'md' ? 'btn--' + o.size : '', o.class),
      attrs: Object.assign({
        type: o.type || 'button',
        disabled: !!o.disabled,
        'data-tooltip': o.tooltip || null
      }, o.attrs || {}),
      dataset: o.dataset,
      on: o.onClick ? { click: o.onClick } : null
    }, children);
  }

  /**
   * Przycisk z samą ikoną. Etykieta jest obowiązkowa: trafia do czytnika
   * ekranu i do podpowiedzi widocznej po najechaniu lub fokusie.
   */
  function iconButton(o) {
    if (!o.label) throw new Error('iconButton wymaga etykiety');
    return D.el('button', {
      class: cx('icon-btn', o.size === 'sm' ? 'icon-btn--sm' : '', o.tone === 'danger' ? 'icon-btn--danger' : '', o.class),
      attrs: Object.assign({
        type: 'button',
        'aria-label': o.label,
        'data-tooltip': o.tooltip === false ? null : (o.tooltip || o.label),
        'data-tooltip-kbd': o.kbd || null,
        disabled: !!o.disabled
      }, o.attrs || {}),
      dataset: o.dataset,
      on: o.onClick ? { click: o.onClick } : null
    }, [Icons.icon(o.icon, o.size === 'sm' ? 14 : 16)]);
  }

  function kbd(text) {
    return D.el('kbd', { class: 'kbd', text: text });
  }

  /* ---------- Status ---------- */

  // Kształt ikony niesie znaczenie niezależnie od koloru (WCAG 1.4.1).
  var SHAPES = {
    empty: function () { return [circle(false)]; },
    planned: function () {
      var c = circle(false);
      c.setAttribute('stroke-dasharray', '2.4 2.1');
      return [c];
    },
    half: function () { return [circle(false), D.svg('path', { d: 'M8 3.5a4.5 4.5 0 0 1 0 9Z', fill: 'currentColor', stroke: 'none' })]; },
    review: function () { return [circle(false), D.svg('path', { d: 'M8 3.5a4.5 4.5 0 1 1-4.5 4.5H8Z', fill: 'currentColor', stroke: 'none' })]; },
    changes: function () {
      return [circle(false),
        D.svg('path', { d: 'M8 5v3.6', 'stroke-width': '1.6' }),
        D.svg('path', { d: 'M8 10.9v.1', 'stroke-width': '1.8' })];
    },
    paused: function () { return [circle(false), D.svg('path', { d: 'M6.6 5.8v4.4M9.4 5.8v4.4', 'stroke-width': '1.5' })]; },
    done: function () {
      return [circle(true), D.svg('path', {
        d: 'm5.4 8.2 1.8 1.8 3.4-3.6', stroke: 'var(--bg-surface)', 'stroke-width': '1.6'
      })];
    }
  };

  function circle(filled) {
    return D.svg('circle', {
      cx: '8', cy: '8', r: filled ? '7' : '6',
      fill: filled ? 'currentColor' : 'none',
      stroke: filled ? 'none' : 'currentColor',
      'stroke-width': '1.5'
    });
  }

  function statusIcon(shape) {
    var make = SHAPES[shape] || SHAPES.empty;
    return D.svg('svg', {
      class: 'status__icon', viewBox: '0 0 16 16', width: '14', height: '14',
      fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round',
      'aria-hidden': 'true', focusable: 'false'
    }, make());
  }

  var STATUS = {
    project: {
      planned: { tone: 'neutral', shape: 'planned' },
      active: { tone: 'info', shape: 'half' },
      paused: { tone: 'warning', shape: 'paused' },
      done: { tone: 'success', shape: 'done' }
    },
    stage: {
      todo: { tone: 'neutral', shape: 'empty' },
      working: { tone: 'info', shape: 'half' },
      done: { tone: 'success', shape: 'done' }
    },
    task: {
      todo: { tone: 'neutral', shape: 'empty' },
      working: { tone: 'info', shape: 'half' },
      review: { tone: 'review', shape: 'review' },
      changes: { tone: 'warning', shape: 'changes' },
      done: { tone: 'success', shape: 'done' }
    }
  };

  function statusLabel(scope, key) {
    if (scope === 'project') return E.Model.PROJECT_STATUS[key] || key;
    if (scope === 'stage') return E.Model.STAGE_STATUS[key] || key;
    if (scope === 'task') return E.Tasks.TASK_STATUS[key] || key;
    if (scope === 'part') return E.Tasks.PART_STATUS[key] || key;
    return key;
  }

  function statusSpec(scope, key) {
    var table = STATUS[scope === 'part' ? 'stage' : scope] || STATUS.stage;
    return table[key] || { tone: 'neutral', shape: 'empty' };
  }

  /** Status do odczytu: ikona o kształcie stanu + nazwa. */
  function status(scope, key, options) {
    var spec = statusSpec(scope, key);
    var settings = options || {};
    return D.el('span', {
      class: cx('status', 'status--' + spec.tone, settings.class),
      attrs: settings.iconOnly ? { role: 'img', 'aria-label': statusLabel(scope, key), 'data-tooltip': statusLabel(scope, key) } : null
    }, [
      statusIcon(spec.shape),
      settings.iconOnly ? null : D.el('span', { class: 'truncate', text: settings.label || statusLabel(scope, key) })
    ]);
  }

  /** Sama ikona stanu w kolorze tonu — do menu i list, gdzie obok stoi nazwa. */
  function statusGlyph(scope, key) {
    var spec = statusSpec(scope, key);
    return D.el('span', { class: 'status status--' + spec.tone, attrs: { 'aria-hidden': 'true' } }, [statusIcon(spec.shape)]);
  }

  /** Status do zmiany: wygląda jak status, działa jak przycisk (menu albo cykl). */
  function statusButton(scope, key, o) {
    var spec = statusSpec(scope, key);
    return D.el('button', {
      class: cx('status-btn', 'status', 'status--' + spec.tone, o.class),
      attrs: Object.assign({
        type: 'button',
        'aria-label': (o.subject ? o.subject + ' — ' : '') + 'status: ' + statusLabel(scope, key) + '. ' + (o.hint || 'Zmień status'),
        'aria-haspopup': o.menu ? 'menu' : null
      }, o.attrs || {}),
      dataset: o.dataset,
      on: o.onClick ? { click: o.onClick } : null
    }, [
      statusIcon(spec.shape),
      o.iconOnly ? null : D.el('span', { class: 'truncate', text: statusLabel(scope, key) }),
      o.menu ? D.el('span', { class: 'status-btn__caret' }, [Icons.icon('chevronDown', 12)]) : null
    ]);
  }

  /* ---------- Badge, termin, postęp ---------- */

  function badge(text, tone, options) {
    var settings = options || {};
    return D.el(settings.tag || 'span', {
      class: cx('badge', tone ? 'badge--' + tone : '', settings.mono ? 'badge--mono' : '', settings.class),
      attrs: settings.attrs
    }, [settings.icon ? Icons.icon(settings.icon, 12) : null, D.el('span', { text: text })]);
  }

  var DUE_ICON = { overdue: 'alertCircle', urgent: 'clock' };

  /**
   * Termin: zwykły tekst, a kolor i ikona tylko dla terminów wymagających reakcji.
   * @param {string} value data (YYYY-MM-DD lub z godziną)
   * @param {{tone: string, text: string}} info wynik Progress/Tasks.deadlineInfo
   * @param {{done?: boolean, showDate?: boolean}} [options]
   */
  function due(value, info, options) {
    var settings = options || {};
    var F = E.Format;
    if (!value) return D.el('span', { class: 'due due--none', text: 'Bez terminu' });

    var formatted = value.indexOf('T') > 0 ? F.dateTime(value) : F.date(value);
    var tone = settings.done ? 'normal' : info.tone;
    var alarming = tone === 'overdue' || tone === 'urgent';
    var children = [];
    if (alarming) children.push(Icons.icon(DUE_ICON[tone], 14));

    if (settings.relativeOnly) {
      children.push(D.el('span', { text: info.text }));
    } else {
      children.push(D.el('span', { text: formatted }));
      if (alarming) children.push(D.el('span', { class: 'due__sub', text: '· ' + shortRelative(info.text) }));
    }

    return D.el('span', {
      class: cx('due', alarming ? 'due--' + tone : ''),
      attrs: {
        'data-tooltip': (settings.label || 'Termin') + ': ' + F.dateLong(value) + (settings.done ? '' : ' — ' + info.text.toLowerCase()),
        'aria-label': (settings.label || 'Termin') + ' ' + F.dateLong(value) + (settings.done ? '' : ', ' + info.text.toLowerCase())
      }
    }, children);
  }

  function shortRelative(text) {
    return String(text).replace(/^Pozostało /i, 'za ').replace(/^zostało /i, 'za ').replace(/^Termin dzisiaj$/i, 'dziś');
  }

  /** Pasek postępu z wartością. role=progressbar z pełnym opisem. */
  function progress(percent, options) {
    var settings = options || {};
    var value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    return D.el('div', {
      class: cx('progress', value >= 100 ? 'progress--complete' : '', settings.size === 'lg' ? 'progress--lg' : '', settings.class),
      style: { '--value': value + '%' }
    }, [
      D.el('div', {
        class: 'progress__track',
        attrs: {
          role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(value),
          'aria-label': settings.label || 'Postęp'
        }
      }, [D.el('div', { class: 'progress__fill' })]),
      settings.hideValue ? null : D.el('span', { class: 'progress__value', text: value + '%' })
    ]);
  }

  /** Znacznik barwy projektu — stały, wynika z kodu. */
  function swatch(code) {
    return D.el('span', {
      class: 'swatch',
      style: { '--hue': String(E.Identity.hue(code)) },
      attrs: { 'aria-hidden': 'true' }
    });
  }

  /* ---------- Pola formularza ---------- */

  /**
   * Pole z etykietą, oznaczeniem wymagalności, podpowiedzią i błędem.
   * Kontrolka dostaje aria-describedby i aria-invalid automatycznie.
   */
  function field(o) {
    var hintId = o.hint ? o.id + '-hint' : null;
    var errorId = o.error ? o.id + '-error' : null;
    var described = [hintId, errorId].filter(Boolean).join(' ');
    if (o.control && described) o.control.setAttribute('aria-describedby', described);
    if (o.control && o.error) o.control.setAttribute('aria-invalid', 'true');
    if (o.control && o.required) o.control.setAttribute('aria-required', 'true');

    var label = D.el('label', { class: 'field__label', attrs: { for: o.id } }, [
      D.el('span', { text: o.label }),
      o.required ? D.el('span', { class: 'field__required', text: '*', attrs: { 'aria-hidden': 'true' } }) : null,
      o.optional ? D.el('span', { class: 'field__optional', text: 'opcjonalnie' }) : null
    ]);

    return D.el('div', { class: cx('field', o.class) }, [
      label,
      o.control,
      o.hint && !o.error ? D.el('p', { class: 'field__hint', text: o.hint, attrs: { id: hintId } }) : null,
      o.error ? D.el('p', { class: 'field__error', attrs: { id: errorId, role: 'alert' } }, [
        Icons.icon('alertCircle', 14), D.el('span', { text: o.error })
      ]) : null
    ]);
  }

  function input(o) {
    return D.el('input', {
      class: cx('input', o.class),
      attrs: Object.assign({
        id: o.id, type: o.type || 'text', value: o.value == null ? '' : o.value,
        placeholder: o.placeholder || null,
        maxlength: o.maxlength || null,
        autocomplete: o.autocomplete || 'off',
        'aria-invalid': o.error ? 'true' : 'false'
      }, o.attrs || {}),
      on: o.on
    });
  }

  function textarea(o) {
    return D.el('textarea', {
      class: cx('textarea', o.class),
      text: o.value || '',
      attrs: Object.assign({ id: o.id, rows: o.rows || 3, placeholder: o.placeholder || null }, o.attrs || {}),
      on: o.on
    });
  }

  /** @param {{id: string, options: Array<{value: string, label: string}>, value?: string}} o */
  function select(o) {
    return D.el('select', {
      class: cx('select', o.class),
      attrs: Object.assign({ id: o.id }, o.attrs || {}),
      on: o.on
    }, o.options.map(function (option) {
      return D.el('option', {
        text: option.label,
        attrs: { value: option.value, selected: option.value === o.value }
      });
    }));
  }

  function checkbox(o) {
    var box = D.el('input', {
      class: 'checkbox',
      attrs: Object.assign({ id: o.id, type: 'checkbox', value: o.value || null, checked: !!o.checked }, o.attrs || {}),
      on: o.on
    });
    if (!o.label) return box;
    return D.el('label', { class: cx('check', o.class), attrs: { for: o.id } }, [
      box,
      D.el('span', { class: 'check__text' }, [
        D.el('span', { text: o.label }),
        o.hint ? D.el('span', { class: 'check__hint', text: o.hint }) : null
      ])
    ]);
  }

  function switchControl(o) {
    var control = D.el('input', {
      class: 'switch',
      attrs: Object.assign({ id: o.id, type: 'checkbox', role: 'switch', checked: !!o.checked }, o.attrs || {}),
      on: o.onChange ? { change: function () { o.onChange(control.checked); } } : null
    });
    return {
      input: control,
      node: D.el('label', { class: 'switch-label', attrs: { for: o.id } }, [control, D.el('span', { text: o.label })])
    };
  }

  /** Wyszukiwarka z ikoną i skrótem klawiszowym. */
  function searchInput(o) {
    var control = input({
      id: o.id, type: 'search', placeholder: o.placeholder,
      attrs: { 'aria-label': o.label || o.placeholder, spellcheck: 'false' },
      on: o.on
    });
    return {
      input: control,
      node: D.el('div', { class: cx('input-group', o.class) }, [Icons.icon('search'), control, o.kbd ? kbd(o.kbd) : null])
    };
  }

  /* ---------- Segmented control ---------- */

  /**
   * @param {{label: string, items: Array<{value, label?, icon?, title?}>, value: string, onChange: Function, iconsOnly?: boolean}} o
   * @returns {{node: Element, set: Function, buttons: Object}}
   */
  function segmented(o) {
    var buttons = {};
    var node = D.el('div', {
      class: cx('segmented', o.iconsOnly ? 'segmented--icons' : ''),
      attrs: { role: 'group', 'aria-label': o.label }
    }, o.items.map(function (item) {
      var btn = D.el('button', {
        class: 'segmented__btn',
        attrs: {
          type: 'button',
          'aria-pressed': String(item.value === o.value),
          'aria-label': item.title || item.label,
          'data-tooltip': o.iconsOnly ? (item.title || item.label) : null
        },
        dataset: { value: item.value },
        on: { click: function () { o.onChange(item.value); } }
      }, [
        item.icon ? Icons.icon(item.icon) : null,
        !o.iconsOnly && item.label ? D.el('span', { text: item.label }) : null
      ]);
      buttons[item.value] = btn;
      return btn;
    }));

    function set(value) {
      Object.keys(buttons).forEach(function (key) {
        buttons[key].setAttribute('aria-pressed', String(key === value));
      });
    }
    return { node: node, set: set, buttons: buttons };
  }

  /* ---------- Tabs (linki z adresem) ---------- */

  function tabs(o) {
    return D.el('nav', { class: cx('tabs', o.class), attrs: { 'aria-label': o.label } }, o.items.map(function (item) {
      return D.el('a', {
        class: 'tabs__tab',
        attrs: { href: item.href, 'aria-current': item.value === o.value ? 'page' : null },
        dataset: { tab: item.value }
      }, [
        item.icon ? Icons.icon(item.icon) : null,
        D.el('span', { text: item.label }),
        item.count != null ? D.el('span', { class: 'count', text: String(item.count) }) : null
      ]);
    }));
  }

  /* ---------- Breadcrumb ---------- */

  function breadcrumb(items) {
    var children = [];
    items.forEach(function (item, index) {
      var last = index === items.length - 1;
      if (index > 0) children.push(D.el('li', { class: 'breadcrumb__item', attrs: { 'aria-hidden': 'true' } }, [Icons.icon('chevronRight', 14)]));
      children.push(D.el('li', {
        class: 'breadcrumb__item',
        attrs: { 'aria-current': last ? 'page' : null }
      }, [
        item.href && !last
          ? D.el('a', { attrs: { href: item.href }, text: item.label })
          : D.el('span', { class: 'truncate', text: item.label })
      ]));
    });
    var list = D.el('ol', { class: 'breadcrumb' }, children);
    list.querySelectorAll('svg').forEach(function (svg) { svg.setAttribute('class', 'breadcrumb__sep'); });
    return list;
  }

  /* ---------- Struktura strony ---------- */

  function pageHeader(o) {
    return D.el('header', { class: cx('page-header', o.class) }, [
      D.el('div', { class: 'page-header__main' }, [
        o.eyebrow ? D.el('div', { class: 'page-header__eyebrow' }, o.eyebrow) : null,
        D.el('h1', { class: 't-page-title', text: o.title, attrs: { id: o.titleId || null } }),
        o.description != null
          ? (typeof o.description === 'string'
              ? D.el('p', { class: 'page-header__description', text: o.description })
              : D.el('div', { class: 'page-header__description' }, o.description))
          : null
      ]),
      o.actions && o.actions.length ? D.el('div', { class: 'page-header__actions' }, o.actions) : null
    ]);
  }

  /**
   * Pusty stan: co tu powinno być, dlaczego jest pusto i co zrobić dalej.
   * @param {{icon?: string, title: string, text: string, actions?: Array, compact?: boolean}} o
   */
  function emptyState(o) {
    return D.el('div', { class: cx('empty-state', o.compact ? 'empty-state--compact' : '', o.class) }, [
      D.el('div', { class: 'empty-state__icon' }, [Icons.icon(o.icon || 'folder', 20)]),
      D.el('p', { class: 'empty-state__title', text: o.title }),
      D.el('p', { class: 'empty-state__text', text: o.text }),
      o.actions && o.actions.length ? D.el('div', { class: 'empty-state__actions' }, o.actions) : null
    ]);
  }

  var ALERT_ICON = { info: 'info', warning: 'alert', danger: 'alertCircle', success: 'checkCircle' };

  function alert(o) {
    var tone = o.tone || 'info';
    return D.el('div', {
      class: cx('alert', 'alert--' + tone, o.class),
      attrs: { role: tone === 'danger' ? 'alert' : 'status' }
    }, [
      Icons.icon(ALERT_ICON[tone] || 'info'),
      D.el('div', { class: 'alert__body' }, [D.el('span', { text: o.text })]),
      o.onDismiss ? iconButton({ icon: 'close', label: 'Zamknij komunikat', size: 'sm', onClick: o.onDismiss }) : null
    ]);
  }

  function skeleton(lines) {
    var count = lines || 3;
    var children = [D.el('span', { class: 'skeleton skeleton--title' })];
    for (var i = 1; i < count; i += 1) {
      children.push(D.el('span', { class: 'skeleton ' + (i % 2 ? 'skeleton--line' : 'skeleton--short') }));
    }
    return D.el('div', { class: 'skeleton-group', attrs: { 'aria-busy': 'true', 'aria-label': 'Wczytywanie' } }, children);
  }

  /** Stronicowanie z opisem zakresu. */
  function pagination(o) {
    var pages = Math.max(1, Math.ceil(o.total / o.pageSize));
    var from = o.total ? o.page * o.pageSize + 1 : 0;
    var to = Math.min(o.total, (o.page + 1) * o.pageSize);
    return D.el('div', { class: 'pagination' }, [
      D.el('span', { text: from + '–' + to + ' z ' + o.total }),
      D.el('div', { class: 'pagination__buttons' }, [
        iconButton({ icon: 'chevronLeft', label: 'Poprzednia strona', size: 'sm', disabled: o.page <= 0, onClick: function () { o.onPage(o.page - 1); } }),
        iconButton({ icon: 'chevronRight', label: 'Następna strona', size: 'sm', disabled: o.page >= pages - 1, onClick: function () { o.onPage(o.page + 1); } })
      ])
    ]);
  }

  root.ETROM.UI = {
    cx: cx,
    button: button,
    iconButton: iconButton,
    kbd: kbd,
    status: status,
    statusButton: statusButton,
    statusIcon: statusIcon,
    statusGlyph: statusGlyph,
    statusLabel: statusLabel,
    statusSpec: statusSpec,
    badge: badge,
    due: due,
    progress: progress,
    swatch: swatch,
    field: field,
    input: input,
    textarea: textarea,
    select: select,
    checkbox: checkbox,
    switchControl: switchControl,
    searchInput: searchInput,
    segmented: segmented,
    tabs: tabs,
    breadcrumb: breadcrumb,
    pageHeader: pageHeader,
    emptyState: emptyState,
    alert: alert,
    skeleton: skeleton,
    pagination: pagination
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
