import type {
  MutationGateway,
  GitGateway,
  GitStatus,
  GitChange,
  GitChangeStatus,
} from './router.js';
import {
  LOCALE_RE,
  isSafeLocaleSegment,
  isValidLocaleFormat,
  isSafeKeyPath,
  DANGEROUS_KEY_SEGMENTS,
} from '../core/validate.js';
import { setNestedProperty, stringifyLike, flattenKeys } from '../core/json-path.js';

export interface GitHubGatewayConfig {
  /** `owner/name` */
  repo: string;
  /** Branch that receives one commit per save; created from `baseBranch` on first use. */
  branch: string;
  /** Pull-request target and the source for creating `branch`. Defaults to `main`. */
  baseBranch?: string;
  /** Token with `contents: write` and `pull_requests: write` on the repository. */
  token: string;
  /** Defaults to `https://api.github.com`; set for GitHub Enterprise Server. */
  apiBase?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/** A gateway that is both the translation store and the review workflow. */
export interface GitHubGateway extends MutationGateway, GitGateway {}

interface ContentFile {
  type: 'file';
  path: string;
  sha: string;
  content: string;
  encoding: string;
}

interface ContentEntry {
  type: 'file' | 'dir' | string;
  name: string;
  path: string;
}

type Contents = ContentFile | ContentEntry[] | null;

/** A non-2xx answer from the GitHub REST API. */
class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/** Attempts per save when another writer changed the file between our read and our write. */
const MAX_WRITE_ATTEMPTS = 4;

/**
 * True when a contents write lost a race: GitHub answers 409 when the blob sha
 * we sent is stale, and 422 when a file we thought was new now exists.
 */
const isWriteConflict = (err: unknown) =>
  err instanceof GitHubApiError &&
  (err.status === 409 || (err.status === 422 && /sha/i.test(err.message)));

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

const normalizeDir = (p: string) =>
  p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');

function mapCompareStatus(status: string): GitChangeStatus {
  switch (status) {
    case 'added':
    case 'copied':
      return 'added';
    case 'removed':
      return 'deleted';
    case 'renamed':
      return 'renamed';
    default:
      return 'modified';
  }
}

/**
 * Stores translations in a GitHub repository branch through the REST API, so
 * a hosted Studio can edit a preview deployment with no local checkout:
 * every save is a commit on `branch`, `commit` opens (or reuses) a pull
 * request to `baseBranch`, and `discard` resets the branch to base.
 *
 * Only paths under the locales directory are ever read or written.
 */
export function createGitHubGateway(config: GitHubGatewayConfig): GitHubGateway {
  const repo = config.repo;
  const branch = config.branch;
  const baseBranch = config.baseBranch ?? 'main';
  const apiBase = (config.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const owner = repo.split('/')[0] ?? '';

  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`[i18n-lens] github.repo must be "owner/name", got "${repo}".`);
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('[i18n-lens] The GitHub gateway needs a global fetch (Node 18+).');
  }

  // ─── Low-level API ───────────────────────────────────────────────────────

