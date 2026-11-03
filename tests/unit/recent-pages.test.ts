// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readRecentPages,
  recentPagesScope,
  rememberPage,
  suggestPages,
} from '../../src/studio/recent-pages.js';

// writePref's in-memory copy outlives localStorage.clear(), so every test uses its own scope.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recent pages', () => {
  it('remembers most recent first, without duplicates or hash', () => {
    rememberPage('order', '/a');
    rememberPage('order', '/b');
    expect(rememberPage('order', '/a#x')).toEqual(['/a', '/b']);
    expect(readRecentPages('order')).toEqual(['/a', '/b']);
    expect(readRecentPages('order-other')).toEqual([]);
  });

  it('keeps at most 20', () => {
    let list: string[] = [];
    for (let i = 0; i < 25; i++) list = rememberPage('cap', `/p${i}`);
    const expected = Array.from({ length: 20 }, (_, i) => `/p${24 - i}`);
    expect(list).toEqual(expected);
    expect(readRecentPages('cap')).toEqual(expected);
  });

  it('survives corrupt or blocked storage', () => {
    const store = (scope: string, raw: string) =>
      localStorage.setItem(`livelocale:recent-pages:${scope}`, raw);
    store('bad-json', 'not json');
    expect(readRecentPages('bad-json')).toEqual([]);
    store('bad-object', '{}');
    expect(readRecentPages('bad-object')).toEqual([]);
    store('bad-mixed', '[1,"x","/ok",null,"//evil"]');
    expect(readRecentPages('bad-mixed')).toEqual(['/ok']);
    store('bad-long', JSON.stringify(Array.from({ length: 500 }, (_, i) => `/p${i}`)));
    expect(readRecentPages('bad-long')).toHaveLength(20);

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberPage('blocked', '/a')).not.toThrow();
    expect(readRecentPages('blocked')).toEqual(['/a']);
    expect(rememberPage('blocked', '/a')).toEqual(['/a']);
  });

  it('scopes like drafts', () => {
    expect(
      recentPagesScope({
        kind: 'static',
        manifest: { repo: 'acme/site' },
        appUrl: 'https://x.io/demo/',
      })
    ).toBe('acme/site');
    expect(recentPagesScope({ kind: 'static', manifest: {}, appUrl: 'https://x.io/demo/' })).toBe(
      'path:/demo/'
    );
    expect(recentPagesScope({ kind: 'server', appOrigin: 'http://localhost:3000' })).toBe(
      'app:http://localhost:3000'
    );
  });

  it('suggests recent first, then site pages, at most 8', () => {
    expect(suggestPages('', ['/b', '/a'], ['/', '/a', '/c'])).toEqual({
      recent: ['/b', '/a'],
      site: ['/', '/c'],
    });
    expect(suggestPages('ABO', ['/about/'], ['/about/team/'])).toEqual({
      recent: ['/about/'],
      site: ['/about/team/'],
    });
    const recent = Array.from({ length: 10 }, (_, i) => `/r${i}`);
    const site = Array.from({ length: 10 }, (_, i) => `/s${i}`);
    const many = suggestPages('', recent, site);
    expect(many.recent.length).toBe(8);
    expect(many.site.length).toBe(0);
  });
});
