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
