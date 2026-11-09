import React from 'react';
import type { KeyJumpNote as Note } from '../hooks/useKeyJump.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

/**
 * A quiet line under the key when the text picked from the Keys list is not visible on this
 * page. The live region stays mounted while empty, so each new note is announced.
 */
export const KeyJumpNote = ({ note }: { note: Note | null }) => {
  const { t } = useStudioText();
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="key-jump-note"
      className="text-[11px] leading-relaxed text-fg-muted empty:hidden"
    >
      {note === 'absent'
        ? t('editor.not_on_page')
        : note === 'hidden'
          ? t('editor.hidden_on_page')
          : ''}
    </p>
  );
};
