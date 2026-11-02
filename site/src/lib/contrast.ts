// WCAG 2 contrast ratio between two #RRGGBB colours.

function channel(hex: string): number {
  const c = parseInt(hex, 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error(`Expected a #RRGGBB colour: ${color}`);
  const r = channel(color.slice(1, 3));
  const g = channel(color.slice(3, 5));
  const b = channel(color.slice(5, 7));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2 contrast ratio of fg on bg, from 1 to 21. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
