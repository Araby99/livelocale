// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ChangeLinkError, encodeChangeLink } from '../../src/core/change-link.js';
import { copyText } from '../../src/studio/share/browser.js';
import { TranslationEditor } from '../../src/studio/features/dashboard/components/TranslationEditor.jsx';
import { ChangesPanel } from '../../src/studio/features/dashboard/components/ChangesPanel.jsx';
import { LocaleManager } from '../../src/studio/features/dashboard/components/LocaleManager.jsx';
import { LocaleRow } from '../../src/studio/features/dashboard/components/LocaleRow.jsx';
import { SendDialog } from '../../src/studio/features/dashboard/components/SendDialog.jsx';
import { GitHubIssueAction } from '../../src/studio/features/dashboard/components/GitHubIssueAction.jsx';
import { RepoPrompt } from '../../src/studio/features/dashboard/components/RepoPrompt.jsx';
import { ReviewPanel } from '../../src/studio/features/dashboard/components/ReviewPanel.jsx';
import type { ReviewState } from '../../src/studio/features/dashboard/hooks/useReview.js';
import type { ReviewRow } from '../../src/studio/share/review.js';
import type { GitState } from '../../src/studio/api.js';
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
const copy = vi.mocked(copyText);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const editorProps = (
  overrides: Partial<React.ComponentProps<typeof TranslationEditor>> = {}
): React.ComponentProps<typeof TranslationEditor> => ({
  selected: {
    key: 'home.greeting',
    fallbackValue: 'Hello {name}, <b>welcome</b>',
    currentValue: '',
  },
  inputValue: 'Hola {name}',
  isLoading: false,
  isSuccess: false,
  error: null,
  saveWarning: null,
  onInputChange: vi.fn(),
  onSave: vi.fn(),
  onForceSave: vi.fn(),
  onDismissWarning: vi.fn(),
  onClear: vi.fn(),
  ...overrides,
});

const baseGit: GitState = {
  available: true,
  isRepo: true,
  branch: 'main',
  changes: [{ path: 'locales/en.json', status: 'modified' }],
  diff: '--- a/locales/en.json\n+++ b/locales/en.json\n-  "a": "x"\n+  "a": "y"\n',
};

const renderPanel = (overrides: Partial<React.ComponentProps<typeof ChangesPanel>> = {}) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    git: baseGit,
    gitError: null,
    isGitLoading: false,
    lastCommit: null,
    onCommit: vi.fn().mockResolvedValue('abc1234'),
    onDiscard: vi.fn().mockResolvedValue(true),
    onRefresh: vi.fn(),
    history: [],
    onUndo: vi.fn().mockResolvedValue(undefined),
    isUndoing: false,
    ...overrides,
  };
  render(<ChangesPanel {...props} />);
  return props;
};

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

const reviewRow = (
  r: Partial<ReviewRow> & Pick<ReviewRow, 'locale' | 'key' | 'to'>
): ReviewRow => ({
  from: null,
  status: 'apply',
  flags: [],
  checks: [],
  id: `${r.locale}\u0000${r.key}`,
  ...r,
});

const reviewOf = (rows: ReviewRow[]): ReviewState => ({
  token: 'lc1.abc',
  set: {
    branch: 'main',
    base: 'abc1234',
    src: 'en',
    by: 'Sara',
    note: '',
    edits: rows.map(({ locale, key, from, to }) => ({ locale, key, from, to })),
  },
  rows,
  sourceLocale: 'en',
  target: 'local',
});

const renderReview = (
  rows: ReviewRow[],
  props: Partial<React.ComponentProps<typeof ReviewPanel>> = {}
) =>
  render(
    <ReviewPanel
      review={reviewOf(rows)}
      error={null}
      isLoading={false}
      focusKey={null}
      onSelectLocale={() => {}}
      onClose={() => {}}
      studioHref={STUDIO_URL}
      repo={null}
      repoFromManifest={false}
      onRepoChange={() => {}}
      {...props}
    />
  );

