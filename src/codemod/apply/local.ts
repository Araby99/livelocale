/**
 * `livelocale apply` into the working tree: decodes a change link, plans every
 * edit against the project's own locale files and writes the edits that pass.
 */

import * as fs from 'fs';
import * as path from 'path';
import { decodeChangeLink } from '../../core/change-link.js';
import { nodeInflate } from '../../core/change-link-node.js';
import { planApply, type ApplyPlan, type LocaleTarget } from '../../core/apply-plan.js';
import { isValidLocaleFormat } from '../../core/validate.js';
import { FileMutator } from '../../server/file-mutator.js';
import { ApplyInputError } from './link-input.js';
import { renderTerminalSummary } from './report.js';

/** Runs git with `args` in `cwd` and resolves with stdout; throws on a non-zero exit. */
export type GitExec = (
  args: string[],
  cwd: string,
  opts?: { inherit?: boolean }
) => Promise<string>;

/** Runs the GitHub CLI with `args` in `cwd` and resolves with stdout. */
export type GhExec = (args: string[], cwd: string) => Promise<string>;

export interface LocalApplyOptions {
  projectDir: string;
  /** Locales directory relative to the project (default `locales`). */
  localesPath?: string;
  /** Default: `en` when present, else the first locale. */
  sourceLocale?: string;
  /** Text that holds the link (from readApplyInput). */
  input: string;
  force?: boolean;
  dryRun?: boolean;
  pr?: boolean;
  log?: (line: string) => void;
  exec?: { git?: GitExec; gh?: GhExec };
  /** The clock for the branch name. Default `() => new Date()`. */
  now?: () => Date;
}

export interface LocalApplyResult {
  plan: ApplyPlan;
  /** Project-relative POSIX paths of the locale files written. */
  written: string[];
  branch?: string;
  prUrl?: string;
  exitCode: 0 | 1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readTarget(
  mutator: FileMutator,
  localesDir: string,
  locale: string
): Promise<LocaleTarget> {
  if (!isValidLocaleFormat(locale)) return null;
  const dir = path.join(localesDir, locale);
  let layout: 'flat' | 'namespaced';
  if (fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    layout = 'namespaced';
  } else if (fs.statSync(`${dir}.json`, { throwIfNoEntry: false })?.isFile()) {
    layout = 'flat';
  } else {
    return null;
  }
  const dict: unknown = await mutator.readLocale(localesDir, locale);
  if (!isPlainObject(dict)) {
    throw new Error(`The "${locale}" locale file is not a JSON object.`);
  }
  return { layout, dict };
}

/** The file `updateLocaleKey` writes for `key`, relative to the project, in POSIX form. */
function fileFor(
  localesPath: string,
  layout: 'flat' | 'namespaced',
  locale: string,
  key: string
): string {
  const rel =
    layout === 'flat'
      ? path.join(localesPath, `${locale}.json`)
      : path.join(localesPath, locale, `${key.slice(0, key.indexOf('.'))}.json`);
  return path.normalize(rel).split(path.sep).join('/');
}

/**
 * Plans the link's edits against `<projectDir>/<localesPath>` and writes every
 * `apply` edit (unless `dryRun`). Logs the terminal summary only, never values.
 * Throws `ChangeLinkError` for a damaged link.
 */
export async function runLocalApply(options: LocalApplyOptions): Promise<LocalApplyResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  if (options.pr) throw new ApplyInputError('apply --pr is not available yet.');

  const set = await decodeChangeLink(options.input, nodeInflate);

  const localesPath = options.localesPath ?? 'locales';
  const localesDir = path.resolve(options.projectDir, localesPath);
  if (!fs.statSync(localesDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ApplyInputError(`No locales folder at ${localesPath}.`);
  }

  // The local developer runs this, so the CLI-only option is allowed here.
  // Quiet: the terminal summary is the only output.
  const mutator = new FileMutator({ requireEnabled: false, quiet: true });
  let sourceLocale = options.sourceLocale;
  if (sourceLocale === undefined) {
    const locales = await mutator.listLocales(localesDir);
    sourceLocale = locales.includes('en') ? 'en' : (locales[0] ?? 'en');
  }
  if (set.src !== sourceLocale) {
    log(
      `The link says the source locale is \`${set.src}\`; using \`${sourceLocale}\` (pass --source to change).`
    );
  }

  const targets = new Map<string, LocaleTarget>();
  for (const locale of new Set([sourceLocale, ...set.edits.map((e) => e.locale)])) {
    targets.set(locale, await readTarget(mutator, localesDir, locale));
  }

  const plan = planApply({
    edits: set.edits,
    sourceLocale,
    targets,
    allowForce: options.force === true,
  });

  const written: string[] = [];
  if (!options.dryRun) {
    for (const edit of plan.edits) {
      if (edit.status !== 'apply') continue;
      await mutator.updateLocaleKey(localesDir, edit.locale, edit.key, edit.to);
      const file = fileFor(localesPath, targets.get(edit.locale)!.layout, edit.locale, edit.key);
      if (!written.includes(file)) written.push(file);
    }
  }

  log(renderTerminalSummary(plan));

  const c = plan.counts;
  const exitCode = c.conflict + c.invalid + c['needs-force'] > 0 ? 1 : 0;
  return { plan, written, exitCode };
}
