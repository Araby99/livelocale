// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as wrap from '../../src/wrap/index.js';
import { decodeKey } from '../../src/client/watermark.js';

/**
 * `livelocale/wrap` is the one import path for `wrapTranslationEngine` and `wrapNextIntl`
 * that works in a Server Component, a Client Component and a component with no directive
 * that renders on both sides. `livelocale/client` is a 'use client' module (a Server
 * Component cannot call its functions) and `livelocale/server` imports `fs` (a client
 * bundle cannot build it). So this entry must have neither, and must not start the
 * in-page client.
 */
describe('livelocale/wrap', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LIVELOCALE', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('exports exactly the wrappers', () => {
    expect(Object.keys(wrap).sort()).toEqual(['wrapNextIntl', 'wrapTranslationEngine']);
  });

  it('watermarks in development and hands back the engine itself when off', () => {
    const t = (key: string) => `text of ${key}`;
    expect(decodeKey(wrap.wrapNextIntl(t, 'home')('title'))?.key).toBe('home.title');
    vi.stubEnv('NODE_ENV', 'production');
    expect(wrap.wrapTranslationEngine(t, { keyPrefix: 'home' })).toBe(t);
  });

  it('has no directive and imports neither the client, nor Node modules, nor the server', () => {
    const files = [
      'src/wrap/index.ts',
      'src/client/wrap.ts',
      'src/client/watermark.ts',
      'src/core/env.ts',
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/^\s*['"]use (client|server)['"]/m);
      const imports = [...text.matchAll(/^(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(
        (m) => m[1]!
      );
      for (const specifier of imports) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(
          /^\.\.?\/(?:client\/)?(?:wrap|watermark|env|core\/env)\.js$/
        );
      }
    }
  });

  it('is built, exported and marked side-effect free in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.exports['./wrap']).toEqual({
      import: { types: './dist/wrap/index.d.ts', default: './dist/wrap/index.js' },
      require: { types: './dist/wrap/index.d.cts', default: './dist/wrap/index.cjs' },
    });
    expect(readFileSync('tsup.config.ts', 'utf8')).toContain("'wrap/index': 'src/wrap/index.ts'");
    const sideEffects: string[] = pkg.sideEffects;
    expect(sideEffects.some((glob) => glob.includes('wrap'))).toBe(false);
  });

  it.skipIf(!existsSync('dist/wrap/index.js'))('builds without the in-page client', () => {
    for (const file of ['dist/wrap/index.js', 'dist/wrap/index.cjs']) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(
        /DOMInterceptor|IframeBridge|startLiveLocale|from ['"](?:node:)?fs['"]/
      );
      expect(text).not.toMatch(/^\s*['"]use client['"]/m);
    }
  });
});
