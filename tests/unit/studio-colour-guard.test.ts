// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { studioFiles } from './helpers/studio-files';
import { TOKENS } from './helpers/studio-tokens';

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

/** Palette classes, arbitrary colour classes, hex literals and colour functions. */
const FIXED_COLOUR = new RegExp(
  [
    String.raw`\b[a-z-]+-(?:${PALETTE})-\d{2,3}\b`,
    String.raw`-\[#[0-9a-fA-F]{3,8}\]`,
    String.raw`#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b`,
    String.raw`\b(?:rgba?|hsla?|oklch)\(`,
  ].join('|'),
  'g'
);

/** Every fixed colour in `source`, in source order. */
function fixedColours(source: string): string[] {
  return [...source.matchAll(FIXED_COLOUR)].map((m) => m[0]);
}

/** Colour names a colour utility may use: the brand tokens and the CSS keywords. */
const KNOWN_COLOURS = new Set<string>([
  ...Object.keys(TOKENS),
  'transparent',
  'current',
  'inherit',
]);

/** Suffixes of the matched utilities that are not colours (sizes, alignment, styles, …). */
const NON_COLOUR = new Set(
  (
    '2xs xs sm md base lg xl 2xl 3xl 4xl inner left center right start end justify wrap nowrap ' +
    'balance pretty ellipsis clip 0 1 2 4 8 t r b l x y s e solid dashed dotted double none ' +
    'hidden collapse separate inset auto clip-text linear-to-r linear-to-tr fixed local scroll ' +
    'cover contain center no-repeat'
  ).split(' ')
);

const COLOUR_UTILITY =
  /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring|divide|from|to|via|shadow|placeholder|outline|fill|stroke|caret|accent|decoration)-([a-z][\w-]*?)(?:\/\d+)?(?![\w-])/g;

/** The one allowed fixed fill: the preview iframe's white page background. */
const IFRAME_TAG = /<[a-zA-Z][^>]*\bid="app-preview-iframe"[^>]*>/g;

/** Every colour utility in `source` whose colour is neither a brand token nor a keyword. */
function unknownColourNames(source: string): string[] {
  const exempt: [number, number][] = [...source.matchAll(IFRAME_TAG)].map((m) => [
    m.index,
    m.index + m[0].length,
  ]);
  return [...source.matchAll(COLOUR_UTILITY)]
    .filter((m) => {
      const name = m[1]!;
      if (KNOWN_COLOURS.has(name) || NON_COLOUR.has(name)) return false;
      if (name.startsWith('offset-') || name.startsWith('opacity-')) return false;
      const inIframe = exempt.some(([start, end]) => m.index >= start && m.index < end);
      return !(inIframe && m[0].endsWith('bg-white'));
    })
    .map((m) => m[0]);
}

it('uses brand tokens instead of fixed colours anywhere in the Studio', () => {
  expect(
    fixedColours(
      '<p className="bg-slate-900 text-[#fff] hover:bg-raised" style={{ color: "#ff00aa" }}>'
    )
  ).toEqual(['bg-slate-900', '-[#fff]', '#ff00aa']);
  const fixed = studioFiles('src/studio').flatMap((f) =>
    fixedColours(readFileSync(f, 'utf8')).map((m) => `${f}: ${m}`)
  );
  expect(fixed).toEqual([]);
});

it('names only known colours in colour utilities anywhere in the Studio', () => {
  expect(
    unknownColourNames(
      '<p className="text-fg-mutd bg-surfce border-line text-xs ring-2 shadow-md shadow-inner fill-accent text-white">'
    )
  ).toEqual(['text-fg-mutd', 'bg-surfce', 'text-white']);
  expect(unknownColourNames('<iframe id="app-preview-iframe" className="bg-white" />')).toEqual([]);
  const found = studioFiles('src/studio').flatMap((f) =>
    unknownColourNames(readFileSync(f, 'utf8')).map((c) => `${f}: ${c}`)
  );
  expect(found).toEqual([]);
});

