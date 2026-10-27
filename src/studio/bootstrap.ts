import { setStudioTransport } from './api.js';
import { detectStudioRuntime, resolveAppOrigin } from './config.js';
import { setStudioRuntime, type StudioRuntime } from './runtime.js';
import { openDraftStore } from './transport/draft-store.js';
import { createStaticTransport } from './transport/static.js';

/** What the Studio reads from the page at start-up; injectable for tests. */
export interface StudioEnvironment {
  /** `location.href` of the Studio page. */
  href: string;
  /** `location.search` of the Studio page. */
  search: string;
  /** `window.__LIVELOCALE_CONFIG__?.appOrigin`, injected by `livelocale studio`. */
  injected?: unknown;
  /** `VITE_APP_ORIGIN` compiled in at build time. */
  buildTime?: unknown;
  fetch: typeof fetch;
  /** `window.indexedDB`; drafts stay in memory without it. */
  indexedDB?: IDBFactory;
  now?: () => number;
}

async function resolveRuntime(env: StudioEnvironment): Promise<StudioRuntime> {
  const detected = await detectStudioRuntime(env);
  if (detected.kind !== 'static') return detected;
  const store = await openDraftStore(env.indexedDB);
  const transport = await createStaticTransport({
    manifest: detected.manifest,
    manifestText: detected.manifestText,
    studioUrl: env.href,
    appUrl: detected.appUrl,
    store,
    fetch: env.fetch,
    now: env.now,
  });
  return { ...detected, transport };
}

/**
 * Decides how the Studio runs and installs it: a static share folder gets the
 * IndexedDB draft transport, anything else keeps the HTTP API. Never rejects:
 * an unexpected failure falls back to a server runtime from `resolveAppOrigin`.
 */
export async function startStudio(env: StudioEnvironment): Promise<StudioRuntime> {
  let runtime: StudioRuntime;
  try {
    runtime = await resolveRuntime(env);
  } catch {
    const appOrigin = resolveAppOrigin(env);
    runtime = { kind: 'server', appOrigin, appUrl: appOrigin, problems: [] };
  }
  setStudioTransport(runtime.kind === 'static' ? runtime.transport : null);
  setStudioRuntime(runtime);
  return runtime;
}
