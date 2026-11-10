import { hasCheckFailures, type CheckReport } from './check.js';
import { folderArg, parseCommandArgs } from './cli-args.js';
import { COMMAND_SPECS } from './command-specs.js';

export interface CheckArgs {
  dir: string;
  localesPath?: string;
  sourceLocale?: string;
  unused: boolean;
  strict: boolean;
  json: boolean;
  hardcoded: boolean;
  allow: string[];
}

/** Parses the `check` arguments; `argv` excludes the `check` word. Throws `UsageError`. */
export function parseCheckArgs(argv: string[]): CheckArgs {
  const parsed = parseCommandArgs(COMMAND_SPECS.check, argv);
  const args: CheckArgs = {
    dir: folderArg(parsed),
    unused: !parsed.flags.has('--no-unused'),
    strict: parsed.flags.has('--strict'),
    json: parsed.flags.has('--json'),
    hardcoded: parsed.flags.has('--hardcoded'),
    allow: parsed.lists['--allow'] ?? [],
  };
  if (parsed.values['--locales'] !== undefined) args.localesPath = parsed.values['--locales'];
  if (parsed.values['--source'] !== undefined) args.sourceLocale = parsed.values['--source'];
  return args;
}

/** 2 when a check could not run (setup problem), else 1 on any failure, else 0. */
export function checkExitCode(report: CheckReport): 0 | 1 | 2 {
  if (report.setupProblems && report.setupProblems.length > 0) return CHECK_COULD_NOT_RUN;
  return hasCheckFailures(report) ? 1 : 0;
}

/** The opening lines of the human `check` output: the project, the locales folder and locales. */
export function checkHeaderLines(report: CheckReport, projectDir: string): string[] {
  const lines = [`\n🔎 LiveLocale check — ${projectDir}`];
  if (report.detectedLocalesPath !== undefined) {
    lines.push(
      `📂 Locales folder: ${report.detectedLocalesPath} (found it; pass --locales to pick another)`
    );
  }
  lines.push(
    `🌐 Locales: ${report.locales.join(', ') || 'none'}` +
      (report.sourceLocale ? ` (source: ${report.sourceLocale})` : '') +
      ` · ${report.codeKeyCount} key(s) referenced in code`
  );
  return lines;
}

/**
 * The closing lines of the human `check` output. A setup problem replaces the success line,
 * so a run that exits 2 never also says the translations look good.
 */
export function checkSummaryLines(report: CheckReport): string[] {
  const fails = report.issues.filter((i) => i.level === 'fail').length;
  const warns = report.issues.filter((i) => i.level === 'warn').length;
  const setup = (report.setupProblems ?? []).map((problem) => `❌ ${problem}`);
  if (hasCheckFailures(report)) return [`❌ ${fails} problem(s), ${warns} warning(s).`, ...setup];
  if (setup.length > 0) return setup;
  return [
    warns > 0 ? `✅ No problems, ${warns} warning(s) worth a look.` : `✅ Translations look good.`,
  ];
}

/** Exit code of a check that could not run: a bad command line or a setup problem. */
export const CHECK_COULD_NOT_RUN = 2;

/** The `--json` report of a check that stopped before it could check anything. */
export function checkErrorReport(
  error: string,
  localesDir: string | null
): CheckReport & { error: string } {
  return {
    error,
    localesDir: localesDir ?? '',
    sourceLocale: null,
    locales: [],
    codeKeyCount: 0,
    issues: [],
    setupProblems: [error],
  };
}

/** The `--json` report, with an `error` field when a setup problem kept part of it from running. */
export function withCheckError(report: CheckReport): CheckReport & { error?: string } {
  const problems = report.setupProblems ?? [];
  return problems.length > 0 ? { ...report, error: problems.join(' ') } : report;
}
