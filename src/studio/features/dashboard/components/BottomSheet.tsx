import React, { useRef, useState, type ReactNode } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { useKeyboardInset } from '../hooks/useKeyboardInset.js';

/** A drag on the handle longer than this many px closes the sheet. */
export const CLOSE_DRAG_PX = 80;
/** A downward flick faster than this many px per ms closes the sheet, however short. */
const CLOSE_FLICK_SPEED = 0.5;
/** A flick must still move at least this far, so a tap on the handle never closes. */
const MIN_FLICK_PX = 16;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** The id of the element that names the sheet, usually its heading. */
  labelledBy: string;
  children: ReactNode;
}

/**
 * A modal sheet that slides up from the bottom of the screen over a dimmed page.
 * Tapping the dimmed page, Escape, or dragging the handle down closes it. The
 * sheet sits directly above the phone keyboard while one is open.
 */
export const BottomSheet = ({ open, onClose, labelledBy, children }: BottomSheetProps) => {
  const dialogRef = useDialog<HTMLDivElement>(open, onClose);
  const inset = useKeyboardInset();
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
    <div className="fixed inset-0 z-50">
      <div
        data-testid="bottom-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-overlay animate-in fade-in duration-200"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={{
          bottom: `${inset}px`,
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        }}
        className="absolute inset-x-0 max-h-[85dvh] flex flex-col bg-raised border-t border-line rounded-t-2xl pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200"
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
