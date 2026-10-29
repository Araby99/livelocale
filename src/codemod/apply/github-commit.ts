/**
 * The GitHub Action's side of `apply`: reads the target's locale files at one
 * commit through the REST API and writes one commit per batch through the Git
 * Data API (blobs, tree, commit, ref), only under the locales folder and only
 * on a `livelocale/` branch. Nothing is ever force-pushed.
 */

import * as path from 'path';
import type { ApplyPlan, LocaleTarget } from '../../core/apply-plan.js';
import { setNestedProperty, stringifyLike } from '../../core/json-path.js';
import { isValidLocaleFormat } from '../../core/validate.js';
import {
  decodeBase64Utf8,
  encodeBase64Utf8,
  encodeRefPath,
  type GitHubRest,
} from '../../server/github-rest.js';

/** The only branches this module writes. */
const BRANCH_PREFIX = 'livelocale/';

/**
 * A repository-relative folder in POSIX form: '\\' becomes '/', and './',
 * empty segments and the edge '/' go. Throws on '..' and on an absolute path.
 */
export function normalizeRepoDir(p: string): string {
  const posix = p.replace(/\\/g, '/');
  if (posix.startsWith('/') || /^[A-Za-z]:/.test(posix)) {
    throw new Error(`[livelocale] The locales path must be relative to the repository: "${p}".`);
  }
  const segments = posix.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.includes('..')) {
    throw new Error(`[livelocale] The locales path must stay inside the repository: "${p}".`);
  }
  return segments.join('/');
}

function joinRepoPath(dir: string, rest: string): string {
  return dir === '' ? rest : `${dir}/${rest}`;
}

/** The repository file that holds `key` of `locale`, and the key inside that file. */
export function localeFileFor(
  localesDir: string,
  layout: 'flat' | 'namespaced',
  locale: string,
  key: string
): { file: string; innerKey: string } {
  const dir = normalizeRepoDir(localesDir);
  if (layout === 'flat') return { file: joinRepoPath(dir, `${locale}.json`), innerKey: key };
  const dot = key.indexOf('.');
  if (dot <= 0 || dot === key.length - 1) {
    throw new Error(`[livelocale] "${key}" names no key inside a namespace file.`);
  }
  return {
    file: joinRepoPath(dir, `${locale}/${key.slice(0, dot)}.json`),
    innerKey: key.slice(dot + 1),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sets every edit in the JSON `text` and serializes it the way FileMutator
 * does (same indentation unit, same trailing newline), so the bytes match a
 * local `apply`.
 */
export function applyEditsToText(
  text: string,
  edits: { innerKey: string; value: string }[]
): string {
  const data: unknown = JSON.parse(text);
  if (!isPlainObject(data)) throw new Error('[livelocale] A locale file is not a JSON object.');
  for (const edit of edits) setNestedProperty(data, edit.innerKey, edit.value);
  return stringifyLike(data, text);
}

export interface RemoteLocales {
  /** The commit the files were read at. */
  sha: string;
  targets: Map<string, LocaleTarget>;
  /** Repository path → text of every locale file read. */
  files: Map<string, string>;
}

interface ContentEntry {
  name: string;
  path: string;
  sha: string;
  type: string;
}

async function listDir(rest: GitHubRest, dir: string, ref: string): Promise<ContentEntry[] | null> {
  const res = await rest.api<ContentEntry[]>('GET', `/contents/${encodeRefPath(dir)}`, {
    query: { ref },
    allow404: true,
  });
  return Array.isArray(res.data) ? res.data : null;
}

/** Reads a blob by SHA; the blob API has no 1 MB limit, unlike the contents API. */
async function readBlob(rest: GitHubRest, sha: string): Promise<string> {
  const res = await rest.api<{ content: string; encoding: string }>(
    'GET',
    `/git/blobs/${encodeURIComponent(sha)}`
  );
  return decodeBase64Utf8(res.data?.content ?? '');
}

function parseLocaleFile(text: string, file: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`[livelocale] ${file} is not valid JSON.`);
  }
  if (!isPlainObject(data)) throw new Error(`[livelocale] ${file} is not a JSON object.`);
  return data;
}

/**
 * Reads each locale's file(s) under `localesDir` at `commitSha`. A namespaced
 * locale merges its files under the namespace name; a locale with no file
 * gives a null target.
 */
export async function readRemoteLocales(
  rest: GitHubRest,
  commitSha: string,
  localesDir: string,
  locales: string[]
): Promise<RemoteLocales> {
  const dir = normalizeRepoDir(localesDir);
  const entries = await listDir(rest, dir, commitSha);
  if (entries === null) {
    throw new Error(`[livelocale] No locales folder at ${dir || '.'} on the target.`);
  }

  const targets = new Map<string, LocaleTarget>();
  const files = new Map<string, string>();
  for (const locale of locales) {
    if (targets.has(locale)) continue;
    const flat = entries.find((e) => e.type === 'file' && e.name === `${locale}.json`);
    const folder = entries.find((e) => e.type === 'dir' && e.name === locale);
    if (!isValidLocaleFormat(locale) || (!flat && !folder)) {
      targets.set(locale, null);
      continue;
    }
    if (flat) {
      const file = joinRepoPath(dir, flat.name);
      const text = await readBlob(rest, flat.sha);
      files.set(file, text);
      targets.set(locale, { layout: 'flat', dict: parseLocaleFile(text, file) });
      continue;
    }
    const dict: Record<string, unknown> = {};
    for (const entry of (await listDir(rest, joinRepoPath(dir, locale), commitSha)) ?? []) {
      if (entry.type !== 'file' || !entry.name.endsWith('.json')) continue;
      const file = joinRepoPath(dir, `${locale}/${entry.name}`);
      const text = await readBlob(rest, entry.sha);
      files.set(file, text);
      dict[entry.name.slice(0, -'.json'.length)] = parseLocaleFile(text, file);
    }
    targets.set(locale, { layout: 'namespaced', dict });
  }
  return { sha: commitSha, targets, files };
}

