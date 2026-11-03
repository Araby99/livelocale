// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  followNavigation,
  navigationHref,
  readSameOriginParent,
  resolveStudioOrigin,
  DEFAULT_STUDIO_ORIGIN,
  STUDIO_ORIGIN_STORAGE_KEY,
} from '../../src/client/iframe-bridge.js';

describe('resolveStudioOrigin', () => {
  beforeEach(() => sessionStorage.clear());

  it('uses the livelocale-origin query parameter and remembers it for the tab', () => {
    const origin = resolveStudioOrigin(
      '?livelocale-origin=http%3A%2F%2Flocalhost%3A3011',
      sessionStorage
    );
    expect(origin).toBe('http://localhost:3011');
    expect(sessionStorage.getItem(STUDIO_ORIGIN_STORAGE_KEY)).toBe('http://localhost:3011');
  });

  it('keeps the remembered origin after in-app navigation drops the parameter', () => {
    resolveStudioOrigin('?livelocale-origin=https%3A%2F%2Fstudio.example.com', sessionStorage);
    expect(resolveStudioOrigin('?locale=ar', sessionStorage)).toBe('https://studio.example.com');
  });

  it('falls back to the default Studio origin with nothing passed or remembered', () => {
    expect(resolveStudioOrigin('', sessionStorage)).toBe(DEFAULT_STUDIO_ORIGIN);
    expect(DEFAULT_STUDIO_ORIGIN).toBe('http://localhost:3010');
  });

  it('ignores values that are not an http(s) origin', () => {
    for (const bad of ['javascript%3Aalert(1)', '*', 'not a url', 'ftp%3A%2F%2Fx.example']) {
      sessionStorage.clear();
      expect(resolveStudioOrigin(`?livelocale-origin=${bad}`, sessionStorage)).toBe(
        DEFAULT_STUDIO_ORIGIN
      );
    }
    sessionStorage.setItem(STUDIO_ORIGIN_STORAGE_KEY, '*');
    expect(resolveStudioOrigin('', sessionStorage)).toBe(DEFAULT_STUDIO_ORIGIN);
  });

  it('normalises a full URL to its origin', () => {
    expect(
      resolveStudioOrigin(
        '?livelocale-origin=https%3A%2F%2Fstudio.example.com%2Fpath%3Fx%3D1',
        null
      )
    ).toBe('https://studio.example.com');
  });

  it('works when storage is unavailable', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(resolveStudioOrigin('?livelocale-origin=http%3A%2F%2Flocalhost%3A3011', throwing)).toBe(
      'http://localhost:3011'
    );
    expect(resolveStudioOrigin('', throwing)).toBe(DEFAULT_STUDIO_ORIGIN);
  });
});

describe('resolveStudioOrigin with a same-origin parent', () => {
  beforeEach(() => sessionStorage.clear());
  it('prefers the same-origin parent over the query and leaves storage alone', () => {
    expect(
      resolveStudioOrigin(
        '?livelocale-origin=http%3A%2F%2Flocalhost%3A3011',
        sessionStorage,
        'https://www.acme.com'
      )
    ).toBe('https://www.acme.com');
    expect(sessionStorage.getItem(STUDIO_ORIGIN_STORAGE_KEY)).toBeNull();
  });
  it('prefers the same-origin parent over a remembered origin', () => {
    sessionStorage.setItem(STUDIO_ORIGIN_STORAGE_KEY, 'http://localhost:3010');
    expect(resolveStudioOrigin('', sessionStorage, 'https://www.acme.com')).toBe(
      'https://www.acme.com'
    );
  });
  it('uses the same-origin parent after a navigation with nothing remembered', () =>
    expect(resolveStudioOrigin('?locale=ar', null, 'https://www.acme.com')).toBe(
      'https://www.acme.com'
    ));
  it('keeps the existing order when there is no same-origin parent', () => {
    expect(resolveStudioOrigin('', sessionStorage, null)).toBe(DEFAULT_STUDIO_ORIGIN);
    resolveStudioOrigin(
      '?livelocale-origin=https%3A%2F%2Fstudio.example.com',
      sessionStorage,
      null
    );
    expect(resolveStudioOrigin('', sessionStorage, null)).toBe('https://studio.example.com');
  });
  it('ignores a same-origin value that is not http(s)', () => {
    for (const bad of ['null', 'file://', ''])
      expect(resolveStudioOrigin('', null, bad)).toBe(DEFAULT_STUDIO_ORIGIN);
  });
});
describe('readSameOriginParent', () => {
  const ORIGIN = 'https://www.acme.com';
  const make = (parent: unknown, origin = ORIGIN) => {
    const w: any = { location: { origin } };
    w.parent = parent === 'self' ? w : parent;
    return w as Window;
  };
  it('returns the origin for a readable same-origin parent', () =>
    expect(readSameOriginParent(make({ location: { origin: ORIGIN } }))).toBe(ORIGIN));
  it('returns null for a top-level page or a missing parent', () => {
    expect(readSameOriginParent(make('self'))).toBeNull();
    expect(readSameOriginParent(make(null))).toBeNull();
  });
  it('returns null, without throwing, for a cross-origin parent', () => {
    const parent = {
      get location(): never {
        throw new DOMException('Blocked a frame', 'SecurityError');
      },
    };
    expect(readSameOriginParent(make(parent))).toBeNull();
  });
  it('returns null when a readable parent has another origin (document.domain)', () =>
    expect(
      readSameOriginParent(make({ location: { origin: 'https://studio.acme.com' } }))
    ).toBeNull());
  it('returns null for an opaque own origin', () =>
    expect(readSameOriginParent(make({ location: { origin: 'null' } }, 'null'))).toBeNull());
});

