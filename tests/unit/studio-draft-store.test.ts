// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  createMemoryDraftStore,
  openDraftStore,
  openIndexedDbDraftStore,
  type DraftStore,
} from '../../src/studio/transport/draft-store.js';
import type { Draft } from '../../src/studio/transport/drafts.js';

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    scope: 'acme/web',
    locale: 'ar',
    key: 'home.title',
    from: 'Old',
    to: 'New',
    force: false,
    base: 'abc123',
    branch: 'main',
    status: 'unsent',
    conflict: false,
    updatedAt: 1,
    sentAt: null,
    ...overrides,
  };
}

describe.each<[string, () => Promise<DraftStore>]>([
  ['indexeddb', () => openIndexedDbDraftStore(new IDBFactory())],
  ['memory', async () => createMemoryDraftStore()],
])('%s draft store', (_name, open) => {
  it('round-trips a draft and lists only its scope, newest first', async () => {
    const store = await open();
    const older = draft({ key: 'a', updatedAt: 1 });
    const newer = draft({ key: 'b', updatedAt: 2 });
    await store.put(older);
    await store.put(newer);
    await store.put(draft({ scope: 'path:/', key: 'c', updatedAt: 3 }));

    expect(await store.get('acme/web', 'ar', 'a')).toEqual(older);
    const listed = await store.list('acme/web');
    expect(listed.map((d) => d.updatedAt)).toEqual([2, 1]);
    expect(listed).toEqual([newer, older]);
  });

  it('replaces a draft with the same scope, locale and key', async () => {
    const store = await open();
    await store.put(draft({ to: 'First', updatedAt: 1 }));
    await store.put(draft({ to: 'Second', updatedAt: 2 }));

    expect(await store.list('acme/web')).toEqual([draft({ to: 'Second', updatedAt: 2 })]);
    expect((await store.get('acme/web', 'ar', 'home.title'))?.to).toBe('Second');
  });

  it('deletes a draft', async () => {
    const store = await open();
    await store.put(draft());
    await store.put(draft({ locale: 'fr' }));
    await store.delete('acme/web', 'ar', 'home.title');

    expect(await store.get('acme/web', 'ar', 'home.title')).toBeUndefined();
    expect(await store.list('acme/web')).toEqual([draft({ locale: 'fr' })]);
  });
});

describe('IndexedDB draft store', () => {
  it('keeps drafts across re-opening the database', async () => {
    const factory = new IDBFactory();
    const first = await openIndexedDbDraftStore(factory);
    expect(first.persistent).toBe(true);
    await first.put(draft());

    const second = await openIndexedDbDraftStore(factory);
    expect(await second.get('acme/web', 'ar', 'home.title')).toEqual(draft());
  });

  it('creates livelocale-drafts v1 with a drafts store', async () => {
    const factory = new IDBFactory();
    await openIndexedDbDraftStore(factory);
    expect(await factory.databases()).toContainEqual({ name: 'livelocale-drafts', version: 1 });
  });
});

describe('openDraftStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to memory when IndexedDB is missing, throws or never opens', async () => {
    expect((await openDraftStore(undefined)).persistent).toBe(false);

    const throwing = {
      open: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    } as unknown as IDBFactory;
    expect((await openDraftStore(throwing)).persistent).toBe(false);

    vi.useFakeTimers();
    const stalled = { open: () => ({}) as IDBOpenDBRequest } as unknown as IDBFactory;
    const pending = openDraftStore(stalled);
    vi.advanceTimersByTime(3000);
    expect((await pending).persistent).toBe(false);
  });

  it('uses IndexedDB when it opens', async () => {
    expect((await openDraftStore(new IDBFactory())).persistent).toBe(true);
  });
});
