import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { resolveTranslations, wrapTranslationEngine } from '../client/wrap.js';
import { deepMerge } from '../core/deep-merge.js';
import { isLiveLocaleEnabled } from '../core/env.js';
import { readJsonCached } from '../core/json-cache.js';

export interface CreateTranslationsOptions {
  /**
   * Directory containing locale JSON files.
   * @default `process.cwd() + '/locales'`
   */
  localesDir?: string;

  /**
   * List of accepted locale codes.  Any locale not in this list falls back to
   * `fallbackLocale` to prevent path-traversal attacks.
   * @default `['en']`
   */
  supportedLocales?: string[];

  /**
   * Locale to use when the requested locale is unsupported or its file is
   * missing, and for keys the requested locale does not have.
   * @default `'en'`
   */
  fallbackLocale?: string;

  /**
   * Return a plain object instead of a Proxy, with every key of the locale and of its
   * fallback filled in. Use it to JSON-serialize the translations or pass them as props
   * to a client component. While LiveLocale is on, its strings carry the same watermarks
   * a read through the Proxy gives.
   * @default `false`
   */
  plain?: boolean;

  /**
   * Return one namespace instead of the whole locale: the object under this top-level key
   * (one `<locale>/<namespace>.json` file in a folder layout), or under a dotted path such as
   * `home.hero`. Its strings keep the watermark of their full key path (`home.hero.title`),
   * and `livelocale check` reads `t.hero.title` on the result as `home.hero.title`. `{}` when
   * neither the locale nor its fallback has it.
   * @default the whole locale
   */
  namespace?: string;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

/** The object at the dotted `namespace` path of `data`, through own keys only; else `undefined`. */
function namespaceOf(
  data: Record<string, any> | undefined,
  namespace: string
): Record<string, any> | undefined {
  let node: unknown = data;
  for (const part of namespace.split('.')) {
    if (!isRecord(node) || !Object.prototype.hasOwnProperty.call(node, part)) return undefined;
    node = node[part];
  }
  return isRecord(node) ? node : undefined;
}

/** Reads every `*.json` in `dir` into `{ [namespace]: data }`, skipping unparsable files. */
function readNamespaceDir(dir: string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      out[file.slice(0, -5)] = readJsonCached(join(dir, file));
    } catch {}
  }
  return out;
}

/** Reads `<dir>/<locale>/*.json`, or else `<dir>/<locale>.json`. `undefined` when neither can be read. */
function readLocale(dir: string, locale: string): Record<string, any> | undefined {
  const localePath = join(dir, locale);
  if (isDirectory(localePath)) {
    try {
      return readNamespaceDir(localePath);
    } catch {}
  }
  try {
    return readJsonCached(join(dir, `${locale}.json`));
  } catch {
    return undefined;
  }
}

/**
 * Merged subtrees, keyed by the parsed objects `readJsonCached` hands out. An unchanged
 * file keeps its object, so a steady-state render reuses the merge; an edited file gets a
 * new object and the old entry is garbage collected.
 */
const mergeCache = new WeakMap<object, WeakMap<object, Record<string, any>>>();

function mergeCached(record: Record<string, any>, fallback: Record<string, any>) {
  let byFallback = mergeCache.get(record);
  if (!byFallback) {
    byFallback = new WeakMap();
    mergeCache.set(record, byFallback);
  }
  let merged = byFallback.get(fallback);
  if (!merged) {
    merged = resolveTranslations(record, { fallback, watermark: false });
    byFallback.set(fallback, merged);
  }
  return merged;
}

/**
 * `data` with the keys it lacks taken from `fallback`, as a plain object. The top level is
 * merged per key so a folder layout, whose namespace record is rebuilt on every call, still
 * hits the cache for each namespace file.
 */
function fillFromFallback(
  data: Record<string, any>,
  fallback: Record<string, any> | undefined
): Record<string, any> {
  if (!isRecord(fallback) || !isRecord(data) || data === fallback) return data;
  if (Array.isArray(data) || Array.isArray(fallback)) return mergeCached(data, fallback);

  const out: Record<string, any> = {};
  for (const key of new Set([...Object.keys(data), ...Object.keys(fallback)])) {
    const own = data[key];
    const fb = fallback[key];
    if (isRecord(own) && isRecord(fb) && own !== fb) out[key] = mergeCached(own, fb);
    else out[key] = own !== undefined ? own : fb;
  }
  return out;
}

