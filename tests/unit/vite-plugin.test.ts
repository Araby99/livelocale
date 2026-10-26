import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { liveLocaleVite } from '../../src/server/vite-plugin.js';

// Helper: create a minimal mock request / response pair for the Vite middleware
function createMockReq(
  method: string,
  url: string,
  body?: object,
  headers: Record<string, string> = { origin: 'http://localhost:3010' }
): {
  req: any;
  readBody: () => Promise<void>;
} {
  const bodyStr = body ? JSON.stringify(body) : '';
  const listeners: Record<string, ((...args: any[]) => any)[]> = {};

  const req = {
    method,
    url,
    headers,
    on(event: string, cb: (...args: any[]) => any) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
  };

  const readBody = async () => {
    if (bodyStr) {
      listeners['data']?.forEach((cb) => cb(Buffer.from(bodyStr)));
    }
    listeners['end']?.forEach((cb) => cb());
  };

  return { req, readBody };
}

function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = '';

  return {
    res: {
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
      get statusCode() {
        return statusCode;
      },
      set statusCode(code: number) {
        statusCode = code;
      },
      end(data: string) {
        body = data;
      },
    },
    get headers() {
      return headers;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get parsedBody() {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    },
  };
}

describe('liveLocaleVite plugin', () => {
  let tmpDir: string;
  let plugin: ReturnType<typeof liveLocaleVite>;
  let middleware: (req: any, res: any, next: any) => Promise<void>;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');

    // Create a temp directory with a flat locale file
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-vite-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello', farewell: 'Goodbye' })
    );

    // Instantiate the plugin and grab the middleware
    plugin = liveLocaleVite({ localesPath: tmpDir });
    const server = {
      middlewares: {
        use: (mw: any) => {
          middleware = mw;
        },
      },
    };
    (plugin as any).configureServer(server);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  // ─── GET: Fetch locale dictionary ────────────────────────────────────────

  it('should return 200 with locale JSON on valid GET request', async () => {
    const { req } = createMockReq('GET', '/api/livelocale?locale=en');
    const mock = createMockRes();
    const next = vi.fn();

    await middleware(req, mock.res, next);

    expect(mock.statusCode).toBe(200);
    expect(mock.parsedBody).toMatchObject({ greeting: 'Hello', farewell: 'Goodbye' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 on GET with invalid locale', async () => {
    const { req } = createMockReq('GET', '/api/livelocale?locale=../../etc');
    const mock = createMockRes();
    const next = vi.fn();

    await middleware(req, mock.res, next);

    expect(mock.statusCode).toBe(400);
    expect(mock.parsedBody.code).toBe('INVALID_LOCALE_FORMAT');
  });

  it('should return 404 on GET with non-existent locale', async () => {
    const { req } = createMockReq('GET', '/api/livelocale?locale=fr');
    const mock = createMockRes();
    const next = vi.fn();

    await middleware(req, mock.res, next);

    expect(mock.statusCode).toBe(404);
    expect(mock.parsedBody.code).toBe('LOCALE_LOAD_FAILED');
  });

  // ─── GET: Namespace directory support ────────────────────────────────────

  it('should merge namespace files when locale path is a directory', async () => {
    const nsDir = path.join(tmpDir, 'de');
    fs.mkdirSync(nsDir);
    fs.writeFileSync(path.join(nsDir, 'common.json'), JSON.stringify({ save: 'Speichern' }));
    fs.writeFileSync(path.join(nsDir, 'auth.json'), JSON.stringify({ login: 'Anmelden' }));

    const { req } = createMockReq('GET', '/api/livelocale?locale=de');
    const mock = createMockRes();

    await middleware(req, mock.res, vi.fn());

    expect(mock.statusCode).toBe(200);
    expect(mock.parsedBody).toMatchObject({
      common: { save: 'Speichern' },
      auth: { login: 'Anmelden' },
    });
  });

  // ─── POST: Mutate a key ───────────────────────────────────────────────────

  it('should write updated value on valid POST request', async () => {
    const { req, readBody } = createMockReq('POST', '/api/livelocale', {
      locale: 'en',
      key: 'greeting',
      value: 'Hi there!',
    });
    const mock = createMockRes();
    const next = vi.fn();

    // Start the middleware (it awaits stream events), then emit the body data
    // on the next microtask tick so the req.on() listeners are registered first.
    const promise = middleware(req, mock.res, next);
    await Promise.resolve(); // let middleware register req listeners
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(200);
    expect(mock.parsedBody).toMatchObject({ success: true, key: 'greeting', locale: 'en' });

    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'en.json'), 'utf-8'));
    expect(updated.greeting).toBe('Hi there!');
  });

  it('should return 400 on POST with invalid locale', async () => {
    const { req, readBody } = createMockReq('POST', '/api/livelocale', {
      locale: '!!',
      key: 'greeting',
      value: 'Hi',
    });
    const mock = createMockRes();

    const promise = middleware(req, mock.res, vi.fn());
    await Promise.resolve();
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(400);
    expect(mock.parsedBody.code).toBe('INVALID_LOCALE_FORMAT');
  });

  it('should return 400 on POST with invalid key', async () => {
    const { req, readBody } = createMockReq('POST', '/api/livelocale', {
      locale: 'en',
      key: 'path/../traversal',
      value: 'hi',
    });
    const mock = createMockRes();

    const promise = middleware(req, mock.res, vi.fn());
    await Promise.resolve();
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(400);
    expect(mock.parsedBody.code).toBe('INVALID_KEY_FORMAT');
  });

  // ─── Security: CSRF / prototype pollution ────────────────────────────────

  it('should return 403 on POST from a disallowed (non-localhost) origin', async () => {
    const { req, readBody } = createMockReq(
      'POST',
      '/api/livelocale',
      { locale: 'en', key: 'greeting', value: 'pwned' },
      { origin: 'https://evil.example.com' }
    );
    const mock = createMockRes();

    const promise = middleware(req, mock.res, vi.fn());
    await Promise.resolve();
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(403);
    expect(mock.parsedBody.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('should return 415 on POST with a non-JSON content type', async () => {
    const { req, readBody } = createMockReq(
      'POST',
      '/api/livelocale',
      { locale: 'en', key: 'greeting', value: 'pwned' },
      { origin: 'http://localhost:3010', 'content-type': 'text/plain' }
    );
    const mock = createMockRes();

    const promise = middleware(req, mock.res, vi.fn());
    await Promise.resolve();
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(415);
    expect(mock.parsedBody.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('should reject prototype-pollution keys on POST', async () => {
    const { req, readBody } = createMockReq('POST', '/api/livelocale', {
      locale: 'en',
      key: '__proto__.polluted',
      value: 'PWNED',
    });
    const mock = createMockRes();

    const promise = middleware(req, mock.res, vi.fn());
    await Promise.resolve();
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(400);
    expect(mock.parsedBody.code).toBe('INVALID_KEY_FORMAT');
  });

  // ─── CORS Preflight ───────────────────────────────────────────────────────

  it('should respond 204 on OPTIONS preflight', async () => {
    const { req } = createMockReq('OPTIONS', '/api/livelocale');
    const mock = createMockRes();

    await middleware(req, mock.res, vi.fn());

    expect(mock.statusCode).toBe(204);
    expect(mock.headers['Access-Control-Allow-Methods']).toContain('GET');
  });

  // ─── Route passthrough ────────────────────────────────────────────────────

  it('does not answer on the old /api/i18n-lens/mutate route', async () => {
    const { req } = createMockReq('GET', '/api/i18n-lens/mutate');
    const mock = createMockRes();
    const next = vi.fn();
    await middleware(req, mock.res, next);
    expect(next).toHaveBeenCalled();
  });

  it('leaves app routes that only share the prefix to the app', async () => {
    for (const url of ['/api/livelocale-stats', '/api/livelocales', '/api/livelocalex?x=1']) {
      const { req } = createMockReq('GET', url);
      const mock = createMockRes();
      const next = vi.fn();
      await middleware(req, mock.res, next);
      expect(next, url).toHaveBeenCalled();
    }
  });

  it('should call next() for unrelated routes', async () => {
    const { req } = createMockReq('GET', '/some-other-route');
    const mock = createMockRes();
    const next = vi.fn();

    await middleware(req, mock.res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return list of locales on GET request without locale parameter', async () => {
    // Add another file in tmpDir
    fs.writeFileSync(path.join(tmpDir, 'es.json'), '{}');

    const { req } = createMockReq('GET', '/api/livelocale');
    const mock = createMockRes();
    const next = vi.fn();

    await middleware(req, mock.res, next);

    expect(mock.statusCode).toBe(200);
    expect(mock.parsedBody).toEqual(['en', 'es']);
  });

  it('should add a locale file on POST addLocale request', async () => {
    const { req, readBody } = createMockReq('POST', '/api/livelocale', {
      action: 'addLocale',
      locale: 'fr',
    });
    const mock = createMockRes();
    const next = vi.fn();

    const promise = middleware(req, mock.res, next);
    await Promise.resolve();
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(200);
    expect(mock.parsedBody).toMatchObject({ success: true, locale: 'fr' });
    expect(fs.existsSync(path.join(tmpDir, 'fr.json'))).toBe(true);
  });

  it('should rename a locale file on POST renameLocale request', async () => {
    const { req, readBody } = createMockReq('POST', '/api/livelocale', {
      action: 'renameLocale',
      locale: 'en',
      newLocale: 'en-GB',
    });
    const mock = createMockRes();
    const next = vi.fn();

    const promise = middleware(req, mock.res, next);
    await Promise.resolve();
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(200);
    expect(mock.parsedBody).toMatchObject({ success: true, locale: 'en', newLocale: 'en-GB' });
    expect(fs.existsSync(path.join(tmpDir, 'en.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'en-GB.json'))).toBe(true);
  });

  it('should delete a locale file on POST deleteLocale request', async () => {
    const { req, readBody } = createMockReq('POST', '/api/livelocale', {
      action: 'deleteLocale',
      locale: 'en',
    });
    const mock = createMockRes();
    const next = vi.fn();

    const promise = middleware(req, mock.res, next);
    await Promise.resolve();
    await readBody();
    await promise;

    expect(mock.statusCode).toBe(200);
    expect(mock.parsedBody).toMatchObject({ success: true, locale: 'en' });
    expect(fs.existsSync(path.join(tmpDir, 'en.json'))).toBe(false);
  });

  // ─── transformIndexHtml ──────────────────────────────────────────────────

  it('should inject merged fallback translations in development mode', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'es.json'),
      JSON.stringify({ greeting: 'Hola', page: { title: 'Título' } })
    );

    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = (plugin as any).transformIndexHtml(html);

    expect(result).toContain('window.__livelocale_fallback__ =');
    expect(result).toContain('Hola');
    expect(result).toContain('Título');
    expect(result).toContain('</head>');
  });

  it('should escape script-breaking sequences in injected fallback data (XSS)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'es.json'),
      JSON.stringify({ greeting: '</script><script>alert(1)</script>' })
    );

    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = (plugin as any).transformIndexHtml(html);

    // The literal "</script>" must never appear inside the injected inline script
    expect(result).not.toContain('</script><script>alert(1)</script>');
    expect(result).toContain('\\u003c/script>');
    expect(result).toContain('\\u003cscript>');
  });

  it('should not inject merged fallback translations in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = (plugin as any).transformIndexHtml(html);

    expect(result).toBe(html);
    expect(result).not.toContain('window.__livelocale_fallback__');
  });
});

describe('liveLocaleVite plugin — browser flag mirroring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('injects window.__LIVELOCALE_FLAG__ when LIVELOCALE is set', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // locales dir is intentionally missing
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', 'preview');
    const plugin: any = liveLocaleVite({ localesPath: path.join(os.tmpdir(), 'does-not-exist') });
    const html = plugin.transformIndexHtml('<html><head></head><body></body></html>');
    expect(html).toContain('window.__LIVELOCALE_FLAG__ = "preview"');
    vi.restoreAllMocks();
  });

  it('injects nothing extra when the flag is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', '');
    const plugin: any = liveLocaleVite({ localesPath: path.join(os.tmpdir(), 'does-not-exist') });
    const html = plugin.transformIndexHtml('<html><head></head><body></body></html>');
    expect(html).not.toContain('__LIVELOCALE_FLAG__');
  });
});
