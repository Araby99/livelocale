// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  useTargetLocale,
  TARGET_LOCALE_STORAGE_PREFIX,
} from '../../src/studio/features/dashboard/hooks/useTargetLocale.js';
import type { SelectedElement } from '../../src/studio/features/dashboard/types/index.js';
import type { TextCandidates } from '../../src/studio/locale-inference.js';

const candidates: TextCandidates = {
  en: { 'home.title': ['Welcome'] },
  ar: { 'home.title': ['مرحبا'] },
};

const el = (text: string): SelectedElement => ({
  key: 'home.title',
  fallbackValue: text,
  currentValue: text,
});

const SCOPE = 'path:/';

const setup = (overrides: { enabled?: boolean } = {}) => {
  const setLocale = vi.fn();
  const setMenuLocale = vi.fn();
  const getCandidates = vi.fn(async () => candidates);
  const hook = renderHook(() =>
    useTargetLocale({
      enabled: overrides.enabled ?? true,
      scope: SCOPE,
      locale: 'en',
      setLocale,
      setMenuLocale,
      locales: ['ar', 'en'],
      getCandidates,
    })
  );
  return { ...hook, setLocale, setMenuLocale, getCandidates };
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useTargetLocale', () => {
  it('switches to the language whose text matches the click', async () => {
    const { result, setLocale } = setup();
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection(el('مرحبا'));
    });
    expect(resolved).toBe(true);
    expect(setLocale).toHaveBeenCalledWith('ar');
    expect(result.current.source).toBe('content');
  });

  it('detects the page language from visible texts before any click', async () => {
    const { result, setLocale } = setup();
    await act(async () => {
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'مرحبا' }]);
    });
    expect(setLocale).toHaveBeenCalledWith('ar');
    expect(result.current.source).toBe('content');
    expect(result.current.confirmed).toBe(true);
  });

  it('does not confirm a remembered locale until the page agrees', async () => {
    localStorage.setItem(TARGET_LOCALE_STORAGE_PREFIX + SCOPE, 'ar');
    const { result, setLocale } = setup();
    expect(result.current.source).toBe('remembered');
    expect(result.current.confirmed).toBe(false);
    await act(async () => {
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'Welcome' }]);
    });
    expect(setLocale).toHaveBeenLastCalledWith('en');
    expect(result.current.source).toBe('content');
    expect(result.current.confirmed).toBe(true);
  });

  it('requires a pick when neither text nor address identifies the language', async () => {
    const { result } = setup();
    const unknown = el('Bonjour');
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection(unknown);
    });
    expect(resolved).toBe(false);
    expect(result.current.pickerCandidates).toEqual(['ar', 'en']);
    let pending: SelectedElement | null = null;
    act(() => {
      pending = result.current.choose('ar');
    });
    expect(pending).toBe(unknown);
    expect(result.current.source).toBe('manual');
    expect(result.current.pickerCandidates).toBeNull();
  });

  it('requires a pick for a key chosen from the list while no language is chosen', async () => {
    const { result } = setup();
    const picked = el('Welcome');
    let resolved: boolean | undefined;
    act(() => {
      resolved = result.current.resolveForDirectPick(picked);
    });
    expect(resolved).toBe(false);
    expect(result.current.pickerCandidates).toEqual(['ar', 'en']);
    let pending: SelectedElement | null = null;
    act(() => {
      pending = result.current.choose('ar');
    });
    expect(pending).toBe(picked);
    expect(result.current.source).toBe('manual');
  });

  it('lets a key from the list through once the language is known, and in server mode', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'مرحبا' }]);
    });
    expect(result.current.resolveForDirectPick(el('مرحبا'))).toBe(true);
    expect(result.current.pickerCandidates).toBeNull();

    const server = setup({ enabled: false });
    expect(server.result.current.resolveForDirectPick(el('Welcome'))).toBe(true);
    expect(server.result.current.pickerCandidates).toBeNull();
  });

  it('keeps a manual choice and reports a mismatch', async () => {
    const { result, setLocale } = setup();
    act(() => {
      result.current.choose('en');
    });
    await act(async () => {
      await result.current.resolveForSelection(el('مرحبا'));
    });
    expect(setLocale).not.toHaveBeenCalledWith('ar');
    expect(result.current.source).toBe('manual');
    expect(result.current.mismatch).toBe('ar');
  });

  it("keeps a change from the editor's language menu as manual", async () => {
    const { result, setLocale } = setup();
    act(() => {
      result.current.onMenuLocale('en');
    });
    expect(setLocale).toHaveBeenCalledWith('en');
    expect(result.current.source).toBe('manual');
    await act(async () => {
      await result.current.resolveForSelection(el('مرحبا'));
    });
    expect(setLocale).not.toHaveBeenCalledWith('ar');
    expect(result.current.mismatch).toBe('ar');
  });

  it('passes menu changes straight through in server mode', () => {
    const { result, setLocale, setMenuLocale } = setup({ enabled: false });
    act(() => {
      result.current.onMenuLocale('fr');
    });
    expect(setMenuLocale).toHaveBeenCalledWith('fr');
    expect(setLocale).not.toHaveBeenCalled();
    expect(result.current.source).toBeNull();
  });

  it('uses the page address until a click says otherwise', async () => {
    const { result, setLocale } = setup();
    act(() => {
      result.current.onUrlLocale('en');
    });
    expect(result.current.source).toBe('url');
    await act(async () => {
      await result.current.resolveForSelection(el('مرحبا'));
    });
    expect(setLocale).toHaveBeenLastCalledWith('ar');
    expect(result.current.source).toBe('content');
  });

  it('remembers the confirmed language for this share link', async () => {
    const first = setup();
    await act(async () => {
      await first.result.current.resolveForSelection(el('مرحبا'));
    });
    expect(localStorage.getItem('livelocale-target-locale:path:/')).toBe('ar');
    first.unmount();

    const second = setup();
    expect(second.setLocale).toHaveBeenCalledWith('ar');
    expect(second.result.current.source).toBe('remembered');
  });

  it('behaves as before in server mode', async () => {
    const { result, setLocale, getCandidates } = setup({ enabled: false });
    act(() => {
      result.current.onUrlLocale('fr');
    });
    expect(setLocale).toHaveBeenCalledWith('fr');
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection(el('مرحبا'));
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'مرحبا' }]);
    });
    expect(resolved).toBe(true);
    expect(getCandidates).not.toHaveBeenCalled();
    expect(result.current.source).toBeNull();
  });
});
