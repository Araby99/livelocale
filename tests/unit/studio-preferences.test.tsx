// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  initialThemeChoice,
  saveThemeChoice,
  storedThemeChoice,
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
  writePref('studio-theme', null);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('studio preferences', () => {
  it('defaults the dev Studio to dark and the share Studio to the system setting', () => {
    expect(initialThemeChoice({ stored: null, isShareStudio: false })).toBe('dark');
    expect(initialThemeChoice({ stored: null, isShareStudio: true })).toBe('system');
    expect(initialThemeChoice({ stored: 'light', isShareStudio: false })).toBe('light');
  });

  it.each(['Dark', '', 'blue', 'null'])('ignores an unknown remembered theme %j', (v) => {
    localStorage.setItem(STUDIO_THEME_KEY, v);
    expect(storedThemeChoice()).toBeNull();
  });

  it('stores the theme choice under its key and reads it back', () => {
    saveThemeChoice('light');
    expect(localStorage.getItem(STUDIO_THEME_KEY)).toBe('light');
    expect(storedThemeChoice()).toBe('light');
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
