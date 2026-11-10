// @vitest-environment node
import * as fs from 'node:fs';
import i18next from 'i18next';
import { expect, it } from 'vitest';
import { parsePluralMessage, pluralCategoriesFor } from '../../../src/core/icu-plural.js';
import { comparePlaceholders } from '../../../src/core/placeholders.js';
import { formatMessage, icuFormat } from '../../../site/stage/icu';

// The public demo (Tidewell) is where people try the product, so it has to show the placeholder
// chip and the plural editor: one string with a {placeholder} and one ICU plural, in English and
// Arabic.

type Messages = Record<string, any>;
const read = (locale: string) =>
  JSON.parse(fs.readFileSync(`site/stage/locales/${locale}.json`, 'utf8')) as Messages;
const en = read('en');
const ar = read('ar');

it('has a placeholder string the Studio guards, the same in both locales', () => {
  expect(en.footer.copyright).toBe('© {year} Tidewell Labs');
  expect(ar.footer.copyright).toContain('{year}');
  expect(comparePlaceholders(en.footer.copyright, ar.footer.copyright).ok).toBe(true);
});

it('has an ICU plural the editor opens with every form the locale needs', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['ar', ar],
  ] as const) {
    const plural = parsePluralMessage(messages.plans.studio.f2);
    expect(plural, locale).not.toBeNull();
    expect(plural!.variable).toBe('count');
    // English needs one and other; Arabic zero, one, two, few, many and other.
    expect(plural!.branches.map((b) => b.selector)).toEqual(pluralCategoriesFor(locale));
  }
  expect(pluralCategoriesFor('ar')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
  expect(comparePlaceholders(en.plans.studio.f2, ar.plans.studio.f2).ok).toBe(true);
});

it('renders the demo page as before: 5 people and the year', () => {
  expect(formatMessage(en.plans.studio.f2, { count: 5 }, 'en')).toBe('Time tracking for 5 people');
  expect(formatMessage(en.plans.studio.f2, { count: 1 }, 'en')).toBe('Time tracking for 1 person');
  expect(formatMessage(en.footer.copyright, { year: 2026 }, 'en')).toBe('© 2026 Tidewell Labs');
  // The Arabic copy writes Arabic-Indic digits (١٤ يومًا), so the numbers follow suit.
  expect(formatMessage(ar.plans.studio.f2, { count: 5 }, 'ar')).toBe('تتبع الوقت لـ٥ أشخاص');
  expect(formatMessage(ar.plans.studio.f2, { count: 2 }, 'ar')).toBe('تتبع الوقت لشخصين');
  expect(formatMessage(ar.plans.studio.f2, { count: 11 }, 'ar')).toBe('تتبع الوقت لـ١١ شخصًا');
  expect(formatMessage(ar.footer.copyright, { year: 2026 }, 'ar')).toBe('© ٢٠٢٦ تايدويل لابز');
});

it('formats exact matches, leaves unknown arguments and plain text alone', () => {
  expect(formatMessage('{n, plural, =0 {none} one {# item} other {# items}}', { n: 0 }, 'en')).toBe(
    'none'
  );
  expect(formatMessage('Hi {name}', {}, 'en')).toBe('Hi {name}');
  expect(formatMessage('Plain text', { count: 3 }, 'en')).toBe('Plain text');
});

it('runs inside i18next, keeping the key the page used', async () => {
  const instance = i18next.createInstance().use(icuFormat);
  await instance.init({
    lng: 'ar',
    fallbackLng: 'en',
    resources: { en: { translation: en }, ar: { translation: ar } },
  });
  expect(instance.t('plans.studio.f2', { count: 5 })).toBe('تتبع الوقت لـ٥ أشخاص');
  // hero.cta is missing from ar.json on purpose: the fallback still comes through.
  expect(instance.t('hero.cta')).toBe('Start free trial');
  const details = instance.t('plans.studio.f2', { count: 5, returnDetails: true }) as unknown as {
    exactUsedKey: string;
  };
  expect(details.exactUsedKey).toBe('plans.studio.f2');
});

it('passes the count and the year on the demo page', () => {
  const page = fs.readFileSync('site/stage/main.tsx', 'utf8');
  expect(page).toContain('.use(icuFormat)');
  expect(page).toMatch(/<Plan t=\{t\} id="studio" featured seats=\{5\} \/>/);
  expect(page).toMatch(/t\('footer\.copyright', \{ year: \w+ \}\)/);
});
