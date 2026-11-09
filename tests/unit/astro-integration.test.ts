// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import liveLocale, {
  CLIENT_SCRIPT,
  MIDDLEWARE_ID,
  SHARE_NEEDS_PREVIEW,
  type LiveLocaleAstroOptions,
} from '../../src/astro/index.js';
import { createLiveLocaleMiddleware } from '../../src/astro/middleware.js';
import { packOutput } from '../../src/server/pack.js';

vi.mock('../../src/server/pack.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/server/pack.js')>()),
  packOutput: vi.fn(async () => ({ warnings: ['a pack warning'], shareUrlPath: '/livelocale/' })),
}));

const root = path.join(os.tmpdir(), 'livelocale-astro-root');

type Command = 'dev' | 'build' | 'preview' | 'sync';

/** Runs astro:config:setup the way Astro does and records what the integration asked for. */
function setup(command: Command, options: Partial<LiveLocaleAstroOptions> = {}, base = '/') {
  const integration = liveLocale({ localesPath: './locales', ...options });
  const calls = {
    updateConfig: vi.fn(),
    injectScript: vi.fn(),
    addMiddleware: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn() },
  };
  integration.hooks['astro:config:setup']({
    config: { root: pathToFileURL(root + path.sep), base },
    command,
    ...calls,
  });
  const plugins = (): any[] => calls.updateConfig.mock.calls[0]?.[0]?.vite?.plugins ?? [];
  return { integration, calls, plugins };
}

describe('liveLocale() Astro integration', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LIVELOCALE', '');
    for (const v of ['VERCEL_ENV', 'NETLIFY', 'KUBERNETES_SERVICE_HOST', 'RENDER', 'DYNO']) {
      vi.stubEnv(v, '');
    }
    vi.mocked(packOutput).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is named livelocale and exported both ways', async () => {
    const mod = await import('../../src/astro/index.js');
    expect(mod.default).toBe(mod.liveLocale);
    expect(liveLocale({ localesPath: './locales' }).name).toBe('livelocale');
  });

  it('uses only hooks that Astro 5, the oldest supported version, has', () => {
    // Astro 5 is the documented floor: astro:config:setup (with updateConfig, injectScript
    // 'page' and addMiddleware) and astro:build:done (with dir and logger) all exist there.
    // A new hook here needs checking against Astro 5, or a major release to raise the floor.
    expect(Object.keys(liveLocale({ localesPath: './locales' }).hooks).sort()).toEqual([
      'astro:build:done',
      'astro:config:setup',
    ]);
  });

  it('in astro dev adds the Vite plugin, the head middleware and the client script', () => {
    const { calls, plugins } = setup('dev');
    expect(plugins().map((p) => p.name)).toEqual(['livelocale', 'livelocale:astro-middleware']);
    expect(calls.addMiddleware).toHaveBeenCalledWith({ entrypoint: MIDDLEWARE_ID, order: 'pre' });
    expect(calls.injectScript).toHaveBeenCalledWith('page', CLIENT_SCRIPT);
  });

  it('never lets the Vite plugin pack the share Studio itself', () => {
    const { plugins } = setup('dev', { share: true });
    const vitePlugin = plugins().find((p) => p.name === 'livelocale');
    expect(vitePlugin.apply({}, { command: 'build' })).toBe(false);
  });

  it('adds nothing to a normal astro build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { calls } = setup('build');
    expect(calls.updateConfig).not.toHaveBeenCalled();
    expect(calls.addMiddleware).not.toHaveBeenCalled();
    expect(calls.injectScript).not.toHaveBeenCalled();
  });

  it('in a preview build adds the head middleware and the client, but no dev API', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', 'preview');
    const { calls, plugins } = setup('build');
    expect(plugins().map((p) => p.name)).toEqual(['livelocale:astro-middleware']);
    expect(calls.addMiddleware).toHaveBeenCalledWith({ entrypoint: MIDDLEWARE_ID, order: 'pre' });
    expect(calls.injectScript).toHaveBeenCalledWith('page', CLIENT_SCRIPT);
  });

  it.each([
    ['share: true', { share: true }, ''],
    ['livelocale build --preview', {}, '1'],
  ])('in a share build (%s) loads only the client, with no inline flag', (_, opts, marker) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', 'preview');
    vi.stubEnv('LIVELOCALE_SHARE_BUILD', marker);
    const { calls, plugins } = setup('build', opts);
    expect(plugins()).toEqual([]);
    expect(calls.addMiddleware).not.toHaveBeenCalled();
    expect(calls.injectScript).toHaveBeenCalledWith('page', CLIENT_SCRIPT);
  });

  it.each<Command>(['preview', 'sync'])('adds nothing for astro %s', (command) => {
    const { calls } = setup(command);
    expect(calls.updateConfig).not.toHaveBeenCalled();
    expect(calls.injectScript).not.toHaveBeenCalled();
  });

  it('serves the middleware module with the locales path baked in', () => {
    const { plugins } = setup('dev', { localesPath: './src/locales' });
    const plugin = plugins().find((p) => p.name === 'livelocale:astro-middleware');
    const resolved = plugin.resolveId(MIDDLEWARE_ID);
    expect(resolved).toBe(`\0${MIDDLEWARE_ID}`);
    expect(plugin.resolveId('other')).toBeNull();
    expect(plugin.load('other')).toBeNull();
    expect(plugin.load(resolved)).toBe(
      "import { createLiveLocaleMiddleware } from 'livelocale/astro/middleware';\n" +
        'export const onRequest = createLiveLocaleMiddleware({"localesPath":"./src/locales"});'
    );
  });

  it('starts the client from livelocale/client and again after a view transition', () => {
    expect(CLIENT_SCRIPT).toContain("import { startLiveLocale } from 'livelocale/client';");
    expect(CLIENT_SCRIPT).toContain("addEventListener('astro:after-swap'");
  });

  describe('share', () => {
    const dir = pathToFileURL(path.join(root, 'dist') + path.sep);

    it('packs the share Studio into the output of a preview build', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LIVELOCALE', 'preview');
      const { integration, calls } = setup('build', { share: true, sourceLocale: 'en' }, '/docs');
      await integration.hooks['astro:build:done']({ dir, logger: calls.logger });
      expect(packOutput).toHaveBeenCalledWith({
        outDir: path.join(root, 'dist') + path.sep,
        projectDir: root + path.sep,
        localesPath: path.resolve('./locales'),
        sourceLocale: 'en',
        exposeRepo: false,
        base: '/docs',
      });
      expect(calls.logger.warn).toHaveBeenCalledWith('a pack warning');
    });

    it('warns and packs nothing outside a preview build', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const { integration, calls } = setup('build', { share: true });
      await integration.hooks['astro:build:done']({ dir, logger: calls.logger });
      expect(packOutput).not.toHaveBeenCalled();
      expect(calls.logger.warn).toHaveBeenCalledWith(SHARE_NEEDS_PREVIEW);
    });

    it('does nothing without share', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LIVELOCALE', 'preview');
      const { integration, calls } = setup('build');
      await integration.hooks['astro:build:done']({ dir, logger: calls.logger });
      expect(packOutput).not.toHaveBeenCalled();
      expect(calls.logger.warn).not.toHaveBeenCalled();
    });
  });
});

