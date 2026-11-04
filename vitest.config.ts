import { defineConfig } from 'vitest/config';

const FORKED_TEST = '**/tests/integration/vite-share-build.test.ts';

export default defineConfig({
  plugins: [
    {
      // Vitest 4 applies `--exclude` from the CLI to the root config only, not to inline projects,
      // so `npm run test:package` would still run the site tests. Hand it to every project.
      name: 'livelocale:cli-exclude-in-projects',
      configureVitest({ vitest, project }) {
        for (const pattern of vitest.config.cliExclude ?? []) {
          if (!project.config.exclude.includes(pattern)) project.config.exclude.push(pattern);
        }
      },
    },
  ],
  test: {
    environment: 'node', // Default to node; client tests will override to jsdom or use it where needed
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '**/tests/site/**'],
    // Every test runs in worker threads, except the real `vite build`: it loads Rolldown's native
    // binding, which segfaults the whole run when loaded in a worker thread; a child process is
    // safe. Vitest 4 has no per-file pool option, so the split is two projects. Both extend this
    // config, so `exclude` applies to each; `--exclude` on the CLI does through the plugin below.
    projects: [
      {
        extends: true,
        test: {
          name: 'threads',
          pool: 'threads',
          exclude: [FORKED_TEST],
        },
      },
      {
        extends: true,
        test: {
          name: 'forks',
          pool: 'forks',
          include: [FORKED_TEST],
        },
      },
    ],
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
