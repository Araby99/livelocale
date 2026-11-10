// @vitest-environment jsdom
import React, { useEffect, useState } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChangesPanel } from '../../src/studio/features/dashboard/components/ChangesPanel.jsx';
import {
  StudioLayout,
  type StudioPanel,
} from '../../src/studio/features/dashboard/components/StudioLayout.jsx';
import { KeysDirectory } from '../../src/studio/features/dashboard/components/KeysDirectory.jsx';
import type { GitState } from '../../src/studio/api.js';

afterEach(cleanup);

const git: GitState = {
  available: true,
  isRepo: true,
  branch: 'main',
  changes: [{ path: 'locales/en.json', status: 'modified' }],
  diff: '',
};

const renderPanel = () => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    git,
    gitError: null,
    isGitLoading: false,
    lastCommit: null,
    onCommit: vi.fn().mockResolvedValue('abc1234'),
    onDiscard: vi.fn().mockResolvedValue(true),
    onRefresh: vi.fn(),
    history: [],
    onUndo: vi.fn().mockResolvedValue(undefined),
    isUndoing: false,
  };
  render(<ChangesPanel {...props} />);
  return props;
};

/** Compact StudioLayout whose open drawer lives in state, as in the app. */
const Harness = ({ initial = null }: { initial?: StudioPanel }) => {
  const [openPanel, setOpenPanel] = useState<StudioPanel>(null);
  // Opens a drawer from outside the toggles after mount, as an Alt+Click pick does.
  useEffect(() => {
    if (initial !== null) setOpenPanel(initial);
  }, [initial]);
  return (
    <StudioLayout
      isWide={false}
      keys={<input aria-label="k" />}
      viewer={<div>viewer</div>}
      side={<input aria-label="s" />}
      sideLabel="Editor"
      openPanel={openPanel}
      onOpenPanelChange={setOpenPanel}
    />
  );
};

const keysProps = {
  filteredKeys: [] as string[],
  selected: null,
  localeData: {},
  searchTerm: '',
  setSearchTerm: vi.fn(),
  filterPageOnly: false,
  setFilterPageOnly: vi.fn(),
  visibleKeys: [] as string[],
  selectKeyDirectly: vi.fn(),
};

describe('Studio keyboard access', () => {
  it('ChangesPanel is a labelled modal that focuses its first control and closes on Escape', () => {
    const props = renderPanel();
    const dialog = screen.getByRole('dialog', { name: 'Changes' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the Keys drawer when its toggle opens it, and back to the toggle on Escape', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('studio-toggle-keys'));
    expect(document.activeElement).toBe(screen.getByLabelText('k'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect((screen.getByTestId('studio-drawer-keys') as HTMLElement).hidden).toBe(true);
    expect(document.activeElement).toBe(screen.getByTestId('studio-toggle-keys'));
  });

  it('does not move focus when a drawer opens without its toggle', () => {
    render(<Harness initial="side" />);
    expect((screen.getByTestId('studio-drawer-side') as HTMLElement).hidden).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('marks the scope buttons pressed and the active key current', () => {
    render(
      <KeysDirectory
        {...keysProps}
        filterPageOnly={false}
        selected={{ key: 'a' } as any}
        filteredKeys={['a', 'b']}
      />
    );
    expect(screen.getByRole('button', { name: 'All texts' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: 'On this page' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByRole('button', { name: /^a/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /^b/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('reports a keyboard pick but not a mouse pick', () => {
    const onKeyboard = vi.fn();
    render(
      <KeysDirectory {...keysProps} filteredKeys={['a']} onKeyActivatedByKeyboard={onKeyboard} />
    );
    fireEvent.click(screen.getByRole('button', { name: /^a/ }), { detail: 1 });
    expect(onKeyboard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^a/ }), { detail: 0 });
    expect(onKeyboard).toHaveBeenCalledWith('a');
  });
});
