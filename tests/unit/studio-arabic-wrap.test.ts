// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { studioFiles } from './helpers/studio-files';

// break-all splits a word between any two letters, which breaks Arabic joining mid-word, and
// font-mono has no Arabic glyphs. Error and result messages can quote the site's own Arabic content.
it('wraps error and result messages by word, in the text font', () => {
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
