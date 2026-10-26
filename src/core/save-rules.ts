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

export type ContentRiskFlag = 'markup' | 'javascript-url' | 'new-url' | 'bidi-control';

export const RISK_FLAG_MESSAGES: Record<ContentRiskFlag, string> = {
  markup: 'Adds markup that the source text does not have.',
  'javascript-url': 'Adds a javascript:, vbscript: or data: link.',
  'new-url': 'Adds a web address that the source text does not have.',
  'bidi-control': 'Contains invisible text-direction control characters.',
};

// Global patterns are only ever read through String.match and String.matchAll,
// which never leave state behind on a shared regex. No lookbehind: the core
// must run in every browser the Studio supports.
const TAG_PATTERN = /<\/?([A-Za-z][\w-]*)\b[^<>]*>/g;
const SCRIPT_LINK_PATTERNS = [/\b(?:javascript|vbscript)\s*:/i, /\bdata:[a-z]+\/[\w.+-]+/i];
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
// U+202A-U+202E (embeddings and overrides) and U+2066-U+2069 (isolates).
// LRM and RLM are ordinary Arabic and Hebrew typography, so they are left out.
const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/g;

/** Tag names are case-insensitive in HTML, so `<B>` and `<b>` are one name. */
const tagNames = (text: string): string[] =>
  Array.from(text.matchAll(TAG_PATTERN), (m) => m[1]!.toLowerCase());

const allMatches = (pattern: RegExp, text: string): string[] => text.match(pattern) ?? [];

/** True when `found` holds an item that `known` lacks. */
const hasNew = (known: string[], found: string[]): boolean => {
  const set = new Set(known);
  return found.some((item) => !set.has(item));
};

/**
 * Flags only what `value` adds compared with `reference`, in the order of
 * the union above, each at most once. A missing reference counts as empty,
 * so a source-locale edit or a new key is judged against nothing. Flags warn
 * a reviewer; they never reject a write.
 */
export function detectRiskFlags(reference: string | undefined, value: string): ContentRiskFlag[] {
  const ref = reference ?? '';
  const flags: ContentRiskFlag[] = [];

  if (hasNew(tagNames(ref), tagNames(value))) flags.push('markup');

  // Each pattern is checked on its own, so a reference holding a data: link
  // does not excuse a new javascript: link.
  if (SCRIPT_LINK_PATTERNS.some((pattern) => pattern.test(value) && !pattern.test(ref))) {
    flags.push('javascript-url');
  }

  if (hasNew(allMatches(URL_PATTERN, ref), allMatches(URL_PATTERN, value))) flags.push('new-url');

  if (hasNew(allMatches(BIDI_CONTROL_PATTERN, ref), allMatches(BIDI_CONTROL_PATTERN, value))) {
    flags.push('bidi-control');
  }

  return flags;
}
