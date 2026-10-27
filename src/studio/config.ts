/**
 * Runtime resolution of the origin of the application being edited.
 *
 * Precedence (first valid wins):
 *   1. `?app=<origin>` query parameter on the Studio URL
 *   2. `window.__LIVELOCALE_CONFIG__.appOrigin`, injected by `livelocale studio --app`
 *   3. `VITE_APP_ORIGIN` baked in at Studio build time
 *   4. `http://localhost:3000`
 */
import {
  parseShareManifest,
  SHARE_MANIFEST_FILE,
  type ShareManifest,
} from '../core/share-manifest.js';
import type { DetectedRuntime } from './runtime.js';

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

/** Shown when a Studio under `/livelocale/` finds no usable share manifest next to it. */
export const STATIC_MANIFEST_MISSING =
  'This Studio was opened from a website, but livelocale/manifest.json is missing or is not a LiveLocale manifest. Rebuild with share: true (or run livelocale pack) and upload the whole livelocale/ folder.';

/** The app URL for a static Studio: the folder above the Studio's own folder. */
export function resolveStaticAppUrl(studioHref: string): string {
  return new URL('../', studioHref).href;
}

export interface RuntimeSources extends AppOriginSources {
  /** `window.location.href` of the Studio page. */
  href: string;
  fetch: typeof fetch;
}

const SHARE_STUDIO_PATH_RE = /\/livelocale\/(index\.html)?$/;

/** Fetches `./manifest.json` and returns the manifest and its text, or null when it is unusable. */
async function probeManifest(
  sources: RuntimeSources
): Promise<{ manifest: ShareManifest; manifestText: string } | null> {
  try {
    const response = await sources.fetch(new URL(SHARE_MANIFEST_FILE, sources.href).href, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const manifestText = await response.text();
    const manifest = parseShareManifest(JSON.parse(manifestText));
    return manifest ? { manifest, manifestText } : null;
  } catch {
    return null;
  }
}

/**
 * Decides how the Studio runs. A CLI-injected origin means a server stack and
 * nothing is probed. Otherwise a LiveLocale `./manifest.json` next to the Studio
 * means a static share folder, with the app one folder up (`?app=` is ignored).
 * Anything else falls back to `resolveAppOrigin`.
 */
export async function detectStudioRuntime(sources: RuntimeSources): Promise<DetectedRuntime> {
  const server = (problems: string[]): DetectedRuntime => {
    const appOrigin = resolveAppOrigin(sources);
    return { kind: 'server', appOrigin, appUrl: appOrigin, problems };
  };
  if (normalizeOrigin(sources.injected) !== null) return server([]);

  const found = await probeManifest(sources);
  if (found) {
    return {
      kind: 'static',
      appOrigin: new URL(sources.href).origin,
      appUrl: resolveStaticAppUrl(sources.href),
      ...found,
    };
  }
  const underShareFolder = SHARE_STUDIO_PATH_RE.test(new URL(sources.href).pathname);
  return server(underShareFolder ? [STATIC_MANIFEST_MISSING] : []);
}
