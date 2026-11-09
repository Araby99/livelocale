import * as path from 'path';
import * as fs from 'fs';
import { deepMerge } from '../core/deep-merge.js';
import { BROWSER_FLAG_GLOBAL, getLiveLocaleMode } from '../core/env.js';

/**
 * What a dev server puts in `<head>` of every page it renders, so the in-page client runs
 * without bundler-specific env inlining: the mode flag and the fallback dictionary. The Vite
 * plugin injects it through `transformIndexHtml`; the Astro integration, whose pages never
 * pass through that hook, through a middleware. Both build it per request, from the files on
 * disk, so a save in the Studio shows up on the next page load.
 */

/** Every locale merged into one dictionary, namespaces as top-level keys. Throws when the folder cannot be read. */
export function readFallbackDictionary(localesPath: string): Record<string, any> {
  const resolvedLocalesPath = path.resolve(localesPath);
  const entries = fs.readdirSync(resolvedLocalesPath);
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

/** `<script>` tags for `<head>`: the flag, then, when LiveLocale is on, the fallback dictionary. */
export function pageHeadScripts(localesPath: string): string {
  const flag = pageFlag();
  const flagScript = flag
    ? `<script>window.${BROWSER_FLAG_GLOBAL} = ${JSON.stringify(flag)};</script>\n`
    : '';
  if (getLiveLocaleMode() === 'off') return flagScript;
  try {
    // RULE SEC-008: XSS-SAFE INJECTION — escape U+2028/U+2029 and "<" so
    // translation values containing "</script>" cannot break out of the tag.
    const safeJson = JSON.stringify(readFallbackDictionary(localesPath))
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    return `${flagScript}<script>window.__livelocale_fallback__ = ${safeJson};</script>\n`;
  } catch (err) {
    console.warn('[livelocale] Failed to inject fallback data:', err);
    return flagScript;
  }
}

/** Puts `scripts` right before `</head>`; returns `html` unchanged when it has no `</head>`. */
export function injectIntoHead(html: string, scripts: string): string {
  return scripts ? html.replace('</head>', `${scripts}</head>`) : html;
}
