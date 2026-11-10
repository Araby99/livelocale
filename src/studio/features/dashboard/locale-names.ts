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

const baseOf = (code: string): string => code.split(/[-_]/)[0]?.toLowerCase() || code;

/**
 * The browser's English name for a language ("Dutch" for `nl`), or null. The Studio's copy is
 * English, so the names are too. An invalid code throws, and an unknown one has no name.
 */
const browserLanguageName = (base: string): string | null => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(base) ?? null;
  } catch {
    return null;
  }
};

/**
 * The language name of a locale code ("Arabic" for `ar-EG`): the Studio's own name, else the
 * browser's, else "Custom".
 */
export const getLocaleName = (code: string, t: StudioText): string => {
  const base = baseOf(code);
  const listed = LOCALE_NAMES[base] || LOCALE_NAMES[code];
  if (listed) return t(listed);
  return browserLanguageName(base) ?? t('editor.lang_custom');
};

/** The language name with its code, as in "Arabic (ar)". */
export const getLocaleLabel = (code: string, t: StudioText): string =>
  `${getLocaleName(code, t)} (${code})`;

/**
 * The name of `code` shown next to `other`'s: the plain name, or the name with the code when
 * both are the same language ("English (en-GB)" beside "English (en)").
 */
export const getLocaleNameBeside = (code: string, other: string, t: StudioText): string =>
  code !== other && getLocaleName(code, t) === getLocaleName(other, t)
    ? getLocaleLabel(code, t)
    : getLocaleName(code, t);
