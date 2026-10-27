// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook } from '@testing-library/react';
import { FirstRunTips } from '../../src/studio/features/dashboard/components/FirstRunTips.jsx';
import {
  FIRST_RUN_TIPS,
  useFirstRun,
} from '../../src/studio/features/dashboard/hooks/useFirstRun.js';
import { readPref, writePref } from '../../src/studio/share/browser.js';

const Harness = ({ enabled = true }: { enabled?: boolean }) => {
  const run = useFirstRun(enabled);
  return (
    <FirstRunTips
      open={run.showTips}
      name={run.name}
      onNameChange={run.setName}
      onDismiss={run.dismiss}
    />
  );
};

beforeEach(() => {
  writePref('tips-seen', null);
  writePref('translator-name', null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('first-run tips', () => {
  it('shows three tips on the first visit and not after Start editing', () => {
    const { unmount } = render(<Harness />);
    for (const tip of FIRST_RUN_TIPS) expect(screen.getByText(tip)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start editing' }));
    expect(screen.queryByText(FIRST_RUN_TIPS[0])).toBeNull();
    expect(readPref('tips-seen')).toBe('1');
    unmount();
    render(<Harness />);
    expect(screen.queryByText(FIRST_RUN_TIPS[0])).toBeNull();
  });

  it('stays hidden when disabled', () => {
    const { result } = renderHook(() => useFirstRun(false));
    expect(result.current.showTips).toBe(false);
  });

  it('saves the name for the Send dialog', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: 'Sara' } });
    expect(readPref('translator-name')).toBe('Sara');
  });

  it('can be dismissed when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start editing' }));
    expect(screen.queryByText(FIRST_RUN_TIPS[0])).toBeNull();
  });
});
