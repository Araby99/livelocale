// The small editor that opens on a mistake: the whole string in a textarea, Enter saves,
// Shift+Enter adds a newline, Escape cancels. It sits under the mistake inside the hero copy and
// never runs past the copy's edges, so a 360 px phone does not scroll sideways.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface EditPopoverProps {
  initial: string;
  anchor: HTMLElement;
  container: HTMLElement;
  onSave: (value: string) => void;
  /** Escape: close and give focus back to the mistake. */
  onCancel: () => void;
  /** The visitor clicked or tabbed elsewhere: close and leave focus where it went. */
  onDismiss: () => void;
}

export function EditPopover({
  initial,
  anchor,
  container,
  onSave,
  onCancel,
  onDismiss,
}: EditPopoverProps) {
  const [value, setValue] = useState(initial);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = container.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    const width = ref.current?.offsetWidth ?? 0;
    const left = Math.max(0, Math.min(at.left - box.left, box.width - width));
    setPosition({ top: at.bottom - box.top + 8, left });
  }, [anchor, container]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onDismiss]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };
  const onTextKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    onSave(value);
  };

  return (
    <div
      ref={ref}
      className="edit-popover"
      role="dialog"
      aria-label="Edit text"
      style={{ top: position.top, left: position.left }}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (next instanceof Node && !e.currentTarget.contains(next)) onDismiss();
      }}
    >
      <textarea
        value={value}
        rows={3}
        autoFocus
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onTextKeyDown}
      />
      <div className="edit-popover-actions">
        <span className="edit-popover-keys">Enter saves · Esc cancels</span>
        <button type="button" className="button" onClick={() => onSave(value)}>
          Save
        </button>
      </div>
    </div>
  );
}
