// @vitest-environment node
import * as fs from 'node:fs';
import { expect, it } from 'vitest';

const md = fs.readFileSync('site/docs/start/vite.md', 'utf8');
const section =
  md.split(/^## Locale files, plurals and languages\r?$/m)[1]?.split(/^## /m)[0] ?? '';

it('answers what a react-i18next app asks after the five steps', () => {
  // A react-i18next adopter had to guess these from the configuration reference and init's output.
  expect(section, 'section missing').not.toBe('');
  expect(section).toContain('`locales/en/auth.json`'); // the folder-per-namespace layout
  expect(section).toMatch(/file name is the namespace/);
  expect(section).toContain("keyPrefix: 'auth'");
  expect(section).toContain('npx livelocale migrate');
  expect(section).toMatch(/--locales <path>/);
  expect(section).toContain('items_one');
  expect(section).toContain('../guides/studio.md#plural-forms');
  expect(section).toContain('?locale=');
  // It sits after the steps and before the closing links.
  expect(md.indexOf('## Locale files')).toBeGreaterThan(md.indexOf('## 5. '));
  expect(md.indexOf('## Locale files')).toBeLessThan(md.indexOf('## What next'));
});
