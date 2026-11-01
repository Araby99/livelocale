import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const MODAL_SELECTOR = '[aria-modal="true"]';

/** True when `el` is the last open modal in the document, which is the one painted on top. */
function isTopmost(el: HTMLElement): boolean {
  const modals = document.querySelectorAll(MODAL_SELECTOR);
  return modals.length === 0 || modals[modals.length - 1] === el;
}

/**
 * Keyboard support for a modal dialog: while `open`, focus moves to its first
 * control, Tab and Shift+Tab stay inside it, and Escape calls `onEscape` (when
 * given) and marks the event handled with `preventDefault`. On close, focus
 * goes back to the element that had it before. Attach the returned ref to the
 * element that carries `aria-modal="true"`.
 */
export function useDialog<T extends HTMLElement>(
  open: boolean,
  onEscape?: () => void
): RefObject<T> {
  const ref = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const dialog = ref.current;
    if (!open || dialog === null) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const focusFirst = () => {
      const first = controls()[0];
      if (first) {
        first.focus();
      } else {
        if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
        dialog.focus();
      }
    };
    focusFirst();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isTopmost(dialog)) return;
      if (event.key === 'Escape') {
        const close = onEscapeRef.current;
        if (!close) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = controls();
      const active = document.activeElement;
      if (list.length === 0 || !dialog.contains(active)) {
        event.preventDefault();
        if (event.shiftKey && list.length > 0) list[list.length - 1]!.focus();
        else focusFirst();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return ref;
}
