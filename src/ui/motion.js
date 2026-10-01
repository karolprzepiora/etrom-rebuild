/* ETROM — przejścia między stanami widoku.
   Korzysta z View Transitions, gdy przeglądarka je ma i gdy użytkownik
   nie poprosił o ograniczenie ruchu. W przeciwnym razie po prostu
   wykonuje zmianę od razu. */
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
   */
  function withTransition(apply) {
    if (!supported() || prefersReducedMotion()) {
      apply();
      return;
    }
    try {
      document.startViewTransition(apply);
    } catch (error) {
      apply();
    }
  }

  root.ETROM.Motion = {
    supported: supported,
    prefersReducedMotion: prefersReducedMotion,
    withTransition: withTransition
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
