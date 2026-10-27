import { lookupKey } from '../../../../core/json-path.js';
import type { Draft } from '../../../transport/drafts.js';
import type { StaticTransport } from '../../../transport/static.js';
import { createBackup, restoreBackup } from '../../../share/backup.js';

export interface DraftActionDeps {
  /** The share-link transport, or null outside a share link. */
  transport: Pick<StaticTransport, 'manifest' | 'readBuiltLocale' | 'restoreDrafts'> | null;
  drafts: readonly Draft[];
  /** The locale the app shows now. */
  locale: string;
  discard(d: Draft): Promise<unknown>;
  updateLocaleDataCache(key: string, value: string): void;
  sendToIframe(type: string, payload?: unknown): void;
  setError(message: string | null): void;
  setIsUndoing(value: boolean): void;
  /** The Studio page's own address, read when the backup is made; a backup links back to it. */
  studioHref(): string;
  /** The remembered translator name, read when the backup is made. */
  translatorName(): string | null;
  download(fileName: string, text: string): void;
}

/** Undo, backup and restore for share-link drafts, kept apart from `useStudio` so they can be tested. */
export function createDraftActions(deps: DraftActionDeps) {
  const { transport } = deps;

  // Undo drops the draft and shows the built value again (or the draft's `from`
  // when the build no longer has a text there).
  const undoDraft = async (d: Draft): Promise<void> => {
    if (!transport) return;
    deps.setIsUndoing(true);
    deps.setError(null);
    try {
      await deps.discard(d);
      const found = lookupKey(await transport.readBuiltLocale(d.locale), d.key);
      const value = found.state === 'string' ? found.value : (d.from ?? '');
      if (d.locale === deps.locale) {
        deps.updateLocaleDataCache(d.key, value);
        deps.sendToIframe('COMMIT_PREVIEW', { key: d.key, value });
      }
    } catch (err: any) {
      deps.setError(err?.message || 'Undo failed.');
    } finally {
      deps.setIsUndoing(false);
    }
  };

  const downloadBackup = async (): Promise<void> => {
    if (!transport) return;
    const backup = await createBackup({
      drafts: deps.drafts,
      manifest: transport.manifest,
      studioHref: deps.studioHref(),
      by: deps.translatorName() ?? undefined,
    });
    deps.download(backup.fileName, backup.text);
  };

  const restoreBackupFile = async (file: File): Promise<string> => {
    if (!transport) throw new Error('Backups work only on a share link.');
    return restoreBackup(await file.text(), transport);
  };

  return { undoDraft, downloadBackup, restoreBackupFile };
}
