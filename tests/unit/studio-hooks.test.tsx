// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useKeySearch } from '../../src/studio/features/dashboard/hooks/useKeySearch.js';
import { useSelection } from '../../src/studio/features/dashboard/hooks/useSelection.js';
import { useConnection } from '../../src/studio/features/dashboard/hooks/useConnection.js';
import { MAX_VISIBLE_TEXTS } from '../../src/client/iframe-bridge.js';
import { resetStudioRuntime, setStudioRuntime } from '../../src/studio/runtime.js';
import type { StaticTransport } from '../../src/studio/transport/static.js';
import { MANIFEST } from './helpers/share-fixtures.js';

// jsdom's default location is http://localhost:3000, which is also the default
// APP_ORIGIN, so postMessage origin checks line up without extra configuration.
const APP_ORIGIN = 'http://localhost:3000';

describe('useKeySearch', () => {
  const allKeys = ['home.title', 'home.subtitle', 'nav.about'];
  const localeData = {
    'home.title': 'Welcome',
    'home.subtitle': 'Hello there',
    'nav.about': 'About',
  };

  it('returns every key when the search term is empty', () => {
    const { result } = renderHook(() => useKeySearch({ allKeys, visibleKeys: null, localeData }));
    expect(result.current.filteredKeys).toEqual(allKeys);
  });

  it('matches the search term against keys and values, case-insensitively', () => {
    const { result } = renderHook(() => useKeySearch({ allKeys, visibleKeys: null, localeData }));
    act(() => result.current.setSearchTerm('HELLO'));
    expect(result.current.filteredKeys).toEqual(['home.subtitle']);
    act(() => result.current.setSearchTerm('nav'));
    expect(result.current.filteredKeys).toEqual(['nav.about']);
  });

  it('restricts to keys visible on the page only when the filter is on and keys were reported', () => {
    const { result, rerender } = renderHook(
      ({ visibleKeys }) => useKeySearch({ allKeys, visibleKeys, localeData }),
      { initialProps: { visibleKeys: ['nav.about'] as string[] | null } }
    );
    expect(result.current.filteredKeys).toEqual(allKeys);
    act(() => result.current.setFilterPageOnly(true));
    expect(result.current.filteredKeys).toEqual(['nav.about']);
    rerender({ visibleKeys: null });
    expect(result.current.filteredKeys).toEqual(allKeys);
  });
});

