// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGit } from '../../src/studio/features/dashboard/hooks/useGit.js';
import { useHistory } from '../../src/studio/features/dashboard/hooks/useHistory.js';

const APP_ORIGIN = 'http://localhost:3000';
const API = `${APP_ORIGIN}/api/i18n-lens/mutate`;

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const gitBody = (changes: unknown[] = []) => ({
  available: true,
  isRepo: true,
  branch: 'main',
  changes,
  diff: changes.length ? '--- a\n+++ b\n-old\n+new\n' : '',
});

describe('useGit', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads git status once the iframe is connected', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, gitBody([{ path: 'locales/en.json', status: 'modified' }]))
    );
    const { result, rerender } = renderHook(
      ({ status }) => useGit({ connectionStatus: status, onAfterDiscard: vi.fn() }),
      { initialProps: { status: 'connecting' } }
    );
    expect(result.current.git).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    rerender({ status: 'connected' });
    await waitFor(() => expect(result.current.git?.branch).toBe('main'));
    expect(fetch).toHaveBeenCalledWith(`${API}?action=git`);
    expect(result.current.git?.changes).toHaveLength(1);
    expect(result.current.git?.diff).toContain('+new');
  });

  it('commits with a message, then refreshes the status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, gitBody([{ path: 'locales/en.json', status: 'modified' }]))
      )
      .mockResolvedValueOnce(jsonResponse(200, { success: true, hash: 'abc1234' }))
      .mockResolvedValueOnce(jsonResponse(200, gitBody([])));

    const { result } = renderHook(() =>
      useGit({ connectionStatus: 'connected', onAfterDiscard: vi.fn() })
    );
    await waitFor(() => expect(result.current.git?.changes).toHaveLength(1));

    let hash: string | undefined;
    await act(async () => {
      hash = await result.current.commit('i18n: update copy');
    });
    expect(hash).toBe('abc1234');
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      API,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'commit', message: 'i18n: update copy' }),
      })
    );
    await waitFor(() => expect(result.current.git?.changes).toHaveLength(0));
    expect(result.current.lastCommit).toBe('abc1234');
  });

  it('surfaces a failed commit as an error and keeps the status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, gitBody([{ path: 'locales/en.json', status: 'modified' }]))
      )
      .mockResolvedValueOnce(
        jsonResponse(409, { error: 'No changes to commit', code: 'GIT_COMMIT_FAILED' })
      );

    const { result } = renderHook(() =>
      useGit({ connectionStatus: 'connected', onAfterDiscard: vi.fn() })
    );
    await waitFor(() => expect(result.current.git).not.toBeNull());

    await act(async () => {
      await result.current.commit('x');
    });
    expect(result.current.error).toBe('No changes to commit');
    expect(result.current.git?.changes).toHaveLength(1);
  });

  it('discards, refreshes, and notifies the caller so locale data can reload', async () => {
    const onAfterDiscard = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, gitBody([{ path: 'locales/en.json', status: 'modified' }]))
      )
      .mockResolvedValueOnce(jsonResponse(200, { success: true }))
      .mockResolvedValueOnce(jsonResponse(200, gitBody([])));

    const { result } = renderHook(() => useGit({ connectionStatus: 'connected', onAfterDiscard }));
    await waitFor(() => expect(result.current.git?.changes).toHaveLength(1));

    await act(async () => {
      await result.current.discard();
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      API,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'discard' }) })
    );
    expect(onAfterDiscard).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.git?.changes).toHaveLength(0));
  });

  it('reports git as unavailable without treating it as an error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { available: false, isRepo: false, branch: null, changes: [], diff: '' })
    );
    const { result } = renderHook(() =>
      useGit({ connectionStatus: 'connected', onAfterDiscard: vi.fn() })
    );
    await waitFor(() => expect(result.current.git).not.toBeNull());
    expect(result.current.git?.available).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('useHistory', () => {
  it('records entries newest-first with unique ids and timestamps', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record({ locale: 'en', key: 'a', previousValue: '1', nextValue: '2' });
      result.current.record({ locale: 'en', key: 'b', previousValue: 'x', nextValue: 'y' });
    });
    expect(result.current.entries.map((e) => e.key)).toEqual(['b', 'a']);
    expect(result.current.entries[0]?.id).not.toBe(result.current.entries[1]?.id);
    expect(typeof result.current.entries[0]?.at).toBe('number');
  });

  it('removes a single entry and clears everything', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.record({ locale: 'en', key: 'a', previousValue: '1', nextValue: '2' });
      result.current.record({ locale: 'en', key: 'b', previousValue: 'x', nextValue: 'y' });
    });
    const idToRemove = result.current.entries[1]!.id;
    act(() => result.current.remove(idToRemove));
    expect(result.current.entries.map((e) => e.key)).toEqual(['b']);
    act(() => result.current.clear());
    expect(result.current.entries).toEqual([]);
  });

  it('caps the log at the most recent 200 entries', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      for (let i = 0; i < 205; i++) {
        result.current.record({ locale: 'en', key: `k${i}`, previousValue: '', nextValue: 'v' });
      }
    });
    expect(result.current.entries).toHaveLength(200);
    expect(result.current.entries[0]?.key).toBe('k204');
  });
});
