import type { AllowList } from './allow-list.js';
import { SKIPPED_ELEMENTS, TEXT_ATTRIBUTES, type HardcodedFinding } from './scan-jsx.js';
import { isUserText, normalizeText, shortenText } from './text-filters.js';

/**
 * Hardcoded-text detection for `.astro` files, without a compiler: a small scanner over the
 * template part. It reports what the JSX scanner reports, where Astro has the same thing:
 *
 * - text between tags, and the text attributes (`alt`, `title`, `placeholder`, `aria-label`…)
 *   with a quoted value or a `{'literal'}` value;
 * - an expression child that is one string literal, `{'Saved'}`.
 *
 * It skips the frontmatter, `<script>`, `<style>`, HTML comments, the elements the JSX scanner
 * skips (`code`, `pre`, `Trans`…) and everything inside a `{…}` expression other than a lone
 * literal: text in JSX nested in an expression (`{items.map(i => <li>Buy</li>)}`) is not
 * reported. Braces are counted without reading strings, so a `}` inside a string literal in an
 * expression ends it early; that costs a missed or extra finding, never a crash.
 */

const IGNORE_NEXT_LINE = /(?:\/\/|\/\*|<!--)\s*livelocale-ignore-next-line\b/;
const IGNORE_FILE = /livelocale-ignore-file\b/;

/** Elements with no closing tag, so never an owner of the text after them. */
const VOID_ELEMENTS = new Set(
  'area base br col embed hr img input link meta param source track wbr'.split(' ')
);

/** Elements whose contents are not markup: skipped up to their closing tag. */
const RAW_ELEMENTS = new Set(['script', 'style']);

