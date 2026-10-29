// @vitest-environment node
import { beforeEach, describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  createStaticTransport,
  COMMIT_UNSUPPORTED,
  DRAFTS_CHANGED_EVENT,
  LOCALE_ACTIONS_UNSUPPORTED,
  MANIFEST_REFRESH_INTERVAL_MS,
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
import { ValidationError } from '../../src/studio/api.js';
import {
  AR,
  APP_URL,
  EN,
  MANIFEST,
  SHA_A,
  SHA_B,
  STUDIO_URL,
  fetchStub,
  type FetchStub,
} from './helpers/share-fixtures.js';

const LOCALES_URL = 'https://www.acme.com/livelocale/locales/';
const MANIFEST_URL = 'https://www.acme.com/livelocale/manifest.json';

interface Fixture {
  t: StaticTransport;
  fetch: FetchStub;
  store: DraftStore;
  /** Event types dispatched on the transport's `events`, in order. */
  dispatched: string[];
  /** What the stub serves, by absolute URL; changes apply to later fetches. */
  served: Record<string, string | Response>;
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
    [MANIFEST_URL]: JSON.stringify(manifest),
    [`${LOCALES_URL}en.json`]: JSON.stringify(EN),
    [`${LOCALES_URL}ar.json`]: JSON.stringify(AR),
  };
  for (const [name, body] of Object.entries(options.files ?? {})) {
    served[`${LOCALES_URL}${name}`] = body;
  }
  const fetch = fetchStub(served);
  const store = options.store ?? (await openIndexedDbDraftStore(new IDBFactory()));
  const events = new EventTarget();
  const dispatched: string[] = [];
  events.addEventListener(DRAFTS_CHANGED_EVENT, (e) => dispatched.push(e.type));
  const t = await createStaticTransport({
    manifest,
    manifestText: JSON.stringify(manifest),
    studioUrl: STUDIO_URL,
    appUrl: APP_URL,
    store,
    fetch,
    now: options.now ?? (() => 1000),
    events,
  });
  return { t, fetch, store, dispatched, served };
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

describe('static transport saves', () => {
  let t: StaticTransport;
  let store: DraftStore;
  let dispatched: string[];
  let clock: number;

  beforeEach(async () => {
    clock = 1000;
    ({ t, store, dispatched } = await make({ now: () => clock }));
  });

  it('stores a validated edit as an unsent draft against the built value', async () => {
    expect(await t.saveTranslation('ar', 'home.title', 'أهلاً')).toEqual({
      success: true,
      key: 'home.title',
      locale: 'ar',
    });
    expect(await t.listDrafts()).toEqual([
      {
        scope: 'path:/',
        locale: 'ar',
        key: 'home.title',
        from: 'مرحبا',
        to: 'أهلاً',
        force: false,
        base: SHA_A,
        branch: 'main',
        status: 'unsent',
        conflict: false,
        updatedAt: 1000,
        sentAt: null,
      },
    ]);
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT]);
  });

  it('keeps from at the built value across re-edits', async () => {
    await t.saveTranslation('ar', 'home.title', 'A');
    await t.saveTranslation('ar', 'home.title', 'B');
    const drafts = await t.listDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ from: 'مرحبا', to: 'B' });
  });

  it('restoring the built value removes the draft without validation', async () => {
    await t.saveTranslation('ar', 'home.title', 'أهلاً');
    await t.saveTranslation('ar', 'home.title', 'مرحبا');
    expect(await t.listDrafts()).toEqual([]);
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT, DRAFTS_CHANGED_EVENT]);
  });

  it('checks placeholders against the built source locale, not the client reference', async () =>
    await expect(
      t.saveTranslation('ar', 'home.greet', 'أهلا', { reference: 'أهلا' })
    ).rejects.toMatchObject({
      name: 'ValidationError',
      code: 'PLACEHOLDER_MISMATCH',
      details: { missing: ['{name}'], extra: [] },
    }));

  it('records Save anyway as force', async () => {
    await t.saveTranslation('ar', 'home.greet', 'أهلا', { force: true });
    expect(await t.listDrafts()).toMatchObject([{ key: 'home.greet', to: 'أهلا', force: true }]);
  });

  it('checks a source-locale edit against its previous value', async () => {
    await expect(t.saveTranslation('en', 'home.greet', 'Hi there')).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(await t.listDrafts()).toEqual([]);
  });

  it('rejects unsafe keys as a plain error and stores nothing', async () => {
    const error = await t.saveTranslation('ar', '__proto__.x', 'x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ValidationError);
    expect(await t.listDrafts()).toEqual([]);
  });

  it('refuses to save over a group of translations', async () => {
    await expect(t.saveTranslation('ar', 'home', 'x')).rejects.toThrow(/would replace/);
    expect(await t.listDrafts()).toEqual([]);
  });

  it('refuses to save over a literal dotted key', async () => {
    const { t } = await make({ files: { 'ar.json': JSON.stringify({ 'promo.banner': 'قديم' }) } });
    await expect(t.saveTranslation('ar', 'promo.banner', 'x')).rejects.toThrow(/would replace/);
    expect(await t.listDrafts()).toEqual([]);
  });

  it('refuses a draft that overlaps another draft key', async () => {
    await t.saveTranslation('ar', 'promo', 'x');
    await expect(t.saveTranslation('ar', 'promo.banner', 'y')).rejects.toThrow(/would replace/);
    expect(await t.listDrafts()).toMatchObject([{ key: 'promo', to: 'x' }]);
  });

  it('records a new key with from null', async () => {
    await t.saveTranslation('ar', 'home.new', 'جديد');
    expect(await t.listDrafts()).toMatchObject([{ key: 'home.new', from: null, to: 'جديد' }]);
  });

  it('rejects an unknown locale', async () => {
    await expect(t.saveTranslation('fr', 'home.title', 'x')).rejects.toThrow(
      'Unknown language "fr".'
    );
  });

  it('re-editing a sent draft makes it unsent and rebases it', async () => {
    await store.put(draft(t.scope, { to: 'A', base: 'c'.repeat(40) }));
    await t.markDraftsSent([{ locale: 'ar', key: 'home.title' }]);
    clock = 2000;
    await t.saveTranslation('ar', 'home.title', 'B');
    expect(await t.listDrafts()).toMatchObject([
      { to: 'B', status: 'unsent', sentAt: null, updatedAt: 2000, base: MANIFEST.base },
    ]);
  });

  it('marks drafts sent', async () => {
    await t.saveTranslation('ar', 'home.title', 'أهلاً');
    await t.markDraftsSent([{ locale: 'ar', key: 'home.title' }]);
    expect(await t.listDrafts()).toMatchObject([{ status: 'sent', sentAt: 1000 }]);
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT, DRAFTS_CHANGED_EVENT]);
  });

  it('discard keeps sent drafts and removes unsent ones', async () => {
    await store.put(draft(t.scope, { key: 'home.title', status: 'sent', sentAt: 1000 }));
    await store.put(draft(t.scope, { key: 'home.greet', from: 'أهلا {name}', to: 'هلا {name}' }));
    expect(await t.discardLocales()).toEqual({ success: true });
    expect(await t.listDrafts()).toMatchObject([{ key: 'home.title' }]);
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT]);
  });

  it('discardDraft returns the removed draft', async () => {
    const stored = draft(t.scope);
    await store.put(stored);
    expect(await t.discardDraft('ar', 'home.title')).toEqual(stored);
    expect(await t.listDrafts()).toEqual([]);
    expect(await t.discardDraft('ar', 'home.unknown')).toBeUndefined();
  });
});

