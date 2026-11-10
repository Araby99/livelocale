// @vitest-environment node
import fs from 'node:fs';
import { expect, it } from 'vitest';

const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8').replace(/\r\n/g, '\n');

it('gives the CI token read-only access', () => {
  // Without a block the token gets the repository default, which may be read and write. CI only
  // reads the repository.
  expect(ci).toMatch(/^permissions:\n {2}contents: read$/m);
  expect(ci).not.toMatch(/: write\b/);
});
