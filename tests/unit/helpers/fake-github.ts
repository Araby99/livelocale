import { createHash } from 'crypto';

/** One recorded request, with a repository-relative, decoded path. */
export interface FakeCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: any;
}

export interface FakePull {
  number: number;
  head: string;
  base: string;
  title: string;
  body: string;
  state: 'open' | 'closed';
  html_url: string;
}

export interface FakeIssue {
  number: number;
  state: string;
  state_reason: string | null;
  body: string;
  user: { login: string; id?: number };
}

interface FakeCommit {
  sha: string;
  tree: string;
  parents: string[];
  message: string;
  author?: { name: string; email: string };
  committer?: { name: string; email: string };
}

const MAX_CONTENTS_BYTES = 1024 * 1024;

const PR_FORBIDDEN = 'GitHub Actions is not permitted to create or approve pull requests.';

function sha1(text: string | Buffer): string {
  return createHash('sha1').update(text).digest('hex');
}

/** Base64 wrapped at 60 characters, as GitHub sends blob content. */
function wrapBase64(buf: Buffer): string {
  return (buf.toString('base64').match(/.{1,60}/g) ?? []).join('\n');
}

/**
 * An in-memory GitHub repository behind a `fetch`: refs, Git Data objects
 * (content-addressed sha1), the contents listing, pulls, issues and their
 * comments, and collaborator permission. Trees are stored flat (path → blob).
 */
export class FakeGitHub {
  readonly repo: string;
  /** branch → commit sha */
  refs: Record<string, string> = {};
  pulls: FakePull[] = [];
  issues: Record<number, FakeIssue> = {};
  /** issue number → comment bodies */
  comments: Record<number, string[]> = {};
  /** Number of `POST /git/commits` calls. */
  commitCount = 0;
  lastCommit: any = null;
  prCreationForbidden = false;
  permission: string;
  calls: FakeCall[] = [];

  private blobs = new Map<string, Buffer>();
  private trees = new Map<string, Map<string, string>>();
  private commits = new Map<string, FakeCommit>();

  constructor(options: { repo?: string; permission?: string } = {}) {
    this.repo = options.repo ?? 'acme/site';
    this.permission = options.permission ?? 'read';
  }

  /** Creates `branch` with one commit holding `files` (path → text); returns its sha. */
  seedBranch(branch: string, files: Record<string, string>): string {
    const tree = new Map<string, string>();
    for (const [p, text] of Object.entries(files)) tree.set(p, this.putBlob(Buffer.from(text)));
    const sha = this.putCommit({
      tree: this.putTree(tree),
      parents: [],
      message: `seed ${branch}`,
    });
    this.refs[branch] = sha;
    return sha;
  }

  /** Text of `file` at the head of `branch` (or at a commit sha); undefined when absent. */
  fileAt(ref: string, file: string): string | undefined {
    const commit = this.commits.get(this.refs[ref] ?? ref);
    const blob = commit && this.trees.get(commit.tree)?.get(file);
    return blob ? this.blobs.get(blob)!.toString('utf-8') : undefined;
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const prefix = `/repos/${this.repo}`;
    const raw = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname;
    const p = raw.split('/').map(decodeURIComponent).join('/');
    const query = Object.fromEntries(url.searchParams);
    this.calls.push({ method, path: p, query, ...(body !== undefined ? { body } : {}) });
    const [status, data] = this.route(method, p, query, body);
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };

