// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import i18next, { type i18n } from 'i18next';
import { wrapTranslationEngine, wrapNextIntl } from '../../src/client/wrap.js';
import { decodeKey } from '../../src/client/watermark.js';

// What each call watermarks against real i18next: the key the Studio saves to must be the
// one in the JSON file the text came from, or "Saved!" lands on a key nothing reads.

const resources = {
  en: {
    translation: {
      items_one: '{{count}} item',
      items_other: '{{count}} items',
      books_one: '{{count}} book',
      books_other: '{{count}} books',
      friend: 'A friend',
      friend_male: 'He is a friend',
      nav: { home: 'Home' },
    },
    home: { title: 'Welcome home', login: { title: 'Sign in' } },
  },
  ar: {
    translation: {
      items_zero: 'لا عناصر',
      items_one: 'عنصر',
      items_two: 'عنصران',
      items_few: '{{count}} عناصر',
      items_many: '{{count}} عنصرًا',
      items_other: '{{count}} عنصر',
    },
  },
};

function createI18n(lng: string): i18n {
  const instance = i18next.createInstance();
  instance.init({
    lng,
    fallbackLng: 'en',
    ns: ['translation', 'home'],
    defaultNS: 'translation',
    initAsync: false,
    resources,
  });
  return instance;
}

type T = (...args: any[]) => any;
const wrap = (t: unknown, options?: Parameters<typeof wrapTranslationEngine>[1]) =>
  wrapTranslationEngine(t as T, options) as T;

