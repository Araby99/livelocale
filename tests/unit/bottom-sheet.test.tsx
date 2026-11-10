// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { BottomSheet } from '../../src/studio/features/dashboard/components/BottomSheet.jsx';
import {
  keyboardInset,
  useKeyboardInset,
  useVisualViewportHeight,
} from '../../src/studio/features/dashboard/hooks/useKeyboardInset.js';

/** A stand-in for `window.visualViewport` that tests can resize like a phone keyboard. */
class FakeViewport extends EventTarget {
  height: number;
  offsetTop = 0;
  constructor(height: number) {
    super();
    this.height = height;
  }
  resize(height: number) {
    this.height = height;
    this.dispatchEvent(new Event('resize'));
  }
}

// jsdom has no PointerEvent, so testing-library would drop clientY from pointer events.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  (window as { PointerEvent?: unknown }).PointerEvent = PointerEventShim;
}

const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

function installViewport(height: number): FakeViewport {
  const vv = new FakeViewport(height);
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  return vv;
}

afterEach(() => {
  cleanup();
  if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport);
  else delete (window as { visualViewport?: unknown }).visualViewport;
});

const Sheet = ({ open, onClose = vi.fn() }: { open: boolean; onClose?: () => void }) => (
  <BottomSheet open={open} onClose={onClose} labelledBy="sheet-title">
    <h2 id="sheet-title">Edit text</h2>
    <input aria-label="Translation" />
  </BottomSheet>
);

const Harness = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} />
    </>
  );
};

describe('keyboardInset', () => {
  it('keyboardInset returns 0 without keyboard and 300 for a 300px keyboard', () => {
    expect(keyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300);
    // A page scrolled up under the keyboard moves the visual viewport down, not the keyboard.
    expect(keyboardInset(800, { height: 500, offsetTop: 100 })).toBe(200);
    expect(keyboardInset(800, { height: 900, offsetTop: 0 })).toBe(0);
  });

  it('useKeyboardInset is 0 without visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    const Probe = () => <output>{useKeyboardInset()}</output>;
    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('0');
  });

  it('useVisualViewportHeight follows visualViewport and falls back to innerHeight', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    const Probe = () => <output>{useVisualViewportHeight()}</output>;
    const { unmount } = render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('800');
    unmount();
    const vv = installViewport(800);
    render(<Probe />);
    act(() => vv.resize(500));
    expect(screen.getByRole('status').textContent).toBe('500');
  });
});

describe('BottomSheet', () => {
  it('renders nothing while closed', () => {
    render(<Sheet open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sheet is a labelled modal dialog', () => {
    render(<Sheet open />);
    const dialog = screen.getByRole('dialog', { name: 'Edit text' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.className).toContain('max-h-[85dvh]');
  });

  it('backdrop click and Escape call onClose', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('has a labelled Close button, for screen reader and switch users who cannot drag', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} />);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(screen.getByRole('dialog').contains(close)).toBe(true);
    // It comes after the content, so opening the sheet still lands in the field.
    expect(document.activeElement).toBe(screen.getByLabelText('Translation'));
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves the Close button out when the content brings its own', () => {
    render(
      <BottomSheet open onClose={vi.fn()} labelledBy="t" closeButton={false}>
        <h2 id="t">Send</h2>
      </BottomSheet>
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('a click inside the sheet does not close it', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Translation'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focus moves into the sheet and back on close', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText('Translation'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('sheet bottom follows the keyboard inset', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const vv = installViewport(800);
    render(<Sheet open />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.bottom).toBe('0px');
    act(() => vv.resize(500));
    expect(dialog.style.bottom).toBe('300px');
    act(() => vv.resize(800));
    expect(dialog.style.bottom).toBe('0px');
  });

  it('sheet height never exceeds the space left above the keyboard', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const vv = installViewport(800);
    render(<Sheet open />);
    const dialog = screen.getByRole('dialog');
    act(() => vv.resize(500));
    expect(parseFloat(dialog.style.maxHeight)).toBeLessThanOrEqual(500);
    expect(dialog.style.maxHeight).toMatch(/px$/);
  });

  it('dragging the handle down past the threshold closes, a short drag does not', () => {
    const onClose = vi.fn();
    // Slow drags, so only the distance decides.
    const now = vi.spyOn(performance, 'now');
    render(<Sheet open onClose={onClose} />);
    const handle = screen.getByTestId('bottom-sheet-handle');
    now.mockReturnValue(1000);
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 140, pointerId: 1 });
    now.mockReturnValue(2000);
    fireEvent.pointerUp(handle, { clientY: 140, pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();
    now.mockReturnValue(3000);
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 200, pointerId: 1 });
    now.mockReturnValue(4000);
    fireEvent.pointerUp(handle, { clientY: 200, pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('a quick flick down closes even when short', () => {
    const onClose = vi.fn();
    const now = vi.spyOn(performance, 'now');
    render(<Sheet open onClose={onClose} />);
    const handle = screen.getByTestId('bottom-sheet-handle');
    now.mockReturnValue(1000);
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    now.mockReturnValue(1050);
    fireEvent.pointerUp(handle, { clientY: 140, pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('with a light backdrop, taps over the top bar pass through to the page', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} labelledBy="sheet-title" lightBackdrop>
        <h2 id="sheet-title">Edit text</h2>
      </BottomSheet>
    );
    const dialog = screen.getByRole('dialog');
    const backdrop = screen.getByTestId('bottom-sheet-backdrop');
    const wrapper = backdrop.parentElement!;
    // The wrapper spans the whole screen, top bar included, so it must not catch taps.
    expect(wrapper.className).toContain('pointer-events-none');
    expect(backdrop.className).toContain('pointer-events-auto');
    expect(backdrop.className).toContain('top-14');
    expect(dialog.className).toContain('pointer-events-auto');
    // A click that lands on the wrapper itself (only possible over the bar) never closes.
    fireEvent.click(wrapper);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('with the full backdrop, the sheet still covers the whole screen', () => {
    render(<Sheet open />);
    const backdrop = screen.getByTestId('bottom-sheet-backdrop');
    expect(backdrop.parentElement!.className).not.toContain('pointer-events-none');
    expect(backdrop.className).toContain('top-0');
  });
});
