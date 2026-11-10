// @vitest-environment node
import * as fs from 'node:fs';
import { expect, it } from 'vitest';

const md = fs.readFileSync('site/docs/reference/stability.md', 'utf8');
const row = (name: string) => md.split(/\r?\n/).find((l) => l.startsWith(`| ${name} `)) ?? '';

it('says next-intl is tested against its real translator, and how far that goes', () => {
  // tests/unit/wrap-use-intl.test.ts runs the wrapper on use-intl's createTranslator, which is
  // next-intl's t; there is still no next-intl app in CI.
  const nextIntl = row('next-intl');
  expect(nextIntl).not.toContain('not run in CI');
  expect(nextIntl).toContain('use-intl');
  expect(nextIntl).toMatch(/unit tests/);
  expect(nextIntl).toMatch(/no next-intl app/i);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    devDependencies: Record<string, string>;
  };
  expect(pkg.devDependencies['use-intl']).toBeDefined();
});
