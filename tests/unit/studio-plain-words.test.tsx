// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { KeysDirectory } from '../../src/studio/features/dashboard/components/KeysDirectory.jsx';
import { EditorPanel } from '../../src/studio/features/dashboard/components/EditorPanel.jsx';
import { TranslationEditor } from '../../src/studio/features/dashboard/components/TranslationEditor.jsx';
import { IframeViewer } from '../../src/studio/features/dashboard/components/IframeViewer.jsx';
import { Header } from '../../src/studio/features/dashboard/components/Header.jsx';
import { PhoneTopBar } from '../../src/studio/features/dashboard/components/PhoneTopBar.jsx';
import { ChangesPanel } from '../../src/studio/features/dashboard/components/ChangesPanel.jsx';
import { LocaleManager } from '../../src/studio/features/dashboard/components/LocaleManager.jsx';
import { en } from '../../src/studio/i18n/en.js';
import type { Message } from '../../src/studio/i18n/catalogue.js';

(globalThis as Record<string, unknown>).__STUDIO_VERSION__ = '1.2.0';

afterEach(cleanup);

const keysProps = (
  overrides: Partial<React.ComponentProps<typeof KeysDirectory>> = {}
): React.ComponentProps<typeof KeysDirectory> => ({
  filteredKeys: ['home.title'],
  selected: null,
  localeData: { 'home.title': 'Welcome' },
  searchTerm: '',
  setSearchTerm: vi.fn(),
  filterPageOnly: false,
  setFilterPageOnly: vi.fn(),
  visibleKeys: ['home.title'],
  selectKeyDirectly: vi.fn(),
  ...overrides,
});

const editorProps = (
  overrides: Partial<React.ComponentProps<typeof EditorPanel>> = {}
): React.ComponentProps<typeof EditorPanel> => ({
  selected: null,
  inputValue: '',
  locale: 'ar',
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
  ...overrides,
});

