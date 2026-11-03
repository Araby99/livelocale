// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { checkExitCode, checkSummaryLines, parseCheckArgs } from '../../src/codemod/check-cli.js';
import { TYPESCRIPT_MISSING } from '../../src/codemod/hardcoded/load-typescript.js';

describe('parseCheckArgs', () => {
  it('keeps the 0.10.x defaults', () =>
    expect(parseCheckArgs([])).toEqual({
      dir: '.',
      unused: true,
      strict: false,
      json: false,
      hardcoded: false,
      allow: [],
    }));

  it('reads --hardcoded and repeatable --allow', () =>
    expect(
      parseCheckArgs([
        'app',
        '--hardcoded',
        '--allow',
        'GitHub',
        '--allow',
        'Made in Cairo',
        '--strict',
      ])
    ).toMatchObject({
      dir: 'app',
      hardcoded: true,
      allow: ['GitHub', 'Made in Cairo'],
      strict: true,
    }));

  it('rejects --allow without a word', () => {
    expect(() => parseCheckArgs(['--allow'])).toThrow('--allow needs a word.');
    expect(() => parseCheckArgs(['--allow', '--json'])).toThrow('--allow needs a word.');
  });
});

describe('checkExitCode', () => {
  it('exits 2 on a setup problem, even with failures', () => {
    const base = { localesDir: '', sourceLocale: 'en', locales: ['en'], codeKeyCount: 0 };
    const fail = { kind: 'hardcoded', level: 'fail', message: '' } as const;
    expect(checkExitCode({ ...base, issues: [] })).toBe(0);
    expect(checkExitCode({ ...base, issues: [{ ...fail, level: 'warn' }] })).toBe(0);
    expect(checkExitCode({ ...base, issues: [fail] })).toBe(1);
    expect(checkExitCode({ ...base, issues: [fail], setupProblems: [TYPESCRIPT_MISSING] })).toBe(2);
  });
});

describe('checkSummaryLines', () => {
  const base = { localesDir: '', sourceLocale: 'en', locales: ['en'], codeKeyCount: 0 };
  const fail = { kind: 'hardcoded', level: 'fail', message: '' } as const;
  const warn = { ...fail, level: 'warn' } as const;

  it('prints the success line only when every check ran', () => {
    expect(checkSummaryLines({ ...base, issues: [] })).toEqual(['✅ Translations look good.']);
    expect(checkSummaryLines({ ...base, issues: [warn] })).toEqual([
      '✅ No problems, 1 warning(s) worth a look.',
    ]);
  });

  it('never prints a success line next to a setup problem', () =>
    expect(checkSummaryLines({ ...base, issues: [], setupProblems: [TYPESCRIPT_MISSING] })).toEqual(
      [`❌ ${TYPESCRIPT_MISSING}`]
    ));

  it('prints the failure count, then the setup problem', () =>
    expect(
      checkSummaryLines({ ...base, issues: [fail, warn], setupProblems: [TYPESCRIPT_MISSING] })
    ).toEqual(['❌ 1 problem(s), 1 warning(s).', `❌ ${TYPESCRIPT_MISSING}`]));
});
