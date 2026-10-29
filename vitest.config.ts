import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // Default to node; client tests will override to jsdom or use it where needed
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],
    // A real `vite build` loads Rolldown's native binding, which segfaults the whole run when loaded
    // in a worker thread; a child process is safe.
    poolMatchGlobs: [['**/tests/integration/vite-share-build.test.ts', 'forks']],
    // How long Vitest waits for workers (and the forked Vite build process) to close before it
    // force-stops them and exits, so a worker that hangs on shutdown cannot keep the run alive.
    teardownTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Enforced in CI via `npm run test:coverage`. Raise these as coverage grows;
      // never lower them to make a red build green.
      thresholds: {
        lines: 85,
        branches: 70,
        functions: 85,
        statements: 85,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Barrel files and side-effect entry points (exercised by the packaged-CLI
        // and E2E tests, which run in separate processes coverage cannot see).
        'src/**/index.ts',
        'src/codemod/index.ts',
        'src/react/**',
        // Studio React UI: covered by Playwright E2E, not unit tests.
        'src/studio/**/*.tsx',
        'src/studio/features/**/components/**',
        'src/studio/features/**/types/**',
        'src/studio/features/dashboard/hooks/useStudio.ts',
        'src/studio/utils/**',
        'src/studio/vite.config.ts',
      ],
    },
  },
});
