// Which version of the hero a visitor gets. Phones and tablets have no Alt key to hold, so a
// device whose main pointer is coarse and cannot hover gets tap-the-typo instead of Alt+Click.

export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

/** Whether the device should get the touch version; pass `window.matchMedia` (bound). */
export function prefersTouch(matchMedia: (q: string) => { matches: boolean }): boolean {
  return matchMedia(TOUCH_QUERY).matches;
}
