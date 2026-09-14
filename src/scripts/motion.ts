import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

/**
 * Motion runtime.
 *
 * `init()` is the only entry point. It is idempotent: call it on every
 * `astro:page-load` and it will tear down whatever the previous page left
 * behind before building anything new.
 *
 * Components do NOT build ScrollTriggers on their own schedule. They listen
 * once, at module scope, for the `motion:ready` CustomEvent on `document`:
 *
 *   document.addEventListener('motion:ready', setup);
 *
 * `init()` kills every existing ScrollTrigger first, then dispatches that
 * event, so each page-load produces exactly one set of triggers bound to the
 * DOM that is actually on screen. If reduced motion is requested the event is
 * never dispatched, no triggers are created, and `data-motion` stays off the
 * root element — the CSS resting state is the finished state.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

let lenis: Lenis | null = null;
let tick: ((time: number) => void) | null = null;
let pluginRegistered = false;

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

/** Kill every trigger, detach the ticker, destroy Lenis, unset the flag. */
function teardown(): void {
  for (const trigger of ScrollTrigger.getAll()) {
    trigger.kill();
  }

  if (tick) {
    gsap.ticker.remove(tick);
    tick = null;
  }

  if (lenis) {
    lenis.destroy();
    lenis = null;
  }

  document.documentElement.removeAttribute('data-motion');
}

export function init(): void {
  // Always clear first. On a ClientRouter navigation this disposes of triggers
  // bound to DOM that no longer exists, which is what keeps re-init from
  // stacking duplicates.
  teardown();

  if (prefersReducedMotion()) {
    return;
  }

  if (!pluginRegistered) {
    gsap.registerPlugin(ScrollTrigger);
    pluginRegistered = true;
  }

  // Lenis drives from gsap.ticker rather than its own rAF loop, so scroll
  // interpolation and tween playback share one clock.
  lenis = new Lenis({ autoRaf: false });

  tick = (time: number): void => {
    // gsap.ticker reports seconds; Lenis.raf expects milliseconds.
    lenis?.raf(time * 1000);
  };

  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  lenis.on('scroll', () => {
    ScrollTrigger.update();
  });

  document.documentElement.setAttribute('data-motion', 'on');

  // Components build their triggers synchronously in response to this.
  document.dispatchEvent(new CustomEvent('motion:ready'));

  ScrollTrigger.refresh();

  // A self-hosted variable font swapping in changes measured positions, so
  // recompute once it has settled.
  if (document.fonts) {
    void document.fonts.ready.then(() => {
      ScrollTrigger.refresh();
    });
  }
}
