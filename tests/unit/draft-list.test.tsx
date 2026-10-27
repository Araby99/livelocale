// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import {
  DraftList,
  DRAFT_STATUS_LABELS,
  draftDisplayState,
} from '../../src/studio/features/dashboard/components/DraftList.jsx';
import type { Draft } from '../../src/studio/transport/drafts.js';

const d = (o: Partial<Draft> = {}): Draft => ({
  scope: 'path:/',
  locale: 'ar',
  key: 'home.title',
  from: 'مرحبا',
  to: 'أهلا',
  force: false,
  base: null,
  branch: null,
  status: 'unsent',
  conflict: false,
  updatedAt: 1,
  sentAt: null,
  ...o,
});

const renderList = (overrides: Partial<React.ComponentProps<typeof DraftList>> = {}) => {
  const props = {
    drafts: [] as Draft[],
    onUndo: vi.fn(async () => {}),
    isUndoing: false,
    onDownloadBackup: vi.fn(async () => {}),
    onRestoreBackup: vi.fn(async () => ''),
    ...overrides,
  };
  render(<DraftList {...props} />);
  return props;
};

const row = (label: string) => screen.getByText(label).closest('li') as HTMLElement;

afterEach(cleanup);

describe('DraftList', () => {
  it('maps drafts to display states', () => {
    expect(draftDisplayState(d())).toBe('unsent');
    expect(draftDisplayState(d({ status: 'sent' }))).toBe('sent');
    expect(draftDisplayState(d({ status: 'sent', conflict: true }))).toBe('conflict');
    expect(DRAFT_STATUS_LABELS).toEqual({
      unsent: 'Not sent',
      sent: 'Sent',
      live: 'Live now',
      conflict: 'Changed by someone else, please check',
    });
  });

  it('labels each state and offers the matching action', () => {
    renderList({
      drafts: [
        d({ key: 'home.a' }),
        d({ key: 'home.b', status: 'sent', sentAt: 2 }),
        d({ key: 'home.c', conflict: true }),
      ],
    });
    const a = within(row('home.a · ar'));
    expect(a.getByText('Not sent')).toBeTruthy();
    expect(a.getByRole('button', { name: 'Undo' })).toBeTruthy();
    const b = within(row('home.b · ar'));
    expect(b.getByText('Sent')).toBeTruthy();
    expect(b.getByRole('button', { name: 'Remove' }).getAttribute('title')).toBe(
      'Removes it from this list. A link you already sent still carries it.'
    );
    const c = within(row('home.c · ar'));
    expect(c.getByText('Changed by someone else, please check')).toBeTruthy();
    expect(c.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('shows from struck through and to as text', () => {
    renderList({ drafts: [d()] });
    const from = screen.getByText('مرحبا');
    expect(from.className).toContain('line-through');
    expect(from.getAttribute('dir')).toBe('auto');
    expect(screen.getByText('أهلا').getAttribute('dir')).toBe('auto');
  });

  it('passes the draft to onUndo', () => {
    const target = d();
    const props = renderList({ drafts: [d({ key: 'home.greet' }), target] });
    fireEvent.click(within(row('home.title · ar')).getByRole('button', { name: 'Undo' }));
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(props.onUndo).toHaveBeenCalledWith(target);
  });

  it('shows the restore result after choosing a file', async () => {
    const props = renderList({
      onRestoreBackup: vi.fn(async () => 'Restored 1 changes (0 already here).'),
    });
    const input = screen.getByLabelText('Restore backup') as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe('.txt,text/plain');
    const file = new File(['lc1.x'], 'backup.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Restored 1 changes (0 already here).')).toBeTruthy();
    expect(props.onRestoreBackup).toHaveBeenCalledWith(file);
  });

  it('shows why a backup could not be downloaded', async () => {
    renderList({
      onDownloadBackup: vi.fn(async () => {
        throw new Error(
          'More than 500 changes: send some of them first, then download the backup.'
        );
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    expect(
      await screen.findByText(
        'More than 500 changes: send some of them first, then download the backup.'
      )
    ).toBeTruthy();
  });

  it('offers review only when onReviewChange is set', () => {
    renderList();
    expect(screen.queryByRole('button', { name: 'Review a change link or file' })).toBeNull();
    cleanup();
    const onReviewChange = vi.fn();
    renderList({ onReviewChange });
    fireEvent.click(screen.getByRole('button', { name: 'Review a change link or file' }));
    expect(onReviewChange).toHaveBeenCalledTimes(1);
  });
});