function renderDialog(
  onMarkSent: (batch: Draft[]) => Promise<void> = vi.fn(async () => {}),
  drafts: Draft[] = [draft(1), draft(2)]
) {
  render(
    <SendDialog
      isOpen
      onClose={vi.fn()}
      drafts={drafts}
      manifest={MANIFEST}
      studioHref={STUDIO_URL}
      onMarkSent={onMarkSent}
    />
  );
  return { onMarkSent };
}

describe('Studio live regions', () => {
  it('keeps the save status mounted and fills it on success', () => {
    const { rerender } = render(<TranslationEditor {...editorProps({ isSuccess: false })} />);
    const status = screen.getByTestId('save-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('');
    rerender(<TranslationEditor {...editorProps({ isSuccess: true })} />);
    expect(screen.getByTestId('save-status')).toBe(status);
    expect(status.textContent).toBe('Saved');
  });

  it('announces a save error and a save warning as alerts', () => {
    render(
      <TranslationEditor
        {...editorProps({
          error: 'Disk is read-only',
          saveWarning: {
            code: 'PLACEHOLDER_MISMATCH',
            message: 'Placeholder {name} is missing',
            missing: ['{name}'],
            extra: [],
          },
        })}
      />
    );
    const texts = screen.getAllByRole('alert').map((el) => el.textContent ?? '');
    expect(texts.some((text) => text.includes('Disk is read-only'))).toBe(true);
    expect(texts.some((text) => text.includes('Placeholder {name} is missing'))).toBe(true);
  });

  it('announces the commit result as status and a git error as alert', () => {
    renderPanel({ lastCommit: 'abc1234' });
    expect(screen.getByRole('status').textContent).toContain('Committed as abc1234');
    cleanup();
    renderPanel({ gitError: 'Nothing to commit' });
    expect(screen.getByRole('alert').textContent).toBe('Nothing to commit');
  });

  it('announces a locale manager error as an alert', () => {
    render(
      <LocaleManager
        locale="en"
        locales={['en', 'ar']}
        isLoading={false}
        error={'Locale "de" already exists.'}
        onAddLocale={vi.fn(async () => {})}
        onRenameLocale={vi.fn(async () => {})}
        onDeleteLocale={vi.fn(async () => {})}
      />
    );
    expect(screen.getByRole('alert').textContent).toContain('Locale "de" already exists.');
  });

  it('announces a rename error and a delete error in a locale row as alerts', async () => {
    const onDelete = vi.fn(async () => {
      throw new Error('Locale file is locked');
    });
    render(
      <LocaleRow
        code="ar"
        isActive={false}
        isLoading={false}
        allLocales={['en', 'ar']}
        onRename={vi.fn(async () => {})}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename language ar' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not valid!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('alert').textContent).toBe('Invalid locale format.');

    fireEvent.click(screen.getByRole('button', { name: 'Delete language ar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Locale file is locked');
  });

  it('announces a SendDialog encode error as an alert and the too-long notice as status', async () => {
    encode.mockRejectedValueOnce(new ChangeLinkError('TOO_LARGE', 'too large'));
    renderDialog();
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Could not create the link:/);
    cleanup();

    encode.mockResolvedValueOnce('lc1.' + 'A'.repeat(6000));
    renderDialog();
    const notice = await screen.findByText(/too long for a chat message/);
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });

  it('announces a SendDialog copy failure and a mark-sent failure as alerts', async () => {
    copy.mockResolvedValueOnce(false);
    renderDialog();
    await waitFor(() =>
      expect((document.getElementById('studio-send-copy') as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(document.getElementById('studio-send-copy')!);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Copy did not work in this browser'
    );
    cleanup();

    renderDialog(
      vi.fn(async () => {
        throw new Error('Draft store is full');
      })
    );
    await waitFor(() =>
      expect((document.getElementById('studio-send-copy') as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(document.getElementById('studio-send-copy')!);
    expect((await screen.findByRole('alert')).textContent).toBe('Draft store is full');
  });

  it('announces GitHubIssueAction too-large as status and RepoPrompt malformed as alert', () => {
    render(
      <GitHubIssueAction
        repo="acme/web"
        token={'lc1.' + 'A'.repeat(70_000)}
        count={1}
        label="Open a GitHub issue"
      />
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Too large for a GitHub issue. Run npx livelocale apply with this link instead.'
    );
    cleanup();

    render(<RepoPrompt onSave={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not a repo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Enter it as owner/repo, for example acme/website.'
    );
  });

  it('announces a GitHubIssueAction copy failure as an alert', async () => {
    copy.mockResolvedValueOnce(false);
    render(
      <GitHubIssueAction repo="acme/web" token={'lc1.' + 'A'.repeat(9000)} count={1} label="Open" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy change block' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Copying did not work. Copy the block below, then open GitHub and paste it.'
    );
  });

  // Final review D5: a live region per row floods a screen reader when the table mounts with many
  // flagged rows, and again when apply results land. The panel keeps one region per politeness.
  it('keeps review checks out of live regions, however many rows are flagged', () => {
    renderReview(
      Array.from({ length: 6 }, (_, i) =>
        reviewRow({
          locale: 'fr',
          key: `home.k${i}`,
          from: 'Bonjour {name}',
          to: 'Bonjour',
          status: 'invalid',
          checks: [
            { level: 'error', message: 'Keep {name} in the text.' },
            { level: 'warning', message: 'The text changed since it was copied.' },
          ],
        })
      )
    );
    expect(screen.getAllByText('Keep {name} in the text.')).toHaveLength(6);
    expect(screen.getAllByRole('alert').every((el) => el.textContent === '')).toBe(true);
    expect(screen.getAllByRole('status').every((el) => el.textContent === '')).toBe(true);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('announces one apply summary: an alert when a row failed, else status', () => {
    const rows = [
      reviewRow({ locale: 'en', key: 'home.a', from: 'A', to: 'A1' }),
      reviewRow({ locale: 'en', key: 'home.b', from: 'B', to: 'B1' }),
      reviewRow({ locale: 'en', key: 'home.c', from: 'C', to: 'C1' }),
    ];
    const { rerender } = renderReview(rows, { onApplyLocal: vi.fn() });
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(screen.getByRole('status').textContent).toBe('');
    const props = {
      review: reviewOf(rows),
      error: null,
      isLoading: false,
      focusKey: null,
      onSelectLocale: () => {},
      onClose: () => {},
      studioHref: STUDIO_URL,
      repo: null,
      repoFromManifest: false,
      onRepoChange: () => {},
      onApplyLocal: vi.fn(),
    };
    rerender(
      <ReviewPanel
        {...props}
        applyResults={{
          [rows[0]!.id]: { state: 'applied' },
          [rows[1]!.id]: { state: 'failed', message: 'Disk full.' },
          [rows[2]!.id]: { state: 'skipped', reason: 'unchanged' },
        }}
      />
    );
    expect(screen.getAllByTestId('apply-result').map((el) => el.textContent)).toEqual([
      'Applied',
      'Failed: Disk full.',
      'Skipped: unchanged',
    ]);
    expect(screen.getByRole('alert').textContent).toBe(
      'Apply finished: 1 applied, 1 skipped, 1 failed.'
    );
    expect(screen.getByRole('status').textContent).toBe('');
    rerender(
      <ReviewPanel
        {...props}
        applyResults={{
          [rows[0]!.id]: { state: 'applied' },
          [rows[1]!.id]: { state: 'applied' },
        }}
      />
    );
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(screen.getByRole('status').textContent).toBe(
      'Apply finished: 2 applied, 0 skipped, 0 failed.'
    );
  });

  it('announces the SendDialog overflow notice as status', async () => {
    renderDialog(
      vi.fn(async () => {}),
      Array.from({ length: 501 }, (_, i) => draft(i))
    );
    await screen.findByText('500 of 501 changes are in this link. Send again for the rest.');
    expect(
      screen
        .getAllByRole('status')
        .some((el) => el.textContent?.includes('500 of 501 changes are in this link.'))
    ).toBe(true);
  });
});
