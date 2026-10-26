// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useKeySearch } from '../../src/studio/features/dashboard/hooks/useKeySearch.js';
import { useSelection } from '../../src/studio/features/dashboard/hooks/useSelection.js';
import { useConnection } from '../../src/studio/features/dashboard/hooks/useConnection.js';

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
    });
  });

  it('asks for confirmation before discarding unsaved edits, then honours the choice', () => {
    const params = makeParams();
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
    act(() => result.current.confirmDiscard());
    expect(result.current.selected?.key).toBe('nav.about');
    expect(result.current.inputValue).toBe('About');
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
      `${APP_ORIGIN}/api/i18n-lens/mutate`,
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
      new Response(JSON.stringify({ error: 'Forbidden: i18n Lens is disabled' }), { status: 403 })
    );
    const { result } = renderHook(() => useSelection(params));

    act(() => result.current.selectKeyDirectly('home.title'));
    act(() => result.current.handleInputChange('x'));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.isSuccess).toBe(false);
    expect(params.setError).toHaveBeenLastCalledWith('Forbidden: i18n Lens is disabled');
    expect(params.updateLocaleDataCache).not.toHaveBeenCalled();
    expect(params.onSaved).not.toHaveBeenCalled();
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

    post({ source: 'i18n-lens-client', type: 'READY', payload: { url: '/?locale=ar' } });
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));
    expect(result.current.currentPath).toBe('/?locale=ar');
    expect(handlers.onLocaleDetected).toHaveBeenCalledWith('ar');
  });

  it('detects a locale from the first path segment', () => {
    const handlers = makeHandlers();
    renderHook(() => useConnection(handlers));
    post({ source: 'i18n-lens-client', type: 'READY', payload: { url: '/fr/pricing' } });
    expect(handlers.onLocaleDetected).toHaveBeenCalledWith('fr');
  });

  it('ignores messages from other origins or other sources', () => {
    const handlers = makeHandlers();
    const { result } = renderHook(() => useConnection(handlers));

    post(
      { source: 'i18n-lens-client', type: 'READY', payload: { url: '/' } },
      'https://evil.example.com'
    );
    post({ source: 'someone-else', type: 'READY', payload: { url: '/' } });
    expect(result.current.connectionStatus).toBe('connecting');
  });

  it('forwards selections, errors, and visible keys to the handlers and state', () => {
    const handlers = makeHandlers();
    const { result } = renderHook(() => useConnection(handlers));

    const payload = { key: 'home.title', fallbackValue: 'Welcome', currentValue: 'Welcome' };
    post({ source: 'i18n-lens-client', type: 'ELEMENT_SELECTED', payload });
    expect(handlers.onElementSelected).toHaveBeenCalledWith(payload);

    post({ source: 'i18n-lens-client', type: 'ERROR', payload: { error: 'boom' } });
    expect(handlers.onError).toHaveBeenCalledWith('boom');

    post({ source: 'i18n-lens-client', type: 'VISIBLE_KEYS_CHANGED', payload: ['home.title'] });
    expect(result.current.visibleKeys).toEqual(['home.title']);
  });
});
