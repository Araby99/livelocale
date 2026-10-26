/**
 * The `lc1.` change link: the error type every codec step throws, base64url,
 * finding a token in pasted text, the fenced block GitHub issues carry, the
 * repository slug and branch name rules, the change-set schema with its caps,
 * and encoding and decoding through Web Streams deflate.
 *
 * Browser-safe, as tests/unit/core-browser-safe.test.ts checks.
 */

import {
  isSafeKeyPath,
  isValidKeyFormat,
  isValidLocaleFormat,
  isValidValueFormat,
  MAX_VALUE_LENGTH,
} from './validate.js';

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

const UNSUPPORTED_VERSION_MESSAGE =
  'This change link was made by a newer LiveLocale. Update LiveLocale and try again.';

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
    throw new ChangeLinkError('UNSUPPORTED_VERSION', UNSUPPORTED_VERSION_MESSAGE);
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

const BRANCH_NAME_RE = /^(?!-)(?!.*\.\.)[^\s\x00-\x1f\x7f]{1,255}$/;

/**
 * The one branch-name rule. The share manifest, build info and the change-set
 * schema all use it. `''` is not valid. A name never starts with `-` (so git
 * never reads it as an option) and never holds `..`, whitespace or control
 * characters.
 */
export function isValidBranchName(name: string): boolean {
  return BRANCH_NAME_RE.test(name);
}

export const CHANGE_LINK_VERSION = 1;
export const MAX_CHANGE_EDITS = 500;
export const MAX_BY_CHARS = 100;
export const MAX_NOTE_CHARS = 2_000;

/** One proposed edit. `from` is null when the key is absent in that locale in the build. */
export interface ChangeEdit {
  locale: string;
  key: string;
  from: string | null;
  to: string;
  force: boolean;
}

/** The edits a translator sends, with the build they were made against. */
export interface ChangeSet {
  repo?: string;
  branch: string;
  base: string;
  src: string;
  by: string;
  note: string;
  edits: ChangeEdit[];
}

/** An edit on the wire. A forced edit carries a trailing `1`. */
export type ChangeEditTuple =
  | [locale: string, key: string, from: string | null, to: string]
  | [locale: string, key: string, from: string | null, to: string, force: 1];

/** The JSON a change link carries. */
export interface ChangeWire {
  v: 1;
  repo?: string;
  branch: string;
  base: string;
  src: string;
  by: string;
  note: string;
  e: ChangeEditTuple[];
}

/** The wire form of a change set: no `repo` key when it is unset, and `1` appended only to forced edits. */
export function toWire(set: ChangeSet): ChangeWire {
  return {
    v: CHANGE_LINK_VERSION,
    ...(set.repo === undefined ? {} : { repo: set.repo }),
    branch: set.branch,
    base: set.base,
    src: set.src,
    by: set.by,
    note: set.note,
    e: set.edits.map(
      ({ locale, key, from, to, force }): ChangeEditTuple =>
        force ? [locale, key, from, to, 1] : [locale, key, from, to]
    ),
  };
}

/** Empty, or a full SHA-1 or SHA-256 commit id in lowercase hex. */
const BASE_SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})?$/;

const BY_FORBIDDEN_RE = /[\x00-\x1f\x7f]/;

