// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocaleData } from '../../src/studio/features/dashboard/hooks/useLocaleData.js';
import { useLocaleActions } from '../../src/studio/features/dashboard/hooks/useLocaleActions.js';

const API = 'http://localhost:3000/api/i18n-lens/mutate';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Routes fetch calls by URL so each endpoint can answer independently. */
function routeFetch(routes: Record<string, () => unknown>) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    for (const [suffix, answer] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return jsonResponse(answer());
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });
}

describe('useLocaleData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads locales, keys metadata, and the active dictionary once connected', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/mutate': () => ['ar', 'en'],
        '?action=keys': () => ({
          allKeys: ['home.title', 'home.subtitle'],
          codeKeys: ['home.title'],
        }),
        '?locale=en': () => ({ home: { title: 'Welcome', subtitle: '' } }),
      })
    );
    const iframeRef = { current: null };
    const { result } = renderHook(() =>
      useLocaleData({ connectionStatus: 'connected', iframeRef })
    );

    await waitFor(() => expect(result.current.locales).toEqual(['ar', 'en']));
    await waitFor(() => expect(result.current.localeData['home.title']).toBe('Welcome'));
    expect(result.current.locale).toBe('en');
    expect(result.current.allKeys).toEqual(['home.title', 'home.subtitle']);
    // One of two keys has a non-empty value
    await waitFor(() => expect(result.current.coveragePercentage).toBe(50));
  });

  it('does nothing while still connecting', () => {
    vi.stubGlobal('fetch', vi.fn());
    const iframeRef = { current: null };
    renderHook(() => useLocaleData({ connectionStatus: 'connecting', iframeRef }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('switches the active locale and updates the iframe URL', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/mutate': () => ['ar', 'en'],
        '?action=keys': () => ({ allKeys: [], codeKeys: [] }),
        '?locale=en': () => ({ hello: 'Hello' }),
        '?locale=ar': () => ({ hello: 'مرحبا' }),
      })
    );
    // The hook only touches the iframe once it has a contentWindow, i.e. once attached.
    const iframe = document.createElement('iframe');
    iframe.src = 'http://localhost:3000/?i18n-lens-origin=http%3A%2F%2Flocalhost%3A3010';
    document.body.appendChild(iframe);
    const iframeRef = { current: iframe };
    const { result } = renderHook(() =>
      useLocaleData({ connectionStatus: 'connected', iframeRef })
    );
    await waitFor(() => expect(result.current.localeData['hello']).toBe('Hello'));

    act(() => result.current.handleLocaleChange('ar'));
    expect(result.current.locale).toBe('ar');
    expect(new URL(iframe.src).searchParams.get('locale')).toBe('ar');
    await waitFor(() => expect(result.current.localeData['hello']).toBe('مرحبا'));
    iframe.remove();
  });

  it('updates the local cache after a save without refetching', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/mutate': () => ['en'],
        '?action=keys': () => ({ allKeys: ['hello'], codeKeys: [] }),
        '?locale=en': () => ({ hello: 'Hello' }),
      })
    );
    const { result } = renderHook(() =>
      useLocaleData({ connectionStatus: 'connected', iframeRef: { current: null } })
    );
    await waitFor(() => expect(result.current.localeData['hello']).toBe('Hello'));
    const calls = vi.mocked(fetch).mock.calls.length;

    act(() => result.current.updateLocaleDataCache('hello', 'Hi'));
    expect(result.current.localeData['hello']).toBe('Hi');
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });
});

describe('useLocaleActions', () => {
  const makeParams = (overrides: Partial<Parameters<typeof useLocaleActions>[0]> = {}) => ({
    locale: 'en',
    locales: ['en', 'fr'],
    handleLocaleChange: vi.fn(),
    refreshAll: vi.fn().mockResolvedValue(undefined),
    handleClearSelection: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds a locale, refreshes, and switches to it', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true, locale: 'de' }));
    const params = makeParams();
    const { result } = renderHook(() => useLocaleActions(params));

    await act(async () => {
      await result.current.handleAddLocale('de');
    });
    expect(fetch).toHaveBeenCalledWith(
      API,
      expect.objectContaining({ body: JSON.stringify({ action: 'addLocale', locale: 'de' }) })
    );
    expect(params.refreshAll).toHaveBeenCalled();
    expect(params.handleLocaleChange).toHaveBeenCalledWith('de');
    expect(params.setLoading).toHaveBeenLastCalledWith(false);
  });

  it('renames the active locale and follows the rename', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));
    const params = makeParams();
    const { result } = renderHook(() => useLocaleActions(params));

    await act(async () => {
      await result.current.handleRenameLocale('en', 'en-US');
    });
    expect(params.handleLocaleChange).toHaveBeenCalledWith('en-US');
  });

  it('deletes the active locale and falls back to another one', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }));
    const params = makeParams({ locale: 'fr', locales: ['en', 'fr'] });
    const { result } = renderHook(() => useLocaleActions(params));

    await act(async () => {
      await result.current.handleDeleteLocale('fr');
    });
    expect(params.handleLocaleChange).toHaveBeenCalledWith('en');
    expect(params.handleClearSelection).toHaveBeenCalled();
  });

  it('reports server errors instead of throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'Locale "de" already exists.' }, 500));
    const params = makeParams();
    const { result } = renderHook(() => useLocaleActions(params));

    await act(async () => {
      await result.current.handleAddLocale('de');
    });
    expect(params.setError).toHaveBeenLastCalledWith('Locale "de" already exists.');
    expect(params.handleLocaleChange).not.toHaveBeenCalled();
  });
});
