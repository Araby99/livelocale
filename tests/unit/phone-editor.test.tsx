// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { PhoneEditor } from '../../src/studio/features/dashboard/components/PhoneEditor.jsx';
import { englishText } from '../../src/studio/i18n/catalogue.js';

const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

afterEach(() => {
  cleanup();
  for (const [name, d] of [
    ['scrollHeight', originalScrollHeight],
    ['clientHeight', originalClientHeight],
  ] as const) {
    if (d) Object.defineProperty(HTMLElement.prototype, name, d);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  }
});

const editor = (props: Partial<React.ComponentProps<typeof PhoneEditor>> = {}) => (
  <PhoneEditor
    selected={{ key: 'hero.cta', fallbackValue: 'Start free trial', currentValue: '' }}
    inputValue=""
    locale="ar"
    referenceLocale="en"
    isLoading={false}
    isSuccess={false}
    error={null}
    saveWarning={null}
    onInputChange={vi.fn()}
    onSave={vi.fn()}
    onForceSave={vi.fn()}
    onDismissWarning={vi.fn()}
    {...props}
  />
);

describe('PhoneEditor', () => {
  it('shows the key, the edited locale, the reference and the field, nothing more', () => {
    render(editor());
    const editorRoot = screen.getByTestId('phone-editor');
    expect(within(editorRoot).getByText('hero.cta')).toBeTruthy();
    expect(within(editorRoot).getByText('Arabic (ar)')).toBeTruthy();
    expect(within(editorRoot).getByText('Start free trial')).toBeTruthy();
    expect(within(editorRoot).getByText('English')).toBeTruthy();
    const field = screen.getByRole('textbox', { name: englishText('editor.translation_label') });
    expect(field.getAttribute('dir')).toBe('auto');
    // None of the desktop panel's chrome.
    expect(screen.queryByText(englishText('editor.title'))).toBeNull();
    expect(screen.queryByText(englishText('editor.clear'))).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByTestId('manage-languages-toggle')).toBeNull();
    expect(screen.queryByTestId('editor-panel')).toBeNull();
  });

  it('marks the field missing while it is empty', () => {
    const { rerender } = render(editor());
    expect(screen.getByTestId('phone-editor-missing').textContent).toContain(
      englishText('phone.missing')
    );
    rerender(editor({ inputValue: 'ابدأ' }));
    expect(screen.queryByTestId('phone-editor-missing')).toBeNull();
  });

  it('shows the character count only close to the limit', () => {
    const { rerender } = render(editor({ inputValue: 'short' }));
    expect(screen.queryByText(/\/10000$/)).toBeNull();
    rerender(editor({ inputValue: 'x'.repeat(9500) }));
    expect(screen.getByText('9500/10000')).toBeTruthy();
  });

  it('typing reports the new value', () => {
    const onInputChange = vi.fn();
    render(editor({ onInputChange }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ابدأ' } });
    expect(onInputChange).toHaveBeenCalledWith('ابدأ');
  });

  it('Save is the primary action and is off until the text changes', () => {
    const onSave = vi.fn();
    const { rerender } = render(editor({ onSave }));
    const save = screen.getByRole('button', { name: englishText('phone.save') });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(save.className).toContain('min-h-11');
    expect(save.className).toContain('bg-accent');
    rerender(editor({ onSave, inputValue: 'ابدأ' }));
    fireEvent.click(screen.getByRole('button', { name: englishText('phone.save') }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('puts Next missing and Save in one bottom row', () => {
    render(editor({ nextMissing: <button type="button">Next missing</button> }));
    const row = screen.getByTestId('phone-editor-actions');
    expect(within(row).getByRole('button', { name: 'Next missing' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: englishText('phone.save') })).toBeTruthy();
  });

  it('clamps a long reference to three lines with a way to expand it', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 120,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 60,
    });
    render(editor());
    const reference = screen.getByTestId('phone-editor-reference');
    expect(reference.className).toContain('line-clamp-3');
    fireEvent.click(screen.getByRole('button', { name: englishText('phone.more') }));
    expect(reference.className).not.toContain('line-clamp-3');
    expect(screen.getByRole('button', { name: englishText('phone.less') })).toBeTruthy();
  });

  it('a short reference has no expand button', () => {
    render(editor());
    expect(screen.queryByRole('button', { name: englishText('phone.more') })).toBeNull();
  });

  it('hides the reference while editing the reference locale itself', () => {
    render(
      editor({
        locale: 'en',
        selected: { key: 'hero.cta', fallbackValue: 'Start', currentValue: 'Start' },
        inputValue: 'Start',
      })
    );
    expect(screen.queryByTestId('phone-editor-reference')).toBeNull();
  });

  it('edits a plural message with the plural editor', () => {
    const plural = '{count, plural, one {# item} other {# items}}';
    render(
      editor({
        locale: 'en',
        selected: { key: 'cart.items', fallbackValue: plural, currentValue: plural },
        inputValue: plural,
      })
    );
    expect(screen.getByTestId('plural-editor')).toBeTruthy();
    expect(screen.getByTestId('plural-branch-one').className).toContain('text-base');
  });

  it('keeps the save warning with Save anyway', () => {
    const onForceSave = vi.fn();
    render(
      editor({
        inputValue: 'ابدأ',
        onForceSave,
        saveWarning: { code: 'placeholders', message: 'Missing {name}', missing: [], extra: [] },
      })
    );
    expect(screen.getByTestId('save-warning').textContent).toContain('Missing {name}');
    fireEvent.click(screen.getByRole('button', { name: englishText('editor.save_anyway') }));
    expect(onForceSave).toHaveBeenCalledTimes(1);
  });

  it('shows an error and the saved state', () => {
    render(editor({ inputValue: 'ابدأ', error: 'Disk full', isSuccess: true }));
    expect(screen.getByRole('alert').textContent).toContain('Disk full');
    expect(screen.getByTestId('save-success')).toBeTruthy();
  });

  it('the field uses 16px text so a phone does not zoom in on focus', () => {
    render(editor());
    expect(screen.getByRole('textbox').className).toContain('text-base');
  });
});
