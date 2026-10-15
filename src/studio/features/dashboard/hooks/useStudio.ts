import { useState, useRef } from 'react';
import { SelectedElement } from '../types/index.js';
import { APP_ORIGIN } from '../constants.js';
import { useConnection } from './useConnection.js';
import { useLocaleData } from './useLocaleData.js';
import { useSelection } from './useSelection.js';
import { useLocaleActions } from './useLocaleActions.js';
import { useKeySearch } from './useKeySearch.js';
import { useGit } from './useGit.js';
import { useHistory, type HistoryEntry } from './useHistory.js';
import { saveTranslation } from '../../../api.js';

/**
 * Composer hook: wires the focused feature hooks together and owns the
 * cross-cutting UI feedback state (loading, errors).
 */
export const useStudio = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isChangesOpen, setIsChangesOpen] = useState<boolean>(false);
  const [isUndoing, setIsUndoing] = useState<boolean>(false);

  // Cross-hook callback refs so the iframe bridge can reach hooks that are
  // instantiated later in the composition order.
  const selectElementRef = useRef<(el: SelectedElement) => void>(() => {});
  const setLocaleRef = useRef<(locale: string) => void>(() => {});
  const setErrorRef = useRef<(message: string) => void>(() => {});

  const { connectionStatus, currentPath, visibleKeys, iframeRef, sendToIframe } = useConnection({
    onElementSelected: (el) => selectElementRef.current(el),
    onLocaleDetected: (locale) => setLocaleRef.current(locale),
    onError: (message) => setErrorRef.current(message),
  });

  const {
    locale,
    setLocale,
    locales,
    allKeys,
    codeKeys,
    localeData,
    enLocaleData,
    coveragePercentage,
    handleLocaleChange,
    fetchKeysMetadata,
    refreshAll,
    updateLocaleDataCache,
  } = useLocaleData({ connectionStatus, iframeRef });

  const history = useHistory();

  const {
    selected,
    inputValue,
    isSuccess,
    showConfirmModal,
    selectElement,
    confirmDiscard,
    cancelDiscard,
    selectKeyDirectly,
    handleInputChange,
    handleSave,
    handleClearSelection,
  } = useSelection({
    localeData,
    enLocaleData,
    sendToIframe,
    locale,
    refreshKeysMetadata: fetchKeysMetadata,
    updateLocaleDataCache,
    setLoading: setIsLoading,
    setError,
    onSaved: (change) => {
      history.record(change);
      git.refresh();
    },
  });

  const git = useGit({
    connectionStatus,
    onAfterDiscard: async () => {
      history.clear();
      handleClearSelection();
      await refreshAll();
    },
  });

  // Undo re-saves the previous value through the normal mutation path, so the
  // file on disk, the dictionary cache, and git status all stay consistent.
  const undoEntry = async (entry: HistoryEntry) => {
    setIsUndoing(true);
    setError(null);
    try {
      await saveTranslation(entry.locale, entry.key, entry.previousValue);
      if (entry.locale === locale) {
        updateLocaleDataCache(entry.key, entry.previousValue);
      }
      history.remove(entry.id);
      await git.refresh();
    } catch (err: any) {
      setError(err.message || 'Undo failed.');
    } finally {
      setIsUndoing(false);
    }
  };

  selectElementRef.current = selectElement;
  setLocaleRef.current = setLocale;
  setErrorRef.current = setError;

  const { handleAddLocale, handleRenameLocale, handleDeleteLocale } = useLocaleActions({
    locale,
    locales,
    handleLocaleChange,
    refreshAll,
    handleClearSelection,
    setLoading: setIsLoading,
    setError,
  });

  const { searchTerm, setSearchTerm, filterPageOnly, setFilterPageOnly, filteredKeys } =
    useKeySearch({ allKeys, visibleKeys, localeData });

  return {
    selected,
    inputValue,
    locale,
    connectionStatus,
    isLoading,
    isSuccess,
    error,
    currentPath,
    iframeRef,
    appOrigin: APP_ORIGIN,
    showConfirmModal,
    localeData,
    searchTerm,
    filteredKeys,
    coveragePercentage,
    setSearchTerm,
    selectKeyDirectly,
    handleInputChange,
    handleLocaleChange,
    handleSave,
    handleClearSelection,
    confirmDiscard,
    cancelDiscard,
    locales,
    handleAddLocale,
    handleRenameLocale,
    handleDeleteLocale,
    allKeys,
    codeKeys,
    filterPageOnly,
    setFilterPageOnly,
    visibleKeys,
    // Changes panel: git + session history
    isChangesOpen,
    toggleChanges: () => setIsChangesOpen((v) => !v),
    closeChanges: () => setIsChangesOpen(false),
    git: git.git,
    gitError: git.error,
    isGitLoading: git.isLoading,
    lastCommit: git.lastCommit,
    commitChanges: git.commit,
    discardChanges: git.discard,
    refreshGit: git.refresh,
    history: history.entries,
    undoEntry,
    isUndoing,
  };
};
