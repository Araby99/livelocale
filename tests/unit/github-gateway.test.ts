// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGitHubGateway } from '../../src/server/github-gateway.js';

/**
 * A minimal in-memory GitHub REST API covering what the gateway uses:
 * refs, contents (get/put/delete, file or directory), compare, and pulls.
 */
class FakeGitHub {
  branches: Record<string, Record<string, string>> = {}; // branch -> path -> content
  pulls: { number: number; head: string; base: string; title: string; state: string }[] = [];
  calls: { method: string; path: string; body?: any }[] = [];
  /** Permissions of the token, as probed by checkAccess. */
  canWriteContents = true;
  canWritePulls = true;
  /** When > 0, this many upcoming PUTs fail with 409 as if another writer won the race. */
  forcedConflicts = 0;

  constructor(main: Record<string, string>) {
    this.branches['main'] = { ...main };
  }

  private sha(branch: string, p?: string): string {
    const content = p ? (this.branches[branch]?.[p] ?? '') : JSON.stringify(this.branches[branch]);
    let h = 0;
    for (const ch of content + branch + (p ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h.toString(16).padStart(8, '0');
  }

  fetch = vi.fn(async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.pathname.replace(/^\/repos\/acme\/site/, '');
    this.calls.push({ method, path, body });
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    if (!/^Bearer \S+$/.test((init.headers as any)?.Authorization ?? '')) {
      return json(401, { message: 'Bad credentials' });
    }

    if (path === '' && method === 'GET') return json(200, { full_name: 'acme/site' });
    if (path === '/git/blobs' && method === 'POST') {
      if (!this.canWriteContents) return json(403, { message: 'Resource not accessible' });
      return json(422, { message: 'Invalid request' });
    }

    // Refs
    let m = /^\/git\/ref\/heads\/(.+)$/.exec(path);
    if (m && method === 'GET') {
      const b = decodeURIComponent(m[1]!);
      return this.branches[b]
        ? json(200, { object: { sha: this.sha(b) } })
        : json(404, { message: 'Not Found' });
    }
    if (path === '/git/refs' && method === 'POST') {
      const b = body.ref.replace('refs/heads/', '');
      const source = Object.keys(this.branches).find((x) => this.sha(x) === body.sha);
      this.branches[b] = { ...(this.branches[source ?? 'main'] ?? {}) };
      return json(201, { ref: body.ref });
    }
    m = /^\/git\/refs\/heads\/(.+)$/.exec(path);
    if (m && method === 'PATCH') {
      const b = decodeURIComponent(m[1]!);
      const source = Object.keys(this.branches).find((x) => this.sha(x) === body.sha);
      this.branches[b] = { ...(this.branches[source ?? 'main'] ?? {}) };
      return json(200, { ref: `refs/heads/${b}` });
    }

    // Contents
    m = /^\/contents\/(.+)$/.exec(path);
    if (m) {
      const p = decodeURIComponent(m[1]!);
      const branch = url.searchParams.get('ref') ?? body?.branch ?? 'main';
      const files = this.branches[branch];
      if (!files) return json(404, { message: 'Branch not found' });
      if (method === 'GET') {
        if (files[p] !== undefined) {
          return json(200, {
            type: 'file',
            path: p,
            sha: this.sha(branch, p),
            encoding: 'base64',
            content: Buffer.from(files[p]!, 'utf-8').toString('base64'),
          });
        }
        const children = Object.keys(files).filter((f) => f.startsWith(p + '/'));
        if (children.length === 0) return json(404, { message: 'Not Found' });
        const entries = new Map<string, { type: string; name: string; path: string }>();
        for (const f of children) {
          const rest = f.slice(p.length + 1);
          const [name, ...more] = rest.split('/');
          entries.set(name!, {
            type: more.length ? 'dir' : 'file',
            name: name!,
            path: `${p}/${name}`,
          });
        }
        return json(200, Array.from(entries.values()));
      }
      if (method === 'PUT') {
        if (this.forcedConflicts > 0) {
          this.forcedConflicts -= 1;
          return json(409, { message: 'is at abc but expected def' });
        }
        if (files[p] !== undefined && body.sha !== this.sha(branch, p))
          return json(409, { message: 'sha mismatch' });
        if (files[p] === undefined && body.sha)
          return json(422, { message: 'sha given for new file' });
        files[p] = Buffer.from(body.content, 'base64').toString('utf-8');
        return json(files[p] !== undefined ? 200 : 201, {
          content: { path: p, sha: this.sha(branch, p) },
          commit: { sha: this.sha(branch) },
        });
      }
      if (method === 'DELETE') {
        if (files[p] === undefined) return json(404, { message: 'Not Found' });
        delete files[p];
        return json(200, { commit: { sha: this.sha(branch) } });
      }
    }

    // Compare
    m = /^\/compare\/(.+)\.\.\.(.+)$/.exec(path);
    if (m && method === 'GET') {
      const base = this.branches[decodeURIComponent(m[1]!)] ?? {};
      const head = this.branches[decodeURIComponent(m[2]!)] ?? {};
      const out: any[] = [];
      for (const f of new Set([...Object.keys(base), ...Object.keys(head)])) {
        if (base[f] === head[f]) continue;
        const status =
          base[f] === undefined ? 'added' : head[f] === undefined ? 'removed' : 'modified';
        out.push({ filename: f, status, patch: `-${base[f] ?? ''}\n+${head[f] ?? ''}` });
      }
      return json(200, { files: out });
    }

    // Pulls
    if (path === '/pulls' && method === 'GET') {
      const head = url.searchParams.get('head');
      const open = this.pulls.filter((p) => p.state === 'open' && `acme:${p.head}` === head);
      return json(
        200,
        open.map((p) => ({
          number: p.number,
          html_url: `https://github.com/acme/site/pull/${p.number}`,
        }))
      );
    }
    if (path === '/pulls' && method === 'POST') {
      if (!this.canWritePulls) return json(403, { message: 'Resource not accessible' });
      if (!body?.head) return json(422, { message: 'Validation Failed' });
      const number = this.pulls.length + 1;
      this.pulls.push({
        number,
        head: body.head,
        base: body.base,
        title: body.title,
        state: 'open',
      });
      return json(201, { number, html_url: `https://github.com/acme/site/pull/${number}` });
    }

    return json(404, { message: `unhandled ${method} ${path}` });
  });
}

const MAIN_FILES = {
  'locales/en.json': '{\n  "home": {\n    "title": "Hello"\n  }\n}\n',
  'locales/ar.json': '{\n  "home": {\n    "title": "مرحبا"\n  }\n}\n',
  'src/app.ts': 'export {};\n',
};

describe('createGitHubGateway', () => {
  let github: FakeGitHub;
  const make = () =>
    createGitHubGateway({
      repo: 'acme/site',
      branch: 'i18n/preview-edits',
      baseBranch: 'main',
      token: 'ghp_test',
      fetchImpl: github.fetch as unknown as typeof fetch,
    });

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('I18N_LENS', 'preview');
    github = new FakeGitHub(MAIN_FILES);
  });

