// src/hooks/useCountUp.ts
// Subtle count-up animation for numeric stats. Animates from 0 (or the
// previous value) to `value` using an eased ramp on rAF. Respects
// `prefers-reduced-motion`. Used by the Cost Center hero strip and tiles.

import { useEffect, useRef, useState } from 'react';

interface Options {
  /** Duration in ms. Default 700. */
  duration?: number;
  /** Cubic easing function `t \in [0,1] \to [0,1]`. Default emphasized-decelerate. */
  ease?: (t: number) => number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates a number from its previous render's value (or 0 on first mount)
 * to the new `value`. Returns the in-flight number.
 *
 * If the user has `prefers-reduced-motion: reduce`, returns `value` directly.
 */
export function useCountUp(value: number, opts: Options = {}): number {
  const { duration = 700, ease = easeOutCubic } = opts;
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0));
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }

    fromRef.current = display;
    startRef.current = null;

    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = ease(t);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // We intentionally only re-run when `value` changes — `display` is the
    // ramp's running output and would otherwise restart the animation every
    // frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return display;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
