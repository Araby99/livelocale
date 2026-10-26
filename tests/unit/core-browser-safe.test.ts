// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';

const BROWSER_SAFE = [
  'src/core/save-rules.ts',
  'src/core/change-link.ts',
  'src/core/json-path.ts',
  'src/core/placeholders.ts',
  'src/core/validate.ts',
];

it.each(BROWSER_SAFE)('%s stays browser-safe', (file) => {
  const text = readFileSync(file, 'utf8');
  expect(text).not.toMatch(
    /from ['"](node:)?(fs|path|zlib|buffer|crypto|module|os|child_process)['"]/
  );
  expect(text).not.toMatch(/\bBuffer\b|\bprocess\./);
  expect(text).not.toMatch(/\(\?<[=!]/); // regex lookbehind breaks Safari < 16.4 at parse time
});
