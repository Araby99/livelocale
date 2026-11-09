import { defineConfig } from 'tsup';

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
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  external: ['next', 'react', 'react-dom', 'fs', 'path', 'typescript', 'vite', 'astro'],
});
