// @vitest-environment node
// What the README used to carry about check --hardcoded and the Studio, held by the docs pages that
// now own it, so the short go-live README (site/LAUNCH.md step 8) cannot turn these tests red.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const ciCheck = fs.readFileSync('site/docs/guides/ci-check.md', 'utf8');
const studio = fs.readFileSync('site/docs/guides/studio.md', 'utf8');
// Prose may be wrapped, so a sentence may span lines: match it with whitespace collapsed.
const flat = (md: string) => md.replace(/\s+/g, ' ');

describe('the check --hardcoded and Studio docs', () => {
  it('has the CI guide and a CI example', () => {
    expect(ciCheck).toMatch(/^# Catch untranslated text in CI$/m);
    expect(ciCheck).toContain('- run: npx livelocale check --hardcoded');
  });

  it('documents the opt-outs', () => {
    for (const s of [
      '// livelocale-ignore-next-line',
      '{/* livelocale-ignore-next-line */}',
      'livelocale-ignore-file',
      'livelocale.allow',
      'key:checkout.brand',
      '--allow <word>',
    ])
      expect(ciCheck).toContain(s);
  });

  it('states the honest limits and the typescript requirement', () => {
    for (const s of [
      'Only JSX and Astro templates are checked',
      'Text built at run time is not seen',
      'exits with code 2',
      'npm install -D typescript',
      'the line above the element',
    ])
      expect(flat(ciCheck)).toContain(s);
  });

  it('describes the English Studio, right-to-left sites, theme and keyboard support', () => {
    for (const s of [
      "The Studio's interface is in English",
      'flips under the Studio, while the Studio around it stays left to right',
      'System, Light and Dark',
      'fonts ship inside the package',
      'visible focus ring',
    ])
      expect(flat(studio)).toContain(s);
    expect(studio).not.toMatch(
      /speaks English and Arabic|Arabic Studio|Studio in Arabic|in Arabic and by keyboard/
    );
  });
});
