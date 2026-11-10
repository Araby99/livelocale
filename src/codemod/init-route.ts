import * as fs from 'fs';
import * as path from 'path';
import { detectBuildTarget } from '../server/build-target.js';
import { findLocalesFolder } from '../core/locale-folder.js';
import { astroInitSteps } from './init-astro.js';

export const VITE_GUIDE_URL = 'https://livelocale.js.org/docs/start/vite.html';

/** What plain `livelocale init` does in a folder. Only a Next.js app gets a file written. */
export type InitRoutePlan =
  | { kind: 'astro'; text: string }
  | { kind: 'vite'; text: string }
  | { kind: 'unknown'; text: string }
  | {
      kind: 'next';
      routerType: string;
      targetPath: string;
      content: string;
      /** Whether the route file is already there, and whether it matches `content`. */
      existing: 'none' | 'same' | 'different';
      isTypeScript: boolean;
      hasNextIntl: boolean;
      hasReactI18next: boolean;
    };

function dependencies(projectDir: string): Record<string, unknown> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

/**
 * What `livelocale init` prints on a Vite project instead of writing a Next.js route: the
 * `livelocale/vite` plugin serves the API from the Vite dev server, so there is nothing to write.
 */
export function viteInitSteps(localesPath: string): string {
  return `🚀 Vite project detected. Nothing to write: the livelocale/vite plugin serves the API.

1. Add the plugin to vite.config.ts:

   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import { liveLocaleVite } from 'livelocale/vite';

   export default defineConfig({
     plugins: [react(), liveLocaleVite({ localesPath: './${localesPath}' })],
   });

2. Render the provider once, at the root of your app (src/main.tsx):

   import { LiveLocaleProvider } from 'livelocale/react';

   <LiveLocaleProvider />

   Without React, start the client from your entry file instead:

   import { startLiveLocale } from 'livelocale/client';
   startLiveLocale();

3. Run \`vite\`, then in a second terminal:

   npx livelocale studio --app http://localhost:5173

📖 Guide: ${VITE_GUIDE_URL}
`;
}

function routeContent(appRouter: boolean, localesPath: string): string {
  const handler = `const handler = createLiveLocaleHandler({
  localesPath: path.resolve('./${localesPath}'), // Adjust relative to project root
});`;
  return appRouter
    ? `import { createLiveLocaleHandler } from 'livelocale/server';
import * as path from 'path';

${handler}

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
`
    : `import { createLiveLocaleHandler } from 'livelocale/server';
import * as path from 'path';

// Pages Router API route: the handler accepts the (req, res) signature.
${handler}

export default handler;
`;
}

/**
 * Decides what plain `init` does in `projectDir` without writing anything. A Next.js app gets an
 * API route; Astro and Vite serve the API from their own integration and get steps to follow;
 * any other folder gets nothing, since a Next.js route there would be dead code (and break a
 * `tsc -b` build: the route imports Node's `path`).
 */
export function planInitRoute(projectDir: string): InitRoutePlan {
  const kind = detectBuildTarget(projectDir).kind;
  const localesPath = findLocalesFolder(projectDir) ?? 'locales';
  if (kind === 'astro') return { kind: 'astro', text: astroInitSteps() };
  if (kind === 'vite') return { kind: 'vite', text: viteInitSteps(localesPath) };
  if (kind !== 'next') {
    return {
      kind: 'unknown',
      text: `No Next.js, Vite or Astro app found in ${projectDir}. init looked for next, vite or astro in package.json and for a next.config, vite.config or astro.config file. Run it in your app's folder, or pass the folder: npx livelocale init <folder>.`,
    };
  }

  const isTypeScript = fs.existsSync(path.join(projectDir, 'tsconfig.json'));
  const ext = isTypeScript ? 'ts' : 'js';
  const routers: Array<[string, string, string]> = [
    ['app', 'Next.js App Router (root)', `api/livelocale/route.${ext}`],
    ['src/app', 'Next.js App Router (src/)', `api/livelocale/route.${ext}`],
    ['pages', 'Next.js Pages Router (root)', `api/livelocale.${ext}`],
    ['src/pages', 'Next.js Pages Router (src/)', `api/livelocale.${ext}`],
  ];
  const found = routers.find(([dir]) => fs.existsSync(path.join(projectDir, dir)));
  const [dir, routerType, file] = found ?? [
    'app',
    'Default App Router (app/ not found)',
    `api/livelocale/route.${ext}`,
  ];
  const targetPath = path.join(projectDir, dir, file);
  const content = routeContent(routerType.includes('App Router'), localesPath);

  let existing: 'none' | 'same' | 'different' = 'none';
  // Line endings do not count: git with core.autocrlf checks the file out with CRLF on Windows.
  const lf = (text: string) => text.replace(/\r\n/g, '\n');
  try {
    existing = lf(fs.readFileSync(targetPath, 'utf8')) === lf(content) ? 'same' : 'different';
  } catch {
    // No route file yet.
  }

  const deps = dependencies(projectDir);
  return {
    kind: 'next',
    routerType,
    targetPath,
    content,
    existing,
    isTypeScript,
    hasNextIntl: Boolean(deps['next-intl']),
    hasReactI18next: Boolean(deps['react-i18next']),
  };
}
