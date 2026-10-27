import { deepMerge } from '../../core/deep-merge.js';
import { flattenKeys, lookupKey, setNestedProperty } from '../../core/json-path.js';
import { validateEdit } from '../../core/save-rules.js';
import type { ShareManifest } from '../../core/share-manifest.js';
import { isSafeLocaleSegment, isValidLocaleFormat } from '../../core/validate.js';
import { ValidationError, type GitState, type ServerInfo, type StudioTransport } from '../api.js';
import type { DraftStore } from './draft-store.js';
import { buildDraftDiff, draftScope, localeFilePath, type Draft, type DraftId } from './drafts.js';

/** Dispatched on the transport's `events` target whenever drafts change. */
export const DRAFTS_CHANGED_EVENT = 'livelocale:drafts-changed';
export const STORAGE_PROBLEM =
  'This browser cannot keep your changes after the tab closes (private window or blocked storage). Send them before you leave.';
export const LOCALE_ACTIONS_UNSUPPORTED =
  'Adding, renaming or deleting languages is not available on a share link. Ask your developer.';
export const COMMIT_UNSUPPORTED = 'Use "Send to developer" to hand your changes over.';

export interface StaticTransportOptions {
  manifest: ShareManifest;
  manifestText: string;
  studioUrl: string;
  appUrl: string;
  store: DraftStore;
  fetch?: typeof fetch;
  now?: () => number;
  /** Where draft events are dispatched; defaults to `window`, else a new `EventTarget`. */
  events?: EventTarget;
}

export interface StaticTransport extends StudioTransport {
  readonly manifest: ShareManifest;
  readonly scope: string;
  readonly persistent: boolean;
  readonly events: EventTarget;
  /** The built dictionary for `locale`, without drafts. */
  readBuiltLocale(locale: string): Promise<Record<string, unknown>>;
  /** Per locale and flat key: the built value, then the draft `to` when it differs. */
  textCandidates(): Promise<Record<string, Record<string, string[]>>>;
  /** Every draft in this scope, newest first. */
  listDrafts(): Promise<Draft[]>;
  /** Removes one draft and returns it, or undefined when there was none. */
  discardDraft(locale: string, key: string): Promise<Draft | undefined>;
  /** Marks these drafts as sent now. */
  markDraftsSent(ids: readonly DraftId[]): Promise<void>;
}

/** True when one dotted key contains the other as a group (`promo` and `promo.banner`). */
const keysOverlap = (a: string, b: string): boolean =>
  a.startsWith(b + '.') || b.startsWith(a + '.');

