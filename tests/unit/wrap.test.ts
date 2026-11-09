// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { types } from 'util';
import { resolveTranslations, wrapTranslationEngine, wrapNextIntl } from '../../src/client/wrap.js';
import { decodeKey, unwrap } from '../../src/client/watermark.js';

const { isProxy } = types;

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

  it('should return the original engine unchanged when LIVELOCALE=off', () => {
    vi.stubEnv('LIVELOCALE', 'off');
    const engine = { welcome: 'Hello' };
    expect(wrapTranslationEngine(engine)).toBe(engine);
  });

  it('should return the original engine unchanged in production even with a fallback', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const engine = { welcome: 'Hello' };
    const wrapped = wrapTranslationEngine(engine, { fallback: { title: 'Home' } });
    expect(wrapped).toBe(engine);
    expect((wrapped as any).title).toBeUndefined();
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

  it('should fallback to window.__livelocale_fallback__ if defined and options.fallback is missing', () => {
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      __livelocale_fallback__: { welcome: 'Global Hi', title: 'Global Title' },
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

describe('resolveTranslations', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const record = {
    home: { title: 'Accueil' },
    list: ['un'],
    count: 2,
    nothing: null,
  } as Record<string, any>;
  const fallback = {
    home: { title: 'Home', subtitle: 'Welcome' },
    list: ['one', 'two'],
    count: 5,
    nothing: 'Something',
    plural: { one: '# file', other: '# files' },
  };

  it('should give the values a read through the proxy gives, as a plain object', () => {
    const proxy = wrapTranslationEngine(record, { fallback }) as Record<string, any>;
    const plain = resolveTranslations(record, { fallback, watermark: true });

    expect(isProxy(plain)).toBe(false);
    for (const path of [
      'home.title',
      'home.subtitle',
      'list.0',
      'count',
      'nothing',
      'plural.one',
      'plural.other',
    ]) {
      const read = (obj: any) => path.split('.').reduce((o, k) => o[k], obj);
      expect(read(plain), path).toBe(read(proxy));
    }
    expect(Array.isArray(plain.list)).toBe(true);
    expect(plain.list).toHaveLength(proxy.list.length);
    expect([...plain.list]).toEqual([...proxy.list]);
  });

  it('should keep the record array whole, as the proxy length and iteration do', () => {
    expect(resolveTranslations(record, { fallback, watermark: false }).list).toEqual(['un']);
    expect(resolveTranslations({}, { fallback, watermark: false }).list).toEqual(['one', 'two']);
  });

  it('should keep every key and its watermark through JSON', () => {
    const copy = JSON.parse(
      JSON.stringify(resolveTranslations(record, { fallback, watermark: true }))
    );

    expect(Object.keys(copy).sort()).toEqual(['count', 'home', 'list', 'nothing', 'plural']);
    expect(decodeKey(copy.home.subtitle)).toEqual({ key: 'home.subtitle', cleanText: 'Welcome' });
    expect(copy.list).toHaveLength(1);
    expect(decodeKey(copy.list[0])).toEqual({ key: 'list.0', cleanText: 'un' });
  });

  it('should look the fallback up under keyPrefix, like the proxy', () => {
    const plain = resolveTranslations({}, { keyPrefix: 'home', fallback, watermark: true });
    expect(decodeKey(plain.subtitle)).toEqual({ key: 'home.subtitle', cleanText: 'Welcome' });
  });

  it('should merge without watermarks and share subtrees that need no merge', () => {
    const plain = resolveTranslations(record, { fallback, watermark: false });

    expect(plain).toEqual({
      home: { title: 'Accueil', subtitle: 'Welcome' },
      list: ['un'],
      count: 2,
      nothing: null,
      plural: { one: '# file', other: '# files' },
    });
    expect(plain.plural).toBe(fallback.plural);
    expect(resolveTranslations(record, { watermark: false })).toBe(record);
  });
});

describe('wrapTranslationEngine enumeration', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A namespace the locale has as an empty file, as in a half-translated site: every key of
  // it comes from the fallback, and one of them is an array.
  const record = { faq: {}, home: { title: 'Accueil', items: ['un'] }, count: 2 } as Record<
    string,
    any
  >;
  const fallback = {
    faq: { title: 'FAQ', sections: [{ q: 'Why?', a: 'Because.' }] },
    home: { title: 'Home', lead: 'Welcome', items: ['one', 'two'] },
    count: 5,
    extra: { note: 'Note' },
  };
  const proxy = () => wrapTranslationEngine(record, { fallback }) as Record<string, any>;
  const plain = () => resolveTranslations(record, { fallback, watermark: true });
  const production = () => resolveTranslations(record, { fallback, watermark: false });

  it('lists the keys only the fallback has, as the plain and production objects do', () => {
    expect(Object.keys(proxy())).toEqual(Object.keys(plain()));
    expect(Object.keys(proxy().faq)).toEqual(['title', 'sections']);
    expect(Object.keys(proxy().home)).toEqual(Object.keys(production().home));
    expect(Object.keys(proxy()).sort()).toEqual(Object.keys(production()).sort());
  });

  it('finds an array that only the fallback has through Object.values', () => {
    const sections = Object.values(proxy().faq).find(Array.isArray);
    expect(sections).toBeDefined();
    expect(Array.isArray(sections)).toBe(true);
    expect(unwrap(sections)).toEqual(Object.values(production().faq).find(Array.isArray));
  });

  it('gives the same entries, values and spread as the plain object', () => {
    expect(Object.entries(proxy().faq).map(([k]) => k)).toEqual(
      Object.entries(plain().faq).map(([k]) => k)
    );
    expect(Object.values(proxy().home)[0]).toBe(Object.values(plain().home)[0]);
    expect(unwrap({ ...proxy().faq })).toEqual({ ...production().faq });
    expect(decodeKey({ ...proxy().faq }.title)).toEqual({ key: 'faq.title', cleanText: 'FAQ' });
  });

  it('answers `in` and hasOwnProperty for fallback keys', () => {
    expect('sections' in proxy().faq).toBe(true);
    expect('lead' in proxy().home).toBe(true);
    expect('missing' in proxy().home).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(proxy().faq, 'title')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(proxy().faq, 'title')).toEqual({
      value: proxy().faq.title,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });

  it('serializes every key through JSON.stringify with the watermarks a read gives', () => {
    expect(JSON.parse(JSON.stringify(proxy()))).toEqual(JSON.parse(JSON.stringify(plain())));
  });

  it('keeps the record array whole and still an array', () => {
    const items = proxy().home.items;
    expect(Array.isArray(items)).toBe(true);
    expect(Object.keys(items)).toEqual(['0']);
    expect(unwrap([...items])).toEqual(['un']);
    expect(JSON.parse(JSON.stringify(proxy().home)).items).toHaveLength(1);
  });

  it('respects the Proxy invariants of a frozen record', () => {
    const frozen = Object.freeze({ title: 'Accueil' });
    const wrapped = wrapTranslationEngine(frozen, { fallback: { lead: 'Welcome' } }) as any;
    expect(Object.keys(wrapped)).toEqual(['title']);
    expect('lead' in wrapped).toBe(false);
    expect(Object.getOwnPropertyDescriptor(wrapped, 'title')?.value).toBe('Accueil');
  });

  it('leaves a translation function as it is', () => {
    const t = Object.assign((key: string) => key, { raw: () => 'raw' });
    const wrapped = wrapTranslationEngine(t, { fallback: { title: 'Home' } });
    expect(Object.keys(wrapped)).toEqual(['raw']);
    expect(typeof wrapped).toBe('function');
  });
});
