/**
 * Fills a previewed message's arguments the way the page filled them.
 *
 * The Studio sends the raw message a translator types (`{count, plural, one {# seat} other
 * {# seats}}`, `© {year} Acme`, i18next's `{{name}}`), but the page shows it formatted. The
 * values are not sent anywhere, so they are read back from the page: a message the page may be
 * showing (the stored value, or the value a save left in that node) is matched
 * against the text the page shows now, which gives each argument's value, the plural count and
 * the branch each choice took. The typed message is then formatted with them. An argument that
 * cannot be recovered stays as written (`{name}`), which a translator reads more easily than a
 * guess.
 *
 * Matching walks the message's literal text left to right with `indexOf`, so its cost is linear
 * in the page text whatever the message: it runs on every keystroke, in the page.
 */

type Choice = 'plural' | 'selectordinal' | 'select';

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'arg'; name: string; raw: string }
  | { kind: 'hash' }
  | { kind: 'choice'; name: string; type: Choice; offset: number; branches: Map<string, Token[]> };

/** Most branch combinations tried when matching a message against the page. */
const MAX_EXPANSIONS = 64;

class Parser {
  private i = 0;
  /** ICU apostrophe quoting; i18next messages (`{{name}}`) have none: `'{{name}}'` is text. */
  private readonly quoting: boolean;

  constructor(private readonly s: string) {
    this.quoting = !s.includes('{{');
  }

  /** Parses the whole message, or returns null when it is not well formed. */
  parse(): Token[] | null {
    try {
      const tokens = this.message(false, false);
      return this.i === this.s.length ? tokens : null;
    } catch {
      return null;
    }
  }

  private message(inBranch: boolean, inPlural: boolean): Token[] {
    const tokens: Token[] = [];
    let text = '';
    const flush = () => {
      if (text) tokens.push({ kind: 'text', text });
      text = '';
    };
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if (c === '}') {
        if (!inBranch) throw new Error('unbalanced');
        break;
      }
      if (c === "'" && this.quoting) {
        text += this.quoted(inPlural);
      } else if (c === '#' && inPlural) {
        flush();
        tokens.push({ kind: 'hash' });
        this.i++;
      } else if (c === '{') {
        flush();
        tokens.push(this.argument());
      } else {
        text += c;
        this.i++;
      }
    }
    flush();
    return tokens;
  }

  /** ICU quoting: `''` is one apostrophe, `'{'` quotes syntax; any other apostrophe is text. */
  private quoted(inPlural: boolean): string {
    const s = this.s;
    const next = s[this.i + 1];
    if (next === "'") {
      this.i += 2;
      return "'";
    }
    if (next === '{' || next === '}' || (next === '#' && inPlural)) {
      const end = s.indexOf("'", this.i + 1);
      const stop = end === -1 ? s.length : end;
      const text = s.slice(this.i + 1, stop);
      this.i = end === -1 ? s.length : end + 1;
      return text;
    }
    this.i++;
    return "'";
  }

  private argument(): Token {
    const s = this.s;
    const start = this.i;
    if (s[this.i + 1] === '{') {
      // i18next: {{name}} or {{name, format}}.
      const end = s.indexOf('}}', this.i + 2);
      if (end === -1) throw new Error('unclosed');
      this.i = end + 2;
      const name = s
        .slice(start + 2, end)
        .split(',')[0]!
        .trim();
      return { kind: 'arg', name, raw: s.slice(start, this.i) };
    }
    this.i++;
    this.space();
    const name = this.word();
    if (!name) throw new Error('no name');
    this.space();
    if (s[this.i] === '}') {
      this.i++;
      return { kind: 'arg', name, raw: s.slice(start, this.i) };
    }
    if (s[this.i] !== ',') throw new Error('bad argument');
    this.i++;
    this.space();
    const type = this.word();
    this.space();
    if (type !== 'plural' && type !== 'selectordinal' && type !== 'select') {
      // {n, number}, {d, date, short}: shown as recovered, never re-formatted.
      this.skipBalanced();
      return { kind: 'arg', name, raw: s.slice(start, this.i) };
    }
    if (s[this.i] !== ',') throw new Error('bad choice');
    this.i++;
    this.space();
    let offset = 0;
    const offsetMatch = /^offset:\s*(\d+)/.exec(s.slice(this.i));
    if (offsetMatch && type !== 'select') {
      offset = Number(offsetMatch[1]);
      this.i += offsetMatch[0].length;
      this.space();
    }
    const branches = new Map<string, Token[]>();
    while (s[this.i] !== '}') {
      const selector = this.word();
      if (!selector) throw new Error('bad selector');
      this.space();
      if (s[this.i] !== '{') throw new Error('bad branch');
      this.i++;
      branches.set(selector, this.message(true, type !== 'select'));
      if (s[this.i] !== '}') throw new Error('unclosed branch');
      this.i++;
      this.space();
      if (this.i >= s.length) throw new Error('unclosed choice');
    }
    this.i++;
    if (!branches.has('other')) throw new Error('no other');
    return { kind: 'choice', name, type, offset, branches };
  }

  private word(): string {
    const m = /^[^\s{},]+/.exec(this.s.slice(this.i));
    if (!m) return '';
    this.i += m[0].length;
    return m[0];
  }

  private space(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }

  private skipBalanced(): void {
    let depth = 1;
    while (this.i < this.s.length && depth > 0) {
      const c = this.s[this.i++];
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    if (depth > 0) throw new Error('unclosed');
  }
}

