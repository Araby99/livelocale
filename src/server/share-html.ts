import { SHARE_DIR, SHARE_FLAG_FILE } from '../core/share-manifest.js';
import { PackError } from './pack-error.js';

/** Where the app's HTML is served from: a site path such as `/app/`, or relative (`./`). */
export type AppBase = { kind: 'absolute'; path: string } | { kind: 'relative' };

/** A URL scheme (`https:`) or a protocol-relative start (`//`). */
const FULL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
/** A Windows drive path (`C:/...`), which Git Bash/MSYS makes from a `/repo/` argument. */
const WINDOWS_PATH = /^[A-Za-z]:[\\/]/;
/** One path segment: unreserved characters, a few safe sub-delimiters and valid percent escapes. */
const SEGMENT = /^(?:[A-Za-z0-9._~@+-]|%[0-9A-Fa-f]{2})+$/;

/**
 * Turns `--base` / `shareBase` into an `AppBase`. `''`, `.` and `./` are relative; a path
 * starting with `/` is absolute and always ends in `/`. Anything else throws `BAD_BASE`.
 */
export function normalizeBase(value: string): AppBase {
  if (value === '' || value === '.' || value === './') return { kind: 'relative' };
  if (WINDOWS_PATH.test(value)) {
    throw new PackError(
      'BAD_BASE',
      `The app base "${value}" is a Windows path. Your shell (Git Bash/MSYS) probably converted a site path such as /repo/ into it. Run the command with MSYS_NO_PATHCONV=1, or from an npm script, and pass the site path, for example --base /app/.`
    );
  }
  if (FULL_URL.test(value)) {
    throw new PackError(
      'BAD_BASE',
      `The app base "${value}" is a full URL. Pass the path your HTML is served from, for example --base /app/ (shareBase in the Vite plugin).`
    );
  }
  const notASitePath = () =>
    new PackError(
      'BAD_BASE',
      `The app base "${value}" is not a site path. Use "/", "/app/" or "./".`
    );
  if (!value.startsWith('/')) throw notASitePath();
  const segments = value.slice(1).split('/');
  if (segments[segments.length - 1] === '') segments.pop();
  for (const segment of segments) {
    if (segment === '.' || segment === '..' || !SEGMENT.test(segment)) throw notASitePath();
  }
  return { kind: 'absolute', path: segments.length === 0 ? '/' : `/${segments.join('/')}/` };
}

/** The manifest's `basePath`: the absolute path, or null for a relative base. */
export function basePathOf(base: AppBase): string | null {
  return base.kind === 'absolute' ? base.path : null;
}

/** The `src` of the flag tag for the HTML file at `htmlRelPath` (POSIX, relative to the output root). */
export function flagSrcFor(base: AppBase, htmlRelPath: string): string {
  const file = `${SHARE_DIR}/${SHARE_FLAG_FILE}`;
  if (base.kind === 'absolute') return `${base.path}${file}`;
  const depth = htmlRelPath.split('/').length - 1;
  return depth === 0 ? `./${file}` : `${'../'.repeat(depth)}${file}`;
}

/** The share link's path: `<base>livelocale/index.html`, relative when the base is. */
export function shareUrlPathFor(base: AppBase): string {
  const page = `${SHARE_DIR}/index.html`;
  return base.kind === 'absolute' ? `${base.path}${page}` : page;
}

const EXISTING_FLAG_TAG = /<script\b[^>]*\bsrc="[^"]*livelocale\/flag\.js"[^>]*>\s*<\/script>/gi;
const HEAD_OPEN = /<head(?=[\s>])[^>]*>/i;
const HTML_OPEN = /<html(?=[\s>])[^>]*>/i;
const DOCTYPE = /<!doctype\b[^>]*>/i;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Puts `<script src="…"></script>` first in `<head>`, replacing any earlier flag tag, so running
 * it twice changes nothing. Without a `<head>` it goes after `<html…>`, then after the doctype,
 * then at the start.
 */
export function injectFlagScript(html: string, src: string): string {
  const tag = `<script src="${escapeAttribute(src)}"></script>`;
  const cleaned = html.replace(EXISTING_FLAG_TAG, '');
  for (const pattern of [HEAD_OPEN, HTML_OPEN, DOCTYPE]) {
    const match = pattern.exec(cleaned);
    if (match) {
      const end = match.index + match[0].length;
      return cleaned.slice(0, end) + tag + cleaned.slice(end);
    }
  }
  return tag + cleaned;
}
