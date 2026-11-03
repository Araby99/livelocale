// @vitest-environment node
import * as fs from 'node:fs';
import { MASTER_MARK } from '../../../site/scripts/brand/marks.mjs';

const html = fs.readFileSync('site/index.html', 'utf8');
const rects = (svg: string) =>
  [...svg.matchAll(/<rect\b([^>]*?)\/?>/g)].map((m) =>
    m[1]
      .replace(/\s*fill="[^"]*"/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

it('inlines the dark mark in the header and the Night theme colour', () => {
  for (const text of [
    'fill="#E8E4D9"',
    'fill="#FFB224"',
    'fill="#8A5600"',
    '<meta name="theme-color" content="#0C0D0F"',
    '<meta name="color-scheme" content="dark"',
  ])
    expect(html).toContain(text);
  expect(html).not.toMatch(/#1D1712|#FF6B4A|#C2472C|#FFF8F0/i);
});

it("keeps the header mark's geometry identical to the master", () => {
  const header = /<header[\s\S]*?<\/header>/.exec(html)![0];
  const svg = /<svg[\s\S]*?<\/svg>/.exec(header)![0];
  expect(rects(svg)).toEqual(rects(MASTER_MARK));
  expect(svg).toContain('transform="rotate(-7 39 32)"');
});

it('keeps the live demo (the Tidewell stage) off the withdrawn palette', () => {
  const stage = fs.readFileSync('site/stage/styles.css', 'utf8');
  expect(stage).not.toMatch(/#fff8f0|#1d1712|#ff6b4a|#c2472c/i);
});

it('carries the landing header mark byte for byte in the docs header', () => {
  const header = /<header[\s\S]*?<\/header>/.exec(html)![0];
  const landing = /<svg[\s\S]*?<\/svg>/.exec(header)![0];
  const brand = fs.readFileSync('site/docs/.vitepress/theme/SiteBrand.vue', 'utf8');
  expect(/<svg[\s\S]*?<\/svg>/.exec(brand)?.[0]).toBe(landing);
});
