// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { ChangeLinkError, decodeChangeLink, type ChangeSet } from '../../src/core/change-link.js';
import { useReview } from '../../src/studio/features/dashboard/hooks/useReview.js';
import { useStudio } from '../../src/studio/features/dashboard/hooks/useStudio.js';
import type { ConnectionHandlers } from '../../src/studio/features/dashboard/hooks/useConnection.js';
import { setStudioTransport } from '../../src/studio/api.js';
import { resetStudioRuntime, setStudioRuntime } from '../../src/studio/runtime.js';
import type { StaticTransport } from '../../src/studio/transport/static.js';
import type { Draft } from '../../src/studio/transport/drafts.js';
import { describeLinkError } from '../../src/studio/share/send.js';
import { AR, EN, MANIFEST, SHA_A } from './helpers/share-fixtures.js';

vi.mock('../../src/core/change-link.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/change-link.js')>()),
  decodeChangeLink: vi.fn(),
}));

// The iframe bridge, driven by the tests: state the Studio reads and the handlers it registers.
const conn = vi.hoisted(() => ({
  state: {
    connectionStatus: 'connected' as const,
    currentPath: '/',
    visibleKeys: null as string[] | null,
  },
  handlers: null as unknown,
  sendToIframe: null as unknown,
}));

vi.mock('../../src/studio/features/dashboard/hooks/useConnection.js', () => ({
  useConnection: (handlers: unknown) => {
    conn.handlers = handlers;
    return {
      ...conn.state,
      iframeRef: { current: null },
      sendToIframe: conn.sendToIframe,
    };
  },
}));

const decode = vi.mocked(decodeChangeLink);

const SET: ChangeSet = {
  branch: 'main',
  base: SHA_A,
  src: 'en',
  by: 'Sara',
  note: '',
  edits: [
    { locale: 'ar', key: 'home.title', from: 'مرحبا', to: 'أهلا', force: false },
    { locale: 'fr', key: 'home.title', from: 'Bienvenue', to: 'Salut', force: false },
  ],
};

const FR = { home: { title: 'Bienvenue', greet: 'Bonjour {name}' } };
const BUILT: Record<string, Record<string, unknown>> = { ar: AR, en: EN, fr: FR };

type Props = Parameters<typeof useReview>[0];

const setupReview = (overrides: Partial<Props> = {}) => {
  const readBuiltLocale = vi.fn(async (l: string) => {
    const dict = BUILT[l];
    if (!dict) throw new Error('404');
    return dict;
  });
  const fetchLocaleDictionary = vi.fn(async () => ({}));
  const sendToIframe = vi.fn();
  const reloadFrame = vi.fn();
  const initialProps: Props = {
    mode: 'static',
    locale: 'ar',
    locales: ['ar', 'en', 'fr'],
    sourceLocale: 'en',
    layout: 'flat',
    readLocale: readBuiltLocale,
    connectionStatus: 'connected',
    currentPath: '/',
    visibleKeys: null,
    sendToIframe,
    reloadFrame,
    ...overrides,
  };
  const hook = renderHook((props: Props) => useReview(props), { initialProps });
  return {
    ...hook,
    initialProps,
    readBuiltLocale,
    fetchLocaleDictionary,
    sendToIframe,
    reloadFrame,
  };
};

const previews = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([type]) => type === 'COMMIT_PREVIEW').map(([, payload]) => payload);

beforeEach(() => {
  decode.mockReset();
  decode.mockResolvedValue(SET);
  vi.stubGlobal('fetch', vi.fn());
  history.replaceState(null, '', '/livelocale/index.html');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
  localStorage.clear();
  resetStudioRuntime();
  setStudioTransport(null);
});

