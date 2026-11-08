// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  findGlobalOption,
  parseCommandArgs,
  suggestOption,
  UsageError,
  type CommandSpec,
} from '../../src/codemod/cli-args.js';

const CHECK: CommandSpec = {
  command: 'check',
  values: ['--dir', '--locales', '--source'],
  repeatable: ['--allow'],
  flags: ['--no-unused', '--strict', '--hardcoded', '--json'],
  positionals: 1,
};

function usageMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(UsageError);
    return (err as Error).message;
  }
  throw new Error('expected a UsageError');
}

describe('parseCommandArgs', () => {
  it('reads values, repeatable values, flags and positionals', () => {
    const parsed = parseCommandArgs(CHECK, [
      'app',
      '--locales',
      'src/locales',
      '--allow',
      'GitHub',
      '--allow',
      'Made in Cairo',
      '--strict',
    ]);
    expect(parsed.values).toEqual({ '--locales': 'src/locales' });
    expect(parsed.lists).toEqual({ '--allow': ['GitHub', 'Made in Cairo'] });
    expect([...parsed.flags]).toEqual(['--strict']);
    expect(parsed.positionals).toEqual(['app']);
    expect(parsed.rest).toEqual([]);
  });

  it('keeps the last of a repeated value option', () =>
    expect(parseCommandArgs(CHECK, ['--dir', 'a', '--dir', 'b']).values['--dir']).toBe('b'));

  it('rejects an unknown flag and suggests the closest known one', () =>
    expect(usageMessage(() => parseCommandArgs(CHECK, ['--strictt']))).toBe(
      'Unknown option --strictt for livelocale check. Did you mean --strict?'
    ));

  it('rejects an unknown flag with no close match and points at --help', () =>
    expect(usageMessage(() => parseCommandArgs(CHECK, ['--bogus']))).toBe(
      'Unknown option --bogus for livelocale check. Run livelocale --help to see its options.'
    ));

  it('rejects unknown short flags', () =>
    expect(usageMessage(() => parseCommandArgs(CHECK, ['-x']))).toMatch(
      /^Unknown option -x for livelocale check\./
    ));

  it('explains --flag=value instead of calling the flag unknown', () =>
    expect(usageMessage(() => parseCommandArgs(CHECK, ['--dir=app']))).toBe(
      'Unknown option --dir=app for livelocale check. Put a space before the value: --dir app'
    ));

  it('rejects a value option without its value', () => {
    expect(usageMessage(() => parseCommandArgs(CHECK, ['--dir']))).toBe('--dir needs a value.');
    expect(usageMessage(() => parseCommandArgs(CHECK, ['--allow', '--json']))).toBe(
      '--allow needs a value.'
    );
  });

  it('never takes a global short option as a value', () => {
    expect(usageMessage(() => parseCommandArgs(CHECK, ['--source', '-v']))).toBe(
      '--source needs a value.'
    );
    expect(usageMessage(() => parseCommandArgs(CHECK, ['--locales', '-h']))).toBe(
      '--locales needs a value.'
    );
  });

  it('rejects more positionals than the command takes', () => {
    expect(usageMessage(() => parseCommandArgs(CHECK, ['a', 'b']))).toBe(
      'Unexpected argument "b" for livelocale check.'
    );
    expect(
      usageMessage(() => parseCommandArgs({ command: 'studio', values: ['--port'] }, ['3011']))
    ).toBe('Unexpected argument "3011" for livelocale studio.');
  });

  it('treats a lone - as a positional (stdin)', () =>
    expect(parseCommandArgs({ command: 'apply', positionals: 1 }, ['-']).positionals).toEqual([
      '-',
    ]));

  it('stops at -- and hands the rest over only when the command takes it', () => {
    const spec: CommandSpec = { command: 'build', flags: ['--preview'], rest: true };
    expect(parseCommandArgs(spec, ['--preview', '--', 'next', 'build', '-h']).rest).toEqual([
      'next',
      'build',
      '-h',
    ]);
    expect(usageMessage(() => parseCommandArgs(CHECK, ['--', 'x']))).toBe(
      'livelocale check takes nothing after --.'
    );
  });
});

describe('findGlobalOption', () => {
  it('finds --help, -h, --version and -v anywhere a value cannot go', () => {
    expect(findGlobalOption(['--help'])).toBe('help');
    expect(findGlobalOption(['-v'])).toBe('version');
    expect(findGlobalOption(['check', '-h'], CHECK)).toBe('help');
    expect(findGlobalOption(['check', '-v'], CHECK)).toBe('version');
    expect(findGlobalOption(['check', '--strict', '--version'], CHECK)).toBe('version');
    expect(findGlobalOption(['chek', '--help'])).toBe('help');
  });

  it('lets help win over version', () =>
    expect(findGlobalOption(['check', '-v', '-h'], CHECK)).toBe('help'));

  it('skips the value of an option that takes one', () => {
    expect(findGlobalOption(['check', '--source', '-v'], CHECK)).toBeUndefined();
    expect(findGlobalOption(['check', '--allow', '--help'], CHECK)).toBeUndefined();
    expect(findGlobalOption(['check', '--source', '-v', '-h'], CHECK)).toBe('help');
  });

  it('ignores everything after --', () =>
    expect(
      findGlobalOption(['build', '--', 'next', 'build', '-h'], { command: 'build', rest: true })
    ).toBeUndefined());

  it('finds nothing in a plain command line', () =>
    expect(findGlobalOption(['check', '--strict', 'app'], CHECK)).toBeUndefined());
});

describe('suggestOption', () => {
  const known = ['--dir', '--locales', '--source', '--no-unused', '--strict', '--json'];
  it('finds a typo, a missing dash and a missing letter', () => {
    expect(suggestOption('--strictt', known)).toBe('--strict');
    expect(suggestOption('-strict', known)).toBe('--strict');
    expect(suggestOption('--local', known)).toBe('--locales');
    expect(suggestOption('--jsn', known)).toBe('--json');
    expect(suggestOption('--jsno', known)).toBe('--json');
  });
  it('suggests nothing for an unrelated word', () =>
    expect(suggestOption('--verbose', known)).toBeUndefined());
});