  private putBlob(buf: Buffer): string {
    const sha = sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));
    this.blobs.set(sha, buf);
    return sha;
  }

  private putTree(tree: Map<string, string>): string {
    const sorted = [...tree].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const sha = sha1(`tree ${JSON.stringify(sorted)}`);
    this.trees.set(sha, new Map(sorted));
    return sha;
  }

  private putCommit(commit: Omit<FakeCommit, 'sha'>): string {
    const sha = sha1(`commit ${JSON.stringify(commit)}`);
    this.commits.set(sha, { sha, ...commit });
    return sha;
  }

  private isAncestor(ancestor: string, of: string): boolean {
    const seen = new Set<string>();
    const stack = [of];
    while (stack.length > 0) {
      const sha = stack.pop()!;
      if (sha === ancestor) return true;
      if (seen.has(sha)) continue;
      seen.add(sha);
      stack.push(...(this.commits.get(sha)?.parents ?? []));
    }
    return false;
  }

  private nextNumber(): number {
    const used = [...Object.keys(this.issues).map(Number), ...this.pulls.map((x) => x.number)];
    return Math.max(0, ...used) + 1;
  }

  private pullJson(pull: FakePull) {
    return { ...pull, head: { ref: pull.head }, base: { ref: pull.base } };
  }

  private route(
    method: string,
    p: string,
    query: Record<string, string>,
    body: any
  ): [number, unknown] {
    const notFound: [number, unknown] = [404, { message: 'Not Found' }];
    let m: RegExpMatchArray | null;

    // Refs
    if (method === 'GET' && (m = p.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const sha = this.refs[m[1]!];
      return sha ? [200, { ref: `refs/heads/${m[1]}`, object: { sha, type: 'commit' } }] : notFound;
    }
    if (method === 'POST' && p === '/git/refs') {
      const branch = String(body.ref).replace(/^refs\/heads\//, '');
      if (this.refs[branch]) return [422, { message: 'Reference already exists' }];
      if (!this.commits.has(body.sha)) return [422, { message: 'Object does not exist' }];
      this.refs[branch] = body.sha;
      return [201, { ref: body.ref, object: { sha: body.sha, type: 'commit' } }];
    }
    if (method === 'PATCH' && (m = p.match(/^\/git\/refs\/heads\/(.+)$/))) {
      const branch = m[1]!;
      const current = this.refs[branch];
      if (!current) return [422, { message: 'Reference does not exist' }];
      if (body.force !== true && !this.isAncestor(current, body.sha)) {
        return [422, { message: 'Update is not a fast forward' }];
      }
      this.refs[branch] = body.sha;
      return [200, { ref: `refs/heads/${branch}`, object: { sha: body.sha, type: 'commit' } }];
    }

    // Commits
    if (method === 'GET' && (m = p.match(/^\/git\/commits\/([0-9a-f]+)$/))) {
      const c = this.commits.get(m[1]!);
      if (!c) return notFound;
      return [
        200,
        {
          sha: c.sha,
          tree: { sha: c.tree },
          parents: c.parents.map((sha) => ({ sha })),
          message: c.message,
          author: c.author,
        },
      ];
    }
    if (method === 'POST' && p === '/git/commits') {
      this.commitCount += 1;
      if (!this.trees.has(body.tree)) return [422, { message: 'Tree does not exist' }];
      const sha = this.putCommit({
        tree: body.tree,
        parents: body.parents ?? [],
        message: body.message,
        author: body.author,
        ...(body.committer ? { committer: body.committer } : {}),
      });
      this.lastCommit = { ...body, sha };
      return [201, { sha, tree: { sha: body.tree }, message: body.message }];
    }

    // Trees
    if (method === 'POST' && p === '/git/trees') {
      const tree = new Map<string, string>();
      if (body.base_tree) {
        const base = this.trees.get(body.base_tree);
        if (!base) return [422, { message: 'Base tree does not exist' }];
        for (const [k, v] of base) tree.set(k, v);
      }
      for (const entry of body.tree ?? []) {
        if (!this.blobs.has(entry.sha)) return [422, { message: 'Blob does not exist' }];
        tree.set(entry.path, entry.sha);
      }
      return [201, { sha: this.putTree(tree) }];
    }

    // Blobs
    if (method === 'GET' && (m = p.match(/^\/git\/blobs\/([0-9a-f]+)$/))) {
      const buf = this.blobs.get(m[1]!);
      return buf
        ? [200, { sha: m[1], size: buf.length, content: wrapBase64(buf), encoding: 'base64' }]
        : notFound;
    }
    if (method === 'POST' && p === '/git/blobs') {
      const buf =
        body.encoding === 'base64'
          ? Buffer.from(String(body.content), 'base64')
          : Buffer.from(String(body.content), 'utf-8');
      return [201, { sha: this.putBlob(buf) }];
    }

    // Contents (a listing for a folder, a file under 1 MB inline)
    if (method === 'GET' && (m = p.match(/^\/contents\/?(.*)$/))) {
      const ref = query.ref ?? this.refs.main ?? '';
      const commit = this.commits.get(this.refs[ref] ?? ref);
      const tree = commit && this.trees.get(commit.tree);
      if (!tree) return notFound;
      const target = m[1]!.replace(/\/+$/, '');
      const blob = tree.get(target);
      if (blob) {
        const buf = this.blobs.get(blob)!;
        if (buf.length > MAX_CONTENTS_BYTES) {
          return [403, { message: 'This API returns blobs up to 1 MB in size.' }];
        }
        return [
          200,
          {
            type: 'file',
            name: target.split('/').pop(),
            path: target,
            sha: blob,
            size: buf.length,
            content: wrapBase64(buf),
            encoding: 'base64',
          },
        ];
      }
      const dirPrefix = target === '' ? '' : `${target}/`;
      const entries = new Map<string, { name: string; path: string; sha: string; type: string }>();
      for (const [file, sha] of tree) {
        if (!file.startsWith(dirPrefix)) continue;
        const rest = file.slice(dirPrefix.length);
        const slash = rest.indexOf('/');
        const name = slash === -1 ? rest : rest.slice(0, slash);
        if (entries.has(name)) continue;
        entries.set(name, {
          name,
          path: dirPrefix + name,
          sha: slash === -1 ? sha : sha1(`dir ${dirPrefix}${name}`),
          type: slash === -1 ? 'file' : 'dir',
        });
      }
      return entries.size > 0 ? [200, [...entries.values()]] : notFound;
    }

    // Pulls
    if (method === 'GET' && p === '/pulls') {
      const owner = this.repo.split('/')[0];
      const head = query.head?.replace(new RegExp(`^${owner}:`), '');
      const state = query.state ?? 'open';
      const list = this.pulls.filter(
        (x) =>
          (head === undefined || x.head === head) &&
          (query.base === undefined || x.base === query.base) &&
          (state === 'all' || x.state === state)
      );
      return [200, list.map((x) => this.pullJson(x))];
    }
    if (method === 'POST' && p === '/pulls') {
      if (this.prCreationForbidden) return [403, { message: PR_FORBIDDEN }];
      if (!this.refs[body.head]) return [422, { message: 'Validation Failed' }];
      const number = this.nextNumber();
      const pull: FakePull = {
        number,
        head: body.head,
        base: body.base,
        title: body.title ?? '',
        body: body.body ?? '',
        state: 'open',
        html_url: `https://github.com/${this.repo}/pull/${number}`,
      };
      this.pulls.push(pull);
      return [201, this.pullJson(pull)];
    }
    if ((m = p.match(/^\/pulls\/(\d+)$/))) {
      const pull = this.pulls.find((x) => x.number === Number(m![1]));
      if (!pull) return notFound;
      if (method === 'PATCH') {
        for (const k of ['title', 'body', 'state'] as const) {
          if (body[k] !== undefined) pull[k] = body[k];
        }
      }
      if (method === 'GET' || method === 'PATCH') return [200, this.pullJson(pull)];
    }

    // Issues and comments
    if ((m = p.match(/^\/issues\/(\d+)\/comments$/))) {
      const n = Number(m[1]);
      if (!this.issues[n] && !this.pulls.some((x) => x.number === n)) return notFound;
      const list = (this.comments[n] ??= []);
      if (method === 'GET') return [200, list.map((b, i) => ({ id: n * 1000 + i, body: b }))];
      if (method === 'POST') {
        list.push(String(body.body));
        return [201, { id: n * 1000 + list.length - 1, body: body.body }];
      }
    }
    if ((m = p.match(/^\/issues\/(\d+)$/))) {
      const issue = this.issues[Number(m[1])];
      if (!issue) return notFound;
      if (method === 'PATCH') {
        for (const k of ['state', 'state_reason', 'body'] as const) {
          if (body[k] !== undefined) (issue as any)[k] = body[k];
        }
      }
      if (method === 'GET' || method === 'PATCH') return [200, issue];
    }

    // Collaborators
    if (method === 'GET' && (m = p.match(/^\/collaborators\/([^/]+)\/permission$/))) {
      return [200, { permission: this.permission, user: { login: m[1] } }];
    }

    return [404, { message: `FakeGitHub has no route for ${method} ${p}` }];
  }
}
