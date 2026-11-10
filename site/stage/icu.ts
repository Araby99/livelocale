// i18next does not read ICU messages on its own (that takes i18next-icu). The demo uses only two
// pieces of ICU, so this small formatter covers them without another dependency: a `{name}`
// argument, and a `{count, plural, ...}` argument with `#` for the number. They are there so the
// share Studio can show its placeholder chip and its plural editor on the public demo.

type Values = Record<string, unknown>;

/** Index of the `}` that closes the `{` at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

function formatNumber(value: number, lng: string): string {
  // The demo's Arabic copy writes Arabic-Indic digits (١٤ يومًا), so its numbers do too. No
  // grouping, so a year reads 2026, not 2,026.
  return new Intl.NumberFormat(lng, {
    numberingSystem: lng === 'ar' ? 'arab' : undefined,
    useGrouping: false,
  }).format(value);
}

/** The branch of a plural's `one {…} other {…}` list that `count` picks. */
function pickBranch(branches: string, count: number, lng: string): string | null {
  const found = new Map<string, string>();
  let i = 0;
  while (i < branches.length) {
    const head = /^\s*(=?[\w]+)\s*\{/.exec(branches.slice(i));
    if (!head) break;
    const open = i + head[0].length - 1;
    const close = closing(branches, open);
    if (close < 0) return null;
    found.set(head[1]!, branches.slice(open + 1, close));
    i = close + 1;
  }
  return (
    found.get(`=${count}`) ??
    found.get(new Intl.PluralRules(lng).select(count)) ??
    found.get('other') ??
    null
  );
}

/** Formats `message` for `lng`. Anything it does not understand is left as written. */
export function formatMessage(message: string, values: Values, lng: string): string {
  let out = '';
  let i = 0;
  while (i < message.length) {
    const open = message.indexOf('{', i);
    const close = open < 0 ? -1 : closing(message, open);
    if (close < 0) break;
    out += message.slice(i, open);
    const inner = message.slice(open + 1, close);
    const plural = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
    const simple = /^\s*(\w+)\s*$/.exec(inner);
    const value = values[(plural ?? simple)?.[1] ?? ''];
    if (plural && typeof value === 'number') {
      const branch = pickBranch(plural[2]!, value, lng);
      out +=
        branch === null
          ? message.slice(open, close + 1)
          : formatMessage(branch.replace(/#/g, formatNumber(value, lng)), values, lng);
    } else if (simple && value !== undefined) {
      out += typeof value === 'number' ? formatNumber(value, lng) : String(value);
    } else {
      out += message.slice(open, close + 1);
    }
    i = close + 1;
  }
  return out + message.slice(i);
}

/** An i18next format plugin: i18next looks the key up, this fills the message in. */
export const icuFormat = {
  type: 'i18nFormat' as const,
  parse(res: unknown, values: Values, lng: string): unknown {
    return typeof res === 'string' ? formatMessage(res, values, lng) : res;
  },
};