/** A message parsed once (plain text is one text token), or null when absent or malformed. */
function parse(message: string | undefined): Token[] | null {
  if (message === undefined) return null;
  if (!message.includes('{')) return message ? [{ kind: 'text', text: message }] : [];
  return new Parser(message).parse();
}

type Part =
  | { kind: 'text'; text: string }
  | { kind: 'arg'; name: string }
  /** A plural's `#`: the page shows the count minus the choice's offset. */
  | { kind: 'count'; name: string; offset: number };

/** One way the message can read, every choice resolved to one branch. */
interface Expansion {
  parts: Part[];
  branches: Record<string, string>;
}

function expand(tokens: Token[], choice?: { name: string; offset: number }): Expansion[] {
  let out: Expansion[] = [{ parts: [], branches: {} }];
  for (const token of tokens) {
    if (token.kind === 'text') {
      for (const e of out) e.parts.push({ kind: 'text', text: token.text });
    } else if (token.kind === 'arg') {
      for (const e of out) e.parts.push({ kind: 'arg', name: token.name });
    } else if (token.kind === 'hash') {
      for (const e of out) {
        e.parts.push({ kind: 'count', name: choice?.name ?? '', offset: choice?.offset ?? 0 });
      }
    } else {
      const inner = token.type === 'select' ? choice : { name: token.name, offset: token.offset };
      // Each branch is expanded once, not once per expansion so far: nesting stays cheap.
      const subs = [...token.branches].map(
        ([selector, branch]) => [selector, expand(branch, inner)] as const
      );
      const next: Expansion[] = [];
      grow: for (const e of out) {
        for (const [selector, list] of subs) {
          for (const sub of list) {
            if (next.length >= MAX_EXPANSIONS) break grow;
            next.push({
              parts: [...e.parts, ...sub.parts],
              branches: { ...e.branches, ...sub.branches, [token.name]: selector },
            });
          }
        }
      }
      out = next;
    }
  }
  return out;
}

/** A number as a page shows it: Latin or Arabic-Indic digits, with group and decimal marks. */
const NUMBER = /\p{Nd}(?:[\p{Nd}.,\u00a0\u202f\u066b\u066c'\u2019]*\p{Nd})?/uy;

/**
 * Where a message's last argument ends in the page text that follows it. The node may go on
 * with the page's own text (`{t.contact} · Privacy`), which cannot be told apart from the
 * value, so the value stops at a line break, a run of spaces or a separator.
 */
const TRAILING_STOP = /\n|\s{2,}|\s[·|•→←—–]\s/;

interface Recovered {
  args: Map<string, string>;
  counts: Map<string, { shown: string; offset: number }>;
  /** The branch the page shows for each choice of the matched message. */
  branches: Record<string, string>;
  /** Every selector each choice of the matched message has. */
  selectors: Map<string, Set<string>>;
  /** How much of the page text the match covers; the rest is the page's own text after it. */
  consumed: number;
}

/** Merges adjacent text parts and drops markup, which the page renders as elements. */
function pageParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (part.kind !== 'text') out.push(part);
    else {
      const text = part.text.replace(/<[^>]*>/g, '');
      if (last?.kind === 'text') last.text += text;
      else if (text) out.push({ kind: 'text', text });
    }
  }
  return out;
}

