// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseHelp } from '../../site/scripts/docs/cli-help.mjs';
import { knownOptions, UsageError } from '../../src/codemod/cli-args.js';
import {
  COMMAND_SPECS,
  parseDoctorArgs,
  parseInitArgs,
  parseMigrateArgs,
  parseStudioArgs,
} from '../../src/codemod/command-args.js';
import { parseCheckArgs } from '../../src/codemod/check-cli.js';
import { parseApplyArgs } from '../../src/codemod/apply/cli.js';
import { checkBuildArgs, checkPackArgs, parseShareArgs } from '../../src/server/pack.js';
import { helpText } from '../../src/codemod/help.js';
import { renderWorkflow } from '../../src/codemod/init-share.js';

function usage(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(UsageError);
    return (err as Error).message;
  }
  throw new Error('expected a UsageError');
}

describe('every documented flag is accepted, and only those', () => {
  const help = parseHelp(helpText());

  it.each(['migrate', 'init', 'studio', 'doctor', 'check', 'apply'])('%s', (command) =>
    expect(new Set(knownOptions(COMMAND_SPECS[command as keyof typeof COMMAND_SPECS]))).toEqual(
      new Set(help[command])
    )
  );

  it('pack and build share one option set', () =>
    expect(new Set(knownOptions(COMMAND_SPECS.pack))).toEqual(
      new Set([...help.pack!, ...help.build!])
    ));

  it('lists --version among the global options', () => expect(helpText()).toMatch(/--version/));

  it('starts every flag description in the same column', () => {
    const columns = helpText()
      .split('\n')
      .filter((line) => /^  -/.test(line))
      .map((line) => [line, line.search(/(?<=\S {2,})\S/)] as const);
    expect(columns.filter(([, column]) => column !== 21)).toEqual([]);
  });
});

describe('a mistyped flag is a usage error on every command', () => {
  it.each([
    ['check', () => parseCheckArgs(['--strictt']), '--strict'],
    ['doctor', () => parseDoctorArgs(['--tokn', 'x']), '--token'],
    ['migrate', () => parseMigrateArgs(['--dry-rn']), '--dry-run'],
    ['init', () => parseInitArgs(['--shar']), '--share'],
    ['studio', () => parseStudioArgs(['--prot', '3011']), '--port'],
    ['apply', () => parseApplyArgs(['--dryrun']), '--dry-run'],
  ])('%s', (command, fn, suggestion) =>
    expect(usage(fn)).toMatch(
      new RegExp(`^Unknown option \\S+ for livelocale ${command}\\. Did you mean ${suggestion}\\?$`)
    )
  );

  it('pack and build keep their usage PackError', () =>
    expect(() => parseShareArgs(['--no-injct'], 'pack')).toThrow(
      'Unknown option --no-injct for livelocale pack. Did you mean --no-inject?'
    ));
});

describe('parseMigrateArgs', () => {
  it('keeps the defaults', () =>
    expect(parseMigrateArgs([])).toEqual({
      dir: '.',
      excludes: ['node_modules', '.next', 'dist', '.git'],
      dryRun: false,
    }));
  it('reads every option', () =>
    expect(parseMigrateArgs(['src', '--exclude', 'a, b', '--dry-run'])).toEqual({
      dir: 'src',
      excludes: ['a', 'b'],
      dryRun: true,
    }));
  it('rejects the folder given twice', () =>
    expect(usage(() => parseMigrateArgs(['a', '--dir', 'b']))).toBe(
      'Pass the folder once: "a" or --dir b, not both.'
    ));
});

describe('parseDoctorArgs', () => {
  it('reads every option', () =>
    expect(
      parseDoctorArgs([
        '--dir',
        'web',
        '--locales',
        'src/locales',
        '--app',
        'https://user.github.io/repo/',
        '--share',
        '--token',
        't',
      ])
    ).toEqual({
      dir: 'web',
      localesPath: 'src/locales',
      app: { origin: 'https://user.github.io', base: 'https://user.github.io/repo/' },
      share: true,
      token: 't',
    }));
  it('rejects an --app that is not an http(s) URL', () =>
    expect(usage(() => parseDoctorArgs(['--app', 'localhost:3000']))).toMatch(
      /^--app must be an http\(s\) URL/
    ));
});

