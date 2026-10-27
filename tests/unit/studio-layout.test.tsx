// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, renderHook, screen, act, cleanup, fireEvent } from '@testing-library/react';
import {
  useMediaQuery,
  WIDE_LAYOUT_QUERY,
} from '../../src/studio/features/dashboard/hooks/useMediaQuery.js';
import {
  StudioLayout,
  type StudioPanel,
} from '../../src/studio/features/dashboard/components/StudioLayout.js';

type ChangeListener = (event: { matches: boolean }) => void;

const fakeMatchMedia = (initial: boolean) => {
  const listeners = new Set<ChangeListener>();
  const mql = {
    matches: initial,
    media: WIDE_LAYOUT_QUERY,
    addEventListener: vi.fn((_type: string, l: ChangeListener) => listeners.add(l)),
    removeEventListener: vi.fn((_type: string, l: ChangeListener) => listeners.delete(l)),
  };
  const fire = (matches: boolean) => {
    mql.matches = matches;
    for (const l of [...listeners]) l({ matches });
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql)
  );
  return { mql, fire };
};

const Counter = () => {
  const [count, setCount] = useState(0);
  return (
    <button type="button" data-testid="counter" onClick={() => setCount((c) => c + 1)}>
      {count}
    </button>
  );
};

const renderLayout = (
  props: Partial<{
    isWide: boolean;
    openPanel: StudioPanel;
    onOpenPanelChange: (p: StudioPanel) => void;
  }>
) => {
  const onOpenPanelChange = props.onOpenPanelChange ?? vi.fn();
  const element = (isWide: boolean, openPanel: StudioPanel) => (
    <StudioLayout
      isWide={isWide}
      keys={<div data-testid="keys-slot">keys</div>}
      viewer={<div data-testid="viewer-slot">viewer</div>}
      side={<Counter />}
      sideLabel="Editor"
      openPanel={openPanel}
      onOpenPanelChange={onOpenPanelChange}
    />
  );
  const result = render(element(props.isWide ?? false, props.openPanel ?? null));
  return { ...result, element, onOpenPanelChange };
};

describe('useMediaQuery', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('returns the fallback when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery(WIDE_LAYOUT_QUERY, true));
    expect(result.current).toBe(true);
  });

  it('follows change events and unsubscribes on unmount', () => {
    const { mql, fire } = fakeMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery(WIDE_LAYOUT_QUERY, true));
    expect(result.current).toBe(false);
    act(() => fire(true));
    expect(result.current).toBe(true);
    unmount();
    const added = mql.addEventListener.mock.calls[0];
    expect(added[0]).toBe('change');
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', added[1]);
  });
});

describe('StudioLayout', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all three slots inline without toggles when wide', () => {
    renderLayout({ isWide: true });
    expect(screen.getByTestId('keys-slot')).toBeTruthy();
    expect(screen.getByTestId('viewer-slot')).toBeTruthy();
    expect(screen.getByTestId('counter')).toBeTruthy();
    expect(screen.queryByTestId('studio-toggle-keys')).toBeNull();
    expect(screen.queryByTestId('studio-toggle-side')).toBeNull();
    expect((screen.getByTestId('studio-drawer-keys') as HTMLElement).hidden).toBe(false);
    expect((screen.getByTestId('studio-drawer-side') as HTMLElement).hidden).toBe(false);
  });

  it('keeps both drawers hidden in compact mode until toggled', () => {
    const { onOpenPanelChange } = renderLayout({ isWide: false });
    expect((screen.getByTestId('studio-drawer-keys') as HTMLElement).hidden).toBe(true);
    expect((screen.getByTestId('studio-drawer-side') as HTMLElement).hidden).toBe(true);
    fireEvent.click(screen.getByTestId('studio-toggle-side'));
    expect(onOpenPanelChange).toHaveBeenCalledWith('side');
  });

  it('closes the open drawer on Escape', () => {
    const { onOpenPanelChange } = renderLayout({ isWide: false, openPanel: 'side' });
    expect((screen.getByTestId('studio-drawer-side') as HTMLElement).hidden).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenPanelChange).toHaveBeenCalledWith(null);
  });

  it('reports the open drawer through aria-expanded', () => {
    renderLayout({ isWide: false, openPanel: 'keys' });
    const keysToggle = screen.getByTestId('studio-toggle-keys');
    const sideToggle = screen.getByTestId('studio-toggle-side');
    expect(keysToggle.getAttribute('aria-expanded')).toBe('true');
    expect(sideToggle.getAttribute('aria-expanded')).toBe('false');
    expect(keysToggle.getAttribute('aria-controls')).toBe(
      screen.getByTestId('studio-drawer-keys').id
    );
    expect(sideToggle.getAttribute('aria-controls')).toBe(
      screen.getByTestId('studio-drawer-side').id
    );
  });

  it('does not remount the side slot when crossing the breakpoint', () => {
    const { element, rerender } = renderLayout({ isWide: true });
    fireEvent.click(screen.getByTestId('counter'));
    fireEvent.click(screen.getByTestId('counter'));
    expect(screen.getByTestId('counter').textContent).toBe('2');
    rerender(element(false, 'side'));
    expect(screen.getByTestId('counter').textContent).toBe('2');
  });
});
