// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveBuildInfo, parseGitHubSlug, runGit } from '../../src/server/build-info.js';
import { fakeGit } from './helpers/fake-git.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = '0123456789abcdef0123456789abcdef01234567';
const SHA_C = 'c0ffee'.repeat(6) + 'beef';

const local = {
  'rev-parse --show-toplevel': '/repo',
  'rev-parse --abbrev-ref HEAD': 'feature/login',
  'rev-parse HEAD': SHA_A,
  'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main',
};

const tempDirs: string[] = [];

function event(obj: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-event-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'event.json');
  fs.writeFileSync(file, JSON.stringify(obj), 'utf-8');
  return file;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function resolve(env: NodeJS.ProcessEnv, answers: Record<string, string | null> = local) {
  return resolveBuildInfo({ cwd: '/repo', env, git: fakeGit(answers) });
}

describe('resolveBuildInfo', () => {
  it('reads a local checkout', async () =>
    expect(await resolveBuildInfo({ cwd: '/repo', env: {}, git: fakeGit(local) })).toStrictEqual({
      repo: null,
      defaultBranch: 'main',
      branch: 'feature/login',
      base: SHA_A,
      gitRoot: path.resolve('/repo'),
    }));

  it('treats a detached HEAD as no branch', async () => {
    const info = await resolve({}, { ...local, 'rev-parse --abbrev-ref HEAD': 'HEAD' });
    expect(info.branch).toBeNull();
  });

  it('prefers GitHub push variables and the event default branch', async () => {
    const info = await resolve({
      GITHUB_SHA: SHA_B,
      GITHUB_REF_NAME: 'main',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_EVENT_PATH: event({ repository: { default_branch: 'trunk' } }),
    });
    expect(info).toMatchObject({ base: SHA_B, branch: 'main', defaultBranch: 'trunk' });
  });

  it('uses the PR head on pull_request events', async () => {
    const info = await resolve({
      GITHUB_HEAD_REF: 'fix/typo',
      GITHUB_REF_NAME: '12/merge',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_SHA: SHA_B,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: event({ pull_request: { head: { sha: SHA_C } } }),
    });
    expect(info).toMatchObject({ branch: 'fix/typo', base: SHA_C });
  });

  it('ignores a tag ref name', async () => {
    const info = await resolve({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.0' });
    expect(info.branch).toBe('feature/login');
  });

  it('skips a branch name the link schema would reject', async () => {
    const info = await resolve({ GITHUB_REF_NAME: '-x', GITHUB_REF_TYPE: 'branch' });
    expect(info.branch).toBe('feature/login');
  });

  it('reads Vercel, Cloudflare Pages and Netlify', async () => {
    expect(
      await resolve({ VERCEL_GIT_COMMIT_REF: 'vercel/branch', VERCEL_GIT_COMMIT_SHA: SHA_B })
    ).toMatchObject({ branch: 'vercel/branch', base: SHA_B });
    expect(
      await resolve({ CF_PAGES_BRANCH: 'pages/branch', CF_PAGES_COMMIT_SHA: SHA_C })
    ).toMatchObject({ branch: 'pages/branch', base: SHA_C });
    expect(
      await resolve({ NETLIFY: 'true', BRANCH: 'netlify/branch', COMMIT_REF: SHA_B })
    ).toMatchObject({ branch: 'netlify/branch', base: SHA_B });
    expect(await resolve({ BRANCH: 'netlify/branch', COMMIT_REF: SHA_B })).toMatchObject({
      branch: 'feature/login',
      base: SHA_A,
    });
  });

  it('skips an invalid SHA and lowercases a valid one', async () => {
    expect((await resolve({ GITHUB_SHA: 'not-a-sha' })).base).toBe(SHA_A);
    expect((await resolve({ GITHUB_SHA: SHA_B.toUpperCase() })).base).toBe(SHA_B);
  });

  it('never asks git for the remote unless includeRepo', async () => {
    const git = fakeGit(local);
    const info = await resolveBuildInfo({
      cwd: '/repo',
      env: { GITHUB_REPOSITORY: 'acme/site' },
      git,
    });
    expect(info.repo).toBeNull();
    expect(git.calls.some((c) => c.startsWith('remote'))).toBe(false);
  });

  it('reads the repo from GitHub, Vercel and the origin remote', async () => {
    const withRemote = { ...local, 'remote get-url origin': 'git@github.com:acme/site.git' };
    const repoOf = async (env: NodeJS.ProcessEnv, answers: Record<string, string | null>) =>
      (await resolveBuildInfo({ cwd: '/repo', env, git: fakeGit(answers), includeRepo: true }))
        .repo;
    expect(await repoOf({ GITHUB_REPOSITORY: 'acme/site' }, local)).toBe('acme/site');
    expect(
      await repoOf(
        {
          VERCEL_GIT_PROVIDER: 'github',
          VERCEL_GIT_REPO_OWNER: 'acme',
          VERCEL_GIT_REPO_SLUG: 'site',
        },
        local
      )
    ).toBe('acme/site');
    expect(await repoOf({}, withRemote)).toBe('acme/site');
    expect(
      await repoOf(
        { GITHUB_REPOSITORY: 'other/repo', GITHUB_SERVER_URL: 'https://ghe.acme.com' },
        withRemote
      )
    ).toBe('acme/site');
    expect(
      await repoOf(
        {
          VERCEL_GIT_PROVIDER: 'gitlab',
          VERCEL_GIT_REPO_OWNER: 'acme',
          VERCEL_GIT_REPO_SLUG: 'site',
        },
        local
      )
    ).toBeNull();
  });

  it('returns all nulls without git or CI', async () =>
    expect(await resolveBuildInfo({ cwd: '/repo', env: {}, git: fakeGit({}) })).toStrictEqual({
      repo: null,
      defaultBranch: null,
      branch: null,
      base: null,
      gitRoot: null,
    }));
});

describe('parseGitHubSlug', () => {
  it.each([
    ['https://github.com/acme/site.git', 'acme/site'],
    ['https://x-access-token:ghs_abc@github.com/acme/site', 'acme/site'],
    ['git@github.com:acme/site.git', 'acme/site'],
    ['ssh://git@github.com/acme/site.git', 'acme/site'],
    ['https://github.com/acme/site/', 'acme/site'],
    ['https://gitlab.com/acme/site.git', null],
    ['https://github.com.evil.com/acme/site', null],
    ['git@github.com:acme', null],
  ])('parseGitHubSlug(%s)', (input, out) => expect(parseGitHubSlug(input)).toBe(out));
});

describe('runGit', () => {
  it('runGit returns null outside a repository', async () =>
    expect(await runGit(['rev-parse', '--show-toplevel'], os.tmpdir())).toBeNull());
});
