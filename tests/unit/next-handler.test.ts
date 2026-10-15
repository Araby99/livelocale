import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createI18nLensHandler } from '../../src/server/next-handler.js';
import { FileMutator } from '../../src/server/file-mutator.js';
import { promises as fs } from 'fs';

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

describe('createI18nLensHandler', () => {
  const config = { localesPath: '/project/locales' };

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return 403 Forbidden when run in non-development mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'Hello' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.code).toBe('FORBIDDEN');
  });

  it('should return 400 Bad Request when request body contains invalid JSON', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid-json }',
    });

    const response = await handler(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe('BAD_REQUEST');
  });

  it('should return 400 Bad Request when locale formatting is invalid', async () => {
    const handler = createI18nLensHandler(config);

    const invalidLocales = ['e', 'english', 'en_US', 'en-US-extra'];
    for (const loc of invalidLocales) {
      const request = new Request('http://localhost:3000/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: loc, key: 'title', value: 'Hello' }),
      });
      const response = await handler(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_LOCALE_FORMAT');
    }
  });

  it('should return 400 Bad Request when key formatting is invalid', async () => {
    const handler = createI18nLensHandler(config);

    const invalidKeys = ['', 'a'.repeat(201), 'key$name', 'key/name', 'key\\name'];
    for (const key of invalidKeys) {
      const request = new Request('http://localhost:3000/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'en', key, value: 'Hello' }),
      });
      const response = await handler(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_KEY_FORMAT');
    }
  });

  it('should return 400 Bad Request when value formatting is invalid', async () => {
    const handler = createI18nLensHandler(config);

    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'a'.repeat(10001) }),
    });
    const response = await handler(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe('INVALID_VALUE_FORMAT');
  });

  it('should call updateLocaleKey and return 200 OK when request payload is valid', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'en', key: 'dashboard.title', value: 'Welcome Dashboard' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.key).toBe('dashboard.title');
    expect(data.locale).toBe('en');

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.updateLocaleKey).toHaveBeenCalledWith(
      config.localesPath,
      'en',
      'dashboard.title',
      'Welcome Dashboard'
    );
  });

  it('should return 500 when mutator throws an error', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'Hello' }),
    });

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    vi.mocked(mutatorInstance.updateLocaleKey).mockRejectedValue(new Error('Disk Write Failure'));

    const response = await handler(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.code).toBe('INTERNAL_ERROR');
    expect(data.error).toBe('Disk Write Failure');
  });

  it('should return 204 and correct CORS headers for OPTIONS requests', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3010',
      },
    });

    const response = await handler(request);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3010');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('should accept empty string as a valid translation value', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'en', key: 'title', value: '' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('should accept valid regional, script, and three-letter codes under loose regex validation', async () => {
    const handler = createI18nLensHandler(config);

    const validLocales = ['es-419', 'zh-Hans', 'zh-Hant', 'en-US', 'ar-EG', 'eng', 'ar'];
    for (const loc of validLocales) {
      const request = new Request('http://localhost:3000/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: loc, key: 'title', value: 'Hello' }),
      });

      const response = await handler(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });

  it('should handle GET requests and load flat locale JSON file', async () => {
    const handler = createI18nLensHandler(config);
    vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT')); // not a directory
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ greeting: 'Hello' }));

    const request = new Request('http://localhost:3000/api/mutate?locale=en', {
      method: 'GET',
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.greeting).toBe('Hello');
  });

  it('should handle GET requests and merge split namespace files when locale path is a directory', async () => {
    const handler = createI18nLensHandler(config);
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readdir).mockResolvedValue(['common.json' as any, 'auth.json' as any]);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(JSON.stringify({ title: 'Welcome' })) // common.json
      .mockResolvedValueOnce(JSON.stringify({ login: 'Log In' })); // auth.json

    const request = new Request('http://localhost:3000/api/mutate?locale=en', {
      method: 'GET',
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.common.title).toBe('Welcome');
    expect(data.auth.login).toBe('Log In');
  });

  it('should handle GET requests without locale param by listing locales', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'GET',
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual(['en', 'ar', 'es']);

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.listLocales).toHaveBeenCalledWith(config.localesPath);
  });

  it('should handle POST requests to add a locale', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addLocale', locale: 'fr' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.locale).toBe('fr');

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.addLocale).toHaveBeenCalledWith(config.localesPath, 'fr');
  });

  it('should handle POST requests to rename a locale', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'renameLocale', locale: 'en', newLocale: 'en-US' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.locale).toBe('en');
    expect(data.newLocale).toBe('en-US');

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.renameLocale).toHaveBeenCalledWith(config.localesPath, 'en', 'en-US');
  });

  it('should handle POST requests to delete a locale', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteLocale', locale: 'de' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.locale).toBe('de');

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.deleteLocale).toHaveBeenCalledWith(config.localesPath, 'de');
  });

  // ─── Security: CSRF / prototype pollution / body limits ──────────────────

  it('should return 403 when POST request origin is not allowed (CSRF)', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'pwned' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.code).toBe('FORBIDDEN_ORIGIN');

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.updateLocaleKey).not.toHaveBeenCalled();
  });

  it('should allow POST requests from any localhost origin (studio on custom ports)', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:4321',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'Hello' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
  });

  it('should return 415 when POST content type is not application/json', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3010',
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'pwned' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(415);
    const data = await response.json();
    expect(data.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.updateLocaleKey).not.toHaveBeenCalled();
  });

  it('should return 413 when the request body exceeds the size cap', async () => {
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'x'.repeat(2_000_000) }),
    });

    const response = await handler(request);
    expect(response.status).toBe(413);
    const data = await response.json();
    expect(data.code).toBe('BODY_TOO_LARGE');
  });

  it('should reject prototype-pollution keys like __proto__', async () => {
    const handler = createI18nLensHandler(config);

    for (const key of ['__proto__.polluted', 'constructor.prototype.x', 'a.prototype.b']) {
      const request = new Request('http://localhost:3000/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'en', key, value: 'PWNED' }),
      });

      const response = await handler(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_KEY_FORMAT');
    }

    const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
    expect(mutatorInstance.updateLocaleKey).not.toHaveBeenCalled();
  });
  // ─── Extra allowed origins via environment (Codespaces, custom hostnames) ──

  it('should allow POST from an origin listed in I18N_LENS_ALLOWED_ORIGINS', async () => {
    vi.stubEnv(
      'I18N_LENS_ALLOWED_ORIGINS',
      'https://abc-3010.app.github.dev, https://studio.dev.local'
    );
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: {
        Origin: 'https://abc-3010.app.github.dev',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'Hello' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://abc-3010.app.github.dev'
    );
  });

  it('should still reject origins not listed in I18N_LENS_ALLOWED_ORIGINS', async () => {
    vi.stubEnv('I18N_LENS_ALLOWED_ORIGINS', 'https://abc-3010.app.github.dev');
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locale: 'en', key: 'title', value: 'pwned' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(403);
  });
  it('should return 403 when the I18N_LENS kill switch is set, even in development', async () => {
    vi.stubEnv('I18N_LENS', 'off');
    const handler = createI18nLensHandler(config);
    const request = new Request('http://localhost:3000/api/mutate', { method: 'GET' });

    const response = await handler(request);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.code).toBe('FORBIDDEN');
    expect(data.error).toContain('I18N_LENS');
  });
  // ─── Bearer-token authentication (preview mode) ───────────────────────────

  describe('with authToken', () => {
    const authed = { ...config, authToken: 'secret-token-123' };

    it('rejects GET and POST without a bearer token with 401', async () => {
      const handler = createI18nLensHandler(authed);
      const get = await handler(new Request('http://localhost:3000/api/mutate', { method: 'GET' }));
      expect(get.status).toBe(401);
      expect((await get.json()).code).toBe('UNAUTHORIZED');

      const post = await handler(
        new Request('http://localhost:3000/api/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: 'en', key: 'title', value: 'Hello' }),
        })
      );
      expect(post.status).toBe(401);
      const mutatorInstance = vi.mocked(FileMutator).mock.results[0]?.value;
      expect(mutatorInstance.updateLocaleKey).not.toHaveBeenCalled();
    });

    it('rejects a wrong token with 401', async () => {
      const handler = createI18nLensHandler(authed);
      const res = await handler(
        new Request('http://localhost:3000/api/mutate', {
          method: 'GET',
          headers: { Authorization: 'Bearer nope' },
        })
      );
      expect(res.status).toBe(401);
    });

    it('accepts the correct bearer token', async () => {
      const handler = createI18nLensHandler(authed);
      const res = await handler(
        new Request('http://localhost:3000/api/mutate', {
          method: 'GET',
          headers: { Authorization: 'Bearer secret-token-123' },
        })
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(['en', 'ar', 'es']);
    });

    it('lets OPTIONS preflight through and advertises the Authorization header', async () => {
      const handler = createI18nLensHandler(authed);
      const res = await handler(
        new Request('http://localhost:3000/api/mutate', {
          method: 'OPTIONS',
          headers: { Origin: 'http://localhost:3010' },
        })
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });

    it('reads the token from I18N_LENS_TOKEN when not configured explicitly', async () => {
      vi.stubEnv('I18N_LENS_TOKEN', 'from-env');
      const handler = createI18nLensHandler(config);
      const denied = await handler(new Request('http://localhost:3000/api/mutate'));
      expect(denied.status).toBe(401);
      const ok = await handler(
        new Request('http://localhost:3000/api/mutate', {
          headers: { Authorization: 'Bearer from-env' },
        })
      );
      expect(ok.status).toBe(200);
    });
  });

  it('refuses to serve in preview mode without a token', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('I18N_LENS', 'preview');
    const handler = createI18nLensHandler(config);
    const res = await handler(new Request('http://localhost:3000/api/mutate'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PREVIEW_TOKEN_REQUIRED');
    expect(body.error).toContain('I18N_LENS_TOKEN');
  });
});
