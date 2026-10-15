// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMutationRouter,
  type MutationGateway,
  type GitGateway,
  type RouterRequest,
} from '../../src/server/router.js';

const LOCALES = '/project/locales';

function makeMutator(): MutationGateway {
  return {
    updateLocaleKey: vi.fn().mockResolvedValue(undefined),
    listLocales: vi.fn().mockResolvedValue(['en']),
    addLocale: vi.fn().mockResolvedValue(undefined),
    renameLocale: vi.fn().mockResolvedValue(undefined),
    deleteLocale: vi.fn().mockResolvedValue(undefined),
    getKeysMetadata: vi.fn().mockResolvedValue({ allKeys: [], codeKeys: [] }),
  };
}

function makeGit(): GitGateway {
  return {
    status: vi.fn().mockResolvedValue({
      isRepo: true,
      branch: 'main',
      changes: [{ path: 'locales/en.json', status: 'modified' }],
    }),
    diff: vi.fn().mockResolvedValue('--- a/locales/en.json\n+++ b/locales/en.json\n-x\n+y\n'),
    commit: vi.fn().mockResolvedValue({ hash: 'abc1234' }),
    discard: vi.fn().mockResolvedValue(undefined),
  };
}

const get = (query: string): RouterRequest => ({
  method: 'GET',
  url: `/api/i18n-lens/mutate${query}`,
  origin: 'http://localhost:3010',
});

const post = (body: unknown): RouterRequest => ({
  method: 'POST',
  url: '/api/i18n-lens/mutate',
  origin: 'http://localhost:3010',
  contentType: 'application/json',
  bodyText: JSON.stringify(body),
});

describe('mutation router — git actions', () => {
  let git: GitGateway;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('I18N_LENS', '');
    git = makeGit();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('GET ?action=git returns status and diff from the gateway', async () => {
    const router = createMutationRouter(makeMutator(), { localesPath: LOCALES, git });
    const res = await router.handle(get('?action=git'));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.isRepo).toBe(true);
    expect(body.branch).toBe('main');
    expect(body.changes).toHaveLength(1);
    expect(body.diff).toContain('+y');
    expect(git.status).toHaveBeenCalledWith(LOCALES);
    expect(git.diff).toHaveBeenCalledWith(LOCALES);
  });

  it('GET ?action=git skips the diff when the directory is not a repository', async () => {
    vi.mocked(git.status).mockResolvedValue({ isRepo: false, branch: null, changes: [] });
    const router = createMutationRouter(makeMutator(), { localesPath: LOCALES, git });
    const body = JSON.parse((await router.handle(get('?action=git'))).body!);
    expect(body.isRepo).toBe(false);
    expect(body.diff).toBe('');
    expect(git.diff).not.toHaveBeenCalled();
  });

  it('GET ?action=git reports git as unavailable when no gateway is configured', async () => {
    const router = createMutationRouter(makeMutator(), { localesPath: LOCALES });
    const res = await router.handle(get('?action=git'));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.isRepo).toBe(false);
    expect(body.available).toBe(false);
  });

  it('POST action=commit validates the message and commits through the gateway', async () => {
    const router = createMutationRouter(makeMutator(), { localesPath: LOCALES, git });
    const res = await router.handle(post({ action: 'commit', message: 'i18n: fix typos' }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({ success: true, hash: 'abc1234' });
    expect(git.commit).toHaveBeenCalledWith(LOCALES, 'i18n: fix typos');
  });

  it('POST action=commit rejects empty or oversized messages', async () => {
    const router = createMutationRouter(makeMutator(), { localesPath: LOCALES, git });
    for (const message of ['', '   ', 'x'.repeat(501), 42]) {
      const res = await router.handle(post({ action: 'commit', message }));
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body!).code).toBe('INVALID_COMMIT_MESSAGE');
    }
    expect(git.commit).not.toHaveBeenCalled();
  });

  it('POST action=commit surfaces gateway failures as 409', async () => {
    vi.mocked(git.commit).mockRejectedValue(new Error('No changes to commit'));
    const router = createMutationRouter(makeMutator(), { localesPath: LOCALES, git });
    const res = await router.handle(post({ action: 'commit', message: 'nothing' }));
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body!).code).toBe('GIT_COMMIT_FAILED');
  });

  it('POST action=discard reverts through the gateway', async () => {
    const router = createMutationRouter(makeMutator(), { localesPath: LOCALES, git });
    const res = await router.handle(post({ action: 'discard' }));
    expect(res.status).toBe(200);
    expect(git.discard).toHaveBeenCalledWith(LOCALES);
  });

  it('git write actions return 501 when no gateway is configured', async () => {
    const router = createMutationRouter(makeMutator(), { localesPath: LOCALES });
    for (const action of ['commit', 'discard']) {
      const res = await router.handle(post({ action, message: 'm' }));
      expect(res.status).toBe(501);
      expect(JSON.parse(res.body!).code).toBe('GIT_UNAVAILABLE');
    }
  });
});
