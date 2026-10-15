// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PluralEditor } from '../../src/studio/features/dashboard/components/PluralEditor.jsx';
import { TranslationEditor } from '../../src/studio/features/dashboard/components/TranslationEditor.jsx';

const PLURAL = '{count, plural, one {# item} other {# items}}';

describe('PluralEditor', () => {
  it('shows one field per CLDR category of the locale plus existing selectors', () => {
    render(<PluralEditor locale="ar" value={PLURAL} onChange={vi.fn()} />);
    for (const c of ['zero', 'one', 'two', 'few', 'many', 'other']) {
      expect(screen.getByTestId(`plural-branch-${c}`)).toBeTruthy();
    }
    expect((screen.getByTestId('plural-branch-one') as HTMLInputElement).value).toBe('# item');
    expect((screen.getByTestId('plural-branch-few') as HTMLInputElement).value).toBe('');
    cleanup();
  });

  it('keeps explicit selectors such as =0 and shows surrounding text when present', () => {
    render(
      <PluralEditor
        locale="en"
        value="You have {count, plural, =0 {nothing} one {# item} other {# items}} here"
        onChange={vi.fn()}
      />
    );
    expect((screen.getByTestId('plural-branch-=0') as HTMLInputElement).value).toBe('nothing');
    expect((screen.getByTestId('plural-prefix') as HTMLInputElement).value).toBe('You have ');
    expect((screen.getByTestId('plural-suffix') as HTMLInputElement).value).toBe(' here');
    cleanup();
  });

  it('rebuilds the ICU message when a branch changes', () => {
    const onChange = vi.fn();
    render(<PluralEditor locale="ar" value={PLURAL} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('plural-branch-few'), { target: { value: '# عناصر' } });
    expect(onChange).toHaveBeenCalledWith(
      '{count, plural, one {# item} few {# عناصر} other {# items}}'
    );
    cleanup();
  });

  it('renders nothing for messages that are not a single plural', () => {
    const { container } = render(
      <PluralEditor locale="en" value="Hello {name}" onChange={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
    cleanup();
  });
});

describe('TranslationEditor plural integration', () => {
  const props = () => ({
    selected: { key: 'cart.items', fallbackValue: PLURAL, currentValue: PLURAL },
    inputValue: PLURAL,
    locale: 'ar',
    isLoading: false,
    isSuccess: false,
    error: null,
    saveWarning: null,
    onInputChange: vi.fn(),
    onSave: vi.fn(),
    onForceSave: vi.fn(),
    onDismissWarning: vi.fn(),
    onClear: vi.fn(),
  });

  it('uses the plural editor for plural messages and can switch to raw text', () => {
    render(<TranslationEditor {...props()} />);
    expect(screen.getByTestId('plural-branch-many')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/type your translation/i)).toBeNull();

    fireEvent.click(screen.getByTestId('plural-raw-toggle'));
    expect(screen.getByPlaceholderText(/type your translation/i)).toBeTruthy();
    cleanup();
  });

  it('falls back to the textarea for plain messages', () => {
    const p = props();
    p.inputValue = 'Plain text';
    p.selected = { key: 'k', fallbackValue: 'Plain', currentValue: 'Plain text' };
    render(<TranslationEditor {...p} />);
    expect(screen.queryByTestId('plural-raw-toggle')).toBeNull();
    expect(screen.getByPlaceholderText(/type your translation/i)).toBeTruthy();
    cleanup();
  });
});
