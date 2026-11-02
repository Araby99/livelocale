// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TranslationEditor } from '../../src/studio/features/dashboard/components/TranslationEditor.jsx';
import { StudioLanguageProvider } from '../../src/studio/i18n/StudioLanguage.jsx';
import { textFor, type StudioLanguage } from '../../src/studio/i18n/catalogue.js';

const renderEditor = (
  overrides: Partial<React.ComponentProps<typeof TranslationEditor>> = {},
  lang: StudioLanguage = 'en'
) => {
  const props = {
    selected: {
      key: 'home.greeting',
      fallbackValue: 'Hello {name}, <b>welcome</b>',
      currentValue: '',
    },
    inputValue: 'Hola {name}',
    isLoading: false,
    isSuccess: false,
    error: null,
    saveWarning: null,
    onInputChange: vi.fn(),
    onSave: vi.fn(),
    onForceSave: vi.fn(),
    onDismissWarning: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(
    <StudioLanguageProvider initial={lang}>
      <TranslationEditor {...props} />
    </StudioLanguageProvider>
  );
  return props;
};

describe('TranslationEditor in Arabic', () => {
  it('labels the editor in Arabic', () => {
    renderEditor({}, 'ar');
    expect(screen.getByRole('button', { name: textFor('ar')('editor.save') })).toBeTruthy();
    cleanup();
  });
});

describe('TranslationEditor placeholders', () => {
  it('lists the reference placeholders and marks the ones missing from the input', () => {
    renderEditor();
    const name = screen.getByTestId('placeholder-{name}');
    const bold = screen.getByTestId('placeholder-<b>');
    expect(name.getAttribute('data-state')).toBe('present');
    expect(bold.getAttribute('data-state')).toBe('missing');
    cleanup();
  });

  it('marks placeholders that only exist in the input as extra', () => {
    renderEditor({ inputValue: 'Hola {nombre}, <b>bienvenido</b>' });
    expect(screen.getByTestId('placeholder-{nombre}').getAttribute('data-state')).toBe('extra');
    cleanup();
  });

  it('shows the save warning with a Save anyway action', () => {
    const props = renderEditor({
      saveWarning: {
        code: 'PLACEHOLDER_MISMATCH',
        message: 'Placeholders differ from the reference: missing <b>.',
        missing: ['<b>'],
        extra: [],
      },
    });
    expect(screen.getByText(/Placeholders differ/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /save anyway/i }));
    expect(props.onForceSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(props.onDismissWarning).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('renders the textarea with automatic text direction for RTL input', () => {
    renderEditor();
    expect(screen.getByPlaceholderText(/type your translation/i).getAttribute('dir')).toBe('auto');
    cleanup();
  });
});

describe('TranslationEditor keyboard', () => {
  it('saves with Ctrl+Enter and Cmd+Enter', () => {
    const props = renderEditor();
    const input = screen.getByPlaceholderText(/type your translation/i);
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(props.onSave).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(props.onSave).toHaveBeenCalledTimes(2);
    expect(props.onForceSave).not.toHaveBeenCalled();
    cleanup();

    const unchanged = renderEditor({
      inputValue: 'Hola',
      selected: { key: 'k', fallbackValue: 'Hi', currentValue: 'Hola' },
    });
    const same = screen.getByPlaceholderText(/type your translation/i);
    fireEvent.keyDown(same, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(same, { key: 'Enter', metaKey: true });
    expect(unchanged.onSave).not.toHaveBeenCalled();
    cleanup();
  });
});

describe('TranslationEditor focus across a save', () => {
  const baseProps = {
    selected: { key: 'home.greeting', fallbackValue: 'Hello', currentValue: '' },
    inputValue: 'Hola',
    isSuccess: false,
    error: null,
    saveWarning: null,
    onInputChange: vi.fn(),
    onSave: vi.fn(),
    onForceSave: vi.fn(),
    onDismissWarning: vi.fn(),
    onClear: vi.fn(),
  };
  const ui = (isLoading: boolean, inputValue = 'Hola', currentValue = '') => (
    <StudioLanguageProvider initial="en">
      <TranslationEditor
        {...baseProps}
        selected={{ ...baseProps.selected, currentValue }}
        inputValue={inputValue}
        isLoading={isLoading}
      />
    </StudioLanguageProvider>
  );
  // The browser blurs a focused control once it is disabled; jsdom does not, so the test blurs it
  // (before disabling it, since jsdom ignores blur() on a disabled control).
  const browserFocusFixup = () => (document.activeElement as HTMLElement | null)?.blur();

  it('gives focus back to the textarea after a Ctrl+Enter save', () => {
    const { rerender } = render(ui(false));
    const input = document.getElementById('studio-translation-input') as HTMLTextAreaElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    browserFocusFixup();
    rerender(ui(true));
    rerender(ui(false, 'Hola', 'Hola'));
    expect(document.activeElement).toBe(input);
    cleanup();
  });

  it('moves focus to the textarea after a Save click, since Save is disabled once saved', () => {
    const { rerender } = render(ui(false));
    const save = document.getElementById('studio-save-button') as HTMLButtonElement;
    save.focus();
    fireEvent.click(save);
    browserFocusFixup();
    rerender(ui(true));
    rerender(ui(false, 'Hola', 'Hola'));
    expect(document.activeElement).toBe(document.getElementById('studio-translation-input'));
    cleanup();
  });

  it('leaves focus alone when the user moved it elsewhere during the save', () => {
    const { rerender } = render(
      <>
        <button id="elsewhere">x</button>
        {ui(false)}
      </>
    );
    const input = document.getElementById('studio-translation-input') as HTMLTextAreaElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    rerender(
      <>
        <button id="elsewhere">x</button>
        {ui(true)}
      </>
    );
    const other = document.getElementById('elsewhere') as HTMLButtonElement;
    other.focus();
    rerender(
      <>
        <button id="elsewhere">x</button>
        {ui(false, 'Hola', 'Hola')}
      </>
    );
    expect(document.activeElement).toBe(other);
    cleanup();
  });
});
