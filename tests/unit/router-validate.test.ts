// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMutationRouter,
  type MutationGateway,
  type RouterRequest,
} from '../../src/server/router.js';

const LOCALES = '/project/locales';

function makeMutator(): MutationGateway {
  return {
    updateLocaleKey: vi.fn().mockResolvedValue(undefined),
    listLocales: vi.fn().mockResolvedValue(['en']),
    readLocale: vi.fn().mockResolvedValue({}),
    addLocale: vi.fn(),
    renameLocale: vi.fn(),
    deleteLocale: vi.fn(),
    getKeysMetadata: vi.fn().mockResolvedValue({ allKeys: [], codeKeys: [] }),
  };
}

const post = (body: unknown): RouterRequest => ({
  method: 'POST',
  url: '/api/i18n-lens/mutate',
  origin: 'http://localhost:3010',
  contentType: 'application/json',
  bodyText: JSON.stringify(body),
});

describe('mutation router — placeholder and syntax validation', () => {
  let mutator: MutationGateway;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('I18N_LENS', '');
    mutator = makeMutator();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a value whose placeholders differ from the reference with 422 and details', async () => {
    const router = createMutationRouter(mutator, { localesPath: LOCALES });
    const res = await router.handle(
      post({ locale: 'ar', key: 'greeting', value: 'مرحبا {الاسم}', reference: 'Hello {name}' })
    );
    expect(res.status).toBe(422);
    const body = JSON.parse(res.body!);
    expect(body.code).toBe('PLACEHOLDER_MISMATCH');
    expect(body.details).toEqual({ missing: ['{name}'], extra: ['{الاسم}'] });
    expect(mutator.updateLocaleKey).not.toHaveBeenCalled();
  });

  it('saves when placeholders match the reference', async () => {
    const router = createMutationRouter(mutator, { localesPath: LOCALES });
    const res = await router.handle(
      post({ locale: 'ar', key: 'greeting', value: 'مرحبا {name}', reference: 'Hello {name}' })
    );
    expect(res.status).toBe(200);
    expect(mutator.updateLocaleKey).toHaveBeenCalledWith(LOCALES, 'ar', 'greeting', 'مرحبا {name}');
  });

  it('saves a mismatching value when force is set', async () => {
    const router = createMutationRouter(mutator, { localesPath: LOCALES });
    const res = await router.handle(
      post({
        locale: 'ar',
        key: 'greeting',
        value: 'مرحبا',
        reference: 'Hello {name}',
        force: true,
      })
    );
    expect(res.status).toBe(200);
    expect(mutator.updateLocaleKey).toHaveBeenCalled();
  });

  it('does not check placeholders when no reference is sent', async () => {
    const router = createMutationRouter(mutator, { localesPath: LOCALES });
    const res = await router.handle(post({ locale: 'ar', key: 'greeting', value: 'مرحبا' }));
    expect(res.status).toBe(200);
  });

  it('rejects unbalanced ICU syntax with 422 even without a reference', async () => {
    const router = createMutationRouter(mutator, { localesPath: LOCALES });
    const res = await router.handle(post({ locale: 'en', key: 'greeting', value: 'Hello {name' }));
    expect(res.status).toBe(422);
    const body = JSON.parse(res.body!);
    expect(body.code).toBe('MESSAGE_SYNTAX');
    expect(body.error).toMatch(/unbalanced/i);
    expect(mutator.updateLocaleKey).not.toHaveBeenCalled();
  });

  it('allows invalid syntax when force is set', async () => {
    const router = createMutationRouter(mutator, { localesPath: LOCALES });
    const res = await router.handle(
      post({ locale: 'en', key: 'greeting', value: 'Hello {name', force: true })
    );
    expect(res.status).toBe(200);
  });
});
