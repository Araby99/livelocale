/**
 * Placeholder analysis for translation messages.
 *
 * Understands the formats the supported libraries use:
 *   - ICU MessageFormat (next-intl, react-intl, FormatJS): `{name}`, `{count, number}`,
 *     `{count, plural, one {…} other {…}}`, apostrophe quoting.
 *   - i18next: `{{name}}`, `{{count, number}}`, nesting `$t(key)`.
 *   - printf-style: `%s`, `%d`, `%1$s`.
 *   - rich-text tags (react-intl, next-intl `t.rich`, i18next `<Trans>`): `<b>…</b>`, `<0>…</0>`.
 *
 * A placeholder token is a canonical string such as `{name}`, `{{name}}`, `%s` or `<b>`,
 * so two messages can be compared as sets.
 */

const PLURAL_TYPES = new Set(['plural', 'select', 'selectordinal']);

interface ParseResult {
  args: Set<string>;
  error: string | null;
}

/**
 * Removes ICU apostrophe-quoted spans (`'{'`, `'{literal}'`) and turns `''`
 * into a plain apostrophe so the structural scan only sees real syntax.
 */
function unquoteIcu(message: string): string {
  let out = '';
  let i = 0;
  while (i < message.length) {
    const ch = message[i]!;
    if (ch !== "'") {
      out += ch;
      i += 1;
      continue;
    }
    if (message[i + 1] === "'") {
      out += "'";
      i += 2;
      continue;
    }
    const next = message[i + 1];
    if (next === '{' || next === '}' || next === '#' || next === '|') {
      // Quoted span: skip to the closing single apostrophe (doubled ones are literal).
      let j = i + 1;
      while (j < message.length) {
        if (message[j] === "'") {
          if (message[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Recursive-descent walk over ICU structure collecting argument names and the first error. */
function parseIcu(message: string): ParseResult {
  const args = new Set<string>();
  let pos = 0;
  let error: string | null = null;

  const fail = (msg: string) => {
    if (!error) error = msg;
  };

  const parseMessage = (depth: number): void => {
    while (pos < message.length) {
      const ch = message[pos]!;
      if (ch === '{') {
        pos += 1;
        parseArgument(depth + 1);
      } else if (ch === '}') {
        if (depth === 0) {
          fail('Unbalanced braces: unexpected "}"');
          pos += 1;
        } else {
          return; // caller consumes the brace
        }
      } else {
        pos += 1;
      }
    }
    if (depth > 0) fail('Unbalanced braces: missing "}"');
  };

  const readUntil = (stops: string[]): string => {
    let out = '';
    while (pos < message.length && !stops.includes(message[pos]!)) {
      out += message[pos]!;
      pos += 1;
    }
    return out;
  };

  const parseArgument = (depth: number): void => {
    const name = readUntil([',', '}']).trim();
    if (name && !name.includes('{')) args.add(name);
    if (pos >= message.length) {
      fail('Unbalanced braces: missing "}"');
      return;
    }
    if (message[pos] === '}') {
      pos += 1;
      return;
    }
    pos += 1; // ','
    const type = readUntil([',', '}']).trim();
    if (pos >= message.length) {
      fail('Unbalanced braces: missing "}"');
      return;
    }
    if (message[pos] === '}') {
      pos += 1;
      return;
    }
    pos += 1; // ','

    if (PLURAL_TYPES.has(type)) {
      let hasOther = false;
      while (pos < message.length) {
        // skip whitespace
        while (pos < message.length && /\s/.test(message[pos]!)) pos += 1;
        if (message[pos] === '}') {
          pos += 1;
          if (!hasOther) fail(`"${name}" (${type}) has no "other" branch`);
          return;
        }
        const selector = readUntil(['{', '}', ' ', '\t', '\n']).trim();
        while (pos < message.length && /\s/.test(message[pos]!)) pos += 1;
        if (message[pos] !== '{') {
          fail(`"${name}" (${type}): expected "{" after "${selector}"`);
          return;
        }
        if (selector === 'other') hasOther = true;
        pos += 1;
        parseMessage(depth + 1);
        if (message[pos] === '}') pos += 1;
      }
      fail('Unbalanced braces: missing "}"');
      return;
    }

    // number/date/time style, or unknown: skip to the matching brace
    let level = 1;
    while (pos < message.length && level > 0) {
      if (message[pos] === '{') level += 1;
      else if (message[pos] === '}') level -= 1;
      pos += 1;
    }
    if (level > 0) fail('Unbalanced braces: missing "}"');
  };

  parseMessage(0);
  return { args, error };
}

const I18NEXT_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;
const NESTING_RE = /\$t\([^)]*\)/g;
const PRINTF_RE = /%(?:\d+\$)?[-+ 0#]*\d*(?:\.\d+)?[sdifgxXoc]/g;
const TAG_RE = /<\/?([A-Za-z][\w-]*|\d+)\b[^<>]*>/g;

/** Returns the sorted, de-duplicated placeholder tokens found in `message`. */
export function extractPlaceholders(message: string): string[] {
  if (typeof message !== 'string' || message === '') return [];
  const tokens = new Set<string>();

  // i18next interpolation first, then blank it out so the ICU scan does not see `{{`.
  const withoutI18next = message.replace(I18NEXT_RE, (_m, inner: string) => {
    const name = inner.split(',')[0]!.trim();
    if (name) tokens.add(`{{${name}}}`);
    return ' ';
  });

  for (const m of withoutI18next.match(NESTING_RE) ?? []) tokens.add(m);
  for (const m of withoutI18next.replace(/%%/g, '').match(PRINTF_RE) ?? []) tokens.add(m);
  for (const m of withoutI18next.matchAll(TAG_RE)) tokens.add(`<${m[1]}>`);

  const icu = parseIcu(unquoteIcu(withoutI18next.replace(TAG_RE, ' ')));
  for (const arg of icu.args) tokens.add(`{${arg}}`);

  return Array.from(tokens).sort();
}

export interface PlaceholderComparison {
  ok: boolean;
  /** Present in the reference but not in the value. */
  missing: string[];
  /** Present in the value but not in the reference. */
  extra: string[];
}

/** Compares placeholder sets; an empty reference is compatible with anything. */
export function comparePlaceholders(
  reference: string | undefined | null,
  value: string
): PlaceholderComparison {
  if (!reference) return { ok: true, missing: [], extra: [] };
  const ref = new Set(extractPlaceholders(reference));
  const val = new Set(extractPlaceholders(value));
  const missing = Array.from(ref).filter((t) => !val.has(t));
  const extra = Array.from(val).filter((t) => !ref.has(t));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/** Returns a description of the first ICU structural problem, or null when the message is sound. */
export function validateMessageSyntax(message: string): string | null {
  if (typeof message !== 'string') return null;
  const prepared = unquoteIcu(message.replace(I18NEXT_RE, ' ').replace(TAG_RE, ' '));
  return parseIcu(prepared).error;
}
