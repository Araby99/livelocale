// @vitest-environment jsdom
import React from 'react';
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, screen, cleanup, fireEvent } from '@testing-library/react';
import { StudioLanguageProvider, useStudioText } from '../../src/studio/i18n/StudioLanguage.js';
import { LanguageToggle } from '../../src/studio/features/dashboard/components/LanguageToggle.js';
import { storedLanguage } from '../../src/studio/preferences.js';
import { writePref } from '../../src/studio/share/browser.js';

beforeEach(() => {
  writePref('studio-language', null);
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('is English and left-to-right outside a provider', () => {
  const { result } = renderHook(() => useStudioText());
  expect([
    result.current.lang,
    result.current.dir,
    result.current.t('language.switch_to_ar'),
  ]).toEqual(['en', 'ltr', 'Show the Studio in Arabic']);
});
it('switches to Arabic, remembers it, and mirrors the document', () => {
  render(
    <StudioLanguageProvider initial="en">
      <LanguageToggle />
    </StudioLanguageProvider>
  );
  const button = screen.getByRole('button', { name: 'Show the Studio in Arabic' });
  expect(button.textContent).toBe('العربية');
  expect(button.querySelector('[lang="ar"]')).not.toBeNull();
  fireEvent.click(button);
  expect(storedLanguage()).toBe('ar');
  expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['ar', 'rtl']);
  expect(screen.getByRole('button', { name: 'عرض الاستوديو بالإنجليزية' }).textContent).toBe(
    'English'
  );
});
it('still switches when localStorage throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  render(
    <StudioLanguageProvider initial="en">
      <LanguageToggle />
    </StudioLanguageProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show the Studio in Arabic' }));
  expect(document.documentElement.dir).toBe('rtl');
});
