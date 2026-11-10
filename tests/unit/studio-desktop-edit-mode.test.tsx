// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, screen, act, cleanup } from '@testing-library/react';
import { useEditMode } from '../../src/studio/features/dashboard/hooks/useEditMode.js';
import {
  EditBrowseSwitch,
  TapNotice,
} from '../../src/studio/features/dashboard/components/EditBrowseSwitch.jsx';
import { FirstRunTips } from '../../src/studio/features/dashboard/components/FirstRunTips.jsx';
import { EmptySelection } from '../../src/studio/features/dashboard/components/EmptySelection.jsx';
import { englishText } from '../../src/studio/i18n/catalogue.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useEditMode start', () => {
  it('starts in Browse when asked, so Alt+Click stays the gesture of a developer', () => {
    const setSiteEditMode = vi.fn();
    const { result } = renderHook(() =>
      useEditMode({ active: true, initial: false, readySeq: 1, setSiteEditMode })
    );
    expect(result.current.editMode).toBe(false);
    expect(setSiteEditMode).toHaveBeenLastCalledWith(false);
    act(() => result.current.setEditMode(true));
    expect(setSiteEditMode).toHaveBeenLastCalledWith(true);
  });

  it('starts in Edit by default', () => {
    const { result } = renderHook(() =>
      useEditMode({ active: true, readySeq: 1, setSiteEditMode: vi.fn() })
    );
    expect(result.current.editMode).toBe(true);
  });
});

describe('the Edit / Browse switch with a mouse', () => {
  it('is named for clicking, and each option is a keyboard-operable radio', () => {
    render(<EditBrowseSwitch editMode={false} onChange={vi.fn()} pointer="mouse" />);
    const group = screen.getByRole('radiogroup', { name: englishText('edit.mode_label') });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('keeps the touch name on a touch device', () => {
    render(<EditBrowseSwitch editMode onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: englishText('touch.mode_label') })).toBeTruthy();
  });

  it('the first hint in Edit says to click, not to tap', () => {
    vi.useFakeTimers();
    render(<TapNotice editMode unkeyedTapSeq={0} pointer="mouse" />);
    expect(screen.getByTestId('tap-notice').textContent).toBe(englishText('edit.hint_click'));
  });
});

describe('copy that follows the click mode', () => {
  it('the first-run tips say to click when a plain click edits', () => {
    render(<FirstRunTips open clickToEdit name="" onNameChange={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(englishText('tips.step1_click'))).toBeTruthy();
    expect(screen.queryByText(englishText('tips.step1'))).toBeNull();
  });

  it('the empty editor names the Edit switch while Browse is on', () => {
    render(<EmptySelection canSwitchToEdit />);
    expect(screen.getByText(englishText('empty.body_switch'))).toBeTruthy();
  });
});