/**
 * The new text of every locale file the plan's `apply` edits change, keyed by
 * repository path. Throws when an edit would land outside `<localesDir>/`.
 * The edits are layered on `baseFiles` when given (the open pull request
 * branch's head in append mode, so its earlier commits survive), falling back
 * to the target's text for a file the branch does not hold.
 */
export function buildFileChanges(
  localesDir: string,
  plan: ApplyPlan,
  remote: RemoteLocales,
  baseFiles?: Map<string, string>
): Map<string, string> {
  const dir = normalizeRepoDir(localesDir);
  const prefix = dir === '' ? '' : `${dir}/`;
  const byFile = new Map<string, { innerKey: string; value: string }[]>();
  for (const edit of plan.edits) {
    if (edit.status !== 'apply') continue;
    const layout = remote.targets.get(edit.locale)?.layout ?? 'flat';
    const { file, innerKey } = localeFileFor(dir, layout, edit.locale, edit.key);
    const normalized = path.posix.normalize(file);
    if (
      normalized !== file ||
      normalized.startsWith('../') ||
      normalized.startsWith('/') ||
      !normalized.startsWith(prefix)
    ) {
      throw new Error(
        `[livelocale] Refusing to write ${file}: it is outside the locales folder ${dir || '.'}.`
      );
    }
    const list = byFile.get(file) ?? [];
    list.push({ innerKey, value: edit.to });
    byFile.set(file, list);
  }

  const changes = new Map<string, string>();
  for (const [file, edits] of byFile) {
    const text = baseFiles?.get(file) ?? remote.files.get(file);
    if (text === undefined) {
      throw new Error(`[livelocale] ${file} was not read from the target.`);
    }
    const next = applyEditsToText(text, edits);
    if (next !== text) changes.set(file, next);
  }
  return changes;
}

export type BranchPlan = { branch: string; parentSha: string; mode: 'new' | 'append' };

/** base = the target branch; an existing ref is appended to only when it has an open PR into that same base. */
export async function prepareBranch(
  rest: GitHubRest,
  baseName: string,
  base: string,
  targetSha: string,
  runId: string
): Promise<BranchPlan> {
  const head = await rest.refSha(baseName);
  if (head === null) return { branch: baseName, parentSha: targetSha, mode: 'new' };
  if (await rest.findOpenPullRequest(baseName, base)) {
    return { branch: baseName, parentSha: head, mode: 'append' };
  }
  return { branch: `${baseName}-${runId}`, parentSha: targetSha, mode: 'new' };
}

/**
 * Writes `files` as one commit on top of the plan's parent: blobs, a tree on
 * the parent's tree, the commit (author only), then a new ref or a
 * fast-forward (`force: false`). Unchanged when the tree equals the parent's.
 */
export async function commitFiles(
  rest: GitHubRest,
  input: {
    branchPlan: BranchPlan;
    files: Map<string, string>;
    message: string;
    author: { name: string; email: string };
  }
): Promise<{ sha: string } | { sha: null; unchanged: true }> {
  const { branch, parentSha, mode } = input.branchPlan;
  if (!branch.startsWith(BRANCH_PREFIX)) {
    throw new Error(`[livelocale] Refusing to write "${branch}": only ${BRANCH_PREFIX}* branches.`);
  }
  if (input.files.size === 0) return { sha: null, unchanged: true };

  const parent = await rest.api<{ tree: { sha: string } }>(
    'GET',
    `/git/commits/${encodeURIComponent(parentSha)}`
  );
  const baseTree = parent.data!.tree.sha;

  const entries: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];
  for (const [file, text] of input.files) {
    const blob = await rest.api<{ sha: string }>('POST', '/git/blobs', {
      body: { content: encodeBase64Utf8(text), encoding: 'base64' },
    });
    entries.push({ path: file, mode: '100644', type: 'blob', sha: blob.data!.sha });
  }

  const tree = await rest.api<{ sha: string }>('POST', '/git/trees', {
    body: { base_tree: baseTree, tree: entries },
  });
  const treeSha = tree.data!.sha;
  if (treeSha === baseTree) return { sha: null, unchanged: true };

  const commit = await rest.api<{ sha: string }>('POST', '/git/commits', {
    body: { message: input.message, tree: treeSha, parents: [parentSha], author: input.author },
  });
  const sha = commit.data!.sha;

  if (mode === 'new') {
    await rest.api('POST', '/git/refs', { body: { ref: `refs/heads/${branch}`, sha } });
  } else {
    await rest.api('PATCH', `/git/refs/heads/${encodeRefPath(branch)}`, {
      body: { sha, force: false },
    });
  }
  return { sha };
}

/** The commit identity of a GitHub user through their noreply address. */
export function noreplyAuthor(actor: { login: string; id: number }): {
  name: string;
  email: string;
} {
  return { name: actor.login, email: `${actor.id}+${actor.login}@users.noreply.github.com` };
}
