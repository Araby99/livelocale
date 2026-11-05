import { useMediaQuery } from './useMediaQuery.js';

/** A touch-first device: taps edit through the Edit/Browse switch. */
export const TOUCH_QUERY = '(pointer: coarse)';

/** A touch device whose short screen side is below this many CSS px gets the phone layout. */
export const PHONE_MAX_SHORT_SIDE = 768;

/** The device's short screen side; the screen, not the window, so rotation keeps the layout. */
const shortSide = (): number =>
  typeof window !== 'undefined' && window.screen
    ? Math.min(window.screen.width, window.screen.height)
    : Infinity;

/**
 * Whether this is a touch-first device, and whether it is a phone. A desktop with a
 * mouse is neither, however narrow its window.
 */
export function useTouchDevice(): { isTouch: boolean; isPhone: boolean } {
  const isTouch = useMediaQuery(TOUCH_QUERY, false);
  return { isTouch, isPhone: isTouch && shortSide() < PHONE_MAX_SHORT_SIDE };
}