function matchExpansion(e: Expansion, shown: string): Recovered | null {
  const parts = pageParts(e.parts);
  const found: Recovered = {
    args: new Map(),
    counts: new Map(),
    branches: e.branches,
    selectors: new Map(),
    consumed: 0,
  };
  let pos = 0;
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k]!;
    if (part.kind === 'text') {
      if (!shown.startsWith(part.text, pos)) return null;
      pos += part.text.length;
      continue;
    }
    const next = parts[k + 1];
    let end: number;
    if (part.kind === 'count') {
      NUMBER.lastIndex = pos;
      if (!NUMBER.exec(shown)) return null;
      end = NUMBER.lastIndex;
    } else if (next === undefined) {
      const rest = shown.slice(pos);
      const stop = TRAILING_STOP.exec(rest);
      end = pos + (stop ? stop.index : rest.trimEnd().length);
    } else if (next.kind === 'text') {
      end = shown.indexOf(next.text, pos);
      if (end === -1) return null;
    } else {
      // Two arguments side by side: where one ends is anyone's guess.
      return null;
    }
    const value = shown.slice(pos, end);
    if (part.kind === 'count') {
      const known = found.counts.get(part.name);
      if (known && known.shown !== value) return null;
      found.counts.set(part.name, { shown: value, offset: part.offset });
    } else {
      const known = found.args.get(part.name);
      if (known !== undefined && known !== value) return null;
      found.args.set(part.name, value);
    }
    pos = end;
  }
  found.consumed = pos;
  return found;
}

function collectSelectors(tokens: Token[], into: Map<string, Set<string>>): void {
  for (const token of tokens) {
    if (token.kind !== 'choice') continue;
    const set = into.get(token.name) ?? new Set<string>();
    for (const [selector, branch] of token.branches) {
      set.add(selector);
      collectSelectors(branch, into);
    }
    into.set(token.name, set);
  }
}

/**
 * The reading of `source` that covers the page text best: one that covers all of it, else the
 * one that covers most. A shorter branch can match only the start of the text ("# item" in
 * "5 items"), with the rest taken for page text after the translation.
 */
function recover(source: Token[], shown: string): Recovered | null {
  const whole = shown.trimEnd().length;
  let best: Recovered | null = null;
  for (const e of expand(source)) {
    const found = matchExpansion(e, shown);
    if (!found || (best && found.consumed <= best.consumed)) continue;
    best = found;
    if (found.consumed >= whole) break;
  }
  if (best) collectSelectors(source, best.selectors);
  return best;
}

function pageLanguage(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.documentElement.lang?.replace(/_/g, '-') || undefined;
}

/** The decimal separator of `lang`, mapped so ASCII '.' stands for it. */
function decimalSeparator(lang: string | undefined): string {
  try {
    const part = new Intl.NumberFormat(lang)
      .formatToParts(1.1)
      .find((each) => each.type === 'decimal');
    return part?.value === '\u066b' ? '.' : (part?.value ?? '.');
  } catch {
    return '.';
  }
}

/** The number a page shows: `1,234` is 1234 in English, `1,5` is 1.5 in French, `٥` is 5. */
function toNumber(shown: string, lang: string | undefined): number | null {
  let text = shown.replace(/\p{Nd}/gu, (d) => {
    const code = d.codePointAt(0)!;
    for (const zero of [0x30, 0x660, 0x6f0]) {
      if (code >= zero && code <= zero + 9) return String(code - zero);
    }
    return d;
  });
  // Arabic writes its own decimal and group marks (U+066B, U+066C), whatever the page language.
  const arabicDecimal = text.includes('\u066b');
  text = text.replace(/\u066b/g, '.').replace(/\u066c/g, '');
  const decimal = arabicDecimal ? '.' : decimalSeparator(lang);
  let digits = '';
  for (const c of text) {
    if (c >= '0' && c <= '9') digits += c;
    else if (c === decimal) digits += '.';
  }
  const n = Number(digits);
  return digits === '' || Number.isNaN(n) ? null : n;
}

function formatNumber(n: number, lang: string | undefined): string {
  try {
    return new Intl.NumberFormat(lang).format(n);
  } catch {
    return String(n);
  }
}

function pluralCategory(n: number, type: Choice, lang: string | undefined): string {
  try {
    const rules = new Intl.PluralRules(lang, {
      type: type === 'selectordinal' ? 'ordinal' : 'cardinal',
    });
    return rules.select(n);
  } catch {
    return 'other';
  }
}

/**
 * True when `selectors` has every plural form `lang` uses: the matched message is written for
 * the page language. An English fallback (one, other) on a French or Russian page is not, and
 * the page language's rules must pick the typed message's form, not English's branch.
 */
function coversLanguage(
  selectors: Set<string> | undefined,
  type: Choice,
  lang: string | undefined
): boolean {
  if (!selectors) return false;
  try {
    const rules = new Intl.PluralRules(lang, {
      type: type === 'selectordinal' ? 'ordinal' : 'cardinal',
    });
    return rules.resolvedOptions().pluralCategories.every((each) => selectors.has(each));
  } catch {
    return false;
  }
}

