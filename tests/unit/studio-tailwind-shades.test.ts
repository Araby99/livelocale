// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { studioFiles } from './helpers/studio-files.js';

/** Tailwind's default palette steps; any other step generates no CSS rule. */
const SHADES = new Set([
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
]);
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_CLASS = new RegExp(String.raw`\b[a-z-]+-(?:${PALETTE})-(\d+)\b`, 'g');

it('uses only Tailwind colour shades that exist', () => {
  const unknown = studioFiles('src/studio').flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(COLOR_CLASS)]
      .filter((m) => !SHADES.has(m[1]!))
      .map((m) => `${file}: ${m[0]}`)
  );
  expect(unknown).toEqual([]);
});