/**
 * Merges every locale but `locale` into one dictionary, with `fallbackLocale` winning over
 * the others whatever their order in the folder.
 */
function readOtherLocales(
  localesDir: string,
  locale: string,
  fallbackLocale: string
): Record<string, any> {
  let others: Record<string, any> = {};
  let preferred: Record<string, any> | undefined;
  try {
    for (const entry of readdirSync(localesDir)) {
      if (entry.startsWith('.') || entry === locale) continue;
      const entryPath = join(localesDir, entry);

      let name: string;
      let content: Record<string, any>;
      if (isDirectory(entryPath)) {
        name = entry;
        try {
          content = readNamespaceDir(entryPath);
        } catch {
          continue;
        }
      } else if (entry.endsWith('.json')) {
        name = entry.slice(0, -5);
        if (name === locale) continue;
        try {
          content = readJsonCached(entryPath);
        } catch {
          continue;
        }
      } else {
        continue;
      }

      if (name === fallbackLocale) {
        preferred = preferred ? deepMerge(preferred, content) : content;
      } else {
        others = deepMerge(others, content);
      }
    }
  } catch {}

  return preferred
    ? resolveTranslations(preferred, { fallback: others, watermark: false })
    : others;
}

/**
 * Loads a locale JSON file and returns its translation object (typed as
 * `Record<string, any>`). Keys the locale does not have take the `fallbackLocale` value
 * in every mode.
 *
 * While LiveLocale is on, the object is a Proxy that watermarks every string (for
 * zero-migration Studio integration), and keys missing from both locales fall back to the
 * other locales, so untranslated text still renders and stays editable. While it is off,
 * the result is a plain object: the locale merged over `fallbackLocale`. With
 * `plain: true` it is a plain object in every mode.
 *
 * File parses are cached by mtime and size (see `core/json-cache.ts`), and so is the
 * production merge, so repeated server renders cost one `stat` per file instead of a read,
 * a parse and a merge.
 *
 * This is the recommended entry-point for Server Components — no manual
 * `wrapTranslationEngine` call needed.
 *
 * @example
 * ```tsx
 * // app/page.tsx
 * import { createTranslations } from 'livelocale/server';
 *
 * export default async function Page({ searchParams }) {
 *   const { locale = 'en' } = await searchParams;
 *   const t = createTranslations(locale, {
 *     supportedLocales: ['en', 'ar', 'es'],
 *   });
 *   return <h1>{t.home?.title}</h1>;
 * }
 * ```
 */
export function createTranslations(
  locale: string,
  options: CreateTranslationsOptions = {}
): Record<string, any> {
  const {
    localesDir = join(process.cwd(), 'locales'),
    supportedLocales = ['en'],
    fallbackLocale = 'en',
    plain = false,
    namespace,
  } = options;

  // SECURITY: reject locales not in the allow-list to prevent path traversal
  const safeLocale = supportedLocales.includes(locale) ? locale : fallbackLocale;

  const data =
    readLocale(localesDir, safeLocale) ??
    (safeLocale === fallbackLocale ? undefined : readLocale(localesDir, fallbackLocale)) ??
    {};

  // Production: fill missing keys from the fallback locale only, as a plain object.
  if (!isLiveLocaleEnabled()) {
    if (!namespace) {
      if (safeLocale === fallbackLocale) return data;
      return fillFromFallback(data, readLocale(localesDir, fallbackLocale));
    }
    const own = namespaceOf(data, namespace);
    if (safeLocale === fallbackLocale) return own ?? {};
    const fallbackNs = namespaceOf(readLocale(localesDir, fallbackLocale), namespace);
    return own ? fillFromFallback(own, fallbackNs) : (fallbackNs ?? {});
  }

  // In development, merge every other locale into a fallback dictionary so
  // untranslated keys still render (and stay editable) in the Studio.
  const fallbackData = readOtherLocales(localesDir, safeLocale, fallbackLocale);
  // A namespace keeps its full key path: the fallback is looked up, and every string
  // watermarked, under `namespace.`.
  const record = namespace ? (namespaceOf(data, namespace) ?? {}) : data;
  const keyPrefix = namespace || '';

  if (plain) {
    return resolveTranslations(record, { keyPrefix, fallback: fallbackData, watermark: true });
  }
  return wrapTranslationEngine(record, { keyPrefix, fallback: fallbackData });
}
