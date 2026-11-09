// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup, render, screen } from '@testing-library/react';
import { useConnection } from '../../src/studio/features/dashboard/hooks/useConnection.js';
import {
  useKeyJump,
  type KeyJumpParams,
} from '../../src/studio/features/dashboard/hooks/useKeyJump.js';
import { KeyJumpNote } from '../../src/studio/features/dashboard/components/KeyJumpNote.jsx';
import { editorSheetCover } from '../../src/studio/features/dashboard/components/PhoneShell.jsx';

// jsdom's default location is http://localhost:3000, which is also the default
// APP_ORIGIN, so postMessage origin checks line up without extra configuration.
const APP_ORIGIN = 'http://localhost:3000';

const fromClient = (type: string, payload?: unknown) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: 'livelocale-client', type, payload },
        origin: APP_ORIGIN,
      })
    );
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useConnection key jump', () => {
  const renderConnection = () => {
    const postMessage = vi.fn();
    const hook = renderHook(() =>
      useConnection({ onElementSelected: vi.fn(), onLocaleDetected: vi.fn(), onError: vi.fn() })
    );
    hook.result.current.iframeRef.current = {
      contentWindow: { postMessage },
    } as unknown as HTMLIFrameElement;
    return { ...hook, postMessage };
  };

  it('knows the page can jump only when READY lists key-jump, page by page', () => {
    const { result } = renderConnection();
    expect(result.current.supportsKeyJump).toBe(false);
    fromClient('READY', { url: '/', features: ['edit-mode', 'key-jump'] });
    expect(result.current.supportsKeyJump).toBe(true);
    // An older client on the next page: no jump requests it would ignore.
    fromClient('READY', { url: '/old', features: ['edit-mode'] });
    expect(result.current.supportsKeyJump).toBe(false);
  });

  it('sends JUMP_TO_KEY with the bottom inset', () => {
    const { result, postMessage } = renderConnection();
    act(() => result.current.jumpToKeyInPage('home.title', 300));
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'livelocale-studio',
        type: 'JUMP_TO_KEY',
        payload: { key: 'home.title', bottomInset: 300 },
      },
      APP_ORIGIN
    );
  });

  it('keeps each well-formed KEY_JUMPED answer as a new value', () => {
    const { result } = renderConnection();
    expect(result.current.keyJumpAnswer).toBeNull();
    fromClient('KEY_JUMPED', { key: 'home.title', result: 'absent' });
    const first = result.current.keyJumpAnswer;
    expect(first).toMatchObject({ key: 'home.title', result: 'absent' });
    fromClient('KEY_JUMPED', { key: 'home.title', result: 'absent' });
    expect(result.current.keyJumpAnswer).not.toBe(first);
    fromClient('KEY_JUMPED', { key: 'home.title', result: 'nope' });
    fromClient('KEY_JUMPED', { key: 7, result: 'shown' });
    fromClient('KEY_JUMPED', null);
    expect(result.current.keyJumpAnswer).toMatchObject({ key: 'home.title', result: 'absent' });
  });
});

