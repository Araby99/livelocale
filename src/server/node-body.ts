/**
 * Minimal structural type for a Node `http.IncomingMessage`-like request.
 * Used by the Pages Router adapter and the Vite middleware so neither needs
 * to import `next` or `vite` types.
 */
export interface NodeRequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'data', cb: (chunk: Buffer | string) => void): unknown;
  on(event: 'end', cb: () => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  destroy?(): void;
}

/** Minimal structural type for a Node `http.ServerResponse`-like response. */
export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(chunk?: string): unknown;
}

export class BodyTooLargeError extends Error {
  readonly code = 'BODY_TOO_LARGE';
  constructor() {
    super('Request body too large.');
    this.name = 'BodyTooLargeError';
  }
}

/**
 * Buffers a Node request body as UTF-8 text, rejecting with
 * `BodyTooLargeError` as soon as `maxBytes` is exceeded (RULE SEC-007).
 */
export function readNodeBody(req: NodeRequestLike, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let bodyText = '';
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      bodyText += chunk.toString();
      if (Buffer.byteLength(bodyText, 'utf-8') > maxBytes) {
        settled = true;
        reject(new BodyTooLargeError());
        req.destroy?.();
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(bodyText);
    });
    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

/** Returns the first value of a possibly multi-valued Node header, lowercased name expected. */
export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw ?? '';
}
