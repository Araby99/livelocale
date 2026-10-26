/**
 * The write rules every translation save must pass, in one browser-safe place.
 *
 * The mutation router, the Studio's static transport and `livelocale apply`
 * all call `validateWrite`, so a value accepted by one is accepted by all.
 */

import { comparePlaceholders, validateMessageSyntax } from './placeholders.js';
import {
  isSafeKeyPath,
  isValidKeyFormat,
  isValidLocaleFormat,
  isValidValueFormat,
} from './validate.js';

export type WriteRuleCode =
  | 'INVALID_LOCALE_FORMAT'
  | 'INVALID_KEY_FORMAT'
  | 'INVALID_VALUE_FORMAT'
  | 'MESSAGE_SYNTAX'
  | 'PLACEHOLDER_MISMATCH'
  | 'KEY_NOT_A_STRING';

export interface WriteAccepted {
  ok: true;
  locale: string;
  key: string;
  value: string;
}

export interface WriteRejected {
  ok: false;
  /** 422 means that `force` would let the write through. */
  status: 400 | 409 | 422;
  code: WriteRuleCode;
  error: string;
  /** Only for PLACEHOLDER_MISMATCH. */
  details?: { missing: string[]; extra: string[] };
}

export type WriteVerdict = WriteAccepted | WriteRejected;

export interface WriteRuleOptions {
  /** Text whose placeholders the value must keep. null, undefined or '' skips the parity check. */
  reference?: string | null;
  /** Skips only the 422 rules (syntax and parity). The format rules always apply. */
  force?: boolean;
}

const reject = (status: 400 | 422, code: WriteRuleCode, error: string): WriteRejected => ({
  ok: false,
  status,
  code,
  error,
});

/**
 * Checks one write in a fixed order: locale, key format, key safety, value,
 * then (unless forced) message syntax and placeholder parity. Returns the
 * first rule that fails, or the narrowed write.
 */
export function validateWrite(
  input: { locale: unknown; key: unknown; value: unknown },
  options: WriteRuleOptions = {}
): WriteVerdict {
  const { locale, key, value } = input;

  if (!isValidLocaleFormat(locale)) {
    return reject(400, 'INVALID_LOCALE_FORMAT', 'Invalid locale string parameter.');
  }

  if (!isValidKeyFormat(key)) {
    return reject(
      400,
      'INVALID_KEY_FORMAT',
      'Invalid key path. Must be 1-200 characters containing alphanumeric, dots, underscores, or hyphens.'
    );
  }

  if (!isSafeKeyPath(key)) {
    return reject(
      400,
      'INVALID_KEY_FORMAT',
      'Forbidden key path: segments like __proto__, constructor, or prototype are not allowed.'
    );
  }

  if (!isValidValueFormat(value)) {
    return reject(
      400,
      'INVALID_VALUE_FORMAT',
      'Invalid value. Must be a string less than 10000 characters.'
    );
  }

  const accepted: WriteAccepted = {
    ok: true,
    locale: locale as string,
    key: key as string,
    value: value as string,
  };

  // RULE SRV-007: PLACEHOLDER SAFETY — a translation must keep the placeholders
  // of its reference and stay structurally valid, unless the author forces it.
  if (options.force === true) return accepted;

  const syntaxError = validateMessageSyntax(accepted.value);
  if (syntaxError) {
    return reject(422, 'MESSAGE_SYNTAX', `Message syntax: ${syntaxError}.`);
  }

  // An empty, null or undefined reference is compatible with any value.
  const comparison = comparePlaceholders(options.reference, accepted.value);
  if (!comparison.ok) {
    const parts: string[] = [];
    if (comparison.missing.length) parts.push(`missing ${comparison.missing.join(', ')}`);
    if (comparison.extra.length) parts.push(`unexpected ${comparison.extra.join(', ')}`);
    return {
      ...reject(
        422,
        'PLACEHOLDER_MISMATCH',
        `Placeholders differ from the reference: ${parts.join('; ')}.`
      ),
      details: { missing: comparison.missing, extra: comparison.extra },
    };
  }

  return accepted;
}
