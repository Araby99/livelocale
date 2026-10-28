/** The `livelocale apply` command: argument parsing and the terminal entry point. */

import * as path from 'path';
import { runGitHubEventApply } from './github-event.js';
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
  githubEvent: boolean;
  branches?: string[];
}

const VALUE_OPTIONS = { '--dir': 'dir', '--locales': 'locales', '--source': 'source' } as const;
const FLAG_OPTIONS = {
  '--clipboard': 'clipboard',
  '--pr': 'pr',
  '--force': 'force',
  '--dry-run': 'dryRun',
  '--github-event': 'githubEvent',
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
    githubEvent: false,
    branches: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--branches') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new ApplyInputError(`${arg} needs a value.`);
      }
      args.branches = value
        .split(',')
        .map((branch) => branch.trim())
        .filter(Boolean);
      i++;
    } else if (Object.prototype.hasOwnProperty.call(VALUE_OPTIONS, arg)) {
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
  if (args.githubEvent) {
    if (args.force) {
      throw new ApplyInputError(
        '--force is not allowed with --github-event; a maintainer comments `/livelocale apply --force`.'
      );
    }
    if (args.input !== undefined) {
      throw new ApplyInputError(
        '--github-event reads the link from the event file; do not pass one.'
      );
    }
    if (args.locales === undefined || args.source === undefined) {
      throw new ApplyInputError('--github-event needs --locales and --source.');
    }
  }
  return args;
}

/** Runs `livelocale apply` and sets `process.exitCode`. Every error is one `❌` line. */
export async function runApplyCommand(argv: string[]): Promise<void> {
  try {
    const args = parseApplyArgs(argv);
    if (args.githubEvent) {
      const result = await runGitHubEventApply({
        env: process.env,
        localesPath: args.locales!,
        sourceLocale: args.source!,
        branches: args.branches,
        dir: args.dir,
      });
      process.exitCode = result === 'error' || result === 'wrong-repo' ? 1 : 0;
      return;
    }
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
