/**
 * What the app answers when the Studio cannot connect to it, and what that means.
 *
 * The browser hides a cross-origin frame's HTTP status, so the `livelocale studio` server asks
 * the app itself (`APP_STATUS_PATH`) and a share-link Studio, framed on the app's own origin,
 * reads the page directly. Both turn their observations into an `AppProbe`, and
 * `diagnoseConnection` names the likeliest fault. Browser-safe: used by the Studio and the CLI.
 */

/** The `livelocale studio` endpoint that probes the configured app origin. */
export const APP_STATUS_PATH = '/__livelocale/app-status';
/** The app's LiveLocale API, asked for its info (no auth needed, no side effects). */
export const API_INFO_PATH = '/api/livelocale?action=info';
/** How long one probe request may take before the app counts as not answering. */
export const APP_PROBE_TIMEOUT_MS = 5000;
/** Same-origin redirects followed before the last answer counts. */
const MAX_REDIRECTS = 5;

/** One HTTP request's outcome, as far as the prober could see it. */
export type HttpObservation =
  /** The app answered `status`; `loginHost` when it redirected to another host. */
  | { kind: 'status'; status: number; loginHost?: string; frameBlock?: string }
  /** Something answered, but the browser hides the status (a no-cors request). */
  | { kind: 'opaque' }
  /** Nothing answered: connection refused, unknown host, or no answer within the timeout. */
  | { kind: 'unreachable' | 'timeout' };

export interface AppProbe {
  /** The app origin that was probed. */
  origin: string;
  /** The page that was probed, as a path with its query (`/en/about`). */
  path: string;
  page: HttpObservation;
  /** The LiveLocale API's info answer; null when it was not or could not be asked. */
  api: HttpObservation | null;
}

/** The likeliest reason the client in the frame never said hello. */
export type ConnectionDiagnosis =
  | { kind: 'unreachable'; origin: string }
  | { kind: 'timeout'; origin: string }
  | { kind: 'page-status'; status: number; path: string }
  | { kind: 'api-status'; status: number }
  | { kind: 'login-redirect'; host: string }
  | { kind: 'framing'; header: string }
  | { kind: 'client-missing' }
  | { kind: 'status-unknown'; origin: string };

/** Picks the diagnosis an `AppProbe` points at, or null when it shows nothing. */
export function diagnoseConnection(probe: AppProbe): ConnectionDiagnosis | null {
  const { page, api, origin } = probe;
  if (page.kind === 'unreachable' || page.kind === 'timeout') return { kind: page.kind, origin };
  if (page.kind === 'status') {
    if (page.loginHost) return { kind: 'login-redirect', host: page.loginHost };
    if (page.status >= 400) return { kind: 'page-status', status: page.status, path: probe.path };
  }
  // The page answered: a missing or failing API means the route or the integration is missing.
  if (api?.kind === 'status' && (api.status === 404 || api.status >= 500)) {
    return { kind: 'api-status', status: api.status };
  }
  if (page.kind === 'status') {
    if (page.frameBlock) return { kind: 'framing', header: page.frameBlock };
    return { kind: 'client-missing' };
  }
  return { kind: 'status-unknown', origin };
}

/** The path and query of `url` without the Studio's `livelocale-origin` parameter. */
export function probePath(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete('livelocale-origin');
  const search = params.toString();
  return url.pathname + (search ? `?${search}` : '');
}

/** True when frame-ancestors `source` lets `studioOrigin` frame a page of `appOrigin`. */
function ancestorAllows(source: string, studioOrigin: string, appOrigin: string): boolean {
  const value = source.replace(/^'|'$/g, '').toLowerCase();
  if (value === '*') return true;
  if (value === 'self') return studioOrigin === appOrigin;
  const studio = new URL(studioOrigin);
  if (value === studio.protocol) return true;
  if (value.endsWith(':*')) return studioOrigin.startsWith(value.slice(0, -1));
  return value.replace(/\/+$/, '') === studioOrigin;
}

/**
 * The header that stops `studioOrigin` framing a page of `appOrigin`, as `Name: value`, or
 * null when the page can be framed.
 */
export function frameBlockOf(
  headers: Headers,
  studioOrigin: string,
  appOrigin: string
): string | null {
  const csp = headers.get('content-security-policy') || '';
  const directive = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => /^frame-ancestors\b/i.test(part));
  if (directive) {
    const sources = directive.split(/\s+/).slice(1);
    // frame-ancestors wins over X-Frame-Options in every current browser.
    if (sources.some((source) => ancestorAllows(source, studioOrigin, appOrigin))) return null;
    return `Content-Security-Policy: ${directive}`;
  }
  const xfo = (headers.get('x-frame-options') || '').trim();
  if (/^deny$/i.test(xfo)) return `X-Frame-Options: ${xfo}`;
  if (/^sameorigin$/i.test(xfo) && studioOrigin !== appOrigin) return `X-Frame-Options: ${xfo}`;
  return null;
}

