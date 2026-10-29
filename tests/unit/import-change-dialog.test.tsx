// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ImportChangeDialog } from '../../src/studio/features/dashboard/components/ImportChangeDialog.js';
import { Header } from '../../src/studio/features/dashboard/components/Header.js';

const NO_LINK = 'No change link found. A change link contains "lc1.".';

const renderDialog = (props: Partial<React.ComponentProps<typeof ImportChangeDialog>> = {}) => {
  const onClose = vi.fn();
  const onSubmit = vi.fn(async () => true);
  render(
    <ImportChangeDialog isOpen onClose={onClose} onSubmit={onSubmit} error={null} {...props} />
  );
  return { onClose, onSubmit, ...props };
};

const textBox = () => screen.getByLabelText<HTMLTextAreaElement>('Paste a change link');
const reviewButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Review changes' });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ImportChangeDialog', () => {
  it('submits pasted text and closes on success', async () => {
    const { onClose, onSubmit } = renderDialog();
    expect(reviewButton().disabled).toBe(true);
    fireEvent.change(textBox(), { target: { value: 'lc1.abc' } });
    expect(reviewButton().disabled).toBe(false);
    fireEvent.click(reviewButton());
    expect(onSubmit).toHaveBeenCalledWith('lc1.abc');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('loads a chosen file into the box', async () => {
    renderDialog();
    const content = 'https://x/livelocale/index.html#lc1.abc\n';
    const file = new File([content], 'c.txt', { type: 'text/plain' });
    // jsdom 24's File has no text(); the browser's returns the file's contents.
    Object.defineProperty(file, 'text', { value: async () => content });
    const input = screen.getByLabelText<HTMLInputElement>('or choose a file');
    expect(input.accept).toBe('.txt,text/plain');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(textBox().value).toContain('lc1.abc'));
  });

  it('stays open and shows the error when the link cannot be read', async () => {
    const onSubmit = vi.fn(async () => false);
    const { onClose } = renderDialog({ onSubmit, error: NO_LINK });
    fireEvent.change(textBox(), { target: { value: 'hello' } });
    fireEvent.click(reviewButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('hello'));
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toContain(NO_LINK);
  });
});

describe('Header import button', () => {
  const renderHeader = (mode: 'development' | 'static' | 'preview', onImport = vi.fn()) =>
    render(
      <Header
        coveragePercentage={50}
        mode={mode}
        changesCount={0}
        isChangesOpen={false}
        onToggleChanges={() => {}}
        onImport={onImport}
      />
    );

  it('shows Import change link in the header in development mode only', () => {
    vi.stubGlobal('__STUDIO_VERSION__', '0.0.0-test');
    const onImport = vi.fn();
    const { container } = renderHeader('development', onImport);
    const button = container.querySelector<HTMLButtonElement>('#studio-import-button');
    expect(button?.textContent).toBe('Import change link');
    fireEvent.click(button!);
    expect(onImport).toHaveBeenCalledTimes(1);
    cleanup();

    for (const mode of ['static', 'preview'] as const) {
      const view = renderHeader(mode);
      expect(view.container.querySelector('#studio-import-button')).toBeNull();
      cleanup();
    }
  });
});
