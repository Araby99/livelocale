import {
  API_INFO_PATH,
  APP_STATUS_PATH,
  diagnoseConnection,
  observeHttp,
  parseAppProbe,
  probePath,
  type AppProbe,
  type ConnectionDiagnosis,
} from '../core/app-probe.js';
import type { StudioRuntime } from './runtime.js';

export interface ConnectionProbeInput {
  runtime: StudioRuntime;
  /** The URL the preview frame is loading (its `src`). */
  frameUrl: string;
  /** `location.origin` of the Studio page. */
  studioOrigin: string;
  fetch: typeof fetch;
}

/** The studio server's probe of the app, or null when this Studio has no such server. */
async function askStudioServer(
  input: ConnectionProbeInput,
  path: string
): Promise<AppProbe | null> {
  try {
    const url = `${input.studioOrigin}${APP_STATUS_PATH}?path=${encodeURIComponent(path)}`;
    const res = await input.fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    // A Vite dev server or a static host answers this path with the Studio's own HTML.
    if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) {
      return null;
    }
    const probe = parseAppProbe(await res.json());
    // `?app=` can point this Studio at another origin than the one the server probes.
    return probe && probe.origin === input.runtime.appOrigin ? probe : null;
  } catch {
    return null;
  }
}

/**
 * Finds out what the app answers at the page the frame is loading:
 *  - a share-link Studio shares the app's origin, so it reads the page's status itself;
 *  - under `livelocale studio`, the server asks the app (status, frame headers, the API);
 *  - otherwise the browser can only tell whether anything answered, and reads the API's
 *    status when its CORS headers let it.
 */
export async function probeConnection(input: ConnectionProbeInput): Promise<AppProbe> {
  const { runtime } = input;
  const frame = new URL(input.frameUrl, runtime.appUrl);
  const path = probePath(frame);
  const target = new URL(path, frame);

  if (runtime.kind === 'static') {
    const page = await observeHttp(target.href, {
      fetch: input.fetch,
      mode: 'browser',
      studioOrigin: input.studioOrigin,
    });
    return { origin: runtime.appOrigin, path, page, api: null };
  }

  const fromServer = await askStudioServer(input, path);
  if (fromServer) return fromServer;

  const [page, api] = await Promise.all([
    observeHttp(target.href, { fetch: input.fetch, mode: 'no-cors' }),
    observeHttp(`${runtime.appOrigin}${API_INFO_PATH}`, { fetch: input.fetch, mode: 'browser' }),
  ]);
  // A CORS refusal looks like a network error here, so only a readable status counts.
  return { origin: runtime.appOrigin, path, page, api: api.kind === 'status' ? api : null };
}

/** Probes the app and names the likeliest reason the frame never connected. */
export async function diagnoseAppConnection(
  input: ConnectionProbeInput
): Promise<ConnectionDiagnosis | null> {
  return diagnoseConnection(await probeConnection(input));
}
