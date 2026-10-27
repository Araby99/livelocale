// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setStudioTransport,
  fetchInfo,
  fetchLocales,
  fetchKeysMetadata,
  fetchLocaleDictionary,
  fetchGitState,
  saveTranslation,
  addLocaleRequest,
  renameLocaleRequest,
  deleteLocaleRequest,
  commitLocales,
  discardLocales,
  type StudioTransport,
} from '../../src/studio/api.js';
import { resetStudioRuntime } from '../../src/studio/runtime.js';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function fakeTransport() {
  return {
    fetchInfo: vi.fn().mockResolvedValue({ mode: 'static', authRequired: false, git: false }),
    fetchLocales: vi.fn().mockResolvedValue(['en', 'ar']),
    fetchKeysMetadata: vi.fn().mockResolvedValue({ allKeys: ['home.title'], codeKeys: [] }),
    fetchLocaleDictionary: vi.fn().mockResolvedValue({ home: { title: 'Home' } }),
    fetchGitState: vi.fn().mockResolvedValue({
      available: false,
      isRepo: false,
      branch: null,
      changes: [],
      diff: '',
      mode: 'static',
    }),
    saveTranslation: vi.fn().mockResolvedValue({ success: true, key: 'home.title', locale: 'ar' }),
    addLocaleRequest: vi.fn().mockResolvedValue({ success: true, locale: 'fr' }),
    renameLocaleRequest: vi.fn().mockResolvedValue({ success: true }),
    deleteLocaleRequest: vi.fn().mockResolvedValue({ success: true }),
    commitLocales: vi.fn().mockResolvedValue({ success: true, hash: 'abc' }),
    discardLocales: vi.fn().mockResolvedValue({ success: true }),
  } satisfies StudioTransport;
}

describe('swappable Studio transport', () => {
  afterEach(() => {
    setStudioTransport(null);
    resetStudioRuntime();
    vi.unstubAllGlobals();
  });

  it('routes every endpoint through the active transport with the same arguments', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const fake = fakeTransport();
    setStudioTransport(fake);

    await expect(fetchInfo()).resolves.toEqual({
      mode: 'static',
      authRequired: false,
      git: false,
    });
    await expect(fetchLocales()).resolves.toEqual(['en', 'ar']);
    await expect(fetchKeysMetadata()).resolves.toEqual({ allKeys: ['home.title'], codeKeys: [] });
    await expect(fetchLocaleDictionary('ar')).resolves.toEqual({ home: { title: 'Home' } });
    await expect(fetchGitState()).resolves.toMatchObject({ mode: 'static' });
    await saveTranslation('ar', 'home.title', 'x', { force: true });
    await addLocaleRequest('fr');
    await renameLocaleRequest('ar', 'ar-EG');
    await deleteLocaleRequest('fr');
    await commitLocales('msg');
    await discardLocales();

    expect(fake.fetchInfo).toHaveBeenCalledTimes(1);
    expect(fake.fetchLocales).toHaveBeenCalledTimes(1);
    expect(fake.fetchKeysMetadata).toHaveBeenCalledTimes(1);
    expect(fake.fetchLocaleDictionary).toHaveBeenCalledWith('ar');
    expect(fake.fetchGitState).toHaveBeenCalledTimes(1);
    expect(fake.saveTranslation).toHaveBeenCalledWith('ar', 'home.title', 'x', { force: true });
    expect(fake.addLocaleRequest).toHaveBeenCalledWith('fr');
    expect(fake.renameLocaleRequest).toHaveBeenCalledWith('ar', 'ar-EG');
    expect(fake.deleteLocaleRequest).toHaveBeenCalledWith('fr');
    expect(fake.commitLocales).toHaveBeenCalledWith('msg');
    expect(fake.discardLocales).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns to HTTP after setStudioTransport(null)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(['en']));
    vi.stubGlobal('fetch', fetchMock);
    const fake = fakeTransport();
    setStudioTransport(fake);
    setStudioTransport(null);

    await expect(fetchLocales()).resolves.toEqual(['en']);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/livelocale');
    expect(fake.fetchLocales).not.toHaveBeenCalled();
  });
});
