import { hasCheckFailures, type CheckReport } from './check.js';

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

/** Parses the `check` arguments; `argv` excludes the `check` word. */
export function parseCheckArgs(argv: string[]): CheckArgs {
  const args: CheckArgs = {
    dir: '.',
    unused: true,
    strict: false,
    json: false,
    hardcoded: false,
    allow: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') {
      args.dir = argv[++i] || '.';
    } else if (arg === '--locales') {
      args.localesPath = argv[++i];
    } else if (arg === '--source') {
      args.sourceLocale = argv[++i];
    } else if (arg === '--no-unused') {
      args.unused = false;
    } else if (arg === '--strict') {
      args.strict = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--hardcoded') {
      args.hardcoded = true;
    } else if (arg === '--allow') {
      const word = argv[++i];
      if (!word || word.startsWith('--')) throw new Error('--allow needs a word.');
      args.allow.push(word);
    } else if (arg && !arg.startsWith('--')) {
      args.dir = arg;
    }
  }
  return args;
}

/** 2 when a check could not run (setup problem), else 1 on any failure, else 0. */
export function checkExitCode(report: CheckReport): 0 | 1 | 2 {
  if (report.setupProblems && report.setupProblems.length > 0) return 2;
  return hasCheckFailures(report) ? 1 : 0;
}
