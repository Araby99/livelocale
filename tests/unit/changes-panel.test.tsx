// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChangesPanel } from '../../src/studio/features/dashboard/components/ChangesPanel.jsx';
import type { GitState } from '../../src/studio/api.js';

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

describe('ChangesPanel', () => {
  it('renders nothing when closed', () => {
    renderPanel({ isOpen: false });
    expect(screen.queryByTestId('changes-panel')).toBeNull();
    cleanup();
  });

  it('lists changed files with their status and the branch name', () => {
    renderPanel();
    expect(screen.getByText('locales/en.json')).toBeTruthy();
    expect(screen.getByText('modified')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    cleanup();
  });

  it('enables commit only once a message is typed, then clears it after success', async () => {
    const props = renderPanel();
    const button = screen.getByRole('button', {
      name: /commit locale changes/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const textarea = screen.getByPlaceholderText(
      /describe the copy change/i
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'i18n: fix header' } });
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    await vi.waitFor(() => expect(props.onCommit).toHaveBeenCalledWith('i18n: fix header'));
    await vi.waitFor(() => expect(textarea.value).toBe(''));
    cleanup();
  });

  it('asks for confirmation before discarding', async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(props.onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    await vi.waitFor(() => expect(props.onDiscard).toHaveBeenCalledTimes(1));
    cleanup();
  });

  it('shows the diff on demand with added and removed lines', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Show diff'));
    // Testing Library collapses runs of whitespace before matching text.
    expect(screen.getByText('+ "a": "y"')).toBeTruthy();
    expect(screen.getByText('- "a": "x"')).toBeTruthy();
    cleanup();
  });

  it('lists session edits and triggers undo for one entry', () => {
    const entry = {
      id: '1',
      locale: 'en',
      key: 'home.title',
      previousValue: 'Old',
      nextValue: 'New',
      at: Date.now(),
    };
    const props = renderPanel({ history: [entry] });
    expect(screen.getByText('home.title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(props.onUndo).toHaveBeenCalledWith(entry);
    cleanup();
  });

  it('explains when git is unavailable or the directory is not a repository', () => {
    renderPanel({ git: { ...baseGit, available: false, isRepo: false, changes: [] } });
    expect(screen.getByText(/git integration is disabled/i)).toBeTruthy();
    cleanup();
    renderPanel({ git: { ...baseGit, isRepo: false, changes: [] } });
    expect(screen.getByText(/not inside a git repository/i)).toBeTruthy();
    cleanup();
  });
});

describe('ChangesPanel — GitHub mode', () => {
  const githubGit: GitState = {
    ...baseGit,
    mode: 'github',
    branch: 'i18n/preview-edits',
    pullRequestUrl: null,
  };

  it('offers to open a pull request instead of committing', () => {
    renderPanel({ git: githubGit });
    expect(screen.getByRole('button', { name: /open pull request/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /commit locale changes/i })).toBeNull();
    expect(screen.getByRole('button', { name: /reset branch/i })).toBeTruthy();
    cleanup();
  });

  it('links to the open pull request when one exists', () => {
    renderPanel({ git: { ...githubGit, pullRequestUrl: 'https://github.com/acme/site/pull/7' } });
    const link = screen.getByRole('link', { name: /pull request/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/acme/site/pull/7');
    cleanup();
  });
});

describe('ChangesPanel — share link drafts', () => {
  it('renders the draft list instead of git when drafts are given', () => {
    renderPanel({ drafts: [] });
    expect(screen.queryByText('Locale files')).toBeNull();
    expect(screen.queryByText('This session')).toBeNull();
    expect(screen.getByText('Download backup')).toBeTruthy();
    cleanup();
  });
});
