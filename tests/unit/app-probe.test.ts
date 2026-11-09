import { describe, it, expect, vi } from 'vitest';
import {
  appProbeUrl,
  diagnoseConnection,
  frameBlockOf,
  observeHttp,
  parseAppProbe,
  probeAppFromServer,
  probePath,
  type AppProbe,
  type HttpObservation,
} from '../../src/core/app-probe.js';

const APP = 'http://localhost:3000';
const STUDIO = 'http://localhost:3010';

const probe = (page: HttpObservation, api: HttpObservation | null = null): AppProbe => ({
  origin: APP,
  path: '/en',
  page,
  api,
});

/** A fetch that answers each URL from `routes`, recording what it was asked. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: ${url}`);
    return route();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('diagnoseConnection', () => {
  it('says nothing answers when the app is unreachable or slow', () => {
    expect(diagnoseConnection(probe({ kind: 'unreachable' }))).toEqual({
      kind: 'unreachable',
      origin: APP,
    });
    expect(diagnoseConnection(probe({ kind: 'timeout' }))).toEqual({
      kind: 'timeout',
      origin: APP,
    });
  });

  it('reports the status the page answered', () => {
    expect(diagnoseConnection(probe({ kind: 'status', status: 500 }))).toEqual({
      kind: 'page-status',
      status: 500,
      path: '/en',
    });
    // The page's own failure comes before the API's.
    expect(
      diagnoseConnection(probe({ kind: 'status', status: 404 }, { kind: 'status', status: 404 }))
    ).toMatchObject({ kind: 'page-status', status: 404 });
  });

  it('reports a login wall before anything else', () => {
    expect(
      diagnoseConnection(probe({ kind: 'status', status: 307, loginHost: 'vercel.com' }))
    ).toEqual({ kind: 'login-redirect', host: 'vercel.com' });
  });

  it('blames a missing or failing API once the page loaded', () => {
    for (const status of [404, 500]) {
      expect(
        diagnoseConnection(probe({ kind: 'status', status: 200 }, { kind: 'status', status }))
      ).toEqual({ kind: 'api-status', status });
    }
    // 401 means the API is there and wants a token: not why the client is missing.
    expect(
      diagnoseConnection(probe({ kind: 'status', status: 200 }, { kind: 'status', status: 401 }))
    ).toEqual({ kind: 'client-missing' });
  });

  it('names a frame-blocking header, else a client that did not start', () => {
    expect(
      diagnoseConnection(
        probe({ kind: 'status', status: 200, frameBlock: 'X-Frame-Options: DENY' })
      )
    ).toEqual({ kind: 'framing', header: 'X-Frame-Options: DENY' });
    expect(diagnoseConnection(probe({ kind: 'status', status: 200 }))).toEqual({
      kind: 'client-missing',
    });
  });

  it('says the status is unreadable for an opaque answer', () => {
    expect(diagnoseConnection(probe({ kind: 'opaque' }))).toEqual({
      kind: 'status-unknown',
      origin: APP,
    });
    expect(diagnoseConnection(probe({ kind: 'opaque' }, { kind: 'status', status: 404 }))).toEqual({
      kind: 'api-status',
      status: 404,
    });
  });
});

describe('frameBlockOf', () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it('blocks on X-Frame-Options DENY, and SAMEORIGIN across origins', () => {
    expect(frameBlockOf(headers({ 'x-frame-options': 'DENY' }), STUDIO, APP)).toBe(
      'X-Frame-Options: DENY'
    );
    expect(frameBlockOf(headers({ 'x-frame-options': 'SAMEORIGIN' }), STUDIO, APP)).toBe(
      'X-Frame-Options: SAMEORIGIN'
    );
    expect(frameBlockOf(headers({ 'x-frame-options': 'SAMEORIGIN' }), APP, APP)).toBeNull();
  });

  it('reads frame-ancestors, which wins over X-Frame-Options', () => {
    const csp = (value: string) =>
      headers({ 'content-security-policy': `default-src 'self'; ${value}` });
    expect(frameBlockOf(csp("frame-ancestors 'none'"), STUDIO, APP)).toBe(
      "Content-Security-Policy: frame-ancestors 'none'"
    );
    expect(frameBlockOf(csp("frame-ancestors 'self'"), APP, APP)).toBeNull();
    expect(frameBlockOf(csp("frame-ancestors 'self'"), STUDIO, APP)).not.toBeNull();
    expect(frameBlockOf(csp(`frame-ancestors ${STUDIO}`), STUDIO, APP)).toBeNull();
    expect(frameBlockOf(csp('frame-ancestors http://localhost:*'), STUDIO, APP)).toBeNull();
    expect(
      frameBlockOf(
        headers({
          'content-security-policy': `frame-ancestors ${STUDIO}`,
          'x-frame-options': 'DENY',
        }),
        STUDIO,
        APP
      )
    ).toBeNull();
  });

  it('lets a page without frame headers be framed', () => {
    expect(frameBlockOf(headers({}), STUDIO, APP)).toBeNull();
  });
});

describe('appProbeUrl', () => {
  it('keeps the probe on the app origin', () => {
    expect(appProbeUrl(APP, null)?.href).toBe(`${APP}/`);
    expect(appProbeUrl(APP, '/en/about?x=1')?.href).toBe(`${APP}/en/about?x=1`);
    for (const bad of [
      '//evil.example/x',
      'http://evil.example/',
      'en',
      '/\\evil.example',
      `/${'a'.repeat(2048)}`,
    ]) {
      expect(appProbeUrl(APP, bad)).toBeNull();
    }
  });
});

describe('probePath', () => {
  it('drops the Studio origin parameter', () => {
    expect(probePath(new URL(`${APP}/en?livelocale-origin=${encodeURIComponent(STUDIO)}`))).toBe(
      '/en'
    );
    expect(probePath(new URL(`${APP}/en?q=1&livelocale-origin=x`))).toBe('/en?q=1');
  });
});

describe('observeHttp', () => {
  it('follows same-origin redirects on a server and reads the last status', async () => {
    const fetch = fakeFetch({
      [`${APP}/`]: () => new Response(null, { status: 307, headers: { location: '/en' } }),
      [`${APP}/en`]: () => new Response('boom', { status: 500 }),
    });
    expect(await observeHttp(`${APP}/`, { fetch, mode: 'server' })).toEqual({
      kind: 'status',
      status: 500,
    });
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'GET', redirect: 'manual' });
  });

  it('reports a redirect to another host instead of following it', async () => {
    const fetch = fakeFetch({
      [`${APP}/`]: () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://vercel.com/login?next=x' },
        }),
    });
    expect(await observeHttp(`${APP}/`, { fetch, mode: 'server' })).toEqual({
      kind: 'status',
      status: 302,
      loginHost: 'vercel.com',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('adds the frame-blocking header when asked for the Studio origin', async () => {
    const fetch = fakeFetch({
      [`${APP}/`]: () => new Response('ok', { headers: { 'x-frame-options': 'DENY' } }),
    });
    expect(await observeHttp(`${APP}/`, { fetch, mode: 'server', studioOrigin: STUDIO })).toEqual({
      kind: 'status',
      status: 200,
      frameBlock: 'X-Frame-Options: DENY',
    });
  });

  it('tells an unreachable app from a slow one', async () => {
    const refused = fakeFetch({});
    expect(await observeHttp(`${APP}/`, { fetch: refused, mode: 'server' })).toEqual({
      kind: 'unreachable',
    });
    const slow = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    }) as unknown as typeof fetch;
    expect(await observeHttp(`${APP}/`, { fetch: slow, mode: 'server' })).toEqual({
      kind: 'timeout',
    });
  });

  it('gives up on a real request after the timeout', async () => {
    const hang = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        })
    ) as unknown as typeof fetch;
    expect(await observeHttp(`${APP}/`, { fetch: hang, mode: 'server', timeoutMs: 20 })).toEqual({
      kind: 'timeout',
    });
  });

  it('sees only that something answered in no-cors mode', async () => {
    const opaque = { type: 'opaque', status: 0, headers: new Headers(), body: null };
    const fetch = vi.fn(async () => opaque as unknown as Response) as unknown as typeof fetch;
    expect(await observeHttp(`${APP}/`, { fetch, mode: 'no-cors' })).toEqual({ kind: 'opaque' });
    expect((fetch as any).mock.calls[0][1]).toMatchObject({ mode: 'no-cors', credentials: 'omit' });
  });
});

describe('probeAppFromServer', () => {
  it('probes the page and the API info on the app origin only', async () => {
    const fetch = fakeFetch({
      [`${APP}/en`]: () => new Response('ok'),
      [`${APP}/api/livelocale?action=info`]: () => new Response('nope', { status: 404 }),
    });
    expect(await probeAppFromServer(APP, '/en', { fetch, studioOrigin: STUDIO })).toEqual({
      origin: APP,
      path: '/en',
      page: { kind: 'status', status: 200 },
      api: { kind: 'status', status: 404 },
    });
    expect(await probeAppFromServer(APP, '//evil.example/', { fetch })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('parseAppProbe', () => {
  it('reads a probe back and rejects anything else', () => {
    const value: AppProbe = {
      origin: APP,
      path: '/',
      page: { kind: 'status', status: 500 },
      api: null,
    };
    expect(parseAppProbe(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(parseAppProbe({ ...value, page: { kind: 'status', status: 99 } })).toBeNull();
    expect(parseAppProbe({ ...value, api: { kind: 'nope' } })).toBeNull();
    expect(parseAppProbe({ ...value, origin: 1 })).toBeNull();
    expect(parseAppProbe('<!doctype html>')).toBeNull();
  });
});
