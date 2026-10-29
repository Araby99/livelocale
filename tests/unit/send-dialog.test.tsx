// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ChangeLinkError, encodeChangeLink } from '../../src/core/change-link.js';
import { copyText, downloadText, readPref, writePref } from '../../src/studio/share/browser.js';
import { SendDialog } from '../../src/studio/features/dashboard/components/SendDialog.jsx';
import type { Draft } from '../../src/studio/transport/drafts.js';
import { MANIFEST, SHA_A, STUDIO_URL } from './helpers/share-fixtures.js';

vi.mock('../../src/core/change-link.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/change-link.js')>()),
  encodeChangeLink: vi.fn(async () => 'lc1.TOKEN'),
}));

vi.mock('../../src/studio/share/browser.js', () => ({
  readPref: vi.fn(() => null),
  writePref: vi.fn(),
  copyText: vi.fn(async () => true),
  downloadText: vi.fn(),
}));

const encode = vi.mocked(encodeChangeLink);
const LINK = 'https://www.acme.com/livelocale/index.html#lc1.TOKEN';

function draft(i: number, status: Draft['status'] = 'unsent'): Draft {
  return {
    scope: 'path:/',
    locale: 'ar',
    key: `home.k${i}`,
    from: `old ${i}`,
    to: `new ${i}`,
    force: false,
    base: SHA_A,
    branch: 'main',
    status,
    conflict: false,
    updatedAt: i,
    sentAt: status === 'sent' ? i : null,
  };
}

function renderDialog(drafts: Draft[] = [draft(1), draft(2)], manifest = MANIFEST) {
  const onMarkSent = vi.fn(async () => {});
  render(
    <SendDialog
      isOpen
      onClose={vi.fn()}
      drafts={drafts}
      manifest={manifest}
      studioHref={STUDIO_URL}
      onMarkSent={onMarkSent}
    />
  );
  return { onMarkSent };
}

async function linkField(): Promise<HTMLInputElement> {
  return (await screen.findByTestId('change-link')) as HTMLInputElement;
}

