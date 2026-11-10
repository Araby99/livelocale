import React, { useEffect, useId, useRef, useState } from 'react';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import type { StringKey } from '../../../i18n/catalogue.js';

/** How long the "tap any text" hint stays up. */
export const TAP_HINT_MS = 4000;
/** How long the notice for a tap on text without a key stays up. */
export const UNKEYED_NOTICE_MS = 3000;

// At least 44 x 44 px per option, so a thumb hits it.
const OPTION =
  'min-h-11 min-w-11 px-4 inline-flex items-center justify-center rounded-lg text-xs font-semibold cursor-pointer transition duration-150';
const CHECKED = 'bg-accent-soft text-accent-fg';
const UNCHECKED = 'text-fg-muted hover:text-fg';

/**
 * The Edit / Browse switch. In Edit a tap or click on the site selects text and the site does
 * not react; in Browse the site works as it does without LiveLocale (Alt+Click still picks).
 */
export const EditBrowseSwitch = ({
  editMode,
  onChange,
  pointer = 'touch',
}: {
  editMode: boolean;
  onChange(on: boolean): void;
  /** `mouse` names the switch for clicking instead of tapping. */
  pointer?: 'touch' | 'mouse';
}) => {
  const { t } = useStudioText();
  const name = useId();
  const options: ReadonlyArray<readonly [on: boolean, label: StringKey]> = [
    [true, 'touch.edit'],
    [false, 'touch.browse'],
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t(pointer === 'mouse' ? 'edit.mode_label' : 'touch.mode_label')}
      data-testid="edit-browse-switch"
      className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-raised border border-line select-none"
    >
      {options.map(([on, label]) => (
        <label key={label} className={`${OPTION} ${on === editMode ? CHECKED : UNCHECKED}`}>
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={on === editMode}
            onChange={() => onChange(on)}
          />
          {t(label)}
        </label>
      ))}
    </div>
  );
};

/**
 * The polite notice of a touch device: the one-time "tap any text" hint the first time Edit is
 * on in this Studio load, and a short note each time a tap lands on text without a key. Keep it
 * mounted for the whole load so the hint shows only once.
 */
export const TapNotice = ({
  editMode,
  unkeyedTapSeq,
  placement = 'default',
  hidden = false,
  pointer = 'touch',
}: {
  editMode: boolean;
  unkeyedTapSeq: number;
  /** `mouse` says "click" in the first hint instead of "tap". */
  pointer?: 'touch' | 'mouse';
  /** `phone` lifts it above the phone's bottom bar (the Edit / Browse switch). */
  placement?: 'default' | 'phone';
  /** Keeps a message out of sight (a sheet is open); the live region still announces it. */
  hidden?: boolean;
}) => {
  const { t } = useStudioText();
  const [message, setMessage] = useState<StringKey | null>(null);
  const hintShown = useRef(false);
  const lastTapSeq = useRef(unkeyedTapSeq);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (key: StringKey, ms: number) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setMessage(key);
    timer.current = setTimeout(() => {
      timer.current = null;
      setMessage(null);
    }, ms);
  };

  useEffect(() => {
    if (!editMode || hintShown.current) return;
    hintShown.current = true;
    show(pointer === 'mouse' ? 'edit.hint_click' : 'touch.hint', TAP_HINT_MS);
  }, [editMode]);

  useEffect(() => {
    if (unkeyedTapSeq <= lastTapSeq.current) return;
    lastTapSeq.current = unkeyedTapSeq;
    show('touch.unkeyed', UNKEYED_NOTICE_MS);
  }, [unkeyedTapSeq]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  // The live region stays in the tree so a screen reader announces each new message.
  return (
    <div
      className={`fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none ${
        placement === 'phone' ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'bottom-6'
      }`}
    >
      <p
        role="status"
        aria-live="polite"
        data-testid="tap-notice"
        className={
          message === null || hidden
            ? 'sr-only'
            : 'max-w-sm px-4 py-2 rounded-xl bg-raised border border-line-strong text-xs text-fg text-center'
        }
      >
        {message === null ? '' : t(message)}
      </p>
    </div>
  );
};
