import { defineConfig, type Options } from 'tsup';

type Plugin = NonNullable<Options['esbuildPlugins']>[number];

/**
 * Keeps `LiveLocaleProvider`'s `import('../client/index.js')` as a real dynamic import in
 * dist/react, which then points at dist/client, the same file `livelocale/client` resolves to.
 * With `splitting: false` esbuild would otherwise inline the whole in-page client into the
 * react entry, and every production page would download it without ever running it. Kept
 * external, the app's bundler puts the client in a lazy chunk that loads only when LiveLocale
 * is on. Only that dynamic import is affected: static imports are bundled as before.
 */
export const lazyClientChunk: Plugin = {
  name: 'livelocale:lazy-client-chunk',
  setup(build) {
    build.onResolve({ filter: /^\.\.\/client\/index\.js$/ }, (args) =>
      args.kind === 'dynamic-import' && /[\\/]src[\\/]react[\\/]/.test(args.importer)
        ? { path: args.path, external: true }
        : undefined
    );
  },
};

export default defineConfig({
  entry: {
    'client/index': 'src/client/index.ts',
    'server/index': 'src/server/index.ts',
    'vite/index': 'src/server/vite-plugin.ts',
    'react/index': 'src/react/index.tsx',
    'codemod/index': 'src/codemod/index.ts',
    'astro/index': 'src/astro/index.ts',
    'astro/middleware': 'src/astro/middleware.ts',
    // The watermark helpers alone: no client, no environment checks, no side effects.
    'strip/index': 'src/strip/index.ts',
    // The translation wrappers alone: no directive, no Node imports, no client. Safe in
    // Server, Client and shared components.
    'wrap/index': 'src/wrap/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  external: ['next', 'react', 'react-dom', 'fs', 'path', 'typescript', 'vite', 'astro'],
  esbuildPlugins: [lazyClientChunk],
});