describe('static transport restore', () => {
  it('restoreDrafts skips existing keys and unknown locales', async () => {
    const { t, store, dispatched } = await make({ now: () => 5000 });
    await store.put(draft(t.scope));
    const result = await t.restoreDrafts([
      { locale: 'ar', key: 'home.title', from: 'مرحبا', to: 'X', force: false },
      { locale: 'ar', key: 'home.greet', from: 'أهلا {name}', to: 'هلا {name}', force: true },
      { locale: 'fr', key: 'x', from: null, to: 'Y', force: false },
    ]);
    expect(result).toEqual({ added: 1, skipped: 2 });
    expect(await store.get(t.scope, 'ar', 'home.greet')).toEqual({
      scope: t.scope,
      locale: 'ar',
      key: 'home.greet',
      from: 'أهلا {name}',
      to: 'هلا {name}',
      force: true,
      base: SHA_A,
      branch: 'main',
      status: 'unsent',
      conflict: false,
      updatedAt: 5000,
      sentAt: null,
    });
    expect(await store.get(t.scope, 'ar', 'home.title')).toMatchObject({ to: 'أهلاً' });
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT]);
  });

  it('restoreDrafts skips a key that overlaps an existing draft key', async () => {
    const { t, store, dispatched } = await make();
    await store.put(draft(t.scope, { key: 'promo' }));
    const result = await t.restoreDrafts([
      { locale: 'ar', key: 'promo.banner', from: null, to: 'A', force: false },
      { locale: 'en', key: 'promo.banner', from: null, to: 'B', force: false },
    ]);
    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(await store.get(t.scope, 'ar', 'promo.banner')).toBeUndefined();
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT]);
  });

  it('restoreDrafts dispatches nothing when every edit is skipped', async () => {
    const { t, dispatched } = await make();
    expect(
      await t.restoreDrafts([{ locale: 'fr', key: 'x', from: null, to: 'Y', force: false }])
    ).toEqual({ added: 0, skipped: 1 });
    expect(dispatched).toEqual([]);
  });
});

describe('static transport git state', () => {
  it('reports drafts as static git state', async () => {
    const { t, store } = await make();
    await store.put(draft(t.scope));
    await store.put(draft(t.scope, { key: 'home.new', from: null, to: 'جديد', status: 'sent' }));
    expect(await t.fetchGitState()).toEqual({
      available: true,
      isRepo: true,
      branch: 'main',
      mode: 'static',
      changes: [{ path: 'src/locales/ar.json', status: 'modified' }],
      diff: [
        '--- a/src/locales/ar.json',
        '+++ b/src/locales/ar.json',
        '@@ home.new @@',
        '+"جديد"',
        '@@ home.title @@',
        '-"مرحبا"',
        '+"أهلاً"',
      ].join('\n'),
      pullRequestUrl: null,
    });
  });

  it('reports a clean state without drafts', async () => {
    const { t } = await make();
    expect(await t.fetchGitState()).toMatchObject({ changes: [], diff: '' });
  });
});

