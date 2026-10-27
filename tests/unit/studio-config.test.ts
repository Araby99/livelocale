import { describe, it, expect, vi } from 'vitest';
import {
  resolveAppOrigin,
  resolveStaticAppUrl,
  detectStudioRuntime,
  STATIC_MANIFEST_MISSING,
} from '../../src/studio/config.js';
import { MANIFEST, STUDIO_URL } from './helpers/share-fixtures.js';

describe('resolveAppOrigin', () => {
  it('should default to http://localhost:3000 when nothing is configured', () => {
    expect(resolveAppOrigin({})).toBe('http://localhost:3000');
  });

  it('should prefer the ?app= query parameter over every other source', () => {
    const origin = resolveAppOrigin({
      search: '?app=http://localhost:3001',
      injected: 'http://localhost:4000',
      buildTime: 'http://localhost:5000',
    });
    expect(origin).toBe('http://localhost:3001');
  });

  it('should use the CLI-injected origin when no query parameter is present', () => {
    const origin = resolveAppOrigin({
      injected: 'http://localhost:4000',
      buildTime: 'http://localhost:5000',
    });
    expect(origin).toBe('http://localhost:4000');
  });

  it('should fall back to the build-time origin', () => {
    expect(resolveAppOrigin({ buildTime: 'http://localhost:5000' })).toBe('http://localhost:5000');
  });

  it('should normalize to a bare origin (no path, no trailing slash)', () => {
    expect(resolveAppOrigin({ search: '?app=https://my-app.local:3000/some/path/' })).toBe(
      'https://my-app.local:3000'
    );
  });

  it('should ignore values that are not http(s) URLs and fall through', () => {
    expect(
      resolveAppOrigin({ search: '?app=javascript:alert(1)', injected: 'http://localhost:4000' })
    ).toBe('http://localhost:4000');
    expect(resolveAppOrigin({ injected: 'not a url' })).toBe('http://localhost:3000');
  });
});

describe('resolveStaticAppUrl', () => {
  it('resolves the app one folder above the Studio', () => {
    expect(resolveStaticAppUrl('https://www.acme.com/livelocale/index.html')).toBe(
      'https://www.acme.com/'
    );
    expect(resolveStaticAppUrl('https://o.github.io/repo/livelocale/')).toBe(
      'https://o.github.io/repo/'
    );
    expect(resolveStaticAppUrl('https://www.acme.com/livelocale/index.html#lc1.abc')).toBe(
      'https://www.acme.com/'
    );
  });
});

describe('detectStudioRuntime', () => {
  it('enters static mode when ./manifest.json is a LiveLocale manifest, ignoring ?app=', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(MANIFEST)));
    const rt = await detectStudioRuntime({
      href: STUDIO_URL,
      search: '?app=http://localhost:4000',
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith('https://www.acme.com/livelocale/manifest.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    expect(rt).toMatchObject({
      kind: 'static',
      appOrigin: 'https://www.acme.com',
      appUrl: 'https://www.acme.com/',
      manifest: MANIFEST,
      manifestText: JSON.stringify(MANIFEST),
    });
  });

  it('never probes when the CLI injected an origin', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(MANIFEST)));
    const rt = await detectStudioRuntime({
      href: STUDIO_URL,
      injected: 'http://localhost:3000',
      fetch,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(rt).toEqual({
      kind: 'server',
      appOrigin: 'http://localhost:3000',
      appUrl: 'http://localhost:3000',
      problems: [],
    });
  });

  it.each([
    ['404', new Response('', { status: 404 })],
    ['html', new Response('<!doctype html>')],
    ['unknown format', new Response('{"format":2}')],
  ])('stays in server mode on %s and honours ?app=', async (_name, response) => {
    const rt = await detectStudioRuntime({
      href: 'http://localhost:3010/',
      search: '?app=http://localhost:4000',
      fetch: async () => response,
    });
    expect(rt).toEqual({
      kind: 'server',
      appOrigin: 'http://localhost:4000',
      appUrl: 'http://localhost:4000',
      problems: [],
    });
  });

  it('stays in server mode when the probe rejects', async () => {
    const rt = await detectStudioRuntime({
      href: 'http://localhost:3010/',
      search: '',
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(rt).toEqual({
      kind: 'server',
      appOrigin: 'http://localhost:3000',
      appUrl: 'http://localhost:3000',
      problems: [],
    });
  });

  it('names the fix when a /livelocale/ Studio finds no manifest', async () => {
    const rt = await detectStudioRuntime({
      href: STUDIO_URL,
      search: '',
      fetch: async () => new Response('<!doctype html><title>Shop</title>'),
    });
    expect(rt).toMatchObject({ kind: 'server', problems: [STATIC_MANIFEST_MISSING] });
    const folder = await detectStudioRuntime({
      href: 'https://o.github.io/repo/livelocale/',
      search: '',
      fetch: async () => new Response('', { status: 404 }),
    });
    expect(folder).toMatchObject({ kind: 'server', problems: [STATIC_MANIFEST_MISSING] });
  });
});
