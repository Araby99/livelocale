/**
 * `livelocale apply` into the working tree: decodes a change link, plans every
 * edit against the project's own locale files and writes the edits that pass.
 */

import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { decodeChangeLink } from '../../core/change-link.js';
import { nodeInflate } from '../../core/change-link-node.js';
import { planApply, type ApplyPlan, type LocaleTarget } from '../../core/apply-plan.js';
import { isValidLocaleFormat } from '../../core/validate.js';
import { FileMutator } from '../../server/file-mutator.js';
import { GitClient } from '../../server/git-client.js';
import { runCheck } from '../check.js';
import { ApplyInputError } from './link-input.js';
import {
  renderCommitMessage,
  renderPullRequestBody,
  renderTerminalSummary,
  summarizeCheck,
} from './report.js';

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

const PR_TITLE = 'i18n: LiveLocale changes';
const GITHUB_REMOTE_RE = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/;

/** Runs git without a shell or a credential prompt; `inherit` streams its output to the user. */
const defaultGit: GitExec = (args, cwd, opts) => {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (opts?.inherit) {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd, env, stdio: 'inherit', windowsHide: true });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve('') : reject(new Error(`git ${args[0]} failed (exit ${code}).`))
      );
    });
  }
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout)))
    );
  });
};

/** Runs the GitHub CLI without a shell. */
const defaultGh: GhExec = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile('gh', args, { cwd, windowsHide: true }, (error, stdout) =>
      error ? reject(error) : resolve(String(stdout))
    );
  });

/** `YYYYMMDD-HHmmss` in UTC. */
function utcStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

/** Resolves with the command's stdout, or null when it fails. */
async function tryRun(run: () => Promise<string>): Promise<string | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

/** The first free `livelocale/apply-<stamp>[-n]` name, locally and at origin's push URL. */
async function pickBranchName(git: GitExec, root: string, stamp: string): Promise<string> {
  const pushUrl = (
    await tryRun(() => git(['remote', 'get-url', '--push', 'origin'], root))
  )?.trim();
  const taken = async (name: string): Promise<boolean> => {
    const local = await tryRun(() =>
      git(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], root)
    );
    if (local !== null) return true;
    if (!pushUrl) return false;
    // A failing ls-remote counts as "no such branch": the push never forces, so it still fails.
    const remote = await tryRun(() =>
      git(['ls-remote', '--heads', pushUrl, `refs/heads/${name}`], root)
    );
    return remote !== null && remote.trim() !== '';
  };
  const base = `livelocale/apply-${stamp}`;
  let name = base;
  for (let n = 2; await taken(name); n++) name = `${base}-${n}`;
  return name;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Writes every `apply` edit and returns the project-relative files written. */
async function writeEdits(
  mutator: FileMutator,
  plan: ApplyPlan,
  targets: Map<string, LocaleTarget>,
  localesDir: string,
  localesPath: string
): Promise<string[]> {
  const written: string[] = [];
  for (const edit of plan.edits) {
    if (edit.status !== 'apply') continue;
    await mutator.updateLocaleKey(localesDir, edit.locale, edit.key, edit.to);
    const file = fileFor(localesPath, targets.get(edit.locale)!.layout, edit.locale, edit.key);
    if (!written.includes(file)) written.push(file);
  }
  return written;
}

function exitCodeFor(plan: ApplyPlan): 0 | 1 {
  const c = plan.counts;
  return c.conflict + c.invalid + c['needs-force'] > 0 ? 1 : 0;
}

/** The repository root and current branch; refuses a detached HEAD or a dirty locales folder. */
async function preparePullRequest(
  git: GitExec,
  projectDir: string,
  localesDir: string
): Promise<{ root: string; original: string }> {
  const top = (await tryRun(() => git(['rev-parse', '--show-toplevel'], projectDir)))?.trim();
  if (!top) throw new ApplyInputError('apply --pr needs a git repository.');
  const root = path.resolve(top);
  const original = (
    await tryRun(() => git(['symbolic-ref', '--quiet', '--short', 'HEAD'], root))
  )?.trim();
  if (!original) throw new ApplyInputError('Check out a branch first.');
  const status = await new GitClient().status(localesDir);
  if (status.changes.length > 0) {
    const rel = path.relative(root, localesDir).split(path.sep).join('/') || '.';
    throw new ApplyInputError(
      `Commit or stash the changes under ${rel} first; apply --pr commits everything in that folder.`
    );
  }
  return { root, original };
}

