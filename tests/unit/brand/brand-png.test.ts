// @vitest-environment node
import * as fs from 'node:fs';
import { PNG_TARGETS } from '../../../site/scripts/brand/render-pngs.mjs';
import { pngSize } from '../../../site/scripts/brand/png-size.mjs';

it('reads the size from the PNG header and rejects other files', () => {
  expect(pngSize(fs.readFileSync('brand/favicon-32.png'))).toEqual({ width: 32, height: 32 });
  expect(() => pngSize(new TextEncoder().encode('<svg/>'))).toThrow('Not a PNG');
});

it.each([
  ['favicon-16.png', 16, 16],
  ['favicon-32.png', 32, 32],
  ['apple-touch-icon.png', 180, 180],
  ['avatar-512.png', 512, 512],
  ['og-image.png', 1200, 630],
])('ships %s at %ix%i', (file, width, height) => {
  expect(PNG_TARGETS).toContainEqual({ file, width, height });
  expect(pngSize(fs.readFileSync(`brand/${file}`))).toEqual({ width, height });
});

it('ships all ten deliverables and uses the logo in the README header', () => {
  for (const f of [
    'logo.svg',
    'logo-dark.svg',
    'mark.svg',
    'mark-dark.svg',
    'favicon.svg',
    'favicon-16.png',
    'favicon-32.png',
    'apple-touch-icon.png',
    'og-image.png',
    'avatar-512.png',
  ])
    expect(fs.existsSync(`brand/${f}`), f).toBe(true);
  const head = fs.readFileSync('README.md', 'utf8').slice(0, 800);
  expect(head).toContain(
    '<source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">'
  );
  expect(head).toContain('<img src="brand/logo.svg" alt="livelocale" height="64">');
});
