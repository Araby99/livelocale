// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocaleData } from '../../src/studio/features/dashboard/hooks/useLocaleData.js';
import { useLocaleActions } from '../../src/studio/features/dashboard/hooks/useLocaleActions.js';
import { textFor } from '../../src/studio/i18n/catalogue.js';

const API = 'http://localhost:3000/api/livelocale';

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
        '/api/livelocale': () => ['ar', 'en'],
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
        '/api/livelocale': () => ['ar', 'en'],
        '?action=keys': () => ({ allKeys: [], codeKeys: [] }),
        '?locale=en': () => ({ hello: 'Hello' }),
        '?locale=ar': () => ({ hello: 'مرحبا' }),
      })
    );
    // The hook only touches the iframe once it has a contentWindow, i.e. once attached.
    const iframe = document.createElement('iframe');
    iframe.src = 'http://localhost:3000/?livelocale-origin=http%3A%2F%2Flocalhost%3A3010';
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

  it('hands the language switch to showLocale when given', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/api/livelocale': () => ['ar', 'en'],
        '?action=keys': () => ({ allKeys: [], codeKeys: [] }),
        '?locale=en': () => ({ hello: 'Hello' }),
        '?locale=ar': () => ({ hello: 'مرحبا' }),
      })
    );
    const iframe = document.createElement('iframe');
    const src = 'http://localhost:3000/?livelocale-origin=http%3A%2F%2Flocalhost%3A3010';
    iframe.src = src;
    document.body.appendChild(iframe);
    const iframeRef = { current: iframe };
    const showLocale = vi.fn();
    const { result } = renderHook(() =>
      useLocaleData({ connectionStatus: 'connected', iframeRef, showLocale })
    );
    await waitFor(() => expect(result.current.localeData['hello']).toBe('Hello'));

    act(() => result.current.handleLocaleChange('ar'));
    expect(showLocale).toHaveBeenCalledWith('ar');
    expect(result.current.locale).toBe('ar');
    expect(iframe.src).toBe(src);
    await waitFor(() => expect(result.current.localeData['hello']).toBe('مرحبا'));
    iframe.remove();
  });

  it('reports which locale the loaded dictionary belongs to', async () => {
    let releaseAr: () => void = () => {};
    const arGate = new Promise<void>((r) => (releaseAr = r));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('?locale=ar')) {
          await arGate;
          return jsonResponse({ hello: 'مرحبا' });
        }
        if (url.endsWith('?locale=en')) return jsonResponse({ hello: 'Hello' });
        if (url.endsWith('?action=keys')) return jsonResponse({ allKeys: [], codeKeys: [] });
        return jsonResponse(['ar', 'en']);
      })
    );
    const iframeRef = { current: null };
    const { result } = renderHook(() =>
      useLocaleData({ connectionStatus: 'connected', iframeRef })
    );
    expect(result.current.dataLocale).toBeNull();
    await waitFor(() => expect(result.current.dataLocale).toBe('en'));

    act(() => result.current.setLocale('ar'));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).endsWith('?locale=ar'))).toBe(true)
    );
    expect(result.current.dataLocale).toBe('en');

    releaseAr();
    await waitFor(() => expect(result.current.dataLocale).toBe('ar'));
    expect(result.current.localeData.hello).toBe('مرحبا');
  });

  it('loads the reference dictionary from the given source locale', async () => {
    const fetchMock = routeFetch({
      '/api/livelocale': () => ['ar'],
      '?action=keys': () => ({ allKeys: [], codeKeys: [] }),
      '?locale=ar': () => ({ home: { title: 'مرحبا' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const iframeRef = { current: null };
    const { result } = renderHook(() =>
      useLocaleData({ connectionStatus: 'connected', iframeRef, referenceLocale: 'ar' })
    );
    await waitFor(() => expect(result.current.enLocaleData['home.title']).toBe('مرحبا'));
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('?locale=ar'))).toBe(true);
  });

  it('never copies another language into the reference while switching to it', async () => {
    let frRequests = 0;
    let releaseFr: () => void = () => {};
    const frGate = new Promise<void>((r) => (releaseFr = r));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('?locale=fr')) {
          // The first request is the reference load; the second is the active dictionary.
          if (++frRequests === 2) await frGate;
          return jsonResponse({ hello: 'Bonjour' });
        }
        if (url.endsWith('?locale=ar')) return jsonResponse({ hello: 'مرحبا' });
        if (url.endsWith('?action=keys')) return jsonResponse({ allKeys: [], codeKeys: [] });
        return jsonResponse(['ar', 'fr']);
      })
    );
    const seen: string[] = [];
    const { result } = renderHook(() => {
      const hook = useLocaleData({
        connectionStatus: 'connected',
        iframeRef: { current: null },
        referenceLocale: 'fr',
      });
      if (hook.enLocaleData.hello !== undefined) seen.push(hook.enLocaleData.hello);
      return hook;
    });
    await waitFor(() => expect(result.current.dataLocale).toBe('ar'));
    await waitFor(() => expect(result.current.enLocaleData.hello).toBe('Bonjour'));

    act(() => result.current.setLocale('fr'));
    await waitFor(() => expect(frRequests).toBe(2));
    expect(result.current.enLocaleData.hello).toBe('Bonjour');

    releaseFr();
    await waitFor(() => expect(result.current.dataLocale).toBe('fr'));
    expect(result.current.enLocaleData.hello).toBe('Bonjour');
    expect(seen).not.toContain('مرحبا');
  });

  it('updates the local cache after a save without refetching', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        '/api/livelocale': () => ['en'],
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

  it('reports a failed add-locale in Arabic when the server gives no message', async () => {
    // A 500 body without `error` still has a message ("Server responded with status 500").
    vi.mocked(fetch).mockRejectedValue(new Error(''));
    const params = makeParams({ t: textFor('ar') });
    const { result } = renderHook(() => useLocaleActions(params));

    await act(async () => {
      await result.current.handleAddLocale('de');
    });
    expect(params.setError).toHaveBeenLastCalledWith(textFor('ar')('errors.add_locale_failed'));
  });
});
