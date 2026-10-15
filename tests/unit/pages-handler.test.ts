import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createI18nLensHandler } from '../../src/server/next-handler.js';
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
    FileMutator: vi.fn().mockImplementation(() => {
      return {
        updateLocaleKey: vi.fn().mockResolvedValue(undefined),
        listLocales: vi.fn().mockResolvedValue(['en', 'ar', 'es']),
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

describe('createI18nLensHandler — Pages Router (req, res) signature', () => {
  const config = { localesPath: '/project/locales' };

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should list locales when invoked Node-style with GET', async () => {
    const handler = createI18nLensHandler(config);
    const req = createNodeReq('GET', '/api/i18n-lens/mutate');
    const res = createNodeRes();

    await (handler as any)(req, res);
    await res.done;

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.body)).toEqual(['en', 'ar', 'es']);
  });

  it('should write a key when invoked Node-style with a JSON POST body', async () => {
    const handler = createI18nLensHandler(config);
    const req = createNodeReq(
      'POST',
      '/api/i18n-lens/mutate',
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

  it('should reject a disallowed origin Node-style with 403', async () => {
    const handler = createI18nLensHandler(config);
    const req = createNodeReq(
      'POST',
      '/api/i18n-lens/mutate',
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
    const handler = createI18nLensHandler(config);
    const req = createNodeReq('OPTIONS', '/api/i18n-lens/mutate');
    const res = createNodeRes();

    await (handler as any)(req, res);
    await res.done;

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3010');
  });
});