/** `unreachable` or `timeout` for a failed fetch. */
function failureKind(err: unknown): 'unreachable' | 'timeout' {
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable';
}

/** Lets go of a response body nobody reads. */
function discard(res: Response): void {
  res.body?.cancel().catch(() => {});
}

export interface ObserveOptions {
  fetch: typeof fetch;
  /** The Studio origin, for the frame-header check. Omit to skip it. */
  studioOrigin?: string;
  /** `no-cors` sees only whether something answered; `server` follows redirects by hand. */
  mode: 'server' | 'browser' | 'no-cors';
  timeoutMs?: number;
}

/**
 * GETs `url` and reports what answered. Never reads the body, never sends credentials, and in
 * `server` mode follows redirects only on `url`'s own origin: a redirect elsewhere is reported
 * as `loginHost` (hosting login walls) instead of being followed.
 */
export async function observeHttp(url: string, options: ObserveOptions): Promise<HttpObservation> {
  const timeoutMs = options.timeoutMs ?? APP_PROBE_TIMEOUT_MS;
  const signal =
    typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
  const origin = new URL(url).origin;
  let target = url;
  try {
    for (let hop = 0; ; hop++) {
      // Node's fetch implements neither `cache` nor `mode`, so a server request sets neither.
      const init: RequestInit =
        options.mode === 'server'
          ? { method: 'GET', redirect: 'manual', signal }
          : {
              method: 'GET',
              cache: 'no-store',
              credentials: options.mode === 'browser' ? 'same-origin' : 'omit',
              mode: options.mode === 'no-cors' ? 'no-cors' : 'cors',
              signal,
            };
      const res = await options.fetch(target, init);
      discard(res);
      if (res.type === 'opaque') return { kind: 'opaque' };
      const location = res.headers.get('location');
      if (options.mode === 'server' && res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, target);
        if (next.origin !== origin) {
          return { kind: 'status', status: res.status, loginHost: next.host };
        }
        if (hop < MAX_REDIRECTS) {
          target = next.href;
          continue;
        }
      }
      const frameBlock = options.studioOrigin
        ? frameBlockOf(res.headers, options.studioOrigin, origin)
        : null;
      return frameBlock
        ? { kind: 'status', status: res.status, frameBlock }
        : { kind: 'status', status: res.status };
    }
  } catch (err) {
    return { kind: failureKind(err) };
  }
}

const isStatus = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599;

/** An `HttpObservation` read back from JSON, or null when it is not one. */
function toObservation(value: unknown): HttpObservation | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v['kind'] === 'opaque' || v['kind'] === 'unreachable' || v['kind'] === 'timeout') {
    return { kind: v['kind'] };
  }
  if (v['kind'] !== 'status' || !isStatus(v['status'])) return null;
  const observation: HttpObservation = { kind: 'status', status: v['status'] };
  if (typeof v['loginHost'] === 'string') observation.loginHost = v['loginHost'];
  if (typeof v['frameBlock'] === 'string') observation.frameBlock = v['frameBlock'];
  return observation;
}

/** An `AppProbe` read back from the studio server's JSON, or null when it is not one. */
export function parseAppProbe(value: unknown): AppProbe | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const page = toObservation(v['page']);
  const api = v['api'] === null ? null : toObservation(v['api']);
  if (typeof v['origin'] !== 'string' || typeof v['path'] !== 'string' || !page) return null;
  if (api === null && v['api'] !== null) return null;
  return { origin: v['origin'], path: v['path'], page, api };
}

/**
 * The app URL a probe may request for `rawPath`: a path on `appOrigin` only. Returns null for
 * anything else (`//host`, a full URL, a backslash), so the studio server is never an open proxy.
 */
export function appProbeUrl(appOrigin: string, rawPath: string | null): URL | null {
  const value = rawPath ?? '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (value.length > 2048) return null;
  try {
    const url = new URL(value, appOrigin);
    return url.origin === appOrigin ? url : null;
  } catch {
    return null;
  }
}

/**
 * Probes the page at `path` and the LiveLocale API from a server (the `livelocale studio`
 * process), where the app's status and headers are readable.
 */
export async function probeAppFromServer(
  appOrigin: string,
  path: string | null,
  options: { fetch: typeof fetch; studioOrigin?: string; timeoutMs?: number }
): Promise<AppProbe | null> {
  const url = appProbeUrl(appOrigin, path);
  if (!url) return null;
  const common = { fetch: options.fetch, mode: 'server' as const, timeoutMs: options.timeoutMs };
  const [page, api] = await Promise.all([
    observeHttp(url.href, { ...common, studioOrigin: options.studioOrigin }),
    observeHttp(`${appOrigin}${API_INFO_PATH}`, common),
  ]);
  return { origin: appOrigin, path: probePath(url), page, api };
}
