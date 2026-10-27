import { deepMerge } from '../../core/deep-merge.js';
import { flattenKeys, lookupKey, setNestedProperty } from '../../core/json-path.js';
import type { ShareManifest } from '../../core/share-manifest.js';
import { isSafeLocaleSegment, isValidLocaleFormat } from '../../core/validate.js';
import type { ServerInfo, StudioTransport } from '../api.js';
import type { DraftStore } from './draft-store.js';
import { draftScope, type Draft } from './drafts.js';

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
}

/** A Studio transport for a share link: built locale files next to the Studio, drafts in the browser. */
export async function createStaticTransport(
  options: StaticTransportOptions
): Promise<StaticTransport> {
  const { manifest, studioUrl, appUrl, store } = options;
  const fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const events = options.events ?? (typeof window !== 'undefined' ? window : new EventTarget());
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

  const notImplemented = (): Promise<never> => Promise.reject(new Error('not implemented'));

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

    fetchGitState: notImplemented,
    saveTranslation: notImplemented,
    discardLocales: notImplemented,

    addLocaleRequest: () => Promise.reject(new Error(LOCALE_ACTIONS_UNSUPPORTED)),
    renameLocaleRequest: () => Promise.reject(new Error(LOCALE_ACTIONS_UNSUPPORTED)),
    deleteLocaleRequest: () => Promise.reject(new Error(LOCALE_ACTIONS_UNSUPPORTED)),
    commitLocales: () => Promise.reject(new Error(COMMIT_UNSUPPORTED)),
  };
}
