// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGitHubRest,
  decodeBase64Utf8,
  encodeBase64Utf8,
  encodeRefPath,
  GitHubApiError,
  isPullRequestCreationForbidden,
  type GitHubRest,
} from '../../src/server/github-rest.js';

let calls: { method: string; path: string; body?: unknown }[];
let openPulls: { number: number; html_url: string }[];
let rest: GitHubRest;

beforeEach(() => {
  calls = [];
  openPulls = [];
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, ...(body !== undefined ? { body } : {}) });
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.pathname === '/repos/acme/site/pulls' && method === 'GET') {
      const matches =
        url.searchParams.get('head') === 'acme:livelocale/issue-7' &&
        url.searchParams.get('base') === 'main' &&
        url.searchParams.get('state') === 'open';
      return json(200, matches ? openPulls : []);
    }
    if (url.pathname === '/repos/acme/site/pulls' && method === 'POST') {
      return json(201, { number: 10, html_url: 'https://github.com/acme/site/pull/10' });
    }
    if (/^\/repos\/acme\/site\/pulls\/\d+$/.test(url.pathname) && method === 'PATCH') {
      return json(200, {});
    }
    if (url.pathname === '/repos/acme/site/git/ref/heads/livelocale/issue-7') {
      return json(200, { object: { sha: 'abc123' } });
    }
    return json(404, { message: 'Not Found' });
  }) as typeof fetch;
  rest = createGitHubRest({ repo: 'acme/site', token: 't0ken', fetchImpl });
});

describe('github-rest', () => {
  it('round-trips UTF-8 through portable base64', () => {
    expect(decodeBase64Utf8(encodeBase64Utf8('مرحبا {name} ✓'))).toBe('مرحبا {name} ✓');
    expect(decodeBase64Utf8('2YXYsdit2KjYpw==\n')).toBe('مرحبا');
  });

  it('reuses an open pull request and refreshes its body when asked', async () => {
    openPulls = [{ number: 9, html_url: 'https://github.com/acme/site/pull/9' }];
    const r = await rest.openOrReusePullRequest({
      head: 'livelocale/issue-7',
      base: 'main',
      title: 't',
      body: 'b2',
      updateBodyIfReused: true,
    });
    expect(r).toEqual({ number: 9, url: 'https://github.com/acme/site/pull/9', reused: true });
    expect(calls).toContainEqual({
      method: 'PATCH',
      path: '/repos/acme/site/pulls/9',
      body: { body: 'b2' },
    });
  });

  it('opens a new pull request when none is open', async () => {
    const r = await rest.openOrReusePullRequest({
      head: 'livelocale/issue-7',
      base: 'main',
      title: 't',
      body: 'b',
    });
    expect(r).toEqual({ number: 10, url: 'https://github.com/acme/site/pull/10', reused: false });
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/repos/acme/site/pulls',
      body: { title: 't', head: 'livelocale/issue-7', base: 'main', body: 'b' },
    });
  });

  it('recognises the "Actions may not create pull requests" refusal', () => {
    expect(
      isPullRequestCreationForbidden(
        new GitHubApiError(
          'GitHub API 403 on POST /pulls: GitHub Actions is not permitted to create or approve pull requests.',
          403
        )
      )
    ).toBe(true);
    expect(
      isPullRequestCreationForbidden(
        new GitHubApiError('GitHub API 403 on POST /pulls: Forbidden.', 403)
      )
    ).toBe(false);
  });

  it('encodes each ref segment', () =>
    expect(encodeRefPath('livelocale/issue 7')).toBe('livelocale/issue%207'));

  it('reads a branch sha, and null for a missing branch', async () => {
    expect(await rest.refSha('livelocale/issue-7')).toBe('abc123');
    expect(await rest.refSha('gone')).toBeNull();
  });
});
