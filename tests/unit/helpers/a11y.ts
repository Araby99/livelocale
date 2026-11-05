import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { DraftList } from '../../../src/studio/features/dashboard/components/DraftList.js';
import { ReviewPanel } from '../../../src/studio/features/dashboard/components/ReviewPanel.js';
import { PluralEditor } from '../../../src/studio/features/dashboard/components/PluralEditor.js';
import { FirstRunTips } from '../../../src/studio/features/dashboard/components/FirstRunTips.js';
import { ImportChangeDialog } from '../../../src/studio/features/dashboard/components/ImportChangeDialog.js';
import { LocalePicker } from '../../../src/studio/features/dashboard/components/LocalePicker.js';
import { TokenModal } from '../../../src/studio/features/dashboard/components/TokenModal.js';
import { RepoPrompt } from '../../../src/studio/features/dashboard/components/RepoPrompt.js';
import { Header } from '../../../src/studio/features/dashboard/components/Header.js';
import { ThemeToggle } from '../../../src/studio/features/dashboard/components/ThemeToggle.js';
import { EditBrowseSwitch } from '../../../src/studio/features/dashboard/components/EditBrowseSwitch.js';
import type { Draft } from '../../../src/studio/transport/drafts.js';
import type { ReviewRow } from '../../../src/studio/share/review.js';
import type { ReviewState } from '../../../src/studio/features/dashboard/hooks/useReview.js';

/** The elements a keyboard or screen-reader user operates. */
const CONTROLS = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button]';

/** Text content outside any `svg`: an icon's drawing is not a name. */
function textOutsideSvg(el: Element): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    else if (node instanceof Element && node.tagName.toLowerCase() !== 'svg') {
      text += textOutsideSvg(node);
    }
  }
  return text;
}

function hasName(el: HTMLElement): boolean {
  if ((el.getAttribute('aria-label') ?? '').trim() !== '') return true;
  const labelledBy = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
  if (
    labelledBy.some((id) => (el.ownerDocument.getElementById(id)?.textContent ?? '').trim() !== '')
  ) {
    return true;
  }
  const labels = (el as HTMLInputElement).labels;
  if (labels && Array.from(labels).some((l) => (l.textContent ?? '').trim() !== '')) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
    return textOutsideSvg(el).trim() !== '';
  }
  return false;
}

function describeControl(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id || el.getAttribute('data-testid') || el.outerHTML.slice(0, 60);
  return `${tag}#${id}`;
}

/**
 * Every control under `root` without a programmatic name. A name is a non-empty
 * `aria-label`, `aria-labelledby` targets with text, an associated `<label>` with text, or,
 * for buttons and links, text outside `svg`. `title` and `placeholder` do not count.
 */
export function unnamedControls(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CONTROLS))
    .filter((el) => !hasName(el))
    .map(describeControl);
}

export type FixtureName =
  | 'DraftList'
  | 'ReviewPanel'
  | 'PluralEditor'
  | 'FirstRunTips'
  | 'ImportChangeDialog'
  | 'LocalePicker'
  | 'TokenModal'
  | 'RepoPrompt'
  | 'Header'
  | 'ThemeToggle'
  | 'EditBrowseSwitch';

const draft = (o: Partial<Draft> = {}): Draft => ({
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

const h = React.createElement;

/** Each component open, with the smallest props its own test file uses. */
export const FIXTURES: Record<FixtureName, () => React.ReactElement> = {
  DraftList: () =>
    h(DraftList, {
      drafts: [draft(), draft({ key: 'home.cta', status: 'sent', sentAt: 2 })],
      onUndo: vi.fn(async () => {}),
      isUndoing: false,
      onDownloadBackup: vi.fn(async () => {}),
      onRestoreBackup: vi.fn(async () => ''),
    }),
  ReviewPanel: () =>
    h(ReviewPanel, {
      review: reviewOf([reviewRow({ locale: 'ar', key: 'home.title', from: 'مرحبا', to: 'أهلا' })]),
      error: null,
      isLoading: false,
      focusKey: null,
      onSelectLocale: () => {},
      onClose: () => {},
      studioHref: 'https://www.acme.com/livelocale/index.html',
      repo: null,
      repoFromManifest: false,
      onRepoChange: () => {},
    }),
  PluralEditor: () =>
    h(PluralEditor, {
      locale: 'ar',
      value: '{count, plural, one {# item} other {# items}}',
      onChange: vi.fn(),
    }),
  FirstRunTips: () =>
    h(FirstRunTips, { open: true, name: '', onNameChange: vi.fn(), onDismiss: vi.fn() }),
  ImportChangeDialog: () =>
    h(ImportChangeDialog, {
      isOpen: true,
      onClose: vi.fn(),
      onSubmit: vi.fn(async () => true),
      error: null,
    }),
  LocalePicker: () =>
    h(LocalePicker, { candidates: ['en', 'ar'], onChoose: vi.fn(), onCancel: vi.fn() }),
  TokenModal: () => h(TokenModal, { isOpen: true, onSubmit: vi.fn() }),
  RepoPrompt: () => h(RepoPrompt, { onSave: vi.fn() }),
  Header: () =>
    h(Header, {
      coveragePercentage: 50,
      changesCount: 0,
      isChangesOpen: false,
      onToggleChanges: () => {},
      unsentCount: 2,
      canSend: true,
      onSend: () => {},
    }),
  ThemeToggle: () => h(ThemeToggle, { choice: 'dark', onChange: () => {} }),
  EditBrowseSwitch: () => h(EditBrowseSwitch, { editMode: true, onChange: () => {} }),
};

/** Renders `FIXTURES[name]()` and returns its container. */
export function renderFixture(name: FixtureName): HTMLElement {
  return render(FIXTURES[name]()).container;
}
