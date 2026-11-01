// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LocalePicker } from '../../src/studio/features/dashboard/components/LocalePicker.jsx';
import { FirstRunTips } from '../../src/studio/features/dashboard/components/FirstRunTips.jsx';
import { ConfirmModal } from '../../src/studio/features/dashboard/components/ConfirmModal.jsx';
import { ImportChangeDialog } from '../../src/studio/features/dashboard/components/ImportChangeDialog.jsx';
import { TokenModal } from '../../src/studio/features/dashboard/components/TokenModal.jsx';

const focused = () => document.activeElement as HTMLElement;
const pressEscape = () => fireEvent.keyDown(focused(), { key: 'Escape' });

afterEach(cleanup);

describe('Studio dialogs keyboard support', () => {
  it('LocalePicker focuses the first language and cancels on Escape', () => {
    const onCancel = vi.fn();
    render(<LocalePicker candidates={['ar', 'en']} onChoose={vi.fn()} onCancel={onCancel} />);
    expect(focused()).toBe(screen.getByRole('button', { name: 'ar' }));
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('type')).toBe('button');
    }
    pressEscape();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('FirstRunTips focuses the name field and dismisses on Escape', () => {
    const onDismiss = vi.fn();
    render(<FirstRunTips open name="" onNameChange={vi.fn()} onDismiss={onDismiss} />);
    expect(focused()).toBe(document.getElementById('studio-tips-name'));
    pressEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ConfirmModal is a labelled modal dialog that keeps editing on Escape', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmModal showConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', { name: 'Unsaved Changes' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(focused()).toBe(screen.getByRole('button', { name: 'Keep Editing' }));
    pressEscape();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ImportChangeDialog focuses the paste box and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <ImportChangeDialog
        isOpen
        onClose={onClose}
        onSubmit={vi.fn(async () => true)}
        error={null}
      />
    );
    expect(focused()).toBe(document.getElementById('studio-import-text'));
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('TokenModal is a labelled modal dialog that focuses the token field and traps Tab', () => {
    render(<TokenModal isOpen onSubmit={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Access token required' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const field = document.getElementById('studio-access-token')!;
    expect(focused()).toBe(field);
    // The Connect button is disabled while the field is empty, so the field is the only stop.
    fireEvent.keyDown(field, { key: 'Tab' });
    expect(focused()).toBe(field);
  });
});