describe('wrapTranslationEngine with real i18next', () => {
  let en: i18n;
  let ar: i18n;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    en = createI18n('en');
    ar = createI18n('ar');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs against an i18next whose fixed t reports the key it used', () => {
    const t = en.getFixedT('en', 'home', 'login') as any;
    expect(Object.keys(t)).toEqual(expect.arrayContaining(['lng', 'ns', 'keyPrefix']));
    expect(t('title', { returnDetails: true })).toMatchObject({
      res: 'Sign in',
      exactUsedKey: 'login.title',
      usedNS: 'home',
      usedLng: 'en',
    });
  });

  describe('plural and context', () => {
    it('watermarks the plural form the text came from in English', () => {
      const t = wrap(en.getFixedT('en'));
      expect(decodeKey(t('items', { count: 2 }))).toEqual({
        key: 'items_other',
        cleanText: '2 items',
      });
      expect(decodeKey(t('items', { count: 1 }))?.key).toBe('items_one');
    });

    it('watermarks the Arabic plural form', () => {
      const t = wrap(ar.getFixedT('ar'));
      expect(decodeKey(t('items', { count: 3 }))).toEqual({
        key: 'items_few',
        cleanText: '3 عناصر',
      });
      expect(decodeKey(t('items', { count: 2 }))?.key).toBe('items_two');
      expect(decodeKey(t('items', { count: 11 }))?.key).toBe('items_many');
    });

    it('names the Arabic plural form when the text came from the English fallback', () => {
      const t = wrap(ar.getFixedT('ar'));
      expect(decodeKey(t('books', { count: 5 }))).toEqual({
        key: 'books_few',
        cleanText: '5 books',
      });
      expect(decodeKey(t('books', { count: 1 }))?.key).toBe('books_one');
      expect(decodeKey(t('books', { count: 100 }))?.key).toBe('books_other');
    });

    it('takes the plural form of a per-call language over the t own one', () => {
      const t = wrap(en.getFixedT('en'));
      expect(decodeKey(t('items', { count: 5, lng: 'ar' }))).toEqual({
        key: 'items_few',
        cleanText: '5 عناصر',
      });
      expect(decodeKey(t('books', { count: 5, lng: 'ar' }))?.key).toBe('books_few');
    });

    it('watermarks the context form', () => {
      const t = wrap(en.getFixedT('en'));
      expect(decodeKey(t('friend', { context: 'male' }))).toEqual({
        key: 'friend_male',
        cleanText: 'He is a friend',
      });
      expect(decodeKey(t('friend'))?.key).toBe('friend');
    });
  });

  describe('namespaces', () => {
    it('keeps livelocale keyPrefix for a key in the t own namespace', () => {
      const t = wrap(en.getFixedT('en', 'home'), { keyPrefix: 'home' });
      expect(decodeKey(t('title'))).toEqual({ key: 'home.title', cleanText: 'Welcome home' });
    });

    it('uses a per-call namespace in place of livelocale keyPrefix', () => {
      const t = wrap(en.getFixedT('en', 'translation'), { keyPrefix: 'translation' });
      expect(decodeKey(t('title', { ns: 'home' }))).toEqual({
        key: 'home.title',
        cleanText: 'Welcome home',
      });
      expect(decodeKey(t('home:title'))?.key).toBe('home.title');
      expect(decodeKey(t('nav.home'))?.key).toBe('translation.nav.home');
    });

    it('prefixes a per-call namespace even without livelocale keyPrefix', () => {
      const t = wrap(en.getFixedT('en', 'translation'));
      expect(decodeKey(t('title', { ns: 'home' }))?.key).toBe('home.title');
      expect(decodeKey(t('nav.home'))?.key).toBe('nav.home');
    });

    it('treats only an asked-for namespace as an override when the t has none of its own', () => {
      const fixed = en.getFixedT('en') as any;
      expect(fixed.ns).toBeUndefined();
      const t = wrap(fixed, { keyPrefix: 'translation' });
      expect(decodeKey(t('nav.home'))?.key).toBe('translation.nav.home');
      expect(decodeKey(t('title', { ns: 'home' }))?.key).toBe('home.title');
      expect(decodeKey(t('home:title'))?.key).toBe('home.title');
    });

    it('watermarks the key that resolved from a fallback key array', () => {
      const t = wrap(en.getFixedT('en'));
      expect(decodeKey(t(['missing', 'nav.home']))).toEqual({ key: 'nav.home', cleanText: 'Home' });
    });

    it('adds the i18next keyPrefix under livelocale keyPrefix', () => {
      const t = wrap(en.getFixedT('en', 'home', 'login'), { keyPrefix: 'home' });
      expect(decodeKey(t('title'))).toEqual({ key: 'home.login.title', cleanText: 'Sign in' });
    });
  });

  describe('call shapes', () => {
    it('handles a default value passed as the second argument', () => {
      const t = wrap(en.getFixedT('en'));
      expect(decodeKey(t('nav.home', 'Default'))).toEqual({ key: 'nav.home', cleanText: 'Home' });
      expect(decodeKey(t('ghost', 'Ghost text'))).toEqual({
        key: 'ghost',
        cleanText: 'Ghost text',
      });
      expect(decodeKey(t('items', 'Default', { count: 2 }))?.key).toBe('items_other');
    });

    it('never changes the options object the caller passed', () => {
      const t = wrap(en.getFixedT('en'));
      const options = Object.freeze({ count: 2 });
      t('items', options);
      t('items', 'Default', options);
      expect(options).toEqual({ count: 2 });
    });

    it('leaves returnObjects results as i18next gives them', () => {
      const t = wrap(en.getFixedT('en'));
      expect(t('nav', { returnObjects: true })).toEqual({ home: 'Home' });
    });

    it('leaves object results as i18next gives them when returnObjects is set in init', () => {
      const instance = i18next.createInstance();
      instance.init({
        lng: 'en',
        initAsync: false,
        returnObjects: true,
        resources: { en: { translation: { nav: { home: 'Home' }, list: ['a', 'b'] } } },
      });
      const t = wrap(instance.getFixedT('en'));
      expect(t('nav')).toEqual({ home: 'Home' });
      expect(t('list')).toEqual(['a', 'b']);
      expect(decodeKey(t('nav.home'))).toEqual({ key: 'nav.home', cleanText: 'Home' });
    });

    it('gives a caller who asks for returnDetails the details object', () => {
      const t = wrap(en.getFixedT('en'));
      expect(t('nav.home', { returnDetails: true })).toMatchObject({ res: 'Home' });
    });

    it('fills a missing key from the fallback under the corrected key', () => {
      const t = wrap(en.getFixedT('en', 'home', 'login'), {
        keyPrefix: 'home',
        fallback: { home: { login: { lead: 'Fallback lead' } } },
      });
      expect(decodeKey(t('lead'))).toEqual({ key: 'home.login.lead', cleanText: 'Fallback lead' });

      const plain = wrap(en.getFixedT('en'), { fallback: { ghost: 'Ghost' } });
      expect(decodeKey(plain('ghost'))).toEqual({ key: 'ghost', cleanText: 'Ghost' });
    });

    it('keeps a missing key in the t own namespace when its namespace is a list', () => {
      // react-i18next's useTranslation(['home', 'common']): for a missing key i18next
      // reports the last namespace it tried, which is not where the key belongs.
      const t = wrap(en.getFixedT('en', ['home', 'translation']), {
        keyPrefix: 'home',
        fallback: { home: { ghost: 'Home ghost' } },
      });
      expect(decodeKey(t('ghost'))).toEqual({ key: 'home.ghost', cleanText: 'Home ghost' });
      expect(decodeKey(t('ghost', 'Default ghost'))?.key).toBe('home.ghost');
      expect(decodeKey(t('nav.home'))?.key).toBe('translation.nav.home');
      expect(decodeKey(t('translation:ghost'))?.key).toBe('translation.ghost');
    });

    it('keeps today behaviour for an older i18next that ignores returnDetails', () => {
      const old = Object.assign(
        vi.fn((key: string) => (key === 'items' ? '2 items' : key)),
        { lng: 'en', ns: 'translation', keyPrefix: undefined }
      );
      const t = wrap(old, { fallback: { ghost: 'Ghost' } });
      expect(decodeKey(t('items', { count: 2 }))).toEqual({ key: 'items', cleanText: '2 items' });
      expect(decodeKey(t('ghost'))).toEqual({ key: 'ghost', cleanText: 'Ghost' });
      expect(old).toHaveBeenCalledTimes(2);
    });

    it('passes a custom t exactly the arguments it was called with', () => {
      const custom = vi.fn((key: string) => `Text for ${key}`);
      const t = wrap(custom);
      t('a');
      t('b', { count: 1 });
      t('c', 'Default');
      expect(custom.mock.calls).toEqual([['a'], ['b', { count: 1 }], ['c', 'Default']]);
    });
  });
});

