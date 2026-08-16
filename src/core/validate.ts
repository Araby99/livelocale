/**
 * Shared validation rules for locale codes, translation keys, and values.
 *
 * Platform-agnostic: used by the server router, FileMutator, and the Studio
 * UI so that every layer enforces exactly the same contract.
 */

export const LOCALE_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,4})?$/;

export const KEY_RE = /^[a-zA-Z0-9._-]+$/;

export const MAX_LOCALE_LENGTH = 10;
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
 * Returns true if `locale` is a 2-10 character code matching the loose
 * standard pattern (supports es-419, zh-Hans, eng, etc.).
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
 * Returns true if `key` is a 1-200 character dot-separated path containing
 * only alphanumerics, dots, underscores, or hyphens.
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