  async function api<T = any>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Record<string, string>; allow404?: boolean } = {}
  ): Promise<{ status: number; data: T | null }> {
    const url = new URL(`${apiBase}/repos/${repo}${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
    const response = await fetchImpl(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    let data: any = null;
    try {
      data = await response.json();
    } catch {}
    if (response.status === 404 && options.allow404) return { status: 404, data: null };
    if (!response.ok) {
      const detail = data?.message || 'request failed';
      const hint = /not accessible by/i.test(detail)
        ? ' The token lacks a permission: give it "Contents" and "Pull requests" with "Read and write" on this repository.'
        : '';
      throw new GitHubApiError(
        `GitHub API ${response.status} on ${method} ${path}: ${detail}.${hint}`,
        response.status
      );
    }
    return { status: response.status, data };
  }

  /** Raw status of a request that is expected to fail validation; never throws on 4xx. */
  async function probeStatus(method: string, path: string, body?: unknown): Promise<number> {
    const response = await fetchImpl(`${apiBase}/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    try {
      await response.arrayBuffer();
    } catch {}
    return response.status;
  }

  async function refSha(name: string): Promise<string | null> {
    const res = await api<{ object: { sha: string } }>(
      'GET',
      `/git/ref/heads/${encodeURIComponent(name)}`,
      { allow404: true }
    );
    return res.data?.object?.sha ?? null;
  }

  let branchReady: Promise<void> | null = null;
  function ensureBranch(): Promise<void> {
    if (!branchReady) {
      branchReady = (async () => {
        if (await refSha(branch)) return;
        const base = await refSha(baseBranch);
        if (!base) throw new Error(`Base branch "${baseBranch}" does not exist in ${repo}.`);
        await api('POST', '/git/refs', { body: { ref: `refs/heads/${branch}`, sha: base } });
      })().catch((err) => {
        branchReady = null;
        throw err;
      });
    }
    return branchReady;
  }

  async function getContents(path: string): Promise<Contents> {
    await ensureBranch();
    const res = await api<Contents>('GET', `/contents/${encodePath(path)}`, {
      query: { ref: branch },
      allow404: true,
    });
    return res.data;
  }

  async function readFile(path: string): Promise<{ text: string; sha: string } | null> {
    const contents = await getContents(path);
    if (!contents || Array.isArray(contents) || contents.type !== 'file') return null;
    const text = Buffer.from(contents.content.replace(/\n/g, ''), 'base64').toString('utf-8');
    return { text, sha: contents.sha };
  }

  async function putFile(path: string, text: string, message: string, sha?: string): Promise<void> {
    await ensureBranch();
    await api('PUT', `/contents/${encodePath(path)}`, {
      body: {
        message,
        content: Buffer.from(text, 'utf-8').toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      },
    });
  }

  async function deleteFile(path: string, message: string, sha: string): Promise<void> {
    await api('DELETE', `/contents/${encodePath(path)}`, { body: { message, sha, branch } });
  }

  // Saves to one file are queued in this process, and a save that still loses
  // a race (another serverless instance, another Studio) re-reads and retries.
  const fileQueues = new Map<string, Promise<unknown>>();
  function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const previous = fileQueues.get(path) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    const settled = next.then(
      () => {},
      () => {}
    );
    fileQueues.set(path, settled);
    settled.then(() => {
      if (fileQueues.get(path) === settled) fileQueues.delete(path);
    });
    return next;
  }

  async function retryOnConflict<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (!isWriteConflict(err) || attempt >= MAX_WRITE_ATTEMPTS) throw err;
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
      }
    }
  }

  // ─── Locale layout helpers ───────────────────────────────────────────────

  const flatPath = (base: string, locale: string) => `${normalizeDir(base)}/${locale}.json`;
  const dirPath = (base: string, locale: string) => `${normalizeDir(base)}/${locale}`;

  function assertLocale(locale: string): void {
    if (!isValidLocaleFormat(locale) || !isSafeLocaleSegment(locale)) {
      throw new Error(`[i18n-lens] Invalid locale "${locale}".`);
    }
  }

  async function namespaceFiles(base: string, locale: string): Promise<string[] | null> {
    const contents = await getContents(dirPath(base, locale));
    if (!contents || !Array.isArray(contents)) return null;
    return contents.filter((e) => e.type === 'file' && e.name.endsWith('.json')).map((e) => e.name);
  }

  // ─── MutationGateway ─────────────────────────────────────────────────────

  async function listLocales(basePath: string): Promise<string[]> {
    const contents = await getContents(normalizeDir(basePath));
    if (!contents || !Array.isArray(contents)) return [];
    const set = new Set<string>();
    for (const entry of contents) {
      if (entry.type === 'dir' && LOCALE_RE.test(entry.name)) set.add(entry.name);
      if (entry.type === 'file' && entry.name.endsWith('.json')) {
        const code = entry.name.slice(0, -5);
        if (LOCALE_RE.test(code)) set.add(code);
      }
    }
    return Array.from(set).sort();
  }

  async function readLocale(basePath: string, locale: string): Promise<Record<string, any>> {
    assertLocale(locale);
    const files = await namespaceFiles(basePath, locale);
    if (files) {
      const merged: Record<string, any> = {};
      for (const file of files) {
        const f = await readFile(`${dirPath(basePath, locale)}/${file}`);
        if (!f) continue;
        try {
          merged[file.slice(0, -5)] = JSON.parse(f.text);
        } catch {}
      }
      return merged;
    }
    const flat = await readFile(flatPath(basePath, locale));
    if (!flat) throw new Error(`Locale "${locale}" not found on branch ${branch}.`);
    return JSON.parse(flat.text);
  }

  async function updateLocaleKey(
    basePath: string,
    locale: string,
    keyPath: string,
    value: string
  ): Promise<void> {
    assertLocale(locale);
    if (!isSafeKeyPath(keyPath)) {
      throw new Error(`[i18n-lens] Forbidden key segment in path: "${keyPath}".`);
    }

    let filePath: string;
    let mutationKeyPath = keyPath;
    const files = await namespaceFiles(basePath, locale);
    if (files) {
      const firstDot = keyPath.indexOf('.');
      if (firstDot === -1) {
        throw new Error(
          '[i18n-lens] Invalid namespace key path: must contain at least one nested key.'
        );
      }
      const ns = keyPath.slice(0, firstDot);
      if (DANGEROUS_KEY_SEGMENTS.has(ns)) {
        throw new Error(`[i18n-lens] Forbidden namespace segment in path: "${ns}".`);
      }
      filePath = `${dirPath(basePath, locale)}/${ns}.json`;
      mutationKeyPath = keyPath.slice(firstDot + 1);
    } else {
      filePath = flatPath(basePath, locale);
    }

    await withFileLock(filePath, () =>
      retryOnConflict(async () => {
        const existing = await readFile(filePath);
        let data: Record<string, any> = {};
        if (existing) {
          const parsed = JSON.parse(existing.text);
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('[i18n-lens] Invalid locale file: root must be an object.');
          }
          data = parsed;
        }
        setNestedProperty(data, mutationKeyPath, value);
        await putFile(
          filePath,
          stringifyLike(data, existing?.text ?? null),
          `i18n(${locale}): update ${keyPath}`,
          existing?.sha
        );
      })
    );
  }

  async function localeExists(basePath: string, locale: string): Promise<boolean> {
    if (await namespaceFiles(basePath, locale)) return true;
    return (await readFile(flatPath(basePath, locale))) !== null;
  }

  async function addLocale(basePath: string, locale: string): Promise<void> {
    assertLocale(locale);
    if (await localeExists(basePath, locale)) {
      throw new Error(`[i18n-lens] Locale "${locale}" already exists.`);
    }
    // Mirror the existing layout: if any locale is a folder, create a folder.
    const contents = await getContents(normalizeDir(basePath));
    const referenceDir = Array.isArray(contents)
      ? contents.find((e) => e.type === 'dir' && LOCALE_RE.test(e.name))?.name
      : undefined;
    if (referenceDir) {
      const files = (await namespaceFiles(basePath, referenceDir)) ?? [];
      for (const file of files) {
        await putFile(`${dirPath(basePath, locale)}/${file}`, '{}\n', `i18n: add locale ${locale}`);
      }
    } else {
      await putFile(flatPath(basePath, locale), '{}\n', `i18n: add locale ${locale}`);
    }
  }

  async function renameLocale(
    basePath: string,
    oldLocale: string,
    newLocale: string
  ): Promise<void> {
    assertLocale(oldLocale);
    assertLocale(newLocale);
    if (!(await localeExists(basePath, oldLocale))) {
      throw new Error(`[i18n-lens] Locale "${oldLocale}" does not exist.`);
    }
    if (await localeExists(basePath, newLocale)) {
      throw new Error(`[i18n-lens] Target locale "${newLocale}" already exists.`);
    }
    const message = `i18n: rename locale ${oldLocale} to ${newLocale}`;
    const files = await namespaceFiles(basePath, oldLocale);
    if (files) {
      for (const file of files) {
        const f = await readFile(`${dirPath(basePath, oldLocale)}/${file}`);
        if (!f) continue;
        await putFile(`${dirPath(basePath, newLocale)}/${file}`, f.text, message);
        await deleteFile(`${dirPath(basePath, oldLocale)}/${file}`, message, f.sha);
      }
      return;
    }
    const flat = await readFile(flatPath(basePath, oldLocale));
    if (!flat) return;
    await putFile(flatPath(basePath, newLocale), flat.text, message);
    await deleteFile(flatPath(basePath, oldLocale), message, flat.sha);
  }

  async function deleteLocale(basePath: string, locale: string): Promise<void> {
    assertLocale(locale);
    const message = `i18n: delete locale ${locale}`;
    const files = await namespaceFiles(basePath, locale);
    if (files) {
      for (const file of files) {
        const f = await readFile(`${dirPath(basePath, locale)}/${file}`);
        if (f) await deleteFile(`${dirPath(basePath, locale)}/${file}`, message, f.sha);
      }
      return;
    }
    const flat = await readFile(flatPath(basePath, locale));
    if (!flat) throw new Error(`[i18n-lens] Locale "${locale}" does not exist.`);
    await deleteFile(flatPath(basePath, locale), message, flat.sha);
  }

  async function getKeysMetadata(
    basePath: string
  ): Promise<{ allKeys: string[]; codeKeys: string[] }> {
    const keys = new Set<string>();
    for (const locale of await listLocales(basePath)) {
      try {
        flattenKeys(await readLocale(basePath, locale), '', keys);
      } catch {}
    }
    // Scanning source for t('…') references would need a checkout; preview mode
    // reports locale keys only.
    return { allKeys: Array.from(keys).sort(), codeKeys: [] };
  }

  // ─── GitGateway ──────────────────────────────────────────────────────────

  async function compareFiles(
    basePath: string
  ): Promise<{ filename: string; status: string; patch?: string }[]> {
    await ensureBranch();
    const res = await api<{ files?: { filename: string; status: string; patch?: string }[] }>(
      'GET',
      `/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(branch)}`
    );
    const prefix = `${normalizeDir(basePath)}/`;
    return (res.data?.files ?? []).filter((f) => f.filename.startsWith(prefix));
  }

  async function openPullRequestUrl(): Promise<string | null> {
    const res = await api<{ html_url: string }[]>('GET', '/pulls', {
      query: { head: `${owner}:${branch}`, base: baseBranch, state: 'open' },
    });
    return res.data?.[0]?.html_url ?? null;
  }

  async function status(basePath: string): Promise<GitStatus> {
    const files = await compareFiles(basePath);
    const changes: GitChange[] = files.map((f) => ({
      path: f.filename,
      status: mapCompareStatus(f.status),
    }));
    return {
      isRepo: true,
      branch,
      changes,
      mode: 'github',
      pullRequestUrl: await openPullRequestUrl(),
    };
  }

  async function diff(basePath: string): Promise<string> {
    const files = await compareFiles(basePath);
    return files
      .map(
        (f) =>
          `diff --git a/${f.filename} b/${f.filename}\n--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch ?? '(binary or too large)'}\n`
      )
      .join('');
  }

  async function commit(basePath: string, message: string): Promise<{ hash: string }> {
    const files = await compareFiles(basePath);
    if (files.length === 0) {
      throw new Error(`No changes to propose under ${normalizeDir(basePath)} on ${branch}.`);
    }
    const existing = await openPullRequestUrl();
    if (existing) return { hash: existing };
    const res = await api<{ html_url: string }>('POST', '/pulls', {
      body: {
        title: message,
        head: branch,
        base: baseBranch,
        body: 'Translation changes proposed from the i18n Lens Studio.',
      },
    });
    return { hash: res.data!.html_url };
  }

  async function discard(): Promise<void> {
    const base = await refSha(baseBranch);
    if (!base) throw new Error(`Base branch "${baseBranch}" does not exist in ${repo}.`);
    await ensureBranch();
    await api('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, {
      body: { sha: base, force: true },
    });
  }

  /**
   * Verifies the token, the repository, the base branch, and write access.
   * Write access is probed with deliberately empty requests: GitHub answers
   * 422 (validation failed) when the token has the permission and 403 when it
   * does not, so nothing is created either way.
   */
  async function checkAccess(): Promise<string[]> {
    if (!config.token) {
      return ['No GitHub token configured (github.token / GITHUB_TOKEN is empty).'];
    }
    const repoStatus = await probeStatus('GET', '');
    if (repoStatus === 401) return ['The GitHub token is invalid or expired.'];
    if (repoStatus === 404 || repoStatus === 403) {
      return [`Repository ${repo} was not found, or the token has no access to it.`];
    }
    if (repoStatus >= 400) return [`GitHub answered HTTP ${repoStatus} for ${repo}.`];

    const problems: string[] = [];
    if (!(await refSha(baseBranch))) {
      problems.push(`Base branch "${baseBranch}" does not exist in ${repo}.`);
    }
    if ((await probeStatus('POST', '/git/blobs', {})) === 403) {
      problems.push(
        `The token cannot write to ${repo}: give it "Contents: Read and write" so saves can be committed.`
      );
    }
    if ((await probeStatus('POST', '/pulls', {})) === 403) {
      problems.push(
        `The token cannot open pull requests in ${repo}: give it "Pull requests: Read and write".`
      );
    }
    return problems;
  }

  return {
    checkAccess,
    listLocales,
    readLocale,
    updateLocaleKey,
    addLocale,
    renameLocale,
    deleteLocale,
    getKeysMetadata,
    status,
    diff,
    commit,
    discard,
  };
}
