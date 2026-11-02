// @vitest-environment node
// The repo's playgrounds are the noise benchmark for `check --hardcoded` (spec §10).
import { describe, it, expect } from 'vitest';
import { runCheck } from '../../src/codemod/check.js';

const hardcoded = async (dir: string) =>
  (await runCheck({ projectDir: dir, hardcoded: true })).issues
    .filter((i) => i.kind === 'hardcoded')
    .map(({ file, line, column, text }) => ({ file, line, column, text }));

const localeWarnings = async (dir: string) =>
  (await runCheck({ projectDir: dir, hardcoded: true })).issues
    .filter((i) => i.kind === 'untranslated' || i.kind === 'wrong-script')
    .map(({ kind, locale, key }) => `${kind} ${locale}:${key}`);

describe('check --hardcoded noise benchmark', () => {
  it('finds nothing in the translated Next.js playground', async () => {
    const report = await runCheck({ projectDir: 'playground', hardcoded: true });
    expect(report.setupProblems).toBeUndefined();
    expect(report.issues.filter((i) => i.kind === 'hardcoded')).toEqual([]);
  });

  it('finds exactly the two real hardcoded links in the Vite playground', async () =>
    expect(await hardcoded('playground-vite')).toEqual([
      { file: 'src/main.tsx', line: 40, column: 11, text: 'العربية' },
      { file: 'src/main.tsx', line: 43, column: 11, text: 'About' },
    ]));

  it.each(['playground', 'playground-vite'])(
    'raises no untranslated or wrong-script warning in %s',
    async (dir) => expect(await localeWarnings(dir)).toEqual([])
  );
});
