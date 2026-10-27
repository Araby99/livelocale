// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  runDoctor,
  formatFindings,
  hasFailures,
  normalizeAppUrl,
  shareLinkFor,
  type Finding,
} from '../../src/codemod/doctor.js';
import { FLAG_SCRIPT } from '../../src/core/flag-script.js';

function write(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function healthyAppRouterProject(root: string) {
  write(root, 'package.json', JSON.stringify({ name: 'demo', dependencies: { next: '15.0.0' } }));
  write(
    root,
    'app/layout.tsx',
    `import { LiveLocaleProvider } from 'livelocale/react'; export default () => <LiveLocaleProvider />;`
  );
  write(root, 'app/api/livelocale/route.ts', `export const GET = () => {};`);
  write(root, 'locales/en.json', JSON.stringify({ home: { title: 'Hi' } }));
  write(root, 'locales/ar.json', JSON.stringify({ home: { title: 'مرحبا' } }));
}

const byTitle = (findings: Finding[], fragment: string) =>
  findings.find((f) => f.title.toLowerCase().includes(fragment.toLowerCase()));

describe('runDoctor — static checks', () => {
  let project: string;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-doctor-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('reports a healthy App Router project with no failures', async () => {
    healthyAppRouterProject(project);
    const findings = await runDoctor({ projectDir: project });
    expect(hasFailures(findings)).toBe(false);
    expect(byTitle(findings, 'route handler')?.level).toBe('ok');
    expect(byTitle(findings, 'provider')?.level).toBe('ok');
    expect(byTitle(findings, 'locale files')?.level).toBe('ok');
  });

  it('fails when the mutation route handler is missing and points at init', async () => {
    healthyAppRouterProject(project);
    fs.rmSync(path.join(project, 'app', 'api'), { recursive: true });
    const findings = await runDoctor({ projectDir: project });
    const route = byTitle(findings, 'route handler');
    expect(route?.level).toBe('fail');
    expect(route?.detail).toContain('livelocale init');
  });

  it('does not accept a route file left at the old i18n-lens path', async () => {
    healthyAppRouterProject(project);
    fs.rmSync(path.join(project, 'app/api/livelocale'), { recursive: true, force: true });
    write(project, 'app/api/i18n-lens/mutate/route.ts', `export const GET = () => {};`);
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'route handler')?.level).toBe('fail');
  });

  it('accepts a Pages Router route file', async () => {
    healthyAppRouterProject(project);
    fs.rmSync(path.join(project, 'app'), { recursive: true });
    write(project, 'pages/_app.tsx', `<LiveLocaleProvider />`);
    write(project, 'pages/api/livelocale.js', `export default () => {};`);
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'route handler')?.level).toBe('ok');
    expect(byTitle(findings, 'provider')?.level).toBe('ok');
  });

  it('warns when the provider is not mounted in a layout', async () => {
    healthyAppRouterProject(project);
    write(project, 'app/layout.tsx', `export default ({ children }) => children;`);
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'provider')?.level).toBe('warn');
  });

  it('warns when middleware exists without excluding /api/livelocale', async () => {
    healthyAppRouterProject(project);
    write(project, 'middleware.ts', `export const config = { matcher: ['/((?!_next).*)'] };`);
    const findings = await runDoctor({ projectDir: project });
    const mw = byTitle(findings, 'middleware');
    expect(mw?.level).toBe('warn');
    expect(mw?.detail).toContain('api/livelocale');
  });

  it('passes middleware that already excludes the route', async () => {
    healthyAppRouterProject(project);
    write(
      project,
      'src/middleware.ts',
      `export const config = { matcher: ['/((?!api/livelocale).*)'] };`
    );
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'middleware')?.level).toBe('ok');
  });

  it('warns when next.config sets frame-ancestors or X-Frame-Options', async () => {
    healthyAppRouterProject(project);
    write(
      project,
      'next.config.mjs',
      `export default { headers: async () => [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] };`
    );
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'frame')?.level).toBe('warn');
  });

  it('accepts a next.config whose frame-ancestors names the Studio origin', async () => {
    healthyAppRouterProject(project);
    write(
      project,
      'next.config.mjs',
      `export default { headers: async () => [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self' http://localhost:3010" }] };`
    );
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'frame')?.level).toBe('ok');
  });

  it('fails on invalid locale JSON and names the file', async () => {
    healthyAppRouterProject(project);
    write(project, 'locales/es.json', '{ not json');
    const findings = await runDoctor({ projectDir: project });
    const locales = byTitle(findings, 'locale files');
    expect(locales?.level).toBe('fail');
    expect(locales?.detail).toContain('es.json');
  });

  it('fails when the locales directory is missing', async () => {
    healthyAppRouterProject(project);
    fs.rmSync(path.join(project, 'locales'), { recursive: true });
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'locale files')?.level).toBe('fail');
  });

  it('respects a custom locales path', async () => {
    healthyAppRouterProject(project);
    fs.renameSync(path.join(project, 'locales'), path.join(project, 'i18n'));
    const findings = await runDoctor({ projectDir: project, localesPath: 'i18n' });
    expect(byTitle(findings, 'locale files')?.level).toBe('ok');
  });
});