describe('wrapTranslationEngine with next-intl members', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A stand-in next-intl t: callable, with raw, markup, rich and has members.
  function nextIntlT() {
    const messages: Record<string, string> = { rich: 'Hello <b>world</b>', title: 'Title' };
    const richNode = { type: 'fragment' };
    return Object.assign((key: string) => messages[key] ?? key, {
      raw: (key: string) => messages[key] ?? key,
      markup: (key: string) => messages[key] ?? key,
      rich: () => richNode,
      has: (key: string) => key in messages,
      richNode,
    });
  }

  it('keys t.raw and t.markup under the t keyPrefix, not the member name', () => {
    const t = wrapNextIntl(nextIntlT(), 'home') as any;
    expect(decodeKey(t('title'))?.key).toBe('home.title');
    expect(decodeKey(t.raw('rich'))).toEqual({ key: 'home.rich', cleanText: 'Hello <b>world</b>' });
    expect(decodeKey(t.markup('rich', {}))?.key).toBe('home.rich');
  });

  it('keys t.raw without a prefix when the t has none', () => {
    const t = wrapTranslationEngine(nextIntlT()) as any;
    expect(decodeKey(t.raw('rich'))?.key).toBe('rich');
  });

  it('leaves t.rich and t.has results untouched', () => {
    const inner = nextIntlT();
    const t = wrapNextIntl(inner, 'home') as any;
    expect(t.rich('rich', {})).toBe(inner.richNode);
    expect(t.has('rich')).toBe(true);
  });
});