const TAG_NAME = /[A-Za-z][\w:.-]*/y;
const ATTR_NAME = /[^\s=>/{}"']+/y;
const STRING_LITERAL = /^\s*(['"`])([^]*)\1\s*$/;

interface Candidate {
  pos: number;
  raw: string;
  /** Offset of the element an ignore comment may sit above. */
  ownerPos: number;
}

/** The end of the frontmatter fence (`---` … `---`), or 0 when the file has none. */
function templateStart(text: string): { start: number; frontmatter: string } {
  const open = /^\s*---[^\S\r\n]*\r?\n/.exec(text);
  if (!open) return { start: 0, frontmatter: '' };
  const close = /^---[^\S\r\n]*\r?$/m;
  const rest = text.slice(open[0].length);
  const match = close.exec(rest);
  if (!match) return { start: text.length, frontmatter: rest };
  return {
    start: open[0].length + match.index + match[0].length,
    frontmatter: rest.slice(0, match.index),
  };
}

/** True when one of the HTML comments that open the template says `livelocale-ignore-file`. */
function templateIgnoresFile(text: string, start: number): boolean {
  const leadingComment = /\s*<!--([\s\S]*?)-->/y;
  leadingComment.lastIndex = start;
  let match: RegExpExecArray | null;
  while ((match = leadingComment.exec(text)) !== null) {
    if (IGNORE_FILE.test(match[1]!)) return true;
  }
  return false;
}

/** Index just past the `}` matching the `{` at `open`, counting braces only. */
function skipBraces(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return text.length;
}

/** A `{…}` holding one string literal without substitutions: its value and offset. */
function literalIn(text: string, open: number, close: number): { pos: number; raw: string } | null {
  const inner = text.slice(open + 1, close - 1);
  const match = STRING_LITERAL.exec(inner);
  if (!match || (match[1] === '`' && match[2]!.includes('${'))) return null;
  if (match[2]!.includes(match[1]!)) return null; // two literals, `{'a' + 'b'}`
  return { pos: open + 1 + inner.indexOf(match[1]!) + 1, raw: match[2]! };
}

function collectCandidates(text: string, from: number): Candidate[] {
  const out: Candidate[] = [];
  const stack: { name: string; pos: number }[] = [];
  const ownerPos = () => stack[stack.length - 1]?.pos ?? 0;
  let i = from;

  while (i < text.length) {
    const c = text[i];

    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      i = end < 0 ? text.length : end + 3;
      continue;
    }

    if (c === '<' && text[i + 1] === '!') {
      const end = text.indexOf('>', i);
      i = end < 0 ? text.length : end + 1;
      continue;
    }

    if (c === '<' && text[i + 1] === '/') {
      TAG_NAME.lastIndex = i + 2;
      const name = TAG_NAME.exec(text)?.[0] ?? '';
      const at = stack.map((e) => e.name).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      const end = text.indexOf('>', i);
      i = end < 0 ? text.length : end + 1;
      continue;
    }

    if (c === '<' && (text[i + 1] === '>' || /[A-Za-z]/.test(text[i + 1] ?? ''))) {
      const tagPos = i;
      TAG_NAME.lastIndex = i + 1;
      const name = TAG_NAME.exec(text)?.[0] ?? '';
      let j = i + 1 + name.length;
      let selfClosing = false;
      while (j < text.length) {
        const d = text[j]!;
        if (d === '>') {
          j++;
          break;
        }
        if (d === '/' && text[j + 1] === '>') {
          selfClosing = true;
          j += 2;
          break;
        }
        if (/\s/.test(d)) {
          j++;
          continue;
        }
        if (d === '{') {
          j = skipBraces(text, j);
          continue;
        }
        ATTR_NAME.lastIndex = j;
        const attr = ATTR_NAME.exec(text)?.[0];
        if (!attr) {
          j++;
          continue;
        }
        j += attr.length;
        if (text[j] !== '=') continue;
        j++;
        const q = text[j];
        if (q === '"' || q === "'") {
          const end = text.indexOf(q, j + 1);
          const close = end < 0 ? text.length : end;
          if (TEXT_ATTRIBUTES.has(attr)) {
            out.push({ pos: j + 1, raw: text.slice(j + 1, close), ownerPos: tagPos });
          }
          j = close + 1;
        } else if (q === '{') {
          const close = skipBraces(text, j);
          const literal = TEXT_ATTRIBUTES.has(attr) ? literalIn(text, j, close) : null;
          if (literal) out.push({ ...literal, ownerPos: tagPos });
          j = close;
        } else {
          while (j < text.length && !/[\s>]/.test(text[j]!)) j++;
        }
      }
      i = j;
      const lower = name.toLowerCase();
      if (selfClosing || VOID_ELEMENTS.has(lower)) continue;
      if (RAW_ELEMENTS.has(lower) || SKIPPED_ELEMENTS.has(name)) {
        const closing = new RegExp(`</${name.replace(/[.]/g, '\\.')}\\s*>`, 'ig');
        closing.lastIndex = i;
        const end = closing.exec(text);
        i = end ? end.index + end[0].length : text.length;
        continue;
      }
      stack.push({ name, pos: tagPos });
      continue;
    }

    if (c === '{') {
      const close = skipBraces(text, i);
      const literal = literalIn(text, i, close);
      if (literal) out.push({ ...literal, ownerPos: ownerPos() });
      i = close;
      continue;
    }

    // Text up to the next tag or expression; a `<` that starts no tag is text.
    let j = i;
    while (j < text.length) {
      const d = text[j];
      if (d === '{') break;
      if (d === '<' && /[A-Za-z/!>]/.test(text[j + 1] ?? '')) break;
      j++;
    }
    const raw = text.slice(i, j);
    const lead = raw.search(/\S/);
    if (lead >= 0) out.push({ pos: i + lead, raw, ownerPos: ownerPos() });
    i = j;
  }
  return out;
}

/** Finds user-visible text in one `.astro` file's template that never went through translation. */
export function findAstroHardcodedText(sourceText: string, allow: AllowList): HardcodedFinding[] {
  // Drop a BOM so first-line columns match the editor.
  const text = sourceText.startsWith('\uFEFF') ? sourceText.slice(1) : sourceText;
  const { start, frontmatter } = templateStart(text);
  if (IGNORE_FILE.test(frontmatter) || templateIgnoresFile(text, start)) return [];

  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (pos: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const lines = text.split(/\r?\n/);
  const ignoredAbove = (line0: number) => line0 > 0 && IGNORE_NEXT_LINE.test(lines[line0 - 1]!);

  const findings: HardcodedFinding[] = [];
  for (const candidate of collectCandidates(text, start)) {
    const normalized = normalizeText(candidate.raw);
    if (!isUserText(normalized, allow)) continue;
    const line = lineOf(candidate.pos);
    if (ignoredAbove(line) || ignoredAbove(lineOf(candidate.ownerPos))) continue;
    findings.push({
      line: line + 1,
      column: candidate.pos - lineStarts[line]! + 1,
      text: shortenText(normalized),
    });
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}
