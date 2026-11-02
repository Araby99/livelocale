// @vitest-environment jsdom
import React from 'react';
import { it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '../../src/studio/features/dashboard/components/ThemeToggle.js';
import { StudioLanguageProvider } from '../../src/studio/i18n/StudioLanguage.js';
import { textFor } from '../../src/studio/i18n/catalogue.js';

afterEach(cleanup);

it('shows the current choice as pressed', () => {
  render(<ThemeToggle choice="dark" onChange={() => {}} />);
  expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(screen.getByRole('button', { name: 'Light theme' }).getAttribute('aria-pressed')).toBe(
    'false'
  );
  expect(screen.getByRole('button', { name: 'System theme' }).getAttribute('aria-pressed')).toBe(
    'false'
  );
  const outlined = (name: string) =>
    screen.getByRole('button', { name }).className.split(/\s+/).includes('border-line-strong');
  expect([outlined('Dark theme'), outlined('Light theme'), outlined('System theme')]).toEqual([
    true,
    false,
    false,
  ]);
});
it('reports the clicked choice', () => {
  const onChange = vi.fn();
  render(<ThemeToggle choice="dark" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));
  expect(onChange).toHaveBeenCalledWith('light');
});

it('names the theme controls in Arabic', () => {
  render(
    <StudioLanguageProvider initial="ar">
      <ThemeToggle choice="light" onChange={() => {}} />
    </StudioLanguageProvider>
  );
  expect(screen.getByRole('group', { name: textFor('ar')('theme.group') })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: textFor('ar')('theme.light') }).getAttribute('aria-pressed')
  ).toBe('true');
});
