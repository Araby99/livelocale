import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGitState, commitLocales, discardLocales, type GitState } from '../../../api.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

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
  // Read through a ref, so switching the language does not refetch the status.
  const { t } = useStudioText();
  const textRef = useRef(t);
  textRef.current = t;
  const [git, setGit] = useState<GitState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCommit, setLastCommit] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await fetchGitState();
      setGit(state);
    } catch (err: any) {
      setError(err.message || textRef.current('errors.git_status_failed'));
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
        setError(err.message || textRef.current('errors.commit_failed'));
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
      setError(err.message || textRef.current('errors.discard_failed'));
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
