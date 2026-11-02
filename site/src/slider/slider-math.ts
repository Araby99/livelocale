// Arithmetic for the language divider. The value is the divider's position from the left
// edge in percent: English shows left of it, Arabic right of it.

export const SLIDER_START = 50;

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -5,
  ArrowDown: -5,
  ArrowRight: 5,
  ArrowUp: 5,
  PageDown: -25,
  PageUp: 25,
};

/** Keeps a position within 0–100, rounded to one decimal; NaN falls back to the start. */
export function clampPercent(n: number): number {
  if (Number.isNaN(n)) return SLIDER_START;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

/** The position a key moves the divider to, or null when the key does not move it. */
export function keyStep(value: number, key: string): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return 100;
  const step = KEY_STEPS[key];
  return step === undefined ? null : clampPercent(value + step);
}

/** The position under a pointer at `clientX` inside a box. */
export function percentFromPointer(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return SLIDER_START;
  return clampPercent(((clientX - rect.left) / rect.width) * 100);
}

/** What a screen reader announces: the share of the sample shown in Arabic. */
export function valueText(value: number): string {
  return `${100 - Math.round(value)}% Arabic`;
}
