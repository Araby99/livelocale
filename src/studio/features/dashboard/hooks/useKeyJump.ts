import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyJumpAnswer } from './useConnection.js';

/** What the editor says about a key picked from the Keys list that the page does not show. */
export type KeyJumpNote = 'hidden' | 'absent';

export interface KeyJumpParams {
  /** The page's client understands JUMP_TO_KEY (it said `key-jump` in READY). */
  supported: boolean;
  /** The key open in the editor. */
  selectedKey: string | null;
  /** Bumped on every completed pick. */
  selectionCount: number;
  /** Bumped on every page the client reports; a note about the last page is stale on the next. */
  pageSeq: number;
  /** The page's latest answer to a jump. */
  answer: KeyJumpAnswer | null;
  /** Asks the page to scroll to `key` and show it as selected. */
  jump: (key: string) => void;
}

/**
 * Takes the page to a key picked from the Keys list. The jump waits until the pick completes,
 * so it follows a required language pick or an unsaved-changes prompt, and is dropped when the
 * pick is cancelled. When the page answers that it does not show the key, `note` says so
 * until the next pick or page.
 *
 * Only the current page is searched. Taking the person to another page that has the key
 * would start from `note === 'absent'`.
 */
export const useKeyJump = ({
  supported,
  selectedKey,
  selectionCount,
  pageSeq,
  answer,
  jump,
}: KeyJumpParams) => {
  // The key picked from the list, until its pick completes or another pick does.
  const requestedRef = useRef<string | null>(null);
  // The key a jump was sent for, until the page answers.
  const sentRef = useRef<string | null>(null);
  const [note, setNote] = useState<{ key: string; note: KeyJumpNote } | null>(null);
  const jumpRef = useRef(jump);
  jumpRef.current = jump;

  const request = useCallback((key: string) => {
    requestedRef.current = key;
  }, []);

  useEffect(() => {
    setNote(null);
    sentRef.current = null;
    const requested = requestedRef.current;
    requestedRef.current = null;
    if (!supported || requested === null || requested !== selectedKey) return;
    sentRef.current = requested;
    jumpRef.current(requested);
  }, [selectionCount]);

  useEffect(() => {
    setNote(null);
    sentRef.current = null;
  }, [pageSeq]);

  useEffect(() => {
    if (answer === null || answer.key !== sentRef.current) return;
    sentRef.current = null;
    setNote(answer.result === 'shown' ? null : { key: answer.key, note: answer.result });
  }, [answer]);

  return {
    request,
    note: note !== null && note.key === selectedKey ? note.note : null,
  };
};
