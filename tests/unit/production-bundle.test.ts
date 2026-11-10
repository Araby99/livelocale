// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { lazyClientChunk } from '../../tsup.config.js';

// esbuild as tsup itself resolves it: the build these tests mirror.
const esbuild: typeof import('esbuild') = createRequire(
  createRequire(import.meta.url).resolve('tsup')
)('esbuild');

const SRC = path.resolve('src');
// Strings the in-page client sends to the Studio; minifying keeps them.
const CLIENT_MARKERS = ['ELEMENT_SELECTED', 'VISIBLE_KEYS_CHANGED'];

/**
 * The documented setup (LiveLocaleProvider in the root layout, the wrappers in components)
 * must not put the in-page client into the code every production page downloads. The
 * client may only sit behind a dynamic import, which the app's bundler turns into a lazy
 * chunk that loads when LiveLocale is on.
 */
describe('production bundle', () => {
  it('builds the react entry with the client left as a dynamic import of dist/client', async () => {
    for (const format of ['esm', 'cjs'] as const) {
      const result = await esbuild.build({
        entryPoints: [path.join(SRC, 'react/index.tsx')],
        bundle: true,
        format,
        write: false,
        outdir: 'out',
        platform: 'neutral',
        external: ['react'],
        plugins: [lazyClientChunk],
        logLevel: 'silent',
      });
      const text = result.outputFiles[0]!.text;
      expect(text, format).toContain('import("../client/index.js")');
      for (const marker of CLIENT_MARKERS) expect(text, format).not.toContain(marker);
    }
  });

  it('keeps the client out of what a production page loads for the provider and the wrappers', async () => {
    const result = await esbuild.build({
      stdin: {
        contents: [
          `import { LiveLocaleProvider } from ${JSON.stringify(path.join(SRC, 'react/index.tsx'))};`,
          `import { wrapNextIntl } from ${JSON.stringify(path.join(SRC, 'wrap/index.ts'))};`,
          'export const t = wrapNextIntl(globalThis.t, "home");',
          'export { LiveLocaleProvider };',
        ].join('\n'),
        resolveDir: SRC,
        loader: 'ts',
      },
      bundle: true,
      splitting: true,
      format: 'esm',
      minify: true,
      write: false,
      outdir: path.resolve('out'),
      metafile: true,
      define: { 'process.env.NODE_ENV': '"production"' },
      external: ['react'],
      logLevel: 'silent',
    });

    const outputs = result.metafile!.outputs;
    const textOf = new Map(
      result.outputFiles.map((f) => [
        path.relative(process.cwd(), f.path).replace(/\\/g, '/'),
        f.text,
      ])
    );
    const entry = Object.keys(outputs).find((file) => outputs[file]!.entryPoint !== undefined)!;

    // The entry chunk and every chunk it imports statically: what each page downloads.
    const eager = new Set<string>();
    const visit = (file: string) => {
      if (eager.has(file)) return;
      eager.add(file);
      for (const dep of outputs[file]!.imports) {
        if (dep.kind === 'import-statement' && !dep.external) visit(dep.path);
      }
    };
    visit(entry);

    const eagerText = [...eager].map((file) => textOf.get(file) ?? '').join('');
    for (const marker of CLIENT_MARKERS) expect(eagerText).not.toContain(marker);
    // The wrapper and the mode check stay, because a share build turns LiveLocale on at run
    // time. Measured at about 9.5 KB; 34 KB with the client inlined.
    expect(eagerText.length).toBeLessThan(12_000);

    const lazy = [...textOf.entries()].filter(([file]) => !eager.has(file));
    expect(lazy.some(([, text]) => CLIENT_MARKERS.every((m) => text.includes(m)))).toBe(true);
  });
});
