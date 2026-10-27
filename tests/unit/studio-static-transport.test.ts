// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  createStaticTransport,
  COMMIT_UNSUPPORTED,
  LOCALE_ACTIONS_UNSUPPORTED,
  STORAGE_PROBLEM,
  type StaticTransport,
} from '../../src/studio/transport/static.js';
import {
  createMemoryDraftStore,
  openIndexedDbDraftStore,
  type DraftStore,
} from '../../src/studio/transport/draft-store.js';
import type { Draft } from '../../src/studio/transport/drafts.js';
import type { ShareManifest } from '../../src/core/share-manifest.js';
import {
  AR,
  APP_URL,
  EN,
  MANIFEST,
  STUDIO_URL,
  fetchStub,
  type FetchStub,
} from './helpers/share-fixtures.js';

const LOCALES_URL = 'https://www.acme.com/livelocale/locales/';

interface Fixture {
  t: StaticTransport;
  fetch: FetchStub;
  store: DraftStore;
}

async function make(
  options: {
    files?: Record<string, string | Response>;
    store?: DraftStore;
    now?: () => number;
    manifest?: ShareManifest;
  } = {}
): Promise<Fixture> {
  const manifest = options.manifest ?? MANIFEST;
  const served: Record<string, string | Response> = {
    [`${LOCALES_URL}en.json`]: JSON.stringify(EN),
    [`${LOCALES_URL}ar.json`]: JSON.stringify(AR),
  };
  for (const [name, body] of Object.entries(options.files ?? {})) {
    served[`${LOCALES_URL}${name}`] = body;
  }
  const fetch = fetchStub(served);
  const store = options.store ?? (await openIndexedDbDraftStore(new IDBFactory()));
  const t = await createStaticTransport({
    manifest,
    manifestText: JSON.stringify(manifest),
    studioUrl: STUDIO_URL,
    appUrl: APP_URL,
    store,
    fetch,
    now: options.now ?? (() => 1000),
    events: new EventTarget(),
  });
  return { t, fetch, store };
}

function draft(scope: string, overrides: Partial<Draft> = {}): Draft {
  return {
    scope,
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
    ...overrides,
  };
}

describe('static transport reads', () => {
  it('reports static mode', async () => {
    const { t } = await make();
    expect(await t.fetchInfo()).toEqual({
      mode: 'static',
      authRequired: false,
      git: false,
      problems: [],
    });
  });

  it('warns when drafts cannot persist', async () => {
    const { t } = await make({ store: createMemoryDraftStore() });
    expect(t.persistent).toBe(false);
    expect((await t.fetchInfo()).problems).toEqual([STORAGE_PROBLEM]);
  });

  it('lists manifest locales', async () => {
    const { t } = await make();
    expect(await t.fetchLocales()).toEqual(['ar', 'en']);
  });

  it('reads a locale file next to the Studio once', async () => {
    const { t, fetch } = await make();
    await t.fetchLocaleDictionary('ar');
    await t.readBuiltLocale('ar');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://www.acme.com/livelocale/locales/ar.json', {
      cache: 'no-cache',
      credentials: 'same-origin',
    });
  });

  it('merges drafts over the built dictionary', async () => {
    const { t, store } = await make();
    await store.put(draft(t.scope));
    const dict = await t.fetchLocaleDictionary('ar');
    expect(dict.home.title).toBe('أهلاً');
    expect(dict.home.greet).toBe('أهلا {name}');
    expect(((await t.readBuiltLocale('ar')) as typeof AR).home.title).toBe('مرحبا');
  });

  it('rejects unknown or unsafe locales without fetching', async () => {
    const { t, fetch } = await make();
    await expect(t.readBuiltLocale('fr')).rejects.toThrow('Unknown language "fr".');
    await expect(t.fetchLocaleDictionary('../x')).rejects.toThrow('Unknown language "../x".');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces a failed locale file and retries later', async () => {
    const { t, fetch } = await make({ files: { 'ar.json': new Response('', { status: 404 }) } });
    await expect(t.readBuiltLocale('ar')).rejects.toThrow('Could not load locales/ar.json (404).');
    await expect(t.readBuiltLocale('ar')).rejects.toThrow('Could not load locales/ar.json (404).');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('lists code keys, file keys and draft keys', async () => {
    const { t, store } = await make({
      manifest: { ...MANIFEST, codeKeys: ['home.title', 'home.unused'] },
    });
    await store.put(draft(t.scope, { key: 'home.new', from: null, to: 'جديد' }));
    expect(await t.fetchKeysMetadata()).toEqual({
      allKeys: ['home.greet', 'home.new', 'home.title', 'home.unused'],
      codeKeys: ['home.title', 'home.unused'],
    });
  });

  it('refuses locale management and commit', async () => {
    const { t } = await make();
    await expect(t.addLocaleRequest('fr')).rejects.toThrow(LOCALE_ACTIONS_UNSUPPORTED);
    await expect(t.renameLocaleRequest('ar', 'ar-EG')).rejects.toThrow(LOCALE_ACTIONS_UNSUPPORTED);
    await expect(t.deleteLocaleRequest('ar')).rejects.toThrow(LOCALE_ACTIONS_UNSUPPORTED);
    await expect(t.commitLocales('msg')).rejects.toThrow(COMMIT_UNSUPPORTED);
  });

  it('lists built and drafted text for each key', async () => {
    const { t, store } = await make();
    await store.put(draft(t.scope));
    expect((await t.textCandidates()).ar['home.title']).toEqual(['مرحبا', 'أهلاً']);
  });
});
