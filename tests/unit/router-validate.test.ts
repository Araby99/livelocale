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
  url: '/api/livelocale',
  origin: 'http://localhost:3010',
  contentType: 'application/json',
  bodyText: JSON.stringify(body),
});

describe('mutation router — placeholder and syntax validation', () => {
  let mutator: MutationGateway;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LIVELOCALE', '');
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

  it.each([
    [
      { locale: 'e', key: 'a', value: 'x' },
      400,
      { error: 'Invalid locale string parameter.', code: 'INVALID_LOCALE_FORMAT' },
    ],
    [
      { locale: 'en', key: 'a b', value: 'x' },
      400,
      {
        error:
          'Invalid key path. Must be 1-200 characters containing alphanumeric, dots, underscores, or hyphens.',
        code: 'INVALID_KEY_FORMAT',
      },
    ],
    [
      { locale: 'en', key: 'a.__proto__', value: 'x' },
      400,
      {
        error:
          'Forbidden key path: segments like __proto__, constructor, or prototype are not allowed.',
        code: 'INVALID_KEY_FORMAT',
      },
    ],
    [
      { locale: 'en', key: 'a', value: 5 },
      400,
      {
        error: 'Invalid value. Must be a string less than 10000 characters.',
        code: 'INVALID_VALUE_FORMAT',
      },
    ],
    [
      { locale: 'en', key: 'a', value: 'Hello {name' },
      422,
      { error: 'Message syntax: Unbalanced braces: missing "}".', code: 'MESSAGE_SYNTAX' },
    ],
    [
      { locale: 'ar', key: 'g', value: 'x {a}', reference: 'Hi {name}' },
      422,
      {
        error: 'Placeholders differ from the reference: missing {name}; unexpected {a}.',
        code: 'PLACEHOLDER_MISMATCH',
        details: { missing: ['{name}'], extra: ['{a}'] },
      },
    ],
    [
      { locale: 'en', key: 'a', value: 'Hello {name', force: 'true' },
      422,
      { error: 'Message syntax: Unbalanced braces: missing "}".', code: 'MESSAGE_SYNTAX' },
    ],
  ])('POST %o keeps a byte-identical response', async (body, status, expected) => {
    const res = await createMutationRouter(mutator, { localesPath: LOCALES }).handle(post(body));
    expect(res.status).toBe(status);
    expect(res.body).toBe(JSON.stringify(expected));
    expect(mutator.updateLocaleKey).not.toHaveBeenCalled();
  });

  it('still ignores a non-string reference and saves', async () => {
    const res = await createMutationRouter(mutator, { localesPath: LOCALES }).handle(
      post({ locale: 'ar', key: 'g', value: 'x {a}', reference: 5 })
    );
    expect(res.status).toBe(200);
    expect(res.body).toBe(JSON.stringify({ success: true, key: 'g', locale: 'ar' }));
    expect(mutator.updateLocaleKey).toHaveBeenCalledWith(LOCALES, 'ar', 'g', 'x {a}');
  });
});
