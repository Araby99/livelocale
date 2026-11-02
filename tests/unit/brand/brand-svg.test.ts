// @vitest-environment node
import * as fs from 'node:fs';
import {
  MASTER_MARK,
  markSvg,
  smallMarkSvg,
  faviconSvg,
} from '../../../site/scripts/brand/marks.mjs';
import { brandSvgs } from '../../../site/scripts/brand/build-svgs.mjs';

const SPEC = fs.readFileSync(
  'docs/superpowers/specs/2026-11-01-brand-and-landing-design.md',
  'utf8'
);

it('keeps the master mark identical to the spec', () => {
  const fromSpec = /```svg\n([\s\S]*?)\n```/.exec(SPEC)![1];
  expect(MASTER_MARK).toBe(fromSpec);
  expect(markSvg('light')).toBe(MASTER_MARK);
});

it('swaps only the three colours on dark', () => {
  const dark = markSvg('dark');
  expect(dark).toContain('fill="#F6EEE6"');
  expect(dark).toContain('fill="#FF7A5C"');
  expect(dark).toContain('fill="#9E3A24"');
  expect(dark).not.toMatch(/#1D1712|#FF6B4A|#C2472C/);
  expect(dark.replace(/#[0-9A-F]{6}/g, '')).toBe(MASTER_MARK.replace(/#[0-9A-F]{6}/g, ''));
});

it('drops the hairline and the shadow for small sizes', () => {
  const small = smallMarkSvg();
  expect(small).not.toContain('height="2"');
  expect(small).not.toContain('#C2472C');
  expect(small.match(/<rect /g)).toHaveLength(6); // five word bars + the patch
});

it('switches the favicon to the dark colours under a dark system setting', () => {
  expect(faviconSvg()).toMatch(/@media \(prefers-color-scheme: dark\)[^}]*\.l\{fill:#F6EEE6\}/);
  expect(faviconSvg()).toMatch(/\.p\{fill:#FF7A5C\}/);
});

it('draws the wordmark as outlines, never as text or external references', async () => {
  const svgs = await brandSvgs();
  for (const name of ['logo.svg', 'logo-dark.svg']) {
    expect(svgs[name]).toMatch(/^<svg viewBox="0 0 \d+(\.\d+)? 64"/);
    expect(svgs[name]).not.toMatch(/<text|<image|href=|@font-face|url\(/);
    expect(svgs[name].match(/<path /g)).toHaveLength(1);
  }
  expect(svgs['logo.svg']).toContain('fill="#1D1712"');
  expect(svgs['logo-dark.svg']).toContain('fill="#F6EEE6"');
});

it('has the committed SVGs up to date', async () => {
  for (const [name, content] of Object.entries(await brandSvgs())) {
    expect(fs.readFileSync(`brand/${name}`, 'utf8'), name).toBe(content);
  }
});
