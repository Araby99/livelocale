// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import {
  AddressBar,
  type AddressBarProps,
  type NavigateResult,
} from '../../src/studio/features/dashboard/components/AddressBar.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(overrides: Partial<AddressBarProps> = {}) {
  const onNavigate = vi.fn((_input: string): NavigateResult => 'ok');
  const props: AddressBarProps = {
    path: '/pricing',
    pendingPath: null,
    recent: ['/b'],
    sitePages: ['/', '/b', '/c'],
    onNavigate,
    ...overrides,
  };
  const view = render(<AddressBar {...props} />);
  const input = screen.getByRole('combobox', { name: 'Page address' }) as HTMLInputElement;
  return { ...view, input, onNavigate: props.onNavigate, props };
}

const optionPaths = () =>
  screen.queryAllByRole('option').map((option) => option.getAttribute('data-path'));

describe('AddressBar', () => {
  it('shows the current path, or the pending one', () => {
    const { input, rerender, props } = setup();
    expect(input.value).toBe('/pricing');
    expect(input.getAttribute('dir')).toBe('ltr');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.id).toBe('studio-address');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    rerender(<AddressBar {...props} pendingPath="/about/" />);
    expect(input.value).toBe('/about/');
  });

  it('lists recent then site pages in labelled groups', () => {
    const { input } = setup();
    fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const listbox = screen.getByRole('listbox', { name: 'Page address' });
    expect(listbox.id).toBe('studio-address-list');
    const recent = within(listbox).getByRole('group', { name: 'Recent pages' });
    const site = within(listbox).getByRole('group', { name: 'Site pages' });
    expect(
      within(recent)
        .getAllByRole('option')
        .map((o) => o.getAttribute('data-path'))
    ).toEqual(['/b']);
    expect(
      within(site)
        .getAllByRole('option')
        .map((o) => o.getAttribute('data-path'))
    ).toEqual(['/', '/c']);
  });

  it('filters by what is typed', () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'c' } });
    expect(optionPaths()).toEqual(['/c']);
    expect(screen.queryByRole('group', { name: 'Recent pages' })).toBeNull();
  });

  it('moves with arrows and opens the active option on Enter', () => {
    const { input, onNavigate } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('studio-address-option-1');
    const active = document.getElementById('studio-address-option-1');
    expect(active?.getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true')
    ).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('/');
  });

  it('picks the last option on ArrowUp from none and wraps', () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe('studio-address-option-2');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('studio-address-option-0');
  });

  it('opens an option on click', () => {
    const { input, onNavigate } = setup();
    act(() => input.focus());
    const option = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('data-path') === '/c') as HTMLElement;
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);
    expect(onNavigate).toHaveBeenCalledWith('/c');
    expect(document.activeElement).toBe(input);
  });

  it('navigates the typed value on Enter', () => {
    const { input, onNavigate } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'pricing' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('pricing');
  });

  it('opens the list on Alt+ArrowDown after Escape', () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('shows the refusal and keeps the text', () => {
    const { input } = setup({ onNavigate: vi.fn((): NavigateResult => 'refused') });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '//evil.example' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Only pages on this site can open here');
    expect(alert.id).toBe('studio-address-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('studio-address-error');
    expect(input.value).toBe('//evil.example');
    fireEvent.change(input, { target: { value: '//evil.exampl' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.value).toBe('/pricing');
  });

  it('closes and ends the edit once a navigation is accepted', () => {
    const { input, onNavigate } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '/c' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('/c');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('/pricing');
  });

  it('Escape closes, then restores; blur restores', () => {
    const { input } = setup();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('x');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('/pricing');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'y' } });
    fireEvent.blur(input);
    expect(input.value).toBe('/pricing');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the empty state with no pages', () => {
    const { input } = setup({ recent: [], sitePages: [] });
    fireEvent.focus(input);
    const status = screen.getByRole('status');
    expect(status.id).toBe('studio-address-empty');
    expect(status.textContent).toBe('No pages yet: open one in the preview');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps path segments in order', () => {
    const { input } = setup({ recent: ['/مدونة/مقال/'], sitePages: [] });
    fireEvent.focus(input);
    const option = screen.getByRole('option');
    expect(option.getAttribute('data-path')).toBe('/مدونة/مقال/');
    expect(option.textContent).toBe('/مدونة/مقال/');
    expect([...option.querySelectorAll('bdi')].map((b) => b.textContent)).toEqual([
      'مدونة',
      'مقال',
    ]);
  });
});
