import { useState, useRef, useEffect } from 'react';
import { SelectedElement } from '../types/index.js';
import { getAppOrigin, getAppUrl } from '../constants.js';
import { useConnection } from './useConnection.js';
import { useLocaleData } from './useLocaleData.js';
import { useSelection } from './useSelection.js';
import { useLocaleActions } from './useLocaleActions.js';
import { useKeySearch } from './useKeySearch.js';
import { useGit } from './useGit.js';
import { useHistory, type HistoryEntry } from './useHistory.js';
import { saveTranslation, fetchInfo, type LiveLocaleMode } from '../../../api.js';
import { getStudioRuntime, getStaticTransport } from '../../../runtime.js';
import { useAuth } from './useAuth.js';
import { useDrafts } from './useDrafts.js';
import { useUnsentGuard } from './useUnsentGuard.js';
import { valuesToReapply } from './reapply.js';
import { useTargetLocale } from './useTargetLocale.js';
import type { VisibleText } from '../../../../client/iframe-bridge.js';

/** Start-up problems found before any connection, e.g. a share folder without a manifest. */
const runtimeProblems = (): string[] => {
  const runtime = getStudioRuntime();
  return runtime.kind === 'server' ? runtime.problems : [];
};

/**
 * Composer hook: wires the focused feature hooks together and owns the
 * cross-cutting UI feedback state (loading, errors).
 */
