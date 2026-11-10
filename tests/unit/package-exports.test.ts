// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * TypeScript picks the `types` next to the condition it resolves. With one top-level `types`
 * pointing at the ESM declarations, a CommonJS project on `module: node16` reads `require`
 * as an ES module and stops with TS1479. Each condition carries its own declarations.
 */
describe('package.json exports', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const entries = Object.entries(pkg.exports).filter(([entry]) => entry !== './package.json');

  it.each(entries)('%s gives import and require their own declarations', (_entry, target) => {
    const t = target as Record<string, Record<string, string>>;
    expect(Object.keys(t)).toEqual(['import', 'require']);
    expect(Object.keys(t['import']!)).toEqual(['types', 'default']);
    expect(Object.keys(t['require']!)).toEqual(['types', 'default']);

    const base = t['import']!['default']!.replace(/\.js$/, '');
    expect(t['import']!['types']).toBe(`${base}.d.ts`);
    expect(t['require']!['default']).toBe(`${base}.cjs`);
    expect(t['require']!['types']).toBe(`${base}.d.cts`);
  });

  it('keeps every entry point 1.2.0 shipped', () => {
    for (const entry of [
      '.',
      './client',
      './server',
      './react',
      './vite',
      './astro',
      './astro/middleware',
      './strip',
    ]) {
      expect(pkg.exports).toHaveProperty([entry]);
    }
  });
});
