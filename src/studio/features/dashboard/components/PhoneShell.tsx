import React, { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BottomSheet } from './BottomSheet.js';
import { useKeyboardInset } from '../hooks/useKeyboardInset.js';
import { nextMissingKey } from '../next-missing.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface PhoneShellProps {
  topBar: ReactNode;
  viewer: ReactNode;
  editorSheet: ReactNode;
  sendSheet: ReactNode;
  /** The Edit / Browse switch; none when the page client cannot tap to edit. */
  bottomBar: ReactNode;
}

/**
 * The phone layout: the site fills the screen between a thin top bar and the bottom bar,
 * and the editor and Send slide up over it as sheets. The phone layout is decided by the
 * device, so rotating never swaps it for the desktop one and the editor is never remounted.
 */
export const PhoneShell = ({
  topBar,
  viewer,
  editorSheet,
  sendSheet,
  bottomBar,
}: PhoneShellProps) => (
  <div data-testid="phone-shell" className="flex-1 min-h-0 flex flex-col">
    {topBar}
    <main className="flex-1 min-h-0 flex flex-col bg-app">{viewer}</main>
    {bottomBar != null && (
      <div className="shrink-0 flex items-center justify-center px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] bg-surface border-t border-line select-none">
        {bottomBar}
      </div>
    )}
    {editorSheet}
    {sendSheet}
  </div>
);

interface PhoneEditorSheetProps {
  /** Bumped on every completed pick; each one brings the sheet up, a repeat pick included. */
  selectionCount: number;
  /** The key being edited, kept visible above the sheet. */
  selectedKey: string | null;
  /** The element the site is drawn in, to work out how much of it the sheet covers. */
  frameRef: RefObject<HTMLElement | null>;
  /** Scrolls the page so `key` sits above `bottomInset` CSS px from the frame's bottom. */
  onReveal: (key: string, bottomInset: number) => void;
  /**
   * Called when the person closes the sheet (swipe down, a tap on the page above it, Escape); it clears the
   * selection, which may first ask about unsaved changes. Given, the sheet stays up until the
   * selection is gone, so "keep editing" keeps it open. Without it, closing only hides the sheet.
   */
  onDismiss?: () => void;
  /** Told whenever the sheet shows or hides. */
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

/**
 * The most of the visible height the editor sheet takes, so at least ~40% of the page stays
 * in view above it, live-updating as the person types.
 */
export const EDITOR_SHEET_MAX_SHARE = 0.6;

/**
 * The most CSS px at the bottom of `frame` the editor sheet can cover, before it has opened
 * and can be measured: a jump to text puts it above this line, so the sheet never hides it.
 */
export function editorSheetCover(frame: HTMLElement | null): number {
  const frameBottom = frame?.getBoundingClientRect().bottom ?? window.innerHeight;
  return Math.max(0, Math.round(frameBottom - window.innerHeight * (1 - EDITOR_SHEET_MAX_SHARE)));
}

/** How many CSS px at the bottom of the frame the sheet covers, keyboard included. */
function coveredFrameBottom(sheet: HTMLElement, frame: HTMLElement | null, inset: number): number {
  // The sheet is pinned `inset` px above the layout bottom; `offsetHeight` ignores the
  // slide-in transform, so the measure is right while it animates.
  const sheetTop = window.innerHeight - inset - sheet.offsetHeight;
  const frameBottom = frame?.getBoundingClientRect().bottom ?? window.innerHeight;
  return Math.max(0, Math.round(frameBottom - sheetTop));
}

/**
 * The editor in a bottom sheet. It opens on every pick, and whenever it opens, changes height
 * or moves for the keyboard, the page scrolls so the picked text stays visible above it.
 */
export const PhoneEditorSheet = ({
  selectionCount,
  selectedKey,
  frameRef,
  onReveal,
  onDismiss,
  onOpenChange,
  children,
}: PhoneEditorSheetProps) => {
  const { t } = useStudioText();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const inset = useKeyboardInset();
  const contentRef = useRef<HTMLDivElement>(null);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  // Keyed on the pick count, not the key, so a closed sheet reopens on a repeat pick.
  useEffect(() => {
    if (selectionCount > 0) setOpen(true);
  }, [selectionCount]);

  // A cleared selection leaves nothing to edit.
  useEffect(() => {
    if (selectedKey === null) setOpen(false);
  }, [selectedKey]);

  const shown = open && (selectedKey !== null || onDismiss === undefined);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => onOpenChangeRef.current?.(shown), [shown]);

  useEffect(() => {
    if (!open || selectedKey === null) return;
    const sheet = contentRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!sheet) return;
    const reveal = () =>
      onRevealRef.current(selectedKey, coveredFrameBottom(sheet, frameRef.current, inset));
    reveal();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(reveal);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [open, selectedKey, selectionCount, inset, frameRef]);

  return (
    <BottomSheet
      open={shown}
      onClose={onDismiss ?? (() => setOpen(false))}
      labelledBy={titleId}
      maxHeightShare={EDITOR_SHEET_MAX_SHARE}
      lightBackdrop
    >
      <div ref={contentRef} className="flex flex-col">
        <h2 id={titleId} className="sr-only">
          {t('layout.editor')}
        </h2>
        {children}
      </div>
    </BottomSheet>
  );
};

interface NextMissingButtonProps {
  /** Keys with a visible element on the page, in reading order; null until the page reports. */
  renderedKeys: string[] | null;
  /** Every key on the page, hidden parts included. */
  pageKeys: string[] | null;
  currentKey: string | null;
  /** Whether the edited locale has a value for `key`. */
  hasValue: (key: string) => boolean;
  /** Scrolls the page to `key` and selects it. */
  onSelectKey: (key: string) => void;
}

/**
 * Moves the selection to the next visible text with no value in the edited locale. With no
 * visible gap left it says so, counting the gaps in hidden parts of the page, and never
 * claims the page is fully translated while some remain. Made for a wrapping flex row: the
 * button takes an equal share of it and the status line a full row above.
 */
export const NextMissingButton = ({
  renderedKeys,
  pageKeys,
  currentKey,
  hasValue,
  onSelectKey,
}: NextMissingButtonProps) => {
  const { t } = useStudioText();
  const [hiddenMissing, setHiddenMissing] = useState<number | null>(null);

  // A new selection makes an earlier "all done" stale.
  useEffect(() => setHiddenMissing(null), [currentKey]);

  const goNext = () => {
    if (renderedKeys === null) return;
    const next = nextMissingKey({
      renderedKeys,
      allPageKeys: pageKeys ?? renderedKeys,
      currentKey,
      hasValue,
    });
    if (next.kind === 'key') {
      setHiddenMissing(null);
      onSelectKey(next.key);
    } else {
      setHiddenMissing(next.hiddenMissing);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="next-missing"
        onClick={goNext}
        disabled={renderedKeys === null}
        className="flex-1 min-h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl border bg-raised border-line text-fg text-sm font-semibold hover:border-line-strong disabled:opacity-40 disabled:cursor-not-allowed transition duration-150"
      >
        {t('phone.next_missing')}
        <svg
          aria-hidden="true"
          className="w-4 h-4 rtl:-scale-x-100"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
      <p
        role="status"
        aria-live="polite"
        className="order-first basis-full text-xs text-fg-muted empty:hidden"
      >
        {hiddenMissing === null
          ? ''
          : hiddenMissing === 0
            ? t('phone.done_all')
            : t('phone.done_hidden', { count: hiddenMissing })}
      </p>
    </>
  );
};
