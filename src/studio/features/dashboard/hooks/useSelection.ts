import { useState, useEffect, useCallback, useRef } from 'react';
import { SelectedElement } from '../types/index.js';
import { HttpStatusError, NetworkError, saveTranslation, ValidationError } from '../../../api.js';
import { englishText, type StudioText } from '../../../i18n/catalogue.js';
import { editorValueFor } from '../page-value.js';

export interface SaveWarning {
  code: string;
  message: string;
  missing: string[];
  extra: string[];
}

export interface UseSelectionParams {
  localeData: Record<string, string>;
  enLocaleData: Record<string, string>;
  sendToIframe: (type: string, payload?: any) => void;
  locale: string;
  /** The project's source locale, which `enLocaleData` holds; defaults to `en`. */
  referenceLocale?: string;
  refreshKeysMetadata: () => Promise<void>;
  updateLocaleDataCache: (key: string, value: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Notified after every successful save (used for the session history / undo). */
  onSaved?: (change: {
    locale: string;
    key: string;
    previousValue: string;
    nextValue: string;
    /** The locale had no value for the key: `previousValue` is '' only because none existed. */
    added?: boolean;
    /** What the page showed before, when it differs from `previousValue` (a fallback). */
    pageValue?: string;
  }) => void;
  /** The Studio text for the fallback error message; English when left out. */
  t?: StudioText;
}

/**
 * Owns the editing session: selected element, input value, unsaved-changes
 * confirmation modal, save flow, and live preview messaging.
 */
export const useSelection = ({
  localeData,
  enLocaleData,
  sendToIframe,
  locale,
  referenceLocale = 'en',
  refreshKeysMetadata,
  updateLocaleDataCache,
  setLoading,
  setError,
  onSaved,
  t = englishText,
}: UseSelectionParams) => {
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [saveWarning, setSaveWarning] = useState<SaveWarning | null>(null);
  // Counts completed picks, so a repeat pick of the same key is still visible
  // to consumers that react to "a key was picked" (the editor drawer).
  const [selectionCount, setSelectionCount] = useState<number>(0);

  // Timer for the transient success indicator — cleared on unmount and re-save
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimer.current) {
        clearTimeout(successTimer.current);
      }
    };
  }, []);

  // Custom Confirmation Modal States (Keeping hook UI-agnostic)
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [pendingElement, setPendingElement] = useState<SelectedElement | null>(null);
  // Something else that would drop the typed text (a language switch), run once it is discarded.
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Check if there are unsaved changes
  const hasUnsavedChanges = selected !== null && inputValue !== selected.currentValue;

  // Update input value with live preview message back to iframe
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      setSaveWarning(null);
      // The stored value lets the page find a rich-text value's nodes and keep literal text.
      sendToIframe('APPLY_PREVIEW', {
        key: selected?.key,
        value,
        source: selected?.pageValue ?? selected?.currentValue,
      });
    },
    [sendToIframe, selected?.key, selected?.currentValue, selected?.pageValue]
  );

  // A pick reports the text on the page, which is the edited locale's text once the page
  // shows it; the reference is the source locale's value whenever the source has the key.
  const referenceFor = useCallback(
    (el: SelectedElement) => enLocaleData[el.key] ?? el.fallbackValue,
    [enLocaleData]
  );

  // What the page shows for the key: the edited locale's stored value; without one, the page
  // text, or the reference value when the page shows it (a fallback), markup included.
  const pageValueOf = useCallback(
    (el: SelectedElement) =>
      editorValueFor(localeData[el.key], el.currentValue, [enLocaleData[el.key]], el.fallbackValue),
    [localeData, enLocaleData]
  );

  // The picked element as the editor holds it. A translation the edited locale lacks starts
  // empty: the page shows the fallback's words, which are to be translated, not corrected, and
  // they stay in view as the reference above the field. The preview still finds them on the
  // page through `pageValue`.
  const pickFor = useCallback(
    (el: SelectedElement): SelectedElement => {
      const shown = pageValueOf(el);
      const missing = locale !== referenceLocale && localeData[el.key] === undefined;
      return {
        ...el,
        fallbackValue: referenceFor(el),
        currentValue: missing ? '' : shown,
        pageValue: shown,
      };
    },
    [pageValueOf, referenceFor, locale, referenceLocale, localeData]
  );

  // A new pick, after the page was told to drop the last pick's preview. The page reported the
  // text with that preview still on it, so when the same missing translation is picked again,
  // what the page showed before comes from the last pick, not from the discarded preview.
  const repickFor = useCallback(
    (el: SelectedElement): SelectedElement => {
      const pick = pickFor(el);
      const missing = locale !== referenceLocale && localeData[el.key] === undefined;
      if (!selected || selected.key !== el.key || !missing) return pick;
      return {
        ...pick,
        fallbackValue: selected.fallbackValue,
        pageValue: selected.pageValue ?? pick.pageValue,
      };
    },
    [pickFor, selected, locale, referenceLocale, localeData]
  );

  const selectElement = useCallback(
    (newElement: SelectedElement) => {
      // Expose the custom Confirmation Modal state instead of using blocking window.confirm (RULE STD-004)
      if (hasUnsavedChanges) {
        pendingActionRef.current = null;
        setPendingElement(newElement);
        setShowConfirmModal(true);
        return;
      }

      // Nothing unsaved, yet the page may still show a preview of the last pick: text typed
      // and erased again ('' for a missing translation blanks the fallback text).
      if (selected) sendToIframe('RESTORE_PREVIEW', { key: selected.key });
      const pick = repickFor(newElement);
      setSelected(pick);
      setSelectionCount((n) => n + 1);
      setInputValue(pick.currentValue);
      setIsSuccess(false);
      setSaveWarning(null);
      setError(null);
    },
    [hasUnsavedChanges, repickFor, setError, selected, sendToIframe]
  );

  // Expose trigger actions to handle Confirmation Modal choice
  const confirmDiscard = useCallback(() => {
    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    if (pendingAction) {
      // The selection stays; only the typed text goes, on the page too, before the action.
      setInputValue(selected?.currentValue ?? '');
      setSaveWarning(null);
      sendToIframe('CLEAR_SELECTION');
    } else if (pendingElement) {
      // The page still shows the discarded text: the client puts back what it showed before.
      // Not CLEAR_SELECTION, which would also drop the new pick's highlight. A client older
      // than this message ignores it and keeps the text until the selection clears.
      if (selected) sendToIframe('RESTORE_PREVIEW', { key: selected.key });
      const pick = repickFor(pendingElement);
      setSelected(pick);
      setSelectionCount((n) => n + 1);
      setInputValue(pick.currentValue);
    } else {
      // Discarding a clear-selection with unsaved edits → deselect entirely
      setSelected(null);
      setInputValue('');
      sendToIframe('CLEAR_SELECTION');
    }
    setPendingElement(null);
    setShowConfirmModal(false);
    setIsSuccess(false);
    setError(null);
    pendingAction?.();
  }, [pendingElement, repickFor, sendToIframe, setError, selected]);

  const cancelDiscard = useCallback(() => {
    pendingActionRef.current = null;
    setPendingElement(null);
    setShowConfirmModal(false);
  }, []);

  /**
   * Runs `action`, which would drop the typed text (a language switch), at once when nothing
   * is typed; otherwise after the same unsaved-changes prompt as picking another text.
   */
  const guardUnsaved = useCallback(
    (action: () => void) => {
      if (!hasUnsavedChanges) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setPendingElement(null);
      setShowConfirmModal(true);
    },
    [hasUnsavedChanges]
  );

  // Select a key directly from the searchable sidebar directory (Phase 2)
  const selectKeyDirectly = useCallback(
    (key: string) => {
      const value = localeData[key] || '';
      selectElement({
        key,
        fallbackValue: value,
        currentValue: value,
      });
    },
    [localeData, selectElement]
  );

  // Sync active translation value and English reference when active locale changes
  useEffect(() => {
    if (selected) {
      const activeValue = localeData[selected.key] || '';
      const enValue = enLocaleData[selected.key] || selected.fallbackValue || '';

      // Only update if value in localeData is different, to avoid overwriting ongoing typing
      if (selected.currentValue !== activeValue) {
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                currentValue: activeValue,
                pageValue: undefined,
                fallbackValue: enValue,
              }
            : null
        );
        setInputValue(activeValue);
      }
    }
  }, [localeData, enLocaleData]);

  // Save mutation to Server Handler. The reference text travels with the
  // request so the server can check placeholder parity; a 422 becomes a
  // warning the user can override with `force`.
  const handleSave = async (options: { force?: boolean } = {}) => {
    if (!selected) return;

    setLoading(true);
    setIsSuccess(false);
    setError(null);

    try {
      const previousValue = selected.currentValue;
      const previousPageValue = selected.pageValue ?? previousValue;
      const reference =
        locale === referenceLocale
          ? previousValue
          : (enLocaleData[selected.key] ?? selected.fallbackValue);
      await saveTranslation(locale, selected.key, inputValue, {
        reference: reference || undefined,
        force: options.force,
      });
      setSaveWarning(null);

      // Successful save
      setIsSuccess(true);
      // A translation the locale lacked starts empty; the source locale keeps the page text.
      const added = localeData[selected.key] === undefined && previousValue === '';
      onSaved?.({
        locale,
        key: selected.key,
        previousValue,
        nextValue: inputValue,
        ...(added ? { added } : {}),
        ...(previousPageValue !== previousValue ? { pageValue: previousPageValue } : {}),
      });
      setSelected((prev) =>
        prev ? { ...prev, currentValue: inputValue, pageValue: undefined } : null
      );

      // Update dictionary state local cache
      updateLocaleDataCache(selected.key, inputValue);

      // Refresh list of all keys in case a new key was saved/created
      refreshKeysMetadata();

      // Keep the saved text on the page, then clear the selection highlight
      sendToIframe('COMMIT_PREVIEW', {
        key: selected.key,
        value: inputValue,
        source: previousPageValue,
      });
      sendToIframe('CLEAR_SELECTION');

      // Clear saved indicator after 2 seconds (restart the timer on re-save)
      if (successTimer.current) {
        clearTimeout(successTimer.current);
      }
      successTimer.current = setTimeout(() => {
        setIsSuccess(false);
        successTimer.current = null;
      }, 2000);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        setSaveWarning({
          code: err.code,
          message: err.message,
          missing: err.details.missing,
          extra: err.details.extra,
        });
      } else if (err instanceof NetworkError) {
        // The browser's own words ("Failed to fetch") say nothing to the person who typed.
        setError(t('errors.save_unreachable'));
      } else if (err instanceof HttpStatusError && !err.fromServer) {
        setError(t('errors.save_server', { status: err.status }));
      } else {
        // The server's own message (a refused structure change, say) is kept as it is.
        setError(err.message || t('errors.save_failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClearSelection = useCallback(() => {
    // Guard against silently discarding unsaved edits
    if (hasUnsavedChanges) {
      pendingActionRef.current = null;
      setPendingElement(null);
      setShowConfirmModal(true);
      return;
    }
    setSelected(null);
    setInputValue('');
    sendToIframe('CLEAR_SELECTION');
  }, [hasUnsavedChanges, sendToIframe]);

  return {
    selected,
    selectionCount,
    inputValue,
    isSuccess,
    showConfirmModal,
    hasUnsavedChanges,
    selectElement,
    confirmDiscard,
    cancelDiscard,
    selectKeyDirectly,
    handleInputChange,
    handleSave,
    handleClearSelection,
    guardUnsaved,
    saveWarning,
    dismissSaveWarning: () => setSaveWarning(null),
  };
};
