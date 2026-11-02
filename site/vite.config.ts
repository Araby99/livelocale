import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { siteConfig } from './src/lib/site-config';
import { injectCheckExcerpt } from './scripts/check-excerpt.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const CHECK_OUTPUT = fileURLToPath(new URL('src/ci/check-output.json', import.meta.url));

/** Sets the CI sample's real check --hardcoded output into the developer story at build time. */
function checkExcerpt(): Plugin {
  return {
    name: 'livelocale-check-excerpt',
    transformIndexHtml(html) {
      if (!existsSync(CHECK_OUTPUT)) {
        throw new Error(
          'site/src/ci/check-output.json is missing: run node site/scripts/hardcoded-report.mjs first'
        );
      }
      return injectCheckExcerpt(html, JSON.parse(readFileSync(CHECK_OUTPUT, 'utf8')));
    },
  };
}

export default defineConfig({
  root,
  // The pathname of SITE_URL: /livelocale/ on the Pages project URL, / on a custom domain.
  base: siteConfig(process.env).base,
  plugins: [checkExcerpt()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { main: fileURLToPath(new URL('index.html', import.meta.url)) },
    },
  },
});
