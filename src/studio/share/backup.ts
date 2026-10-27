import {
  ChangeLinkError,
  decodeChangeLink,
  encodeChangeLink,
  MAX_CHANGE_EDITS,
} from '../../core/change-link.js';
import type { ShareManifest } from '../../core/share-manifest.js';
import type { Draft } from '../transport/drafts.js';
import type { StaticTransport } from '../transport/static.js';
import { buildChangeSet, buildShareLink, changeFileName, describeLinkError } from './send.js';

const TOO_MANY_FOR_BACKUP = `More than ${MAX_CHANGE_EDITS} changes: send some of them first, then download the backup.`;
const NO_LINK_IN_FILE = 'No change link found in this file.';

/**
 * A backup file of every draft (unsent, sent and conflicted): one change link
 * to the Studio page, so restoring it or reviewing it works like any link.
 */
export async function createBackup(input: {
  drafts: readonly Draft[];
  manifest: ShareManifest;
  studioHref: string;
  by?: string;
  now?: Date;
}): Promise<{ fileName: string; text: string }> {
  const { drafts, manifest, studioHref, by } = input;
  if (drafts.length > MAX_CHANGE_EDITS) throw new Error(TOO_MANY_FOR_BACKUP);
  const token = await encodeChangeLink(buildChangeSet({ drafts, manifest, by }));
  return {
    fileName: changeFileName('backup', input.now ?? new Date()),
    text: buildShareLink(studioHref, token) + '\n',
  };
}

/** Restores the drafts a backup file holds and says what happened, in plain words. */
export async function restoreBackup(
  text: string,
  transport: Pick<StaticTransport, 'restoreDrafts'>
): Promise<string> {
  let edits;
  try {
    ({ edits } = await decodeChangeLink(text));
  } catch (err) {
    if (err instanceof ChangeLinkError && err.code === 'NOT_FOUND') return NO_LINK_IN_FILE;
    return describeLinkError(err);
  }
  const { added, skipped } = await transport.restoreDrafts(edits);
  return `Restored ${added} changes (${skipped} already here).`;
}
