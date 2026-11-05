import { useEffect, useRef } from 'react';

/**
 * A save disables the focused control, and the browser then drops focus to <body>. Wrap the
 * save in `startSave` to remember where focus was inside `rootRef` when it started; once
 * `isLoading` turns false again, focus goes back there (or to the first enabled field).
 */
export function useSaveFocus<T extends HTMLElement>(isLoading: boolean) {
  const rootRef = useRef<T>(null);
  const focusBeforeSave = useRef<HTMLElement | null>(null);
  const startSave = (save: () => void) => {
    const active = document.activeElement;
    focusBeforeSave.current =
      active instanceof HTMLElement && rootRef.current?.contains(active) ? active : null;
    save();
  };
  useEffect(() => {
    if (isLoading) return;
    const before = focusBeforeSave.current;
    focusBeforeSave.current = null;
    const root = rootRef.current;
    if (!before || !root) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return; // the user moved on
    const usable = (el: Element | null): el is HTMLElement =>
      el instanceof HTMLElement && el.isConnected && !el.matches(':disabled');
    const target = usable(before)
      ? before
      : root.querySelector<HTMLElement>('textarea:not(:disabled), input:not(:disabled)');
    target?.focus();
  }, [isLoading]);
  return { rootRef, startSave };
}