describe('parseStudioArgs', () => {
  it('keeps the defaults', () =>
    expect(parseStudioArgs([])).toEqual({ port: 3010, appOrigin: 'http://localhost:3000' }));
  it('reads --port and --app', () =>
    expect(parseStudioArgs(['--port', '3011', '--app', 'http://localhost:5173/x'])).toEqual({
      port: 3011,
      appOrigin: 'http://localhost:5173',
      appUrl: 'http://localhost:5173/x',
    }));
  it('keeps no page for an --app at the root', () =>
    expect(parseStudioArgs(['--app', 'http://localhost:4321/'])).toEqual({
      port: 3010,
      appOrigin: 'http://localhost:4321',
    }));
  it.each(['abc', '0', '70000', '30.5'])('rejects --port %s', (port) =>
    expect(usage(() => parseStudioArgs(['--port', port]))).toBe(
      `--port must be a port number from 1 to 65535 (got "${port}").`
    )
  );
  it('rejects a non-http --app', () =>
    expect(usage(() => parseStudioArgs(['--app', 'ftp://x']))).toMatch(
      /^--app must be an http\(s\) URL such as http:\/\/localhost:3001/
    ));
  it('takes no folder', () =>
    expect(usage(() => parseStudioArgs(['web']))).toBe(
      'Unexpected argument "web" for livelocale studio.'
    ));
});

describe('parseInitArgs', () => {
  it('reads a plain init', () => {
    expect(parseInitArgs([])).toEqual({ share: false, dir: '.' });
    expect(parseInitArgs(['web'])).toEqual({ share: false, dir: 'web' });
    expect(parseInitArgs(['--dir', 'web'])).toEqual({ share: false, dir: 'web' });
  });

  it('reads every --share option', () =>
    expect(
      parseInitArgs([
        '--share',
        '--dir',
        'app',
        '--locales',
        'src/locales',
        '--source',
        'ar',
        '--branches',
        'main, release',
        '--overwrite',
      ])
    ).toEqual({
      share: true,
      dir: 'app',
      localesPath: 'src/locales',
      sourceLocale: 'ar',
      branches: ['main', 'release'],
      overwrite: true,
    }));

  it('rejects a folder argument with --share', () =>
    expect(usage(() => parseInitArgs(['--share', 'my-app']))).toBe(
      'init --share takes the project folder as --dir my-app, not as a plain argument.'
    ));

  it.each(['--locales', '--source', '--branches'])('rejects %s without --share', (flag) =>
    expect(usage(() => parseInitArgs([flag, 'x']))).toBe(`${flag} only works with init --share.`)
  );

  it('rejects --overwrite without --share', () =>
    expect(usage(() => parseInitArgs(['--overwrite']))).toBe(
      '--overwrite only works with init --share.'
    ));

  it.each([
    [['--share', '--locales'], '--locales'],
    [['--share', '--source', '--overwrite'], '--source'],
    [['--share', '--dir'], '--dir'],
    [['--share', '--branches', '--locales', 'x'], '--branches'],
  ])('%j: %s needs a value', (argv, flag) =>
    expect(usage(() => parseInitArgs(argv))).toBe(`${flag} needs a value.`)
  );
});

describe('command lines init --share writes', () => {
  it('the workflow apply line parses', () => {
    const workflow = renderWorkflow({
      localesPath: 'src/locales',
      sourceLocale: 'en',
      branches: ['main', 'release'],
      dir: 'web',
      version: '1.0.0',
    });
    const line = /apply (--github-event .*)$/m.exec(workflow)![1]!;
    expect(parseApplyArgs(line.split(' '))).toMatchObject({
      githubEvent: true,
      locales: 'src/locales',
      source: 'en',
      branches: ['main', 'release'],
      dir: 'web',
    });
  });

  // The exact scripts init-share.test.ts expects `init --share` to write into package.json.
  it('the package.json pack and build:preview scripts parse', () => {
    expect(() =>
      checkPackArgs(parseShareArgs('dist --locales src/locales --source en'.split(' '), 'pack'))
    ).not.toThrow();
    expect(() =>
      checkBuildArgs(
        parseShareArgs(
          '--preview --locales src/locales --source en -- next build'.split(' '),
          'build'
        )
      )
    ).not.toThrow();
  });
});
