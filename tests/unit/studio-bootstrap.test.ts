// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { startStudio } from '../../src/studio/bootstrap.js';
import {
  getStaticTransport,
  getStudioRuntime,
  isAppPreviewBlocked,
  resetStudioRuntime,
} from '../../src/studio/runtime.js';
import { fetchInfo, setStudioTransport } from '../../src/studio/api.js';
import { STATIC_MANIFEST_MISSING } from '../../src/studio/config.js';
import { STORAGE_PROBLEM } from '../../src/studio/transport/static.js';
import { openIndexedDbDraftStore } from '../../src/studio/transport/draft-store.js';
import { MANIFEST, STUDIO_URL, fetchStub } from './helpers/share-fixtures.js';

const MANIFEST_URL = 'https://www.acme.com/livelocale/manifest.json';

afterEach(() => {
  setStudioTransport(null);
  resetStudioRuntime();
});

describe('startStudio', () => {
  it('stays on HTTP when the CLI injected an origin', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(MANIFEST)));
    const rt = await startStudio({
      href: STUDIO_URL,
      search: '',
      injected: 'http://localhost:3000',
      fetch,
      indexedDB: new IDBFactory(),
    });
    expect(rt).toMatchObject({ kind: 'server', appOrigin: 'http://localhost:3000' });
    expect(getStudioRuntime()).toBe(rt);
    expect(getStaticTransport()).toBeNull();
    expect(isAppPreviewBlocked()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts in static mode with IndexedDB drafts and routes api calls to them', async () => {
    const rt = await startStudio({
      href: STUDIO_URL,
      search: '',
      fetch: fetchStub({ [MANIFEST_URL]: JSON.stringify(MANIFEST) }),
      indexedDB: new IDBFactory(),
    });
    expect(rt.kind).toBe('static');
    expect(getStudioRuntime()).toBe(rt);
    expect((await fetchInfo()).mode).toBe('static');
    expect(getStaticTransport()?.persistent).toBe(true);
    expect(isAppPreviewBlocked()).toBe(false);
  });

  it('reports memory-only drafts when IndexedDB is unavailable', async () => {
    await startStudio({
      href: STUDIO_URL,
      search: '',
      fetch: fetchStub({ [MANIFEST_URL]: JSON.stringify(MANIFEST) }),
      indexedDB: undefined,
    });
    expect(getStaticTransport()?.persistent).toBe(false);
    expect((await fetchInfo()).problems).toEqual([STORAGE_PROBLEM]);
  });

  it('starts in server mode with the manifest problem under /livelocale/', async () => {
    await startStudio({
      href: STUDIO_URL,
      search: '',
      fetch: fetchStub({}),
      indexedDB: new IDBFactory(),
    });
    expect(getStudioRuntime()).toMatchObject({
      kind: 'server',
      problems: [STATIC_MANIFEST_MISSING],
    });
    expect(getStaticTransport()).toBeNull();
  });

  it('blocks the app preview when a /livelocale/ Studio has no manifest', async () => {
    await startStudio({
      href: STUDIO_URL,
      search: '',
      fetch: fetchStub({ [MANIFEST_URL]: '<!doctype html><title>x</title>' }),
      indexedDB: new IDBFactory(),
    });
    expect(isAppPreviewBlocked()).toBe(true);

    setStudioTransport(null);
    resetStudioRuntime();
    await startStudio({
      href: STUDIO_URL,
      search: '',
      fetch: fetchStub({ [MANIFEST_URL]: JSON.stringify(MANIFEST) }),
      indexedDB: new IDBFactory(),
    });
    expect(isAppPreviewBlocked()).toBe(false);
  });

  it('never rejects when start-up reconciliation cannot load a locale', async () => {
    const indexedDB = new IDBFactory();
    const store = await openIndexedDbDraftStore(indexedDB);
    await store.put({
      scope: 'path:/',
      locale: 'ar',
      key: 'home.title',
      from: 'مرحبا',
      to: 'أهلاً',
      force: false,
      base: MANIFEST.base,
      branch: MANIFEST.branch,
      status: 'unsent',
      conflict: false,
      updatedAt: 1000,
      sentAt: null,
    });
    const rt = await startStudio({
      href: STUDIO_URL,
      search: '',
      fetch: fetchStub({
        [MANIFEST_URL]: JSON.stringify(MANIFEST),
        'https://www.acme.com/livelocale/locales/ar.json': new Response('', { status: 500 }),
      }),
      indexedDB,
    });
    expect(rt.kind).toBe('static');
    expect(await getStaticTransport()!.listDrafts()).toMatchObject([
      { locale: 'ar', key: 'home.title', to: 'أهلاً' },
    ]);
  });
});
