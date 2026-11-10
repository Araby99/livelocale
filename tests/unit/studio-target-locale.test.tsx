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

const setup = (overrides: { enabled?: boolean; locale?: string } = {}) => {
  const setLocale = vi.fn();
  const setMenuLocale = vi.fn();
  const showLocale = vi.fn();
  const getCandidates = vi.fn(async () => candidates);
  const hook = renderHook(() =>
    useTargetLocale({
      enabled: overrides.enabled ?? true,
      scope: SCOPE,
      locale: overrides.locale ?? 'en',
      setLocale,
      setMenuLocale,
      showLocale,
      locales: ['ar', 'en'],
      getCandidates,
    })
  );
  return { ...hook, setLocale, setMenuLocale, showLocale, getCandidates };
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

  it('does not suggest switching when the clicked text is a missing translation', async () => {
    // Arabic lacks hero.cta, so the page shows the English text in its place.
    const withMissing: TextCandidates = {
      en: { 'hero.cta': ['Start free trial'] },
      ar: { 'home.title': ['مرحبا'] },
    };
    const { result, getCandidates, setLocale } = setup({ locale: 'ar' });
    getCandidates.mockResolvedValue(withMissing);
    act(() => {
      result.current.choose('ar');
    });
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection({
        key: 'hero.cta',
        fallbackValue: 'Start free trial',
        currentValue: 'Start free trial',
      });
    });
    expect(resolved).toBe(true);
    expect(result.current.mismatch).toBeNull();
    expect(setLocale).not.toHaveBeenCalledWith('en');
  });

  // English holds every text; Arabic only the title, so an Arabic page shows English elsewhere.
  const sparse: TextCandidates = {
    en: {
      'home.title': ['Welcome'],
      'hero.cta': ['Start free trial'],
      'hero.sub': ['Ship faster'],
      'nav.help': ['Help'],
    },
    ar: { 'home.title': ['مرحبا'] },
  };
  const arabicPage = [
    { key: 'home.title', text: 'مرحبا' },
    { key: 'hero.cta', text: 'Start free trial' },
    { key: 'hero.sub', text: 'Ship faster' },
    { key: 'nav.help', text: 'Help' },
  ];
  const untranslated: SelectedElement = {
    key: 'hero.cta',
    fallbackValue: 'Start free trial',
    currentValue: 'Start free trial',
  };

  it('stays on the Arabic address when the page mostly shows English fallbacks', async () => {
    const { result, getCandidates, setLocale } = setup();
    getCandidates.mockResolvedValue(sparse);
    act(() => result.current.onUrlLocale('ar'));
    await act(async () => {
      await result.current.onVisibleTexts(arabicPage);
    });
    expect(setLocale).not.toHaveBeenCalledWith('en');
    expect(setLocale).toHaveBeenLastCalledWith('ar');
  });

  it.each(['url', 'content'] as const)(
    'keeps Arabic (%s) after a click on a text Arabic lacks',
    async (how) => {
      const { result, getCandidates, setLocale } = setup();
      getCandidates.mockResolvedValue(sparse);
      if (how === 'url') act(() => result.current.onUrlLocale('ar'));
      else {
        await act(async () => {
          await result.current.onVisibleTexts(arabicPage);
        });
      }
      expect(result.current.source).toBe(how);
      let resolved: boolean | undefined;
      await act(async () => {
        resolved = await result.current.resolveForSelection(untranslated);
      });
      expect(resolved).toBe(true);
      expect(setLocale).not.toHaveBeenCalledWith('en');
      expect(result.current.source).toBe(how);
      expect(result.current.mismatch).toBeNull();
    }
  );

  it('asks which language when only fallback text tells it', async () => {
    const { result, getCandidates } = setup();
    getCandidates.mockResolvedValue(sparse);
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection(untranslated);
    });
    expect(resolved).toBe(false);
    expect(result.current.pickerCandidates).toEqual(['ar', 'en']);
  });

  it('does not change the language while typed text is unsaved, and flags it', async () => {
    let unsaved = true;
    const setLocale = vi.fn();
    const { result } = renderHook(() =>
      useTargetLocale({
        enabled: true,
        scope: SCOPE,
        locale: 'en',
        setLocale,
        locales: ['ar', 'en'],
        getCandidates: async () => candidates,
        hasUnsavedChanges: () => unsaved,
      })
    );
    act(() => result.current.onUrlLocale('en'));
    await act(async () => {
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'مرحبا' }]);
    });
    expect(setLocale).not.toHaveBeenCalledWith('ar');
    expect(result.current.mismatch).toBe('ar');

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection(el('مرحبا'));
    });
    expect(resolved).toBe(true);
    expect(setLocale).not.toHaveBeenCalledWith('ar');
    expect(result.current.mismatch).toBe('ar');

    // Once saved, the page decides again and the flag goes.
    unsaved = false;
    await act(async () => {
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'مرحبا' }]);
    });
    expect(setLocale).toHaveBeenLastCalledWith('ar');
    expect(result.current.mismatch).toBeNull();
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

  it('shows a language chosen in the menu or remembered in the app preview', async () => {
    const { result, showLocale, unmount } = setup();
    act(() => result.current.onUrlLocale('en'));
    await act(async () => {
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'Welcome' }]);
      await result.current.resolveForSelection(el('مرحبا'));
    });
    act(() => {
      result.current.choose('en');
    });
    // Page-driven decisions and a pick answer what the page shows; they never navigate it.
    expect(showLocale).not.toHaveBeenCalled();

    act(() => result.current.onMenuLocale('ar'));
    expect(showLocale).toHaveBeenCalledWith('ar');
    unmount();

    // After a reload, the remembered language is shown again.
    const reloaded = setup();
    expect(reloaded.setLocale).toHaveBeenCalledWith('ar');
    expect(reloaded.showLocale).toHaveBeenCalledWith('ar');
  });

  it('never calls showLocale in server mode', () => {
    localStorage.setItem(TARGET_LOCALE_STORAGE_PREFIX + SCOPE, 'ar');
    const { result, showLocale } = setup({ enabled: false });
    act(() => result.current.onMenuLocale('fr'));
    expect(showLocale).not.toHaveBeenCalled();
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

describe('useTargetLocale following the page on a server stack', () => {
  const follow = (locale = 'en', texts: TextCandidates = candidates) => {
    const setLocale = vi.fn();
    const setMenuLocale = vi.fn();
    const showLocale = vi.fn();
    const getCandidates = vi.fn(async () => texts);
    const hook = renderHook(() =>
      useTargetLocale({
        enabled: false,
        followPage: true,
        scope: null,
        locale,
        setLocale,
        setMenuLocale,
        showLocale,
        locales: ['ar', 'en'],
        getCandidates,
      })
    );
    return { ...hook, setLocale, setMenuLocale, showLocale };
  };

  it("edits Arabic once the app's own switch shows Arabic text", async () => {
    const { result, setLocale, showLocale } = follow();
    await act(async () => {
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'مرحبا' }]);
    });
    expect(setLocale).toHaveBeenCalledWith('ar');
    expect(result.current.source).toBe('content');
    // The page already shows Arabic: nothing reloads it.
    expect(showLocale).not.toHaveBeenCalled();
  });

  it('an Alt+Click on Arabic text edits Arabic', async () => {
    const { result, setLocale } = follow();
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection(el('مرحبا'));
    });
    expect(resolved).toBe(true);
    expect(setLocale).toHaveBeenCalledWith('ar');
  });

  it('keeps a language chosen in the menu and only flags text in another one', async () => {
    const { result, setLocale, setMenuLocale } = follow();
    act(() => result.current.onMenuLocale('en'));
    expect(setMenuLocale).toHaveBeenCalledWith('en');
    expect(result.current.source).toBe('manual');

    await act(async () => {
      await result.current.onVisibleTexts([{ key: 'home.title', text: 'مرحبا' }]);
    });
    expect(setLocale).not.toHaveBeenCalled();

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection(el('مرحبا'));
    });
    expect(resolved).toBe(true);
    expect(setLocale).not.toHaveBeenCalled();
    expect(result.current.mismatch).toBe('ar');
  });

  it('the address echoing the menu choice keeps it manual; another address wins', () => {
    const { result, setLocale } = follow();
    act(() => result.current.onMenuLocale('en'));
    act(() => result.current.onUrlLocale('en'));
    expect(result.current.source).toBe('manual');
    act(() => result.current.onUrlLocale('ar'));
    expect(setLocale).toHaveBeenCalledWith('ar');
    expect(result.current.source).toBe('url');
  });

  it('keeps Arabic from /ar on a sparse Arabic page, before and after a click', async () => {
    const sparse: TextCandidates = {
      en: { 'home.title': ['Welcome'], 'hero.cta': ['Start'], 'nav.help': ['Help'] },
      ar: { 'home.title': ['مرحبا'] },
    };
    const { result, setLocale } = follow('en', sparse);
    act(() => result.current.onUrlLocale('ar'));
    await act(async () => {
      await result.current.onVisibleTexts([
        { key: 'home.title', text: 'مرحبا' },
        { key: 'hero.cta', text: 'Start' },
        { key: 'nav.help', text: 'Help' },
      ]);
      await result.current.resolveForSelection({
        key: 'hero.cta',
        fallbackValue: 'Start',
        currentValue: 'Start',
      });
    });
    expect(setLocale).toHaveBeenLastCalledWith('ar');
    expect(setLocale).not.toHaveBeenCalledWith('en');
    expect(result.current.mismatch).toBeNull();
  });

  it('never asks which language to edit: an unclear click keeps the current one', async () => {
    const { result } = follow();
    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.resolveForSelection(el('Nothing like either'));
    });
    expect(resolved).toBe(true);
    expect(result.current.pickerCandidates).toBeNull();
  });
});
