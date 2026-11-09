import * as path from 'path';
import * as fs from 'fs';
import { deepMerge } from '../core/deep-merge.js';
import { BROWSER_FLAG_GLOBAL, getLiveLocaleMode } from '../core/env.js';
import { decodeKey } from '../client/watermark.js';
import { FALLBACK_PARTIAL_GLOBAL } from '../client/wrap.js';

/**
 * What a dev server puts in `<head>` of every page it renders, so the in-page client runs
 * without bundler-specific env inlining: the mode flag and the fallback dictionary. The Vite
 * plugin injects it through `transformIndexHtml`; the Astro integration, whose pages never
 * pass through that hook, through a middleware. Both build it per request, from the files on
 * disk, so a save in the Studio shows up on the next page load.
 */

/**
 * Every locale merged into one dictionary, namespaces as top-level keys. Throws when the folder
 * cannot be read. Later entries win the merge, so the source locale goes last: a key missing
 * from one locale then shows its source text, not whichever locale the folder lists last.
 */
export function readFallbackDictionary(
  localesPath: string,
  sourceLocale = 'en'
): Record<string, any> {
  const resolvedLocalesPath = path.resolve(localesPath);
  const isPreferred = (entry: string) => entry === sourceLocale || entry === `${sourceLocale}.json`;
  const entries = fs
    .readdirSync(resolvedLocalesPath)
    .sort((a, b) => Number(isPreferred(a)) - Number(isPreferred(b)));
  let fallbackData: Record<string, any> = {};
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const entryPath = path.join(resolvedLocalesPath, entry);
    let entryIsDir = false;
    try {
      entryIsDir = fs.statSync(entryPath).isDirectory();
    } catch {}

    if (entryIsDir) {
      try {
        const files = fs.readdirSync(entryPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const ns = file.slice(0, -5);
            const raw = fs.readFileSync(path.join(entryPath, file), 'utf-8');
            try {
              const parsed = JSON.parse(raw);
              fallbackData[ns] = deepMerge(fallbackData[ns] || {}, parsed);
            } catch {}
          }
        }
      } catch {}
    } else if (entry.endsWith('.json')) {
      const raw = fs.readFileSync(entryPath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        fallbackData = deepMerge(fallbackData, parsed);
      } catch {}
    }
  }
  return fallbackData;
}

/**
 * The flag the page should carry: the active mode when LiveLocale is on, else the raw
 * `LIVELOCALE` value (so `off` reaches the client too), else none.
 */
export function pageFlag(): string | null {
  const mode = getLiveLocaleMode();
  if (mode !== 'off') return mode;
  return process.env['LIVELOCALE'] || null;
}

/**
 * Which namespaces (top-level keys) of the fallback dictionary a page gets: `'all'`, or the
 * ones whose keys the page's HTML shows watermarked plus the ones listed.
 */
export type FallbackNamespaces = 'all' | readonly string[];

export interface PageHeadOptions {
  /** Defaults to `'all'`. */
  fallbackNamespaces?: FallbackNamespaces;
  /** The page, read for its watermarks when `fallbackNamespaces` is a list. */
  html?: string;
}

/** A complete watermark, as `encodeKey` writes it. */
const WATERMARK_RE = /\u200C(?:[\u200B\u200D]{8})+\u200C/g;

/** The first segment of every watermarked key in `html`: the namespaces the page shows. */
export function watermarkedNamespaces(html: string): Set<string> {
  const namespaces = new Set<string>();
  for (const m of html.matchAll(WATERMARK_RE)) {
    const key = decodeKey(m[0])?.key;
    if (key) namespaces.add(key.split('.', 1)[0]!);
  }
  return namespaces;
}

/** The dictionary cut to `fallbackNamespaces`; the whole dictionary for `'all'`. */
function pageDictionary(
  dictionary: Record<string, any>,
  options: PageHeadOptions
): Record<string, any> {
  const list = options.fallbackNamespaces ?? 'all';
  if (list === 'all') return dictionary;
  const keep = watermarkedNamespaces(options.html ?? '');
  for (const ns of list) keep.add(ns);
  return Object.fromEntries(Object.entries(dictionary).filter(([ns]) => keep.has(ns)));
}

/**
 * `<script>` tags for `<head>`: the flag, then, when LiveLocale is on, the fallback dictionary.
 * With a `fallbackNamespaces` list, the dictionary holds only the namespaces the page shows and
 * the listed ones, and the page is told so: a client-side read of a namespace left out then
 * warns in the console instead of going blank without a word.
 */
export function pageHeadScripts(
  localesPath: string,
  sourceLocale?: string,
  options: PageHeadOptions = {}
): string {
  const flag = pageFlag();
  const flagScript = flag
    ? `<script>window.${BROWSER_FLAG_GLOBAL} = ${JSON.stringify(flag)};</script>\n`
    : '';
  if (getLiveLocaleMode() === 'off') return flagScript;
  try {
    // RULE SEC-008: XSS-SAFE INJECTION — escape U+2028/U+2029 and "<" so
    // translation values containing "</script>" cannot break out of the tag.
    const dictionary = pageDictionary(readFallbackDictionary(localesPath, sourceLocale), options);
    const safeJson = JSON.stringify(dictionary)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    const partial =
      (options.fallbackNamespaces ?? 'all') === 'all'
        ? ''
        : ` window.${FALLBACK_PARTIAL_GLOBAL} = true;`;
    return `${flagScript}<script>window.__livelocale_fallback__ = ${safeJson};${partial}</script>\n`;
  } catch (err) {
    console.warn('[livelocale] Failed to inject fallback data:', err);
    return flagScript;
  }
}

/** Puts `scripts` right before `</head>`; returns `html` unchanged when it has no `</head>`. */
export function injectIntoHead(html: string, scripts: string): string {
  // A replacer function, so `$&`, `$'` and the like in translation values stay literal.
  return scripts ? html.replace('</head>', () => `${scripts}</head>`) : html;
}
