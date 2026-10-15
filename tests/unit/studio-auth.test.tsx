// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  getToken,
  setToken,
  fetchGitState,
  fetchInfo,
  UnauthorizedError,
  UNAUTHORIZED_EVENT,
} from '../../src/studio/api.js';
import { useAuth } from '../../src/studio/features/dashboard/hooks/useAuth.js';
import { TokenModal } from '../../src/studio/features/dashboard/components/TokenModal.jsx';

const API = 'http://localhost:3000/api/i18n-lens/mutate';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('api token handling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    setToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  it('persists the token in sessionStorage and reads it back', () => {
    expect(getToken()).toBeNull();
    setToken('abc');
    expect(getToken()).toBe('abc');
    expect(window.sessionStorage.getItem('i18n-lens-token')).toBe('abc');
    setToken(null);
    expect(getToken()).toBeNull();
  });

  it('sends the bearer token on requests when one is set', async () => {
    setToken('abc');
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { available: false, isRepo: false, branch: null, changes: [], diff: '' })
    );
    await fetchGitState();
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer abc' });
  });

  it('sends no Authorization header without a token', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { mode: 'development', authRequired: false, git: true })
    );
    await fetchInfo();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${API}?action=info`);
    expect(((init as RequestInit)?.headers as any)?.Authorization).toBeUndefined();
  });

  it('throws UnauthorizedError and announces it on a 401', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { error: 'nope', code: 'UNAUTHORIZED' }));
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await expect(fetchGitState()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });
});

describe('useAuth', () => {
  afterEach(() => {
    setToken(null);
  });

  it('asks for a token when the API reports unauthorized, and stops once one is submitted', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.needsToken).toBe(false);

    act(() => {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    });
    expect(result.current.needsToken).toBe(true);

    act(() => result.current.submitToken('  secret  '));
    expect(result.current.needsToken).toBe(false);
    expect(result.current.token).toBe('secret');
    expect(getToken()).toBe('secret');
  });

  it('counts token changes so callers can refetch', () => {
    const { result } = renderHook(() => useAuth());
    const before = result.current.tokenVersion;
    act(() => result.current.submitToken('a'));
    act(() => result.current.submitToken('b'));
    expect(result.current.tokenVersion).toBe(before + 2);
    act(() => result.current.clearToken());
    expect(result.current.token).toBeNull();
  });
});

describe('TokenModal', () => {
  it('submits the typed token and disables submit while empty', () => {
    const onSubmit = vi.fn();
    render(<TokenModal isOpen onSubmit={onSubmit} />);
    const input = screen.getByLabelText(/access token/i) as HTMLInputElement;
    const button = screen.getByRole('button', { name: /connect/i }) as HTMLButtonElement;
    expect(input.type).toBe('password');
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'tok' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith('tok');
    cleanup();
  });

  it('renders nothing when closed', () => {
    render(<TokenModal isOpen={false} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/access token/i)).toBeNull();
    cleanup();
  });
});
