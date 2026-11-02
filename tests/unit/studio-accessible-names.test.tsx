// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { copyText } from '../../src/studio/share/browser.js';
import { KeysDirectory } from '../../src/studio/features/dashboard/components/KeysDirectory.jsx';
import { EditorPanel } from '../../src/studio/features/dashboard/components/EditorPanel.jsx';
import { LocaleManager } from '../../src/studio/features/dashboard/components/LocaleManager.jsx';
import { LocaleRow } from '../../src/studio/features/dashboard/components/LocaleRow.jsx';
import { ChangesPanel } from '../../src/studio/features/dashboard/components/ChangesPanel.jsx';
import { IframeViewer } from '../../src/studio/features/dashboard/components/IframeViewer.jsx';
import { SendDialog } from '../../src/studio/features/dashboard/components/SendDialog.jsx';
import { GitHubIssueAction } from '../../src/studio/features/dashboard/components/GitHubIssueAction.jsx';
import type { GitState } from '../../src/studio/api.js';
import type { Draft } from '../../src/studio/transport/drafts.js';
import { MANIFEST, SHA_A, STUDIO_URL } from './helpers/share-fixtures.js';
import { FIXTURES, renderFixture, unnamedControls, type FixtureName } from './helpers/a11y.js';

(globalThis as Record<string, unknown>).__STUDIO_VERSION__ = 'test';

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

const editorProps: React.ComponentProps<typeof EditorPanel> = {
  selected: {
    key: 'home.greeting',
    fallbackValue: 'Hello {name}, <b>welcome</b>',
    currentValue: '',
  },
  inputValue: 'Hola {name}',
  locale: 'en',
  isLoading: false,
  isSuccess: false,
  error: null,
  saveWarning: null,
  onInputChange: vi.fn(),
  onLocaleChange: vi.fn(),
  onSave: vi.fn(),
  onForceSave: vi.fn(),
  onDismissWarning: vi.fn(),
  onClear: vi.fn(),
  locales: ['en', 'ar'],
  onAddLocale: vi.fn(async () => {}),
  onRenameLocale: vi.fn(async () => {}),
  onDeleteLocale: vi.fn(async () => {}),
};

const viewerProps: React.ComponentProps<typeof IframeViewer> = {
  iframeRef: React.createRef<HTMLIFrameElement>(),
  appOrigin: 'http://localhost:3000',
  appUrl: 'http://localhost:3000',
  connectionStatus: 'connected',
  currentPath: '/',
};

const baseGit: GitState = {
  available: true,
  isRepo: true,
  branch: 'main',
  changes: [{ path: 'locales/en.json', status: 'modified' }],
  diff: '--- a/locales/en.json\n+++ b/locales/en.json\n-  "a": "x"\n+  "a": "y"\n',
};

const renderPanel = (overrides: Partial<React.ComponentProps<typeof ChangesPanel>> = {}) =>
  render(
    <ChangesPanel
      isOpen
      onClose={vi.fn()}
      git={baseGit}
      gitError={null}
      isGitLoading={false}
      lastCommit={null}
      onCommit={vi.fn().mockResolvedValue('abc1234')}
      onDiscard={vi.fn().mockResolvedValue(true)}
      onRefresh={vi.fn()}
      history={[]}
      onUndo={vi.fn().mockResolvedValue(undefined)}
      isUndoing={false}
      {...overrides}
    />
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Studio accessible names', () => {
  it('names every control in KeysDirectory', () => {
    const { container } = render(
      <KeysDirectory
        filteredKeys={['home.title']}
        selected={null}
        localeData={{ 'home.title': 'Welcome' }}
        searchTerm=""
        setSearchTerm={vi.fn()}
        filterPageOnly={false}
        setFilterPageOnly={vi.fn()}
        visibleKeys={null}
        selectKeyDirectly={vi.fn()}
      />
    );
    expect(unnamedControls(container)).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'Search keys or values' })).toBeTruthy();
  });

  it('names the locale select and the manage toggle in EditorPanel', () => {
    const { container } = render(<EditorPanel {...editorProps} />);
    expect(unnamedControls(container)).toEqual([]);
    expect(screen.getByRole('combobox', { name: 'Locale' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manage Languages' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Translation' }).id).toBe(
      'studio-translation-input'
    );
  });

  it('names the new-locale field and per-row locale actions with the locale code', () => {
    const { container } = render(
      <LocaleManager
        locale="en"
        locales={['en', 'ar']}
        isLoading={false}
        error={null}
        onAddLocale={vi.fn(async () => {})}
        onRenameLocale={vi.fn(async () => {})}
        onDeleteLocale={vi.fn(async () => {})}
      />
    );
    expect(unnamedControls(container)).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'Add New Locale' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rename locale ar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete locale ar' })).toBeTruthy();
  });

  it('names the rename field, Save rename and Cancel while renaming', () => {
    const { container } = render(
      <LocaleRow
        code="ar"
        isActive={false}
        isLoading={false}
        allLocales={['en', 'ar']}
        onRename={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename locale ar' }));
    expect(unnamedControls(container)).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'New code for ar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save rename' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('names Refresh, Close and the commit message in ChangesPanel', () => {
    const entry = {
      id: '1',
      locale: 'en',
      key: 'home.title',
      previousValue: 'Old',
      nextValue: 'New',
      at: Date.now(),
    };
    const { container } = renderPanel({ history: [entry] });
    expect(unnamedControls(container)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Commit message' }).id).toBe(
      'studio-commit-message'
    );
  });

  it('names Reload Frame in IframeViewer', () => {
    const { container } = render(<IframeViewer {...viewerProps} />);
    expect(unnamedControls(container)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Reload Frame' })).toBeTruthy();
  });

  it('names every control in SendDialog once a link is shown', async () => {
    const { container } = render(
      <SendDialog
        isOpen
        onClose={vi.fn()}
        drafts={[draft(1), draft(2)]}
        manifest={MANIFEST}
        studioHref={STUDIO_URL}
        onMarkSent={vi.fn(async () => {})}
      />
    );
    const link = await screen.findByRole('textbox', { name: 'Change link' });
    expect(link.id).toBe('studio-send-link');
    expect(unnamedControls(container)).toEqual([]);
  });

  it('names the manual-copy box in GitHubIssueAction', async () => {
    vi.mocked(copyText).mockResolvedValueOnce(false);
    const { container } = render(
      <GitHubIssueAction repo="acme/web" token={'lc1.' + 'A'.repeat(9000)} count={1} label="Open" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy change block' }));
    const box = await screen.findByTestId('manual-copy');
    expect(box.getAttribute('aria-label')).toBe('Issue text to copy');
    expect(unnamedControls(container)).toEqual([]);
  });

  it.each(Object.keys(FIXTURES) as FixtureName[])('names every control in %s', (name) => {
    expect(unnamedControls(renderFixture(name))).toEqual([]);
  });
});
