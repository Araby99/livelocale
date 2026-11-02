import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { siteConfig } from './src/lib/site-config';
import { injectSliderFallback } from './scripts/slider-fallback.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const SLIDER_REPORT = fileURLToPath(new URL('src/slider/hardcoded.json', import.meta.url));

/** Writes the slider's no-JavaScript outlines and check output from the island's own report. */
function sliderFallback(): Plugin {
  return {
    name: 'livelocale-slider-fallback',
    transformIndexHtml(html) {
      if (!existsSync(SLIDER_REPORT)) {
        throw new Error(
          'site/src/slider/hardcoded.json is missing: run node site/scripts/hardcoded-report.mjs first'
        );
      }
      return injectSliderFallback(html, JSON.parse(readFileSync(SLIDER_REPORT, 'utf8')));
    },
  };
}

export default defineConfig({
  root,
  // The pathname of SITE_URL: /livelocale/ on the Pages project URL, / on a custom domain.
  base: siteConfig(process.env).base,
  plugins: [react(), sliderFallback()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { main: fileURLToPath(new URL('index.html', import.meta.url)) },
    },
  },
});
