// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseShareArgs } from '../../src/server/pack.js';
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

  it('reads --dir and --out', () =>
    expect(parseShareArgs(['--dir', 'app', '--out', 'dist'])).toMatchObject({
      positional: [],
      dir: 'app',
      out: 'dist',
    }));
});
