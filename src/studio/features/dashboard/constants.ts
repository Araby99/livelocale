import { resolveAppOrigin } from '../../config.js';

declare global {
  interface Window {
    __LIVELOCALE_CONFIG__?: { appOrigin?: string };
  }
}

/**
 * Origin of the application under edit. Resolved once at Studio start-up from
 * the `?app=` query parameter, the CLI-injected config, or the build-time
 * `VITE_APP_ORIGIN`, falling back to `http://localhost:3000`.
 */
export const APP_ORIGIN = resolveAppOrigin({
  search: typeof window !== 'undefined' ? window.location.search : undefined,
  injected: typeof window !== 'undefined' ? window.__LIVELOCALE_CONFIG__?.appOrigin : undefined,
  buildTime: (import.meta as any).env?.VITE_APP_ORIGIN,
});