/** Runs `gh pr create`; undefined when gh is not installed. */
async function createPullRequest(
  gh: GhExec,
  root: string,
  base: string,
  head: string,
  body: string
): Promise<string | undefined> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-pr-'));
  const bodyFile = path.join(tmpDir, 'body.md');
  try {
    fs.writeFileSync(bodyFile, body, 'utf-8');
    const out = await gh(
      [
        'pr',
        'create',
        '--base',
        base,
        '--head',
        head,
        '--title',
        PR_TITLE,
        '--body-file',
        bodyFile,
      ],
      root
    );
    const lines = out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return lines[lines.length - 1];
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return undefined;
    throw err;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Plans the link's edits against `<projectDir>/<localesPath>` and writes every
 * `apply` edit (unless `dryRun`). Logs the terminal summary only, never values.
 * With `pr`, writes them on a new `livelocale/apply-<stamp>` branch, commits,
 * pushes, opens a pull request with `gh` when origin is GitHub, and switches back.
 * Throws `ChangeLinkError` for a damaged link.
 */
export async function runLocalApply(options: LocalApplyOptions): Promise<LocalApplyResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const set = await decodeChangeLink(options.input, nodeInflate);

  const localesPath = options.localesPath ?? 'locales';
  const localesDir = path.resolve(options.projectDir, localesPath);
  if (!fs.statSync(localesDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ApplyInputError(`No locales folder at ${localesPath}.`);
  }

  const pr = options.pr === true && options.dryRun !== true;
  const git = options.exec?.git ?? defaultGit;
  const repo = pr ? await preparePullRequest(git, options.projectDir, localesDir) : undefined;
  if (repo && set.branch !== '' && set.branch !== repo.original) {
    log(
      `The link was made from the branch \`${set.branch}\`; the pull request targets \`${repo.original}\`.`
    );
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
  const exitCode = exitCodeFor(plan);

  if (!repo || plan.counts.apply === 0) {
    const written =
      repo || options.dryRun
        ? []
        : await writeEdits(mutator, plan, targets, localesDir, localesPath);
    log(renderTerminalSummary(plan));
    return { plan, written, exitCode };
  }

  const { root, original } = repo;
  const now = options.now ?? (() => new Date());
  const branch = await pickBranchName(git, root, utcStamp(now()));
  await git(['switch', '-c', branch], root);

  try {
    const written = await writeEdits(mutator, plan, targets, localesDir, localesPath);
    log(renderTerminalSummary(plan));

    let checkSummary: string;
    try {
      const report = await runCheck({
        projectDir: options.projectDir,
        localesPath: localesDir,
        sourceLocale,
        unused: false,
      });
      const edited = plan.edits
        .filter((edit) => edit.status === 'apply')
        .map((edit): [string, string] => [edit.locale, edit.key]);
      checkSummary = summarizeCheck(report, edited);
    } catch (err) {
      checkSummary = `Check could not run: ${errorMessage(err)}`;
    }

    await new GitClient().commit(localesDir, renderCommitMessage({ plan, by: set.by }));
    await git(['push', '-u', 'origin', branch], root, { inherit: true });

    const remote = (await tryRun(() => git(['remote', 'get-url', 'origin'], root)))?.trim();
    const slug = remote ? GITHUB_REMOTE_RE.exec(remote)?.[1] : undefined;
    let prUrl: string | undefined;
    if (slug) {
      const body = renderPullRequestBody({
        plan,
        by: set.by,
        note: set.note,
        checkSummary,
        target: { branch: original, isDefault: false, reason: 'local' },
      });
      prUrl = await createPullRequest(options.exec?.gh ?? defaultGh, root, original, branch, body);
    }
    if (prUrl) {
      log(`Opened ${prUrl}`);
    } else {
      log(`Pushed ${branch}. Open a pull/merge request from it into ${original}.`);
      if (slug) log(`https://github.com/${slug}/compare/${original}...${branch}?expand=1`);
    }

    await git(['switch', original], root);
    return { plan, written, branch, prUrl, exitCode };
  } catch (err) {
    log(`You are on ${branch}; your changes are committed there.`);
    throw err;
  }
}
