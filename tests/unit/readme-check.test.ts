// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

const readme = fs.readFileSync('README.md', 'utf-8');
// Prose is wrapped at 100 columns, so a sentence may span lines: match it with whitespace collapsed.
const prose = readme.replace(/\s+/g, ' ');

describe('README check --hardcoded and Studio sections', () => {
  it('has the section and a CI example', () => {
    expect(readme).toMatch(/^### Catch untranslated text before launch$/m);
    expect(readme).toContain('- run: npx livelocale check --hardcoded');
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
      expect(readme).toContain(s);
  });

  it('states the honest limits and the typescript requirement', () => {
    for (const s of [
      'Only JSX is checked',
      'text built at run time is not seen',
      'exits with code 2',
      'npm install -D typescript',
      'the line above the element',
    ])
      expect(prose).toContain(s);
  });

  it('describes the Studio language, theme and keyboard support', () => {
    for (const s of [
      'new LiveLocale look',
      'It speaks English and Arabic',
      'System, Light or Dark',
      'fonts ship inside the package',
      'visible focus ring',
    ])
      expect(prose).toContain(s);
  });
});
