// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook } from '@testing-library/react';
import { FirstRunTips } from '../../src/studio/features/dashboard/components/FirstRunTips.jsx';
import {
  FIRST_RUN_TIP_KEYS,
  useFirstRun,
} from '../../src/studio/features/dashboard/hooks/useFirstRun.js';
import { readPref, writePref } from '../../src/studio/share/browser.js';
import { englishText } from '../../src/studio/i18n/catalogue.js';

const FIRST_RUN_TIPS = FIRST_RUN_TIP_KEYS.map((k) => englishText(k));

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

describe('first-run tips on touch devices', () => {
  const tips = (touch: boolean) =>
    render(
      <FirstRunTips open={true} touch={touch} name="" onNameChange={vi.fn()} onDismiss={vi.fn()} />
    );

  it('tips show the tap step on touch and the Alt step otherwise', () => {
    const { unmount } = tips(true);
    expect(screen.getByText(englishText('tips.step1_touch'))).toBeTruthy();
    expect(screen.queryByText(englishText('tips.step1'))).toBeNull();
    expect(screen.getByText(englishText('tips.step2'))).toBeTruthy();
    unmount();
    tips(false);
    expect(screen.getByText(englishText('tips.step1'))).toBeTruthy();
    expect(screen.queryByText(englishText('tips.step1_touch'))).toBeNull();
  });
});

describe('first-run tips on a touch device whose site cannot tap to edit', () => {
  it('says the site can only be viewed on a phone or tablet, never to tap text', () => {
    render(
      <FirstRunTips
        open={true}
        touch={true}
        viewOnly={true}
        name=""
        onNameChange={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(englishText('tips.view_only'))).toBeTruthy();
    expect(
      screen.getByText(
        'On a phone or tablet, this site can only be viewed. Open this link on a computer to edit.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(englishText('tips.step1_touch'))).toBeNull();
    expect(screen.queryByText(/Tap any text/)).toBeNull();
    expect(screen.queryByText(englishText('tips.step1'))).toBeNull();
  });
});
