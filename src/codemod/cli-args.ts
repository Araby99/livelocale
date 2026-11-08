/**
 * The one strict argument parser every `livelocale` command uses: unknown options, missing values
 * and stray arguments are usage errors (exit code 2), so a mistyped flag can never quietly turn a
 * check off.
 */

/** A command line the command cannot take. The CLI prints the message and exits 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** Exit code of every usage error. */
export const USAGE_EXIT_CODE = 2;

export interface CommandSpec {
  /** The command word, used in messages (`livelocale <command>`). */
  command: string;
  /** Options that take one value; given twice, the last one wins. */
  values?: readonly string[];
  /** Options that take one value and may repeat; every value is kept, in order. */
  repeatable?: readonly string[];
  /** Options that take no value. */
  flags?: readonly string[];
  /** How many plain arguments the command takes (default 0). */
  positionals?: number;
  /** True when everything after `--` belongs to the command (`build -- <command>`). */
  rest?: boolean;
}

export interface ParsedArgs {
  values: Record<string, string>;
  lists: Record<string, string[]>;
  flags: Set<string>;
  positionals: string[];
  /** Everything after `--`, for a command with `rest: true`. */
  rest: string[];
}

/** Every option a command knows, in spec order. */
export function knownOptions(spec: CommandSpec): string[] {
  return [...(spec.values ?? []), ...(spec.repeatable ?? []), ...(spec.flags ?? [])];
}

/** Edits between two words; swapping two neighbouring letters counts as one edit. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

/** The known option closest to `arg`, when one is a likely typo of it (two edits at most). */
export function suggestOption(arg: string, known: readonly string[]): string | undefined {
  const name = arg.replace(/^-+/, '');
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const option of known) {
    const distance = editDistance(name, option.replace(/^-+/, ''));
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return bestDistance <= 2 && bestDistance < name.length / 2 ? best : undefined;
}

function unknownOption(spec: CommandSpec, arg: string): UsageError {
  const known = knownOptions(spec);
  const head = `Unknown option ${arg} for livelocale ${spec.command}.`;
  const eq = arg.indexOf('=');
  if (eq > 0 && known.includes(arg.slice(0, eq))) {
    return new UsageError(
      `${head} Put a space before the value: ${arg.slice(0, eq)} ${arg.slice(eq + 1)}`
    );
  }
  const suggestion = suggestOption(arg, known);
  return new UsageError(
    suggestion
      ? `${head} Did you mean ${suggestion}?`
      : `${head} Run livelocale --help to see its options.`
  );
}

/** Parses the arguments after the command word. Throws `UsageError` on anything it cannot take. */
export function parseCommandArgs(spec: CommandSpec, argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { values: {}, lists: {}, flags: new Set(), positionals: [], rest: [] };
  const values = new Set(spec.values ?? []);
  const repeatable = new Set(spec.repeatable ?? []);
  const flags = new Set(spec.flags ?? []);
  const maxPositionals = spec.positionals ?? 0;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      if (!spec.rest) throw new UsageError(`livelocale ${spec.command} takes nothing after --.`);
      parsed.rest = argv.slice(i + 1);
      break;
    }
    if (values.has(arg) || repeatable.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`${arg} needs a value.`);
      }
      i++;
      if (repeatable.has(arg)) (parsed.lists[arg] ??= []).push(value);
      else parsed.values[arg] = value;
    } else if (flags.has(arg)) {
      parsed.flags.add(arg);
    } else if (arg.startsWith('-') && arg !== '-') {
      throw unknownOption(spec, arg);
    } else if (parsed.positionals.length < maxPositionals) {
      parsed.positionals.push(arg);
    } else {
      throw new UsageError(`Unexpected argument "${arg}" for livelocale ${spec.command}.`);
    }
  }
  return parsed;
}

/** Splits a comma-separated option value, trimming each item and dropping empty ones. */
export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * The project folder, given as a plain argument or as `--dir` (default `.`). Both at once is a
 * usage error rather than a silent pick.
 */
export function folderArg(parsed: ParsedArgs): string {
  const plain = parsed.positionals[0];
  const flag = parsed.values['--dir'];
  if (plain !== undefined && flag !== undefined) {
    throw new UsageError(`Pass the folder once: "${plain}" or --dir ${flag}, not both.`);
  }
  return plain ?? flag ?? '.';
}
