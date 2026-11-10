// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSelection } from '../../src/studio/features/dashboard/hooks/useSelection.js';
import { useUnsentGuard } from '../../src/studio/features/dashboard/hooks/useUnsentGuard.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const makeParams = () => ({
  localeData: { 'home.title': 'Welcome' },
  enLocaleData: { 'home.title': 'Welcome' },
  sendToIframe: vi.fn(),
  locale: 'en',
  refreshKeysMetadata: vi.fn().mockResolvedValue(undefined),
  updateLocaleDataCache: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
});

const dirty = () => {
  const params = makeParams();
  const hook = renderHook(() => useSelection(params));
  act(() =>
    hook.result.current.selectElement({
      key: 'home.title',
      fallbackValue: 'Welcome',
      currentValue: 'Welcome',
    })
  );
  act(() => hook.result.current.handleInputChange('Welcome KB'));
  return { ...hook, params };
};

describe('guardUnsaved (switching language with typed text)', () => {
  it('runs the action at once when nothing is typed', () => {
    const { result } = renderHook(() => useSelection(makeParams()));
    const action = vi.fn();
    act(() => result.current.guardUnsaved(action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmModal).toBe(false);
  });

  it('asks first while the field holds unsaved text, and Keep editing keeps it', () => {
    const { result } = dirty();
    const action = vi.fn();
    act(() => result.current.guardUnsaved(action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.showConfirmModal).toBe(true);

    act(() => result.current.cancelDiscard());
    expect(action).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe('Welcome KB');
    expect(result.current.selected?.key).toBe('home.title');
  });

  it('Discard drops the typed text, keeps the selection and then runs the action', () => {
    const { result } = dirty();
    const action = vi.fn();
    act(() => result.current.guardUnsaved(action));
    act(() => result.current.confirmDiscard());
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.showConfirmModal).toBe(false);
    expect(result.current.selected?.key).toBe('home.title');
    expect(result.current.inputValue).toBe('Welcome');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('a later key pick after a discarded switch is not mistaken for the switch', () => {
    const { result } = dirty();
    const action = vi.fn();
    act(() => result.current.guardUnsaved(action));
    act(() => result.current.cancelDiscard());
    act(() =>
      result.current.selectElement({ key: 'nav.about', fallbackValue: 'About', currentValue: '' })
    );
    act(() => result.current.confirmDiscard());
    expect(action).not.toHaveBeenCalled();
    expect(result.current.selected?.key).toBe('nav.about');
  });
});

describe('useUnsentGuard (reload with typed text)', () => {
  it('asks before the tab reloads only while active', () => {
    const { rerender } = renderHook(({ on }) => useUnsentGuard(on), {
      initialProps: { on: false },
    });
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);

    rerender({ on: true });
    const asked = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(asked);
    expect(asked.defaultPrevented).toBe(true);
  });
});
