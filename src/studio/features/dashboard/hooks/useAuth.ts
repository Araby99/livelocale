import { useState, useEffect, useCallback } from 'react';
import { getToken, setToken, UNAUTHORIZED_EVENT } from '../../../api.js';

/**
 * Owns the bearer token used in preview mode. The API module announces 401s
 * on `window`; this hook turns that into a "please enter a token" state and
 * bumps `tokenVersion` whenever the token changes so data hooks can refetch.
 */
export const useAuth = () => {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenVersion, setTokenVersion] = useState(0);

  useEffect(() => {
    const onUnauthorized = () => setNeedsToken(true);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const submitToken = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setToken(trimmed);
    setTokenState(trimmed);
    setNeedsToken(false);
    setTokenVersion((v) => v + 1);
  }, []);

  const clearToken = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setTokenVersion((v) => v + 1);
  }, []);

  return { token, needsToken, tokenVersion, submitToken, clearToken };
};
