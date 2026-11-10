// @vitest-environment node
import * as fs from 'node:fs';

// Every import path in package.json is public API (stability.md), so the Configuration page and
// the stability page list each one. `livelocale/astro/middleware` is loaded by the integration
// and stays internal; `.` and `./package.json` are not imports people write.
const INTERNAL = new Set(['.', './package.json', './astro/middleware']);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  exports: Record<string, unknown>;
};
const PUBLIC = Object.keys(pkg.exports)
  .filter((path) => !INTERNAL.has(path))
  .map((path) => `livelocale/${path.slice(2)}`);

it.each(PUBLIC)('the Configuration page has a row for %s', (entry) => {
  const md = fs.readFileSync('site/docs/reference/configuration.md', 'utf8');
  expect(md).toMatch(new RegExp(`^\\| \`${entry.replace('/', '\\/')}\` +\\|`, 'm'));
});

it.each(PUBLIC)('the stability page covers %s', (entry) => {
  const md = fs.readFileSync('site/docs/reference/stability.md', 'utf8');
  const imports = md.split('\n').find((line) => line.startsWith('| Imports')) ?? '';
  expect(imports).toContain(`\`${entry}\``);
});

it('says where the wrappers can be imported from, livelocale/wrap first', () => {
  const md = fs.readFileSync('site/docs/reference/configuration.md', 'utf8');
  const section = md.split('\n## `wrapTranslationEngine` and `wrapNextIntl`\n')[1] ?? '';
  expect(section).toMatch(/exported from `livelocale\/wrap`/);
  expect(section).toMatch(/Server Component/);
});