/** A Studio transport for a share link: built locale files next to the Studio, drafts in the browser. */
export async function createStaticTransport(
  options: StaticTransportOptions
): Promise<StaticTransport> {
  const { manifest, studioUrl, appUrl, store } = options;
  const fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const events = options.events ?? (typeof window !== 'undefined' ? window : new EventTarget());
  const draftsChanged = (): void => {
    events.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT));
  };
  const scope = draftScope(manifest, appUrl);
  const built = new Map<string, Promise<Record<string, unknown>>>();

  const isKnownLocale = (locale: string): boolean =>
    isValidLocaleFormat(locale) && isSafeLocaleSegment(locale) && manifest.locales.includes(locale);

  async function loadLocale(locale: string): Promise<Record<string, unknown>> {
    const path = `locales/${locale}.json`;
    const response = await fetchFn(new URL(path, studioUrl).href, {
      cache: 'no-cache',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
    return (await response.json()) as Record<string, unknown>;
  }

  function readBuiltLocale(locale: string): Promise<Record<string, unknown>> {
    if (!isKnownLocale(locale)) {
      return Promise.reject(new Error(`Unknown language "${locale}".`));
    }
    let pending = built.get(locale);
    if (!pending) {
      pending = loadLocale(locale);
      built.set(locale, pending);
      pending.catch(() => {
        if (built.get(locale) === pending) built.delete(locale);
      });
    }
    return pending;
  }

  /** Drafts for `locale`, oldest first, so the newest wins when applied in order. */
  async function draftsFor(locale: string): Promise<Draft[]> {
    return (await store.list(scope)).filter((d) => d.locale === locale).reverse();
  }

  /** Every manifest locale whose file loads, with its built dictionary. */
  async function loadedLocales(): Promise<[string, Record<string, unknown>][]> {
    const results = await Promise.allSettled(manifest.locales.map((l) => readBuiltLocale(l)));
    const loaded: [string, Record<string, unknown>][] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') loaded.push([manifest.locales[i]!, result.value]);
    });
    return loaded;
  }

  return {
    manifest,
    scope,
    persistent: store.persistent,
    events,
    readBuiltLocale,

    async fetchInfo(): Promise<ServerInfo> {
      return {
        mode: 'static',
        authRequired: false,
        git: false,
        problems: store.persistent ? [] : [STORAGE_PROBLEM],
      };
    },

    async fetchLocales() {
      return [...manifest.locales];
    },

    async fetchLocaleDictionary(locale) {
      const dictionary = await readBuiltLocale(locale);
      const overlay: Record<string, any> = {};
      for (const d of await draftsFor(locale)) setNestedProperty(overlay, d.key, d.to);
      return deepMerge(dictionary, overlay) as Record<string, any>;
    },

    async fetchKeysMetadata() {
      const keys = new Set<string>(manifest.codeKeys);
      for (const [, dictionary] of await loadedLocales()) flattenKeys(dictionary, '', keys);
      for (const d of await store.list(scope)) keys.add(d.key);
      return { allKeys: [...keys].sort(), codeKeys: [...manifest.codeKeys] };
    },

    async textCandidates() {
      const candidates: Record<string, Record<string, string[]>> = {};
      for (const [locale, dictionary] of await loadedLocales()) {
        const texts: Record<string, string[]> = {};
        for (const key of flattenKeys(dictionary)) {
          const found = lookupKey(dictionary, key);
          if (found.state === 'string') texts[key] = [found.value];
        }
        for (const d of await draftsFor(locale)) {
          const list = (texts[d.key] ??= []);
          if (!list.includes(d.to)) list.push(d.to);
        }
        candidates[locale] = texts;
      }
      return candidates;
    },

    listDrafts() {
      return store.list(scope);
    },

    async discardDraft(locale, key) {
      const existing = await store.get(scope, locale, key);
      if (existing) await store.delete(scope, locale, key);
      draftsChanged();
      return existing;
    },

    async markDraftsSent(ids) {
      const sentAt = now();
      for (const { locale, key } of ids) {
        const existing = await store.get(scope, locale, key);
        if (existing) await store.put({ ...existing, status: 'sent', sentAt });
      }
      draftsChanged();
    },

    async saveTranslation(locale, key, value, saveOptions = {}) {
      const target = await readBuiltLocale(locale);
      const found = lookupKey(target, key);
      const from = found.state === 'string' ? found.value : null;

      // Restoring the built value needs no validation: the draft simply goes away.
      if (value === from) {
        await store.delete(scope, locale, key);
        draftsChanged();
        return { success: true, key, locale };
      }

      const force = saveOptions.force === true;
      const verdict = validateEdit(
        { locale, key, value },
        {
          sourceLocale: manifest.sourceLocale,
          source: await readBuiltLocale(manifest.sourceLocale),
          target,
        },
        { force }
      );
      if (!verdict.ok && verdict.status !== 422) throw new Error(verdict.error);

      // Two drafts where one key groups the other cannot travel in one change link.
      const others = (await store.list(scope)).filter((d) => d.locale === locale && d.key !== key);
      if (others.some((d) => keysOverlap(d.key, key))) {
        throw new Error(
          `Cannot save "${key}" in ${locale}: it would replace translations that are not a single text.`
        );
      }

      if (!verdict.ok) throw new ValidationError(verdict.error, verdict.code, verdict.details);

      await store.put({
        scope,
        locale,
        key,
        from,
        to: value,
        force,
        base: manifest.base,
        branch: manifest.branch,
        status: 'unsent',
        conflict: false,
        updatedAt: now(),
        sentAt: null,
      });
      draftsChanged();
      return { success: true, key, locale };
    },

    async discardLocales() {
      for (const d of await store.list(scope)) {
        if (d.status === 'unsent') await store.delete(scope, d.locale, d.key);
      }
      draftsChanged();
      return { success: true };
    },

    async fetchGitState(): Promise<GitState> {
      const drafts = await store.list(scope);
      const paths = new Set(drafts.map((d) => localeFilePath(manifest, d.locale, d.key)));
      return {
        available: true,
        isRepo: true,
        branch: manifest.branch,
        mode: 'static',
        changes: [...paths].sort().map((path) => ({ path, status: 'modified' })),
        diff: buildDraftDiff(drafts, manifest),
        pullRequestUrl: null,
      };
    },

    addLocaleRequest: () => Promise.reject(new Error(LOCALE_ACTIONS_UNSUPPORTED)),
    renameLocaleRequest: () => Promise.reject(new Error(LOCALE_ACTIONS_UNSUPPORTED)),
    deleteLocaleRequest: () => Promise.reject(new Error(LOCALE_ACTIONS_UNSUPPORTED)),
    commitLocales: () => Promise.reject(new Error(COMMIT_UNSUPPORTED)),
  };
}
