import type { ShareManifest } from '../core/share-manifest.js';
import { resolveAppOrigin } from './config.js';

declare global {
  interface Window {
    __LIVELOCALE_CONFIG__?: { appOrigin?: string };
  }
}

/** What detection finds. Task 32 adds the draft transport to the static variant of StudioRuntime. */
export type DetectedRuntime =
  | { kind: 'server'; appOrigin: string; appUrl: string; problems: string[] }
  | {
      kind: 'static';
      appOrigin: string;
      appUrl: string;
      manifest: ShareManifest;
      manifestText: string;
    };

export type StudioRuntime = DetectedRuntime;

let current: StudioRuntime | null = null;

export function setStudioRuntime(runtime: StudioRuntime): void {
  current = runtime;
}

export function resetStudioRuntime(): void {
  current = null;
}

/**
 * The runtime set at start-up. Unset, it is a server runtime resolved from the
 * `?app=` query parameter, the CLI-injected config or the build-time
 * `VITE_APP_ORIGIN`, falling back to `http://localhost:3000`.
 */
export function getStudioRuntime(): StudioRuntime {
  if (current) return current;
  const hasWindow = typeof window !== 'undefined';
  const appOrigin = resolveAppOrigin({
    search: hasWindow ? window.location.search : undefined,
    injected: hasWindow ? window.__LIVELOCALE_CONFIG__?.appOrigin : undefined,
    buildTime: (import.meta as any).env?.VITE_APP_ORIGIN,
  });
  return { kind: 'server', appOrigin, appUrl: appOrigin, problems: [] };
}

/** Origin of the application under edit, used for postMessage checks and the API. */
export function getAppOrigin(): string {
  return getStudioRuntime().appOrigin;
}

/** URL the preview iframe loads: the origin on server stacks, the folder above the Studio when static. */
export function getAppUrl(): string {
  return getStudioRuntime().appUrl;
}