export const useStudio = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isChangesOpen, setIsChangesOpen] = useState<boolean>(false);
  const [isUndoing, setIsUndoing] = useState<boolean>(false);
  const [mode, setMode] = useState<LiveLocaleMode | null>(null);
  const [setupProblems, setSetupProblems] = useState<string[]>(runtimeProblems);

  const auth = useAuth();

  // Cross-hook callback refs so the iframe bridge can reach hooks that are
  // instantiated later in the composition order.
  const selectElementRef = useRef<(el: SelectedElement) => void>(() => {});
  const setLocaleRef = useRef<(locale: string) => void>(() => {});
  const setErrorRef = useRef<(message: string) => void>(() => {});
  const visibleTextsRef = useRef<(texts: VisibleText[]) => void>(() => {});

  const { connectionStatus, currentPath, visibleKeys, iframeRef, sendToIframe } = useConnection({
    onElementSelected: (el) => selectElementRef.current(el),
    onLocaleDetected: (locale) => setLocaleRef.current(locale),
    onError: (message) => setErrorRef.current(message),
    onVisibleTexts: (texts) => visibleTextsRef.current(texts),
  });

  const {
    locale,
    setLocale,
    locales,
    allKeys,
    codeKeys,
    localeData,
    dataLocale,
    enLocaleData,
    coveragePercentage,
    handleLocaleChange: setLocaleAndNavigate,
    fetchKeysMetadata,
    refreshAll,
    updateLocaleDataCache,
  } = useLocaleData({
    connectionStatus,
    iframeRef,
    referenceLocale: getStaticTransport()?.manifest.sourceLocale ?? 'en',
  });

  const history = useHistory();
  const staticTransport = getStaticTransport();
  const drafts = useDrafts(staticTransport);

  // The locale edits go to: inferred and always shown on a share link; today's behaviour otherwise.
  const target = useTargetLocale({
    enabled: staticTransport !== null,
    scope: staticTransport?.scope ?? null,
    locale,
    setLocale,
    setMenuLocale: setLocaleAndNavigate,
    locales,
    getCandidates: async () => (staticTransport ? staticTransport.textCandidates() : {}),
  });
  const handleLocaleChange = target.onMenuLocale;

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
    saveWarning,
    dismissSaveWarning,
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

  // Server mode (development vs preview) for the header badge; refetched when the
  // token changes because the first call may have been rejected with 401.
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    fetchInfo()
      .then((info) => {
        setMode(info.mode);
        setSetupProblems([...runtimeProblems(), ...(info.problems ?? [])]);
      })
      .catch(() => {});
  }, [connectionStatus, auth.tokenVersion]);

  // After a token is entered, the earlier data loads failed with 401: reload everything.
  const initialTokenVersion = useRef(auth.tokenVersion);
  useEffect(() => {
    if (auth.tokenVersion === initialTokenVersion.current) return;
    if (connectionStatus !== 'connected') return;
    refreshAll();
    git.refresh();
  }, [auth.tokenVersion]);

  // A preview deployment or a share link keeps serving the text it was built with, so a reload
  // or navigation would bring back pre-edit values. Re-apply this session's history (preview)
  // or the saved drafts (static) for the current locale.
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const values = valuesToReapply({
      mode,
      locale,
      localeConfirmed: target.confirmed,
      history: history.entries,
      drafts: drafts.drafts,
    });
    values.forEach((value, key) => sendToIframe('COMMIT_PREVIEW', { key, value }));
  }, [
    mode,
    connectionStatus,
    currentPath,
    visibleKeys,
    locale,
    target.confirmed,
    history.entries,
    drafts.drafts,
  ]);

  // Share link: an Alt+Click is shown only once the dictionary of its target locale has loaded.
  const [queuedSelection, setQueuedSelection] = useState<SelectedElement | null>(null);
  useEffect(() => {
    if (queuedSelection === null || dataLocale !== locale) return;
    setQueuedSelection(null);
    selectElement(queuedSelection);
  }, [queuedSelection, dataLocale, locale]);

  const handleElementSelected = (el: SelectedElement) => {
    if (!staticTransport) {
      selectElement(el);
      return;
    }
    target
      .resolveForSelection(el)
      .then((resolved) => {
        if (resolved) setQueuedSelection(el);
      })
      .catch((err: any) => setError(err?.message || 'Could not tell which language to edit.'));
  };

  const chooseTargetLocale = (chosen: string) => {
    const pending = target.choose(chosen);
    if (pending) setQueuedSelection(pending);
  };

  // Unsent drafts live only in this browser: ask before the tab is closed.
  useUnsentGuard(mode === 'static' && drafts.unsentCount > 0);

  // Undo re-saves the previous value through the normal mutation path, so the
  // file on disk, the dictionary cache, and git status all stay consistent.
  const undoEntry = async (entry: HistoryEntry) => {
    setIsUndoing(true);
    setError(null);
    try {
      await saveTranslation(entry.locale, entry.key, entry.previousValue);
      if (entry.locale === locale) {
        updateLocaleDataCache(entry.key, entry.previousValue);
        sendToIframe('COMMIT_PREVIEW', { key: entry.key, value: entry.previousValue });
      }
      history.remove(entry.id);
      await git.refresh();
    } catch (err: any) {
      setError(err.message || 'Undo failed.');
    } finally {
      setIsUndoing(false);
    }
  };

  selectElementRef.current = handleElementSelected;
  setLocaleRef.current = target.onUrlLocale;
  visibleTextsRef.current = (texts) => {
    target.onVisibleTexts(texts).catch(() => {});
  };
  setErrorRef.current = setError;

  const { handleAddLocale, handleRenameLocale, handleDeleteLocale } = useLocaleActions({
    locale,
    locales,
    handleLocaleChange: setLocaleAndNavigate,
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
    appOrigin: getAppOrigin(),
    appUrl: getAppUrl(),
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
    setupProblems,
    // Placeholder safety
    saveWarning,
    handleForceSave: () => handleSave({ force: true }),
    dismissSaveWarning,
    // Share-link drafts
    drafts: drafts.drafts,
    unsentCount: drafts.unsentCount,
    sentCount: drafts.sentCount,
    markDraftsSent: drafts.markSent,
    staticManifest: staticTransport?.manifest ?? null,
    // Target locale (share link only)
    targetLocale: staticTransport
      ? { locale, source: target.source, mismatch: target.mismatch }
      : null,
    localePickerCandidates: target.pickerCandidates,
    chooseTargetLocale,
    cancelLocalePick: target.cancelPick,
    // Preview mode / auth
    mode,
    needsToken: auth.needsToken,
    submitToken: auth.submitToken,
  };
};
