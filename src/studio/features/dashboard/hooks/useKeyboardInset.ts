import { useEffect, useState } from 'react';

/** The part of `window.visualViewport` the inset is worked out from. */
export interface VisualViewportBox {
  height: number;
  offsetTop: number;
}

/**
 * How many CSS px of the layout viewport the on-screen keyboard covers at the
 * bottom: the layout height minus what is still visible and how far the
 * visible part is scrolled down. 0 when no keyboard is open.
 */
export function keyboardInset(layoutHeight: number, vv: VisualViewportBox): number {
  return Math.max(0, layoutHeight - vv.height - vv.offsetTop);
}

const currentInset = (): number => {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;
  return keyboardInset(window.innerHeight, window.visualViewport);
};

const currentVisibleHeight = (): number => {
  if (typeof window === 'undefined') return 0;
  return window.visualViewport?.height ?? window.innerHeight;
};

/**
 * `read()` now, read again on every `visualViewport` resize and scroll and on
 * window resize. Without `visualViewport` only window resize is followed.
 */
function useViewportValue(read: () => number): number {
  const [value, setValue] = useState(read);

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setValue(read());
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [read]);

  return value;
}

/**
 * The keyboard inset now, following `visualViewport` resize and scroll, so a
 * sheet pinned to the bottom can sit directly above the phone keyboard. 0 in
 * browsers without `visualViewport`.
 */
export function useKeyboardInset(): number {
  return useViewportValue(currentInset);
}

/**
 * The CSS px height still visible above the keyboard, following
 * `visualViewport`, so a sheet can cap its height to fit. `innerHeight` in
 * browsers without `visualViewport`.
 */
export function useVisualViewportHeight(): number {
  return useViewportValue(currentVisibleHeight);
}
