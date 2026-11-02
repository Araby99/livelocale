// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { applyTheme, prefersDark, resolveTheme } from '../../src/studio/theme.js';
import { useTheme } from '../../src/studio/features/dashboard/hooks/useTheme.js';
import { STUDIO_THEME_KEY } from '../../src/studio/preferences.js';
import { fakeMatchMedia } from './helpers/match-media.js';

describe('Studio theme', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.className = '';
    vi.unstubAllGlobals();
  });

  it('resolves system from the media query', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('treats a missing matchMedia as a dark system', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersDark()).toBe(true);
  });

  it('toggles only the dark class on the root', () => {
    const root = document.documentElement;
    root.classList.add('keep');
    applyTheme(root, 'dark');
    expect([...root.classList]).toEqual(['keep', 'dark']);
    applyTheme(root, 'dark');
    expect([...root.classList]).toEqual(['keep', 'dark']);
    applyTheme(root, 'light');
    expect([...root.classList]).toEqual(['keep']);
  });

  it('keeps the dev Studio dark under a light system setting', () => {
    fakeMatchMedia(false);
    const { result } = renderHook(() => useTheme(false));
    expect(result.current).toMatchObject({ choice: 'dark', resolved: 'dark' });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('follows a live system change while the choice is system', () => {
    const mm = fakeMatchMedia(false);
    const { result } = renderHook(() => useTheme(true));
    expect(result.current.resolved).toBe('light');
    act(() => mm.fire(true));
    expect(result.current.resolved).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores a system change after an explicit choice and remembers it', () => {
    const mm = fakeMatchMedia(true);
    const { result } = renderHook(() => useTheme(true));
    act(() => result.current.setChoice('light'));
    act(() => mm.fire(true));
    expect(result.current).toMatchObject({ choice: 'light', resolved: 'light' });
    expect(localStorage.getItem(STUDIO_THEME_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
