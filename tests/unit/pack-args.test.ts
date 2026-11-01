// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  BUILD_USAGE,
  PACK_USAGE,
  checkBuildArgs,
  checkPackArgs,
  parseShareArgs,
} from '../../src/server/pack.js';
import { PackError } from '../../src/server/pack-error.js';

describe('parseShareArgs', () => {
  it('parses pack options', () =>
    expect(
      parseShareArgs([
        'build',
        '--locales',
        'src/locales',
        '--source',
        'en',
        '--base',
        '/repo/',
        '--expose-repo',
        '--no-inject',
      ])
    ).toEqual({
      positional: ['build'],
      dir: '.',
      locales: 'src/locales',
      source: 'en',
      base: '/repo/',
      out: undefined,
      exposeRepo: true,
      inject: false,
      preview: false,
      command: [],
    }));

  it('keeps everything after -- verbatim', () =>
    expect(parseShareArgs(['--preview', '--', 'next', 'build', '--debug'])).toMatchObject({
      preview: true,
      command: ['next', 'build', '--debug'],
    }));

  it('rejects unknown options and missing values', () => {
    expect(() => parseShareArgs(['--bogus'])).toThrow('Unknown option "--bogus".');
    expect(() => parseShareArgs(['--locales'])).toThrow('--locales needs a value.');
  });

  it('throws a USAGE PackError for argument errors', () => {
    let caught: unknown;
    try {
      parseShareArgs(['--dir', '--out']);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PackError);
    expect((caught as PackError).code).toBe('USAGE');
    expect((caught as PackError).message).toBe('--dir needs a value.');
  });

  it('takes a value that starts with a single dash', () =>
    expect(parseShareArgs(['dist', '--base', '-x'])).toMatchObject({
      positional: ['dist'],
      base: '-x',
    }));

  it('reads --dir and --out', () =>
    expect(parseShareArgs(['--dir', 'app', '--out', 'dist'])).toMatchObject({
      positional: [],
      dir: 'app',
      out: 'dist',
    }));
});

/** The message of the USAGE PackError that `fn` throws. */
function usageError(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PackError);
    expect((error as PackError).code).toBe('USAGE');
    return (error as PackError).message;
  }
  throw new Error('no error thrown');
}

describe('checkPackArgs', () => {
  it.each([
    [[], 'Missing <outDir>: pass the built site folder, for example dist.'],
    [['dist', 'extra'], 'Unexpected argument "extra": pack takes one <outDir>.'],
    [['dist', '--out', 'x'], '--out is not a pack option: pass the built site folder as <outDir>.'],
    [
      ['dist', '--preview'],
      '--preview is not a pack option: use livelocale build --preview -- <your build command>.',
    ],
    [
      ['dist', '--', 'vite', 'build'],
      'pack does not run a build command: use livelocale build -- <your build command>.',
    ],
  ])('names the wrong argument in %j', (argv, problem) =>
    expect(usageError(() => checkPackArgs(parseShareArgs(argv)))).toBe(`${problem}\n${PACK_USAGE}`)
  );

  it('accepts one <outDir>', () =>
    expect(() => checkPackArgs(parseShareArgs(['dist', '--no-inject']))).not.toThrow());
});

describe('checkBuildArgs', () => {
  it.each([
    [['foo', '--', 'vite', 'build'], 'Unexpected argument "foo": put the build command after --.'],
    [
      ['--no-inject', '--', 'vite', 'build'],
      '--no-inject is not a build option: livelocale build links flag.js itself (never on Next.js).',
    ],
  ])('names the wrong argument in %j', (argv, problem) =>
    expect(usageError(() => checkBuildArgs(parseShareArgs(argv)))).toBe(
      `${problem}\n${BUILD_USAGE}`
    )
  );

  it('accepts options and a build command', () =>
    expect(() =>
      checkBuildArgs(parseShareArgs(['--preview', '--out', 'dist', '--', 'vite', 'build']))
    ).not.toThrow());
});
