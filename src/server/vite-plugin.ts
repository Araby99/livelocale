import * as path from 'path';
import type { Plugin } from 'vite';
import { FileMutator } from './file-mutator.js';
import { GitClient } from './git-client.js';
import { createMutationRouter, MAX_BODY_BYTES } from './router.js';
import { readNodeBody } from './node-body.js';
import { packOutput } from './pack.js';
import { injectIntoHead, pageHeadScripts, type FallbackNamespaces } from './page-script.js';
import { flagSrcFor, injectFlagScript, normalizeBase, type AppBase } from './share-html.js';

export interface VitePluginConfig {
  /** Absolute or relative path to the directory containing your locale JSON files. */
  localesPath: string;
  /** Expose git status, commit, and discard to the Studio. Defaults to `true`. */
  git?: boolean;
  /** Bearer token required on every request. Defaults to `LIVELOCALE_TOKEN`. */
  authToken?: string;
  /** Write the share Studio into <outDir>/livelocale/ on `vite build`. Off by default. */
  share?: boolean;
  /** Put the GitHub owner/repo into the published manifest. Defaults to false. */
  exposeRepo?: boolean;
  /** Source locale for the manifest. Defaults to en when present, else the first locale. */
  sourceLocale?: string;
  /** Site path the HTML is served from, when Vite `base` is a full URL or differs. */
  shareBase?: string;
  /**
   * Which namespaces of the fallback strings each page gets, for `wrapTranslationEngine` reads
   * in the browser. `'all'` (the default) puts every locale's strings into every page. A list
   * puts only the namespaces whose keys the page's HTML shows watermarked, plus the listed
   * ones: list a namespace that only client-side code reads. A read of a namespace left out
   * warns in the browser console.
   */
  fallbackNamespaces?: FallbackNamespaces;
}

/** What `apply` receives from Vite: the command, and whether this is an SSR build. */
interface ViteConfigEnv {
  command: 'serve' | 'build';
  isSsrBuild?: boolean;
  /** The Vite 4 name of `isSsrBuild`. */
  ssrBuild?: boolean;
}

/** The parts of Vite's resolved config the share build reads. */
interface ShareBuildState {
  root: string;
  outDir: string;
  /** The raw base handed to pack (`shareBase` when set, else Vite `base`). */
  base: string;
  appBase: AppBase;
  logger: { warn(message: string): void };
}

const ROUTE = '/api/livelocale';

/**
 * A Vite plugin that serves the livelocale mutation API for Vite-based SPAs
 * (React, Vue, Svelte, etc.) that do not use Next.js.
 *
 * @example
 * // vite.config.ts
 * import { liveLocaleVite } from 'livelocale/vite';
 *
 * export default defineConfig({
 *   plugins: [react(), liveLocaleVite({ localesPath: './src/locales' })],
 * });
 */
export function liveLocaleVite(config: VitePluginConfig): Plugin {
  const mutator = new FileMutator();
  const router = createMutationRouter(mutator, {
    localesPath: config.localesPath,
    git: config.git === false ? undefined : new GitClient(),
    authToken: config.authToken ?? process.env['LIVELOCALE_TOKEN'],
  });
  // Set by configResolved only for a client `vite build` with share on; null means dev behaviour.
  let shareBuild: ShareBuildState | null = null;
  let packed = false;

  return {
    name: 'livelocale',
    // Always active in dev; in builds only with `share: true`, and never for the SSR build.
    apply(_userConfig: unknown, env: ViteConfigEnv): boolean {
      if (env.command === 'serve') return true;
      return config.share === true && !env.isSsrBuild && !env.ssrBuild;
    },

    configResolved(resolved: any) {
      shareBuild = null;
      if (resolved.command !== 'build' || config.share !== true) return;
      // SSR and library builds have no app HTML to share.
      if (resolved.build?.ssr || resolved.build?.lib) return;
      const base: string = config.shareBase ?? resolved.base;
      shareBuild = {
        root: resolved.root,
        outDir: path.resolve(resolved.root, resolved.build.outDir),
        base,
        appBase: normalizeBase(base),
        logger: resolved.logger,
      };
    },

    buildStart() {
      // Watch mode rebuilds call buildStart again, so each rebuild packs once more.
      packed = false;
    },

    async writeBundle() {
      if (shareBuild === null || packed) return;
      packed = true;
      const result = await packOutput({
        outDir: shareBuild.outDir,
        projectDir: shareBuild.root,
        // Resolved against the working directory, as the serve half does.
        localesPath: path.resolve(config.localesPath),
        sourceLocale: config.sourceLocale,
        exposeRepo: config.exposeRepo ?? false,
        base: shareBuild.base,
        // transformIndexHtml already linked flag.js in every HTML file Vite wrote.
        injectHtml: false,
      });
      for (const warning of result.warnings) shareBuild.logger.warn(warning);
    },

    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url: string = req.url ?? '';
        // Exact path only, so app routes such as /api/livelocale-stats stay with the app.
        if (url !== ROUTE && !url.startsWith(`${ROUTE}?`) && !url.startsWith(`${ROUTE}/`)) {
          return next();
        }

        try {
          const result = await router.handle({
            method: req.method,
            url: req.url,
            origin: req.headers['origin'] || '',
            contentType: req.headers['content-type'] || '',
            authorization: req.headers['authorization'] || undefined,
            bodyText: req.method === 'POST' ? await readNodeBody(req, MAX_BODY_BYTES) : undefined,
          });

          Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
          res.statusCode = result.status;
          res.end(result.body ?? '');
        } catch (err: any) {
          if (err?.code === 'BODY_TOO_LARGE') {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message, code: 'BODY_TOO_LARGE' }));
            return;
          }
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err.message || 'Internal Server Error',
              code: 'INTERNAL_ERROR',
            })
          );
        }
      });
    },

    transformIndexHtml(html: string, ctx?: { path?: string }) {
      if (shareBuild !== null) {
        const htmlRelPath = (ctx?.path ?? '/index.html').replace(/^\/+/, '');
        return injectFlagScript(html, flagSrcFor(shareBuild.appBase, htmlRelPath));
      }
      // Mirror the server-side mode (development/preview/off) and the fallback dictionary into
      // the page, so the client bundle resolves the same mode without bundler env inlining.
      return injectIntoHead(
        html,
        pageHeadScripts(config.localesPath, config.sourceLocale, {
          fallbackNamespaces: config.fallbackNamespaces,
          html,
        })
      );
    },
  };
}
