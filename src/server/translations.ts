import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { wrapTranslationEngine } from '../client/wrap.js';
import { deepMerge } from '../core/deep-merge.js';
import { isLensEnabled } from '../core/env.js';
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
   * missing.
   * @default `'en'`
   */
  fallbackLocale?: string;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
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

/**
 * Loads a locale JSON file and returns a type-safe translation object that
 * is automatically watermarked in development (for zero-migration studio
 * integration) and returned as-is in production.
 *
 * File parses are cached by mtime and size (see `core/json-cache.ts`), so
 * repeated server renders cost one `stat` per file instead of a read and parse.
 *
 * This is the recommended entry-point for Server Components — no manual
 * `wrapTranslationEngine` call needed.
 *
 * @example
 * ```tsx
 * // app/page.tsx
 * import { createTranslations } from 'next-i18n-lens/server';
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
  } = options;

  // SECURITY: reject locales not in the allow-list to prevent path traversal
  const safeLocale = supportedLocales.includes(locale) ? locale : fallbackLocale;

  const loadFlatFile = (dir: string, loc: string, fallback: string): Record<string, any> => {
    try {
      return readJsonCached(join(dir, `${loc}.json`));
    } catch {
      try {
        return readJsonCached(join(dir, `${fallback}.json`));
      } catch {
        return {};
      }
    }
  };

  const localePath = join(localesDir, safeLocale);
  let data: Record<string, any> = {};

  if (isDirectory(localePath)) {
    try {
      data = readNamespaceDir(localePath);
    } catch {
      data = loadFlatFile(localesDir, safeLocale, fallbackLocale);
    }
  } else {
    data = loadFlatFile(localesDir, safeLocale, fallbackLocale);
  }

  // In development, merge every other locale into a fallback dictionary so
  // untranslated keys still render (and stay editable) in the Studio.
  let fallbackData: Record<string, any> = {};
  if (isLensEnabled()) {
    try {
      for (const entry of readdirSync(localesDir)) {
        if (entry.startsWith('.') || entry === safeLocale) continue;
        const entryPath = join(localesDir, entry);

        if (isDirectory(entryPath)) {
          try {
            const namespaces = readNamespaceDir(entryPath);
            for (const ns of Object.keys(namespaces)) {
              fallbackData[ns] = deepMerge(fallbackData[ns] || {}, namespaces[ns]);
            }
          } catch {}
        } else if (entry.endsWith('.json')) {
          if (entry.slice(0, -5) === safeLocale) continue;
          try {
            fallbackData = deepMerge(fallbackData, readJsonCached(entryPath));
          } catch {}
        }
      }
    } catch {}
  }

  return wrapTranslationEngine(data, { fallback: fallbackData });
}
