import type { StringKey, StudioText } from '../../i18n/catalogue.js';

const LOCALE_NAMES: Readonly<Record<string, StringKey>> = {
  en: 'editor.lang_en',
  ar: 'editor.lang_ar',
  es: 'editor.lang_es',
  fr: 'editor.lang_fr',
  de: 'editor.lang_de',
  zh: 'editor.lang_zh',
  ja: 'editor.lang_ja',
  pt: 'editor.lang_pt',
  it: 'editor.lang_it',
  ru: 'editor.lang_ru',
  hi: 'editor.lang_hi',
  tr: 'editor.lang_tr',
};

/** The language name of a locale code ("Arabic" for `ar-EG`), or "Custom" when unknown. */
export const getLocaleName = (code: string, t: StudioText): string => {
  const base = code.split('-')[0]?.toLowerCase() || code;
  return t(LOCALE_NAMES[base] || LOCALE_NAMES[code] || 'editor.lang_custom');
};

/** The language name with its code, as in "Arabic (ar)". */
export const getLocaleLabel = (code: string, t: StudioText): string =>
  `${getLocaleName(code, t)} (${code})`;
