import * as path from 'path';
import { fileURLToPath } from 'url';
import { getLiveLocaleMode } from '../core/env.js';
import { liveLocaleVite, type VitePluginConfig } from '../server/vite-plugin.js';
import { packOutput, SHARE_BUILD_ENV } from '../server/pack.js';

/** The options of `liveLocale()`: the same as `liveLocaleVite()`. */
export type LiveLocaleAstroOptions = VitePluginConfig;

/** The module Astro imports the middleware from; the integration's Vite plugin serves it. */
export const MIDDLEWARE_ID = 'virtual:livelocale/astro-middleware';
const RESOLVED_MIDDLEWARE_ID = `\0${MIDDLEWARE_ID}`;

/**
 * The page script that starts the in-page client. It runs again after an Astro view
 * transition swaps `<body>`, so the client rescans the new page.
 */
export const CLIENT_SCRIPT = [
  "import { startLiveLocale } from 'livelocale/client';",
  'startLiveLocale();',
  "document.addEventListener('astro:after-swap', () => startLiveLocale());",
].join('\n');

export const SHARE_NEEDS_PREVIEW =
  'share: true packs the Studio only in a preview build, because Astro renders the text at build time. Build with LIVELOCALE=preview astro build, and deploy that build to a staging location only.';

// The parts of Astro's integration API this file uses, typed here so the package needs no
// `astro` dependency. Astro's own hook arguments are assignable to these.

interface IntegrationLogger {
  info(message: string): void;
  warn(message: string): void;
}

interface ConfigSetupOptions {
  config: { root: URL; base?: string };
  command: 'dev' | 'build' | 'preview' | 'sync';
  updateConfig: (config: any) => unknown;
  injectScript: (stage: 'page', content: string) => void;
  addMiddleware: (middleware: { entrypoint: string; order: 'pre' | 'post' }) => void;
  logger: IntegrationLogger;
}

interface BuildDoneOptions {
  dir: URL;
  logger: IntegrationLogger;
}

/** The Astro integration object `liveLocale()` returns. */
export interface LiveLocaleAstroIntegration {
  name: 'livelocale';
  hooks: {
    'astro:config:setup': (options: ConfigSetupOptions) => void;
    'astro:build:done': (options: BuildDoneOptions) => Promise<void>;
  };
}

/** Serves the middleware module with the integration's options baked in. */
function middlewareModulePlugin(localesPath: string, sourceLocale?: string) {
  return {
    name: 'livelocale:astro-middleware',
    resolveId(id: string) {
      return id === MIDDLEWARE_ID ? RESOLVED_MIDDLEWARE_ID : null;
    },
    load(id: string) {
      if (id !== RESOLVED_MIDDLEWARE_ID) return null;
      return [
        "import { createLiveLocaleMiddleware } from 'livelocale/astro/middleware';",
        `export const onRequest = createLiveLocaleMiddleware(${JSON.stringify({ localesPath, sourceLocale })});`,
      ].join('\n');
    },
  };
}

/**
 * LiveLocale for Astro, without React: one line in `astro.config.mjs`.
 *
 * In `astro dev` it adds the Vite plugin (the Studio's API at `/api/livelocale`), puts the
 * mode flag and the fallback dictionary in `<head>` of every page, and loads the in-page
 * client. In a preview build (`LIVELOCALE=preview astro build`) it does the same, and with
 * `share: true` it also packs the share Studio into the output. A share build (`share: true`
 * or `livelocale build --preview`) loads only the client: the packed `flag.js` decides. A normal `astro build` gets
 * nothing: no flag, no dictionary, no client code.
 *
 * @example
 * // astro.config.mjs
 * import { defineConfig } from 'astro/config';
 * import liveLocale from 'livelocale/astro';
 *
 * export default defineConfig({
 *   integrations: [liveLocale({ localesPath: './locales' })],
 * });
 */
export function liveLocale(options: LiveLocaleAstroOptions): LiveLocaleAstroIntegration {
  let projectDir = process.cwd();
  let base = '/';
  let preview = false;

  return {
    name: 'livelocale',
    hooks: {
      'astro:config:setup': ({ config, command, updateConfig, injectScript, addMiddleware }) => {
        projectDir = fileURLToPath(config.root);
        base = config.base ?? '/';
        const dev = command === 'dev';
        preview = command === 'build' && getLiveLocaleMode() === 'preview';
        if (!dev && !preview) return;

        // The share Studio is packed in astro:build:done, once the HTML exists; the Vite
        // plugin's own pack would run before Astro writes the pages.
        // A share build gets no inline flag and no fallback dictionary, as with the Vite
        // plugin: the packed flag.js turns the client on only inside the share Studio, and an
        // inline flag would turn it on for any page that frames the site.
        const shareBuild =
          preview && (options.share === true || process.env[SHARE_BUILD_ENV] === '1');
        const plugins: unknown[] = [];
        if (dev) plugins.push(liveLocaleVite({ ...options, share: false }));
        if (!shareBuild)
          plugins.push(middlewareModulePlugin(options.localesPath, options.sourceLocale));
        updateConfig({ vite: { plugins } });
        if (!shareBuild) addMiddleware({ entrypoint: MIDDLEWARE_ID, order: 'pre' });
        injectScript('page', CLIENT_SCRIPT);
      },

      'astro:build:done': async ({ dir, logger }) => {
        if (options.share !== true) return;
        if (!preview) {
          logger.warn(SHARE_NEEDS_PREVIEW);
          return;
        }
        const result = await packOutput({
          outDir: fileURLToPath(dir),
          projectDir,
          localesPath: path.resolve(options.localesPath),
          sourceLocale: options.sourceLocale,
          exposeRepo: options.exposeRepo ?? false,
          base: options.shareBase ?? base,
        });
        for (const warning of result.warnings) logger.warn(warning);
        logger.info(`Share Studio written to ${result.shareUrlPath}`);
      },
    },
  };
}

export default liveLocale;