/** Control characters other than tab, line feed and carriage return. */
const NOTE_FORBIDDEN_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/** A high surrogate with no low one after it, or a low surrogate with no high one before it. */
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so no field ever comes from a prototype. */
function own(obj: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function invalid(message: string): ChangeLinkError {
  return new ChangeLinkError('INVALID', message);
}

function hasLoneSurrogate(text: string | null | undefined): boolean {
  return typeof text === 'string' && LONE_SURROGATE_RE.test(text);
}

function parseEdit(entry: unknown, n: number): ChangeEdit {
  const fail = (problem: string) => invalid(`edit ${n}: ${problem}`);
  if (!Array.isArray(entry) || (entry.length !== 4 && entry.length !== 5)) {
    throw fail('is not a [locale, key, from, to] entry.');
  }
  const [locale, key, from, to, force] = entry as unknown[];
  if (typeof locale !== 'string' || !isValidLocaleFormat(locale)) {
    throw fail('the locale is not a locale code.');
  }
  if (typeof key !== 'string' || !isValidKeyFormat(key) || !isSafeKeyPath(key)) {
    throw fail('the key is not a valid translation key.');
  }
  if (from !== null && (typeof from !== 'string' || !isValidValueFormat(from))) {
    throw fail(`the current text is not text of at most ${MAX_VALUE_LENGTH} characters.`);
  }
  if (typeof to !== 'string' || !isValidValueFormat(to)) {
    throw fail(`the new text is not text of at most ${MAX_VALUE_LENGTH} characters.`);
  }
  if (entry.length === 5 && force !== 1) throw fail('the force flag must be 1.');
  return { locale, key, from, to, force: entry.length === 5 };
}

/**
 * Rejects two edits to one locale and key, and, within one locale, an edit
 * whose key is a dotted ancestor of another edit's key (`a.b` and `a.b.c`),
 * which would need both a text and a nested object at the same path.
 */
function checkKeysDistinct(edits: ChangeEdit[]): void {
  const keysByLocale = new Map<string, Set<string>>();
  edits.forEach(({ locale, key }, i) => {
    let keys = keysByLocale.get(locale);
    if (!keys) keysByLocale.set(locale, (keys = new Set()));
    if (keys.has(key)) throw invalid(`edit ${i + 1}: an earlier edit changes the same key.`);
    keys.add(key);
  });
  edits.forEach(({ locale, key }, i) => {
    const keys = keysByLocale.get(locale)!;
    for (let dot = key.indexOf('.'); dot >= 0; dot = key.indexOf('.', dot + 1)) {
      if (keys.has(key.slice(0, dot))) {
        throw invalid(`edit ${i + 1}: another edit changes a key that contains this one.`);
      }
    }
  });
}

/**
 * Validates a decoded change link and returns it as a change set made of
 * fresh objects, ignoring unknown top-level fields. Throws
 * `UNSUPPORTED_VERSION` unless `v` is 1, `TOO_MANY_EDITS` above
 * `MAX_CHANGE_EDITS` edits, and `INVALID` for anything else outside the
 * schema; a bad entry's message starts with `edit <n>:` (1-based).
 */
export function parseChangeSet(value: unknown): ChangeSet {
  if (!isPlainObject(value)) throw invalid('This change link does not hold a change set.');
  if (own(value, 'v') !== CHANGE_LINK_VERSION) {
    throw new ChangeLinkError('UNSUPPORTED_VERSION', UNSUPPORTED_VERSION_MESSAGE);
  }

  const repo = own(value, 'repo');
  if (repo !== undefined && (typeof repo !== 'string' || !isValidRepoSlug(repo))) {
    throw invalid('The repository is not an owner/name slug.');
  }
  const branch = own(value, 'branch');
  if (typeof branch !== 'string' || (branch !== '' && !isValidBranchName(branch))) {
    throw invalid('The branch is not a valid branch name.');
  }
  const base = own(value, 'base');
  if (typeof base !== 'string' || !BASE_SHA_RE.test(base)) {
    throw invalid('The base is not a full commit id.');
  }
  const src = own(value, 'src');
  if (typeof src !== 'string' || !isValidLocaleFormat(src)) {
    throw invalid('The source locale is not a locale code.');
  }
  const by = own(value, 'by');
  if (typeof by !== 'string' || by.length > MAX_BY_CHARS || BY_FORBIDDEN_RE.test(by)) {
    throw invalid(`The name is not one line of at most ${MAX_BY_CHARS} characters.`);
  }
  const note = own(value, 'note');
  if (typeof note !== 'string' || note.length > MAX_NOTE_CHARS || NOTE_FORBIDDEN_RE.test(note)) {
    throw invalid(`The note is not plain text of at most ${MAX_NOTE_CHARS} characters.`);
  }

  const entries = own(value, 'e');
  if (!Array.isArray(entries)) throw invalid('This change link holds no list of edits.');
  if (entries.length > MAX_CHANGE_EDITS) {
    throw new ChangeLinkError(
      'TOO_MANY_EDITS',
      `A change link holds at most ${MAX_CHANGE_EDITS} edits. Send the rest in another link.`
    );
  }
  if (entries.length === 0) throw invalid('This change link holds no edits.');
  // Array.from visits the holes of a sparse array, which map would skip.
  const edits = Array.from(entries, (entry: unknown, i) => parseEdit(entry, i + 1));
  checkKeysDistinct(edits);

  if ([repo, branch, base, src, by, note].some(hasLoneSurrogate)) {
    throw invalid('This change link holds broken text.');
  }
  edits.forEach(({ locale, key, from, to }, i) => {
    if ([locale, key, from, to].some(hasLoneSurrogate)) {
      throw invalid(`edit ${i + 1}: holds broken text.`);
    }
  });

  return { ...(repo === undefined ? {} : { repo }), branch, base, src, by, note, edits };
}

/** At most this many bytes of JSON after inflation, on encode and on decode. */
export const MAX_INFLATED_BYTES = 512 * 1024;

/** A longer token is refused before any base64 or inflate work. */
export const MAX_TOKEN_CHARS = 1_000_000;

/** Above this many link characters, Send offers a file instead of a link. */
export const CHANGE_LINK_FILE_THRESHOLD = 6_000;

/** Compresses to the zlib format (RFC 1950). */
export type Deflater = (bytes: Uint8Array) => Promise<Uint8Array>;

/**
 * Inflates the zlib format (RFC 1950). Throws `TOO_LARGE` once the output
 * passes `maxOutputLength`, and `CORRUPT` on bad or truncated data.
 */
export type Inflater = (bytes: Uint8Array, maxOutputLength: number) => Promise<Uint8Array>;

const TOO_LARGE_MESSAGE = `A change link holds at most ${MAX_INFLATED_BYTES / 1024} KB of text. Send the changes in smaller links.`;

const UNSUPPORTED_ENVIRONMENT_MESSAGE =
  'This browser cannot create or read change links. Use a current Chrome, Edge or Firefox, or Safari 16.4 or later.';

/**
 * Feeds `bytes` through a compression or decompression stream and collects
 * the output, throwing `TOO_LARGE` as soon as it passes `maxOutputLength`.
 * A failed read rejects with the stream's own error.
 */
async function pipeBytes(
  stream: CompressionStream | DecompressionStream,
  bytes: Uint8Array,
  maxOutputLength: number
): Promise<Uint8Array> {
  // Not awaited: a transform stream takes more input only once its output is
  // read. These promises reject when the stream errors or is cancelled, which
  // the reads below report, so they are silenced here.
  const writer = stream.writable.getWriter();
  writer.write(new Uint8Array(bytes)).catch(() => {});
  writer.close().catch(() => {});

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxOutputLength) {
      await reader.cancel().catch(() => {});
      throw new ChangeLinkError('TOO_LARGE', TOO_LARGE_MESSAGE);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Deflates with `CompressionStream('deflate')`. */
export const streamDeflate: Deflater = async (bytes) => {
  if (typeof globalThis.CompressionStream !== 'function') {
    throw new ChangeLinkError('UNSUPPORTED_ENVIRONMENT', UNSUPPORTED_ENVIRONMENT_MESSAGE);
  }
  return pipeBytes(new CompressionStream('deflate'), bytes, Infinity);
};

/**
 * Inflates with `DecompressionStream('deflate')`. Trailing data after the
 * zlib stream is rejected only where the runtime rejects it (browsers, Node
 * 24); `nodeInflate` checks it everywhere.
 */
export const streamInflate: Inflater = async (bytes, maxOutputLength) => {
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new ChangeLinkError('UNSUPPORTED_ENVIRONMENT', UNSUPPORTED_ENVIRONMENT_MESSAGE);
  }
  try {
    return await pipeBytes(new DecompressionStream('deflate'), bytes, maxOutputLength);
  } catch (err) {
    if (err instanceof ChangeLinkError) throw err;
    throw new ChangeLinkError('CORRUPT', CORRUPT_MESSAGE);
  }
};

/**
 * Encodes a change set as `lc1.<base64url>`. The set is validated against
 * the schema first, so every link this returns also decodes. Throws the
 * schema's codes, `TOO_LARGE` above `MAX_INFLATED_BYTES` of JSON, and
 * `UNSUPPORTED_ENVIRONMENT` without `CompressionStream`.
 */
export async function encodeChangeLink(
  set: ChangeSet,
  deflate: Deflater = streamDeflate
): Promise<string> {
  // Serialize the validated copy, so the link holds exactly what was checked.
  const json = JSON.stringify(toWire(parseChangeSet(toWire(set))));
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MAX_INFLATED_BYTES) {
    throw new ChangeLinkError('TOO_LARGE', TOO_LARGE_MESSAGE);
  }
  return CHANGE_LINK_PREFIX + toBase64Url(await deflate(bytes));
}

/**
 * Decodes the one change link in `text`: a token, a Studio link, a change
 * file or a GitHub issue body. Throws `findChangeToken`'s and the schema's
 * codes, `TOO_LARGE` for a token over `MAX_TOKEN_CHARS` (before any other
 * work) or a payload over `MAX_INFLATED_BYTES`, and `CORRUPT` for anything
 * that does not decode to JSON.
 */
export async function decodeChangeLink(
  text: string,
  inflate: Inflater = streamInflate
): Promise<ChangeSet> {
  const token = findChangeToken(text);
  if (token.length > MAX_TOKEN_CHARS) {
    throw new ChangeLinkError('TOO_LARGE', TOO_LARGE_MESSAGE);
  }
  try {
    const bytes = await inflate(
      fromBase64Url(token.slice(CHANGE_LINK_PREFIX.length)),
      MAX_INFLATED_BYTES
    );
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return parseChangeSet(JSON.parse(json));
  } catch (err) {
    if (err instanceof ChangeLinkError) throw err;
    throw new ChangeLinkError('CORRUPT', CORRUPT_MESSAGE);
  }
}
