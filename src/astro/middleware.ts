import {
  injectIntoHead,
  pageFlag,
  pageHeadScripts,
  type FallbackNamespaces,
} from '../server/page-script.js';

export interface LiveLocaleMiddlewareOptions {
  /** The locales folder, resolved from the working directory as the Vite plugin does. */
  localesPath: string;
  /** The locale whose text wins in the fallback dictionary. Defaults to `en`. */
  sourceLocale?: string;
  /** The namespaces of the fallback dictionary each page gets. Defaults to `'all'`. */
  fallbackNamespaces?: FallbackNamespaces;
}

/** The two arguments of an Astro middleware this one reads; typed here so astro stays optional. */
type Next = () => Promise<Response>;

/**
 * An Astro middleware that does for Astro pages what the Vite plugin's `transformIndexHtml`
 * does for `index.html`, which Astro never runs: it puts the mode flag and the fallback
 * dictionary in `<head>` of every HTML response. It reads the locale files on each request,
 * so the page carries a Studio save on its next load without a dev server restart. With a
 * `fallbackNamespaces` list, the dictionary holds the namespaces the rendered page shows
 * watermarked, plus the listed ones.
 *
 * The `livelocale/astro` integration registers it; you never import it yourself.
 */
export function createLiveLocaleMiddleware(options: LiveLocaleMiddlewareOptions) {
  return async function onRequest(_context: unknown, next: Next): Promise<Response> {
    const response = await next();
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response;
    // No flag means LiveLocale is off and `LIVELOCALE` unset: nothing to inject, so the body
    // is never read.
    if (pageFlag() === null) return response;
    const html = await response.text();
    const scripts = pageHeadScripts(options.localesPath, options.sourceLocale, {
      fallbackNamespaces: options.fallbackNamespaces,
      html,
    });
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(injectIntoHead(html, scripts), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
