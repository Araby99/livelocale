/**
 * Runtime resolution of the origin of the application being edited.
 *
 * Precedence (first valid wins):
 *   1. `?app=<origin>` query parameter on the Studio URL
 *   2. `window.__LIVELOCALE_CONFIG__.appOrigin`, injected by `livelocale studio --app`
 *   3. `VITE_APP_ORIGIN` baked in at Studio build time
 *   4. `http://localhost:3000`
 */
export const DEFAULT_APP_ORIGIN = 'http://localhost:3000';

export interface AppOriginSources {
  /** `window.location.search`, e.g. `?app=http://localhost:3001` */
  search?: string;
  /** Value injected by the CLI into the served index.html. */
  injected?: unknown;
  /** Value compiled in by Vite from `VITE_APP_ORIGIN`. */
  buildTime?: unknown;
}

/** Returns a bare `scheme://host[:port]` origin, or null when `value` is not an http(s) URL. */
export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveAppOrigin(sources: AppOriginSources): string {
  let fromQuery: string | null = null;
  if (sources.search) {
    try {
      fromQuery = new URLSearchParams(sources.search).get('app');
    } catch {
      fromQuery = null;
    }
  }

  return (
    normalizeOrigin(fromQuery) ??
    normalizeOrigin(sources.injected) ??
    normalizeOrigin(sources.buildTime) ??
    DEFAULT_APP_ORIGIN
  );
}
