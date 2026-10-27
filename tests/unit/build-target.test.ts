// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import {
  detectBuildTarget,
  findExportBlockingRoute,
  outputCandidates,
} from '../../src/server/build-target.js';

const tempDirs: string[] = [];

function write(rel: string, text: string, dir = fs.mkdtempSync(join(tmpdir(), 'bt-'))): string {
  if (!tempDirs.includes(dir)) tempDirs.push(dir);
  const file = join(dir, rel);
  fs.mkdirSync(dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return dir;
}

function pkg(content: object, dir?: string): string {
  return write('package.json', JSON.stringify(content), dir);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('detectBuildTarget', () => {
  it('reads Next export and basePath', () => {
    const dir = write(
      'next.config.mjs',
      "export default { output: 'export', basePath: '/docs' };\n"
    );
    expect(detectBuildTarget(dir)).toEqual({ kind: 'next', staticExport: true, base: '/docs' });
  });

  it('detects Next from dependencies alone', () => {
    const dir = pkg({ dependencies: { next: '^15.0.0', react: '^18' } });
    expect(detectBuildTarget(dir)).toEqual({ kind: 'next', staticExport: false, base: null });
  });

  it('ignores commented-out output lines', () => {
    const dir = write(
      'next.config.js',
      [
        'module.exports = {',
        "  // output: 'export',",
        "  /* output: 'export' */",
        '  reactStrictMode: true,',
        '};',
        '',
      ].join('\n')
    );
    expect(detectBuildTarget(dir)).toEqual({ kind: 'next', staticExport: false, base: null });
  });

  it('prefers Next when vite is also installed', () => {
    const dir = pkg({
      dependencies: { next: '^15.0.0' },
      devDependencies: { vite: '^5', vitest: '^2' },
    });
    expect(detectBuildTarget(dir).kind).toBe('next');
  });

  it('reads CRA homepage', () => {
    const deps = { dependencies: { 'react-scripts': '5.0.1' } };
    expect(detectBuildTarget(pkg({ ...deps, homepage: 'https://acme.github.io/shop' }))).toEqual({
      kind: 'cra',
      base: '/shop',
    });
    expect(detectBuildTarget(pkg({ ...deps, homepage: '.' }))).toEqual({ kind: 'cra', base: './' });
    expect(detectBuildTarget(pkg(deps))).toEqual({ kind: 'cra', base: null });
  });

  it('detects Vite from deps or config file', () => {
    expect(detectBuildTarget(pkg({ devDependencies: { vite: '^5' } }))).toEqual({
      kind: 'vite',
      base: null,
    });
    expect(detectBuildTarget(write('vite.config.ts', 'export default {};\n'))).toEqual({
      kind: 'vite',
      base: null,
    });
  });

  it('reads the Vite base from the config file', () => {
    const config = (body: string) =>
      detectBuildTarget(write('vite.config.ts', `export default defineConfig({\n${body}\n});\n`));
    expect(config("plugins: [react()], base: '/repo/'")).toEqual({ kind: 'vite', base: '/repo/' });
    expect(config('base: "./"')).toEqual({ kind: 'vite', base: './' });
    expect(config("// base: '/old/'")).toEqual({ kind: 'vite', base: null });
    expect(config("base: 'https://cdn.example/app/'")).toEqual({ kind: 'vite', base: null });
    expect(config("shareBase: '/x/', database: '/y/'")).toEqual({ kind: 'vite', base: null });
  });

  it('falls back to other', () => {
    expect(detectBuildTarget(pkg({ dependencies: { react: '^18' } }))).toEqual({
      kind: 'other',
      base: null,
    });
  });
});

describe('findExportBlockingRoute', () => {
  it.each([
    ['app/api/livelocale/route.ts', 'export const POST = handler;'],
    ['src/app/api/livelocale/route.js', 'export async function POST(req) {}'],
    ['app/api/livelocale/route.ts', 'export { handler as GET, handler as POST };'],
  ])('finds the blocking route %s', (rel, src) =>
    expect(findExportBlockingRoute(write(rel, src))).toBe(rel)
  );

  it('ignores a GET-only route and a missing route', () => {
    expect(
      findExportBlockingRoute(write('app/api/livelocale/route.ts', 'export const GET = handler;'))
    ).toBeNull();
    expect(findExportBlockingRoute(pkg({ dependencies: { next: '^15' } }))).toBeNull();
  });
});

describe('outputCandidates', () => {
  it('orders output candidates', () => {
    expect(outputCandidates({ kind: 'cra', base: null })).toEqual(['build', 'dist', 'out']);
    expect(outputCandidates({ kind: 'vite', base: null })).toEqual(['dist', 'build', 'out']);
  });
});
