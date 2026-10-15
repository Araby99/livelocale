// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMutationRouter, type MutationGateway } from '../../src/server/router.js';

function makeMutator(): MutationGateway {
  return {
    updateLocaleKey: vi.fn(),
    listLocales: vi.fn().mockResolvedValue(['en']),
    readLocale: vi.fn().mockResolvedValue({}),
    addLocale: vi.fn(),
    renameLocale: vi.fn(),
    deleteLocale: vi.fn(),
    getKeysMetadata: vi.fn().mockResolvedValue({ allKeys: [], codeKeys: [] }),
  };
}

const info = (authorization?: string) => ({
  method: 'GET',
  url: '/api/i18n-lens/mutate?action=info',
  origin: 'http://localhost:3010',
  authorization,
});

describe('mutation router — info action', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('I18N_LENS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports development mode without auth when no token is configured', async () => {
    const router = createMutationRouter(makeMutator(), { localesPath: '/p/locales' });
    const res = await router.handle(info());
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({
      mode: 'development',
      authRequired: false,
      git: false,
    });
  });

  it('reports preview mode, auth, and git availability', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('I18N_LENS', 'preview');
    const git = { status: vi.fn(), diff: vi.fn(), commit: vi.fn(), discard: vi.fn() };
    const router = createMutationRouter(makeMutator(), {
      localesPath: 'locales',
      authToken: 't0ken',
      git,
    });
    expect((await router.handle(info())).status).toBe(401);
    const res = await router.handle(info('Bearer t0ken'));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({ mode: 'preview', authRequired: true, git: true });
  });
});
