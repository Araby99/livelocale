import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import * as path from 'path';
import { isValidBranchName, isValidRepoSlug } from '../core/change-link.js';

/** Runs git with `args` in `cwd`. Resolves to trimmed stdout, or null on any failure. */
export type GitRunner = (args: string[], cwd: string) => Promise<string | null>;

/** The default runner: no shell, no window, and git never prompts for credentials. */
export const runGit: GitRunner = (args, cwd) =>
  new Promise((resolve) => {
    try {
      execFile(
        'git',
        args,
        { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
        (error, stdout) => resolve(error ? null : String(stdout).trim())
      );
    } catch {
      resolve(null);
    }
  });

export interface BuildInfoOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  git?: GitRunner;
  /** Only when true is the repository slug resolved (and `git remote` called). */
  includeRepo?: boolean;
}

export interface BuildInfo {
  repo: string | null;
  defaultBranch: string | null;
  branch: string | null;
  base: string | null;
  gitRoot: string | null;
}

const SHA_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/i;

type Candidate = string | null | undefined | (() => Promise<string | null | undefined>);

/** The first candidate that `accept` maps to a non-null value wins; later ones are never evaluated. */
async function firstValid(
  candidates: Candidate[],
  accept: (value: string) => string | null
): Promise<string | null> {
  for (const candidate of candidates) {
    const value = typeof candidate === 'function' ? await candidate() : candidate;
    if (typeof value !== 'string' || value === '') continue;
    const accepted = accept(value);
    if (accepted !== null) return accepted;
  }
  return null;
}

const asBranch = (value: string): string | null => (isValidBranchName(value) ? value : null);
const asSha = (value: string): string | null => (SHA_RE.test(value) ? value.toLowerCase() : null);
const asSlug = (value: string): string | null => (isValidRepoSlug(value) ? value : null);

function readEvent(eventPath: string | undefined): Record<string, unknown> {
  if (!eventPath) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(eventPath, 'utf-8'));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a nested string from a parsed event payload, or undefined. */
function pick(obj: unknown, ...keys: string[]): string | undefined {
  let current = obj;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Resolves the repository, branch, commit and default branch of the build from
 * CI variables first and the local git checkout second. An empty or invalid
 * value from one source falls through to the next.
 */
export async function resolveBuildInfo(options: BuildInfoOptions): Promise<BuildInfo> {
  const { cwd, env = process.env, git = runGit, includeRepo = false } = options;
  const event = readEvent(env.GITHUB_EVENT_PATH);
  const isPullRequest =
    env.GITHUB_EVENT_NAME === 'pull_request' || env.GITHUB_EVENT_NAME === 'pull_request_target';
  const netlify = env.NETLIFY === 'true';
  const gitlab = env.GITLAB_CI === 'true';

  const branch = await firstValid(
    [
      env.GITHUB_HEAD_REF,
      env.GITHUB_REF_TYPE === 'branch' ? env.GITHUB_REF_NAME : null,
      env.VERCEL_GIT_COMMIT_REF,
      env.CF_PAGES_BRANCH,
      netlify ? env.BRANCH : null,
      gitlab ? env.CI_COMMIT_REF_NAME : null,
      async () => {
        const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
        return head === 'HEAD' ? null : head;
      },
    ],
    asBranch
  );

  const base = await firstValid(
    [
      isPullRequest ? pick(event, 'pull_request', 'head', 'sha') : null,
      env.GITHUB_SHA,
      env.VERCEL_GIT_COMMIT_SHA,
      env.CF_PAGES_COMMIT_SHA,
      netlify ? env.COMMIT_REF : null,
      gitlab ? env.CI_COMMIT_SHA : null,
      () => git(['rev-parse', 'HEAD'], cwd),
    ],
    asSha
  );

  const defaultBranch = await firstValid(
    [
      pick(event, 'repository', 'default_branch'),
      async () => {
        const ref = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd);
        return ref?.startsWith('origin/') ? ref.slice('origin/'.length) : null;
      },
    ],
    asBranch
  );

  const githubCom =
    env.GITHUB_SERVER_URL === undefined ||
    env.GITHUB_SERVER_URL === '' ||
    env.GITHUB_SERVER_URL === 'https://github.com';
  const repo = includeRepo
    ? await firstValid(
        [
          githubCom ? env.GITHUB_REPOSITORY : null,
          env.VERCEL_GIT_PROVIDER === 'github' &&
          env.VERCEL_GIT_REPO_OWNER &&
          env.VERCEL_GIT_REPO_SLUG
            ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
            : null,
          netlify && env.REPOSITORY_URL ? parseGitHubSlug(env.REPOSITORY_URL) : null,
          async () => {
            const remote = await git(['remote', 'get-url', 'origin'], cwd);
            return remote ? parseGitHubSlug(remote) : null;
          },
        ],
        asSlug
      )
    : null;

  const top = await git(['rev-parse', '--show-toplevel'], cwd);
  const gitRoot = top ? path.resolve(top) : null;

  return { repo, defaultBranch, branch, base, gitRoot };
}

/**
 * The `owner/repo` slug of a github.com remote, or null. Accepts https, http,
 * ssh and git URLs and the scp-like `git@github.com:owner/repo` form, with or
 * without `.git` and a trailing slash. Credentials in the URL are discarded
 * here and never returned.
 */
export function parseGitHubSlug(remote: string): string | null {
  const text = remote.trim();
  let repoPath: string;
  const scp = /^[A-Za-z0-9._-]+@github\.com:(.*)$/i.exec(text);
  if (scp) {
    repoPath = scp[1] ?? '';
  } else {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    repoPath = url.pathname;
  }
  const trimmed = repoPath
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  return isValidRepoSlug(trimmed) ? trimmed : null;
}
