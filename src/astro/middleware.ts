import { injectIntoHead, pageHeadScripts } from '../server/page-script.js';

export interface LiveLocaleMiddlewareOptions {
  /** The locales folder, resolved from the working directory as the Vite plugin does. */
  localesPath: string;
}

/** The two arguments of an Astro middleware this one reads; typed here so astro stays optional. */
type Next = () => Promise<Response>;

/**
 * An Astro middleware that does for Astro pages what the Vite plugin's `transformIndexHtml`
 * does for `index.html`, which Astro never runs: it puts the mode flag and the fallback
 * dictionary in `<head>` of every HTML response. It reads the locale files on each request,
 * so the page carries a Studio save on its next load without a dev server restart.
 *
 * The `livelocale/astro` integration registers it; you never import it yourself.
 */
export function createLiveLocaleMiddleware(options: LiveLocaleMiddlewareOptions) {
  return async function onRequest(_context: unknown, next: Next): Promise<Response> {
    const response = await next();
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response;
    const scripts = pageHeadScripts(options.localesPath);
    if (!scripts) return response;
    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(injectIntoHead(html, scripts), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
