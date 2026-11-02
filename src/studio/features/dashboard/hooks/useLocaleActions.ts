import { useCallback } from 'react';
import { addLocaleRequest, renameLocaleRequest, deleteLocaleRequest } from '../../../api.js';
import { englishText, type StudioText } from '../../../i18n/catalogue.js';

export interface UseLocaleActionsParams {
  locale: string;
  locales: string[];
  handleLocaleChange: (locale: string) => void;
  refreshAll: () => Promise<void>;
  handleClearSelection: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** The Studio text for the fallback error messages; English when left out. */
  t?: StudioText;
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
  t = englishText,
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
        setError(err.message || t('errors.add_locale_failed'));
      } finally {
        setLoading(false);
      }
    },
    [refreshAll, handleLocaleChange, setLoading, setError, t]
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
        setError(err.message || t('errors.rename_locale_failed'));
      } finally {
        setLoading(false);
      }
    },
    [locale, refreshAll, handleLocaleChange, setLoading, setError, t]
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
        setError(err.message || t('errors.delete_locale_failed'));
      } finally {
        setLoading(false);
      }
    },
    [locales, locale, refreshAll, handleLocaleChange, handleClearSelection, setLoading, setError, t]
  );

  return {
    handleAddLocale,
    handleRenameLocale,
    handleDeleteLocale,
  };
};
