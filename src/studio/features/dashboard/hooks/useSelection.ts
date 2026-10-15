import { useState, useEffect, useCallback, useRef } from 'react';
import { SelectedElement } from '../types/index.js';
import { saveTranslation, ValidationError } from '../../../api.js';

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
  }) => void;
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
  refreshKeysMetadata,
  updateLocaleDataCache,
  setLoading,
  setError,
  onSaved,
}: UseSelectionParams) => {
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [saveWarning, setSaveWarning] = useState<SaveWarning | null>(null);

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

  // Check if there are unsaved changes
  const hasUnsavedChanges = selected !== null && inputValue !== selected.currentValue;

  // Update input value with live preview message back to iframe
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      setSaveWarning(null);
      sendToIframe('APPLY_PREVIEW', { key: selected?.key, value });
    },
    [sendToIframe, selected?.key]
  );

  const selectElement = useCallback(
    (newElement: SelectedElement) => {
      // Expose the custom Confirmation Modal state instead of using blocking window.confirm (RULE STD-004)
      if (hasUnsavedChanges) {
        setPendingElement(newElement);
        setShowConfirmModal(true);
        return;
      }

      const rawValue = localeData[newElement.key] ?? newElement.currentValue;

      setSelected({
        ...newElement,
        currentValue: rawValue,
      });
      setInputValue(rawValue);
      setIsSuccess(false);
      setSaveWarning(null);
      setError(null);
    },
    [hasUnsavedChanges, localeData, setError]
  );

  // Expose trigger actions to handle Confirmation Modal choice
  const confirmDiscard = useCallback(() => {
    if (pendingElement) {
      const rawValue = localeData[pendingElement.key] ?? pendingElement.currentValue;
      setSelected({
        ...pendingElement,
        currentValue: rawValue,
      });
      setInputValue(rawValue);
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
  }, [pendingElement, localeData, sendToIframe, setError]);

  const cancelDiscard = useCallback(() => {
    setPendingElement(null);
    setShowConfirmModal(false);
  }, []);

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
      const reference =
        locale === 'en' ? previousValue : (enLocaleData[selected.key] ?? selected.fallbackValue);
      await saveTranslation(locale, selected.key, inputValue, {
        reference: reference || undefined,
        force: options.force,
      });
      setSaveWarning(null);

      // Successful save
      setIsSuccess(true);
      onSaved?.({ locale, key: selected.key, previousValue, nextValue: inputValue });
      setSelected((prev) => (prev ? { ...prev, currentValue: inputValue } : null));

      // Update dictionary state local cache
      updateLocaleDataCache(selected.key, inputValue);

      // Refresh list of all keys in case a new key was saved/created
      refreshKeysMetadata();

      // Send indicator update back to client to clear selection highlight
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
      } else {
        setError(err.message || 'Failed to save translation.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClearSelection = useCallback(() => {
    // Guard against silently discarding unsaved edits
    if (hasUnsavedChanges) {
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
    saveWarning,
    dismissSaveWarning: () => setSaveWarning(null),
  };
};