  it('lists locales from the branch, creating the branch from base on first use', async () => {
    const gw = make();
    const locales = await gw.listLocales('locales');
    expect(locales).toEqual(['ar', 'en']);
    expect(github.branches['i18n/preview-edits']).toBeDefined();
    expect(github.calls.some((c) => c.method === 'POST' && c.path === '/git/refs')).toBe(true);
  });

  it('reads a locale dictionary from the branch', async () => {
    const gw = make();
    const data = await gw.readLocale('locales', 'en');
    expect(data).toEqual({ home: { title: 'Hello' } });
  });

  it('writes a key as a commit on the branch, preserving formatting', async () => {
    const gw = make();
    await gw.updateLocaleKey('locales', 'en', 'home.title', 'Hi there');
    expect(github.branches['i18n/preview-edits']!['locales/en.json']).toBe(
      '{\n  "home": {\n    "title": "Hi there"\n  }\n}\n'
    );
    // Base branch untouched
    expect(github.branches['main']!['locales/en.json']).toContain('"Hello"');
    const put = github.calls.find((c) => c.method === 'PUT');
    expect(put?.body.branch).toBe('i18n/preview-edits');
    expect(put?.body.message).toContain('home.title');
  });

  it('creates a missing locale file on write and adds, renames, and deletes locales', async () => {
    const gw = make();
    await gw.addLocale('locales', 'fr');
    expect(github.branches['i18n/preview-edits']!['locales/fr.json']).toBe('{}\n');

    await gw.updateLocaleKey('locales', 'fr', 'home.title', 'Bonjour');
    expect(JSON.parse(github.branches['i18n/preview-edits']!['locales/fr.json']!)).toEqual({
      home: { title: 'Bonjour' },
    });

    await gw.renameLocale('locales', 'fr', 'fr-CA');
    expect(github.branches['i18n/preview-edits']!['locales/fr.json']).toBeUndefined();
    expect(github.branches['i18n/preview-edits']!['locales/fr-CA.json']).toContain('Bonjour');

    await gw.deleteLocale('locales', 'fr-CA');
    expect(github.branches['i18n/preview-edits']!['locales/fr-CA.json']).toBeUndefined();
    expect(await gw.listLocales('locales')).toEqual(['ar', 'en']);
  });

