import { useCallback } from 'react';
import { addLocaleRequest, renameLocaleRequest, deleteLocaleRequest } from '../../../api.js';

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
        await addLocaleRequest(newLocale);
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
        await renameLocaleRequest(oldLocale, newLocale);
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
        await deleteLocaleRequest(targetLocale);

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
