// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { decodeChangeLink, encodeChangeLink } from '../../src/core/change-link.js';
import { createBackup, restoreBackup } from '../../src/studio/share/backup.js';
import type { Draft } from '../../src/studio/transport/drafts.js';
import { MANIFEST, SHA_A, STUDIO_URL } from './helpers/share-fixtures.js';

vi.mock('../../src/core/change-link.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/change-link.js')>();
  return { ...actual, encodeChangeLink: vi.fn(actual.encodeChangeLink) };
});

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

const NOW = new Date('2026-10-26T12:00:00Z');

describe('createBackup', () => {
  it('backs up unsent, sent and conflict drafts as a change link file', async () => {
    vi.mocked(encodeChangeLink).mockResolvedValueOnce('lc1.T');
    const drafts = [
      d({ key: 'home.a' }),
      d({ key: 'home.b', status: 'sent', sentAt: 2 }),
      d({ key: 'home.c', conflict: true }),
    ];
    const backup = await createBackup({
      drafts,
      manifest: MANIFEST,
      studioHref: STUDIO_URL,
      by: 'Sara',
      now: NOW,
    });
    expect(backup).toEqual({
      fileName: 'livelocale-backup-2026-10-26.txt',
      text: 'https://www.acme.com/livelocale/index.html#lc1.T\n',
    });
    const set = vi.mocked(encodeChangeLink).mock.calls.at(-1)![0];
    expect(set.edits.map((e) => e.key)).toEqual(['home.a', 'home.b', 'home.c']);
    expect(set.by).toBe('Sara');
  });

  it('refuses a backup above 500 drafts', async () => {
    const drafts = Array.from({ length: 501 }, (_, i) => d({ key: `k${i}` }));
    await expect(
      createBackup({ drafts, manifest: MANIFEST, studioHref: STUDIO_URL, now: NOW })
    ).rejects.toThrow('More than 500 changes: send some of them first, then download the backup.');
  });
});

describe('restoreBackup', () => {
  it('restores drafts from a file and reports counts', async () => {
    const drafts = [d({ key: 'home.a' }), d({ key: 'home.b' }), d({ key: 'home.c' })];
    const { text } = await createBackup({
      drafts,
      manifest: MANIFEST,
      studioHref: STUDIO_URL,
      now: NOW,
    });
    const restoreDrafts = vi.fn(async () => ({ added: 2, skipped: 1 }));
    expect(await restoreBackup(text, { restoreDrafts })).toBe(
      'Restored 2 changes (1 already here).'
    );
    expect(restoreDrafts).toHaveBeenCalledWith((await decodeChangeLink(text)).edits);
    expect(restoreDrafts.mock.calls[0]![0]).toHaveLength(3);
  });

  it('explains a file without a link', async () => {
    const restoreDrafts = vi.fn();
    expect(await restoreBackup('hello', { restoreDrafts })).toBe(
      'No change link found in this file.'
    );
    expect(restoreDrafts).not.toHaveBeenCalled();
  });

  it('explains a damaged link', async () => {
    expect(await restoreBackup('lc1.AAAAAAAA', { restoreDrafts: vi.fn() })).toBe(
      'This change link is damaged or incomplete, which happens when an email or chat app breaks a long link. Ask the sender to send the file instead.'
    );
  });
});
