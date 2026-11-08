/** The `livelocale apply` command: argument parsing and the terminal entry point. */

import * as path from 'path';
import { runGitHubEventApply } from './github-event.js';
import { parseCommandArgs, splitList, UsageError, USAGE_EXIT_CODE } from '../cli-args.js';
import { COMMAND_SPECS } from '../command-specs.js';
import { NO_INPUT_MESSAGE, readApplyInput } from './link-input.js';
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

/** Parses the arguments after `apply`. Throws `UsageError` on anything it cannot take. */
export function parseApplyArgs(argv: string[]): ApplyArgs {
  const parsed = parseCommandArgs(COMMAND_SPECS.apply, argv);
  if (parsed.positionals.length > 1) throw new UsageError('Pass one change link, file or "-".');
  const branches = parsed.values['--branches'];
  const args: ApplyArgs = {
    input: parsed.positionals[0],
    clipboard: parsed.flags.has('--clipboard'),
    pr: parsed.flags.has('--pr'),
    force: parsed.flags.has('--force'),
    dryRun: parsed.flags.has('--dry-run'),
    dir: parsed.values['--dir'] ?? '.',
    locales: parsed.values['--locales'],
    source: parsed.values['--source'],
    githubEvent: parsed.flags.has('--github-event'),
    branches: branches === undefined ? undefined : splitList(branches),
  };
  if (args.clipboard && args.input !== undefined) {
    throw new UsageError('Pass the link or --clipboard, not both.');
  }
  if (args.branches !== undefined && !args.githubEvent) {
    throw new UsageError('--branches only works with --github-event.');
  }
  if (args.githubEvent) {
    if (args.force) {
      throw new UsageError(
        '--force is not allowed with --github-event; a maintainer comments `/livelocale apply --force`.'
      );
    }
    if (args.input !== undefined) {
      throw new UsageError('--github-event reads the link from the event file; do not pass one.');
    }
    if (args.locales === undefined || args.source === undefined) {
      throw new UsageError('--github-event needs --locales and --source.');
    }
  } else if (!args.clipboard && (args.input === undefined || args.input === '')) {
    throw new UsageError(NO_INPUT_MESSAGE);
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
    process.exitCode = err instanceof UsageError ? USAGE_EXIT_CODE : 1;
  }
}