describe('navigationHref', () => {
  const own = 'http://localhost:3020';

  it('returns the href of a same-origin http(s) URL', () =>
    expect(navigationHref({ url: 'http://localhost:3020/about/?locale=ar#top' }, own)).toBe(
      'http://localhost:3020/about/?locale=ar#top'
    ));

  it('refuses URLs that are not on its own origin', () => {
    for (const url of [
      'http://evil.example/',
      'http://localhost:3021/',
      'https://localhost:3020/',
      'http://localhost:3020.evil.example/',
      'http://u:p@localhost:3020/',
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.example/',
      '/about/',
      'http://localhost:3020/' + 'a'.repeat(2048),
    ]) {
      expect(navigationHref({ url }, own), url).toBeNull();
    }
  });

  it('refuses payloads without an own string url', () => {
    expect(navigationHref({ url: 1 }, own)).toBeNull();
    expect(navigationHref(null, own)).toBeNull();
    expect(navigationHref('http://localhost:3020/', own)).toBeNull();
    expect(navigationHref(Object.create({ url: 'http://localhost:3020/' }), own)).toBeNull();
  });
});

describe('followNavigation', () => {
  const make = () => ({ href: 'http://a/b#faq', assign: vi.fn(), reload: vi.fn() });

  it('reloads when asked for the current URL', () => {
    const loc = make();
    followNavigation(loc, 'http://a/b#faq');
    expect(loc.reload).toHaveBeenCalledTimes(1);
    expect(loc.assign).not.toHaveBeenCalled();
  });

  it('assigns any other URL', () => {
    const loc = make();
    followNavigation(loc, 'http://a/c');
    expect(loc.assign).toHaveBeenCalledWith('http://a/c');
    expect(loc.reload).not.toHaveBeenCalled();
  });
});

// The NAVIGATE branch in src/client/index.ts is exactly these two calls.
describe('NAVIGATE handling (navigationHref then followNavigation)', () => {
  const navigate = (
    loc: { href: string; origin: string; assign: (u: string) => void; reload: () => void },
    payload: unknown
  ) => {
    const href = navigationHref(payload, loc.origin);
    if (href !== null) followNavigation(loc, href);
  };
  const make = () => ({
    href: 'http://localhost:3020/?tab=3#faq',
    origin: 'http://localhost:3020',
    assign: vi.fn(),
    reload: vi.fn(),
  });

  it('reloads when the Studio sends the current URL that has a hash', () => {
    const loc = make();
    navigate(loc, { url: 'http://localhost:3020/?tab=3#faq' });
    expect(loc.reload).toHaveBeenCalledTimes(1);
    expect(loc.assign).not.toHaveBeenCalled();
  });

  it('assigns another page on its own origin', () => {
    const loc = make();
    navigate(loc, { url: 'http://localhost:3020/about/' });
    expect(loc.assign).toHaveBeenCalledWith('http://localhost:3020/about/');
    expect(loc.reload).not.toHaveBeenCalled();
  });

  it('does nothing for a refused URL', () => {
    const loc = make();
    navigate(loc, { url: 'http://evil.example/' });
    expect(loc.assign).not.toHaveBeenCalled();
    expect(loc.reload).not.toHaveBeenCalled();
  });
});
