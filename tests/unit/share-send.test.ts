// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ChangeLinkError,
  type ChangeLinkErrorCode,
  encodeChangeLink,
  MAX_CHANGE_EDITS,
} from '../../src/core/change-link.js';
import type { Draft } from '../../src/studio/transport/drafts.js';
import {
  buildChangeSet,
  buildShareLink,
  changeFileName,
  describeLinkError,
  selectDraftsForSend,
} from '../../src/studio/share/send.js';
import { MANIFEST, SHA_A } from './helpers/share-fixtures.js';

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

const COPY: Record<string, string> = {
  NOT_FOUND: 'This is not a LiveLocale change link. A change link contains "lc1.".',
  AMBIGUOUS: 'This text holds more than one change link. Paste one link at a time.',
  CORRUPT:
    'This change link is damaged or incomplete, which happens when an email or chat app breaks a long link. Ask the sender to send the file instead.',
  TOO_MANY_EDITS: 'This change link is larger than LiveLocale accepts (500 changes, 512 KB).',
  UNSUPPORTED_VERSION:
    'This change link was made by a newer LiveLocale. Update the site and try again.',
  UNSUPPORTED_ENVIRONMENT:
    'This browser cannot create or read change links. Use a current Chrome, Edge or Firefox, or Safari 16.4 or later.',
};

describe('selectDraftsForSend', () => {
  const drafts = [
    d({ key: 'b', updatedAt: 2 }),
    d({ key: 'a', updatedAt: 1 }),
    d({ key: 's', status: 'sent', updatedAt: 3 }),
    d({ key: 'c', updatedAt: 0, conflict: true }),
  ];

  it('includes unsent drafts oldest first, sent ones only on request, and never conflicts', () => {
    const unsent = selectDraftsForSend(drafts, { includeSent: false });
    expect(unsent.included.map((x) => x.key)).toEqual(['a', 'b']);
    expect(unsent.overflow).toBe(0);
    const all = selectDraftsForSend(drafts, { includeSent: true });
    expect(all.included.map((x) => x.key)).toEqual(['a', 'b', 's']);
    expect(all.overflow).toBe(0);
  });

  it('caps a send at MAX_CHANGE_EDITS and reports the overflow', () => {
    const many = Array.from({ length: MAX_CHANGE_EDITS + 1 }, (_, i) =>
      d({ key: `k${i}`, updatedAt: i })
    );
    const { included, overflow } = selectDraftsForSend(many, { includeSent: false });
    expect(included).toHaveLength(500);
    expect(overflow).toBe(1);
  });
});

describe('buildChangeSet', () => {
  it('omits repo unless the manifest exposes it', () => {
    const set = buildChangeSet({ drafts: [d()], manifest: MANIFEST });
    expect('repo' in set).toBe(false);
    expect(
      buildChangeSet({ drafts: [d()], manifest: { ...MANIFEST, repo: '' } })
    ).not.toHaveProperty('repo');
    expect(
      buildChangeSet({ drafts: [d()], manifest: { ...MANIFEST, repo: 'acme/web' } }).repo
    ).toBe('acme/web');
  });

  it('maps a missing branch and base to empty strings', () => {
    const set = buildChangeSet({
      drafts: [d()],
      manifest: { ...MANIFEST, branch: null, base: null },
    });
    expect(set.branch).toBe('');
    expect(set.base).toBe('');
    expect(set.src).toBe('en');
  });

  it('cleans the name and note', async () => {
    const set = buildChangeSet({
      drafts: [d()],
      manifest: MANIFEST,
      by: '  Sara \n Ali ',
      note: '   ',
    });
    expect(set.by).toBe('Sara Ali');
    expect(set.note).toBe('');
    expect(buildChangeSet({ drafts: [d()], manifest: MANIFEST }).by).toBe('');
    expect(
      buildChangeSet({ drafts: [d()], manifest: MANIFEST, note: 'a\u000Bb\u001Bc' }).note
    ).toBe('abc');
    const cut = buildChangeSet({
      drafts: [d()],
      manifest: MANIFEST,
      by: 'x'.repeat(79) + '😀',
      note: 'n\uD800'.repeat(10) + 'y'.repeat(600),
    });
    expect(cut.by).toBe('x'.repeat(79));
    expect(cut.note).toBe('n'.repeat(10) + 'y'.repeat(490));
    await expect(encodeChangeLink(cut)).resolves.toMatch(/^lc1\./);
  });

  it('sorts edits and keeps force', () => {
    const set = buildChangeSet({
      drafts: [
        d({ locale: 'fr', key: 'a' }),
        d({ locale: 'ar', key: 'b', force: true }),
        d({ locale: 'ar', key: 'a.b' }),
      ],
      manifest: MANIFEST,
    });
    expect(set.edits).toEqual([
      { locale: 'ar', key: 'a.b', from: 'مرحبا', to: 'أهلا', force: false },
      { locale: 'ar', key: 'b', from: 'مرحبا', to: 'أهلا', force: true },
      { locale: 'fr', key: 'a', from: 'مرحبا', to: 'أهلا', force: false },
    ]);
  });

  it('produces a change set the codec accepts', async () =>
    expect(await encodeChangeLink(buildChangeSet({ drafts: [d()], manifest: MANIFEST }))).toMatch(
      /^lc1\./
    ));
});

describe('buildShareLink', () => {
  it('builds the link from the Studio page', () =>
    expect(
      buildShareLink('https://www.acme.com/livelocale/index.html?x=1#lc1.old', 'lc1.new')
    ).toBe('https://www.acme.com/livelocale/index.html#lc1.new'));

  it('ends the link in index.html when the Studio was opened as a folder', () =>
    expect(buildShareLink('https://www.acme.com/livelocale/', 'lc1.new')).toBe(
      'https://www.acme.com/livelocale/index.html#lc1.new'
    ));
});

describe('changeFileName', () => {
  it('names files by kind and UTC date', () => {
    expect(changeFileName('backup', new Date('2026-10-26T23:30:00Z'))).toBe(
      'livelocale-backup-2026-10-26.txt'
    );
    expect(changeFileName('changes', new Date('2026-10-26T23:30:00Z'))).toBe(
      'livelocale-changes-2026-10-26.txt'
    );
  });
});

describe('describeLinkError', () => {
  it.each([
    'NOT_FOUND',
    'AMBIGUOUS',
    'CORRUPT',
    'TOO_MANY_EDITS',
    'UNSUPPORTED_VERSION',
    'UNSUPPORTED_ENVIRONMENT',
  ])('describes %s in plain words', (code) =>
    expect(describeLinkError(new ChangeLinkError(code as ChangeLinkErrorCode, 'raw'))).toBe(
      COPY[code]
    )
  );

  it('shares copy between related codes and falls back to the message', () => {
    expect(describeLinkError(new ChangeLinkError('INVALID', 'raw'))).toBe(COPY.CORRUPT);
    expect(describeLinkError(new ChangeLinkError('TOO_LARGE', 'raw'))).toBe(COPY.TOO_MANY_EDITS);
    expect(describeLinkError(new Error('boom'))).toBe('boom');
    expect(describeLinkError(new Error(''))).toBe('Could not read the change link.');
    expect(describeLinkError('nope')).toBe('Could not read the change link.');
  });
});
