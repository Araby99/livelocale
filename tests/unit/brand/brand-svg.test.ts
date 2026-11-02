// @vitest-environment node
import * as fs from 'node:fs';
import {
  MASTER_MARK,
  markSvg,
  smallMarkSvg,
  faviconSvg,
} from '../../../site/scripts/brand/marks.mjs';
import { brandSvgs } from '../../../site/scripts/brand/build-svgs.mjs';
import {
  LETTER_SPACING_EM,
  WORDMARK_FONT,
  wordmarkPath,
} from '../../../site/scripts/brand/wordmark.mjs';

const SPEC = fs.readFileSync(
  'docs/superpowers/specs/2026-11-01-brand-and-landing-design.md',
  'utf8'
);

it('keeps the master mark identical to the spec', () => {
  const fromSpec = /```svg\n([\s\S]*?)\n```/.exec(SPEC)![1];
  expect(MASTER_MARK).toBe(fromSpec);
  expect(markSvg('light')).toBe(MASTER_MARK);
});

it('swaps only the line colour on dark', () => {
  const dark = markSvg('dark');
  expect(dark).toContain('fill="#E8E4D9"');
  expect(dark).toContain('fill="#FFB224"');
  expect(dark).toContain('fill="#8A5600"');
  expect(dark).not.toMatch(/#15171B|#1D1712|#F6EEE6|#FF7A5C|#9E3A24/);
  expect(dark.replace(/#[0-9A-F]{6}/g, '')).toBe(MASTER_MARK.replace(/#[0-9A-F]{6}/g, ''));
});

it('drops the hairline and the shadow for small sizes', () => {
  for (const theme of ['light', 'dark'] as const) {
    const small = smallMarkSvg(theme);
    expect(small).not.toContain('height="2"');
    expect(small).not.toContain('#8A5600');
    expect(small.match(/<rect /g)).toHaveLength(6); // five word bars + the patch
  }
  expect(smallMarkSvg('dark')).toContain('fill="#E8E4D9"');
});

it('draws the favicon as the dark small mark on Night', () => {
  const favicon = faviconSvg();
  expect(favicon).toMatch(
    /^<svg viewBox="0 0 64 64"[^>]*>\s*<rect width="64" height="64" rx="12" fill="#0C0D0F"\/>/
  );
  expect(favicon).toContain('fill="#E8E4D9"');
  expect(favicon).toContain('fill="#FFB224"');
  for (const banned of ['@media', '<style', '#8A5600', 'height="2"']) {
    expect(favicon).not.toContain(banned);
  }
  expect(favicon.match(/<rect /g)).toHaveLength(7); // the Night square + the small mark
});

it('draws the wordmark as outlines, never as text or external references', async () => {
  const svgs = await brandSvgs();
  for (const name of ['logo.svg', 'logo-dark.svg']) {
    expect(svgs[name]).toMatch(/^<svg viewBox="0 0 \d+(\.\d+)? 64"/);
    expect(svgs[name]).not.toMatch(/<text|<image|href=|@font-face|url\(/);
    expect(svgs[name].match(/<path /g)).toHaveLength(1);
  }
  expect(svgs['logo.svg']).toContain('fill="#15171B"');
  expect(svgs['logo-dark.svg']).toContain('fill="#E8E4D9"');
});

it('sets the wordmark in Martian Mono 500 at −0.02em, 32 units tall', async () => {
  expect(WORDMARK_FONT).toBe('@fontsource/martian-mono/files/martian-mono-latin-500-normal.woff');
  expect(LETTER_SPACING_EM).toBe(-0.02);
  expect((await wordmarkPath()).height).toBeCloseTo(32, 1);
});

it('has the committed SVGs up to date', async () => {
  for (const [name, content] of Object.entries(await brandSvgs())) {
    expect(fs.readFileSync(`brand/${name}`, 'utf8'), name).toBe(content);
  }
});
