/**
 * The options of every `livelocale` command. A test holds these sets to the flags
 * `livelocale --help` prints. No imports beyond types: `src/server/pack.ts` uses it too.
 */

import type { CommandSpec } from './cli-args.js';

export const COMMAND_SPECS = {
  migrate: {
    command: 'migrate',
    values: ['--dir', '--exclude'],
    flags: ['--dry-run'],
    positionals: 1,
  },
  init: {
    command: 'init',
    values: ['--dir', '--locales', '--source', '--branches'],
    flags: ['--share', '--overwrite'],
    positionals: 1,
  },
  studio: { command: 'studio', values: ['--port', '--app'] },
  doctor: {
    command: 'doctor',
    values: ['--dir', '--locales', '--app', '--token'],
    flags: ['--share'],
    positionals: 1,
  },
  check: {
    command: 'check',
    values: ['--dir', '--locales', '--source'],
    repeatable: ['--allow'],
    flags: ['--no-unused', '--strict', '--hardcoded', '--json'],
    positionals: 1,
  },
  // `pack` and `build` share one set; checkPackArgs and checkBuildArgs reject the other's options
  // with a message that names the right command.
  pack: {
    command: 'pack',
    values: ['--dir', '--locales', '--source', '--base', '--out'],
    flags: ['--expose-repo', '--no-inject', '--preview'],
    positionals: Infinity,
    rest: true,
  },
  apply: {
    command: 'apply',
    values: ['--dir', '--locales', '--source', '--branches'],
    flags: ['--clipboard', '--pr', '--force', '--dry-run', '--github-event'],
    positionals: Infinity,
  },
} satisfies Record<string, CommandSpec>;
