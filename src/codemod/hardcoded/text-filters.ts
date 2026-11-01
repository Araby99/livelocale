import { removeAllowed, type AllowList } from './allow-list.js';

/** Longest source text a `hardcoded` finding prints, in code points. */
export const MAX_REPORTED_TEXT = 60;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntity(match: string, body: string): string {
  if (body[0] !== '#') return NAMED_ENTITIES[body] ?? match;
  const code =
    body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : match;
}

/** Decodes the common HTML entities in one pass, collapses whitespace and trims. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#\d+|#[xX][\da-fA-F]+);/g, decodeEntity)
    .replace(/\s+/g, ' ')
    .trim();
}

export function shortenText(text: string): string {
  const points = [...text];
  if (points.length <= MAX_REPORTED_TEXT) return text;
  return points.slice(0, MAX_REPORTED_TEXT - 1).join('') + '…';
}

/** Single tokens that are code, not copy: URLs, emails, paths, ids, constants, keys. */
const CODE_LIKE: RegExp[] = [
  /^(?:[a-z][a-z\d+.-]*:\/\/|www\.|mailto:|tel:)/i,
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /^(?:\.{0,2}\/|~\/)/,
  /[/\\]/,
  /^[a-z\d]+(?:-[a-z\d]+)+$/,
  /^[a-z\d]+(?:_[a-z\d]+)+$/,
  /^[A-Z\d]+(?:_[A-Z\d]+)+$/,
  /^[a-z]+(?:[A-Z][a-z\d]*)+$/,
  /^[a-z][\w-]*(?:\.[\w-]+)+$/,
  /^[\w.-]+=\S*$/,
];

/** A shell command: lowercase words only, at least one of them a flag (`npx tool run --app`). */
function isCommandLine(text: string): boolean {
  const words = text.split(' ');
  return (
    words.every((w) => /^[a-z\d@.:=_/-]+$/.test(w)) && words.some((w) => /^--?[a-z][\w-]*$/.test(w))
  );
}

/** True when the text reads as copy a user sees, after allowed words are removed. */
export function isUserText(text: string, allow: AllowList): boolean {
  const rest = removeAllowed(text, allow).trim();
  if ([...rest].length < 2) return false;
  if (!/\p{L}/u.test(rest)) return false;
  if (!/\s/.test(rest) && CODE_LIKE.some((re) => re.test(rest))) return false;
  if (isCommandLine(rest)) return false;
  return true;
}
