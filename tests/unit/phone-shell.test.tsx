// @vitest-environment jsdom
import React, { createRef } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { PhoneTopBar } from '../../src/studio/features/dashboard/components/PhoneTopBar.jsx';
import {
  PhoneShell,
  PhoneEditorSheet,
  NextMissingButton,
} from '../../src/studio/features/dashboard/components/PhoneShell.jsx';
import { ThemeToggle } from '../../src/studio/features/dashboard/components/ThemeToggle.jsx';
import { englishText } from '../../src/studio/i18n/catalogue.js';

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

afterEach(() => {
  cleanup();
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  }
  vi.unstubAllGlobals();
});

const topBar = (props: Partial<React.ComponentProps<typeof PhoneTopBar>> = {}) => (
  <PhoneTopBar
    unsentCount={2}
    locale="fr"
    locales={['en', 'fr']}
    onChooseLocale={vi.fn()}
    onSend={vi.fn()}
    menu={<ThemeToggle choice="system" onChange={vi.fn()} />}
    {...props}
  />
);

/** A frame whose bottom edge sits at `bottom` CSS px from the top of the screen. */
const frameAt = (bottom: number) => {
  const frame = document.createElement('div');
  frame.getBoundingClientRect = () => ({ bottom }) as DOMRect;
  const ref = createRef<HTMLElement>() as React.MutableRefObject<HTMLElement | null>;
  ref.current = frame;
  return ref;
};

describe('PhoneTopBar', () => {
  it('phone shell shows mark, locale chip and Send · N, nothing else in the bar', () => {
    render(topBar());
    const bar = screen.getByTestId('phone-top-bar');
    expect(within(bar).getByTestId('brand-mark')).toBeTruthy();
    const chip = within(bar).getByRole('combobox', { name: englishText('editor.locale') });
    expect((chip as HTMLSelectElement).value).toBe('fr');
    const send = within(bar).getByRole('button', {
      name: englishText('phone.send', { count: 2 }),
    });
    expect(send).toBeTruthy();
    // Besides Send, only the menu button; the menu's contents stay out until it opens.
    const buttons = within(bar).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      englishText('phone.send', { count: 2 }),
      englishText('phone.menu'),
    ]);
    expect(within(bar).queryByRole('group', { name: englishText('theme.group') })).toBeNull();
  });

  it('the locale chip chooses a locale', () => {
    const onChooseLocale = vi.fn();
    render(topBar({ onChooseLocale }));
    fireEvent.change(screen.getByRole('combobox', { name: englishText('editor.locale') }), {
      target: { value: 'en' },
    });
    expect(onChooseLocale).toHaveBeenCalledWith('en');
  });

  it('Send opens the send flow and is disabled with nothing to send', () => {
    const onSend = vi.fn();
    const { rerender } = render(topBar({ onSend }));
    fireEvent.click(screen.getByRole('button', { name: englishText('phone.send', { count: 2 }) }));
    expect(onSend).toHaveBeenCalledTimes(1);
    rerender(topBar({ onSend, unsentCount: 0 }));
    const send = screen.getByRole('button', { name: englishText('phone.send', { count: 0 }) });
    expect((send as HTMLButtonElement).disabled).toBe(true);
  });

  it('menu holds the theme toggle', () => {
    render(topBar());
    const menuButton = screen.getByRole('button', { name: englishText('phone.menu') });
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: englishText('theme.dark') })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: englishText('theme.dark') })).toBeNull();
  });

  it('every control in the bar is at least 44px tall', () => {
    render(topBar());
    const bar = screen.getByTestId('phone-top-bar');
    for (const control of [
      ...within(bar).getAllByRole('button'),
      within(bar).getByRole('combobox'),
    ]) {
      expect(control.className).toContain('min-h-11');
    }
  });
});

