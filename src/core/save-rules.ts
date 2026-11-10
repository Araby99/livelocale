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

/** The 409 wording for a key that holds more than one text, shared by every save path. */
export const keyNotAStringMessage = (key: string, locale: string): string =>
  `Cannot save "${key}" in ${locale}: it would replace translations that are not a single text.`;

/** The 409 wording for a key whose first segment names no namespace file in any locale. */
export const namespaceNotFoundMessage = (namespace: string): string =>
  `No language has a "${namespace}" namespace file (${namespace}.json), so this text cannot be saved there. ` +
  `If it comes from useTranslation() without a namespace, give wrapTranslationEngine that namespace as keyPrefix.`;

/** The 400 wording for a key that names a whole namespace file instead of a key inside it. */
export const namespaceKeyRequiredMessage = (key: string): string =>
  `Cannot save "${key}": in this project every key starts with its namespace file name, like common.title.`;

/**
 * Thrown by a translation store when the files themselves refuse a write that
 * passed `validateWrite`. The router answers with `status`, `code` and the
 * message as they are.
 */
export class SaveRefusedError extends Error {
  readonly status: 400 | 409;
  readonly code: WriteRuleCode | 'NAMESPACE_NOT_FOUND';

  constructor(status: 400 | 409, code: WriteRuleCode | 'NAMESPACE_NOT_FOUND', message: string) {
    super(message);
    this.name = 'SaveRefusedError';
    this.status = status;
    this.code = code;
  }
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
    return reject(409, 'KEY_NOT_A_STRING', keyNotAStringMessage(key, locale));
  }

  return validateWrite(input, {
    reference: sourceReference(key, ctx),
    force: options?.force === true,
  });
}

export type ContentRiskFlag = 'markup' | 'javascript-url' | 'new-url' | 'bidi-control';

export const RISK_FLAG_MESSAGES: Record<ContentRiskFlag, string> = {
  markup: 'Adds tags, or tag attributes, that the source text does not have.',
  'javascript-url': 'Adds a javascript:, vbscript: or data: link.',
  'new-url': 'Adds a web address that the source text does not have.',
  'bidi-control': 'Contains invisible text-direction control characters.',
};

// Global patterns are only ever read through String.match and String.matchAll,
// which never leave state behind on a shared regex. No lookbehind: the core
// must run in every browser the Studio supports.
// A browser reads a quoted attribute value to its closing quote, `<` and `>` included, so
// `title="<"` must not end the tag early and hide what follows. A quote opens a value only
// right after `=`; anywhere else it is an ordinary character, as in `alt=it's`. The four
// alternatives never start on the same character, so matching stays linear.
const TAG_PATTERN = /<(\/?)([A-Za-z][\w-]*)\b((?:=\s*"[^"]*"|=\s*'[^']*'|=(?!\s*["'])|[^<>=])*)>/g;
const ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
// Attributes whose value can run script, load something or cover the page. A change
// to their value is flagged; other attributes (title, alt, class) may be translated.
const ACTIVE_ATTRIBUTE_PATTERN =
  /^(?:on.*|style|href|src|srcset|srcdoc|action|formaction|xlink:href|poster|background|data|codebase|content|ping)$/;
const SCRIPT_LINK_PATTERNS = [/\b(?:javascript|vbscript)\s*:/i, /\bdata:[a-z]+\/[\w.+-]+/i];
// A protocol-relative address (`//host/path`) loads from another site just like https://.
// It must follow a start, a space, a quote, `=` or `(`, so `https://` and prose `a // b`
// do not count, and it needs a dotted host.
const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>"')]+|(?:^|[\s"'=(])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"')]*/gi;
// U+202A-U+202E (embeddings and overrides) and U+2066-U+2069 (isolates).
// LRM and RLM are ordinary Arabic and Hebrew typography, so they are left out.
const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  colon: ':',
  gt: '>',
  lpar: '(',
  lt: '<',
  NewLine: '\n',
  period: '.',
  quot: '"',
  rpar: ')',
  sol: '/',
  Tab: '\t',
};

/**
 * Decodes the HTML character references a browser would decode in a value rendered as
 * HTML, so `java&#115;cript:` reads as `javascript:`. The semicolon is optional, as in HTML.
 */
const decodeEntities = (text: string): string =>
  text
    .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (whole, hex?: string, dec?: string) => {
      const code = hex ? parseInt(hex, 16) : Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    })
    .replace(/&([A-Za-z]+);/g, (whole, name: string) => NAMED_ENTITIES[name] ?? whole);