const translationProps = (
  overrides: Partial<React.ComponentProps<typeof TranslationEditor>> = {}
): React.ComponentProps<typeof TranslationEditor> => ({
  selected: { key: 'hero.cta', fallbackValue: 'Start free trial', currentValue: '' },
  inputValue: '',
  locale: 'ar',
  referenceLocale: 'en',
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

describe('the Studio catalogue speaks to the person fixing text', () => {
  const values = (m: Message) => (typeof m === 'string' ? [m] : Object.values(m));

  it('leaves implementation words out of the copy', () => {
    const jargon =
      /\biframe\b|bridge|fallback value|workspace|locale directory|translation output/i;
    const found = Object.entries(en).filter(([, m]) => values(m).some((v) => jargon.test(v)));
    expect(found.map(([k]) => k)).toEqual([]);
  });

  it('gives every counted noun a singular form', () => {
    // "{count} keys" needs "1 key": a plain string, or a plural message without a one form, cannot say it.
    const counted = /\{count\} [a-z]/i;
    const found = Object.entries(en).filter(([, m]) =>
      typeof m === 'string' ? counted.test(m) : counted.test(m.other) && m.one === undefined
    );
    expect(found.map(([k]) => k)).toEqual([]);
  });
});

describe('Keys list', () => {
  it('calls keys texts and counts them in the singular for one', () => {
    render(<KeysDirectory {...keysProps()} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Texts');
    expect(screen.getByText('1 text')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All texts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'On this page' })).toBeTruthy();
  });

  it('counts several texts in the plural', () => {
    render(<KeysDirectory {...keysProps({ filteredKeys: ['a', 'b', 'c'] })} />);
    expect(screen.getByText('3 texts')).toBeTruthy();
  });
});

describe('Empty editor', () => {
  it('tells a desktop user to hold Alt (Option on Mac) and click', () => {
    render(<EditorPanel {...editorProps()} />);
    const panel = screen.getByTestId('editor-panel');
    expect(panel.textContent).toContain('Hold Alt (Option on Mac) and click any text on the page');
    expect(panel.textContent).not.toMatch(/iframe|sidebar/i);
  });

  it('says a plain click is enough when click-to-edit is on', () => {
    render(<EditorPanel {...editorProps({ clickToEdit: true })} />);
    const panel = screen.getByTestId('editor-panel');
    expect(panel.textContent).toContain('Click any text on the page');
    expect(panel.textContent).not.toContain('Alt');
  });

  it('has a plain panel title', () => {
    render(<EditorPanel {...editorProps()} />);
    expect(screen.getByTestId('editor-panel').textContent).not.toContain('Translation Studio');
  });
});

describe('Translation editor labels', () => {
  it('names the source and the edited language, as the phone does', () => {
    render(<TranslationEditor {...translationProps()} />);
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Arabic')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /Reference \(Fallback Value\)|Translation Output/
    );
  });

  it('keeps the key visible as a small Text ID', () => {
    render(<TranslationEditor {...translationProps()} />);
    const id = screen.getByTestId('editor-text-id');
    expect(id.textContent).toContain('Text ID');
    expect(id.textContent).toContain('hero.cta');
    expect(document.body.textContent).not.toContain('Translation Key');
  });

  it('labels the old text "Before your change" when the source language is edited', () => {
    render(
      <TranslationEditor
        {...translationProps({
          locale: 'en',
          selected: { key: 'hero.cta', fallbackValue: 'Start free trial', currentValue: 'Start' },
          inputValue: 'Start',
        })}
      />
    );
    expect(screen.getByText('Before your change')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('says on a share link that Save keeps the change in this browser until it is sent', () => {
    render(<TranslationEditor {...translationProps({ keepsInBrowser: true })} />);
    expect(screen.getByTestId('save-hint').textContent).toMatch(/in this browser/);
    expect(screen.getByTestId('save-hint').textContent).toContain('Send to developer');
    cleanup();
    render(<TranslationEditor {...translationProps()} />);
    expect(screen.queryByTestId('save-hint')).toBeNull();
  });
});

describe('Preview panel', () => {
  const viewer = (status: 'connecting' | 'connected') => (
    <IframeViewer
      iframeRef={React.createRef<HTMLIFrameElement>()}
      appOrigin="http://localhost:3000"
      appUrl="http://localhost:3000"
      connectionStatus={status}
      navigation={{
        path: '/',
        pendingPath: null,
        recent: [],
        sitePages: [],
        onNavigate: vi.fn(() => 'ok' as const),
        isNavigating: false,
        reload: vi.fn(),
        showLocale: vi.fn(),
      }}
    />
  );

  it('gives the preview frame a title', () => {
    const { container } = render(viewer('connected'));
    expect(container.querySelector('iframe')?.getAttribute('title')).toBe('Site preview');
  });

  it('describes the connection in plain words', () => {
    const { container } = render(viewer('connecting'));
    expect(container.textContent).not.toMatch(/bridge|iframe|frame/i);
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
  });
});

describe('Header', () => {
  const header = (extra: Partial<React.ComponentProps<typeof Header>> = {}) =>
    render(
      <Header
        coveragePercentage={50}
        changesCount={0}
        isChangesOpen={false}
        onToggleChanges={() => {}}
        {...extra}
      />
    );

  it('does not call a 1.x release beta', () => {
    const { container } = header();
    expect(container.textContent).toContain('v1.2.0');
    expect(container.textContent).not.toMatch(/beta/i);
  });

  it('drops where the language came from while the mismatch notice shows, so they never overlap', () => {
    header({
      targetLocale: { locale: 'ar', source: 'manual', mismatch: 'en' },
      locales: ['ar', 'en'],
      onChooseLocale: vi.fn(),
    });
    const chip = screen.getByTestId('target-locale');
    expect(chip.textContent).toContain('Switch to');
    expect(chip.textContent).not.toContain('chosen by you');
  });

  it('names the languages in the mismatch notice', () => {
    header({
      targetLocale: { locale: 'ar', source: 'manual', mismatch: 'en' },
      locales: ['ar', 'en'],
      onChooseLocale: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Switch to English (en)' })).toBeTruthy();
  });
});

describe('Phone language menu', () => {
  it('lists languages by name, not by code alone', () => {
    render(
      <PhoneTopBar
        unsentCount={0}
        locale="ar"
        locales={['ar', 'en']}
        onChooseLocale={vi.fn()}
        menu={null}
      />
    );
    const select = screen.getByRole('combobox');
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Arabic (ar)', 'English (en)']);
  });
});

describe('Changes panel on a share link', () => {
  it('shows no git branch, since a share link has no git', () => {
    const { container } = render(
      <ChangesPanel
        isOpen
        onClose={vi.fn()}
        git={{
          available: true,
          isRepo: true,
          branch: 'main',
          changes: [],
          diff: '',
          mode: 'static',
        }}
        gitError={null}
        isGitLoading={false}
        lastCommit={null}
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        onRefresh={vi.fn()}
        history={[]}
        onUndo={vi.fn()}
        isUndoing={false}
        drafts={[]}
      />
    );
    expect(container.textContent).not.toContain('main');
    // A dialog role belongs on a plain container, not on a landmark like <aside>.
    expect(container.querySelector('aside[role="dialog"]')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('Delete a language', () => {
  const manager = () =>
    render(
      <LocaleManager
        locale="ar"
        locales={['ar', 'en', 'es']}
        sourceLocale="en"
        isLoading={false}
        error={null}
        onAddLocale={vi.fn(async () => {})}
        onRenameLocale={vi.fn(async () => {})}
        onDeleteLocale={vi.fn(async () => {})}
      />
    );

  it('names the language in the confirmation', () => {
    manager();
    fireEvent.click(screen.getByRole('button', { name: 'Delete language es' }));
    expect(document.body.textContent).toContain('Delete Spanish (es)?');
  });

  it('is not offered for the source language', () => {
    manager();
    expect(screen.queryByRole('button', { name: 'Delete language en' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete language ar' })).toBeTruthy();
  });
});
