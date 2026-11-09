// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import * as strip from '../../src/strip/index.js';
import { encodeKey } from '../../src/client/watermark.js';

/**
 * `livelocale/strip` is the side-effect-free way to clean watermarked text in a bundle that
 * ships to the browser: it must never pull in the client (which starts on import) or the
 * environment checks (which carry the hosting-platform detection).
 */
describe('livelocale/strip', () => {
  it('exports exactly the documented helpers', () => {
    expect(Object.keys(strip).sort()).toEqual(['removeWatermarks', 'sanitizeZeroWidth', 'unwrap']);
  });

  it('cleans watermarked strings, arrays and objects', () => {
    const marked = encodeKey('Yes', 'common.yes');
    expect(strip.unwrap(marked)).toBe('Yes');
    expect(strip.unwrap({ a: [marked] })).toEqual({ a: ['Yes'] });
    expect(strip.removeWatermarks(`Say ${marked}`)).toBe('Say Yes');
    expect(strip.sanitizeZeroWidth(marked)).toBe('Yes');
  });

  it('imports nothing but the watermark module, which imports nothing', () => {
    const entry = readFileSync('src/strip/index.ts', 'utf8');
    // Statements only: the doc comment's example mentions `from 'livelocale/strip'`.
    const imports = [...entry.matchAll(/^(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(
      (m) => m[1]
    );
    expect(imports).toEqual(['../client/watermark.js']);
    expect(entry).not.toMatch(/^\s*['"]use client['"]/m);
    expect(readFileSync('src/client/watermark.ts', 'utf8')).not.toMatch(/^\s*import\b/m);
  });

  it('is built, exported and marked side-effect free in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.exports['./strip']).toEqual({
      types: './dist/strip/index.d.ts',
      import: './dist/strip/index.js',
      require: './dist/strip/index.cjs',
    });
    expect(readFileSync('tsup.config.ts', 'utf8')).toContain("'strip/index': 'src/strip/index.ts'");
    // A sideEffects list names the files that DO have side effects; strip is not among them,
    // and every other entry still is, so their behavior on import does not change.
    const sideEffects: string[] = pkg.sideEffects;
    expect(Array.isArray(sideEffects)).toBe(true);
    expect(sideEffects.some((glob) => glob.includes('strip'))).toBe(false);
    for (const dir of ['client', 'server', 'react', 'vite', 'astro', 'codemod']) {
      expect(sideEffects).toContain(`./dist/${dir}/**`);
    }
  });

  it.skipIf(!existsSync('dist/strip/index.js'))('builds without the runtime', () => {
    for (const file of ['dist/strip/index.js', 'dist/strip/index.cjs']) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(
        /getLiveLocaleMode|isLiveLocaleEnabled|VERCEL|NETLIFY|startLiveLocale/
      );
      expect(text).not.toMatch(/^\s*['"]use client['"]/m);
    }
  });
});