it('never puts white text on a patch fill', () => {
  const both = studioFiles('src/studio').flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/["'`]([^"'`]*)["'`]/g)]
      .filter(
        (m) =>
          /(?<![\w-])bg-accent(?![\w-])/.test(m[1]!) && /(?<![\w-])text-white(?![\w-])/.test(m[1]!)
      )
      .map((m) => `${f}: ${m[1]}`)
  );
  expect(both).toEqual([]);
});

it('resets the default palette before the brand colours are mapped', () => {
  const css = readFileSync('src/studio/index.css', 'utf8');
  expect(css).toMatch(
    /@theme\s*\{\s*--color-\*:\s*initial;\s*--color-white:\s*#fff;\s*--color-black:\s*#000;/
  );
  expect(css.indexOf('--color-*: initial')).toBeLessThan(css.indexOf('@theme inline'));
});

it('draws red only as a dashed outline', () => {
  const solid = studioFiles('src/studio').flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/["'`]([^"'`]*)["'`]/g)]
      .filter(
        (m) =>
          /(?<![\w-])(?:[\w-]+:)*border-danger-line(?![\w-])/.test(m[1]!) &&
          !/(?<![\w-])border-dashed(?![\w-])/.test(m[1]!)
      )
      .map((m) => `${f}: ${m[1]}`)
  );
  expect(solid).toEqual([]);
});

it('keeps amber off decoration', () =>
  expect(
    readFileSync('src/studio/features/dashboard/components/IframeViewer.tsx', 'utf8')
  ).not.toMatch(/rounded-full bg-(?:danger|warning|success)-fg/));

const literals = (f: string) =>
  [...readFileSync(f, 'utf8').matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]!);
const has = (s: string, cls: string) =>
  new RegExp(`(?<![\\w-])(?:[\\w-]+:)*${cls.replace(/[[\]]/g, '\\$&')}(?![\\w-])`).test(s);

it('never fills with red', () =>
  expect(
    studioFiles('src/studio').flatMap((f) =>
      literals(f)
        .filter((s) => has(s, 'bg-danger-fg') || has(s, 'bg-danger-line'))
        .map((s) => `${f}: ${s}`)
    )
  ).toEqual([]));

it('raises by tone, never by shadow or blur', () =>
  expect(
    studioFiles('src/studio').flatMap((f) =>
      literals(f)
        .filter((s) =>
          /(?<![\w-])(?:[\w-]+:)*(?:shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner))?|backdrop-blur(?:-[\w[\]]+)?)(?![\w-])/.test(
            s
          )
        )
        .map((s) => `${f}: ${s}`)
    )
  ).toEqual([]));

// The LocaleRow confirm button is an icon with an aria-label, so it has no text to prefix.
const GLYPH_EXEMPT = ['p-1 text-success-fg hover:text-success-fg transition duration-150'];
it('gives every success, warning and info message its glyph', () => {
  const missing = studioFiles('src/studio').flatMap((f) =>
    literals(f)
      .filter(
        (s) =>
          (has(s, 'text-success-fg') && !has(s, 'glyph-done') && !GLYPH_EXEMPT.includes(s)) ||
          (has(s, 'text-warning-fg') && !has(s, 'glyph-warn')) ||
          (has(s, 'text-info-fg') && has(s, 'bg-info-bg') && !has(s, 'glyph-info'))
      )
      .map((s) => `${f}: ${s}`)
  );
  expect(missing).toEqual([]);
  const css = readFileSync('src/studio/index.css', 'utf8');
  for (const [name, glyph] of [
    ['done', '✓'],
    ['warn', '!'],
    ['info', 'ⓘ'],
  ]) {
    expect(css).toContain(`@utility glyph-${name}`);
    expect(css).toContain(`content: '${glyph}\\00a0' / '';`);
  }
});
