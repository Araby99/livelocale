// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  formatMessage,
  textDirection,
  type Catalogues,
  type Message,
  type StringKey,
} from '../../src/studio/i18n/catalogue.js';
import { en } from '../../src/studio/i18n/en.js';
import { ar, SAME_IN_BOTH } from '../../src/studio/i18n/ar.js';

const cat: Catalogues = {
  en: {
    hi: 'Hello {name}',
    only_en: 'Only English {n}',
    editing: 'Editing: {locale}',
    unsent: { one: '1 change not sent', other: '{count} changes not sent' },
  },
  ar: {
    hi: 'أهلًا {name}',
    editing: 'تعديل: {locale}',
    unsent: {
      zero: 'لا توجد تغييرات غير مرسلة',
      one: 'تغيير واحد لم يُرسل',
      two: 'تغييران لم يُرسلا',
      few: '{count} تغييرات لم تُرسل',
      many: '{count} تغييرًا لم يُرسل',
      other: '{count} تغيير لم يُرسل',
    },
  },
};
const FSI = '\u2068',
  PDI = '\u2069';
it('interpolates English without isolates', () =>
  expect(formatMessage('en', cat, 'editing', { locale: 'en-US' })).toBe('Editing: en-US'));
it('isolates every value in Arabic', () =>
  expect(formatMessage('ar', cat, 'editing', { locale: 'en-US' })).toBe(
    `تعديل: ${FSI}en-US${PDI}`
  ));
it('falls back to English for a missing Arabic entry, still isolated', () =>
  expect(formatMessage('ar', cat, 'only_en', { n: 3 })).toBe(`Only English ${FSI}3${PDI}`));
it.each([
  [0, 'لا توجد تغييرات غير مرسلة'],
  [1, 'تغيير واحد لم يُرسل'],
  [2, 'تغييران لم يُرسلا'],
  [3, `${FSI}3${PDI} تغييرات لم تُرسل`],
  [11, `${FSI}11${PDI} تغييرًا لم يُرسل`],
  [100, `${FSI}100${PDI} تغيير لم يُرسل`],
])('picks the Arabic plural form for %i', (count, text) =>
  expect(formatMessage('ar', cat, 'unsent', { count })).toBe(text)
);
it.each([
  [0, '0 changes not sent'],
  [1, '1 change not sent'],
  [2, '2 changes not sent'],
])('picks the English plural form for %i', (count, text) =>
  expect(formatMessage('en', cat, 'unsent', { count })).toBe(text)
);
it('leaves a missing param as written and returns an unknown key', () => {
  expect(formatMessage('en', cat, 'hi')).toBe('Hello {name}');
  expect(formatMessage('en', cat, 'nope')).toBe('nope');
});
it('maps languages to directions', () => {
  expect(textDirection('en')).toBe('ltr');
  expect(textDirection('ar')).toBe('rtl');
});
describe('the real catalogues', () => {
  const keys = Object.keys(en) as StringKey[];
  const names = (m: Message) =>
    new Set(
      [...(typeof m === 'string' ? [m] : Object.values(m)).join(' ').matchAll(/\{(\w+)\}/g)].map(
        (x) => x[1]
      )
    );
  it('has an Arabic entry for every key', () =>
    expect(keys.filter((k) => ar[k] === undefined)).toEqual([]));
  it('uses no placeholder in Arabic that English lacks, and keeps every non-count one', () => {
    for (const k of keys) {
      const enNames = names(en[k]);
      const forms = typeof ar[k] === 'string' ? [ar[k] as string] : Object.values(ar[k]!);
      for (const form of forms) {
        for (const n of names(form)) expect(enNames, `${k}: {${n}}`).toContain(n);
        for (const n of enNames)
          if (n !== 'count') expect(form, `${k}: {${n}}`).toContain(`{${n}}`);
      }
    }
  });
  it('gives every Arabic plural all six forms', () => {
    for (const k of keys)
      if (typeof en[k] !== 'string')
        expect(Object.keys(ar[k] as object).sort(), k).toEqual([
          'few',
          'many',
          'one',
          'other',
          'two',
          'zero',
        ]);
  });
  it('never leaves Arabic equal to English outside SAME_IN_BOTH', () =>
    expect(
      keys.filter((k) => !SAME_IN_BOTH.has(k) && JSON.stringify(ar[k]) === JSON.stringify(en[k]))
    ).toEqual([]));
});