describe('useSelection', () => {
  const makeParams = () => ({
    localeData: { 'home.title': 'Welcome' },
    enLocaleData: { 'home.title': 'Welcome' },
    sendToIframe: vi.fn(),
    locale: 'ar',
    refreshKeysMetadata: vi.fn().mockResolvedValue(undefined),
    updateLocaleDataCache: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    onSaved: vi.fn(),
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects an element using the dictionary value and previews edits in the iframe', () => {
    const params = makeParams();
    const { result } = renderHook(() => useSelection(params));

    act(() =>
      result.current.selectElement({ key: 'home.title', fallbackValue: 'x', currentValue: 'stale' })
    );
    expect(result.current.selected?.currentValue).toBe('Welcome');
    expect(result.current.inputValue).toBe('Welcome');

    act(() => result.current.handleInputChange('Bienvenue'));
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(params.sendToIframe).toHaveBeenCalledWith('APPLY_PREVIEW', {
      key: 'home.title',
      value: 'Bienvenue',
      source: 'Welcome',
    });
  });

  it('starts a missing translation empty, with the source text as the reference', () => {
    const sub = 'Wolvy encrypts so <strong>only your audience</strong> can watch.';
    const params = { ...makeParams(), localeData: {}, enLocaleData: { 'home.hero.sub': sub } };
    const { result } = renderHook(() => useSelection(params));

    // The Arabic file lacks the key, so the page shows the English text, without its tags.
    act(() =>
      result.current.selectElement({
        key: 'home.hero.sub',
        fallbackValue: 'Wolvy encrypts so',
        currentValue: 'Wolvy encrypts so only your audience can watch.',
      })
    );
    expect(result.current.inputValue).toBe('');
    expect(result.current.selected?.currentValue).toBe('');
    expect(result.current.selected?.fallbackValue).toBe(sub);
    expect(result.current.hasUnsavedChanges).toBe(false);

    // Typing enables Save; the live preview still finds the English text, markup and all.
    act(() => result.current.handleInputChange('وولفي <strong>جمهورك</strong>'));
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(params.sendToIframe).toHaveBeenLastCalledWith('APPLY_PREVIEW', {
      key: 'home.hero.sub',
      value: 'وولفي <strong>جمهورك</strong>',
      source: sub,
    });
  });

  it('commits a new translation over the fallback text the page showed', async () => {
    const params = { ...makeParams(), localeData: {}, enLocaleData: { 'hero.cta': 'Start' } };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    const { result } = renderHook(() => useSelection(params));
    act(() =>
      result.current.selectElement({
        key: 'hero.cta',
        fallbackValue: 'Start',
        currentValue: 'Start',
      })
    );
    act(() => result.current.handleInputChange('ابدأ'));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(params.sendToIframe).toHaveBeenCalledWith('COMMIT_PREVIEW', {
      key: 'hero.cta',
      value: 'ابدأ',
      source: 'Start',
    });
    // The file had no value: undo can only write an empty one, so the entry says the text is
    // new, and keeps what the page showed for a preview build that is reloaded.
    expect(params.onSaved).toHaveBeenCalledWith({
      locale: 'ar',
      key: 'hero.cta',
      previousValue: '',
      nextValue: 'ابدأ',
      added: true,
      pageValue: 'Start',
    });
    // Once saved, the page shows the new text, so the next preview replaces that.
    act(() => result.current.handleInputChange('ابدأ الآن'));
    expect(params.sendToIframe).toHaveBeenLastCalledWith('APPLY_PREVIEW', {
      key: 'hero.cta',
      value: 'ابدأ الآن',
      source: 'ابدأ',
    });
  });

  it('keeps the page text in the field when the source language itself lacks a stored value', () => {
    const params = { ...makeParams(), locale: 'en', localeData: {}, enLocaleData: {} };
    const { result } = renderHook(() => useSelection(params));
    act(() =>
      result.current.selectElement({ key: 'home.x', fallbackValue: 'x', currentValue: 'On page' })
    );
    expect(result.current.inputValue).toBe('On page');
  });

  it('prefills from the stored value of the edited locale over the page text', () => {
    const params = {
      ...makeParams(),
      localeData: { 'home.hero.sub': 'نص <strong>غني</strong>' },
      enLocaleData: { 'home.hero.sub': 'Rich <strong>text</strong>' },
    };
    const { result } = renderHook(() => useSelection(params));
    act(() =>
      result.current.selectElement({
        key: 'home.hero.sub',
        fallbackValue: 'x',
        currentValue: 'نص غني',
      })
    );
    expect(result.current.inputValue).toBe('نص <strong>غني</strong>');
  });

  // The preview replaces the text the page shows; for a missing translation that is the
  // fallback's value, found the same way the 1.2.0 prefill found it.
  const previewSource = (result: { current: ReturnType<typeof useSelection> }, send: any) => {
    act(() => result.current.handleInputChange('…'));
    return send.mock.calls.at(-1)[1].source;
  };

  it('previews against the reference value when only the marked text matches it', () => {
    const title = 'Advanced protection for your video content.';
    const params = { ...makeParams(), localeData: {}, enLocaleData: { 'home.hero.title': title } };
    const { result } = renderHook(() => useSelection(params));
    // The page text holds the headline's literal cursor span as well.
    act(() =>
      result.current.selectElement({
        key: 'home.hero.title',
        fallbackValue: title,
        currentValue: `${title} _`,
      })
    );
    expect(result.current.inputValue).toBe('');
    expect(previewSource(result, params.sendToIframe)).toBe(title);
  });

  it('previews against the reference value when the marked text ends in a page separator', () => {
    const params = { ...makeParams(), localeData: {}, enLocaleData: { 'footer.terms': 'Terms' } };
    const { result } = renderHook(() => useSelection(params));
    act(() =>
      result.current.selectElement({
        key: 'footer.terms',
        fallbackValue: 'Terms ·',
        currentValue: 'Terms ·',
      })
    );
    expect(previewSource(result, params.sendToIframe)).toBe('Terms');
  });

  it('previews against the page text when no stored value shows it', () => {
    const params = { ...makeParams(), localeData: {}, enLocaleData: { 'home.x': 'Other' } };
    const { result } = renderHook(() => useSelection(params));
    act(() =>
      result.current.selectElement({ key: 'home.x', fallbackValue: 'x', currentValue: 'On page' })
    );
    expect(result.current.inputValue).toBe('');
    expect(previewSource(result, params.sendToIframe)).toBe('On page');
  });

  it('takes the reference from the source locale, not the text on the page', () => {
    const params = {
      ...makeParams(),
      localeData: { 'home.title': 'مرحبا' },
      enLocaleData: { 'home.title': 'Welcome' },
    };
    const { result } = renderHook(() => useSelection(params));

    // A pick on a page already showing the Arabic value reports that text as its fallback.
    act(() =>
      result.current.selectElement({
        key: 'home.title',
        fallbackValue: 'مرحبا',
        currentValue: 'مرحبا',
      })
    );
    expect(result.current.selected?.fallbackValue).toBe('Welcome');
  });

  it('keeps the page fallback as the reference when the source locale lacks the key', () => {
    const params = { ...makeParams(), localeData: { 'home.new': 'جديد' }, enLocaleData: {} };
    const { result } = renderHook(() => useSelection(params));

    act(() =>
      result.current.selectElement({ key: 'home.new', fallbackValue: 'New', currentValue: 'جديد' })
    );
    expect(result.current.selected?.fallbackValue).toBe('New');
  });

  it('counts every completed pick, including a repeat pick of the same key', () => {
    const params = makeParams();
    const { result } = renderHook(() => useSelection(params));
    expect(result.current.selectionCount).toBe(0);

    const el = { key: 'home.title', fallbackValue: 'x', currentValue: 'Welcome' };
    act(() => result.current.selectElement(el));
    expect(result.current.selectionCount).toBe(1);
    act(() => result.current.selectElement(el));
    expect(result.current.selectionCount).toBe(2);

    // A pick held behind the discard prompt counts only once it is confirmed.
    act(() => result.current.handleInputChange('edited'));
    act(() => result.current.selectElement(el));
    expect(result.current.showConfirmModal).toBe(true);
    expect(result.current.selectionCount).toBe(2);
    act(() => result.current.confirmDiscard());
    expect(result.current.selectionCount).toBe(3);

    // Clearing the selection does not count as a pick.
    act(() => result.current.handleClearSelection());
    expect(result.current.selected).toBeNull();
    expect(result.current.selectionCount).toBe(3);
  });

  it('takes a typed-then-erased preview off the page when another text is picked', () => {
    const params = { ...makeParams(), locale: 'fr', localeData: {} };
    const { result } = renderHook(() => useSelection(params));

    act(() =>
      result.current.selectElement({
        key: 'home.title',
        fallbackValue: 'Welcome',
        currentValue: 'Welcome',
      })
    );
    act(() => result.current.handleInputChange('B'));
    act(() => result.current.handleInputChange(''));
    expect(result.current.hasUnsavedChanges).toBe(false);
    vi.mocked(params.sendToIframe).mockClear();
    act(() => result.current.selectKeyDirectly('nav.about'));
    expect(params.sendToIframe).toHaveBeenCalledWith('RESTORE_PREVIEW', { key: 'home.title' });
  });

  it('keeps what the page showed when the same missing translation is picked again', () => {
    const params = { ...makeParams(), locale: 'fr', localeData: {} };
    const { result } = renderHook(() => useSelection(params));
    const pick = { key: 'home.title', fallbackValue: 'Welcome', currentValue: 'Welcome' };

    act(() => result.current.selectElement(pick));
    act(() => result.current.handleInputChange('Bienvenue'));
    // The page reports the text with the typed preview still on it.
    act(() => result.current.selectElement({ ...pick, currentValue: 'Bienvenue' }));
    act(() => result.current.confirmDiscard());
    expect(result.current.selected?.pageValue).toBe('Welcome');
    expect(result.current.inputValue).toBe('');
  });

  it('asks for confirmation before discarding unsaved edits, then honours the choice', () => {
    const params = {
      ...makeParams(),
      localeData: { 'home.title': 'Welcome', 'nav.about': 'About' },
    };
    const { result } = renderHook(() => useSelection(params));

    act(() => result.current.selectKeyDirectly('home.title'));
    act(() => result.current.handleInputChange('edited'));
    act(() =>
      result.current.selectElement({
        key: 'nav.about',
        fallbackValue: 'About',
        currentValue: 'About',
      })
    );
    expect(result.current.showConfirmModal).toBe(true);
    expect(result.current.selected?.key).toBe('home.title');

    act(() => result.current.cancelDiscard());
    expect(result.current.showConfirmModal).toBe(false);
    expect(result.current.inputValue).toBe('edited');

    act(() =>
      result.current.selectElement({
        key: 'nav.about',
        fallbackValue: 'About',
        currentValue: 'About',
      })
    );
    vi.mocked(params.sendToIframe).mockClear();
    act(() => result.current.confirmDiscard());
    expect(result.current.selected?.key).toBe('nav.about');
    expect(result.current.inputValue).toBe('About');
    // The page stops showing the discarded text for the key left behind.
    expect(params.sendToIframe).toHaveBeenCalledWith('RESTORE_PREVIEW', { key: 'home.title' });
  });

  it('saves through the mutation API and clears the selection highlight', async () => {
    const params = makeParams();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    const { result } = renderHook(() => useSelection(params));

    act(() => result.current.selectKeyDirectly('home.title'));
    act(() => result.current.handleInputChange('Bienvenue'));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(fetch).toHaveBeenCalledWith(
      `${APP_ORIGIN}/api/livelocale`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          locale: 'ar',
          key: 'home.title',
          value: 'Bienvenue',
          reference: 'Welcome',
        }),
      })
    );
    expect(result.current.isSuccess).toBe(true);
    expect(params.updateLocaleDataCache).toHaveBeenCalledWith('home.title', 'Bienvenue');
    // The saved text is committed on the page before the selection is cleared,
    // so a preview deployment does not revert to the pre-edit value.
    const sent = params.sendToIframe.mock.calls.map((c: unknown[]) => c[0]);
    expect(params.sendToIframe).toHaveBeenCalledWith('COMMIT_PREVIEW', {
      key: 'home.title',
      value: 'Bienvenue',
      source: 'Welcome',
    });
    expect(sent.lastIndexOf('COMMIT_PREVIEW')).toBeLessThan(sent.lastIndexOf('CLEAR_SELECTION'));
    expect(params.setError).toHaveBeenLastCalledWith(null);
    expect(params.onSaved).toHaveBeenCalledWith({
      locale: 'ar',
      key: 'home.title',
      previousValue: 'Welcome',
      nextValue: 'Bienvenue',
    });
  });

  it('sends the reference value with each save so the server can check placeholders', async () => {
    const params = makeParams();
    params.enLocaleData = { 'home.title': 'Welcome {name}' };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    const { result } = renderHook(() => useSelection(params));

    act(() => result.current.selectKeyDirectly('home.title'));
    act(() => result.current.handleInputChange('Bienvenue {name}'));
    await act(async () => {
      await result.current.handleSave();
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      locale: 'ar',
      key: 'home.title',
      value: 'Bienvenue {name}',
      reference: 'Welcome {name}',
    });
  });

  it('takes the reference from the project source locale, not from en', async () => {
    const params = { ...makeParams(), locale: 'en', referenceLocale: 'fr' };
    params.localeData = { 'home.title': 'Welcome' };
    params.enLocaleData = { 'home.title': 'Bienvenue {name}' };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    const { result } = renderHook(() => useSelection(params));

    act(() => result.current.selectKeyDirectly('home.title'));
    act(() => result.current.handleInputChange('Welcome {name}'));
    await act(async () => {
      await result.current.handleSave();
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String((init as RequestInit).body)).reference).toBe('Bienvenue {name}');
  });

  it('turns a 422 into a save warning and saves anyway when forced', async () => {
    const params = makeParams();
    params.enLocaleData = { 'home.title': 'Welcome {name}' };
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'Placeholders differ from the reference: missing {name}.',
            code: 'PLACEHOLDER_MISMATCH',
            details: { missing: ['{name}'], extra: [] },
          }),
          { status: 422 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const { result } = renderHook(() => useSelection(params));

    act(() => result.current.selectKeyDirectly('home.title'));
    act(() => result.current.handleInputChange('Bienvenue'));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.saveWarning).toMatchObject({
      code: 'PLACEHOLDER_MISMATCH',
      missing: ['{name}'],
      extra: [],
    });
    expect(params.setError).not.toHaveBeenCalledWith(expect.stringMatching(/Placeholders/));

    await act(async () => {
      await result.current.handleSave({ force: true });
    });
    const [, init] = vi.mocked(fetch).mock.calls[1]!;
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ force: true });
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.saveWarning).toBeNull();
  });

  it('reports the server error message when a save is rejected', async () => {
    const params = makeParams();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden: LiveLocale is disabled' }), { status: 403 })
    );
    const { result } = renderHook(() => useSelection(params));

    act(() => result.current.selectKeyDirectly('home.title'));
    act(() => result.current.handleInputChange('x'));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.isSuccess).toBe(false);
    expect(params.setError).toHaveBeenLastCalledWith('Forbidden: LiveLocale is disabled');
    expect(params.updateLocaleDataCache).not.toHaveBeenCalled();
    expect(params.onSaved).not.toHaveBeenCalled();
  });

  const saveFailing = async (response: () => Promise<Response>) => {
    const params = makeParams();
    vi.mocked(fetch).mockImplementation(response);
    const { result } = renderHook(() => useSelection(params));
    act(() => result.current.selectKeyDirectly('home.title'));
    act(() => result.current.handleInputChange('مرحبا'));
    await act(async () => {
      await result.current.handleSave();
    });
    // The typed text stays in the field, ready for another try.
    expect(result.current.inputValue).toBe('مرحبا');
    expect(result.current.hasUnsavedChanges).toBe(true);
    return params.setError.mock.calls.at(-1)?.[0] as string;
  };

  it('says in plain words that the site could not be reached and the text is kept', async () => {
    const message = await saveFailing(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(message).toMatch(/^Could not reach your site\./);
    expect(message).toContain('Your text is still here');
    expect(message).not.toContain('Failed to fetch');
  });

  it('says in plain words that the site answered with an error when it gives no message', async () => {
    const message = await saveFailing(async () => new Response('', { status: 500 }));
    expect(message).toMatch(/^The site answered with an error \(500\)\./);
    expect(message).toContain('Your text is still here');
  });

  it("keeps the server's own message, such as a refused structure change", async () => {
    const error = 'home.title holds a group of texts, not one text, so it cannot be saved here.';
    const message = await saveFailing(
      async () => new Response(JSON.stringify({ error, code: 'KEY_NOT_A_STRING' }), { status: 409 })
    );
    expect(message).toBe(error);
  });
});

