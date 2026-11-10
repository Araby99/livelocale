// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TranslationEditor } from '../../src/studio/features/dashboard/components/TranslationEditor.jsx';
import { PhoneEditor } from '../../src/studio/features/dashboard/components/PhoneEditor.jsx';
import { pluralScaffold } from '../../src/studio/features/dashboard/components/PluralEditor.jsx';
import { parsePluralMessage } from '../../src/core/icu-plural.js';

afterEach(cleanup);

const REFERENCE = '{count, plural, one {# item} other {# items}}';

const editorProps = (overrides: Partial<React.ComponentProps<typeof TranslationEditor>> = {}) => ({
  selected: { key: 'cart.items', fallbackValue: REFERENCE, currentValue: '' },
  inputValue: '',
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
  ...overrides,
});

describe('pluralScaffold', () => {
  it('keeps the shape of the source plural with every form empty', () => {
    const scaffold = pluralScaffold('You have {n, plural, =0 {none} one {# item} other {#}}!');
    expect(scaffold).not.toBeNull();
    const parsed = parsePluralMessage(scaffold!.value)!;
    expect(parsed.variable).toBe('n');
    expect(parsed.type).toBe('plural');
    expect(parsed.branches.every((b) => b.text === '')).toBe(true);
    expect(scaffold!.selectors).toEqual(['=0', 'one', 'other']);
  });

  it('leaves the source words around the plural out, and says they exist', () => {
    const scaffold = pluralScaffold(
      'You have {n, plural, one {# item} other {# items}} in your cart'
    )!;
    const parsed = parsePluralMessage(scaffold.value)!;
    expect(parsed.prefix).toBe('');
    expect(parsed.suffix).toBe('');
    expect(scaffold.value).not.toMatch(/You have|in your cart/);
    expect(scaffold.surround).toEqual({ before: true, after: true });
    expect(pluralScaffold(REFERENCE)!.surround).toEqual({ before: false, after: false });
  });

  it('is null for a source text that is not a plural', () => {
    expect(pluralScaffold('Hello {name}')).toBeNull();
    expect(pluralScaffold('')).toBeNull();
  });
});

describe('a missing plural translation', () => {
  it("opens the forms editor with the edited language's forms, empty", () => {
    render(<TranslationEditor {...editorProps()} />);
    expect(screen.getByTestId('plural-editor')).toBeTruthy();
    for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
      expect((screen.getByTestId(`plural-branch-${form}`) as HTMLInputElement).value).toBe('');
    }
    // Nothing is typed yet, so there is nothing to save.
    expect((document.getElementById('studio-save-button') as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('builds the whole message from the first form typed', () => {
    const onInputChange = vi.fn();
    render(<TranslationEditor {...editorProps({ onInputChange })} />);
    fireEvent.change(screen.getByTestId('plural-branch-few'), { target: { value: '# عناصر' } });
    const typed = onInputChange.mock.calls.at(-1)![0] as string;
    const parsed = parsePluralMessage(typed)!;
    expect(parsed.variable).toBe('count');
    expect(parsed.branches).toContainEqual({ selector: 'few', text: '# عناصر' });
  });

  it('offers empty Before and After fields when the source has words around the plural', () => {
    const onInputChange = vi.fn();
    const source = 'You have {n, plural, one {# item} other {# items}} in your cart';
    const { rerender } = render(
      <TranslationEditor
        {...editorProps({
          onInputChange,
          selected: { key: 'cart.count', fallbackValue: source, currentValue: '' },
        })}
      />
    );
    const before = screen.getByTestId('plural-prefix') as HTMLInputElement;
    expect(before.value).toBe('');
    expect((screen.getByTestId('plural-suffix') as HTMLInputElement).value).toBe('');

    // After the first form is typed the message has no words around it yet; the fields stay.
    fireEvent.change(screen.getByTestId('plural-branch-few'), { target: { value: '# عناصر' } });
    const typed = onInputChange.mock.calls.at(-1)![0] as string;
    expect(typed).not.toMatch(/You have|in your cart/);
    rerender(
      <TranslationEditor
        {...editorProps({
          onInputChange,
          inputValue: typed,
          selected: { key: 'cart.count', fallbackValue: source, currentValue: '' },
        })}
      />
    );
    expect(screen.getByTestId('plural-prefix')).toBeTruthy();
    fireEvent.change(screen.getByTestId('plural-suffix'), { target: { value: ' في سلتك' } });
    expect(parsePluralMessage(onInputChange.mock.calls.at(-1)![0])!.suffix).toBe(' في سلتك');
  });

  it('keeps cases of a select message from the source', () => {
    render(
      <TranslationEditor
        {...editorProps({
          selected: {
            key: 'greet',
            fallbackValue: '{g, select, female {She} male {He} other {They}}',
            currentValue: '',
          },
        })}
      />
    );
    expect(screen.getByTestId('plural-branch-female')).toBeTruthy();
    expect(screen.getByTestId('plural-branch-male')).toBeTruthy();
  });

  it('can still be typed as raw text', () => {
    render(<TranslationEditor {...editorProps()} />);
    fireEvent.click(screen.getByTestId('plural-raw-toggle'));
    expect(screen.queryByTestId('plural-editor')).toBeNull();
    expect(document.getElementById('studio-translation-input')).toBeTruthy();
  });

  it('leaves an existing plain translation as a plain field', () => {
    render(
      <TranslationEditor
        {...editorProps({
          selected: { key: 'k', fallbackValue: REFERENCE, currentValue: 'عناصر' },
          inputValue: 'عناصر',
        })}
      />
    );
    expect(screen.queryByTestId('plural-editor')).toBeNull();
  });

  it('opens the forms editor on the phone too', () => {
    render(
      <PhoneEditor
        selected={{ key: 'cart.items', fallbackValue: REFERENCE, currentValue: '' }}
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
      />
    );
    expect(screen.getByTestId('plural-branch-few')).toBeTruthy();
  });
});
