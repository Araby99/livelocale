// @vitest-environment node
import * as fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  description: string;
  keywords: string[];
};

it('describes the package as a layer on next-intl and react-i18next, in npm length', () => {
  expect(pkg.description).toContain('next-intl');
  expect(pkg.description).toContain('react-i18next');
  expect(pkg.description.length).toBeLessThanOrEqual(200);
  expect(pkg.description).not.toMatch(/(?<!not )an i18n library/i);
});

it('lists both libraries in the npm keywords', () => {
  expect(pkg.keywords).toEqual(expect.arrayContaining(['next-intl', 'react-i18next']));
});
