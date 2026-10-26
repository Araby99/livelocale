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
  url: '/api/livelocale?action=info',
  origin: 'http://localhost:3010',
  authorization,
});

describe('mutation router — info action', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LIVELOCALE', '');
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
      problems: [],
    });
  });

  it('reports preview mode, auth, and git availability', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', 'preview');
    const git = { status: vi.fn(), diff: vi.fn(), commit: vi.fn(), discard: vi.fn() };
    const router = createMutationRouter(makeMutator(), {
      localesPath: 'locales',
      authToken: 't0ken',
      git,
    });
    expect((await router.handle(info())).status).toBe(401);
    const res = await router.handle(info('Bearer t0ken'));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({
      mode: 'preview',
      authRequired: true,
      git: true,
      problems: [],
    });
  });

  it('refuses to serve preview mode without LIVELOCALE_TOKEN', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', 'preview');
    vi.stubEnv('LIVELOCALE_TOKEN', '');
    const router = createMutationRouter(makeMutator(), { localesPath: 'locales' });
    const res = await router.handle(info());
    expect(res.status).not.toBe(200);
    expect(res.body).toContain('LIVELOCALE_TOKEN');
  });

  it('reports access problems until they are fixed, then stops checking', async () => {
    const checkAccess = vi
      .fn()
      .mockResolvedValueOnce(['The token cannot write.'])
      .mockResolvedValueOnce([]);
    const git = { status: vi.fn(), diff: vi.fn(), commit: vi.fn(), discard: vi.fn(), checkAccess };
    const router = createMutationRouter(makeMutator(), { localesPath: 'locales', git });
    const problems = async () => JSON.parse((await router.handle(info())).body!).problems;
    expect(await problems()).toEqual(['The token cannot write.']);
    expect(await problems()).toEqual([]);
    expect(await problems()).toEqual([]);
    expect(checkAccess).toHaveBeenCalledTimes(2);
  });

  it('turns a failing access check into a problem instead of an error', async () => {
    const checkAccess = vi.fn().mockRejectedValue(new Error('network down'));
    const git = { status: vi.fn(), diff: vi.fn(), commit: vi.fn(), discard: vi.fn(), checkAccess };
    const router = createMutationRouter(makeMutator(), { localesPath: 'locales', git });
    const res = await router.handle(info());
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body!).problems).toEqual([
      'Could not verify repository access: network down',
    ]);
  });
});
