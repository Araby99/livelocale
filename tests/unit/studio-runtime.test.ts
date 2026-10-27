// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getAppOrigin,
  getAppUrl,
  resetStudioRuntime,
  setStudioRuntime,
} from '../../src/studio/runtime.js';
import { fetchLocales } from '../../src/studio/api.js';
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
});
