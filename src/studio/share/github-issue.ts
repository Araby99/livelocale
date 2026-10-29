import { fencedChangeBlock, isValidRepoSlug } from '../../core/change-link.js';

/** Longest pre-filled issue URL; past it the block goes through the clipboard. */
export const MAX_ISSUE_URL_LENGTH = 8000;
/** GitHub's issue body limit; a longer block cannot be sent as an issue. */
export const MAX_ISSUE_BODY_CHARS = 65536;
export const PASTE_HERE_BODY =
  'Paste here: your clipboard holds the LiveLocale change block (Ctrl+V, or Cmd+V on Mac).\n';

const ISSUE_BY_MAX_CHARS = 40;

/**
 * An `owner/repo` slug from a slug, a GitHub URL (`https://github.com/owner/repo`,
 * optionally ending in `.git` or `/`) or an SSH remote (`git@github.com:owner/repo.git`).
 * Null when the result is not a valid slug.
 */
export function normalizeRepoSlug(input: string): string | null {
  const slug = input
    .trim()
    .replace(/^https:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  return isValidRepoSlug(slug) ? slug : null;
}

/** The repository Review files issues in: the manifest's, else the one the translator entered before. */
export function resolveReviewRepo(
  manifestRepo: string | undefined,
  remembered: string | null
): string | null {
  return manifestRepo ?? remembered;
}

function cleanSender(by: string): string {
  const cleaned = by
    .replace(/[\x00-\x1f\x7f-\x9f‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ISSUE_BY_MAX_CHARS);
  // Never leave half of a surrogate pair at the cut.
  return /[\ud800-\udbff]$/.test(cleaned) ? cleaned.slice(0, -1) : cleaned;
}

/** `LiveLocale: N translation change(s)`, plus ` from <by>` when a cleaned name remains. */
export function issueTitle(count: number, by?: string): string {
  const title = `LiveLocale: ${count} translation ${count === 1 ? 'change' : 'changes'}`;
  const sender = by === undefined ? '' : cleanSender(by);
  return sender === '' ? title : `${title} from ${sender}`;
}

export interface IssueRequest {
  /** The pre-filled `issues/new` URL; null when the block is too large. */
  url: string | null;
  /** The fenced block to copy first, when the URL carries `PASTE_HERE_BODY` instead. */
  clipboard: string | null;
  tooLarge: boolean;
}

function issueUrl(repo: string, title: string, body: string): string {
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/**
 * A pre-filled GitHub issue holding the change block. The URL carries only
 * `title` and `body`. Past `MAX_ISSUE_URL_LENGTH` the body asks the
 * translator to paste the block from the clipboard; past
 * `MAX_ISSUE_BODY_CHARS` no issue can hold it.
 */
export function buildIssueRequest(
  repo: string,
  token: string,
  count: number,
  by?: string
): IssueRequest {
  const block = fencedChangeBlock(token);
  if (block.length > MAX_ISSUE_BODY_CHARS) return { url: null, clipboard: null, tooLarge: true };
  const title = issueTitle(count, by);
  const url = issueUrl(repo, title, block);
  if (url.length <= MAX_ISSUE_URL_LENGTH) return { url, clipboard: null, tooLarge: false };
  return { url: issueUrl(repo, title, PASTE_HERE_BODY), clipboard: block, tooLarge: false };
}
