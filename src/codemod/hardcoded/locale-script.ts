import { removeAllowed, type AllowList } from './allow-list.js';

/** Languages whose usual writing system is not Latin (primary subtag, lowercase). */
export const NON_LATIN_LANGUAGES: ReadonlySet<string> = new Set(
  (
    'am ar as be bg bn bo ckb dv el fa gu he hi hy ja ka kk km kn ko ky lo mk ml mn mr my ne ' +
    'or pa ps ru sd si ta te tg th ti uk ur ug yi zh'
  ).split(' ')
);

/** Lowercase first subtag of a locale, split on `-` or `_`. */
export function primaryLanguage(locale: string): string {
  return (locale.split(/[-_]/)[0] ?? '').toLowerCase();
}

/** True when the locale is normally written in a non-Latin script. */
export function isNonLatinLocale(locale: string): boolean {
  const script = locale
    .split(/[-_]/)
    .slice(1)
    .find((subtag) => /^[A-Za-z]{4}$/.test(subtag));
  if (script) return script.toLowerCase() !== 'latn';
  return NON_LATIN_LANGUAGES.has(primaryLanguage(locale));
}

/** Order matters: each pattern is replaced with a space before the next runs. */
const MARKUP_PATTERNS: RegExp[] = [
  /\b(?:https?:\/\/|www\.)\S+/g, // URLs
  /[^\s@]+@[^\s@]+\.[^\s@]+/g, // emails
  /\$t\([^)]*\)/g, // i18next nesting
  /<\/?[A-Za-z][^>]*>/g, // tags
  /\{\{[^{}]*\}\}/g, // {{interpolation}}
  /%(?:\d+\$)?[sdif@]/g, // printf
  /\{\s*\w+\s*\}/g, // simple ICU args
  /\{\s*\w+\s*,\s*(?:plural|select|selectordinal|number|date|time)\s*(?:,\s*(?:offset:\d+\s*)?)?/g, // ICU heads
  /(?:=\d+|\w+)\s*\{/g, // ICU selectors
  /[{}#]/g, // leftover ICU punctuation
];

/** Removes placeholders, ICU syntax, URLs, emails and tags, keeping the message text. */
export function stripMarkup(value: string): string {
  let out = value;
  for (const pattern of MARKUP_PATTERNS) out = out.replace(pattern, ' ');
  return out;
}

const textOf = (value: string, allow: AllowList) => removeAllowed(stripMarkup(value), allow);

/** True when any letter remains once markup and allowed words are removed. */
export function hasLetters(value: string, allow: AllowList): boolean {
  return /\p{L}/u.test(textOf(value, allow));
}

/** True when more than half of the remaining letters are Latin. */
export function isMostlyLatin(value: string, allow: AllowList): boolean {
  const text = textOf(value, allow);
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return letters > 0 && latin * 2 > letters;
}
