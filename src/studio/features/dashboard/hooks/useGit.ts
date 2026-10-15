import { useState, useEffect, useCallback } from 'react';
import { fetchGitState, commitLocales, discardLocales, type GitState } from '../../../api.js';

export interface UseGitParams {
  connectionStatus: string;
  /** Called after a successful discard so dictionaries can be reloaded from disk. */
  onAfterDiscard: () => void | Promise<void>;
}

/**
 * Owns the version-control view of the locales directory: current status
 * and diff, plus commit and discard actions. Git being unavailable is a
 * normal state, not an error.
 */
export const useGit = ({ connectionStatus, onAfterDiscard }: UseGitParams) => {
  const [git, setGit] = useState<GitState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCommit, setLastCommit] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await fetchGitState();
      setGit(state);
    } catch (err: any) {
      setError(err.message || 'Failed to read git status.');
    }
  }, []);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      refresh();
    }
  }, [connectionStatus, refresh]);

  const commit = useCallback(
    async (message: string): Promise<string | undefined> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await commitLocales(message);
        setLastCommit(result.hash);
        await refresh();
        return result.hash;
      } catch (err: any) {
        setError(err.message || 'Commit failed.');
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  const discard = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await discardLocales();
      await onAfterDiscard();
      await refresh();
      return true;
    } catch (err: any) {
      setError(err.message || 'Discard failed.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [onAfterDiscard, refresh]);

  return {
    git,
    isLoading,
    error,
    lastCommit,
    refresh,
    commit,
    discard,
    clearError: () => setError(null),
  };
};
