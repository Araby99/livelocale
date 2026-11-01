// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useDialog } from '../../src/studio/features/dashboard/hooks/useDialog.js';

const Dialog = ({
  open,
  onEscape,
  name = 'dialog',
  empty = false,
}: {
  open: boolean;
  onEscape?: () => void;
  name?: string;
  empty?: boolean;
}) => {
  const ref = useDialog<HTMLDivElement>(open, onEscape);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={name}>
      {!empty && (
        <>
          <button type="button">{`${name} first`}</button>
          <button type="button" disabled>
            {`${name} disabled`}
          </button>
          <input aria-label={`${name} field`} />
          <button type="button">{`${name} last`}</button>
        </>
      )}
    </div>
  );
};

const focused = () => document.activeElement as HTMLElement | null;

afterEach(cleanup);

describe('useDialog', () => {
  it('moves focus to the first enabled control when the dialog opens', () => {
    render(<Dialog open />);
    expect(focused()).toBe(screen.getByRole('button', { name: 'dialog first' }));
  });

  it('focuses the dialog itself when it has no control', () => {
    render(<Dialog open empty />);
    const dialog = screen.getByRole('dialog');
    expect(focused()).toBe(dialog);
    expect(dialog.getAttribute('tabindex')).toBe('-1');
  });

  it('calls onEscape on Escape and marks the event handled', () => {
    const onEscape = vi.fn();
    render(<Dialog open onEscape={onEscape} />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    focused()!.dispatchEvent(event);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves Escape alone without onEscape', () => {
    render(<Dialog open />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    focused()!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps Tab inside the dialog in both directions', () => {
    render(<Dialog open />);
    const first = screen.getByRole('button', { name: 'dialog first' });
    const last = screen.getByRole('button', { name: 'dialog last' });

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(focused()).toBe(first);

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(focused()).toBe(last);
  });

  it('lets Tab move normally between inner controls', () => {
    render(<Dialog open />);
    const first = screen.getByRole('button', { name: 'dialog first' });
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    first.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('brings focus back when it is outside the dialog', () => {
    render(
      <>
        <button type="button">behind</button>
        <Dialog open />
      </>
    );
    const behind = screen.getByRole('button', { name: 'behind' });
    behind.focus();
    fireEvent.keyDown(behind, { key: 'Tab' });
    expect(focused()).toBe(screen.getByRole('button', { name: 'dialog first' }));
  });

  it('lets only the topmost dialog handle keys', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    render(
      <>
        <Dialog open name="lower" onEscape={lower} />
        <Dialog open name="upper" onEscape={upper} />
      </>
    );
    fireEvent.keyDown(focused()!, { key: 'Escape' });
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it('gives focus back to the opener when the dialog closes', () => {
    const { rerender } = render(
      <>
        <button type="button">opener</button>
        <Dialog open={false} />
      </>
    );
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();
    rerender(
      <>
        <button type="button">opener</button>
        <Dialog open />
      </>
    );
    expect(focused()).toBe(screen.getByRole('button', { name: 'dialog first' }));
    rerender(
      <>
        <button type="button">opener</button>
        <Dialog open={false} />
      </>
    );
    expect(focused()).toBe(opener);
  });

  it('stops listening once closed', () => {
    const onEscape = vi.fn();
    const { rerender } = render(<Dialog open onEscape={onEscape} />);
    rerender(<Dialog open={false} onEscape={onEscape} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
