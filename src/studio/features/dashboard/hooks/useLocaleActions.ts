import { useCallback } from 'react';
import { APP_ORIGIN } from '../constants.js';

export interface UseLocaleActionsParams {
  locale: string;
  locales: string[];
  handleLocaleChange: (locale: string) => void;
  refreshAll: () => Promise<void>;
  handleClearSelection: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * Owns the locale management mutations: add, rename, and delete locales.
 */
export const useLocaleActions = ({
  locale,
  locales,
  handleLocaleChange,
  refreshAll,
  handleClearSelection,
  setLoading,
  setError,
}: UseLocaleActionsParams) => {
  // Add a new locale
  const handleAddLocale = useCallback(
    async (newLocale: string) => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${APP_ORIGIN}/api/i18n-lens/mutate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addLocale', locale: newLocale }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || `Server error: ${response.status}`);
        }
        await refreshAll();
        handleLocaleChange(newLocale);
      } catch (err: any) {
        setError(err.message || 'Failed to add locale.');
      } finally {
        setLoading(false);
      }
    },
    [refreshAll, handleLocaleChange, setLoading, setError]
  );

  // Rename an existing locale
  const handleRenameLocale = useCallback(
    async (oldLocale: string, newLocale: string) => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${APP_ORIGIN}/api/i18n-lens/mutate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'renameLocale', locale: oldLocale, newLocale }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || `Server error: ${response.status}`);
        }
        await refreshAll();
        if (locale === oldLocale) {
          handleLocaleChange(newLocale);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to rename locale.');
      } finally {
        setLoading(false);
      }
    },
    [locale, refreshAll, handleLocaleChange, setLoading, setError]
  );

  // Delete an existing locale
  const handleDeleteLocale = useCallback(
    async (targetLocale: string) => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${APP_ORIGIN}/api/i18n-lens/mutate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteLocale', locale: targetLocale }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || `Server error: ${response.status}`);
        }

        const updatedLocales = locales.filter((l) => l !== targetLocale);
        let nextLocale = 'en';
        if (updatedLocales.length > 0) {
          nextLocale = updatedLocales.includes('en') ? 'en' : updatedLocales[0] || 'en';
        }

        await refreshAll();

        if (locale === targetLocale) {
          handleLocaleChange(nextLocale);
          handleClearSelection();
        }
      } catch (err: any) {
        setError(err.message || 'Failed to delete locale.');
      } finally {
        setLoading(false);
      }
    },
    [locales, locale, refreshAll, handleLocaleChange, handleClearSelection, setLoading, setError]
  );

  return {
    handleAddLocale,
    handleRenameLocale,
    handleDeleteLocale,
  };
};
