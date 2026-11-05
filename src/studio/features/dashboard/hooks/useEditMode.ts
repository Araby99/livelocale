import { useEffect, useState } from 'react';

export interface EditModeParams {
  /** A touch device whose page client understands Edit mode. */
  active: boolean;
  /** Bumped on every READY: each new page starts with Edit off and must be told again. */
  readySeq: number;
  setSiteEditMode: (on: boolean) => void;
}

/**
 * The Edit/Browse choice on touch devices. A fresh Studio starts in Edit; the choice
 * then holds across page changes for this load only (never stored).
 */
export const useEditMode = ({ active, readySeq, setSiteEditMode }: EditModeParams) => {
  const [editMode, setEditMode] = useState(true);

  useEffect(() => {
    if (active) setSiteEditMode(editMode);
  }, [active, editMode, readySeq]);

  return { editMode, setEditMode };
};
