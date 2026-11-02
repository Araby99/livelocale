// @vitest-environment node
import * as fs from 'node:fs';
import { contrastRatio } from '../../../site/src/lib/contrast';
const css = fs.readFileSync('site/src/styles/tokens.css', 'utf8');
const token = (name: string) =>
  new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)![1].toUpperCase();

it('defines the spec palette', () =>
  expect(
    [
      'paper',
      'ink',
      'coral',
      'coral-shadow',
      'muted',
      'line',
      'espresso',
      'cream',
      'coral-dark',
    ].map(token)
  ).toEqual([
    '#FFF8F0',
    '#1D1712',
    '#FF6B4A',
    '#C2472C',
    '#6B5B4D',
    '#E9DCCD',
    '#1C1714',
    '#F6EEE6',
    '#FF7A5C',
  ]));
it.each([
  ['ink', 'paper'],
  ['muted', 'paper'],
  ['ink', 'coral'],
  ['cream', 'espresso'],
  ['coral-dark', 'espresso'],
])('%s on %s meets AA', (fg, bg) =>
  expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
);
it('keeps the untranslated outline (coral shadow) at 3:1 on paper, which coral alone misses', () => {
  expect(contrastRatio(token('coral-shadow'), token('paper'))).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(token('coral'), token('paper'))).toBeLessThan(3);
});
it('confirms white on coral fails, so coral buttons use ink', () =>
  expect(contrastRatio('#FFFFFF', token('coral'))).toBeLessThan(4.5));
it('lists the Latin face before the Arabic face', () => {
  expect(css).toContain("--font-heading: 'Bricolage Grotesque', 'Readex Pro'");
  expect(css).toContain("--font-body: Inter, 'IBM Plex Sans Arabic'");
});
