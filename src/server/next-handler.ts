import { FileMutator } from './file-mutator.js';
import { createMutationRouter, MAX_BODY_BYTES } from './router.js';

export interface HandlerConfig {
  localesPath: string;
  allowedOrigins?: string[];
}

/**
 * Creates a Next.js route handler (App Router or Pages Router) backed by the
 * unified mutation router. Handles GET, POST, and OPTIONS requests.
 */
export function createI18nLensHandler(config: HandlerConfig) {
  const mutator = new FileMutator();
  const router = createMutationRouter(mutator, {
    localesPath: config.localesPath,
    allowedOrigins: config.allowedOrigins,
  });

  return async function i18nLensMutationHandler(request: Request): Promise<Response> {
    // RULE SEC-007: BODY SIZE CAP — reject oversized bodies before buffering
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ error: 'Request body too large.', code: 'BODY_TOO_LARGE' }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    let bodyText: string | undefined;
    if (request.method === 'POST') {
      bodyText = await request.text().catch(() => '');
      if (Buffer.byteLength(bodyText, 'utf-8') > MAX_BODY_BYTES) {
        return new Response(
          JSON.stringify({ error: 'Request body too large.', code: 'BODY_TOO_LARGE' }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    const result = await router.handle({
      method: request.method,
      url: request.url,
      origin: request.headers.get('origin') || '',
      contentType: request.headers.get('content-type') || '',
      bodyText,
    });

    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  };
}
