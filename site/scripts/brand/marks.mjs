// The patch mark, built from the master SVG in the brand spec (§2.2). The master is the source of
// truth for every size: dark only swaps the line colour, small sizes only drop elements.

export const MASTER_MARK = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <g fill="#15171B">
    <rect x="6" y="11" width="20" height="8" rx="4"/><rect x="29" y="11" width="29" height="8" rx="4"/>
    <rect x="6" y="28" width="14" height="8" rx="4"/>
    <rect x="25" y="31" width="29" height="2" rx="1" opacity=".5"/>
    <rect x="6" y="45" width="23" height="8" rx="4"/><rect x="32" y="45" width="12" height="8" rx="4"/>
  </g>
  <g transform="rotate(-7 39 32)">
    <rect x="24.5" y="24.5" width="30" height="15" rx="4.5" fill="#8A5600"/>
    <rect x="23" y="23" width="30" height="15" rx="4.5" fill="#FFB224"/>
  </g>
</svg>`;

/** The page background the dark mark sits on in the favicon, the touch icon and the avatar. */
export const NIGHT = '#0C0D0F';

/** The mark's fills per theme (spec §2.2): only the lines differ between light and dark. */
export const COLORS = {
  light: { lines: '#15171B', patch: '#FFB224', shadow: '#8A5600' },
  dark: { lines: '#E8E4D9', patch: '#FFB224', shadow: '#8A5600' },
};

const HAIRLINE = '<rect x="25" y="31" width="29" height="2" rx="1" opacity=".5"/>';
const SHADOW = `<rect x="24.5" y="24.5" width="30" height="15" rx="4.5" fill="${COLORS.light.shadow}"/>`;

function withColors(svg, theme) {
  const from = COLORS.light;
  const to = COLORS[theme];
  return svg
    .replaceAll(`"${from.lines}"`, `"${to.lines}"`)
    .replaceAll(`"${from.patch}"`, `"${to.patch}"`)
    .replaceAll(`"${from.shadow}"`, `"${to.shadow}"`);
}

/** The full mark: identical to the master on light, the line colour swapped on dark. */
export function markSvg(theme) {
  return withColors(MASTER_MARK, theme);
}

// At 16 px one pixel is 4 units and the master's bars sit on quarter pixels, so they render
// blurred; the small mark snaps every edge to the 4-unit grid (same layout, 1 px between words).
const SNAP_TO_GRID = [
  ['x="6" y="11" width="20" height="8"', 'x="4" y="12" width="20" height="8"'],
  ['x="29" y="11" width="29" height="8"', 'x="28" y="12" width="28" height="8"'],
  ['x="6" y="28" width="14" height="8"', 'x="4" y="28" width="16" height="8"'],
  ['x="6" y="45" width="23" height="8"', 'x="4" y="44" width="24" height="8"'],
  ['x="32" y="45" width="12" height="8"', 'x="32" y="44" width="12" height="8"'],
  ['x="23" y="23" width="30" height="15" rx="4.5"', 'x="24" y="24" width="28" height="16" rx="4"'],
];

/**
 * The 16 px mark: the master without the hairline "old line" and the patch shadow, with its edges
 * snapped to the 16 px pixel grid, in the theme's colours.
 */
export function smallMarkSvg(theme = 'light') {
  const small = MASTER_MARK.split('\n')
    .filter((line) => line.trim() !== HAIRLINE && line.trim() !== SHADOW)
    .join('\n');
  return withColors(
    SNAP_TO_GRID.reduce((svg, [from, to]) => svg.replace(from, to), small),
    theme
  );
}

/** A 64-unit mark on a Night square with rounded corners (rx 12), drawn as its first child. */
export function onNight(svg) {
  const [open, ...rest] = svg.split('\n');
  return [open, `  <rect width="64" height="64" rx="12" fill="${NIGHT}"/>`, ...rest].join('\n');
}

/** The SVG favicon: the dark small mark on Night, the same under every colour scheme. */
export function faviconSvg() {
  return onNight(smallMarkSvg('dark'));
}

const MARK_SIZE = 64;
const WORDMARK_GAP = 18;

/**
 * The horizontal logo: the mark at x 0–64, an 18-unit gap, then the wordmark outlines in the
 * theme's line colour. The wordmark path is already vertically centred on y 32 and starts at x 0.
 */
export function logoSvg(theme, wordmark) {
  const x = MARK_SIZE + WORDMARK_GAP;
  const width = Math.round((x + wordmark.width) * 100) / 100;
  const body = markSvg(theme).split('\n').slice(1, -1);
  return [
    `<svg viewBox="0 0 ${width} ${MARK_SIZE}" xmlns="http://www.w3.org/2000/svg">`,
    ...body,
    `  <path transform="translate(${x} 0)" fill="${COLORS[theme].lines}" d="${wordmark.d}"/>`,
    '</svg>',
  ].join('\n');
}