function button(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

beforeEach(() => {
  encode.mockReset();
  encode.mockResolvedValue('lc1.TOKEN');
  vi.mocked(copyText).mockReset();
  vi.mocked(copyText).mockResolvedValue(true);
  vi.mocked(downloadText).mockReset();
  vi.mocked(readPref).mockReset();
  vi.mocked(readPref).mockReturnValue(null);
  vi.mocked(writePref).mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SendDialog', () => {
  it('shows the link in a read-only field built from the Studio URL', async () => {
    renderDialog();
    const field = await linkField();
    expect(field.value).toBe(LINK);
    expect(field.readOnly).toBe(true);
  });

  it('copies the link, then marks the drafts sent', async () => {
    const drafts = [draft(1), draft(2)];
    const { onMarkSent } = renderDialog(drafts);
    await linkField();
    fireEvent.click(button('studio-send-copy'));
    await screen.findByText('Link copied. Paste it to your developer in chat or email.');
    expect(copyText).toHaveBeenCalledWith(LINK);
    expect(onMarkSent).toHaveBeenCalledWith(drafts);
  });

  it('passes the name and note into the change set', async () => {
    renderDialog();
    await linkField();
    fireEvent.change(document.getElementById('studio-send-name')!, { target: { value: 'Sara' } });
    fireEvent.change(document.getElementById('studio-send-note')!, {
      target: { value: 'Checkout page' },
    });
    await waitFor(() =>
      expect(encode.mock.lastCall?.[0]).toMatchObject({ by: 'Sara', note: 'Checkout page' })
    );
    expect(writePref).toHaveBeenCalledWith('translator-name', 'Sara');
  });

  it('starts each opening with an empty note and without already-sent changes', async () => {
    const drafts = [draft(1), draft(2, 'sent')];
    const props = {
      onClose: vi.fn(),
      drafts,
      manifest: MANIFEST,
      studioHref: STUDIO_URL,
      onMarkSent: vi.fn(async () => {}),
    };
    const { rerender } = render(<SendDialog isOpen {...props} />);
    await linkField();
    fireEvent.change(document.getElementById('studio-send-note')!, {
      target: { value: 'these fix the checkout page' },
    });
    fireEvent.click(screen.getByLabelText('Also include 1 change already sent'));
    await waitFor(() => expect(encode.mock.lastCall?.[0].edits).toHaveLength(2));

    rerender(<SendDialog isOpen={false} {...props} />);
    rerender(<SendDialog isOpen {...props} />);
    await waitFor(() => expect(encode.mock.lastCall?.[0].edits).toHaveLength(1));
    expect(encode.mock.lastCall?.[0].note ?? '').toBe('');
    expect((document.getElementById('studio-send-note') as HTMLTextAreaElement).value).toBe('');
  });

  it('offers only Download above 6000 characters', async () => {
    encode.mockResolvedValue('lc1.' + 'A'.repeat(6000));
    renderDialog();
    await screen.findByText(/Use Download file instead/);
    expect(
      screen.getByText('This batch is too long for a chat message. Use Download file instead.')
    ).toBeTruthy();
    expect(screen.queryByTestId('change-link')).toBeNull();
    expect(button('studio-send-copy').disabled).toBe(true);
    expect(button('studio-send-download').disabled).toBe(false);
  });

  it('downloads the link as a file and marks the drafts sent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
    const drafts = [draft(1), draft(2)];
    const { onMarkSent } = renderDialog(drafts);
    await linkField();
    fireEvent.click(button('studio-send-download'));
    await screen.findByText('File saved. Send it to your developer.');
    expect(downloadText).toHaveBeenCalledWith('livelocale-changes-2026-10-26.txt', LINK + '\n');
    expect(onMarkSent).toHaveBeenCalledWith(drafts);
  });

  it('asks for confirmation when the clipboard fails', async () => {
    vi.mocked(copyText).mockResolvedValue(false);
    const drafts = [draft(1), draft(2)];
    const { onMarkSent } = renderDialog(drafts);
    await linkField();
    fireEvent.click(button('studio-send-copy'));
    await screen.findByText(
      'Copy did not work in this browser. Select the link above, copy it, then press “I copied it”.'
    );
    expect(onMarkSent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'I copied it' }));
    await waitFor(() => expect(onMarkSent).toHaveBeenCalledWith(drafts));
  });

  it('includes already-sent changes only when asked', async () => {
    renderDialog([draft(1), draft(2, 'sent'), draft(3, 'sent')]);
    await linkField();
    expect(encode.mock.lastCall?.[0].edits).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Also include 2 changes already sent'));
    await waitFor(() => expect(encode.mock.lastCall?.[0].edits).toHaveLength(3));
  });

  it('reports the overflow above 500 changes', async () => {
    renderDialog(Array.from({ length: 501 }, (_, i) => draft(i)));
    await screen.findByText('500 of 501 changes are in this link. Send again for the rest.');
  });

  it('explains an encode failure', async () => {
    encode.mockRejectedValue(new ChangeLinkError('TOO_LARGE', 'too large'));
    renderDialog();
    await screen.findByText(/^Could not create the link: This change link is larger/);
    expect(button('studio-send-copy').disabled).toBe(true);
  });

  it('shows Open on GitHub only when the manifest exposes the repo', async () => {
    renderDialog();
    await linkField();
    expect(screen.queryByText('Open on GitHub')).toBeNull();
    cleanup();

    renderDialog([draft(1), draft(2)], { ...MANIFEST, repo: 'acme/web' });
    const anchor = (await screen.findByText('Open on GitHub')) as HTMLAnchorElement;
    expect(anchor.href.startsWith('https://github.com/acme/web/issues/new?')).toBe(true);
    expect(screen.getByText(/Press “Submit new issue” on GitHub/)).toBeTruthy();
  });

  it('marks the drafts sent when the issue page opens', async () => {
    const drafts = [draft(1), draft(2)];
    const { onMarkSent } = renderDialog(drafts, { ...MANIFEST, repo: 'acme/web' });
    fireEvent.click(await screen.findByText('Open on GitHub'));
    await waitFor(() => expect(onMarkSent).toHaveBeenCalledWith(drafts));
  });
});
