import React, { useRef, useState, type ReactNode } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { useKeyboardInset, useVisualViewportHeight } from '../hooks/useKeyboardInset.js';

/** A drag on the handle longer than this many px closes the sheet. */
export const CLOSE_DRAG_PX = 80;
/** A downward flick faster than this many px per ms closes the sheet, however short. */
const CLOSE_FLICK_SPEED = 0.5;
/** A flick must still move at least this far, so a tap on the handle never closes. */
const MIN_FLICK_PX = 16;
/** The most of the visible height the sheet takes by default, matching `max-h-[85dvh]`. */
const MAX_HEIGHT_SHARE = 0.85;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** The id of the element that names the sheet, usually its heading. */
  labelledBy: string;
  /** The most of the visible height (above the keyboard) the sheet may take, 0 to 1. */
  maxHeightShare?: number;
  /**
   * A faint dim (about 20%) that keeps the page behind readable, starting below the phone's
   * top bar (56px). The bar stays usable: a tap on it reaches the bar (the locale chip, Send)
   * instead of closing the sheet. A tap on the dimmed page below the bar still closes.
   */
  lightBackdrop?: boolean;
  children: ReactNode;
}

/**
 * A modal sheet that slides up from the bottom of the screen over a dimmed page.
 * Tapping the dimmed page, Escape, or dragging the handle down closes it. The
 * sheet sits directly above the phone keyboard while one is open.
 */
export const BottomSheet = ({
  open,
  onClose,
  labelledBy,
  maxHeightShare = MAX_HEIGHT_SHARE,
  lightBackdrop = false,
  children,
}: BottomSheetProps) => {
  const dialogRef = useDialog<HTMLDivElement>(open, onClose);
  const inset = useKeyboardInset();
  // `dvh` ignores the keyboard, so cap the height to what is visible above it too.
  const visibleHeight = useVisualViewportHeight();
  const drag = useRef<{ startY: number; startAt: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  if (!open) return null;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startY: event.clientY, startAt: performance.now() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setDragOffset(Math.max(0, event.clientY - drag.current.startY));
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    drag.current = null;
    setDragOffset(0);
    if (!start) return;
    const distance = event.clientY - start.startY;
    const elapsed = Math.max(1, performance.now() - start.startAt);
    const flicked = distance >= MIN_FLICK_PX && distance / elapsed > CLOSE_FLICK_SPEED;
    if (distance > CLOSE_DRAG_PX || flicked) onClose();
  };
  const cancelDrag = () => {
    drag.current = null;
    setDragOffset(0);
  };

  return (
    // With the light backdrop the wrapper lets taps through, so only the dim and the sheet
    // catch them and the top bar above the dim keeps working.
    <div className={`fixed inset-0 z-50 ${lightBackdrop ? 'pointer-events-none' : ''}`}>
      <div
        data-testid="bottom-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-x-0 bottom-0 animate-in fade-in duration-200 ${
          lightBackdrop ? 'top-14 bg-overlay/40 pointer-events-auto' : 'top-0 bg-overlay'
        }`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={{
          bottom: `${inset}px`,
          maxHeight:
            visibleHeight > 0 ? `${Math.floor(visibleHeight * maxHeightShare)}px` : undefined,
          // `translate`, not `transform`, so a drag during the slide-in does not jump.
          translate: dragOffset > 0 ? `0 ${dragOffset}px` : undefined,
        }}
        className={`absolute inset-x-0 ${
          maxHeightShare === MAX_HEIGHT_SHARE ? 'max-h-[85dvh]' : ''
        } ${
          lightBackdrop ? 'shadow-[0_-6px_20px_rgb(0_0_0/0.18)] pointer-events-auto' : ''
        } flex flex-col bg-raised border-t border-line rounded-t-2xl pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200`}
      >
        <div
          data-testid="bottom-sheet-handle"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
          className="flex items-center justify-center min-h-11 shrink-0 cursor-grab touch-none select-none"
        >
          <span className="block h-1 w-10 rounded-full bg-line-strong" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
};