describe('useKeyJump', () => {
  const base = (): KeyJumpParams => ({
    supported: true,
    selectedKey: null,
    selectionCount: 0,
    pageSeq: 1,
    answer: null,
    jump: vi.fn(),
  });

  const renderJump = (initial: KeyJumpParams = base()) =>
    renderHook((props: KeyJumpParams) => useKeyJump(props), { initialProps: initial });

  it('jumps once the requested key is the selection, not before', () => {
    const params = base();
    const { result, rerender } = renderJump(params);

    act(() => result.current.request('home.title'));
    expect(params.jump).not.toHaveBeenCalled();

    rerender({ ...params, selectedKey: 'home.title', selectionCount: 1 });
    expect(params.jump).toHaveBeenCalledTimes(1);
    expect(params.jump).toHaveBeenCalledWith('home.title');

    // Re-renders and other picks (an Alt+Click) never jump again.
    rerender({ ...params, selectedKey: 'home.title', selectionCount: 1 });
    rerender({ ...params, selectedKey: 'home.cta', selectionCount: 2 });
    expect(params.jump).toHaveBeenCalledTimes(1);
  });

  it('waits through a language pick or an unsaved-changes prompt', () => {
    const params = base();
    const { result, rerender } = renderJump({ ...params, selectedKey: 'a.b', selectionCount: 1 });

    // The pick is held: the selection has not changed yet.
    act(() => result.current.request('home.title'));
    rerender({ ...params, selectedKey: 'a.b', selectionCount: 1 });
    expect(params.jump).not.toHaveBeenCalled();

    // The language is chosen (or the draft discarded): the pick completes.
    rerender({ ...params, selectedKey: 'home.title', selectionCount: 2 });
    expect(params.jump).toHaveBeenCalledWith('home.title');
  });

  it('drops a request when a different selection lands first', () => {
    const params = base();
    const { result, rerender } = renderJump(params);
    act(() => result.current.request('home.title'));
    // The person kept editing and Alt+Clicked other text instead.
    rerender({ ...params, selectedKey: 'home.cta', selectionCount: 1 });
    rerender({ ...params, selectedKey: 'home.title', selectionCount: 2 });
    expect(params.jump).not.toHaveBeenCalled();
  });

  it('drops a request whose pick was cancelled, so a later tap on that key does not jump', () => {
    const params = base();
    const { result, rerender } = renderJump({ ...params, selectedKey: 'a.b', selectionCount: 1 });
    act(() => result.current.request('home.title'));
    // The unsaved-changes prompt or the language picker is cancelled: no selection lands.
    act(() => result.current.cancel());
    // Later the person taps or Alt+Clicks that same key on the page.
    rerender({ ...params, selectedKey: 'home.title', selectionCount: 2 });
    expect(params.jump).not.toHaveBeenCalled();
  });

  it('asks nothing of a page whose client cannot jump, and shows no note', () => {
    const params = { ...base(), supported: false };
    const { result, rerender } = renderJump(params);
    act(() => result.current.request('home.title'));
    rerender({ ...params, selectedKey: 'home.title', selectionCount: 1 });
    expect(params.jump).not.toHaveBeenCalled();
    expect(result.current.note).toBeNull();
  });

  it('notes a key the page does not show, for that selection only', () => {
    const params = base();
    const { result, rerender } = renderJump(params);
    act(() => result.current.request('home.menu'));
    const picked = { ...params, selectedKey: 'home.menu', selectionCount: 1 };
    rerender(picked);
    expect(result.current.note).toBeNull();

    rerender({ ...picked, answer: { key: 'home.menu', result: 'hidden', seq: 1 } });
    expect(result.current.note).toBe('hidden');

    // A new pick clears it.
    rerender({
      ...picked,
      selectedKey: 'home.title',
      selectionCount: 2,
      answer: { key: 'home.menu', result: 'hidden', seq: 1 },
    });
    expect(result.current.note).toBeNull();
  });

  it('shows nothing when the page showed the text, or for an answer nobody asked for', () => {
    const params = base();
    const { result, rerender } = renderJump(params);
    act(() => result.current.request('home.title'));
    const picked = { ...params, selectedKey: 'home.title', selectionCount: 1 };
    rerender({ ...picked, answer: { key: 'home.title', result: 'shown', seq: 1 } });
    expect(result.current.note).toBeNull();
    // A stray answer for the same key later on does not bring a note back.
    rerender({ ...picked, answer: { key: 'home.title', result: 'absent', seq: 2 } });
    expect(result.current.note).toBeNull();
  });

  it('forgets the note on a new page', () => {
    const params = base();
    const { result, rerender } = renderJump(params);
    act(() => result.current.request('home.title'));
    const picked = { ...params, selectedKey: 'home.title', selectionCount: 1 };
    rerender({ ...picked, answer: { key: 'home.title', result: 'absent', seq: 1 } });
    expect(result.current.note).toBe('absent');
    rerender({ ...picked, pageSeq: 2, answer: { key: 'home.title', result: 'absent', seq: 1 } });
    expect(result.current.note).toBeNull();
  });
});

describe('KeyJumpNote', () => {
  it('says the text is not on this page, or hidden on it, in a polite live region', () => {
    const { rerender } = render(<KeyJumpNote note="absent" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('This text is not on this page. You can still edit it here.');

    rerender(<KeyJumpNote note="hidden" />);
    expect(screen.getByRole('status').textContent).toMatch(/hidden/);

    // The live region stays mounted and empty, so the next note is announced.
    rerender(<KeyJumpNote note={null} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

describe('editorSheetCover', () => {
  it('is how much of the frame the editor sheet can cover at its tallest', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const frame = { getBoundingClientRect: () => ({ bottom: 760 }) } as HTMLElement;
    // The sheet may take 60% of 800 px: its top can be as high as 320.
    expect(editorSheetCover(frame)).toBe(440);
    expect(editorSheetCover(null)).toBe(480);
  });
});
