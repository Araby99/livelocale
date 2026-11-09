import { createTranslations } from 'livelocale/server';

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

/** One page's translations: `locales/<locale>/<page>.json` plus the shared layout file. */
export function translationsFor(locale: Locale) {
  return createTranslations(locale, { supportedLocales: [...LOCALES], fallbackLocale: 'en' });
}

/** The path of `page` in `locale`: English at the root, Arabic under /ar. */
export function pathFor(locale: Locale, page: '' | 'about'): string {
  const prefix = locale === 'en' ? '' : `/${locale}`;
  return page === '' ? `${prefix}/` : `${prefix}/${page}/`;
}
