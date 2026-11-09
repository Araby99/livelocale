import { describe, it, expect, vi } from 'vitest';
import { probeConnection, diagnoseAppConnection } from '../../src/studio/connection-probe.js';
import type { StudioRuntime } from '../../src/studio/runtime.js';

const APP = 'http://localhost:3000';
const STUDIO = 'http://localhost:3010';
const FRAME = `${APP}/?livelocale-origin=${encodeURIComponent(STUDIO)}`;
const STATUS_URL = `${STUDIO}/__livelocale/app-status?path=%2F`;
const API_URL = `${APP}/api/livelocale?action=info`;

const server: StudioRuntime = { kind: 'server', appOrigin: APP, appUrl: APP, problems: [] };

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

/** A fetch answering each URL from `routes`; any other URL fails like a refused connection. */
function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const route = routes[String(input)];
    if (!route) throw new TypeError('Failed to fetch');
    return route();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('probeConnection', () => {
  it("uses the studio server's probe of the app", async () => {
    const probe = {
      origin: APP,
      path: '/',
      page: { kind: 'status', status: 500 },
      api: { kind: 'status', status: 200 },
    };
    const fetch = fakeFetch({ [STATUS_URL]: () => json(probe) });
    expect(
      await probeConnection({ runtime: server, frameUrl: FRAME, studioOrigin: STUDIO, fetch })
    ).toEqual(probe);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the browser when there is no studio server endpoint', async () => {
    // A Vite dev server answers every path with the Studio's HTML.
    const opaque = { type: 'opaque', status: 0, headers: new Headers(), body: null };
    const fetch = fakeFetch({
      [STATUS_URL]: () =>
        new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
      [`${APP}/`]: () => opaque as unknown as Response,
      [API_URL]: () => new Response('missing', { status: 404 }),
    });
    expect(
      await diagnoseAppConnection({ runtime: server, frameUrl: FRAME, studioOrigin: STUDIO, fetch })
    ).toEqual({ kind: 'api-status', status: 404 });
  });

  it('ignores a server probe of another origin than the one this Studio edits (?app=)', async () => {
    const fetch = fakeFetch({
      [STATUS_URL]: () =>
        json({
          origin: 'http://localhost:4000',
          path: '/',
          page: { kind: 'unreachable' },
          api: null,
        }),
    });
    // Neither the page nor the API answers the browser: nothing is listening.
    expect(
      await diagnoseAppConnection({ runtime: server, frameUrl: FRAME, studioOrigin: STUDIO, fetch })
    ).toEqual({ kind: 'unreachable', origin: APP });
  });

  it('cannot read the status cross-origin without the server, and says so', async () => {
    const opaque = { type: 'opaque', status: 0, headers: new Headers(), body: null };
    const fetch = fakeFetch({ [`${APP}/`]: () => opaque as unknown as Response });
    expect(
      await diagnoseAppConnection({ runtime: server, frameUrl: FRAME, studioOrigin: STUDIO, fetch })
    ).toEqual({ kind: 'status-unknown', origin: APP });
  });

  it('reads the page status itself on a share link (same origin)', async () => {
    const site = 'https://site.example';
    const runtime = {
      kind: 'static',
      appOrigin: site,
      appUrl: `${site}/docs/`,
    } as unknown as StudioRuntime;
    const fetch = fakeFetch({
      [`${site}/docs/fr/`]: () => new Response('error', { status: 503 }),
    });
    expect(
      await diagnoseAppConnection({
        runtime,
        frameUrl: `${site}/docs/fr/?livelocale-origin=${encodeURIComponent(site)}`,
        studioOrigin: site,
        fetch,
      })
    ).toEqual({ kind: 'page-status', status: 503, path: '/docs/fr/' });
    // No studio server endpoint, and no API, on a static host.
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