describe('PhoneEditorSheet', () => {
  const sheet = (
    props: Partial<React.ComponentProps<typeof PhoneEditorSheet>> & { selectionCount: number }
  ) => (
    <PhoneEditorSheet
      selectedKey="home.title"
      frameRef={frameAt(window.innerHeight)}
      onReveal={vi.fn()}
      {...props}
    >
      <input aria-label="Translation" />
    </PhoneEditorSheet>
  );

  it('a pick opens the editor sheet', () => {
    const { rerender } = render(sheet({ selectionCount: 0 }));
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(sheet({ selectionCount: 1 }));
    const dialog = screen.getByRole('dialog', { name: englishText('layout.editor') });
    expect(within(dialog).getByLabelText('Translation')).toBeTruthy();
  });

  it('a repeat pick reopens a closed sheet', () => {
    const { rerender } = render(sheet({ selectionCount: 1 }));
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(sheet({ selectionCount: 2 }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('opening the sheet reveals the picked key above it', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('role') === 'dialog' ? 300 : 0;
      },
    });
    const onReveal = vi.fn();
    render(sheet({ selectionCount: 1, onReveal }));
    // The frame reaches the bottom of the screen, so the text must sit above the sheet's height.
    expect(onReveal).toHaveBeenLastCalledWith('home.title', 300);
  });

  it('the reveal leaves out the part of the sheet below the frame', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('role') === 'dialog' ? 300 : 0;
      },
    });
    const onReveal = vi.fn();
    // A 56px bottom bar under the frame is covered by the sheet too.
    render(sheet({ selectionCount: 1, onReveal, frameRef: frameAt(window.innerHeight - 56) }));
    expect(onReveal).toHaveBeenLastCalledWith('home.title', 244);
  });

  it('rotation (resize) does not remount the editor', () => {
    render(
      <PhoneShell
        topBar={topBar()}
        viewer={<div data-testid="viewer" />}
        editorSheet={sheet({ selectionCount: 1 })}
        sendSheet={null}
        bottomBar={<span data-testid="bottom" />}
      />
    );
    const input = screen.getByLabelText('Translation') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Bonjour' } });
    fireEvent(window, new Event('resize'));
    const after = screen.getByLabelText('Translation') as HTMLInputElement;
    expect(after).toBe(input);
    expect(after.value).toBe('Bonjour');
  });
});

describe('PhoneShell', () => {
  it('puts the viewer between the top bar and the bottom bar', () => {
    render(
      <PhoneShell
        topBar={<div data-testid="top" />}
        viewer={<div data-testid="viewer" />}
        editorSheet={null}
        sendSheet={null}
        bottomBar={<div data-testid="bottom" />}
      />
    );
    const order = ['top', 'viewer', 'bottom'].map((id) => screen.getByTestId(id));
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});

describe('NextMissingButton', () => {
  const values: Record<string, string> = { a: 'A', b: '', c: 'C', d: '' };
  const hasValue = (key: string) => (values[key] ?? '') !== '';

  it('Next missing calls selectKeyInPage with the next gap', () => {
    const onSelectKey = vi.fn();
    render(
      <NextMissingButton
        renderedKeys={['a', 'b', 'c', 'd']}
        pageKeys={['a', 'b', 'c', 'd']}
        currentKey="b"
        hasValue={hasValue}
        onSelectKey={onSelectKey}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: englishText('phone.next_missing') }));
    expect(onSelectKey).toHaveBeenCalledWith('d');
  });

  it('Next missing with no visible gaps shows done_hidden with the count', () => {
    const onSelectKey = vi.fn();
    render(
      <NextMissingButton
        renderedKeys={['a', 'c']}
        pageKeys={['a', 'b', 'c', 'd']}
        currentKey="a"
        hasValue={hasValue}
        onSelectKey={onSelectKey}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: englishText('phone.next_missing') }));
    expect(onSelectKey).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe(
      englishText('phone.done_hidden', { count: 2 })
    );
  });

  it('Next missing with nothing left anywhere says the page is translated', () => {
    render(
      <NextMissingButton
        renderedKeys={['a', 'c']}
        pageKeys={['a', 'c']}
        currentKey="a"
        hasValue={hasValue}
        onSelectKey={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: englishText('phone.next_missing') }));
    expect(screen.getByRole('status').textContent).toBe(englishText('phone.done_all'));
  });

  it('waits for the page to report what is visible', () => {
    render(
      <NextMissingButton
        renderedKeys={null}
        pageKeys={['a', 'b']}
        currentKey={null}
        hasValue={hasValue}
        onSelectKey={vi.fn()}
      />
    );
    const button = screen.getByRole('button', { name: englishText('phone.next_missing') });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.className).toContain('min-h-11');
  });
});
