// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  appBasePath,
  getAppOrigin,
  getAppUrl,
  isShareStudio,
  resetStudioRuntime,
  setStudioRuntime,
} from '../../src/studio/runtime.js';
import { fetchLocales } from '../../src/studio/api.js';
import { STATIC_MANIFEST_MISSING } from '../../src/studio/config.js';
import type { StaticTransport } from '../../src/studio/transport/static.js';
import { APP_URL, MANIFEST } from './helpers/share-fixtures.js';

afterEach(() => {
  resetStudioRuntime();
  vi.unstubAllGlobals();
});

describe('studio runtime', () => {
  it("falls back to today's resolution when no runtime was set", () => {
    resetStudioRuntime();
    expect(getAppOrigin()).toBe('http://localhost:3000');
    expect(getAppUrl()).toBe('http://localhost:3000');
  });

  it('serves the static runtime once set', () => {
    setStudioRuntime({
      kind: 'static',
      appOrigin: 'https://www.acme.com',
      appUrl: APP_URL,
      manifest: MANIFEST,
      manifestText: '',
      transport: {} as StaticTransport,
    });
    expect(getAppOrigin()).toBe('https://www.acme.com');
    expect(getAppUrl()).toBe('https://www.acme.com/');
  });

  it('builds the API URL from the runtime at call time', async () => {
    const fetch = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', fetch);
    setStudioRuntime({
      kind: 'server',
      appOrigin: 'http://localhost:4000',
      appUrl: 'http://localhost:4000',
      problems: [],
    });
    await fetchLocales();
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/livelocale');
  });

  it('reports a static runtime and a share folder without a manifest as the share Studio', () => {
    setStudioRuntime({
      kind: 'static',
      appOrigin: 'https://www.acme.com',
      appUrl: APP_URL,
      manifest: MANIFEST,
      manifestText: '',
      transport: {} as StaticTransport,
    });
    expect(isShareStudio()).toBe(true);
    setStudioRuntime({
      kind: 'server',
      appOrigin: 'https://www.acme.com',
      appUrl: APP_URL,
      problems: [STATIC_MANIFEST_MISSING],
    });
    expect(isShareStudio()).toBe(true);
    setStudioRuntime({
      kind: 'server',
      appOrigin: 'http://localhost:4000',
      appUrl: 'http://localhost:4000',
      problems: [],
    });
    expect(isShareStudio()).toBe(false);
  });

  it('reports the app base path for each runtime', () => {
    setStudioRuntime({
      kind: 'server',
      appOrigin: 'http://localhost:4000',
      appUrl: 'http://localhost:4000',
      problems: [],
    });
    expect(appBasePath()).toBe('/');
    const staticRuntime = {
      kind: 'static' as const,
      appOrigin: 'https://www.acme.com',
      appUrl: 'https://www.acme.com/site/',
      manifestText: '',
      transport: {} as StaticTransport,
    };
    setStudioRuntime({
      ...staticRuntime,
      manifest: { ...MANIFEST, basePath: '/livelocale-demo/' },
    });
    expect(appBasePath()).toBe('/livelocale-demo/');
    setStudioRuntime({ ...staticRuntime, manifest: { ...MANIFEST, basePath: null } });
    expect(appBasePath()).toBe('/site/');
  });
});
