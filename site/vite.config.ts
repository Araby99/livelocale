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

/** The h1's face: Martian Mono 700, Latin. Preloaded so the headline does not wait on the CSS. */
const HEADLINE_FONT = /^assets\/martian-mono-latin-700-normal-[\w-]+\.woff2$/;

/** Preloads the headline face from <head>, before the stylesheet that would otherwise find it. */
export function preloadHeadlineFont(): Plugin {
  let base = '/';
  return {
    name: 'livelocale-preload-headline-font',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        if (!bundle) return html; // the dev server has no bundle and serves the font itself
        const font = Object.keys(bundle).find((name) => HEADLINE_FONT.test(name));
        if (!font) throw new Error('the headline font (martian-mono-latin-700-normal) is missing');
        const link = `<link rel="preload" as="font" type="font/woff2" crossorigin href="${base}${font}">`;
        const at = html.indexOf('<link rel="stylesheet"');
        if (at === -1) throw new Error('index.html has no stylesheet to preload the font before');
        return `${html.slice(0, at)}${link}\n    ${html.slice(at)}`;
      },
    },
  };
}

/**
 * Inlines the landing page's stylesheet (about 5 KB gzipped) into index.html, so the first paint
 * waits on no second request. Runs after preloadHeadlineFont, which places the font preload before
 * the stylesheet. The CSS's font urls carry the base, so they resolve the same from the page.
 */
export function inlineCss(): Plugin {
  return {
    name: 'livelocale-inline-css',
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        if (!bundle) return html;
        return html.replace(
          /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
          (_tag, href: string) => {
            const asset = Object.values(bundle).find(
              (file) => file.type === 'asset' && href.endsWith(`/${file.fileName}`)
            );
            if (!asset || asset.type !== 'asset')
              throw new Error(`no bundled stylesheet for ${href}`);
            const css = String(asset.source);
            if (css.includes('</style'))
              throw new Error(`${href} cannot be inlined: it holds </style`);
            return `<style>${css}</style>`;
          }
        );
      },
    },
  };
}

export default defineConfig({
  root,
  // The pathname of SITE_URL: /livelocale/ on the Pages project URL, / on a custom domain.
  base: siteConfig(process.env).base,
  plugins: [checkExcerpt(), preloadHeadlineFont(), inlineCss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { main: fileURLToPath(new URL('index.html', import.meta.url)) },
    },
  },
});
