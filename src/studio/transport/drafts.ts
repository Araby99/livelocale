import type { ShareManifest } from '../../core/share-manifest.js';

export type DraftStatus = 'unsent' | 'sent';

/** One translator edit kept in the browser until it is sent as a change link. */
export interface Draft {
  scope: string;
  locale: string;
  key: string;
  /** The built value when saved; null when the key is absent in the build. */
  from: string | null;
  to: string;
  force: boolean;
  /** `manifest.base` at save time. */
  base: string | null;
  /** `manifest.branch` at save time. */
  branch: string | null;
  status: DraftStatus;
  /** Set only by Live-now reconciliation; false until then. */
  conflict: boolean;
  updatedAt: number;
  sentAt: number | null;
}

export interface DraftId {
  locale: string;
  key: string;
}

/**
 * The scope drafts are stored under: the repository slug when the manifest
 * exposes it, otherwise the app's path, so two sites on one origin (such as
 * two GitHub Pages project sites) never share drafts.
 */
export function draftScope(manifest: Pick<ShareManifest, 'repo'>, appUrl: string): string {
  if (manifest.repo) return manifest.repo;
  return 'path:' + new URL(appUrl).pathname;
}

/**
 * The repository-relative file that holds `key` for `locale`: one file per
 * locale (`flat`) or one file per top-level group (`namespaced`). A
 * `localesPath` of '.' means the locale files sit at the repository root.
 */
export function localeFilePath(
  m: Pick<ShareManifest, 'localesPath' | 'layout'>,
  locale: string,
  key: string
): string {
  const file = m.layout === 'namespaced' ? `${locale}/${key.split('.')[0]}.json` : `${locale}.json`;
  return m.localesPath === '.' ? file : `${m.localesPath}/${file}`;
}

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A read-only, line-based diff of `drafts`, grouped by locale file and sorted
 * by file then key. Values are JSON strings, so each one stays on one line.
 */
export function buildDraftDiff(
  drafts: readonly Draft[],
  m: Pick<ShareManifest, 'localesPath' | 'layout'>
): string {
  const rows = drafts
    .map((d) => ({ path: localeFilePath(m, d.locale, d.key), draft: d }))
    .sort((a, b) => byCodeUnits(a.path, b.path) || byCodeUnits(a.draft.key, b.draft.key));
  const lines: string[] = [];
  let currentPath: string | null = null;
  for (const { path, draft } of rows) {
    if (path !== currentPath) {
      lines.push(`--- a/${path}`, `+++ b/${path}`);
      currentPath = path;
    }
    lines.push(`@@ ${draft.key} @@`);
    if (draft.from !== null) lines.push(`-${JSON.stringify(draft.from)}`);
    lines.push(`+${JSON.stringify(draft.to)}`);
  }
  return lines.join('\n');
}

/** How a draft compares with what the current build shows. */
export type DraftVerdict = 'pending' | 'live' | 'conflict';

/**
 * Compares a draft with the built value of its key (`undefined` when the build
 * has no text there): `live` once the build shows `to`, `pending` while it
 * still shows `from`, and `conflict` when someone else changed it meanwhile.
 */
export function reconcileDraft(
  draft: Pick<Draft, 'from' | 'to'>,
  current: string | undefined
): DraftVerdict {
  if (current === draft.to) return 'live';
  if ((current ?? null) === draft.from) return 'pending';
  return 'conflict';
}
