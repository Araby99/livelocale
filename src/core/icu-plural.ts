/**
 * Structured view of an ICU `plural` / `select` / `selectordinal` message so
 * the Studio can edit each branch as its own field.
 *
 * Only messages with exactly one top-level plural-like argument are
 * structured; anything else (plain text, several plurals, broken syntax)
 * returns `null` and is edited as raw text.
 */

export type PluralType = 'plural' | 'select' | 'selectordinal';

export interface PluralBranch {
  /** `one`, `other`, `=0`, `female`, … */
  selector: string;
  /** Branch text, verbatim (may contain `#` and nested arguments). */
  text: string;
}

export interface PluralMessage {
  variable: string;
  type: PluralType;
  offset: string | null;
  /** Text before the argument, verbatim. */
  prefix: string;
  /** Text after the argument, verbatim. */
  suffix: string;
  branches: PluralBranch[];
}

const CATEGORY_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * Advances past an ICU apostrophe-quoted span starting at `i` (which must be
 * an apostrophe). Returns the index after the span, or `i + 1` for a literal
 * apostrophe.
 */
function skipQuote(s: string, i: number): number {
  if (s[i + 1] === "'") return i + 2; // '' → literal apostrophe
  const next = s[i + 1];
  if (next !== '{' && next !== '}' && next !== '#' && next !== '|') return i + 1;
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "'") {
      if (s[j + 1] === "'") {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  return s.length;
}

/** Index of the `}` matching the `{` at `open`, or -1 when unbalanced. */
function matchingBrace(s: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "'") {
      i = skipQuote(s, i);
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** Top-level `{…}` argument spans, or null when braces are unbalanced. */
function topLevelArguments(s: string): { start: number; end: number }[] | null {
  const spans: { start: number; end: number }[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "'") {
      i = skipQuote(s, i);
      continue;
    }
    if (ch === '}') return null;
    if (ch === '{') {
      const end = matchingBrace(s, i);
      if (end === -1) return null;
      spans.push({ start: i, end });
      i = end + 1;
      continue;
    }
    i += 1;
  }
  return spans;
}

const HEADER_RE = /^\s*([\w.]+)\s*,\s*(plural|select|selectordinal)\s*,/;

export function parsePluralMessage(message: string): PluralMessage | null {
  if (typeof message !== 'string') return null;
  const spans = topLevelArguments(message);
  if (!spans) return null;

  const candidates = spans.filter((sp) => HEADER_RE.test(message.slice(sp.start + 1, sp.end)));
  if (candidates.length !== 1) return null;
  const { start, end } = candidates[0]!;
  const inner = message.slice(start + 1, end);
  const header = HEADER_RE.exec(inner)!;
  const variable = header[1]!;
  const type = header[2] as PluralType;

  let pos = header[0].length;
  let offset: string | null = null;
  const branches: PluralBranch[] = [];

  while (pos < inner.length) {
    while (pos < inner.length && /\s/.test(inner[pos]!)) pos += 1;
    if (pos >= inner.length) break;

    let selector = '';
    while (pos < inner.length && !/[\s{]/.test(inner[pos]!)) {
      selector += inner[pos]!;
      pos += 1;
    }
    if (selector.startsWith('offset:')) {
      let value = selector.slice('offset:'.length);
      while (pos < inner.length && /\s/.test(inner[pos]!)) pos += 1;
      if (value === '') {
        while (pos < inner.length && /\d/.test(inner[pos]!)) {
          value += inner[pos]!;
          pos += 1;
        }
      }
      offset = value || null;
      continue;
    }
    while (pos < inner.length && /\s/.test(inner[pos]!)) pos += 1;
    if (!selector || inner[pos] !== '{') return null;
    const close = matchingBrace(inner, pos);
    if (close === -1) return null;
    branches.push({ selector, text: inner.slice(pos + 1, close) });
    pos = close + 1;
  }

  if (branches.length === 0) return null;
  return {
    variable,
    type,
    offset,
    prefix: message.slice(0, start),
    suffix: message.slice(end + 1),
    branches,
  };
}

/** Serializes a structured message back to ICU. Empty branches are dropped, except `other`. */
export function buildPluralMessage(p: PluralMessage): string {
  const parts: string[] = [];
  if (p.offset) parts.push(` offset:${p.offset}`);
  for (const b of p.branches) {
    if (b.text === '' && b.selector !== 'other') continue;
    parts.push(` ${b.selector} {${b.text}}`);
  }
  return `${p.prefix}{${p.variable}, ${p.type},${parts.join('')}}${p.suffix}`;
}

/**
 * CLDR plural categories a locale needs, in canonical order. Cardinal rules
 * for `plural`, ordinal rules for `selectordinal`; `select` has no fixed set.
 */
export function pluralCategoriesFor(locale: string, type: PluralType = 'plural'): string[] {
  if (type === 'select') return [];
  try {
    const rules = new Intl.PluralRules(locale, {
      type: type === 'selectordinal' ? 'ordinal' : 'cardinal',
    });
    const categories = new Set(rules.resolvedOptions().pluralCategories);
    return CATEGORY_ORDER.filter((c) => categories.has(c as Intl.LDMLPluralRule));
  } catch {
    return ['one', 'other'];
  }
}