describe('useReview', () => {
  it('opens a review from the URL hash in static mode', async () => {
    history.replaceState(null, '', '/livelocale/index.html#lc1.abc');
    const { result, readBuiltLocale, fetchLocaleDictionary } = setupReview();
    await waitFor(() => expect(result.current.review).not.toBeNull());
    expect(decode).toHaveBeenCalledWith('lc1.abc');
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result.current.review!.token).toBe('lc1.abc');
    expect(result.current.review!.rows).toHaveLength(2);
    expect(result.current.review!.target).toBe('github');
    expect(result.current.review!.sourceLocale).toBe('en');
    expect(readBuiltLocale.mock.calls.map(([l]) => l).sort()).toEqual(['ar', 'en', 'fr']);
    expect(fetchLocaleDictionary).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('reports a damaged link in plain words', async () => {
    decode.mockRejectedValue(new ChangeLinkError('CORRUPT', 'corrupt'));
    const { result } = setupReview();
    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current.openReview('lc1.abc');
    });
    expect(opened).toBe(false);
    expect(result.current.error).toBe(describeLinkError(new ChangeLinkError('CORRUPT', 'x')));
    expect(result.current.error).toContain('damaged or incomplete');
    expect(result.current.review).toBeNull();
  });

  it('says no change link was found for text without one', async () => {
    decode.mockRejectedValue(new ChangeLinkError('NOT_FOUND', 'not found'));
    const { result } = setupReview();
    await act(async () => {
      await result.current.openReview('hello');
    });
    expect(result.current.error).toBe('No change link found. A change link contains "lc1.".');
  });

  it('names the source locale when it cannot be loaded', async () => {
    const { result } = setupReview({ readLocale: async () => Promise.reject(new Error('404')) });
    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current.openReview('lc1.abc');
    });
    expect(opened).toBe(false);
    expect(result.current.error).toBe('The source locale "en" could not be loaded.');
  });

  it('overlays proposed values for the current locale only', async () => {
    const { result, sendToIframe } = setupReview();
    await act(async () => {
      await result.current.openReview('lc1.abc');
    });
    expect(previews(sendToIframe)).toEqual([{ key: 'home.title', value: 'أهلا' }]);
  });

  it('re-applies the overlay after navigation', async () => {
    const { result, rerender, initialProps, sendToIframe } = setupReview();
    await act(async () => {
      await result.current.openReview('lc1.abc');
    });
    sendToIframe.mockClear();
    rerender({ ...initialProps, currentPath: '/about' });
    expect(previews(sendToIframe)).toEqual([{ key: 'home.title', value: 'أهلا' }]);
  });

  it('closing clears the hash and reloads the frame', async () => {
    history.replaceState(null, '', '/livelocale/index.html#lc1.abc');
    const { result, reloadFrame } = setupReview();
    await waitFor(() => expect(result.current.review).not.toBeNull());
    const replaceState = vi.spyOn(history, 'replaceState');
    act(() => result.current.closeReview());
    expect(replaceState).toHaveBeenCalledWith(null, '', '/livelocale/index.html');
    expect(location.hash).toBe('');
    expect(reloadFrame).toHaveBeenCalledTimes(1);
    expect(result.current.review).toBeNull();
    expect(result.current.error).toBeNull();
    replaceState.mockRestore();
  });

  it('reopens when the hash changes to another link', async () => {
    history.replaceState(null, '', '/livelocale/index.html#lc1.abc');
    const { result } = setupReview();
    await waitFor(() => expect(result.current.review?.token).toBe('lc1.abc'));
    history.replaceState(null, '', '/livelocale/index.html#lc1.def');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(result.current.review?.token).toBe('lc1.def'));
    expect(decode).toHaveBeenLastCalledWith('lc1.def');
    // The same token does not open twice.
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(decode).toHaveBeenCalledTimes(2);
  });
});

