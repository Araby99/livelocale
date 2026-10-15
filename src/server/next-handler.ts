import { FileMutator } from './file-mutator.js';
import { GitClient } from './git-client.js';
import { createMutationRouter, MAX_BODY_BYTES, type RouterResponse } from './router.js';
import {
  readNodeBody,
  headerValue,
  BodyTooLargeError,
  type NodeRequestLike,
  type NodeResponseLike,
} from './node-body.js';

export interface HandlerConfig {
  localesPath: string;
  allowedOrigins?: string[];
  /**
   * Expose git status, commit, and discard for the locales directory to the
   * Studio. Requires the `git` CLI on PATH. Defaults to `true`.
   */
  git?: boolean;
  /**
   * Bearer token required on every request. Defaults to the `I18N_LENS_TOKEN`
   * environment variable. Mandatory in preview mode.
   */
  authToken?: string;
}

/**
 * A handler that works as both a Next.js App Router route handler
 * (`(request: Request) => Promise<Response>`) and a Pages Router API route
 * (`(req, res) => Promise<void>`). The shape is detected per call.
 */
export interface I18nLensHandler {
  (request: Request): Promise<Response>;
  (req: NodeRequestLike, res: NodeResponseLike): Promise<void>;
}

const TOO_LARGE: RouterResponse = {
  status: 413,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: 'Request body too large.', code: 'BODY_TOO_LARGE' }),
};

function isNodeResponse(value: unknown): value is NodeResponseLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NodeResponseLike).setHeader === 'function' &&
    typeof (value as NodeResponseLike).end === 'function'
  );
}

/**
 * Creates a Next.js route handler (App Router or Pages Router) backed by the
 * unified mutation router. Handles GET, POST, and OPTIONS requests.
 */
export function createI18nLensHandler(config: HandlerConfig): I18nLensHandler {
  const mutator = new FileMutator();
  const router = createMutationRouter(mutator, {
    localesPath: config.localesPath,
    allowedOrigins: config.allowedOrigins,
    git: config.git === false ? undefined : new GitClient(),
    authToken: config.authToken ?? process.env['I18N_LENS_TOKEN'],
  });

  // ─── App Router: Web Request / Response ──────────────────────────────────

  async function handleWeb(request: Request): Promise<Response> {
    // RULE SEC-007: BODY SIZE CAP — reject oversized bodies before buffering
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return toWebResponse(TOO_LARGE);
    }

    let bodyText: string | undefined;
    if (request.method === 'POST') {
      bodyText = await request.text().catch(() => '');
      if (Buffer.byteLength(bodyText, 'utf-8') > MAX_BODY_BYTES) {
        return toWebResponse(TOO_LARGE);
      }
    }

    const result = await router.handle({
      method: request.method,
      url: request.url,
      origin: request.headers.get('origin') || '',
      contentType: request.headers.get('content-type') || '',
      authorization: request.headers.get('authorization') || undefined,
      bodyText,
    });

    return toWebResponse(result);
  }

  // ─── Pages Router: Node IncomingMessage / ServerResponse ─────────────────

  async function handleNode(req: NodeRequestLike, res: NodeResponseLike): Promise<void> {
    const method = req.method || 'GET';
    let result: RouterResponse;

    try {
      const contentLength = Number(headerValue(req.headers, 'content-length') || 0);
      if (contentLength > MAX_BODY_BYTES) {
        throw new BodyTooLargeError();
      }

      result = await router.handle({
        method,
        url: req.url || '/',
        origin: headerValue(req.headers, 'origin'),
        contentType: headerValue(req.headers, 'content-type'),
        authorization: headerValue(req.headers, 'authorization') || undefined,
        bodyText: method === 'POST' ? await readNodeBody(req, MAX_BODY_BYTES) : undefined,
      });
    } catch (err: any) {
      result =
        err instanceof BodyTooLargeError
          ? TOO_LARGE
          : {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                error: err?.message || 'Internal Server Error',
                code: 'INTERNAL_ERROR',
              }),
            };
    }

    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
    res.statusCode = result.status;
    res.end(result.body ?? '');
  }

  function i18nLensMutationHandler(request: Request): Promise<Response>;
  function i18nLensMutationHandler(req: NodeRequestLike, res: NodeResponseLike): Promise<void>;
  function i18nLensMutationHandler(
    reqOrRequest: Request | NodeRequestLike,
    res?: NodeResponseLike
  ): Promise<Response> | Promise<void> {
    if (isNodeResponse(res)) {
      return handleNode(reqOrRequest as NodeRequestLike, res);
    }
    return handleWeb(reqOrRequest as Request);
  }

  return i18nLensMutationHandler;
}

function toWebResponse(result: RouterResponse): Response {
  return new Response(result.body, { status: result.status, headers: result.headers });
}
