// The real change link for the hero's edits: the same encoder the share Studio uses, so the
// packed demo Studio opens exactly what the visitor fixed. Nothing here sends anything.

import { encodeChangeLink } from '../../../src/core/change-link';
import { buildChangeSet, buildShareLink } from '../../../src/studio/share/send';
import type { Draft } from '../../../src/studio/transport/drafts';
import type { HeroEdit } from './model';

/**
 * The demo build's manifest fields: no `repo`, so no GitHub target exists. Empty `base` and
 * `branch` are what the share Studio sends for a build without git info.
 */
export const DEMO_MANIFEST = { base: '', branch: '', sourceLocale: 'en' } as const;

/** The visitor's edits as unsent Studio drafts, in edit order. */
export function toDrafts(edits: readonly HeroEdit[], now: number): Draft[] {
  return edits.map((edit, index) => ({
    scope: 'path:/demo/',
    locale: 'en',
    key: edit.key,
    from: edit.from,
    to: edit.to,
    force: false,
    base: null,
    branch: null,
    status: 'unsent',
    conflict: false,
    updatedAt: now + index,
    sentAt: null,
  }));
}

/** The packed demo Studio link carrying the visitor's edits as a `#lc1.` change link. */
export async function buildDemoLink(
  edits: readonly HeroEdit[],
  studioHref: string,
  now: number = Date.now()
): Promise<string> {
  const set = buildChangeSet({
    drafts: toDrafts(edits, now),
    manifest: DEMO_MANIFEST,
    note: 'Fixed on livelocale.js.org',
  });
  return buildShareLink(studioHref, await encodeChangeLink(set));
}

/** The packed demo Studio page under the site's `base` on `origin`. */
export function demoStudioHref(base: string, origin: string): string {
  return `${origin}${base}demo/livelocale/index.html`;
}
