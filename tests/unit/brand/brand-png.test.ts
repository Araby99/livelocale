// @vitest-environment node
import * as fs from 'node:fs';
import { faviconSvg } from '../../../site/scripts/brand/marks.mjs';
import { PNG_TARGETS, pngSources } from '../../../site/scripts/brand/render-pngs.mjs';
import { pngSize, pngTopLeft } from '../../../site/scripts/brand/png-size.mjs';

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

it('renders the favicons and the touch icon from the dark mark on Night', () => {
  const sources = pngSources();
  expect(sources['favicon-16.png'].html).toContain(faviconSvg());
  expect(sources['favicon-16.png'].transparent).toBe(true);
  expect(sources['favicon-32.png'].html).toContain('fill="#0C0D0F"');
  expect(sources['favicon-32.png'].html).toContain('fill="#E8E4D9"');
  expect(sources['apple-touch-icon.png']).toMatchObject({ transparent: false });
  expect(sources['apple-touch-icon.png'].html).toContain('background:#0C0D0F');
  expect(sources['apple-touch-icon.png'].html).toContain('fill="#E8E4D9"');
});

it('paints the avatar, the touch icon and the og-image on Night', () => {
  for (const file of ['avatar-512.png', 'apple-touch-icon.png', 'og-image.png']) {
    expect(pngTopLeft(fs.readFileSync(`brand/${file}`)), file).toEqual([12, 13, 15]);
  }
});

it('reads the first pixel of a PNG', () => {
  expect(() => pngTopLeft(new TextEncoder().encode('<svg/>'))).toThrow('Not a PNG');
});
