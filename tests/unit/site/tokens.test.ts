// @vitest-environment node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { contrastRatio } from '../../../site/src/lib/contrast';
const css = fs.readFileSync('site/src/styles/tokens.css', 'utf8');
const token = (name: string) =>
  new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)![1].toUpperCase();

it('defines the hunk palette', () =>
  expect(
    [
      'night',
      'surface',
      'raised',
      'rule',
      'edge',
      'paper',
      'comment',
      'ghost',
      'patch',
      'patch-hover',
      'patch-shadow',
      'wash',
      'hunk',
      'exit-1',
      'exit-0',
    ].map(token)
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
    '#FFC150',
    '#8A5600',
    '#2E2412',
    '#4FC3DC',
    '#FF5468',
    '#6FD69A',
  ]));

it('drops the withdrawn palette', () => {
  expect(css).not.toMatch(/--(ink|coral[\w-]*|muted|line|espresso|cream)\s*:/);
  expect(css).not.toMatch(
    /#fff8f0|#1d1712|#ff6b4a|#c2472c|#f6eee6|#ff7a5c|#9e3a24|#6b5b4d|#e9dccd|#1c1714/i
  );
  expect(css).not.toContain('--font-heading');
});

it.each([
  ['paper', 'night', 15.3],
  ['paper', 'surface', 13.98],
  ['paper', 'raised', 12.7],
  ['paper', 'wash', 12.0],
  ['comment', 'night', 5.49],
  ['comment', 'surface', 5.02],
  ['comment', 'raised', 4.56],
  ['patch', 'night', 10.78],
  ['patch', 'surface', 9.85],
  ['patch', 'raised', 8.94],
  ['patch', 'wash', 8.46],
  ['night', 'patch', 10.78],
  ['night', 'patch-hover', 12.03],
  ['hunk', 'night', 9.42],
  ['hunk', 'surface', 8.6],
  ['hunk', 'raised', 7.81],
  ['exit-1', 'night', 6.22],
  ['exit-1', 'surface', 5.68],
  ['exit-0', 'night', 10.89],
  ['exit-0', 'surface', 9.95],
])('%s on %s is %f:1, AA for text', (fg, bg, measured) => {
  const ratio = contrastRatio(token(fg), token(bg));
  expect(ratio).toBeCloseTo(measured, 1);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

it.each([
  ['edge', 'night', 3.87],
  ['edge', 'surface', 3.53],
  ['edge', 'raised', 3.21],
  ['ghost', 'night', 3.66],
  ['ghost', 'surface', 3.34],
])('%s on %s is %f:1, 3:1 for meaningful graphics and large text', (fg, bg, measured) => {
  const ratio = contrastRatio(token(fg), token(bg));
  expect(ratio).toBeCloseTo(measured, 1);
  expect(ratio).toBeGreaterThanOrEqual(3);
});

it('keeps Ghost below AA for body text, so it is only large text or history', () =>
  expect(contrastRatio(token('ghost'), token('night'))).toBeLessThan(4.5));

it('lists Martian Mono, IBM Plex Sans and IBM Plex Mono, Latin face first', () => {
  expect(css).toContain("--font-display: 'Martian Mono', 'IBM Plex Sans Arabic'");
  expect(css).toContain("--font-body: 'IBM Plex Sans', 'IBM Plex Sans Arabic'");
  expect(css).toContain("--font-code: 'IBM Plex Mono'");
  expect(css).toContain('color-scheme: dark');
});

it('uses only defined tokens in every site stylesheet', () => {
  const root = 'site/src';
  const files = (fs.readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(root, f).replaceAll('\\', '/'));
  const declared = (text: string) =>
    new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const tokens = declared(css);
  // Task 16's pile.css computes its card motion from its own locals. These are the only custom
  // properties a stylesheet other than tokens.css may declare, and only that file may use them.
  const fileLocals: Record<string, string[]> = {
    'site/src/pile/pile.css': ['--u', '--p', '--dx', '--dy', '--r'],
  };
  expect(files).toContain('site/src/styles/tokens.css');
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const allowed = new Set(fileLocals[file] ?? []);
    if (!file.endsWith('/tokens.css'))
      expect(
        [...declared(text)].filter((name) => !allowed.has(name)),
        file
      ).toEqual([]);
    const undefinedVars = [...text.matchAll(/var\((--[\w-]+)/g)]
      .map((m) => m[1])
      .filter((name) => !tokens.has(name) && !allowed.has(name) && name !== '--pile-progress');
    expect(undefinedVars, file).toEqual([]);
    if (!file.endsWith('/tokens.css'))
      expect(text, file).not.toMatch(/:\s*[^;{}]*#[0-9a-fA-F]{3,8}\b/);
    expect(text, file).not.toMatch(/background(-color)?\s*:[^;]*var\(--paper\)/);
  }
});