/**
 * A text as a browser reads it when it is a link: decoded, and without tabs and line
 * breaks, which the URL parser drops anywhere. Only for text that is a link as a whole
 * (an attribute value, or a translation used as an `href`): in prose, dropping a line
 * break would glue a word to the address after it.
 */
const asUrl = (text: string): string => decodeEntities(text).replace(/[\t\n\r]/g, '');

interface TagScan {
  /** One per tag: see `tagSignature`. */
  signatures: string[];
  /** The raw value of every active attribute, in order. */
  activeValues: string[];
}

/**
 * Reads every tag. A signature holds the tag's lowercase name, every attribute name, and
 * the value of each active attribute as a link, in a fixed order. So the same tag written
 * with other quotes, case or attribute order matches, while an added `onmouseover` or a
 * new `href` does not.
 */
const scanTags = (text: string): TagScan => {
  const scan: TagScan = { signatures: [], activeValues: [] };
  for (const tag of text.matchAll(TAG_PATTERN)) {
    const attributes = Array.from(tag[3]!.matchAll(ATTRIBUTE_PATTERN), (m) => {
      const attrName = m[1]!.toLowerCase();
      if (!ACTIVE_ATTRIBUTE_PATTERN.test(attrName)) return attrName;
      const raw = m[2] ?? m[3] ?? m[4] ?? '';
      scan.activeValues.push(raw);
      return `${attrName}=${asUrl(raw).trim()}`;
    }).sort();
    scan.signatures.push([tag[1]! + tag[2]!.toLowerCase(), ...attributes].join(' '));
  }
  return scan;
};

const allMatches = (pattern: RegExp, text: string): string[] => text.match(pattern) ?? [];

/** Scheme (or `www.` or `//`) and host, then the rest of the address. */
const URL_PARTS_PATTERN = /^((?:https?:\/\/|www\.|\/\/)[^/?#]*)(.*)$/i;

/**
 * One address as compared: without trailing sentence punctuation, with the
 * scheme and host (which are case-insensitive) lowercased. The path keeps its
 * case, because servers may treat `/A` and `/a` as different pages.
 */
const normalizeUrl = (url: string): string => {
  // A protocol-relative match carries the character before its `//`.
  const trimmed = url.replace(/^[\s"'=(]/, '').replace(/[.,;:!?]+$/, '');
  const parts = URL_PARTS_PATTERN.exec(trimmed);
  return parts ? parts[1]!.toLowerCase() + parts[2]! : trimmed;
};

const urls = (text: string): string[] => allMatches(URL_PATTERN, text).map(normalizeUrl);

/** True when `found` holds an item that `known` lacks. */
const hasNew = (known: string[], found: string[]): boolean => {
  const set = new Set(known);
  return found.some((item) => !set.has(item));
};

/**
 * Flags only what `value` adds compared with `reference`, in the order of
 * the union above, each at most once. A missing reference (a key the source
 * locale lacks) counts as empty, so everything in `value` is new. This only
 * reports; what a flag blocks, if anything, is the caller's decision.
 */
export function detectRiskFlags(reference: string | undefined, value: string): ContentRiskFlag[] {
  const ref = reference ?? '';
  const flags: ContentRiskFlag[] = [];

  const refTags = scanTags(ref);
  const valueTags = scanTags(value);
  if (hasNew(refTags.signatures, valueTags.signatures)) flags.push('markup');

  // Addresses are read from the decoded text and from every active attribute value as a
  // link. Each side pools what all its readings find, so an address the reference has in
  // any reading is never new.
  const linkTexts = (text: string, tags: TagScan): string[] => [
    decodeEntities(text),
    ...tags.activeValues.map(asUrl),
  ];
  const refLinks = linkTexts(ref, refTags);
  const valueLinks = linkTexts(value, valueTags);
  // A translation can itself be an `href`, so schemes are also read from the whole text
  // as a link: `java<tab>script:` then reads as `javascript:`.
  const refSchemeTexts = [...refLinks, asUrl(ref)];
  const valueSchemeTexts = [...valueLinks, asUrl(value)];

  // Each pattern is checked on its own, so a reference holding a data: link
  // does not excuse a new javascript: link.
  if (
    SCRIPT_LINK_PATTERNS.some(
      (pattern) =>
        valueSchemeTexts.some((text) => pattern.test(text)) &&
        !refSchemeTexts.some((text) => pattern.test(text))
    )
  ) {
    flags.push('javascript-url');
  }

  if (hasNew(refLinks.flatMap(urls), valueLinks.flatMap(urls))) flags.push('new-url');

  if (hasNew(allMatches(BIDI_CONTROL_PATTERN, ref), allMatches(BIDI_CONTROL_PATTERN, value))) {
    flags.push('bidi-control');
  }

  return flags;
}
