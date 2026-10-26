/**
 * Text layer of the `lc1.` change link: the error type every codec step
 * throws, base64url, finding a token in pasted text, the fenced block GitHub
 * issues carry, and the repository slug rule.
 *
 * Browser-safe, as tests/unit/core-browser-safe.test.ts checks.
 */

export const CHANGE_LINK_PREFIX = 'lc1.';

export const CHANGE_BLOCK_OPEN = '```livelocale';

const CHANGE_BLOCK_CLOSE = '```';

export type ChangeLinkErrorCode =
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'UNSUPPORTED_VERSION'
  | 'CORRUPT'
  | 'TOO_LARGE'
  | 'TOO_MANY_EDITS'
  | 'INVALID'
  | 'UNSUPPORTED_ENVIRONMENT';

/** A change link that cannot be found, read or written. Messages never echo payload text. */
export class ChangeLinkError extends Error {
  readonly code: ChangeLinkErrorCode;

  constructor(code: ChangeLinkErrorCode, message: string) {
    super(message);
    this.name = 'ChangeLinkError';
    this.code = code;
  }
}

const CORRUPT_MESSAGE =
  'This change link is damaged or incomplete. Ask the sender to send the file instead.';

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** `String.fromCharCode` takes one argument per byte, so bytes are spread a chunk at a time. */
const CHUNK_BYTES = 0x8000;

/** RFC 4648 §5 base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  // One binary string, one btoa call: 0x8000 is not a multiple of 3, so
  // encoding chunk by chunk would put padding in the middle of the output.
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_BYTES));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes canonical RFC 4648 §5 base64url without padding. Anything else
 * (another alphabet, `=`, an impossible length, or non-zero trailing bits)
 * throws `CORRUPT`, so a damaged link never decodes to different bytes.
 */
export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new ChangeLinkError('CORRUPT', CORRUPT_MESSAGE);
  }
  const tail = text.length % 4;
  if (tail !== 0) {
    // The last character of a 2- or 3-character group carries 4 or 2 unused bits.
    const unusedBits = tail === 2 ? 0x0f : 0x03;
    if ((BASE64URL_ALPHABET.indexOf(text[text.length - 1]!) & unusedBits) !== 0) {
      throw new ChangeLinkError('CORRUPT', CORRUPT_MESSAGE);
    }
  }
  const binary = atob(
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(tail === 0 ? 0 : 4 - tail)
  );
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The fenced block a GitHub issue carries: `CHANGE_BLOCK_OPEN`, the token, the closing fence. */
export function fencedChangeBlock(token: string): string {
  return `${CHANGE_BLOCK_OPEN}\n${token}\n${CHANGE_BLOCK_CLOSE}\n`;
}

/**
 * The content of the first fenced `livelocale` block, up to the next line
 * that is exactly the closing fence (or the end of the text), with all
 * whitespace removed so lines a mail or chat app wrapped join up again.
 * Returns null when the text has no such block.
 */
function fencedBlockContent(text: string): string | null {
  const open = new RegExp(`${CHANGE_BLOCK_OPEN}(?:\\r\\n|\\r|\\n)`).exec(text);
  if (!open) return null;
  const lines = text.slice(open.index + open[0].length).split(/\r\n|\r|\n/);
  const close = lines.indexOf(CHANGE_BLOCK_CLOSE);
  return (close < 0 ? lines : lines.slice(0, close)).join('').replace(/\s+/g, '');
}

/**
 * Finds the one `lc1.` token in pasted text: a bare token, a Studio link, a
 * link rewritten by a mail scanner, chat markup, prose, or a GitHub issue's
 * fenced block (which wins over any other text). Returns `lc1.<data>`.
 *
 * Throws `AMBIGUOUS` for two different tokens, `UNSUPPORTED_VERSION` for a
 * newer `lcN.` token only, and `NOT_FOUND` otherwise.
 */
export function findChangeToken(text: string): string {
  const scope = (fencedBlockContent(text) ?? text).replace(/%23/gi, '#');

  const tokens = new Set<string>();
  for (const match of scope.matchAll(/(?:^|[^A-Za-z0-9_-])lc1\.([A-Za-z0-9_-]+)/g)) {
    tokens.add(match[1]!);
  }

  if (tokens.size === 1) return CHANGE_LINK_PREFIX + [...tokens][0]!;
  if (tokens.size > 1) {
    throw new ChangeLinkError(
      'AMBIGUOUS',
      'This text holds more than one change link. Paste one link at a time.'
    );
  }
  if (/(?:^|[^A-Za-z0-9_-])lc(?:[2-9]|[1-9]\d+)\.[A-Za-z0-9_-]/.test(scope)) {
    throw new ChangeLinkError(
      'UNSUPPORTED_VERSION',
      'This change link was made by a newer LiveLocale. Update LiveLocale and try again.'
    );
  }
  throw new ChangeLinkError(
    'NOT_FOUND',
    'This is not a LiveLocale change link. A change link contains "lc1.".'
  );
}

/** A GitHub `owner/repo` slug. The repository part may not be `.` or `..`. */
export function isValidRepoSlug(slug: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(slug)) return false;
  const repo = slug.slice(slug.indexOf('/') + 1);
  return repo !== '.' && repo !== '..';
}
