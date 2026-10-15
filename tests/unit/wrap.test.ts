// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { wrapTranslationEngine, wrapNextIntl } from '../../src/client/wrap.js';
import { decodeKey } from '../../src/client/watermark.js';

describe('wrapTranslationEngine', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return the original engine unchanged in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const engine = { welcome: 'Hello' };
    const wrapped = wrapTranslationEngine(engine);
    expect(wrapped).toBe(engine);
  });

  it('should return the original engine unchanged when I18N_LENS=off', () => {
    vi.stubEnv('I18N_LENS', 'off');
    const engine = { welcome: 'Hello' };
    expect(wrapTranslationEngine(engine)).toBe(engine);
  });

  it('should watermark existing properties in development', () => {
    const engine = { welcome: 'Hello' };
    const wrapped = wrapTranslationEngine(engine);
    expect(wrapped.welcome).not.toBe('Hello');
    expect(decodeKey(wrapped.welcome)?.cleanText).toBe('Hello');
    expect(decodeKey(wrapped.welcome)?.key).toBe('welcome');
  });

  it('should fallback to options.fallback for missing properties', () => {
    const engine = { welcome: 'Hello' } as any;
    const fallback = { welcome: 'Hi', title: 'Home Page', contact: { email: 'test@example.com' } };
    const wrapped = wrapTranslationEngine(engine, { fallback });

    // exists in active -> welcome uses active
    expect(decodeKey(wrapped.welcome)?.cleanText).toBe('Hello');

    // missing in active but exists in fallback -> title uses fallback
    expect(decodeKey(wrapped.title)?.cleanText).toBe('Home Page');
    expect(decodeKey(wrapped.title)?.key).toBe('title');

    // nested missing -> contact.email uses fallback
    expect(decodeKey(wrapped.contact?.email)?.cleanText).toBe('test@example.com');
    expect(decodeKey(wrapped.contact?.email)?.key).toBe('contact.email');
  });

  it('should fallback when called as a function returning the key name', () => {
    // Simulates a next-intl or react-i18next 't' function returning key as fallback
    const tMock = vi.fn((key: string) => {
      if (key === 'welcome') return 'Hello';
      return key; // mock standard fallback returning the key itself
    });

    const fallback = { welcome: 'Hi', title: 'Home Page' };
    const wrappedT = wrapTranslationEngine(tMock, { fallback }) as any;

    // active found
    const res1 = wrappedT('welcome');
    expect(decodeKey(res1)?.cleanText).toBe('Hello');
    expect(decodeKey(res1)?.key).toBe('welcome');

    // active missing (mock returned key name) -> uses fallback
    const res2 = wrappedT('title');
    expect(decodeKey(res2)?.cleanText).toBe('Home Page');
    expect(decodeKey(res2)?.key).toBe('title');
  });

  it('should forward interpolation arguments to translation function', () => {
    const tMock = vi.fn((key: string, values?: Record<string, any>) => {
      if (key === 'greeting' && values?.name) {
        return `Hello, ${values.name}!`;
      }
      return key;
    });

    const wrappedT = wrapTranslationEngine(tMock);
    const result = (wrappedT as any)('greeting', { name: 'Sarah' });

    expect(tMock).toHaveBeenCalledWith('greeting', { name: 'Sarah' });
    expect(decodeKey(result)?.cleanText).toBe('Hello, Sarah!');
    expect(decodeKey(result)?.key).toBe('greeting');
  });

  it('should support descriptor objects like { id: "key" } in FormatJS / react-intl style', () => {
    const tMock = vi.fn((descriptor: { id: string; defaultMessage?: string }) => {
      return descriptor.defaultMessage || descriptor.id;
    });

    const wrappedT = wrapTranslationEngine(tMock);
    const result = (wrappedT as any)({ id: 'auth.title', defaultMessage: 'Sign In' });

    expect(decodeKey(result)?.cleanText).toBe('Sign In');
    expect(decodeKey(result)?.key).toBe('auth.title');
  });

  it('should support wrapNextIntl helper with namespace prefix', () => {
    const tMock = vi.fn((key: string) => `Translated: ${key}`);
    const wrappedT = wrapNextIntl(tMock, 'dashboard');

    const res = (wrappedT as any)('stats.revenue');
    expect(decodeKey(res)?.cleanText).toBe('Translated: stats.revenue');
    expect(decodeKey(res)?.key).toBe('dashboard.stats.revenue');
  });

  it('should handle t.raw and non-string returns transparently', () => {
    const engine = {
      raw: vi.fn((key: string) => {
        if (key === 'items') return ['Apple', 'Banana'];
        return 'Raw String';
      }),
    };

    const wrapped = wrapTranslationEngine(engine as any);
    const arrayResult = (wrapped as any).raw('items');
    expect(arrayResult).toEqual(['Apple', 'Banana']);

    const stringResult = (wrapped as any).raw('single');
    expect(decodeKey(stringResult)?.cleanText).toBe('Raw String');
    expect(decodeKey(stringResult)?.key).toBe('raw.single');
  });

  it('should respect keyPrefix option when retrieving fallback', () => {
    const engine = {} as any;
    const fallback = { home: { title: 'Fallback Title' } };
    const wrapped = wrapTranslationEngine(engine, {
      keyPrefix: 'home',
      fallback,
    });

    expect(decodeKey(wrapped.title)?.cleanText).toBe('Fallback Title');
    expect(decodeKey(wrapped.title)?.key).toBe('home.title');
  });

  it('should fallback to window.__i18n_lens_fallback__ if defined and options.fallback is missing', () => {
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      __i18n_lens_fallback__: { welcome: 'Global Hi', title: 'Global Title' },
    };

    try {
      const engine = { welcome: 'Hello' } as any;
      const wrapped = wrapTranslationEngine(engine);

      expect(decodeKey(wrapped.welcome)?.cleanText).toBe('Hello');
      expect(decodeKey(wrapped.title)?.cleanText).toBe('Global Title');
      expect(decodeKey(wrapped.title)?.key).toBe('title');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
