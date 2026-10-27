import {
  ChangeLinkError,
  type ChangeLinkErrorCode,
  type ChangeSet,
  MAX_CHANGE_EDITS,
} from '../../core/change-link.js';
import type { ShareManifest } from '../../core/share-manifest.js';
import type { Draft } from '../transport/drafts.js';

export const SEND_NAME_MAX_CHARS = 80;
export const SEND_NOTE_MAX_CHARS = 500;

/**
 * The drafts one Send carries: unsent ones (and sent ones when asked), never
 * conflicts, oldest first, at most `MAX_CHANGE_EDITS`. `overflow` counts the
 * eligible drafts left for another send.
 */
export function selectDraftsForSend(
  drafts: readonly Draft[],
  opts: { includeSent: boolean }
): { included: Draft[]; overflow: number } {
  const eligible = drafts
    .filter((d) => !d.conflict && (d.status === 'unsent' || opts.includeSent))
    .sort((a, b) => a.updatedAt - b.updatedAt);
  return {
    included: eligible.slice(0, MAX_CHANGE_EDITS),
    overflow: Math.max(0, eligible.length - MAX_CHANGE_EDITS),
  };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Drops every surrogate that is not part of a pair. */
function removeLoneSurrogates(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isHighSurrogate(code)) {
      if (i + 1 < text.length && isLowSurrogate(text.charCodeAt(i + 1))) {
        out += text.slice(i, i + 2);
        i++;
      }
    } else if (!isLowSurrogate(code)) {
      out += text.charAt(i);
    }
  }
  return out;
}

/** Cuts to `max` code units without splitting a surrogate pair. */
function cutText(text: string, max: number): string {
  const cut = removeLoneSurrogates(text).slice(0, max);
  return cut.length > 0 && isHighSurrogate(cut.charCodeAt(cut.length - 1)) ? cut.slice(0, -1) : cut;
}

const CONTROL_RE = /[\x00-\x1f\x7f]/g;

/** Control characters other than tab, line feed and carriage return. */
const NOTE_CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function cleanName(by: string | undefined): string {
  const oneLine = (by ?? '').replace(/\s+/g, ' ').replace(CONTROL_RE, '').trim();
  return cutText(oneLine, SEND_NAME_MAX_CHARS);
}

function cleanNote(note: string | undefined): string {
  return cutText((note ?? '').replace(NOTE_CONTROL_RE, '').trim(), SEND_NOTE_MAX_CHARS);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The change set for `drafts`, made against the build `manifest` describes. */
export function buildChangeSet(input: {
  drafts: readonly Draft[];
  manifest: Pick<ShareManifest, 'repo' | 'base' | 'branch' | 'sourceLocale'>;
  by?: string;
  note?: string;
}): ChangeSet {
  const { drafts, manifest } = input;
  const edits = drafts
    .map(({ locale, key, from, to, force }) => ({ locale, key, from, to, force }))
    .sort((a, b) => compareText(a.locale, b.locale) || compareText(a.key, b.key));
  return {
    ...(typeof manifest.repo === 'string' && manifest.repo !== '' ? { repo: manifest.repo } : {}),
    branch: manifest.branch ?? '',
    base: manifest.base ?? '',
    src: manifest.sourceLocale,
    by: cleanName(input.by),
    note: cleanNote(input.note),
    edits,
  };
}

/**
 * The Studio page link carrying `token` in its hash. It always ends in
 * `index.html`, because S3 REST origins do not resolve folder indexes.
 */
export function buildShareLink(studioHref: string, token: string): string {
  const url = new URL(studioHref);
  const pathname = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
  return `${url.origin}${pathname}#${token}`;
}

/** `livelocale-<kind>-<UTC date>.txt`. */
export function changeFileName(kind: 'changes' | 'backup', now: Date): string {
  return `livelocale-${kind}-${now.toISOString().slice(0, 10)}.txt`;
}

const DAMAGED =
  'This change link is damaged or incomplete, which happens when an email or chat app breaks a long link. Ask the sender to send the file instead.';
const TOO_BIG = 'This change link is larger than LiveLocale accepts (500 changes, 512 KB).';

const LINK_ERROR_COPY: Record<ChangeLinkErrorCode, string> = {
  NOT_FOUND: 'This is not a LiveLocale change link. A change link contains "lc1.".',
  AMBIGUOUS: 'This text holds more than one change link. Paste one link at a time.',
  CORRUPT: DAMAGED,
  INVALID: DAMAGED,
  TOO_LARGE: TOO_BIG,
  TOO_MANY_EDITS: TOO_BIG,
  UNSUPPORTED_VERSION:
    'This change link was made by a newer LiveLocale. Update the site and try again.',
  UNSUPPORTED_ENVIRONMENT:
    'This browser cannot create or read change links. Use a current Chrome, Edge or Firefox, or Safari 16.4 or later.',
};

/** Plain-words copy for a change-link failure. */
export function describeLinkError(err: unknown): string {
  if (err instanceof ChangeLinkError && Object.hasOwn(LINK_ERROR_COPY, err.code)) {
    return LINK_ERROR_COPY[err.code];
  }
  return (err instanceof Error && err.message) || 'Could not read the change link.';
}