describe('runDoctor — live checks', () => {
  let project: string;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-doctor-live-'));
    healthyAppRouterProject(project);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

  it('reports the API as reachable when it lists locales', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/livelocale')
        ? jsonResponse(200, ['en', 'ar'])
        : new Response('<html></html>', { status: 200 })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    const api = byTitle(findings, 'mutation api');
    expect(api?.level).toBe('ok');
    expect(api?.detail).toContain('2 locale');
  });

  it('surfaces the server-side disabled reason on a 403', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/livelocale')
        ? jsonResponse(403, {
            error: 'Forbidden: LiveLocale is disabled — LIVELOCALE kill switch is set.',
          })
        : new Response('', { status: 200 })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    const api = byTitle(findings, 'mutation api');
    expect(api?.level).toBe('fail');
    expect(api?.detail).toContain('LIVELOCALE');
  });

  it('sends the token to a preview deployment and reports access problems', async () => {
    const seen: (string | undefined)[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
      const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
      seen.push(auth);
      if (url.includes('/api/livelocale')) {
        if (auth !== 'Bearer s3cret') return jsonResponse(401, { error: 'Unauthorized' });
        if (url.endsWith('?action=info')) {
          return jsonResponse(200, {
            mode: 'preview',
            authRequired: true,
            git: true,
            problems: ['The token cannot write to acme/site.'],
          });
        }
        return jsonResponse(200, ['en']);
      }
      return new Response('', { status: 200 });
    });
    const run = (token?: string) =>
      runDoctor({
        projectDir: project,
        appOrigin: 'https://preview.example.com',
        token,
        fetchImpl: fetchImpl as any,
      });

    const withoutToken = await run();
    expect(byTitle(withoutToken, 'mutation api')?.detail).toMatch(/--token/);

    const findings = await run('s3cret');
    expect(seen).toContain('Bearer s3cret');
    expect(byTitle(findings, 'mutation api')?.level).toBe('ok');
    expect(byTitle(findings, 'server mode')?.detail).toBe(
      'preview, token required, git actions available'
    );
    expect(byTitle(findings, 'repository access')).toMatchObject({
      level: 'fail',
      detail: 'The token cannot write to acme/site.',
    });
  });

  it('recognises a hosting login wall instead of blaming middleware', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('Protected by Vercel Authentication', {
          status: 302,
          headers: {
            location: 'https://vercel.com/sso-api?url=https%3A%2F%2Fdemo.vercel.app',
            'x-frame-options': 'DENY',
          },
        })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'https://demo.vercel.app',
      fetchImpl: fetchImpl as any,
    });
    expect(byTitle(findings, 'mutation api')?.detail).toMatch(/Vercel Deployment Protection/);
    expect(byTitle(findings, 'mutation api')?.detail).not.toMatch(/middleware/);
    expect(byTitle(findings, 'embed')).toMatchObject({ level: 'fail' });
    expect(byTitle(findings, 'embed')?.detail).not.toMatch(/X-Frame-Options/);
  });

  it('fails clearly when the app is not running', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    const api = byTitle(findings, 'mutation api');
    expect(api?.level).toBe('fail');
    expect(api?.detail).toMatch(/not reachable|running/i);
  });

  it('warns when the app page sends frame-blocking headers', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/livelocale')
        ? jsonResponse(200, ['en'])
        : new Response('', { status: 200, headers: { 'x-frame-options': 'DENY' } })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    expect(byTitle(findings, 'embed')?.level).toBe('warn');
  });

  it.each([
    ["frame-ancestors 'self' http://localhost:3010", 'ok'],
    ['frame-ancestors *', 'ok'],
    ["frame-ancestors 'self' http://localhost:30100", 'warn'],
    ["frame-ancestors 'none'", 'warn'],
  ])('judges the live CSP "%s" as %s', async (csp, level) => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/livelocale')
        ? jsonResponse(200, ['en'])
        : new Response('', { status: 200, headers: { 'content-security-policy': csp } })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    expect(byTitle(findings, 'embed')?.level).toBe(level);
  });
});

