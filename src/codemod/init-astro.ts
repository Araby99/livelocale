import { detectBuildTarget } from '../server/build-target.js';

export const ASTRO_GUIDE_URL = 'https://livelocale.js.org/docs/start/astro.html';

/** True when `livelocale init` runs in an Astro project, which needs no route file. */
export function isAstroProject(projectDir: string): boolean {
  return detectBuildTarget(projectDir).kind === 'astro';
}

/**
 * What `livelocale init` prints on an Astro project instead of writing a Next.js route: the
 * `livelocale/astro` integration serves the API, so there is nothing to write.
 */
export function astroInitSteps(): string {
  return `🚀 Astro project detected. Nothing to write: the livelocale/astro integration serves the API.

1. Add the integration to astro.config.mjs:

   import { defineConfig } from 'astro/config';
   import liveLocale from 'livelocale/astro';

   export default defineConfig({
     integrations: [liveLocale({ localesPath: './locales' })],
   });

2. Load translations in each page's frontmatter:

   import { createTranslations } from 'livelocale/server';
   const t = createTranslations('en', { supportedLocales: ['en', 'ar'] });

3. Run \`astro dev\`, then in a second terminal:

   npx livelocale studio --app http://localhost:4321

📖 Guide: ${ASTRO_GUIDE_URL}
`;
}
