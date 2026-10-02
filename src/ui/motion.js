/* ETROM — ruch: przejścia widoku i liczby, które dochodzą do nowej wartości.
   Przy ograniczeniu ruchu w systemie wszystko dzieje się od razu. */
(function (root) {
  'use strict';

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (error) {
      return false;
    }
  }

  function supported() {
    return typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
  }

  /**
   * Wykonuje zmianę widoku, w miarę możliwości płynnie.
   * @param {Function} apply funkcja wprowadzająca zmianę w DOM
   * @returns {Object|null} obiekt przejścia albo null
   */
  function withTransition(apply) {
    if (!supported() || prefersReducedMotion() || document.visibilityState === 'hidden') {
      apply();
      return null;
    }
    try {
      return document.startViewTransition(apply);
    } catch (error) {
      apply();
      return null;
    }
  }

  /** Liczba w elemencie dochodzi od jednej wartości do drugiej (ok. 0,5 s, wyhamowując). */
  function countTo(node, from, to, duration) {
    if (!node || from === to || prefersReducedMotion()) {
      if (node) node.textContent = String(to);
      return;
    }
    var time = duration || 520;
    var started = null;
    function frame(stamp) {
      if (started === null) started = stamp;
      var t = Math.min(1, (stamp - started) / time);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1 && document.contains(node)) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  root.ETROM.Motion = {
    supported: supported,
    prefersReducedMotion: prefersReducedMotion,
    withTransition: withTransition,
    countTo: countTo
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
