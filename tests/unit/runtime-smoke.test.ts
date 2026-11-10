// @vitest-environment node
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { entryPoints } from '../../scripts/runtime-smoke.mjs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  exports: Record<string, unknown>;
};

it('smoke-tests every entry point the package exports, the Astro ones included', () => {
  // A hand-kept list missed ./astro and ./astro/middleware while the CI comment and the
  // stability page said "every entry point".
  const entries = entryPoints(pkg);
  expect(entries).toEqual(Object.keys(pkg.exports).filter((e) => e !== './package.json'));
  expect(entries).toContain('./astro');
  expect(entries).toContain('./astro/middleware');
});
