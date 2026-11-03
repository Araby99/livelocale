// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePageNavigation,
  NAVIGATION_TIMEOUT_MS,
} from '../../src/studio/features/dashboard/hooks/usePageNavigation.js';
import { resetStudioRuntime, setStudioRuntime } from '../../src/studio/runtime.js';
import type { StaticTransport } from '../../src/studio/transport/static.js';
import { MANIFEST } from './helpers/share-fixtures.js';

// jsdom's location is http://localhost:3000, the default server-runtime app origin.
const STUDIO_ORIGIN = 'http://localhost:3000';

interface Input {
  currentPath: string;
  locationKnown: boolean;
  locationSeq: number;
  locale: string;
}

function setup(initial: Partial<Input> = {}) {
  const iframe = document.createElement('iframe');
  iframe.src = 'http://localhost:3000/?livelocale-origin=' + encodeURIComponent(STUDIO_ORIGIN);
  document.body.appendChild(iframe);
  const iframeRef = { current: iframe };
  const sendToIframe = vi.fn();
  const props: Input = {
    currentPath: '/',
    locationKnown: true,
    locationSeq: 0,
    locale: 'en',
    ...initial,
  };
  const hook = renderHook((p: Input) => usePageNavigation({ ...p, iframeRef, sendToIframe }), {
    initialProps: props,
  });
  return { ...hook, iframe, sendToIframe, props };
}

function useStaticRuntime(locales: string[] = MANIFEST.locales) {
  setStudioRuntime({
    kind: 'static',
    appOrigin: 'http://localhost:3020',
    appUrl: 'http://localhost:3020/livelocale-demo/',
    manifest: { ...MANIFEST, basePath: '/livelocale-demo/', locales, pages: ['/', '/about/'] },
    manifestText: '',
    transport: {} as StaticTransport,
  });
}

afterEach(() => {
  resetStudioRuntime();
  localStorage.clear();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('usePageNavigation', () => {
  it('sends NAVIGATE while the client is known', () => {
    const { result, sendToIframe } = setup();
    let outcome: string | undefined;
    act(() => {
      outcome = result.current.onNavigate('/pricing');
    });
    expect(outcome).toBe('ok');
    expect(sendToIframe).toHaveBeenCalledWith('NAVIGATE', { url: 'http://localhost:3000/pricing' });
    expect(result.current.pendingPath).toBe('/pricing');
    expect(result.current.isNavigating).toBe(true);
  });

  it("keeps the preview's language", () => {
    const { result, sendToIframe } = setup({ currentPath: '/?locale=ar', locale: 'ar' });
    expect(result.current.path).toBe('/');
    act(() => {
      result.current.onNavigate('/pricing');
    });
    expect(sendToIframe).toHaveBeenCalledWith('NAVIGATE', {
      url: 'http://localhost:3000/pricing?locale=ar',
    });
  });

  it('falls back to the iframe src once the client has left', () => {
    const { result, sendToIframe, iframe } = setup({ locationKnown: false });
    act(() => {
      expect(result.current.onNavigate('/pricing')).toBe('ok');
    });
    expect(sendToIframe).not.toHaveBeenCalled();
    expect(iframe.src).toBe(
      'http://localhost:3000/pricing?livelocale-origin=' + encodeURIComponent(location.origin)
    );
  });

  it('refuses another origin', () => {
    const { result, sendToIframe, iframe } = setup();
    const before = iframe.src;
    act(() => {
      expect(result.current.onNavigate('//evil.example/')).toBe('refused');
    });
    expect(sendToIframe).not.toHaveBeenCalled();
    expect(iframe.src).toBe(before);
    expect(result.current.pendingPath).toBeNull();
  });

  it('shows share paths relative to the base and lists site pages', () => {
    useStaticRuntime();
    const { result, sendToIframe } = setup({ currentPath: '/livelocale-demo/about/' });
    expect(result.current.path).toBe('/about/');
    expect(result.current.sitePages).toEqual(['/', '/about/']);
    act(() => {
      expect(result.current.onNavigate('/')).toBe('ok');
    });
    expect(sendToIframe).toHaveBeenCalledWith('NAVIGATE', {
      url: 'http://localhost:3020/livelocale-demo/',
    });
    act(() => {
      expect(result.current.onNavigate('/livelocale/')).toBe('refused');
    });
    expect(sendToIframe).toHaveBeenCalledTimes(1);
  });

  it('reload reopens the current page', () => {
    const { result, sendToIframe, iframe, rerender, props } = setup({ currentPath: '/b?x=1' });
    act(() => {
      result.current.reload();
    });
    expect(sendToIframe).toHaveBeenCalledWith('NAVIGATE', { url: 'http://localhost:3000/b?x=1' });
    expect(result.current.pendingPath).toBe('/b?x=1');

    sendToIframe.mockClear();
    rerender({ ...props, currentPath: '/b?x=1', locationKnown: false });
    const src = iframe.src;
    const assign = vi.fn();
    Object.defineProperty(iframe, 'src', {
      configurable: true,
      get: () => src,
      set: assign,
    });
    act(() => {
      result.current.reload();
    });
    expect(assign).toHaveBeenCalledWith(src);
    expect(sendToIframe).not.toHaveBeenCalled();
  });

  it('switching the language keeps the current page', () => {
    const { result, sendToIframe } = setup({ currentPath: '/pricing' });
    act(() => {
      result.current.showLocale('ar');
    });
    expect(sendToIframe).toHaveBeenCalledWith('NAVIGATE', {
      url: 'http://localhost:3000/pricing?locale=ar',
    });
    // The field never shows the ?locale= the Studio is switching to.
    expect(result.current.pendingPath).toBe('/pricing');
  });

  it('switching the language keeps the current share page', () => {
    useStaticRuntime(['ar', 'en']);
    const { result, sendToIframe } = setup({ currentPath: '/livelocale-demo/en/about/' });
    act(() => {
      result.current.showLocale('ar');
    });
    expect(sendToIframe).toHaveBeenCalledWith('NAVIGATE', {
      url: 'http://localhost:3020/livelocale-demo/ar/about/',
    });
    expect(result.current.pendingPath).toBe('/ar/about/');
  });

  it('clears pending on the next location', () => {
    const { result, rerender, props } = setup();
    act(() => {
      result.current.onNavigate('/pricing');
    });
    expect(result.current.pendingPath).toBe('/pricing');
    rerender({ ...props, currentPath: '/pricing', locationSeq: props.locationSeq + 1 });
    expect(result.current.pendingPath).toBeNull();
    expect(result.current.isNavigating).toBe(false);
  });

  it('clears pending after the timeout', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => {
      result.current.onNavigate('/pricing');
    });
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_TIMEOUT_MS - 1);
    });
    expect(result.current.pendingPath).toBe('/pricing');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.pendingPath).toBeNull();
  });

  it('remembers each reported page', () => {
    const { result, rerender, props } = setup();
    expect(result.current.recent).toEqual([]);
    rerender({ ...props, currentPath: '/a', locationSeq: 1 });
    rerender({ ...props, currentPath: '/b', locationSeq: 2 });
    expect(result.current.recent).toEqual(['/b', '/a']);
    rerender({ ...props, currentPath: '/c', locationSeq: 3, locationKnown: false });
    expect(result.current.recent).toEqual(['/b', '/a']);
  });
});
