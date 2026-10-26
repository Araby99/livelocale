/**
 * The write rules every translation save must pass, in one browser-safe place.
 *
 * The mutation router, the Studio's static transport and `livelocale apply`
 * all call `validateWrite`, so a value accepted by one is accepted by all.
 * `validateEdit` adds what a write needs when its caller holds the locale
 * files: the reference from the source locale and the structure guard.
 */

import { lookupKey } from './json-path.js';
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

const reject = (
  status: WriteRejected['status'],
  code: WriteRuleCode,
  error: string
): WriteRejected => ({
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

/** The locale files an edit is checked against. */
export interface SourceContext {
  /** apply: its --source argument; Studio: manifest.sourceLocale. */
  sourceLocale: string;
  /** The source-locale dictionary as stored (namespaces merged under their names). */
  source: Record<string, unknown>;
  /** The edit locale's dictionary; omitted when that locale has no file. */
  target?: Record<string, unknown>;
}

/** The string at `key` in ctx.source, else null. For a source-locale edit this is its current text. */
export function sourceReference(key: string, ctx: SourceContext): string | null {
  const found = lookupKey(ctx.source, key);
  return found.state === 'string' ? found.value : null;
}

/**
 * Checks one edit against the locale files: the format rules, then the
 * structure guard (409, which `force` cannot override), then message syntax
 * and placeholder parity against `sourceReference` unless `options.force`.
 * The reference is always recomputed here; any `reference` or `force`
 * carried on `edit` is ignored.
 */
export function validateEdit(
  edit: { locale: string; key: string; value: string },
  ctx: SourceContext,
  options?: { force?: boolean }
): WriteVerdict {
  const { locale, key, value } = edit;
  const input = { locale, key, value };

  // `force` skips only the 422 rules, so this runs the format rules alone.
  const format = validateWrite(input, { force: true });
  if (!format.ok) return format;

  const dict = locale === ctx.sourceLocale ? ctx.source : (ctx.target ?? {});
  if (lookupKey(dict, key).state === 'occupied') {
    return reject(
      409,
      'KEY_NOT_A_STRING',
      `Cannot save "${key}" in ${locale}: it would replace translations that are not a single text.`
    );
  }

  return validateWrite(input, {
    reference: sourceReference(key, ctx),
    force: options?.force === true,
  });
}
