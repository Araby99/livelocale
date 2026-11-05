// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import {
  EditBrowseSwitch,
  TapNotice,
  UNKEYED_NOTICE_MS,
} from '../../src/studio/features/dashboard/components/EditBrowseSwitch.jsx';
import { StudioLayout } from '../../src/studio/features/dashboard/components/StudioLayout.jsx';
import { englishText } from '../../src/studio/i18n/catalogue.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const Harness = () => {
  const [on, setOn] = useState(true);
  return <EditBrowseSwitch editMode={on} onChange={setOn} />;
};

describe('EditBrowseSwitch', () => {
  it('renders Edit and Browse as a radiogroup with Edit checked', () => {
    render(<EditBrowseSwitch editMode={true} onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup', { name: englishText('touch.mode_label') });
    expect(group).toBeTruthy();
    const edit = screen.getByRole('radio', { name: englishText('touch.edit') });
    const browse = screen.getByRole('radio', { name: englishText('touch.browse') });
    expect((edit as HTMLInputElement).checked).toBe(true);
    expect((browse as HTMLInputElement).checked).toBe(false);
  });

  it('choosing Browse calls onChange(false)', () => {
    const onChange = vi.fn();
    render(<EditBrowseSwitch editMode={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: englishText('touch.browse') }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('follows the choice when the parent keeps it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: englishText('touch.browse') }));
    expect(
      (screen.getByRole('radio', { name: englishText('touch.browse') }) as HTMLInputElement).checked
    ).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: englishText('touch.edit') }));
    expect(
      (screen.getByRole('radio', { name: englishText('touch.edit') }) as HTMLInputElement).checked
    ).toBe(true);
  });

  it('each option is at least 44px tall', () => {
    render(<EditBrowseSwitch editMode={false} onChange={vi.fn()} />);
    for (const name of [englishText('touch.edit'), englishText('touch.browse')]) {
      const label = screen.getByRole('radio', { name }).closest('label');
      expect(label?.className).toMatch(/(^|\s)min-h-11(\s|$)/);
      expect(label?.className).toMatch(/(^|\s)min-w-11(\s|$)/);
    }
  });
});

describe('TapNotice', () => {
  const status = () => screen.getByRole('status');

  it('shows the tap hint the first time Edit is on, then never again in this load', () => {
    vi.useFakeTimers();
    const { rerender } = render(<TapNotice editMode={false} unkeyedTapSeq={0} />);
    expect(status().textContent).toBe('');
    rerender(<TapNotice editMode={true} unkeyedTapSeq={0} />);
    expect(status().textContent).toBe(englishText('touch.hint'));
    act(() => vi.advanceTimersByTime(10_000));
    expect(status().textContent).toBe('');
    rerender(<TapNotice editMode={false} unkeyedTapSeq={0} />);
    rerender(<TapNotice editMode={true} unkeyedTapSeq={0} />);
    expect(status().textContent).toBe('');
  });

  it('shows the unkeyed notice for 3 seconds on each unkeyed tap', () => {
    vi.useFakeTimers();
    const { rerender } = render(<TapNotice editMode={true} unkeyedTapSeq={0} />);
    rerender(<TapNotice editMode={true} unkeyedTapSeq={1} />);
    expect(status().textContent).toBe(englishText('touch.unkeyed'));
    expect(status().getAttribute('aria-live')).toBe('polite');
    act(() => vi.advanceTimersByTime(UNKEYED_NOTICE_MS - 1));
    expect(status().textContent).toBe(englishText('touch.unkeyed'));
    act(() => vi.advanceTimersByTime(1));
    expect(status().textContent).toBe('');
    rerender(<TapNotice editMode={true} unkeyedTapSeq={2} />);
    expect(status().textContent).toBe(englishText('touch.unkeyed'));
  });
});

describe('TapNotice on a phone', () => {
  it('sits above the bottom bar instead of over it', () => {
    render(<TapNotice editMode={true} unkeyedTapSeq={0} placement="phone" />);
    const wrapper = screen.getByTestId('tap-notice').parentElement!;
    expect(wrapper.className).toContain('bottom-[calc(4.5rem+env(safe-area-inset-bottom))]');
    expect(wrapper.className).not.toMatch(/(^|\s)bottom-6(\s|$)/);
  });

  it('stays out of sight while a sheet is open, and the live region stays', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <TapNotice editMode={true} unkeyedTapSeq={0} placement="phone" hidden={true} />
    );
    const notice = screen.getByTestId('tap-notice');
    expect(notice.className).toContain('sr-only');
    rerender(<TapNotice editMode={true} unkeyedTapSeq={1} placement="phone" hidden={true} />);
    expect(screen.getByTestId('tap-notice').className).toContain('sr-only');
    rerender(<TapNotice editMode={true} unkeyedTapSeq={2} placement="phone" hidden={false} />);
    expect(screen.getByTestId('tap-notice').className).not.toContain('sr-only');
  });
});

describe('StudioLayout toolbar', () => {
  it('shows the toolbar in the wide layout when one is given (a wide touch tablet)', () => {
    render(
      <StudioLayout
        isWide={true}
        keys={<div />}
        viewer={<div />}
        side={<div />}
        sideLabel="Editor"
        openPanel={null}
        onOpenPanelChange={vi.fn()}
        toolbar={<EditBrowseSwitch editMode={true} onChange={vi.fn()} />}
      />
    );
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.queryByTestId('studio-toggle-keys')).toBeNull();
  });
});
