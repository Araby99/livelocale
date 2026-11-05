// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useConnection } from '../../src/studio/features/dashboard/hooks/useConnection.js';
import { useEditMode } from '../../src/studio/features/dashboard/hooks/useEditMode.js';
import { useTouchDevice } from '../../src/studio/features/dashboard/hooks/useTouchDevice.js';
import { fakeMatchMedia } from './helpers/match-media.js';

// jsdom's default location is http://localhost:3000, which is also the default
// APP_ORIGIN, so postMessage origin checks line up without extra configuration.
const APP_ORIGIN = 'http://localhost:3000';

const post = (data: unknown) => {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: APP_ORIGIN }));
  });
};

const fromClient = (type: string, payload?: unknown) =>
  post({ source: 'livelocale-client', type, payload });

/** useConnection and useEditMode composed the way useStudio composes them. */
const renderStudioBridge = (isTouch: boolean) => {
  const postMessage = vi.fn();
  const hook = renderHook(() => {
    const connection = useConnection({
      onElementSelected: vi.fn(),
      onLocaleDetected: vi.fn(),
      onError: vi.fn(),
    });
    const edit = useEditMode({
      active: isTouch && connection.supportsEditMode,
      readySeq: connection.readySeq,
      setSiteEditMode: connection.setSiteEditMode,
    });
    return { ...connection, ...edit };
  });
  hook.result.current.iframeRef.current = {
    contentWindow: { postMessage },
  } as unknown as HTMLIFrameElement;
  const sent = (type: string) =>
    postMessage.mock.calls
      .map(([message]) => message as { source: string; type: string; payload?: unknown })
      .filter((message) => message.type === type);
  return { ...hook, postMessage, sent };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Studio edit mode over the bridge', () => {
  it('READY with edit-mode feature sets supportsEditMode', () => {
    const { result, sent } = renderStudioBridge(true);
    expect(result.current.supportsEditMode).toBe(false);
    expect(result.current.editMode).toBe(true);

    fromClient('READY', { url: '/', features: ['edit-mode'] });
    expect(result.current.supportsEditMode).toBe(true);
    expect(sent('SET_EDIT_MODE').map((m) => m.payload)).toEqual([{ on: true }]);
    expect(sent('SET_EDIT_MODE')[0]?.source).toBe('livelocale-studio');
  });

  it('READY without features keeps supportsEditMode false and sends no SET_EDIT_MODE', () => {
    const { result, sent } = renderStudioBridge(true);
    fromClient('READY', { url: '/' });
    expect(result.current.supportsEditMode).toBe(false);
    fromClient('READY', { url: '/', features: ['something-else'] });
    expect(result.current.supportsEditMode).toBe(false);
    expect(sent('SET_EDIT_MODE')).toEqual([]);

    // A later page whose client lost the feature hides the switch again.
    fromClient('READY', { url: '/', features: ['edit-mode'] });
    expect(result.current.supportsEditMode).toBe(true);
    fromClient('READY', { url: '/old' });
    expect(result.current.supportsEditMode).toBe(false);
  });

  it('sends no SET_EDIT_MODE on a device without touch', () => {
    const { sent } = renderStudioBridge(false);
    fromClient('READY', { url: '/', features: ['edit-mode'] });
    expect(sent('SET_EDIT_MODE')).toEqual([]);
  });

  it('every READY re-sends the current mode', () => {
    const { result, sent } = renderStudioBridge(true);
    fromClient('READY', { url: '/', features: ['edit-mode'] });

    act(() => result.current.setEditMode(false));
    expect(result.current.editMode).toBe(false);
    expect(sent('SET_EDIT_MODE').map((m) => m.payload)).toEqual([{ on: true }, { on: false }]);

    // Browsing to another page brings a new client that starts with Edit off.
    fromClient('READY', { url: '/about', features: ['edit-mode'] });
    expect(sent('SET_EDIT_MODE').map((m) => m.payload)).toEqual([
      { on: true },
      { on: false },
      { on: false },
    ]);
    expect(result.current.editMode).toBe(false);
  });

  it('TAP_UNKEYED bumps unkeyedTapSeq', () => {
    const { result } = renderStudioBridge(true);
    expect(result.current.unkeyedTapSeq).toBe(0);
    fromClient('TAP_UNKEYED');
    fromClient('TAP_UNKEYED');
    expect(result.current.unkeyedTapSeq).toBe(2);
  });

  it('keeps the rendered keys the client reports and forgets them on a new page', () => {
    const { result } = renderStudioBridge(true);
    expect(result.current.renderedKeys).toBeNull();
    fromClient('READY', { url: '/', features: ['edit-mode'] });
    fromClient('RENDERED_KEYS_CHANGED', ['hero.title', 42, 'hero.cta']);
    expect(result.current.renderedKeys).toEqual(['hero.title', 'hero.cta']);
    fromClient('RENDERED_KEYS_CHANGED', { 0: 'x' });
    expect(result.current.renderedKeys).toEqual(['hero.title', 'hero.cta']);
    fromClient('READY', { url: '/about', features: ['edit-mode'] });
    expect(result.current.renderedKeys).toBeNull();
  });

  it('asks the page to select or reveal a key', () => {
    const { result, sent } = renderStudioBridge(true);
    act(() => result.current.selectKeyInPage('hero.cta'));
    act(() => result.current.revealKeyInPage('hero.cta', 320));
    expect(sent('SELECT_KEY').map((m) => m.payload)).toEqual([{ key: 'hero.cta' }]);
    expect(sent('REVEAL_KEY').map((m) => m.payload)).toEqual([
      { key: 'hero.cta', bottomInset: 320 },
    ]);
  });
});

describe('useTouchDevice', () => {
  const stubScreen = (width: number, height: number) => vi.stubGlobal('screen', { width, height });

  it('coarse + 390x844 screen → phone; coarse + 1024x1366 → touch only; fine pointer → neither', () => {
    fakeMatchMedia(true);
    stubScreen(390, 844);
    expect(renderHook(() => useTouchDevice()).result.current).toEqual({
      isTouch: true,
      isPhone: true,
    });
    // Landscape keeps the phone layout: the short side decides.
    stubScreen(844, 390);
    expect(renderHook(() => useTouchDevice()).result.current).toEqual({
      isTouch: true,
      isPhone: true,
    });

    stubScreen(1024, 1366);
    expect(renderHook(() => useTouchDevice()).result.current).toEqual({
      isTouch: true,
      isPhone: false,
    });

    fakeMatchMedia(false);
    stubScreen(390, 844);
    expect(renderHook(() => useTouchDevice()).result.current).toEqual({
      isTouch: false,
      isPhone: false,
    });
  });

  it('asks for a coarse pointer', () => {
    fakeMatchMedia(true);
    renderHook(() => useTouchDevice());
    expect(window.matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('reports neither when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    stubScreen(390, 844);
    expect(renderHook(() => useTouchDevice()).result.current).toEqual({
      isTouch: false,
      isPhone: false,
    });
  });
});
