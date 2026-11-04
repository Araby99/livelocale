/**
 * The readable form of a URL path, shared by `pack` (the manifest's `pages`) and the Studio,
 * so the same page reads the same from either side.
 *
 * Browser-safe, as tests/unit/core-browser-safe.test.ts checks.
 */

/** A run of percent-encoded bytes `%80`–`%FF`: the UTF-8 encoding of non-ASCII characters. */
const NON_ASCII_ESCAPES = /(?:%[89A-Fa-f][0-9A-Fa-f])+/g;

/**
 * Decodes the percent-encoded non-ASCII characters of `path` (`/%D9%85/` → `/م/`) and leaves
 * every ASCII escape (`%20`, `%23`, `%25`, `%2F`, `%3F`) encoded, so the result parses back to
 * the same URL. A run that is not valid UTF-8 stays as given. Never throws.
 */
export function readablePath(path: string): string {
  return path.replace(NON_ASCII_ESCAPES, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}