describe('useReview local apply', () => {
  const LOCAL_SET: ChangeSet = {
    branch: '',
    base: '',
    src: 'en',
    by: '',
    note: '',
    edits: [
      { locale: 'ar', key: 'home.title', from: 'مرحبا', to: 'أهلا', force: false },
      { locale: 'fr', key: 'home.greet', from: 'Bonjour {name}', to: 'Bonjour', force: true },
      { locale: 'fr', key: 'home.title', from: 'Autre', to: 'Salut', force: false },
      { locale: 'ar', key: 'home.greet', from: 'أهلا {name}', to: 'هلا {name}', force: false },
    ],
  };
  const FORCED_REASON = 'Saved with “Save anyway”; tick the box to include it.';
  const id = (locale: string, key: string) => `${locale} ${key}`;

  const answer = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  const postBodies = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init!.body)));

  beforeEach(() => {
    decode.mockResolvedValue(LOCAL_SET);
  });

  it('applies ready rows locally and skips the rest', async () => {
    vi.mocked(fetch).mockResolvedValue(answer(200, { success: true }) as unknown as Response);
    const onApplied = vi.fn();
    const { result, readBuiltLocale } = setupReview({ mode: 'development', onApplied });
    await act(async () => {
      await result.current.openReview('lc1.abc');
    });
    expect(result.current.review!.target).toBe('local');
    const readsBefore = readBuiltLocale.mock.calls.length;

    await act(async () => {
      await result.current.applyLocal({ includeForced: false });
    });
    expect(postBodies()).toEqual([
      { locale: 'ar', key: 'home.title', value: 'أهلا', reference: 'Welcome' },
      { locale: 'ar', key: 'home.greet', value: 'هلا {name}', reference: 'Hello {name}' },
    ]);
    expect(result.current.applyResults).toEqual({
      [id('ar', 'home.title')]: { state: 'applied' },
      [id('fr', 'home.greet')]: { state: 'skipped', reason: FORCED_REASON },
      [id('fr', 'home.title')]: { state: 'skipped', reason: 'Changed since' },
      [id('ar', 'home.greet')]: { state: 'applied' },
    });
    expect(onApplied.mock.calls).toEqual([
      [{ locale: 'ar', key: 'home.title', previousValue: 'مرحبا', nextValue: 'أهلا' }],
      [{ locale: 'ar', key: 'home.greet', previousValue: 'أهلا {name}', nextValue: 'هلا {name}' }],
    ]);
    // The current values are read again and the rows rebuilt.
    expect(readBuiltLocale.mock.calls.length).toBeGreaterThan(readsBefore);
    expect(result.current.isApplying).toBe(false);

    vi.mocked(fetch).mockClear();
    await act(async () => {
      await result.current.applyLocal({ includeForced: true });
    });
    expect(postBodies()).toContainEqual({
      locale: 'fr',
      key: 'home.greet',
      value: 'Bonjour',
      reference: 'Hello {name}',
      force: true,
    });
    expect(result.current.applyResults[id('fr', 'home.greet')]).toEqual({ state: 'applied' });
  });

  it('records a failed save without stopping the batch', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        answer(422, {
          error: 'Keep {name} in the text.',
          code: 'PLACEHOLDER_MISMATCH',
        }) as unknown as Response
      )
      .mockResolvedValue(answer(200, { success: true }) as unknown as Response);
    const { result } = setupReview({ mode: 'development' });
    await act(async () => {
      await result.current.openReview('lc1.abc');
    });
    await act(async () => {
      await result.current.applyLocal({ includeForced: false });
    });
    expect(postBodies()).toHaveLength(2);
    expect(result.current.applyResults[id('ar', 'home.title')]).toEqual({
      state: 'failed',
      message: 'Keep {name} in the text.',
    });
    expect(result.current.applyResults[id('ar', 'home.greet')]).toEqual({ state: 'applied' });
  });
});