describe('runDoctor — share probes', () => {
  let project: string;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-doctor-share-'));
    healthyAppRouterProject(project);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  interface Page {
    status?: number;
    body?: string | null;
    headers?: Record<string, string>;
  }
  type SiteSpec = Record<string, Page>;

  /** A fetch mock keyed by full URL; any other URL answers 404. */
  const site = (spec: SiteSpec) =>
    vi.fn(async (url: string) => {
      const page = Object.prototype.hasOwnProperty.call(spec, url) ? spec[url] : undefined;
      if (!page) return new Response('Not found', { status: 404 });
      return new Response(page.body ?? null, {
        status: page.status ?? 200,
        headers: page.headers ?? {},
      });
    }) as unknown as typeof fetch;

  const A = 'https://acme.test';
  const appHtml = (head: string) =>
    `<!doctype html><html lang="en"><head>${head}<meta charset="utf-8"><title>Acme</title></head><body><div id="root"></div></body></html>`;
  const STUDIO_HTML =
    '<!doctype html><html><head><meta name="robots" content="noindex, nofollow"><title>LiveLocale · Studio</title></head><body><div id="root"></div></body></html>';
  const MANIFEST = {
    format: 1,
    defaultBranch: 'main',
    branch: 'main',
    base: '0123456789abcdef0123456789abcdef01234567',
    localesPath: 'locales',
    layout: 'flat',
    sourceLocale: 'en',
    locales: ['ar', 'en'],
    basePath: '/',
    codeKeys: ['home.title'],
  };
  const html = (body: string): Page => ({
    body,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  const json = (body: unknown): Page => ({
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const script = (body: string): Page => ({
    body,
    headers: { 'content-type': 'text/javascript; charset=utf-8' },
  });

  const healthy: SiteSpec = {
    [`${A}/`]: html(appHtml('<script src="/livelocale/flag.js"></script>')),
    [`${A}/livelocale/index.html`]: html(STUDIO_HTML),
    [`${A}/livelocale/manifest.json`]: json(MANIFEST),
    [`${A}/livelocale/flag.js`]: script(FLAG_SCRIPT),
  };

  const withHeader = (pathname: string, name: string, value: string): SiteSpec => {
    const url = `${A}${pathname}`;
    const page = healthy[url]!;
    return { ...healthy, [url]: { ...page, headers: { ...page.headers, [name]: value } } };
  };
  const spaFallback: SiteSpec = { ...healthy, [`${A}/livelocale/index.html`]: healthy[`${A}/`]! };
  const flagNotFirst: SiteSpec = {
    ...healthy,
    [`${A}/`]: html(
      '<!doctype html><html><head><meta charset="utf-8"><script src="/livelocale/flag.js"></script></head><body></body></html>'
    ),
  };
  const flagNotOurs: SiteSpec = {
    ...healthy,
    [`${A}/livelocale/flag.js`]: healthy[`${A}/`]!,
  };
  const workboxShell: SiteSpec = {
    ...healthy,
    [`${A}/sw.js`]: script(
      'workbox.routing.registerRoute(new workbox.routing.NavigationRoute(workbox.precaching.createHandlerBoundToURL("/index.html")));'
    ),
  };
  const vercelWall: SiteSpec = Object.fromEntries(
    Object.keys(healthy).map((url) => [
      url,
      {
        status: 302,
        headers: { location: 'https://vercel.com/sso-api?url=https%3A%2F%2Facme.test' },
      },
    ])
  );
  const noManifest: SiteSpec = { ...healthy };
  delete noManifest[`${A}/livelocale/manifest.json`];

  const G = 'https://user.github.io';
  const pagesSite: SiteSpec = {
    [`${G}/repo/`]: html(appHtml('<script src="/repo/livelocale/flag.js"></script>')),
    [`${G}/repo/livelocale/index.html`]: html(STUDIO_HTML),
    [`${G}/repo/livelocale/manifest.json`]: json({ ...MANIFEST, basePath: '/repo/' }),
    [`${G}/repo/livelocale/flag.js`]: script(FLAG_SCRIPT),
  };

  const doc = (spec: SiteSpec) =>
    runDoctor({ projectDir: project, appOrigin: A, share: true, fetchImpl: site(spec) });

  const subProject = (name: string, files: Record<string, string>) => {
    const root = path.join(project, name);
    write(root, 'locales/en.json', JSON.stringify({ home: { title: 'Hi' } }));
    for (const [rel, content] of Object.entries(files)) write(root, rel, content);
    return root;
  };

  it('detects a share build from its manifest and prints the share link', async () => {
    const f = await runDoctor({ projectDir: project, appOrigin: A, fetchImpl: site(healthy) });
    expect(hasFailures(f)).toBe(false);
    expect(byTitle(f, 'Mutation API')).toBeUndefined();
    expect(byTitle(f, 'Studio can embed the app')).toBeUndefined();
    expect(byTitle(f, 'Share Studio page')?.level).toBe('ok');
    expect(byTitle(f, 'Share manifest')).toMatchObject({
      level: 'ok',
      detail: '2 locale(s), source en, built from main @ 0123456',
    });
    expect(byTitle(f, 'Share flag script')?.level).toBe('ok');
    expect(byTitle(f, 'Share frame headers')?.level).toBe('ok');
    expect(byTitle(f, 'Share CSP')?.level).toBe('ok');
    expect(byTitle(f, 'Service worker')?.level).toBe('ok');
    expect(byTitle(f, 'Share link')?.detail).toBe('https://acme.test/livelocale/index.html');
  });

  it('names an unknown branch and commit in the manifest detail', async () => {
    const spec = {
      ...healthy,
      [`${A}/livelocale/manifest.json`]: json({ ...MANIFEST, branch: null, base: null }),
    };
    expect(byTitle(await doc(spec), 'Share manifest')?.detail).toBe(
      '2 locale(s), source en, built from an unknown branch @ an unknown commit'
    );
  });

  it('keeps the server probes when the host has no share manifest', async () => {
    const f = await runDoctor({ projectDir: project, appOrigin: A, fetchImpl: site(noManifest) });
    expect(byTitle(f, 'Mutation API')).toBeDefined();
    expect(byTitle(f, 'Share link')).toBeUndefined();
  });

  it('judges the frame headers of both pages', async () => {
    const frame = async (spec: SiteSpec) => byTitle(await doc(spec), 'Share frame headers')?.level;
    expect(await frame(withHeader('/livelocale/index.html', 'x-frame-options', 'DENY'))).toBe(
      'fail'
    );
    expect(await frame(withHeader('/livelocale/index.html', 'x-frame-options', 'SAMEORIGIN'))).toBe(
      'ok'
    );
    expect(await frame(withHeader('/', 'content-security-policy', "frame-ancestors 'none'"))).toBe(
      'fail'
    );
    expect(
      await frame(withHeader('/', 'content-security-policy', 'frame-ancestors https://other.test'))
    ).toBe('fail');
    expect(await frame(withHeader('/', 'content-security-policy', "frame-ancestors 'self'"))).toBe(
      'ok'
    );
  });

  it('warns when script-src, or default-src without it, leaves out self', async () => {
    const csp = async (value: string) =>
      byTitle(await doc(withHeader('/', 'content-security-policy', value)), 'Share CSP')?.level;
    expect(await csp('script-src https://cdn.x')).toBe('warn');
    expect(await csp('default-src https://cdn.x')).toBe('warn');
    expect(await csp("default-src https://cdn.x; script-src 'self'")).toBe('ok');
  });

  it('fails a Studio page that is the app shell or a flag script that is not ours', async () => {
    const spa = byTitle(await doc(spaFallback), 'Share Studio page');
    expect(spa?.level).toBe('fail');
    expect(spa?.detail).toContain("app's page");
    expect(byTitle(await doc(flagNotFirst), 'Share flag script')?.detail).toMatch(/first/);
    expect(
      byTitle(await doc(flagNotOurs /* 200 HTML at flag.js */), 'Share flag script')?.level
    ).toBe('fail');
  });

  it('builds the share link under a GitHub Pages project base', async () => {
    const gp = await runDoctor({
      projectDir: project,
      appOrigin: 'https://user.github.io',
      appBase: 'https://user.github.io/repo/',
      fetchImpl: site(pagesSite),
    });
    expect(hasFailures(gp)).toBe(false);
    expect(byTitle(gp, 'Share link')?.detail).toBe(
      'https://user.github.io/repo/livelocale/index.html'
    );
  });

  it('prints the denylist line for a service worker that serves the app shell', async () => {
    const sw = byTitle(await doc(workboxShell), 'Service worker');
    expect(sw?.level).toBe('warn');
    expect(sw?.detail).toContain('navigateFallbackDenylist: [/^\\/livelocale\\//]');
    const denied = {
      ...workboxShell,
      [`${A}/sw.js`]: script(
        'createHandlerBoundToURL("/index.html"); denylist: [/^\\/livelocale\\//]'
      ),
    };
    expect(byTitle(await doc(denied), 'Service worker')?.level).toBe('ok');
  });

  it('reads the worker the app HTML registers', async () => {
    const spec = {
      ...healthy,
      [`${A}/`]: html(
        appHtml(
          '<script src="/livelocale/flag.js"></script><script>navigator.serviceWorker.register("/app-sw.js")</script>'
        )
      ),
      [`${A}/app-sw.js`]: script('navigateFallback: "/index.html"'),
    };
    expect(byTitle(await doc(spec), 'Service worker')?.level).toBe('warn');
  });

  it('reads /sw.js at the origin root as well as under a project-site base', async () => {
    const shell = script('navigateFallback: "/index.html"');
    const run = (spec: SiteSpec) =>
      runDoctor({
        projectDir: project,
        appOrigin: G,
        appBase: `${G}/repo/`,
        fetchImpl: site(spec),
      });
    expect(
      byTitle(await run({ ...pagesSite, [`${G}/sw.js`]: shell }), 'Service worker')?.level
    ).toBe('warn');
    expect(
      byTitle(await run({ ...pagesSite, [`${G}/repo/service-worker.js`]: shell }), 'Service worker')
        ?.level
    ).toBe('warn');
    expect(byTitle(await run(pagesSite), 'Service worker')?.detail).toBe('none found');
  });

  it('warns about a PWA plugin config that does not exclude livelocale/', async () => {
    const vitePwaProject = subProject('pwa', {
      'vite.config.ts': `import { VitePWA } from 'vite-plugin-pwa';\nexport default { plugins: [VitePWA({ registerType: 'autoUpdate' })] };`,
    });
    expect(
      byTitle(await runDoctor({ projectDir: vitePwaProject }), 'Service worker config')?.level
    ).toBe('warn');
    const deniedProject = subProject('pwa-denied', {
      'vite.config.ts': `import { VitePWA } from 'vite-plugin-pwa';\nimport { liveLocaleVite } from 'livelocale/vite';\nexport default { plugins: [liveLocaleVite({ share: true }), VitePWA({ workbox: { navigateFallbackDenylist: [/^\\/livelocale\\//] } })] };`,
    });
    expect(
      byTitle(await runDoctor({ projectDir: deniedProject }), 'Service worker config')
    ).toBeUndefined();
  });

  it('reports a login wall on the share probes', async () => {
    expect(byTitle(await doc(vercelWall), 'Share manifest')?.detail).toMatch(/Vercel/);
    const csp = byTitle(await doc(vercelWall), 'Share CSP');
    expect(csp?.level).toBe('fail');
    expect(csp?.detail).toMatch(/Vercel/);
    const studioWalled: SiteSpec = {
      ...healthy,
      [`${A}/livelocale/index.html`]: vercelWall[`${A}/livelocale/index.html`]!,
    };
    expect(byTitle(await doc(studioWalled), 'Share CSP')?.level).toBe('fail');
    const unreachable = vi.fn(async (url: string) => {
      if (url === `${A}/livelocale/index.html`) throw new Error('ECONNRESET');
      return site(healthy)(url);
    }) as unknown as typeof fetch;
    const down = byTitle(
      await runDoctor({ projectDir: project, appOrigin: A, share: true, fetchImpl: unreachable }),
      'Share CSP'
    );
    expect(down?.level).toBe('fail');
    expect(down?.detail).toContain('not reachable');
  });

  it('fails a forced share run when the manifest is missing', async () => {
    const manifest = byTitle(
      await runDoctor({
        projectDir: project,
        appOrigin: A,
        share: true,
        fetchImpl: site(noManifest),
      }),
      'Share manifest'
    );
    expect(manifest?.level).toBe('fail');
    expect(manifest?.detail).toContain('did the build run with share: true or livelocale pack?');
  });

  it('does not ask a static share build for a route handler', async () => {
    const viteShareProject = subProject('vite-share', {
      'vite.config.ts': `import { liveLocaleVite } from 'livelocale/vite';\nexport default { plugins: [liveLocaleVite({ share: true })] };`,
    });
    expect(
      byTitle(await runDoctor({ projectDir: viteShareProject }), 'route handler')?.detail
    ).toContain('not needed');
    const packProject = subProject('pack', {
      'package.json': JSON.stringify({ scripts: { build: 'vite build && livelocale pack dist' } }),
    });
    expect(byTitle(await runDoctor({ projectDir: packProject }), 'route handler')).toMatchObject({
      level: 'ok',
      detail: 'not needed for the share link (static build)',
    });
  });

  it('normalizes an app URL to an origin and a base', () => {
    expect(normalizeAppUrl('https://user.github.io/repo/index.html')).toEqual({
      origin: 'https://user.github.io',
      base: 'https://user.github.io/repo/',
    });
    expect(normalizeAppUrl('https://acme.test')).toEqual({
      origin: 'https://acme.test',
      base: 'https://acme.test/',
    });
    expect(normalizeAppUrl('https://user.github.io/repo?x=1#top')).toEqual({
      origin: 'https://user.github.io',
      base: 'https://user.github.io/repo/',
    });
    expect(() => normalizeAppUrl('ftp://acme.test')).toThrow();
    expect(shareLinkFor('https://acme.test/')).toBe('https://acme.test/livelocale/index.html');
  });
});

describe('formatFindings', () => {
  it('renders one line per finding with a status glyph and keeps details indented', () => {
    const text = formatFindings([
      { level: 'ok', title: 'Route handler found' },
      { level: 'warn', title: 'Middleware', detail: 'exclude /api/livelocale' },
      { level: 'fail', title: 'Locales', detail: 'missing' },
    ]);
    expect(text).toContain('✅ Route handler found');
    expect(text).toContain('⚠️  Middleware');
    expect(text).toContain('❌ Locales');
    expect(text).toContain('   exclude /api/livelocale');
  });
});
