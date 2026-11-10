import { useEffect, useState } from 'react';

export interface EditModeParams {
  /** A page client that understands Edit mode. */
  active: boolean;
  /**
   * Whether a fresh Studio starts in Edit. Defaults to true; a developer's Studio on a desktop
   * starts in Browse, where the site works as usual and Alt+Click picks text.
   */
  initial?: boolean;
  /** Bumped on every READY: each new page starts with Edit off and must be told again. */
  readySeq: number;
  setSiteEditMode: (on: boolean) => void;
}

/**
 * The Edit/Browse choice. A fresh Studio starts in `initial`; the choice then holds across
 * page changes for this load only (never stored).
 */
export const useEditMode = ({
  active,
  initial = true,
  readySeq,
  setSiteEditMode,
}: EditModeParams) => {
  const [editMode, setEditMode] = useState(initial);

  useEffect(() => {
    if (active) setSiteEditMode(editMode);
  }, [active, editMode, readySeq]);

  return { editMode, setEditMode };
};
