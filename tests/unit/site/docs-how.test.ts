// @vitest-environment node
import * as fs from 'node:fs';

const HOW = 'site/docs/how-it-works';

function page(name: string): string {
  return fs.readFileSync(`${HOW}/${name}.md`, 'utf8');
}

it('lists the deployed platforms the guard detects, as the code does', () => {
  const source = fs.readFileSync('src/core/env.ts', 'utf8');
  const guard = /export function detectDeployedPlatform\(\)[\s\S]*?\n\}/.exec(source)![0];
  const platforms = [...guard.matchAll(/return\s+['`]([^'` (]+)/g)].map((m) => m[1]!);
  expect(platforms).toEqual([
    'Vercel',
    'Netlify',
    'Kubernetes',
    'Render',
    'Fly.io',
    'Railway',
    'Heroku',
  ]);
  const md = page('safety-switches');
  expect(platforms.filter((name) => !md.includes(name))).toEqual([]);
  for (const value of ['LIVELOCALE=off', 'NEXT_PUBLIC_LIVELOCALE=off', 'LIVELOCALE=force']) {
    expect(md).toContain(value);
  }
});

it('names the three zero-width characters the watermark uses', () => {
  const md = page('watermarking');
  for (const code of ['U+200B', 'U+200C', 'U+200D']) expect(md).toContain(code);
});

it('keeps the honest risks honest', () => {
  const md = page('risks-and-limits');
  expect(md).toContain('Desktop only');
  expect(md).toContain('public');
});
