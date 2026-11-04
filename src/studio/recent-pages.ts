import type { ShareManifest } from '../core/share-manifest.js';
import { readPref, writePref } from './share/browser.js';
import { draftScope } from './transport/drafts.js';

/** How many recently visited pages are remembered per site. */
export const RECENT_PAGES_MAX = 20;
/** How many suggestions the address field shows in total. */
export const SUGGESTIONS_MAX = 8;

export type RecentPagesRuntime =
  | { kind: 'server'; appOrigin: string }
  | { kind: 'static'; manifest: Pick<ShareManifest, 'repo'>; appUrl: string };

/** The site the recent pages belong to: the drafts scope for a share, the app origin otherwise. */
export function recentPagesScope(runtime: RecentPagesRuntime): string {
  if (runtime.kind === 'static') return draftScope(runtime.manifest, runtime.appUrl);
  return 'app:' + runtime.appOrigin;
}

const isPagePath = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

function cleanList(values: readonly unknown[]): string[] {
  const unique = [...new Set(values.filter(isPagePath))];
  return unique.slice(0, RECENT_PAGES_MAX);
}

/** The remembered pages for `scope`, most recent first; [] when storage holds nothing usable. */
export function readRecentPages(scope: string): string[] {
  const raw = readPref(`recent-pages:${scope}`);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? cleanList(parsed) : [];
  } catch {
    return [];
  }
}

/** Puts `displayPath` (without its hash) first in the remembered pages and returns the new list. */
export function rememberPage(scope: string, displayPath: string): string[] {
  const hash = displayPath.indexOf('#');
  const path = hash === -1 ? displayPath : displayPath.slice(0, hash);
  const list = cleanList([path, ...readRecentPages(scope)]);
  writePref(`recent-pages:${scope}`, JSON.stringify(list));
  return list;
}

/**
 * The pages matching `query` (case-insensitive substring of the trimmed query; empty matches
 * all): recent pages first, then site pages not already among them, at most SUGGESTIONS_MAX.
 */
export function suggestPages(
  query: string,
  recent: readonly string[],
  site: readonly string[]
): { recent: string[]; site: string[] } {
  const needle = query.trim().toLowerCase();
  const matches = (path: string) => path.toLowerCase().includes(needle);
  const recentMatches = recent.filter(matches).slice(0, SUGGESTIONS_MAX);
  const seen = new Set(recent);
  const siteMatches = site
    .filter((path) => !seen.has(path) && matches(path))
    .slice(0, SUGGESTIONS_MAX - recentMatches.length);
  return { recent: recentMatches, site: siteMatches };
}