describe('Astro head middleware', () => {
  let localesPath: string;
  const page = (body = '<html><head><title>T</title></head><body>Hi</body></html>') =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html', 'content-length': String(body.length) },
    });

  beforeEach(() => {
    localesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-astro-mw-'));
    fs.mkdirSync(path.join(localesPath, 'en'));
    fs.writeFileSync(path.join(localesPath, 'en', 'home.json'), JSON.stringify({ title: 'Hi' }));
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LIVELOCALE', '');
    for (const v of ['VERCEL_ENV', 'NETLIFY', 'KUBERNETES_SERVICE_HOST', 'RENDER', 'DYNO']) {
      vi.stubEnv(v, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(localesPath, { recursive: true, force: true });
  });

  it('puts the flag and the fallback dictionary in head of an HTML page', async () => {
    const onRequest = createLiveLocaleMiddleware({ localesPath });
    const res = await onRequest({}, async () => page());
    const html = await res.text();
    expect(html).toContain('window.__LIVELOCALE_FLAG__ = "development";');
    expect(html).toContain('window.__livelocale_fallback__ = {"home":{"title":"Hi"}};');
    expect(html.indexOf('__livelocale_fallback__')).toBeLessThan(html.indexOf('</head>'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBeNull();
  });

  it('reads the files on every request, so a Studio save shows on the next load', async () => {
    const onRequest = createLiveLocaleMiddleware({ localesPath });
    await onRequest({}, async () => page());
    fs.writeFileSync(path.join(localesPath, 'en', 'home.json'), JSON.stringify({ title: 'Saved' }));
    const html = await (await onRequest({}, async () => page())).text();
    expect(html).toContain('{"home":{"title":"Saved"}}');
  });

  it('leaves responses that are not HTML alone', async () => {
    const onRequest = createLiveLocaleMiddleware({ localesPath });
    const json = new Response('{}', { headers: { 'content-type': 'application/json' } });
    expect(await onRequest({}, async () => json)).toBe(json);
  });

  it('leaves pages alone when LiveLocale is off', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const onRequest = createLiveLocaleMiddleware({ localesPath });
    const original = page();
    expect(await onRequest({}, async () => original)).toBe(original);
  });
});
