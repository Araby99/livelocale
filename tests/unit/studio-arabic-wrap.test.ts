// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { textFor } from '../../src/studio/i18n/catalogue.js';
import { studioFiles } from './helpers/studio-files';

// The add-locale input is dir="ltr" for typed codes, so Arabic words in its placeholder would be laid
// out left to right and read backwards.
it('keeps Arabic letters out of the placeholder of the left-to-right add-locale input', () =>
  expect(textFor('ar')('locales.add_placeholder')).not.toMatch(/\p{Script=Arabic}/u));

// break-all splits a word between any two letters, which breaks Arabic joining mid-word, and
// font-mono has no Arabic glyphs. Error and result messages are translated copy.
it('wraps translated error and result messages by word, in the text font', () => {
  const hits = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, at: `${f}:${i + 1}` }))
      .filter(
        ({ line }) =>
          /className=.*(?:text-danger-fg|text-success-fg)/.test(line) &&
          /(?<![\w-])(?:font-mono|break-all)(?![\w-])/.test(line)
      )
      .map(({ at }) => at)
  );
  expect(hits).toEqual([]);
});
