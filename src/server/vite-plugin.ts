import * as path from 'path';
import * as fs from 'fs';
import { FileMutator } from './file-mutator.js';
import { createMutationRouter, MAX_BODY_BYTES } from './router.js';
import { readNodeBody } from './node-body.js';
import { deepMerge } from '../core/deep-merge.js';
import { isLensEnabled } from '../core/env.js';

export interface VitePluginConfig {
  /** Absolute or relative path to the directory containing your locale JSON files. */
  localesPath: string;
}

const ROUTE = '/api/i18n-lens/mutate';

/**
 * A Vite plugin that serves the i18n-lens mutation API for Vite-based SPAs
 * (React, Vue, Svelte, etc.) that do not use Next.js.
 *
 * @example
 * // vite.config.ts
 * import { i18nLensVite } from 'next-i18n-lens/vite';
 *
 * export default defineConfig({
 *   plugins: [react(), i18nLensVite({ localesPath: './src/locales' })],
 * });
 */
export function i18nLensVite(config: VitePluginConfig) {
  const mutator = new FileMutator();
  const router = createMutationRouter(mutator, { localesPath: config.localesPath });

  return {
    name: 'next-i18n-lens',
    // Only active during dev server mode; the plugin is a no-op during builds.
    apply: 'serve' as const,

    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith(ROUTE)) {
          return next();
        }

        try {
          const result = await router.handle({
            method: req.method,
            url: req.url,
            origin: req.headers['origin'] || '',
            contentType: req.headers['content-type'] || '',
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

    transformIndexHtml(html: string) {
      if (!isLensEnabled()) {
        return html;
      }
      try {
        const resolvedLocalesPath = path.resolve(config.localesPath);
        const entries = fs.readdirSync(resolvedLocalesPath);
        let fallbackData: Record<string, any> = {};
        for (const entry of entries) {
          if (entry.startsWith('.')) continue;
          const entryPath = path.join(resolvedLocalesPath, entry);
          let entryIsDir = false;
          try {
            entryIsDir = fs.statSync(entryPath).isDirectory();
          } catch {}

          if (entryIsDir) {
            try {
              const files = fs.readdirSync(entryPath);
              for (const file of files) {
                if (file.endsWith('.json')) {
                  const ns = file.slice(0, -5);
                  const raw = fs.readFileSync(path.join(entryPath, file), 'utf-8');
                  try {
                    const parsed = JSON.parse(raw);
                    fallbackData[ns] = deepMerge(fallbackData[ns] || {}, parsed);
                  } catch {}
                }
              }
            } catch {}
          } else if (entry.endsWith('.json')) {
            const raw = fs.readFileSync(entryPath, 'utf-8');
            try {
              const parsed = JSON.parse(raw);
              fallbackData = deepMerge(fallbackData, parsed);
            } catch {}
          }
        }
        // RULE SEC-008: XSS-SAFE INJECTION — escape U+2028/U+2029 and "<" so
        // translation values containing "</script>" cannot break out of the tag.
        const safeJson = JSON.stringify(fallbackData)
          .replace(/</g, '\\u003c')
          .replace(/\u2028/g, '\\u2028')
          .replace(/\u2029/g, '\\u2029');
        const script = `<script>window.__i18n_lens_fallback__ = ${safeJson};</script>`;
        return html.replace('</head>', `${script}\n</head>`);
      } catch (err) {
        console.warn('[i18n-lens] Failed to inject fallback data:', err);
        return html;
      }
    },
  };
}
