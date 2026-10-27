import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { liveLocaleVite, type VitePluginConfig } from '../../src/server/vite-plugin.js';
import { packOutput, RELATIVE_BASE_WARNING } from '../../src/server/pack.js';

vi.mock('../../src/server/pack.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/server/pack.js')>()),
  packOutput: vi.fn(async () => ({ warnings: [] })),
}));

const root = path.join(os.tmpdir(), 'livelocale-vite-share-root');
const localesPath = './locales';

interface BuildSetup {
  base: string;
  build?: { ssr?: boolean | string; lib?: unknown };
  options?: Partial<VitePluginConfig>;
}

function built({ base, build = {}, options = {} }: BuildSetup) {
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const plugin = liveLocaleVite({ localesPath, share: true, ...options });
  plugin.configResolved({
    command: 'build',
    root,
    base,
    logger,
    build: { outDir: 'dist', ssr: false, lib: false, ...build },
  });
  return Object.assign(plugin, { logger });
}

describe('liveLocaleVite share build', () => {
  beforeEach(() => {
    vi.mocked(packOutput).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies in serve always and in build only with share', () => {
    expect(liveLocaleVite({ localesPath }).apply({}, { command: 'serve' })).toBe(true);
    expect(liveLocaleVite({ localesPath }).apply({}, { command: 'build' })).toBe(false);
    expect(liveLocaleVite({ localesPath, share: true }).apply({}, { command: 'build' })).toBe(true);
    expect(
      liveLocaleVite({ localesPath, share: true }).apply({}, { command: 'build', isSsrBuild: true })
    ).toBe(false);
  });

  it('injects flag.js first in head on build, without dev fallback data', () => {
    vi.stubEnv('LIVELOCALE', 'preview');
    const p = built({ base: '/repo/' });
    expect(
      p.transformIndexHtml('<html><head><title>x</title></head></html>', { path: '/index.html' })
    ).toBe(
      '<html><head><script src="/repo/livelocale/flag.js"></script><title>x</title></head></html>'
    );
  });

  it('uses a relative src for a relative base', () => {
    const p = built({ base: './' });
    expect(p.transformIndexHtml('<html><head></head></html>', { path: '/nested/page.html' })).toBe(
      '<html><head><script src="../livelocale/flag.js"></script></head></html>'
    );
  });

  it('rejects a full-URL base unless shareBase is set', () => {
    expect(() => built({ base: 'https://cdn.acme.com/' })).toThrow(
      expect.objectContaining({ code: 'BAD_BASE' })
    );
    const p = built({ base: 'https://cdn.acme.com/', options: { shareBase: '/app/' } });
    expect(p.transformIndexHtml('<head></head>', { path: '/index.html' })).toBe(
      '<head><script src="/app/livelocale/flag.js"></script></head>'
    );
  });

  it('packs once per build after writing', async () => {
    const p = built({ base: '/repo/' });
    p.buildStart();
    await p.writeBundle();
    await p.writeBundle();
    expect(packOutput).toHaveBeenCalledTimes(1);
    expect(packOutput).toHaveBeenCalledWith({
      outDir: path.resolve(root, 'dist'),
      projectDir: root,
      localesPath: path.resolve(localesPath),
      sourceLocale: undefined,
      exposeRepo: false,
      base: '/repo/',
      injectHtml: false,
    });
    p.buildStart();
    await p.writeBundle();
    expect(packOutput).toHaveBeenCalledTimes(2);
  });

  it('forwards pack warnings to the Vite logger', async () => {
    vi.mocked(packOutput).mockResolvedValueOnce({
      warnings: [RELATIVE_BASE_WARNING],
    } as Awaited<ReturnType<typeof packOutput>>);
    const p = built({ base: './' });
    p.buildStart();
    await p.writeBundle();
    expect(p.logger.warn).toHaveBeenCalledWith(RELATIVE_BASE_WARNING);
  });

  it('does not pack SSR or library builds', async () => {
    const ssr = built({ base: '/repo/', build: { ssr: true } });
    ssr.buildStart();
    await ssr.writeBundle();
    const lib = built({ base: '/repo/', build: { lib: { entry: 'src/index.ts' } } });
    lib.buildStart();
    await lib.writeBundle();
    expect(packOutput).not.toHaveBeenCalled();
  });
});
