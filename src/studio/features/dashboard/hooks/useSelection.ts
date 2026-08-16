import { useState, useEffect, useCallback, useRef } from 'react';
import { SelectedElement } from '../types/index.js';
import { APP_ORIGIN } from '../constants.js';

export interface UseSelectionParams {
  localeData: Record<string, string>;
  enLocaleData: Record<string, string>;
  sendToIframe: (type: string, payload?: any) => void;
  locale: string;
  refreshKeysMetadata: () => Promise<void>;
  updateLocaleDataCache: (key: string, value: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
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
}: UseSelectionParams) => {
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

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

  // Save mutation to Server Handler
  const handleSave = async () => {
    if (!selected) return;

    setLoading(true);
    setIsSuccess(false);
    setError(null);

    try {
      const response = await fetch(`${APP_ORIGIN}/api/i18n-lens/mutate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locale,
          key: selected.key,
          value: inputValue,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Server responded with status ${response.status}`);
      }

      // Successful save
      setIsSuccess(true);
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
      setError(err.message || 'Failed to save translation.');
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
  };
};