describe('static transport reconciliation', () => {
  const seeded = async (...drafts: Draft[]): Promise<DraftStore> => {
    const store = await openIndexedDbDraftStore(new IDBFactory());
    for (const d of drafts) await store.put(d);
    return store;
  };

  it('drops drafts the rebuilt site already shows', async () => {
    const store = await seeded(draft('path:/', { from: 'Hello', to: 'مرحبا' }));
    const { t, dispatched } = await make({ store });
    expect(t.initialReconcile.live.map((d) => d.key)).toEqual(['home.title']);
    expect(t.initialReconcile.conflicts).toEqual([]);
    expect(await t.listDrafts()).toEqual([]);
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT]);
  });

  it('flags drafts whose built value changed under them', async () => {
    const store = await seeded(draft('path:/', { from: 'Old', to: 'X' }));
    const { t, dispatched } = await make({ store });
    expect(t.initialReconcile.live).toEqual([]);
    expect(t.initialReconcile.conflicts).toHaveLength(1);
    expect(t.initialReconcile.conflicts[0]!.conflict).toBe(true);
    expect(await t.listDrafts()).toMatchObject([{ key: 'home.title', to: 'X', conflict: true }]);
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT]);
  });

  it('leaves pending drafts alone', async () => {
    const store = await seeded(draft('path:/', { from: 'مرحبا', to: 'X' }));
    const { t, dispatched } = await make({ store });
    expect(t.initialReconcile).toEqual({ live: [], conflicts: [] });
    expect(await t.listDrafts()).toMatchObject([{ key: 'home.title', conflict: false }]);
    expect(dispatched).toEqual([]);
  });

  it('flags drafts for a locale the build no longer has', async () => {
    const store = await seeded(draft('path:/', { locale: 'fr', from: 'Bonjour', to: 'Salut' }));
    const { t } = await make({ store });
    expect(t.initialReconcile.conflicts).toMatchObject([{ locale: 'fr', conflict: true }]);
    expect(await t.listDrafts()).toMatchObject([{ locale: 'fr', conflict: true }]);
  });

  it('never drops drafts when a locale file fails to load', async () => {
    const store = await seeded(draft('path:/', { from: 'Hello', to: 'مرحبا' }));
    const { t } = await make({
      store,
      files: { 'ar.json': new Response('', { status: 500 }) },
    });
    expect(t.initialReconcile).toEqual({ live: [], conflicts: [] });
    expect(await t.listDrafts()).toMatchObject([{ key: 'home.title', conflict: false }]);
  });

  it('ignores drafts from another scope', async () => {
    const other = draft('acme/other', { from: 'Hello', to: 'مرحبا' });
    const store = await seeded(other);
    const { t } = await make({ store });
    expect(t.initialReconcile.live).toEqual([]);
    expect(await store.list('acme/other')).toEqual([other]);
  });

  it('refreshes at most once a minute and only when the manifest changed', async () => {
    let now = 1000;
    const { t, fetch } = await make({ now: () => now });
    now = 1000 + 1_000;
    expect(await t.refreshManifest()).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith(MANIFEST_URL, expect.anything());
    now = 1000 + 60_000;
    expect(await t.refreshManifest()).toBeNull();
    expect(fetch).toHaveBeenCalledWith(MANIFEST_URL, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    expect(MANIFEST_REFRESH_INTERVAL_MS).toBe(60_000);
  });

  it('reconciles against a rebuilt manifest and refetches locale files', async () => {
    let now = 1000;
    const stored = draft('path:/');
    const store = await seeded(stored);
    const { t, served, fetch } = await make({ store, now: () => now });
    expect(t.initialReconcile).toEqual({ live: [], conflicts: [] });
    served[MANIFEST_URL] = JSON.stringify({ ...MANIFEST, base: SHA_B });
    served[`${LOCALES_URL}ar.json`] = JSON.stringify({
      home: { title: 'أهلاً', greet: 'أهلا {name}' },
    });
    now = 1000 + 60_000;
    expect(await t.refreshManifest()).toEqual({ live: [stored], conflicts: [] });
    expect(t.manifest.base).toBe(SHA_B);
    expect(await t.listDrafts()).toEqual([]);
    expect(fetch.mock.calls.filter(([url]) => url === `${LOCALES_URL}ar.json`)).toHaveLength(2);
  });

  it('keeps the old manifest when the new one is invalid', async () => {
    let now = 1000;
    const { t, served } = await make({ now: () => now });
    served[MANIFEST_URL] = '{"format":9}';
    now = 1000 + 60_000;
    expect(await t.refreshManifest()).toBeNull();
    expect(t.manifest.base).toBe(SHA_A);
  });
});
