import type { Draft } from './drafts.js';

export const DRAFTS_DB_NAME = 'livelocale-drafts';
export const DRAFTS_DB_VERSION = 1;
/** Object store keyed by `['scope', 'locale', 'key']`, with an index on `scope`. */
export const DRAFTS_STORE = 'drafts';
export const DRAFT_STORE_OPEN_TIMEOUT_MS = 3000;

const SCOPE_INDEX = 'scope';

/** Where translator drafts are kept between visits. */
export interface DraftStore {
  /** False when drafts only live as long as the page (the memory fallback). */
  readonly persistent: boolean;
  get(scope: string, locale: string, key: string): Promise<Draft | undefined>;
  /** Resolves once the write is committed; rejects when it fails or aborts (for example on quota). */
  put(draft: Draft): Promise<void>;
  delete(scope: string, locale: string, key: string): Promise<void>;
  /** Every draft in `scope`, newest `updatedAt` first. */
  list(scope: string): Promise<Draft[]>;
}

function newestFirst(drafts: Draft[]): Draft[] {
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function indexedDbStore(db: IDBDatabase): DraftStore {
  const read = (): IDBObjectStore =>
    db.transaction(DRAFTS_STORE, 'readonly').objectStore(DRAFTS_STORE);
  const write = async (action: (store: IDBObjectStore) => void): Promise<void> => {
    const tx = db.transaction(DRAFTS_STORE, 'readwrite');
    const done = transactionDone(tx);
    action(tx.objectStore(DRAFTS_STORE));
    await done;
  };

  return {
    persistent: true,
    async get(scope, locale, key) {
      return (await requestResult(read().get([scope, locale, key]))) as Draft | undefined;
    },
    put(draft) {
      return write((store) => store.put(draft));
    },
    delete(scope, locale, key) {
      return write((store) => store.delete([scope, locale, key]));
    },
    async list(scope) {
      const drafts = (await requestResult(read().index(SCOPE_INDEX).getAll(scope))) as Draft[];
      return newestFirst(drafts);
    },
  };
}

/** Opens the drafts database, creating it on first use. Rejects on error, block or timeout. */
export function openIndexedDbDraftStore(factory: IDBFactory): Promise<DraftStore> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('IndexedDB did not open in time'));
    }, DRAFT_STORE_OPEN_TIMEOUT_MS);
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DRAFTS_DB_NAME, DRAFTS_DB_VERSION);
    } catch (error) {
      fail(error);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        const store = db.createObjectStore(DRAFTS_STORE, { keyPath: ['scope', 'locale', 'key'] });
        store.createIndex(SCOPE_INDEX, 'scope');
      }
    };
    request.onerror = () => fail(request.error ?? new Error('IndexedDB failed to open'));
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      // Let a newer Studio tab upgrade the database instead of blocking it.
      db.onversionchange = () => db.close();
      resolve(indexedDbStore(db));
    };
  });
}

/** Drafts kept only for the life of the page. */
export function createMemoryDraftStore(): DraftStore {
  const drafts = new Map<string, Draft>();
  const id = (scope: string, locale: string, key: string): string =>
    JSON.stringify([scope, locale, key]);

  return {
    persistent: false,
    async get(scope, locale, key) {
      const found = drafts.get(id(scope, locale, key));
      return found ? { ...found } : undefined;
    },
    async put(draft) {
      drafts.set(id(draft.scope, draft.locale, draft.key), { ...draft });
    },
    async delete(scope, locale, key) {
      drafts.delete(id(scope, locale, key));
    },
    async list(scope) {
      return newestFirst(
        [...drafts.values()].filter((d) => d.scope === scope).map((d) => ({ ...d }))
      );
    },
  };
}

/** The IndexedDB store when it opens; otherwise a memory store. Never rejects. */
export async function openDraftStore(factory: IDBFactory | undefined): Promise<DraftStore> {
  if (!factory) return createMemoryDraftStore();
  try {
    return await openIndexedDbDraftStore(factory);
  } catch {
    return createMemoryDraftStore();
  }
}
