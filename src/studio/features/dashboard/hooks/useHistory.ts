import { useState, useCallback } from 'react';

export interface HistoryEntry {
  id: string;
  locale: string;
  key: string;
  previousValue: string;
  nextValue: string;
  /** Epoch milliseconds. */
  at: number;
}

export type HistoryInput = Omit<HistoryEntry, 'id' | 'at'>;

/** Keep the session log bounded; older edits are already on disk and in git. */
const MAX_ENTRIES = 200;

let counter = 0;

/**
 * In-memory log of the edits made during this Studio session, newest first.
 * Undo is performed by the caller (it re-saves `previousValue`) and then
 * removes the entry.
 */
export const useHistory = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const record = useCallback((input: HistoryInput) => {
    counter += 1;
    const entry: HistoryEntry = { ...input, id: `${Date.now()}-${counter}`, at: Date.now() };
    setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, record, remove, clear };
};