  it('rejects prototype-pollution key paths', async () => {
    const gw = make();
    await expect(gw.updateLocaleKey('locales', 'en', '__proto__.x', 'y')).rejects.toThrow(
      /forbidden/i
    );
  });

  it('returns locale keys as metadata (no code scan in preview mode)', async () => {
    const gw = make();
    const meta = await gw.getKeysMetadata('locales');
    expect(meta.allKeys).toEqual(['home.title']);
    expect(meta.codeKeys).toEqual([]);
  });

  it('reports status and diff of locale changes between base and branch', async () => {
    const gw = make();
    const clean = await gw.status('locales');
    expect(clean).toMatchObject({ isRepo: true, branch: 'i18n/preview-edits', mode: 'github' });
    expect(clean.changes).toEqual([]);
    expect(clean.pullRequestUrl).toBeNull();

    await gw.updateLocaleKey('locales', 'en', 'home.title', 'Hi');
    await gw.addLocale('locales', 'de');
    const dirty = await gw.status('locales');
    expect(dirty.changes).toEqual(
      expect.arrayContaining([
        { path: 'locales/en.json', status: 'modified' },
        { path: 'locales/de.json', status: 'added' },
      ])
    );
    const diff = await gw.diff('locales');
    expect(diff).toContain('locales/en.json');
    expect(diff).toContain('+');
    expect(diff).not.toContain('src/app.ts');
  });

  it('opens a pull request on commit and reports its URL afterwards', async () => {
    const gw = make();
    await gw.updateLocaleKey('locales', 'en', 'home.title', 'Hi');
    const result = await gw.commit('locales', 'i18n: update home title');
    expect(result.hash).toBe('https://github.com/acme/site/pull/1');
    expect(github.pulls[0]).toMatchObject({ head: 'i18n/preview-edits', base: 'main' });

    // A second commit reuses the open pull request instead of opening another
    const again = await gw.commit('locales', 'more');
    expect(again.hash).toBe('https://github.com/acme/site/pull/1');
    expect(github.pulls).toHaveLength(1);
    expect((await gw.status('locales')).pullRequestUrl).toBe('https://github.com/acme/site/pull/1');
  });

  it('refuses to open a pull request when there are no locale changes', async () => {
    const gw = make();
    await expect(gw.commit('locales', 'nothing')).rejects.toThrow(/no changes/i);
  });

