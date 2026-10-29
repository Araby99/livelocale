// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { useDrafts, unsentLabel } from '../../src/studio/features/dashboard/hooks/useDrafts.js';
import { useUnsentGuard } from '../../src/studio/features/dashboard/hooks/useUnsentGuard.js';
import { Header } from '../../src/studio/features/dashboard/components/Header.jsx';
import { DRAFTS_CHANGED_EVENT, type StaticTransport } from '../../src/studio/transport/static.js';
import type { Draft } from '../../src/studio/transport/drafts.js';

const draft = (overrides: Partial<Draft> = {}): Draft => ({
  scope: 'acme/site',
  locale: 'ar',
  key: 'home.title',
  from: 'مرحبا',
  to: 'أهلا',
  force: false,
  base: null,
  branch: null,
  status: 'unsent',
  conflict: false,
  updatedAt: 1,
  sentAt: null,
  ...overrides,
});

const fakeTransport = (drafts: Draft[], live: Draft[] = []) => {
  const fake = {
    events: new EventTarget(),
    initialReconcile: { live, conflicts: [] as Draft[] },
    listDrafts: vi.fn(async () => drafts),
    discardDraft: vi.fn(async () => undefined),
    markDraftsSent: vi.fn(async () => {}),
  };
  return { fake, transport: fake as unknown as StaticTransport };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useDrafts', () => {
  it('returns nothing and calls nothing without a transport', async () => {
    const { fake } = fakeTransport([draft()]);
    const { result } = renderHook(() => useDrafts(null));
    await act(async () => {});
    expect(result.current.drafts).toEqual([]);
    expect(result.current.unsentCount).toBe(0);
    expect(result.current.sentCount).toBe(0);
    expect(fake.listDrafts).not.toHaveBeenCalled();
    expect(fake.discardDraft).not.toHaveBeenCalled();
    expect(fake.markDraftsSent).not.toHaveBeenCalled();
  });

  it('loads drafts and counts unsent and sent', async () => {
    const { transport } = fakeTransport([
      draft({ key: 'a' }),
      draft({ key: 'b' }),
      draft({ key: 'c', status: 'sent', sentAt: 2 }),
    ]);
    const { result } = renderHook(() => useDrafts(transport));
    await waitFor(() => expect(result.current.drafts).toHaveLength(3));
    expect(result.current.unsentCount).toBe(2);
    expect(result.current.sentCount).toBe(1);
  });

  it('reloads when the transport announces a change', async () => {
    const { fake, transport } = fakeTransport([draft()]);
    renderHook(() => useDrafts(transport));
    await waitFor(() => expect(fake.listDrafts).toHaveBeenCalledTimes(1));
    act(() => {
      fake.events.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT));
    });
    await waitFor(() => expect(fake.listDrafts).toHaveBeenCalledTimes(2));
  });

  it('marks drafts sent by id', async () => {
    const { fake, transport } = fakeTransport([]);
    const { result } = renderHook(() => useDrafts(transport));
    await act(async () => {
      await result.current.markSent([draft()]);
    });
    expect(fake.markDraftsSent).toHaveBeenCalledWith([{ locale: 'ar', key: 'home.title' }]);
  });

  it('surfaces start-up live drafts and lets the translator dismiss them', async () => {
    const live = draft({ key: 'home.live' });
    const { transport } = fakeTransport([], [live]);
    const { result } = renderHook(() => useDrafts(transport));
    await act(async () => {});
    expect(result.current.liveNow).toEqual([live]);
    act(() => result.current.dismissLiveNow());
    expect(result.current.liveNow).toEqual([]);
  });

  it('adds live drafts from a later reconcile', async () => {
    const first = draft({ key: 'home.a' });
    const later = draft({ key: 'home.b' });
    const { transport } = fakeTransport([], [first]);
    const { result } = renderHook(() => useDrafts(transport));
    await act(async () => {});
    act(() => result.current.noteReconcile({ live: [later], conflicts: [] }));
    expect(result.current.liveNow).toEqual([first, later]);
  });

  it('labels the counter', () => {
    expect(unsentLabel(1)).toBe('1 change not sent');
    expect(unsentLabel(5)).toBe('5 changes not sent');
  });
});

describe('useUnsentGuard', () => {
  it('blocks leaving only while active', () => {
    const { rerender } = renderHook(({ active }) => useUnsentGuard(active), {
      initialProps: { active: true },
    });
    const first = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    rerender({ active: false });
    const second = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });
});

describe('Header unsent counter', () => {
  it('shows the counter in the header only when something is unsent', () => {
    vi.stubGlobal('__STUDIO_VERSION__', '0.0.0-test');
    const props = {
      coveragePercentage: 50,
      changesCount: 0,
      isChangesOpen: false,
      onToggleChanges: () => {},
    };
    const { rerender } = render(<Header {...props} unsentCount={0} />);
    expect(screen.queryByTestId('unsent-counter')).toBeNull();
    rerender(<Header {...props} unsentCount={5} />);
    expect(screen.getByTestId('unsent-counter').textContent).toBe('5 changes not sent');
  });
});
