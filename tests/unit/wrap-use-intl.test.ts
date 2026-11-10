// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'use-intl/core';
import { wrapNextIntl, wrapTranslationEngine } from '../../src/client/wrap.js';
import { containsWatermark, decodeKey } from '../../src/client/watermark.js';

// next-intl's t is use-intl's createTranslator. These run the wrapper against the real thing,
// not a stand-in: the key each call watermarks must be the one in the messages file, and
// whatever is not a string must come back as next-intl made it.

const en = {
  title: 'Welcome',
  home: {
    title: 'Welcome home',
    greeting: 'Hello, {name}!',
    invoices: '{count, plural, =0 {No invoices} one {# invoice} other {# invoices}}',
    rich: 'Read the <link>terms</link>',
  },
};

const ar = {
  home: {
    invoices:
      '{count, plural, zero {لا فواتير} one {فاتورة واحدة} two {فاتورتان} few {# فواتير} many {# فاتورة} other {# فاتورة}}',
  },
};

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('wrapTranslationEngine and wrapNextIntl on a real use-intl translator', () => {
  it('watermarks a plain key with the key itself', () => {
    const t = wrapTranslationEngine(createTranslator({ locale: 'en', messages: en }));
    expect(decodeKey(t('title'))).toEqual({ key: 'title', cleanText: 'Welcome' });
    expect(decodeKey(t('home.title'))).toEqual({ key: 'home.title', cleanText: 'Welcome home' });
  });

  it('puts the namespace in front of the key', () => {
    const t = wrapNextIntl(
      createTranslator({ locale: 'en', messages: en, namespace: 'home' }),
      'home'
    );
    expect(decodeKey(t('title'))).toEqual({ key: 'home.title', cleanText: 'Welcome home' });
    expect(decodeKey(t('greeting', { name: 'Sara' }))).toEqual({
      key: 'home.greeting',
      cleanText: 'Hello, Sara!',
    });
  });

  it('keys every form of an ICU plural to the one message', () => {
    const t = wrapNextIntl(
      createTranslator({ locale: 'en', messages: en, namespace: 'home' }),
      'home'
    );
    expect(decodeKey(t('invoices', { count: 0 }))).toEqual({
      key: 'home.invoices',
      cleanText: 'No invoices',
    });
    expect(decodeKey(t('invoices', { count: 1 }))?.cleanText).toBe('1 invoice');
    expect(decodeKey(t('invoices', { count: 3 }))?.cleanText).toBe('3 invoices');

    const tAr = wrapNextIntl(
      createTranslator({ locale: 'ar', messages: ar, namespace: 'home' }),
      'home'
    );
    for (const [count, text] of [
      [0, 'لا فواتير'],
      [1, 'فاتورة واحدة'],
      [2, 'فاتورتان'],
    ] as const) {
      expect(decodeKey(tAr('invoices', { count }))).toEqual({
        key: 'home.invoices',
        cleanText: text,
      });
    }
    // few (3 to 10) and many (11 to 99) format the number in Arabic digits.
    expect(decodeKey(tAr('invoices', { count: 3 }))?.cleanText).toMatch(/فواتير$/);
    expect(decodeKey(tAr('invoices', { count: 11 }))?.key).toBe('home.invoices');
  });

  it('returns what t.rich makes, untouched, when it is not a string', () => {
    const inner = createTranslator({ locale: 'en', messages: en, namespace: 'home' });
    const t = wrapNextIntl(inner, 'home');
    const link = (chunks: unknown) => ({ tag: 'a', chunks });
    const wrapped = t.rich('rich', { link });
    expect(Array.isArray(wrapped)).toBe(true);
    expect(wrapped).toEqual(inner.rich('rich', { link }));
    expect(containsWatermark(JSON.stringify(wrapped))).toBe(false);
  });

  it('keys t.raw and t.markup to the message they read', () => {
    const t = wrapNextIntl(
      createTranslator({ locale: 'en', messages: en, namespace: 'home' }),
      'home'
    );
    expect(decodeKey(t.raw('invoices'))).toEqual({
      key: 'home.invoices',
      cleanText: en.home.invoices,
    });
    expect(decodeKey(t.markup('rich', { link: (chunks) => `<a>${chunks}</a>` }))).toEqual({
      key: 'home.rich',
      cleanText: 'Read the <a>terms</a>',
    });
    expect(t.has('title')).toBe(true);
    expect(t.has('missing')).toBe(false);
  });
});
