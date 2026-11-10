import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLiveLocaleHandler } from '../../src/server/next-handler.js';
import { FileMutator } from '../../src/server/file-mutator.js';

vi.mock('fs', () => {
  return {
    promises: {
      readFile: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
    },
  };
});

vi.mock('../../src/server/file-mutator.js', () => {
  return {
    FileMutator: vi.fn().mockImplementation(function () {
      return {
        updateLocaleKey: vi.fn().mockResolvedValue(undefined),
        listLocales: vi.fn().mockResolvedValue(['en', 'ar', 'es']),
        readLocale: vi.fn().mockResolvedValue({}),
        addLocale: vi.fn().mockResolvedValue(undefined),
        renameLocale: vi.fn().mockResolvedValue(undefined),
        deleteLocale: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

/**
 * Minimal stand-in for a Pages Router `NextApiRequest`: a Node IncomingMessage
 * with a lowercase headers map and a readable body stream.
 */
function createNodeReq(
  method: string,
  url: string,
  body?: object,
  headers: Record<string, string> = { origin: 'http://localhost:3010' }
) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const listeners: Record<string, ((...args: any[]) => any)[]> = {};
  return {
    method,
    url,
    headers: { ...headers, host: 'localhost:3000' },
    on(event: string, cb: (...args: any[]) => any) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      // Emit lazily once both data/end listeners have been registered
      if (event === 'end') {
        setTimeout(() => {
          if (bodyStr) listeners['data']?.forEach((fn) => fn(Buffer.from(bodyStr)));
          listeners['end']?.forEach((fn) => fn());
        }, 0);
      }
      return this;
    },
    destroy: vi.fn(),
  };
}

/** Minimal stand-in for a Pages Router `NextApiResponse`. */
function createNodeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    finished: false,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      res.body = chunk ?? '';
      res.finished = true;
    },
  };
  res.done = new Promise<void>((resolve) => {
    const originalEnd = res.end;
    res.end = (chunk?: string) => {
      originalEnd(chunk);
      resolve();
    };
  });
  return res;
}

describe('createLiveLocaleHandler — Pages Router (req, res) signature', () => {
  const config = { localesPath: '/project/locales' };

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should list locales when invoked Node-style with GET', async () => {
    const handler = createLiveLocaleHandler(config);
    const req = createNodeReq('GET', '/api/livelocale');
    const res = createNodeRes();

    await (handler as any)(req, res);
    await res.done;

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.body)).toEqual(['en', 'ar', 'es']);
  });

  it('should write a key when invoked Node-style with a JSON POST body', async () => {
    const handler = createLiveLocaleHandler(config);
    const req = createNodeReq(
      'POST',
      '/api/livelocale',
      { locale: 'en', key: 'home.title', value: 'Hello' },
      { origin: 'http://localhost:3010', 'content-type': 'application/json' }
    );
    const res = createNodeRes();

    await (handler as any)(req, res);
    await res.done;

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.updateLocaleKey).toHaveBeenCalledWith(
      config.localesPath,
      'en',
      'home.title',
      'Hello'
    );
  });

  /**
   * Next's Pages Router parses the body by default: the stream is already drained and
   * never emits again, and the parsed value sits on `req.body`. Waiting for the stream
   * would hang every save forever.
   */
  function createParsedReq(body: unknown, contentType = 'application/json') {
    return {
      method: 'POST',
      url: '/api/livelocale',
      headers: {
        origin: 'http://localhost:3010',
        'content-type': contentType,
        host: 'localhost:3000',
      },
      body,
      readableEnded: true,
      on() {
        return this;
      },
      destroy: vi.fn(),
    };
  }

  async function settleWithin<T>(promise: Promise<T>, ms = 500): Promise<T | 'hung'> {
    return Promise.race([promise, new Promise<'hung'>((r) => setTimeout(() => r('hung'), ms))]);
  }

  it('should use a body Next already parsed into an object instead of waiting for the stream', async () => {
    const handler = createLiveLocaleHandler(config);
    const req = createParsedReq({ locale: 'en', key: 'home.title', value: 'Parsed' });
    const res = createNodeRes();

    const outcome = await settleWithin((handler as any)(req, res));

    expect(outcome).not.toBe('hung');
    expect(res.statusCode).toBe(200);
    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.updateLocaleKey).toHaveBeenCalledWith(
      config.localesPath,
      'en',
      'home.title',
      'Parsed'
    );
  });

  it('should use a body Next already read as a string instead of waiting for the stream', async () => {
    const handler = createLiveLocaleHandler(config);
    const req = createParsedReq(
      JSON.stringify({ locale: 'en', key: 'home.title', value: 'Text' }),
      'application/json'
    );
    const res = createNodeRes();

    const outcome = await settleWithin((handler as any)(req, res));

    expect(outcome).not.toBe('hung');
    expect(res.statusCode).toBe(200);
    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.updateLocaleKey).toHaveBeenCalledWith(
      config.localesPath,
      'en',
      'home.title',
      'Text'
    );
  });

  it('should answer at once when the stream has already ended and no body was kept', async () => {
    const handler = createLiveLocaleHandler(config);
    const req = createParsedReq(undefined);
    const res = createNodeRes();

    const outcome = await settleWithin((handler as any)(req, res));

    expect(outcome).not.toBe('hung');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('should still cap an already-parsed body at the size limit', async () => {
    const handler = createLiveLocaleHandler(config);
    const req = createParsedReq({ locale: 'en', key: 'k', value: 'x'.repeat(2 * 1024 * 1024) });
    const res = createNodeRes();

    await settleWithin((handler as any)(req, res));

    expect(res.statusCode).toBe(413);
  });

  it('should reject a disallowed origin Node-style with 403', async () => {
    const handler = createLiveLocaleHandler(config);
    const req = createNodeReq(
      'POST',
      '/api/livelocale',
      { locale: 'en', key: 'home.title', value: 'pwned' },
      { origin: 'https://evil.example.com', 'content-type': 'application/json' }
    );
    const res = createNodeRes();

    await (handler as any)(req, res);
    await res.done;

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('FORBIDDEN_ORIGIN');
  });

  it('should answer OPTIONS Node-style with 204 and CORS headers', async () => {
    const handler = createLiveLocaleHandler(config);
    const req = createNodeReq('OPTIONS', '/api/livelocale');
    const res = createNodeRes();

    await (handler as any)(req, res);
    await res.done;

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3010');
  });
});
