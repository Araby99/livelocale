// One planted mistake in the hero copy. It is a keyboard-operable button: Alt+Click, Enter or
// Space opens the editor. It shows the broken word (outlined when it was never translated), the
// flat amber patch once fixed, or the visitor's own words with a hint when the edit is not the fix. On a touch device it is a plain button
// instead: a tap applies the fix at once, with no editor and no on-screen keyboard.
import type { KeyboardEvent, MouseEvent } from 'react';
import { wordDiff, type HeroEdit, type Mistake } from './model';

interface MistakeTextProps {
  mistake: Mistake;
  edit: HeroEdit | undefined;
  fixed: boolean;
  onOpen: () => void;
  /** Tap-the-typo: when set, the mistake is a button that calls this instead of opening the editor. */
  onTap?: () => void;
  elementRef: (el: HTMLElement | null) => void;
}

export function MistakeText({ mistake, edit, fixed, onOpen, onTap, elementRef }: MistakeTextProps) {
  const wrongText = mistake.untranslated ? (
    <span className="m-untranslated">{mistake.wrong}</span>
  ) : (
    mistake.wrong
  );

  if (onTap) {
    return fixed ? (
      <span ref={elementRef} data-mistake={mistake.key}>
        <span className="patch" data-ghost={mistake.wrong}>
          {mistake.right}
        </span>
      </span>
    ) : (
      <button
        ref={elementRef}
        type="button"
        className="m-tap"
        data-mistake={mistake.key}
        aria-label={`Fix ${mistake.wrong}`}
        onClick={onTap}
      >
        {wrongText}
      </button>
    );
  }

  // An edit that is not the fix shows the words the visitor changed (an emptied word shows "…").
  const typed = edit && !fixed ? wordDiff(edit.from, edit.to).added || '…' : undefined;
  const shown = fixed ? mistake.right : (typed ?? mistake.wrong);
  const tryId = `try-${mistake.key.replace('.', '-')}`;

  const onClick = (e: MouseEvent<HTMLSpanElement>) => {
    if (!e.altKey) return;
    e.preventDefault();
    onOpen();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Space must not scroll the page, and neither key may type into the editor
    onOpen();
  };

  return (
    <>
      <span
        ref={elementRef}
        data-mistake={mistake.key}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={`${shown}, press Enter to fix`}
        aria-describedby={typed === undefined ? undefined : tryId}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {fixed ? (
          <span className="patch" data-ghost={mistake.wrong}>
            {mistake.right}
          </span>
        ) : typed !== undefined ? (
          <span className="m-edited">{typed}</span>
        ) : (
          wrongText
        )}
      </span>
      {typed !== undefined && (
        <span className="m-try" id={tryId}>
          Try &quot;{mistake.right}&quot;
        </span>
      )}
    </>
  );
}
