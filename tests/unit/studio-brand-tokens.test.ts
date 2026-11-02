// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { TOKENS, cssDecls, themeInline } from './helpers/studio-tokens.js';
import { contrastRatio } from './helpers/contrast.js';

const css = readFileSync('src/studio/index.css', 'utf8');
const decls = { light: cssDecls(css, ':root'), dark: cssDecls(css, '.dark') };
const SURFACES = ['app', 'surface', 'raised', 'raised-hover'];
const TEXT = ['fg', 'fg-muted', 'accent-fg', 'danger-fg', 'warning-fg', 'success-fg', 'info-fg'];
const TINTS = ['accent-soft', 'danger-bg', 'warning-bg', 'success-bg', 'info-bg'];
const PAIRS = [
  ...TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg])),
  ...TINTS.map((bg) => ['fg', bg]),
  // Comment on Wash is below 4.5:1 in dark, so muted text inside a Wash row uses fg.
  ...['danger-bg', 'success-bg', 'info-bg'].map((bg) => ['fg-muted', bg]),
  ['accent-fg', 'accent-soft'],
  ['danger-fg', 'danger-bg'],
  ['warning-fg', 'warning-bg'],
  ['success-fg', 'success-bg'],
  ['info-fg', 'info-bg'],
  ['info-fg', 'accent-soft'], // a key in Hunk on the selected Wash row
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['on-warning', 'warning-solid'],
] as const;

it('defines every brand token for light and dark', () => {
  for (const [name, [light, dark]] of Object.entries(TOKENS)) {
    expect(decls.light.get(`--lc-${name}`), name).toBe(light);
    expect(decls.dark.get(`--lc-${name}`), name).toBe(dark);
  }
});
it('has 33 tokens', () => expect(Object.keys(TOKENS)).toHaveLength(33));
it('takes the named hunk colours verbatim', () => {
  const l = (n: string) => decls.light.get(`--lc-${n}`);
  const d = (n: string) => decls.dark.get(`--lc-${n}`);
  expect(
    [
      'app',
      'surface',
      'line',
      'line-strong',
      'fg',
      'fg-muted',
      'fg-faint',
      'accent',
      'accent-fg',
      'accent-soft',
      'accent-shadow',
      'logo-ink',
      'focus',
      'danger-fg',
      'success-fg',
      'info-fg',
    ].map(l)
  ).toEqual([
    '#F4F5F7',
    '#FFFFFF',
    '#D5D7DC',
    '#868B96',
    '#15171B',
    '#5E5B54',
    '#8A877F',
    '#FFB224',
    '#8F5B00',
    '#FFF1D6',
    '#8A5600',
    '#15171B',
    '#8F5B00',
    '#C8243A',
    '#00785F',
    '#00708A',
  ]);
  expect(
    [
      'app',
      'surface',
      'raised',
      'line',
      'line-strong',
      'fg',
      'fg-muted',
      'fg-faint',
      'accent',
      'accent-fg',
      'accent-soft',
      'accent-shadow',
      'logo-ink',
      'focus',
      'danger-fg',
      'success-fg',
      'info-fg',
    ].map(d)
  ).toEqual([
    '#0C0D0F',
    '#16181D',
    '#1E2127',
    '#2A2D33',
    '#6B6F7A',
    '#E8E4D9',
    '#8C887D',
    '#6E6B64',
    '#FFB224',
    '#FFB224',
    '#2E2412',
    '#8A5600',
    '#E8E4D9',
    '#FFB224',
    '#FF5468',
    '#6FD69A',
    '#4FC3DC',
  ]);
});
it('gives every colour one job', () => {
  for (const decl of [decls.light, decls.dark]) {
    const v = (n: string) => decl.get(`--lc-${n}`);
    expect(v('warning-fg')).toBe(v('accent-fg'));
    expect(v('warning-bg')).toBe(v('accent-soft'));
    expect(v('warning-solid')).toBe(v('accent'));
    expect(v('danger-line')).toBe(v('danger-fg'));
    expect(v('danger-bg')).toBe(v('raised'));
    expect(v('accent-line')).toBe(v('line'));
    expect(v('warning-line')).toBe(v('line'));
  }
  expect(['danger-solid', 'on-danger'].filter((n) => n in TOKENS)).toEqual([]);
});
it('maps every token into Tailwind with @theme inline', () => {
  for (const name of Object.keys(TOKENS))
    expect(themeInline(css)).toContain(`--color-${name}: var(--lc-${name});`);
});
it('drops the placeholder shadcn colours', () => {
  expect(css).not.toMatch(/hsl\(var\(--/);
  expect(css).not.toMatch(
    /--(?:primary|secondary|card|popover|muted|destructive|background|foreground|border|input|ring|accent)\b/
  );
  const colourNames = [...css.matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1]);
  expect(colourNames.filter((n) => !(n in TOKENS) && n !== 'white' && n !== 'black')).toEqual([]);
});
it('writes hex colours only in the theme blocks', () => {
  const outside = css
    .replace(/(?::root|\.dark)\s*\{[^}]*\}/g, '')
    .replace(/@theme\s*\{[^}]*\}/g, (b) =>
      b.replace(/--color-(?:white|black):\s*#[0-9a-fA-F]{3,8};/g, '')
    );
  expect(outside.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
});
it('orders the CSS so the palette reset never clears the brand colours', () => {
  expect(css.indexOf('@custom-variant dark (&:where(.dark, .dark *));')).toBeGreaterThan(-1);
  expect(css.search(/@theme\s*\{/)).toBeLessThan(css.indexOf('@theme inline'));
});
it('leaves no dead shadcn classes on the page body', () =>
  expect(readFileSync('src/studio/index.html', 'utf8')).not.toMatch(
    /bg-background|text-foreground/
  ));
it('tells the browser which scheme each theme is', () => {
  expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light;/);
  expect(css).toMatch(/\.dark\s*\{[^}]*color-scheme:\s*dark;/);
});
it('paints the page from the tokens', () =>
  expect(css).toMatch(
    /body\s*\{[^}]*background-color:\s*var\(--color-app\);[^}]*color:\s*var\(--color-fg\);/
  ));
describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  const c = (n: string) => decls[theme].get(`--lc-${n}`)!;
  it.each(PAIRS)('%s on %s reaches 4.5:1', (fg, bg) =>
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5)
  );
  it.each([
    ...['focus', 'line-strong'].flatMap((ui) => SURFACES.map((bg) => [ui, bg])),
    ...TINTS.map((bg) => ['focus', bg]), // the ring around the selected item and inside message boxes
    ...SURFACES.map((bg) => ['danger-line', bg]), // the dashed red outline carries meaning
    ['danger-line', 'danger-bg'],
  ])('%s on %s reaches 3:1', (ui, bg) =>
    expect(contrastRatio(c(ui), c(bg))).toBeGreaterThanOrEqual(3)
  );
  it('never puts white text on the patch', () => {
    expect(c('on-accent')).not.toBe('#FFFFFF');
    expect(c('on-warning')).not.toBe('#FFFFFF');
  });
});
it('computes WCAG ratios', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  expect(contrastRatio('#fff', '#FFFFFF')).toBeCloseTo(1, 5);
  expect(contrastRatio('#F4F5F7', '#15171B')).toBeCloseTo(16.45, 1);
  expect(contrastRatio('#0C0D0F', '#E8E4D9')).toBeCloseTo(15.3, 1);
  expect(() => contrastRatio('#15171B73', '#FFFFFF')).toThrow();
});