describe('useConnection', () => {
  const post = (data: unknown, origin = APP_ORIGIN) => {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin }));
    });
  };

  const makeHandlers = () => ({
    onElementSelected: vi.fn(),
    onLocaleDetected: vi.fn(),
    onError: vi.fn(),
  });

  it('starts connecting and switches to connected on READY, detecting the locale from the URL', async () => {
    const handlers = makeHandlers();
    const { result } = renderHook(() => useConnection(handlers));
    expect(result.current.connectionStatus).toBe('connecting');

    post({ source: 'livelocale-client', type: 'READY', payload: { url: '/?locale=ar' } });
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));
    expect(result.current.currentPath).toBe('/?locale=ar');
    expect(handlers.onLocaleDetected).toHaveBeenCalledWith('ar');
  });

  it('shows the path of the ?app= page until the client reports one', () => {
    setStudioRuntime({
      kind: 'server',
      appOrigin: APP_ORIGIN,
      appUrl: `${APP_ORIGIN}/ar/`,
      problems: [],
    });
    try {
      const { result } = renderHook(() => useConnection(makeHandlers()));
      expect(result.current.currentPath).toBe('/ar/');
    } finally {
      resetStudioRuntime();
    }
  });

  it('detects a locale from the first path segment', () => {
    const handlers = makeHandlers();
    renderHook(() => useConnection(handlers));
    post({ source: 'livelocale-client', type: 'READY', payload: { url: '/fr/pricing' } });
    expect(handlers.onLocaleDetected).toHaveBeenCalledWith('fr');
  });

  it('ignores messages from other origins or other sources', () => {
    const handlers = makeHandlers();
    const { result } = renderHook(() => useConnection(handlers));

    post(
      { source: 'livelocale-client', type: 'READY', payload: { url: '/' } },
      'https://evil.example.com'
    );
    post({ source: 'someone-else', type: 'READY', payload: { url: '/' } });
    expect(result.current.connectionStatus).toBe('connecting');
  });

  it('forwards selections, errors, and visible keys to the handlers and state', () => {
    const handlers = makeHandlers();
    const { result } = renderHook(() => useConnection(handlers));

    const payload = { key: 'home.title', fallbackValue: 'Welcome', currentValue: 'Welcome' };
    post({ source: 'livelocale-client', type: 'ELEMENT_SELECTED', payload });
    expect(handlers.onElementSelected).toHaveBeenCalledWith(payload);

    post({ source: 'livelocale-client', type: 'ERROR', payload: { error: 'boom' } });
    expect(handlers.onError).toHaveBeenCalledWith('boom');

    post({ source: 'livelocale-client', type: 'VISIBLE_KEYS_CHANGED', payload: ['home.title'] });
    expect(result.current.visibleKeys).toEqual(['home.title']);
  });

  it('forwards VISIBLE_TEXTS_CHANGED from the app origin only', () => {
    const onVisibleTexts = vi.fn();
    renderHook(() => useConnection({ ...makeHandlers(), onVisibleTexts }));
    const texts = [{ key: 'home.title', text: 'مرحبا' }];

    post(
      { source: 'livelocale-client', type: 'VISIBLE_TEXTS_CHANGED', payload: texts },
      'https://evil.example.com'
    );
    post({ source: 'livelocale-client', type: 'VISIBLE_TEXTS_CHANGED', payload: { 0: texts[0] } });
    expect(onVisibleTexts).not.toHaveBeenCalled();

    post({ source: 'livelocale-client', type: 'VISIBLE_TEXTS_CHANGED', payload: texts });
    expect(onVisibleTexts).toHaveBeenCalledTimes(1);
    expect(onVisibleTexts).toHaveBeenCalledWith(texts);
  });

  it('caps VISIBLE_TEXTS_CHANGED at MAX_VISIBLE_TEXTS valid entries', () => {
    const onVisibleTexts = vi.fn();
    renderHook(() => useConnection({ ...makeHandlers(), onVisibleTexts }));
    const many = Array.from({ length: MAX_VISIBLE_TEXTS + 5 }, (_, i) => ({
      key: `k${i}`,
      text: `t${i}`,
    }));
    post({
      source: 'livelocale-client',
      type: 'VISIBLE_TEXTS_CHANGED',
      payload: [null, { key: 1, text: 'x' }, ...many],
    });
    const forwarded = onVisibleTexts.mock.calls[0]?.[0] as unknown[];
    expect(forwarded).toHaveLength(MAX_VISIBLE_TEXTS);
    expect(forwarded[0]).toEqual({ key: 'k0', text: 't0' });
  });

  it('follows LOCATION_CHANGED from the app origin', () => {
    const handlers = makeHandlers();
    const { result } = renderHook(() => useConnection(handlers));
    post({ source: 'livelocale-client', type: 'READY', payload: { url: '/' } });
    expect(result.current.locationSeq).toBe(1);
    post({
      source: 'livelocale-client',
      type: 'LOCATION_CHANGED',
      payload: { url: '/fr/pricing' },
    });
    expect(result.current.currentPath).toBe('/fr/pricing');
    expect(result.current.locationSeq).toBe(2);
    expect(result.current.locationKnown).toBe(true);
    expect(handlers.onLocaleDetected).toHaveBeenCalledWith('fr');
  });

  it('ignores foreign LOCATION_CHANGED and forgets the location on a malformed one', () => {
    const malformed = [
      { url: '//evil.example/' },
      { url: '/\\evil.example/' },
      { url: 'https://x/' },
      { url: 42 },
      {},
      { url: '/' + 'a'.repeat(2048) },
    ];
    for (const payload of malformed) {
      const { result, unmount } = renderHook(() => useConnection(makeHandlers()));
      post({ source: 'livelocale-client', type: 'READY', payload: { url: '/a' } });
      post(
        { source: 'livelocale-client', type: 'LOCATION_CHANGED', payload: { url: '/b' } },
        'https://evil.example.com'
      );
      expect(result.current.currentPath).toBe('/a');
      expect(result.current.locationSeq).toBe(1);
      expect(result.current.locationKnown).toBe(true);

      post({ source: 'livelocale-client', type: 'LOCATION_CHANGED', payload });
      expect(result.current.currentPath).toBe('/a');
      expect(result.current.locationSeq).toBe(1);
      expect(result.current.locationKnown).toBe(false);
      unmount();
    }
  });

  it('never takes a reported url that a URL parser reads as another host', () => {
    const tricks = [
      '/\t/evil.example/',
      '/\n/evil.example/',
      '/\r/evil.example/',
      '/\\evil.example/',
      '/\t\\evil.example/',
      '/\u0000/evil.example/',
      '/\u001f/evil.example/',
      '/\u007f/evil.example/',
      '/\u0085/evil.example/',
      '/\u009f/evil.example/',
      '/a\\..\\..\\/evil.example/',
      '/ok\t',
    ];
    for (const url of tricks) {
      const { result, unmount } = renderHook(() => useConnection(makeHandlers()));
      post({ source: 'livelocale-client', type: 'READY', payload: { url: '/a' } });
      post({ source: 'livelocale-client', type: 'LOCATION_CHANGED', payload: { url } });
      expect(result.current.currentPath, JSON.stringify(url)).toBe('/a');
      expect(result.current.locationSeq).toBe(1);
      expect(result.current.locationKnown).toBe(false);
      expect(new URL(result.current.currentPath, 'http://localhost:3000').host).toBe(
        'localhost:3000'
      );
      unmount();
    }
  });

  it('keeps a reported url whose query or hash holds a backslash', () => {
    const { result } = renderHook(() => useConnection(makeHandlers()));
    post({ source: 'livelocale-client', type: 'READY', payload: { url: '/a?q=x\\y#h\\i' } });
    expect(result.current.currentPath).toBe('/a?q=x\\y#h\\i');
    expect(result.current.locationKnown).toBe(true);
  });

  it('connects on a READY without a usable url', () => {
    const { result } = renderHook(() => useConnection(makeHandlers()));
    post({ source: 'livelocale-client', type: 'READY', payload: {} });
    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.locationKnown).toBe(false);
    expect(result.current.currentPath).toBe('/');
  });

  it('forgets the location on LEAVING', () => {
    const { result } = renderHook(() => useConnection(makeHandlers()));
    post({ source: 'livelocale-client', type: 'READY', payload: { url: '/a' } });
    expect(result.current.locationKnown).toBe(true);
    post({ source: 'livelocale-client', type: 'LEAVING' });
    expect(result.current.locationKnown).toBe(false);
    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.currentPath).toBe('/a');
    expect(result.current.locationSeq).toBe(1);
  });

  it('reads the URL locale against the static manifest', () => {
    setStudioRuntime({
      kind: 'static',
      appOrigin: APP_ORIGIN,
      appUrl: `${APP_ORIGIN}/repo/`,
      manifest: { ...MANIFEST, basePath: '/repo/', locales: ['ar', 'en', 'pt-BR'] },
      manifestText: '',
      transport: {} as StaticTransport,
    });
    try {
      const handlers = makeHandlers();
      renderHook(() => useConnection(handlers));
      post({ source: 'livelocale-client', type: 'READY', payload: { url: '/repo/pt-br/x' } });
      expect(handlers.onLocaleDetected).toHaveBeenCalledWith('pt-BR');
      post({ source: 'livelocale-client', type: 'READY', payload: { url: '/repo/fr/x' } });
      expect(handlers.onLocaleDetected).toHaveBeenCalledTimes(1);
    } finally {
      resetStudioRuntime();
    }
  });
});
