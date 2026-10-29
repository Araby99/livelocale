// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { fencedChangeBlock } from '../../src/core/change-link.js';
import {
  PASTE_HERE_BODY,
  buildIssueRequest,
  issueTitle,
  normalizeRepoSlug,
  resolveReviewRepo,
} from '../../src/studio/share/github-issue.js';

describe('normalizeRepoSlug', () => {
  it('normalizes slugs and GitHub URLs', () => {
    expect(normalizeRepoSlug('acme/web')).toBe('acme/web');
    expect(normalizeRepoSlug('https://github.com/acme/web')).toBe('acme/web');
    expect(normalizeRepoSlug('https://github.com/acme/web.git')).toBe('acme/web');
    expect(normalizeRepoSlug('https://github.com/acme/web/')).toBe('acme/web');
    expect(normalizeRepoSlug('git@github.com:acme/web.git')).toBe('acme/web');
  });

  it('rejects anything that is not owner/repo', () => {
    for (const input of [
      'acme',
      'acme/web/x',
      '-acme/web',
      'acme/..',
      'https://gitlab.com/acme/web',
    ]) {
      expect(normalizeRepoSlug(input)).toBeNull();
    }
  });
});

describe('resolveReviewRepo', () => {
  it('prefers the manifest repo over the remembered one', () => {
    expect(resolveReviewRepo('acme/web', 'acme/old')).toBe('acme/web');
    expect(resolveReviewRepo(undefined, 'acme/old')).toBe('acme/old');
    expect(resolveReviewRepo(undefined, null)).toBeNull();
  });
});

describe('buildIssueRequest', () => {
  it('puts only title and body in the URL', () => {
    const r = buildIssueRequest('acme/web', 'lc1.abc', 2, 'Sara');
    const url = new URL(r.url!);
    expect([...url.searchParams.keys()]).toEqual(['title', 'body']);
    expect(url.origin).toBe('https://github.com');
    expect(url.pathname).toBe('/acme/web/issues/new');
    expect(url.searchParams.get('title')).toBe('LiveLocale: 2 translation changes from Sara');
    expect(url.searchParams.get('body')).toBe(fencedChangeBlock('lc1.abc'));
    expect(r).toMatchObject({ clipboard: null, tooLarge: false });
  });

  it('titles by count and sender', () => {
    expect(issueTitle(1)).toBe('LiveLocale: 1 translation change');
    expect(issueTitle(3, 'Sara')).toBe('LiveLocale: 3 translation changes from Sara');
    expect(issueTitle(1, '‮evil')).toBe('LiveLocale: 1 translation change from evil');
  });

  it('moves the block to the clipboard past 8000 characters', () => {
    const token = 'lc1.' + 'A'.repeat(9000);
    const r = buildIssueRequest('acme/web', token, 1);
    expect(r.url).not.toBeNull();
    expect(r.url!.length).toBeLessThanOrEqual(8000);
    expect(new URL(r.url!).searchParams.get('body')).toBe(PASTE_HERE_BODY);
    expect(r.clipboard).toBe(fencedChangeBlock(token));
    expect(r.tooLarge).toBe(false);
  });

  it('refuses blocks above 65536 characters', () => {
    const token = 'lc1.' + 'A'.repeat(70_000);
    expect(buildIssueRequest('acme/web', token, 1)).toEqual({
      url: null,
      clipboard: null,
      tooLarge: true,
    });
  });
});