describe('useStudio in Review mode', () => {
  const draft: Draft = {
    scope: 'path:/',
    locale: 'ar',
    key: 'home.title',
    from: 'مرحبا',
    to: 'مسودة',
    force: false,
    base: SHA_A,
    branch: 'main',
    status: 'unsent',
    conflict: false,
    updatedAt: 1,
    sentAt: null,
  };

  const setupStudio = () => {
    const sendToIframe = vi.fn();
    conn.sendToIframe = sendToIframe;
    conn.state.currentPath = '/';
    conn.state.visibleKeys = null;
    const transport = {
      manifest: MANIFEST,
      scope: 'path:/',
      persistent: true,
      events: new EventTarget(),
      fetchInfo: vi.fn(async () => ({ mode: 'static', authRequired: false, git: false })),
      fetchLocales: vi.fn(async () => ['ar', 'en']),
      fetchKeysMetadata: vi.fn(async () => ({ allKeys: [], codeKeys: [] })),
      fetchLocaleDictionary: vi.fn(async (l: string) => BUILT[l] ?? {}),
      fetchGitState: vi.fn(async () => ({
        available: false,
        isRepo: false,
        branch: null,
        changes: [],
        diff: '',
        mode: 'static',
      })),
      readBuiltLocale: vi.fn(async (l: string) => BUILT[l] ?? {}),
      textCandidates: vi.fn(async () => ({})),
      listDrafts: vi.fn(async () => [draft]),
      initialReconcile: { live: [], conflicts: [] },
      refreshManifest: vi.fn(async () => null),
    };
    setStudioTransport(transport as unknown as StaticTransport);
    setStudioRuntime({
      kind: 'static',
      appOrigin: 'https://www.acme.com',
      appUrl: 'https://www.acme.com/',
      manifest: MANIFEST,
      manifestText: JSON.stringify(MANIFEST),
      transport: transport as unknown as StaticTransport,
    });
    const hook = renderHook(() => useStudio());
    const handlers = () => conn.handlers as ConnectionHandlers;
    return { ...hook, sendToIframe, transport, handlers };
  };

  it('asks which language to edit before opening a key from the list on a share link', async () => {
    const { result } = setupStudio();
    await waitFor(() => expect(result.current.mode).toBe('static'));
    await waitFor(() => expect(result.current.locales).toEqual(['ar', 'en']));
    expect(result.current.targetLocale?.source).toBeNull();

    act(() => result.current.selectKeyDirectly('home.title'));
    expect(result.current.selected).toBeNull();
    expect(result.current.localePickerCandidates).toEqual(['ar', 'en']);

    act(() => result.current.chooseTargetLocale('ar'));
    await waitFor(() => expect(result.current.selected?.key).toBe('home.title'));
    expect(result.current.locale).toBe('ar');
    expect(result.current.selected?.currentValue).toBe('مرحبا');
    expect(result.current.targetLocale?.source).toBe('manual');

    // Once the language is chosen, a later pick from the list opens straight away.
    act(() => result.current.handleClearSelection());
    act(() => result.current.selectKeyDirectly('home.greet'));
    await waitFor(() => expect(result.current.selected?.key).toBe('home.greet'));
    expect(result.current.localePickerCandidates).toBeNull();
  });

  it('focuses a row instead of editing on Alt+Click', async () => {
    const { result, handlers, transport } = setupStudio();
    await waitFor(() => expect(result.current.mode).toBe('static'));
    await act(async () => {
      await result.current.openReview('lc1.abc');
    });
    expect(result.current.review).not.toBeNull();
    act(() => {
      handlers().onElementSelected({
        key: 'home.title',
        fallbackValue: 'مرحبا',
        currentValue: 'مرحبا',
      });
    });
    expect(result.current.reviewFocusKey).toBe('home.title');
    await act(async () => {});
    expect(transport.textCandidates).not.toHaveBeenCalled();
    expect(result.current.selected).toBeNull();
  });

  it('pauses the draft re-apply loop while reviewing', async () => {
    const { result, rerender, handlers, sendToIframe } = setupStudio();
    await waitFor(() => expect(result.current.mode).toBe('static'));
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));
    act(() => handlers().onLocaleDetected('ar'));
    await waitFor(() =>
      expect(previews(sendToIframe)).toContainEqual({ key: 'home.title', value: 'مسودة' })
    );

    await act(async () => {
      await result.current.openReview('lc1.abc');
    });
    sendToIframe.mockClear();
    conn.state.currentPath = '/about';
    rerender();
    expect(previews(sendToIframe)).toEqual([{ key: 'home.title', value: 'أهلا' }]);
  });
});
