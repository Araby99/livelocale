// The patch mark, built from the master SVG in the brand spec (§2.2). The master is the source of
// truth for every size: dark only swaps the three colours, small sizes only drop elements.

export const MASTER_MARK = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <g fill="#1D1712">
    <rect x="6" y="11" width="20" height="8" rx="4"/><rect x="29" y="11" width="29" height="8" rx="4"/>
    <rect x="6" y="28" width="14" height="8" rx="4"/>
    <rect x="25" y="31" width="29" height="2" rx="1" opacity=".5"/>
    <rect x="6" y="45" width="23" height="8" rx="4"/><rect x="32" y="45" width="12" height="8" rx="4"/>
  </g>
  <g transform="rotate(-7 39 32)">
    <rect x="24.5" y="24.5" width="30" height="15" rx="4.5" fill="#C2472C"/>
    <rect x="23" y="23" width="30" height="15" rx="4.5" fill="#FF6B4A"/>
  </g>
</svg>`;

export const COLORS = {
  light: { ink: '#1D1712', coral: '#FF6B4A', shadow: '#C2472C' },
  dark: { ink: '#F6EEE6', coral: '#FF7A5C', shadow: '#9E3A24' },
};

const HAIRLINE = '<rect x="25" y="31" width="29" height="2" rx="1" opacity=".5"/>';
const SHADOW = `<rect x="24.5" y="24.5" width="30" height="15" rx="4.5" fill="${COLORS.light.shadow}"/>`;

function withColors(svg, theme) {
  const from = COLORS.light;
  const to = COLORS[theme];
  return svg
    .replaceAll(`"${from.ink}"`, `"${to.ink}"`)
    .replaceAll(`"${from.coral}"`, `"${to.coral}"`)
    .replaceAll(`"${from.shadow}"`, `"${to.shadow}"`);
}

/** The full mark: identical to the master on light, the three colours swapped on dark. */
export function markSvg(theme) {
  return withColors(MASTER_MARK, theme);
}

/** The 16 px mark: the master without the hairline "old line" and the patch shadow. */
export function smallMarkSvg() {
  return MASTER_MARK.split('\n')
    .filter((line) => line.trim() !== HAIRLINE && line.trim() !== SHADOW)
    .join('\n');
}

/** The SVG favicon: the small mark, switching to the dark colours under a dark system setting. */
export function faviconSvg() {
  const { ink, coral } = COLORS.dark;
  const style = `  <style>@media (prefers-color-scheme: dark){.l{fill:${ink}}.p{fill:${coral}}}</style>`;
  const lines = smallMarkSvg()
    .replace(`<g fill="${COLORS.light.ink}">`, `<g class="l" fill="${COLORS.light.ink}">`)
    .replace(`fill="${COLORS.light.coral}"/>`, `class="p" fill="${COLORS.light.coral}"/>`)
    .split('\n');
  return [lines[0], style, ...lines.slice(1)].join('\n');
}

const MARK_SIZE = 64;
const WORDMARK_GAP = 18;

/**
 * The horizontal logo: the mark at x 0–64, an 18-unit gap, then the wordmark outlines in the
 * theme's ink. The wordmark path is already vertically centred on y 32 and starts at x 0.
 */
export function logoSvg(theme, wordmark) {
  const x = MARK_SIZE + WORDMARK_GAP;
  const width = Math.round((x + wordmark.width) * 100) / 100;
  const body = markSvg(theme).split('\n').slice(1, -1);
  return [
    `<svg viewBox="0 0 ${width} ${MARK_SIZE}" xmlns="http://www.w3.org/2000/svg">`,
    ...body,
    `  <path transform="translate(${x} 0)" fill="${COLORS[theme].ink}" d="${wordmark.d}"/>`,
    '</svg>',
  ].join('\n');
}
