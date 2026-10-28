/**
 * The GitHub REST calls shared by the hosted-Studio gateway and the
 * `apply --github-event` Action path: authenticated requests scoped to one
 * repository, branch lookups and the open-or-reuse pull request flow.
 *
 * Portable (fetch, TextEncoder and btoa/atob only), so no `Buffer`.
 */

/** A non-2xx answer from the GitHub REST API. */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export interface GitHubRestConfig {
  /** `owner/name` */
  repo: string;
  token: string;
  /** Defaults to `https://api.github.com`; set for GitHub Enterprise Server. */
  apiBase?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export interface GitHubRest {
  readonly repo: string;
  /** `path` is relative to `/repos/{repo}`. Throws `GitHubApiError` on a non-2xx answer. */
  api<T = any>(
    method: string,
    path: string,
    options?: { body?: unknown; query?: Record<string, string>; allow404?: boolean }
  ): Promise<{ status: number; data: T | null }>;
  /** Raw status of a request that is expected to fail validation; never throws on 4xx. */
  probeStatus(method: string, path: string, body?: unknown): Promise<number>;
  /** Head commit of `branch`, or null when the branch does not exist. */
  refSha(branch: string): Promise<string | null>;
  findOpenPullRequest(head: string, base: string): Promise<{ number: number; url: string } | null>;
  openOrReusePullRequest(input: {
    head: string;
    base: string;
    title: string;
    body: string;
    updateBodyIfReused?: boolean;
  }): Promise<{ number: number; url: string; reused: boolean }>;
}

/** `String.fromCharCode` takes one argument per byte, so bytes are spread a chunk at a time. */
const CHUNK_BYTES = 0x8000;

/** Standard base64 (with padding) of the UTF-8 bytes of `text`, as the contents API expects. */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  // One binary string, one btoa call, so no padding lands mid-output.
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_BYTES));
  }
  return btoa(binary);
}

/** Decodes standard base64 to UTF-8 text; GitHub wraps contents at 60 characters with '\n'. */
export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** True for the 403 GitHub gives when Actions may not open pull requests in this repository. */
export function isPullRequestCreationForbidden(err: unknown): boolean {
  return (
    err instanceof GitHubApiError &&
    err.status === 403 &&
    /not permitted to create or approve pull requests/i.test(err.message)
  );
}

/** Encodes each `/`-separated segment of a ref name for use in a URL path. */
export function encodeRefPath(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

export function createGitHubRest(config: GitHubRestConfig): GitHubRest {
  const repo = config.repo;
  const apiBase = (config.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const owner = repo.split('/')[0] ?? '';

  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`[livelocale] github.repo must be "owner/name", got "${repo}".`);
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('[livelocale] The GitHub gateway needs a global fetch (Node 18+).');
  }

  const headers = (hasBody: boolean): Record<string, string> => ({
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  });

  async function api<T = any>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Record<string, string>; allow404?: boolean } = {}
  ): Promise<{ status: number; data: T | null }> {
    const url = new URL(`${apiBase}/repos/${repo}${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
    const response = await fetchImpl(url.toString(), {
      method,
      headers: headers(options.body !== undefined),
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

  async function probeStatus(method: string, path: string, body?: unknown): Promise<number> {
    const response = await fetchImpl(`${apiBase}/repos/${repo}${path}`, {
      method,
      headers: headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    try {
      await response.arrayBuffer();
    } catch {}
    return response.status;
  }

  async function refSha(branch: string): Promise<string | null> {
    const res = await api<{ object: { sha: string } }>(
      'GET',
      `/git/ref/heads/${encodeRefPath(branch)}`,
      { allow404: true }
    );
    return res.data?.object?.sha ?? null;
  }

  async function findOpenPullRequest(
    head: string,
    base: string
  ): Promise<{ number: number; url: string } | null> {
    const res = await api<{ number: number; html_url: string }[]>('GET', '/pulls', {
      query: { head: `${owner}:${head}`, base, state: 'open' },
    });
    const pull = res.data?.[0];
    return pull ? { number: pull.number, url: pull.html_url } : null;
  }

  async function openOrReusePullRequest(input: {
    head: string;
    base: string;
    title: string;
    body: string;
    updateBodyIfReused?: boolean;
  }): Promise<{ number: number; url: string; reused: boolean }> {
    const existing = await findOpenPullRequest(input.head, input.base);
    if (existing) {
      if (input.updateBodyIfReused) {
        await api('PATCH', `/pulls/${existing.number}`, { body: { body: input.body } });
      }
      return { ...existing, reused: true };
    }
    const res = await api<{ number: number; html_url: string }>('POST', '/pulls', {
      body: { title: input.title, head: input.head, base: input.base, body: input.body },
    });
    return { number: res.data!.number, url: res.data!.html_url, reused: false };
  }

  return { repo, api, probeStatus, refSha, findOpenPullRequest, openOrReusePullRequest };
}
