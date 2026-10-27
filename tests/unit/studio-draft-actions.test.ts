// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { decodeChangeLink } from '../../src/core/change-link.js';
import { createBackup } from '../../src/studio/share/backup.js';
import {
  createDraftActions,
  type DraftActionDeps,
} from '../../src/studio/features/dashboard/hooks/draftActions.js';
import type { Draft } from '../../src/studio/transport/drafts.js';
import { AR, MANIFEST, SHA_A, STUDIO_URL } from './helpers/share-fixtures.js';

const d = (o: Partial<Draft> = {}): Draft => ({
  scope: 'path:/',
  locale: 'ar',
  key: 'home.title',
  from: 'مرحبا',
  to: 'أهلا',
  force: false,
  base: SHA_A,
  branch: 'main',
  status: 'unsent',
  conflict: false,
  updatedAt: 1,
  sentAt: null,
  ...o,
});

function setup(o: Partial<DraftActionDeps> = {}) {
  const transport = {
    manifest: MANIFEST,
    readBuiltLocale: vi.fn(async (_locale: string) => AR as unknown as Record<string, unknown>),
    restoreDrafts: vi.fn(async () => ({ added: 1, skipped: 0 })),
  };
  const deps: DraftActionDeps = {
    transport,
    drafts: [d()],
    locale: 'ar',
    discard: vi.fn(async () => undefined),
    updateLocaleDataCache: vi.fn(),
    sendToIframe: vi.fn(),
    setError: vi.fn(),
    setIsUndoing: vi.fn(),
    studioHref: () => STUDIO_URL,
    translatorName: () => null,
    download: vi.fn(),
    ...o,
  };
  return { deps, transport, actions: createDraftActions(deps) };
}

describe('createDraftActions.undoDraft', () => {
  it('discards the draft and shows the built text again in the app', async () => {
    const { deps, transport, actions } = setup();
    const draft = d();
    await actions.undoDraft(draft);
    expect(deps.discard).toHaveBeenCalledWith(draft);
    expect(transport.readBuiltLocale).toHaveBeenCalledWith('ar');
    expect(deps.updateLocaleDataCache).toHaveBeenCalledWith('home.title', 'مرحبا');
    expect(deps.sendToIframe).toHaveBeenCalledWith('COMMIT_PREVIEW', {
      key: 'home.title',
      value: 'مرحبا',
    });
    expect(deps.setError).toHaveBeenCalledWith(null);
    expect(vi.mocked(deps.setIsUndoing).mock.calls).toEqual([[true], [false]]);
  });

  it("falls back to the draft's from when the build has no text there", async () => {
    const { deps, actions } = setup();
    await actions.undoDraft(d({ key: 'home.gone', from: 'Old' }));
    expect(deps.sendToIframe).toHaveBeenCalledWith('COMMIT_PREVIEW', {
      key: 'home.gone',
      value: 'Old',
    });
  });

  it('leaves the app alone when the draft is for another locale', async () => {
    const { deps, actions } = setup({ locale: 'en' });
    await actions.undoDraft(d());
    expect(deps.discard).toHaveBeenCalledTimes(1);
    expect(deps.updateLocaleDataCache).not.toHaveBeenCalled();
    expect(deps.sendToIframe).not.toHaveBeenCalled();
  });

  it('reports a failure and stops undoing', async () => {
    const { deps, actions } = setup({ discard: vi.fn(async () => Promise.reject(new Error(''))) });
    await actions.undoDraft(d());
    expect(deps.setError).toHaveBeenLastCalledWith('Undo failed.');
    expect(deps.sendToIframe).not.toHaveBeenCalled();
    expect(deps.setIsUndoing).toHaveBeenLastCalledWith(false);
  });

  it('does nothing outside a share link', async () => {
    const { deps, actions } = setup({ transport: null });
    await actions.undoDraft(d());
    expect(deps.discard).not.toHaveBeenCalled();
  });
});

describe('createDraftActions.downloadBackup', () => {
  it("downloads a change link to the Studio's own address, read at click time", async () => {
    let href = 'https://old.example/livelocale/index.html';
    const { deps, actions } = setup({ studioHref: () => href, translatorName: () => 'Sara' });
    href = STUDIO_URL;
    await actions.downloadBackup();
    expect(deps.download).toHaveBeenCalledTimes(1);
    const [fileName, text] = vi.mocked(deps.download).mock.calls[0];
    expect(fileName).toMatch(/^livelocale-backup-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(text.startsWith(`${STUDIO_URL}#lc1.`)).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
    const set = await decodeChangeLink(text.trim());
    expect(set.by).toBe('Sara');
    expect(set.edits.map((e) => [e.locale, e.key, e.to])).toEqual([['ar', 'home.title', 'أهلا']]);
  });

  it('does nothing outside a share link', async () => {
    const { deps, actions } = setup({ transport: null });
    await actions.downloadBackup();
    expect(deps.download).not.toHaveBeenCalled();
  });
});

describe('createDraftActions.restoreBackupFile', () => {
  it('restores the drafts the file holds through the transport', async () => {
    const { transport, actions } = setup();
    const { text } = await createBackup({
      drafts: [d({ key: 'home.greet', to: 'y' })],
      manifest: MANIFEST,
      studioHref: STUDIO_URL,
    });
    const file = new File([text], 'backup.txt', { type: 'text/plain' });
    await expect(actions.restoreBackupFile(file)).resolves.toBe(
      'Restored 1 changes (0 already here).'
    );
    expect(transport.restoreDrafts).toHaveBeenCalledWith([
      expect.objectContaining({ locale: 'ar', key: 'home.greet', to: 'y' }),
    ]);
  });

  it('refuses outside a share link', async () => {
    const { actions } = setup({ transport: null });
    await expect(actions.restoreBackupFile(new File(['x'], 'b.txt'))).rejects.toThrow(
      'Backups work only on a share link.'
    );
  });
});
