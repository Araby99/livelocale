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
import {
  planApply,
  type ApplyPlan,
  type LocaleTarget,
  type PlannedEdit,
} from '../../core/apply-plan.js';
import { isValidLocaleFormat } from '../../core/validate.js';
import { LOCALES_CANDIDATES, resolveLocalesPath } from '../../core/locale-folder.js';
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
  /** Locales directory relative to the project (default: the detected folder, else `locales`). */
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
  /** Edits planned as `apply` whose file could not be written, with the reason. */
  failed: Map<PlannedEdit, string>;
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
    execFile('gh', args, { cwd, windowsHide: true }, (error, stdout, stderr) =>
      error ? reject(Object.assign(error, { stderr: String(stderr) })) : resolve(String(stdout))
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

/** Why `file` could not be written, in plain words. */
function writeFailure(file: string, err: unknown): string {
  const message = errorMessage(err);
  // FileMutator wraps the fs error, so the code is only in its message.
  if (/\b(?:EPERM|EACCES|EROFS|EBUSY)\b/.test(message)) {
    return `cannot write ${file}: the file is read-only or in use.`;
  }
  return `cannot write ${file}: ${message.replace(/^\[livelocale\]\s*/, '')}`;
}

/**
 * Writes every `apply` edit. A file that cannot be written (read-only, locked) does not stop
 * the others: its edits are returned in `failed`, so the summary can say what landed.
 */
async function writeEdits(
  mutator: FileMutator,
  plan: ApplyPlan,
  targets: Map<string, LocaleTarget>,
  localesDir: string,
  localesPath: string
): Promise<{ written: string[]; failed: Map<PlannedEdit, string> }> {
  const written: string[] = [];
  const failed = new Map<PlannedEdit, string>();
  for (const edit of plan.edits) {
    if (edit.status !== 'apply') continue;
    const file = fileFor(localesPath, targets.get(edit.locale)!.layout, edit.locale, edit.key);
    try {
      await mutator.updateLocaleKey(localesDir, edit.locale, edit.key, edit.to);
    } catch (err) {
      failed.set(edit, writeFailure(file, err));
      continue;
    }
    if (!written.includes(file)) written.push(file);
  }
  return { written, failed };
}

function exitCodeFor(plan: ApplyPlan, failed: number): 0 | 1 {
  const c = plan.counts;
  return c.conflict + c.invalid + c['needs-force'] + failed > 0 ? 1 : 0;
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

/**
 * Runs `gh pr create`. Undefined when gh is missing or fails (not logged in, a pull
 * request already exists, ...): the branch is already pushed, so the caller prints the
 * manual fallback instead of failing.
 */
async function createPullRequest(
  log: (line: string) => void,
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
    if ((err as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
      const stderr = (err as { stderr?: unknown } | undefined)?.stderr;
      const reason =
        typeof stderr === 'string' && stderr.trim() ? stderr.trim() : errorMessage(err);
      log(`gh could not open the pull request: ${reason}`);
    }
    return undefined;
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

  const resolved = resolveLocalesPath(options.projectDir, options.localesPath);
  const localesPath = resolved.path;
  const localesDir = path.resolve(options.projectDir, localesPath);
  if (!fs.statSync(localesDir, { throwIfNoEntry: false })?.isDirectory()) {
    const tried =
      options.localesPath === undefined
        ? ` Looked in ${LOCALES_CANDIDATES.join(', ')}. Pass --locales <path>.`
        : '';
    throw new ApplyInputError(`No locales folder at ${localesPath}.${tried}`);
  }
  if (resolved.detected) {
    log(`Locales folder: ${localesPath} (found it; pass --locales to pick another)`);
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
      options.sourceLocale === undefined
        ? `The link says the source locale is \`${set.src}\`; using \`${sourceLocale}\` (pass --source to change).`
        : `The link says the source locale is \`${set.src}\`; using \`${sourceLocale}\` from --source.`
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
  const summary = (failed?: Map<PlannedEdit, string>) =>
    renderTerminalSummary(plan, { dryRun: options.dryRun === true, failed, localesPath });

  if (!repo || plan.counts.apply === 0) {
    const { written, failed } =
      repo || options.dryRun
        ? { written: [], failed: new Map<PlannedEdit, string>() }
        : await writeEdits(mutator, plan, targets, localesDir, localesPath);
    log(summary(failed));
    return { plan, written, failed, exitCode: exitCodeFor(plan, failed.size) };
  }

  const { root, original } = repo;
  const now = options.now ?? (() => new Date());
  const branch = await pickBranchName(git, root, utcStamp(now()));
  await git(['switch', '-c', branch], root);

  let committed = false;
  try {
    const { written, failed } = await writeEdits(mutator, plan, targets, localesDir, localesPath);
    log(summary(failed));
    if (failed.size > 0) {
      throw new Error(`${failed.size} edit(s) could not be written, so nothing was committed.`);
    }

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
    committed = true;
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
      prUrl = await createPullRequest(
        log,
        options.exec?.gh ?? defaultGh,
        root,
        original,
        branch,
        body
      );
    }
    if (prUrl) {
      log(`Opened ${prUrl}`);
    } else {
      log(`Pushed ${branch}. Open a pull/merge request from it into ${original}.`);
      if (slug) log(`https://github.com/${slug}/compare/${original}...${branch}?expand=1`);
    }

    await git(['switch', original], root);
    return { plan, written, failed, branch, prUrl, exitCode: exitCodeFor(plan, 0) };
  } catch (err) {
    log(
      committed
        ? `You are on ${branch}; your changes are committed there.`
        : `You are on ${branch}; the edits are written but not committed.`
    );
    throw err;
  }
}
