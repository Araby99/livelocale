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

/**
 * The keyboard inset now, following `visualViewport` resize and scroll, so a
 * sheet pinned to the bottom can sit directly above the phone keyboard. 0 in
 * browsers without `visualViewport`.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(currentInset);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) {
      setInset(0);
      return;
    }
    const update = () => setInset(currentInset());
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return inset;
}
