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
  ...['fg', 'fg-muted'].flatMap((fg) => TINTS.map((bg) => [fg, bg])),
  ['accent-fg', 'accent-soft'],
  ['danger-fg', 'danger-bg'],
  ['warning-fg', 'warning-bg'],
  ['success-fg', 'success-bg'],
  ['info-fg', 'info-bg'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['on-danger', 'danger-solid'],
  ['on-warning', 'warning-solid'],
] as const;

it('defines every brand token for light and dark', () => {
  for (const [name, [light, dark]] of Object.entries(TOKENS)) {
    expect(decls.light.get(`--lc-${name}`), name).toBe(light);
    expect(decls.dark.get(`--lc-${name}`), name).toBe(dark);
  }
});
it('has 35 tokens', () => expect(Object.keys(TOKENS)).toHaveLength(35));
it('takes the named brand colours verbatim', () => {
  const l = (n: string) => decls.light.get(`--lc-${n}`);
  const d = (n: string) => decls.dark.get(`--lc-${n}`);
  expect(['app', 'fg', 'fg-muted', 'line', 'accent', 'accent-shadow'].map(l)).toEqual([
    '#FFF8F0',
    '#1D1712',
    '#6B5B4D',
    '#E9DCCD',
    '#FF6B4A',
    '#C2472C',
  ]);
  expect(['app', 'fg', 'accent', 'accent-shadow', 'logo-ink'].map(d)).toEqual([
    '#1C1714',
    '#F6EEE6',
    '#FF7A5C',
    '#9E3A24',
    '#F6EEE6',
  ]);
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
  ])('%s on %s reaches 3:1', (ui, bg) =>
    expect(contrastRatio(c(ui), c(bg))).toBeGreaterThanOrEqual(3)
  );
  it('never puts white text on coral', () => expect(c('on-accent')).not.toBe('#FFFFFF'));
});
it('computes WCAG ratios', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  expect(contrastRatio('#fff', '#FFFFFF')).toBeCloseTo(1, 5);
  expect(contrastRatio('#FFF8F0', '#1D1712')).toBeCloseTo(16.85, 1);
  expect(() => contrastRatio('#1D171273', '#FFFFFF')).toThrow();
});