  it('discards by resetting the branch to base', async () => {
    const gw = make();
    await gw.updateLocaleKey('locales', 'en', 'home.title', 'Hi');
    await gw.discard('locales');
    expect(github.branches['i18n/preview-edits']!['locales/en.json']).toContain('"Hello"');
    expect((await gw.status('locales')).changes).toEqual([]);
  });

  it('keeps every edit when saves to one file run concurrently', async () => {
    const gw = make();
    await Promise.all(
      ['a', 'b', 'c', 'd'].map((k) => gw.updateLocaleKey('locales', 'en', `race.${k}`, k))
    );
    const data = JSON.parse(github.branches['i18n/preview-edits']!['locales/en.json']!);
    expect(data.race).toEqual({ a: 'a', b: 'b', c: 'c', d: 'd' });
  });

  it('keeps every edit when two server instances save the same file at once', async () => {
    const a = make();
    const b = make();
    await a.listLocales('locales'); // create the branch first
    await Promise.all([
      a.updateLocaleKey('locales', 'en', 'race.a', 'A'),
      b.updateLocaleKey('locales', 'en', 'race.b', 'B'),
    ]);
    const data = JSON.parse(github.branches['i18n/preview-edits']!['locales/en.json']!);
    expect(data.race).toEqual({ a: 'A', b: 'B' });
  });

  it('re-reads and retries a save that loses a race, then gives up', async () => {
    const gw = make();
    github.forcedConflicts = 2;
    await gw.updateLocaleKey('locales', 'en', 'home.title', 'After retry');
    expect(github.branches['i18n/preview-edits']!['locales/en.json']).toContain('After retry');

    github.forcedConflicts = 10;
    await expect(gw.updateLocaleKey('locales', 'en', 'home.title', 'Never')).rejects.toThrow(/409/);
    expect(github.forcedConflicts).toBe(6); // four attempts, then the error surfaces
  });

  describe('checkAccess', () => {
    it('reports nothing when the token can write contents and pull requests', async () => {
      expect(await make().checkAccess()).toEqual([]);
    });

    it('names the missing permissions without creating anything', async () => {
      github.canWriteContents = false;
      github.canWritePulls = false;
      const problems = await make().checkAccess();
      expect(problems).toHaveLength(2);
      expect(problems[0]).toMatch(/Contents: Read and write/);
      expect(problems[1]).toMatch(/Pull requests: Read and write/);
      expect(github.pulls).toEqual([]);
    });

    it('reports a missing base branch', async () => {
      const gw = createGitHubGateway({
        repo: 'acme/site',
        branch: 'edits',
        baseBranch: 'develop',
        token: 'ghp_test',
        fetchImpl: github.fetch as unknown as typeof fetch,
      });
      expect(await gw.checkAccess()).toEqual([
        'Base branch "develop" does not exist in acme/site.',
      ]);
    });

    it('reports an empty or rejected token', async () => {
      const opts = {
        repo: 'acme/site',
        branch: 'edits',
        fetchImpl: github.fetch as unknown as typeof fetch,
      };
      expect(await createGitHubGateway({ ...opts, token: '' }).checkAccess()).toEqual([
        'No GitHub token configured (github.token / GITHUB_TOKEN is empty).',
      ]);
      expect(await createGitHubGateway({ ...opts, token: 'bad token' }).checkAccess()).toEqual([
        'The GitHub token is invalid or expired.',
      ]);
    });
  });

  it('surfaces GitHub errors with the API message', async () => {
    const gw = createGitHubGateway({
      repo: 'acme/site',
      branch: 'i18n/preview-edits',
      baseBranch: 'main',
      token: '',
      fetchImpl: github.fetch as unknown as typeof fetch,
    });
    await expect(gw.listLocales('locales')).rejects.toThrow(/Bad credentials/);
  });
});
