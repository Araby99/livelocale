// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  initialStudioLanguage,
  initialThemeChoice,
  saveLanguage,
  saveThemeChoice,
  storedLanguage,
  storedThemeChoice,
  STUDIO_LANGUAGE_KEY,
  STUDIO_THEME_KEY,
} from '../../src/studio/preferences.js';
import { writePref } from '../../src/studio/share/browser.js';
import { Header } from '../../src/studio/features/dashboard/components/Header.js';

(globalThis as Record<string, unknown>).__STUDIO_VERSION__ = 'test';

const renderHeader = (extra: Partial<React.ComponentProps<typeof Header>> = {}) =>
  render(
    <Header
      coveragePercentage={50}
      changesCount={0}
      isChangesOpen={false}
      onToggleChanges={() => {}}
      unsentCount={2}
      canSend
      onSend={() => {}}
      {...extra}
    />
  );

beforeEach(() => {
  writePref('studio-language', null);
  writePref('studio-theme', null);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('studio preferences', () => {
  it.each([
    [{ stored: 'ar', isShareStudio: false, browserLanguage: 'en-US' }, 'ar'],
    [{ stored: 'en', isShareStudio: true, browserLanguage: 'ar-EG' }, 'en'],
    [{ stored: 'fr', isShareStudio: true, browserLanguage: 'ar' }, 'ar'],
    [{ stored: null, isShareStudio: false, browserLanguage: 'ar-EG' }, 'en'],
    [{ stored: null, isShareStudio: true, browserLanguage: 'ar-EG' }, 'ar'],
    [{ stored: null, isShareStudio: true, browserLanguage: 'AR' }, 'ar'],
    [{ stored: null, isShareStudio: true, browserLanguage: 'arz' }, 'ar'],
    [{ stored: null, isShareStudio: true, browserLanguage: 'ar_SA' }, 'ar'],
    [{ stored: null, isShareStudio: true, browserLanguage: 'arn-CL' }, 'en'],
    [{ stored: null, isShareStudio: true, browserLanguage: 'en-US' }, 'en'],
    [{ stored: null, isShareStudio: true, browserLanguage: undefined }, 'en'],
    [{ stored: null, isShareStudio: true, browserLanguage: '' }, 'en'],
  ])('starts %o in %s', (input, lang) => expect(initialStudioLanguage(input)).toBe(lang));

  it('defaults the dev Studio to dark and the share Studio to the system setting', () => {
    expect(initialThemeChoice({ stored: null, isShareStudio: false })).toBe('dark');
    expect(initialThemeChoice({ stored: null, isShareStudio: true })).toBe('system');
    expect(initialThemeChoice({ stored: 'light', isShareStudio: false })).toBe('light');
  });

  it.each(['Dark', '', 'blue', 'null'])('ignores an unknown remembered theme %j', (v) => {
    localStorage.setItem(STUDIO_THEME_KEY, v);
    expect(storedThemeChoice()).toBeNull();
  });

  it('stores both choices under their keys and reads them back', () => {
    saveLanguage('ar');
    saveThemeChoice('light');
    expect([
      localStorage.getItem(STUDIO_LANGUAGE_KEY),
      localStorage.getItem(STUDIO_THEME_KEY),
    ]).toEqual(['ar', 'light']);
    expect([storedLanguage(), storedThemeChoice()]).toEqual(['ar', 'light']);
  });

  it('keeps working in memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    saveThemeChoice('light');
    expect(storedThemeChoice()).toBe('light');
  });

  it('renders the settings slot only when given', () => {
    expect(renderHeader({}).queryByTestId('header-settings')).toBeNull();
    cleanup();
    expect(
      renderHeader({ settings: <span>x</span> }).getByTestId('header-settings').textContent
    ).toBe('x');
  });
});
