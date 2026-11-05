// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  englishText,
  formatMessage,
  studioMessage,
  type Catalogue,
  type Message,
  type StringKey,
} from '../../src/studio/i18n/catalogue.js';
import { en } from '../../src/studio/i18n/en.js';
import { STATIC_MANIFEST_MISSING } from '../../src/studio/config.js';
import {
  COMMIT_UNSUPPORTED,
  LOCALE_ACTIONS_UNSUPPORTED,
  STORAGE_PROBLEM,
} from '../../src/studio/transport/static.js';

const cat: Catalogue = {
  hi: 'Hello {name}',
  editing: 'Editing: {locale}',
  unsent: { one: '1 change not sent', other: '{count} changes not sent' },
};
it('interpolates values as given, with no isolate characters', () =>
  expect(formatMessage(cat, 'editing', { locale: 'ar-EG' })).toBe('Editing: ar-EG'));
it.each([
  [0, '0 changes not sent'],
  [1, '1 change not sent'],
  [2, '2 changes not sent'],
  [11, '11 changes not sent'],
])('picks the English plural form for %i', (count, text) =>
  expect(formatMessage(cat, 'unsent', { count })).toBe(text)
);
it('leaves a missing param as written and returns an unknown key', () => {
  expect(formatMessage(cat, 'hi')).toBe('Hello {name}');
  expect(formatMessage(cat, 'nope')).toBe('nope');
});
it('ignores inherited object properties as keys', () =>
  expect(formatMessage(cat, 'toString')).toBe('toString'));
describe('the English catalogue', () => {
  const keys = Object.keys(en) as StringKey[];
  const names = (m: Message) =>
    new Set(
      [...(typeof m === 'string' ? [m] : Object.values(m)).join(' ').matchAll(/\{(\w+)\}/g)].map(
        (x) => x[1]
      )
    );
  it('gives every plural entry an other form', () => {
    for (const k of keys)
      if (typeof en[k] !== 'string')
        expect((en[k] as Exclude<Message, string>).other, k).toBeTypeOf('string');
  });
  it('uses the same placeholders in every form of a plural, except count', () => {
    for (const k of keys)
      if (typeof en[k] !== 'string') {
        const other = [...names((en[k] as Exclude<Message, string>).other)].filter(
          (n) => n !== 'count'
        );
        for (const form of Object.values(en[k] as object) as string[])
          for (const n of other) expect(form, `${k}: {${n}}`).toContain(`{${n}}`);
      }
  });
  it('no longer carries the Studio language toggle', () => {
    expect(keys).not.toContain('language.switch_to_ar');
    expect(keys).not.toContain('language.switch_to_en');
  });
  it('keeps the labels for the site locales, Arabic included', () =>
    expect(keys).toContain('editor.lang_ar'));
});

describe('studioMessage', () => {
  // A text function that marks its output, so a test can tell the message went through `t`.
  const marked = (key: StringKey, params?: Parameters<typeof englishText>[1]) =>
    `[${englishText(key, params)}]`;
  it("passes the Studio's own messages through the text function", () => {
    expect(studioMessage(marked, STATIC_MANIFEST_MISSING)).toBe(marked('setup.manifest_missing'));
    expect(studioMessage(marked, STORAGE_PROBLEM)).toBe(marked('share.storage_problem'));
    expect(studioMessage(marked, LOCALE_ACTIONS_UNSUPPORTED)).toBe(
      marked('share.locale_actions_unsupported')
    );
    expect(studioMessage(marked, COMMIT_UNSUPPORTED)).toBe(marked('share.commit_unsupported'));
  });
  it('passes its own messages that carry values through the text function, values kept', () => {
    for (const [key, params] of [
      ['errors.unauthorized', undefined],
      ['errors.translation_rejected', undefined],
      ['errors.server_status', { status: 503 }],
      ['share.load_failed', { path: 'locales/fr.json', status: 404 }],
      ['share.unknown_language', { locale: 'xx' }],
    ] as const) {
      const english = englishText(key, params);
      expect(english).not.toBe(key);
      expect(studioMessage(marked, english)).toBe(marked(key, params));
      expect(studioMessage(englishText, english)).toBe(english);
    }
  });
  it('keeps a message that only contains one of its own', () =>
    expect(studioMessage(marked, 'Proxy: Unauthorized')).toBe('Proxy: Unauthorized'));
  it('keeps any other message, such as a server error, as given', () =>
    expect(studioMessage(marked, 'Token lacks write access')).toBe('Token lacks write access'));
});
