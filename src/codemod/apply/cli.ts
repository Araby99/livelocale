/** The `livelocale apply` command: argument parsing and the terminal entry point. */

import * as path from 'path';
import { ApplyInputError, readApplyInput } from './link-input.js';
import { runLocalApply } from './local.js';

export interface ApplyArgs {
  input?: string;
  clipboard: boolean;
  pr: boolean;
  force: boolean;
  dryRun: boolean;
  dir: string;
  locales?: string;
  source?: string;
}

const VALUE_OPTIONS = { '--dir': 'dir', '--locales': 'locales', '--source': 'source' } as const;
const FLAG_OPTIONS = {
  '--clipboard': 'clipboard',
  '--pr': 'pr',
  '--force': 'force',
  '--dry-run': 'dryRun',
} as const;

/** Parses the arguments after `apply`. Throws `ApplyInputError` on bad combinations. */
export function parseApplyArgs(argv: string[]): ApplyArgs {
  const args: ApplyArgs = {
    input: undefined,
    clipboard: false,
    pr: false,
    force: false,
    dryRun: false,
    dir: '.',
    locales: undefined,
    source: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (Object.prototype.hasOwnProperty.call(VALUE_OPTIONS, arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new ApplyInputError(`${arg} needs a value.`);
      }
      args[VALUE_OPTIONS[arg as keyof typeof VALUE_OPTIONS]] = value;
      i++;
    } else if (Object.prototype.hasOwnProperty.call(FLAG_OPTIONS, arg)) {
      args[FLAG_OPTIONS[arg as keyof typeof FLAG_OPTIONS]] = true;
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new ApplyInputError(`Unknown option "${arg}".`);
    } else if (args.input !== undefined) {
      throw new ApplyInputError('Pass one change link, file or "-".');
    } else {
      args.input = arg;
    }
  }
  if (args.clipboard && args.input !== undefined) {
    throw new ApplyInputError('Pass the link or --clipboard, not both.');
  }
  return args;
}

/** Runs `livelocale apply` and sets `process.exitCode`. Every error is one `❌` line. */
export async function runApplyCommand(argv: string[]): Promise<void> {
  try {
    const args = parseApplyArgs(argv);
    const input = await readApplyInput(args.input, {
      cwd: process.cwd(),
      clipboard: args.clipboard,
    });
    const result = await runLocalApply({
      projectDir: path.resolve(args.dir),
      localesPath: args.locales,
      sourceLocale: args.source,
      input,
      force: args.force,
      dryRun: args.dryRun,
      pr: args.pr,
    });
    process.exitCode = result.exitCode;
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