/** The count of a plural choice the page showed, with how it showed `#` there. */
function countOf(
  name: string,
  found: Recovered | null,
  lang: string | undefined
): { n: number; shown?: string; offset: number } | null {
  const counted = found?.counts.get(name);
  if (counted) {
    const n = toNumber(counted.shown, lang);
    if (n !== null) return { n: n + counted.offset, shown: counted.shown, offset: counted.offset };
  }
  const arg = found?.args.get(name);
  if (arg !== undefined) {
    const n = toNumber(arg, lang);
    if (n !== null) return { n, shown: arg, offset: 0 };
  }
  // An exact branch the page showed without the number (`=0 {No items}`) still tells it.
  const exact = /^=(\d+)$/.exec(found?.branches[name] ?? '');
  return exact ? { n: Number(exact[1]), offset: 0 } : null;
}

/**
 * Formats `tokens` with what the page showed. `matched` is true for the message that matched the
 * page: its choices take the branches the page showed. The typed message takes the page's branch
 * too where the matched message had the form the page language asks for and the page chose
 * another (its `<html lang>` is not the content's language). Otherwise the page language's
 * plural rules choose, since the matched message may be a fallback language with fewer forms:
 * "3 items" is `other` in English and `few` in Arabic.
 */
function render(
  tokens: Token[],
  found: Recovered | null,
  lang: string | undefined,
  matched: boolean,
  hash?: string
): string {
  let out = '';
  for (const token of tokens) {
    if (token.kind === 'text') out += token.text;
    else if (token.kind === 'hash') out += hash ?? '#';
    else if (token.kind === 'arg') {
      out += found?.args.get(token.name) ?? found?.counts.get(token.name)?.shown ?? token.raw;
    } else {
      let selector: string | undefined;
      let inner = hash;
      if (token.type === 'select') {
        selector = found?.args.get(token.name) ?? found?.branches[token.name];
      } else {
        const count = countOf(token.name, found, lang);
        const shownBranch = found?.branches[token.name];
        if (count !== null) {
          const category = pluralCategory(count.n - token.offset, token.type, lang);
          const pageChose =
            shownBranch !== undefined &&
            token.branches.has(shownBranch) &&
            count.offset === token.offset &&
            (matched ||
              (shownBranch !== category &&
                coversLanguage(found?.selectors.get(token.name), token.type, lang)));
          // ICU order for the typed message: an exact =N branch first.
          if (!matched && token.branches.has(`=${count.n}`)) selector = `=${count.n}`;
          else if (pageChose) selector = shownBranch;
          else if (token.branches.has(`=${count.n}`)) selector = `=${count.n}`;
          else selector = category;
          // Keep the page's own way of writing the number when it stands for the same value.
          inner =
            count.shown !== undefined && count.offset === token.offset
              ? count.shown
              : formatNumber(count.n - token.offset, lang);
        } else {
          // The page showed a branch without the number ("One seat"): keep that branch.
          selector = shownBranch;
          inner = undefined;
        }
      }
      const branch =
        (selector !== undefined ? token.branches.get(selector) : undefined) ??
        token.branches.get('other')!;
      out += render(branch, found, lang, matched, inner);
    }
  }
  return out;
}

/**
 * `value` with its arguments filled from `shown`, the text the page shows now, and the message
 * from `candidates` that matched it, filled the same way (the page's own text for it). The
 * candidates are the messages the page may be showing, tried in order: the stored value, the
 * value a save left on this node. Messages without arguments, and
 * messages that do not parse, come back as they are; with no match, the first candidate comes
 * back unchanged, undefined included.
 */
export function formatPreview(
  value: string,
  candidates: ReadonlyArray<string | undefined>,
  shown: string
): { value: string; source: string | undefined } {
  // Nothing to fill and nothing to read: the common case, kept free of any work.
  if (!value.includes('{') && !candidates.some((each) => each?.includes('{'))) {
    return { value, source: candidates[0] };
  }
  const lang = pageLanguage();
  // The candidate that covers the most page text wins, a later one on a tie (the value saved
  // here over an older stored value). Taking the first match would let an older value that is
  // a prefix of the saved one ("© {year} Acme" for "© {year} Acme Inc.") win, and the rest
  // would be shown again as page text after it.
  let best: { tokens: Token[]; found: Recovered } | null = null;
  for (const candidate of candidates) {
    const sourceTokens = parse(candidate);
    const found = sourceTokens ? recover(sourceTokens, shown) : null;
    if (sourceTokens && found && (!best || found.consumed >= best.found.consumed)) {
      best = { tokens: sourceTokens, found };
    }
  }
  // Filled even when the typed value has no argument yet ("Copyright Acme", "© {year"), so
  // the page's own text after the translation stays while the translator types.
  const source = best ? render(best.tokens, best.found, lang, true) : candidates[0];
  const tokens = value.includes('{') ? parse(value) : null;
  return { value: tokens ? render(tokens, best?.found ?? null, lang, false) : value, source };
}
