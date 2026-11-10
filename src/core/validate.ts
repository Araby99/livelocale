/**
 * Shared validation rules for locale codes, translation keys, and values.
 *
 * Platform-agnostic: used by the server router, FileMutator, and the Studio
 * UI so that every layer enforces exactly the same contract.
 */

/**
 * A BCP 47 style code of up to three subtags: en, pt-BR, es-419, zh-Hant-TW, sr-Latn-RS. The
 * underscore form (pt_BR, zh_Hant_TW) that Android, Java and gettext projects use is accepted
 * too, with one separator throughout. A code is also a file or folder name, so it never holds a
 * dot, slash or space.
 */
export const LOCALE_RE =
  /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,4}(?:-[a-zA-Z0-9]{2,4})?|_[a-zA-Z0-9]{2,4}(?:_[a-zA-Z0-9]{2,4})?)?$/;

/**
 * One key segment: letters and digits of any script (and the marks Hindi or Arabic words need),
 * `_`, `-`, and single spaces between words, so i18next natural-language keys such as
 * "Hello world" fit. The first segment can name a namespace file, so a segment never holds a
 * slash, colon, dot or other path character.
 */
const KEY_SEGMENT = '[\\p{L}\\p{M}\\p{N}_-]+(?: [\\p{L}\\p{M}\\p{N}_-]+)*';

/** Dot-separated segments, none of them empty (the same shape the KeyScanner accepts). */
export const KEY_RE = new RegExp(`^${KEY_SEGMENT}(?:\\.${KEY_SEGMENT})*$`, 'u');

/** The longest code LOCALE_RE accepts: a 3-letter language and two 4-character subtags. */
export const MAX_LOCALE_LENGTH = 13;
export const MAX_KEY_LENGTH = 200;
export const MAX_VALUE_LENGTH = 10000;

/**
 * Object-prototype member names that must never be used as translation key
 * segments. Assigning through these bypasses own-property checks and can
 * pollute `Object.prototype` process-wide (prototype pollution).
 */
export const DANGEROUS_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Returns true if no segment of the dot-separated `key` is a dangerous
 * object-prototype member name.
 */
export function isSafeKeyPath(key: unknown): boolean {
  if (typeof key !== 'string') return false;
  return !key.split('.').some((segment) => DANGEROUS_KEY_SEGMENTS.has(segment));
}

/**
 * Returns true if `locale` is a 2-13 character code matching LOCALE_RE
 * (en, eng, es-419, zh-Hans, pt_BR, zh-Hant-TW, ...).
 */
export function isValidLocaleFormat(locale: unknown): boolean {
  return (
    typeof locale === 'string' &&
    locale.length >= 2 &&
    locale.length <= MAX_LOCALE_LENGTH &&
    LOCALE_RE.test(locale)
  );
}

/**
 * Returns true if `key` is a 1-200 character dot-separated path matching KEY_RE:
 * letters, digits, underscores, hyphens and single inner spaces, with no empty segment.
 */
export function isValidKeyFormat(key: unknown): boolean {
  return (
    typeof key === 'string' && key.length >= 1 && key.length <= MAX_KEY_LENGTH && KEY_RE.test(key)
  );
}

/**
 * Returns true if `value` is a string no longer than MAX_VALUE_LENGTH.
 */
export function isValidValueFormat(value: unknown): boolean {
  return typeof value === 'string' && value.length <= MAX_VALUE_LENGTH;
}

/**
 * Rejects locale identifiers that could escape the locales directory.
 */
export function isSafeLocaleSegment(locale: string): boolean {
  return !(
    locale.includes('..') ||
    locale.includes('/') ||
    locale.includes('\\') ||
    locale.includes('%') ||
    locale.includes('\0')
  );
}
