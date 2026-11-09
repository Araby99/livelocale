import React, { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SelectedElement } from '../types/index.js';
import { parsePluralMessage } from '../../../../core/icu-plural.js';
import { PluralEditor } from './PluralEditor.jsx';
import {
  CHIP_STYLES,
  CHIP_TITLES,
  usePlaceholderChips,
  type SaveWarning,
} from './TranslationEditor.jsx';
import { TRANSLATION_INPUT_ID } from '../constants.js';
import { useSaveFocus } from '../hooks/useSaveFocus.js';
import { getLocaleLabel, getLocaleName } from '../locale-names.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import { studioMessage } from '../../../i18n/catalogue.js';
import { KeyJumpNote } from './KeyJumpNote.jsx';
import type { KeyJumpNote as JumpNote } from '../hooks/useKeyJump.js';

/** The server refuses longer values; the count shows once the text gets close. */
const MAX_CHARS = 10000;
const COUNT_FROM = 9000;
/** The field grows with its text up to this many CSS px, then scrolls. */
const FIELD_MAX_PX = 160;

interface PhoneEditorProps {
  selected: SelectedElement;
  inputValue: string;
  /** The locale being edited, shown as a chip; it is switched from the top bar. */
  locale: string;
  /** The locale the reference text is in. */
  referenceLocale: string;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
  saveWarning: SaveWarning | null;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onForceSave: () => void;
  onDismissWarning: () => void;
  /** Shown next to Save (Next missing); its status line spans the row above. */
  nextMissing?: ReactNode;
  /** Said under the key when the text picked from the Keys list is not visible on this page. */
  jumpNote?: JumpNote | null;
}

const LABEL = 'text-[10px] font-semibold text-fg-muted uppercase tracking-wider';

/**
 * The phone's editor: only what fixing one text needs, compact enough that most of the page
 * stays visible above the sheet and updates as the person types.
 */
export const PhoneEditor = ({
  selected,
  inputValue,
  locale,
  referenceLocale,
  isLoading,
  isSuccess,
  error,
  saveWarning,
  onInputChange,
  onSave,
  onForceSave,
  onDismissWarning,
  nextMissing,
  jumpNote = null,
}: PhoneEditorProps) => {
  const { t } = useStudioText();
  const referenceId = useId();
  const [showRaw, setShowRaw] = useState(false);
  const isPlural = useMemo(() => parsePluralMessage(inputValue) !== null, [inputValue]);
  const usePluralEditor = isPlural && !showRaw;
  const canSave = !isLoading && inputValue !== selected.currentValue;
  const { rootRef, startSave } = useSaveFocus<HTMLDivElement>(isLoading);
  const chips = usePlaceholderChips(selected.fallbackValue || '', inputValue);
  const flagged = chips.filter((chip) => chip.state !== 'present');

  // The reference is clamped to three lines; the toggle shows only when that hides text.
  const reference = selected.fallbackValue;
  const showReference = locale !== referenceLocale && reference !== '';
  const referenceRef = useRef<HTMLParagraphElement>(null);
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);
  const [isReferenceClamped, setIsReferenceClamped] = useState(false);
  useLayoutEffect(() => {
    setIsReferenceOpen(false);
  }, [selected.key]);
  useLayoutEffect(() => {
    const el = referenceRef.current;
    if (!el || isReferenceOpen) return;
    setIsReferenceClamped(el.scrollHeight > el.clientHeight + 1);
  }, [reference, isReferenceOpen, showReference]);

  // The field starts at two lines and grows with its text up to a cap.
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, FIELD_MAX_PX)}px`;
  }, [inputValue, usePluralEditor]);

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (canSave) startSave(onSave);
  };

  return (
    <div ref={rootRef} data-testid="phone-editor" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span dir="ltr" className="min-w-0 truncate font-mono text-xs text-info-fg">
          {selected.key}
        </span>
        <span
          dir="ltr"
          className="shrink-0 px-2 py-0.5 rounded-full border border-line-strong text-[11px] text-fg-muted"
        >
          {getLocaleLabel(locale, t)}
        </span>
      </div>
      <KeyJumpNote note={jumpNote} />

      {showReference && (
        <div className="space-y-1">
          <span id={referenceId} className={LABEL}>
            {getLocaleName(referenceLocale, t)}
          </span>
          <p
            ref={referenceRef}
            data-testid="phone-editor-reference"
            aria-labelledby={referenceId}
            dir="auto"
            className={`text-sm text-fg-muted leading-snug whitespace-pre-wrap break-words select-text ${
              isReferenceOpen ? '' : 'line-clamp-3'
            }`}
          >
            {reference}
          </p>
          {(isReferenceClamped || isReferenceOpen) && (
            <button
              type="button"
              onClick={() => setIsReferenceOpen((open) => !open)}
              aria-expanded={isReferenceOpen}
              className="min-h-8 -my-1 text-xs font-semibold text-fg-muted hover:text-fg"
            >
              {isReferenceOpen ? t('phone.less') : t('phone.more')}
            </button>
          )}
        </div>
      )}

      <div className="space-y-1" onKeyDown={handleEditKeyDown}>
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>
            {getLocaleName(locale, t)}
            {inputValue === '' && (
              <span data-testid="phone-editor-missing" className="text-danger-fg normal-case">
                {` · ${t('phone.missing')}`}
              </span>
            )}
          </span>
          <span className="flex items-center gap-3">
            {isPlural && (
              <button
                type="button"
                data-testid="plural-raw-toggle"
                onClick={() => setShowRaw((v) => !v)}
                className="min-h-8 text-[11px] font-semibold text-fg-muted hover:text-fg"
              >
                {showRaw ? t('editor.edit_forms') : t('editor.edit_raw')}
              </button>
            )}
            {inputValue.length >= COUNT_FROM && (
              <span dir="ltr" className="text-[10px] text-warning-fg font-mono">
                {`${inputValue.length}/${MAX_CHARS}`}
              </span>
            )}
          </span>
        </div>
        {usePluralEditor ? (
          <PluralEditor
            locale={locale}
            value={inputValue}
            onChange={onInputChange}
            disabled={isLoading}
            variant="sheet"
          />
        ) : (
          <textarea
            ref={fieldRef}
            id={TRANSLATION_INPUT_ID}
            aria-label={t('editor.translation_label')}
            dir="auto"
            rows={2}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            disabled={isLoading}
            placeholder={t('editor.input_placeholder')}
            style={{ maxHeight: FIELD_MAX_PX }}
            className="block w-full bg-surface border border-accent-line rounded-xl px-3 py-2 text-base text-fg placeholder-fg-muted font-sans resize-none leading-snug overflow-y-auto"
          />
        )}
        {flagged.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {flagged.map(({ token, state }) => (
              <span
                key={token}
                data-testid={`placeholder-${token}`}
                data-state={state}
                dir="ltr"
                title={t(CHIP_TITLES[state])}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono ${CHIP_STYLES[state]}`}
              >
                {token}
              </span>
            ))}
          </div>
        )}
      </div>

      {saveWarning && (
        <div
          data-testid="save-warning"
          role="alert"
          className="bg-warning-bg border border-warning-line rounded-xl px-3 py-2 space-y-2"
        >
          <div className="glyph-warn text-xs text-warning-fg leading-snug">
            {saveWarning.message}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startSave(onForceSave)}
              disabled={isLoading}
              className="min-h-11 px-3 rounded-lg text-xs font-semibold text-on-warning bg-warning-solid hover:bg-warning-solid/90"
            >
              {t('editor.save_anyway')}
            </button>
            <button
              type="button"
              onClick={onDismissWarning}
              className="min-h-11 px-3 rounded-lg text-xs font-semibold text-fg bg-raised border border-line-strong"
            >
              {t('editor.keep_editing')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="bg-danger-bg border border-dashed border-danger-line rounded-xl px-3 py-2 text-xs text-danger-fg leading-snug break-words"
        >
          {studioMessage(t, error)}
        </p>
      )}

      <p role="status" className="sr-only" data-testid="save-status">
        {isSuccess ? t('editor.saved_status') : ''}
      </p>

      <div data-testid="phone-editor-actions" className="flex flex-wrap items-center gap-2">
        {nextMissing}
        <button
          type="button"
          id="studio-save-button"
          onClick={() => startSave(onSave)}
          disabled={!canSave}
          className={`flex-1 min-h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition duration-150 ${
            canSave || isLoading || isSuccess
              ? 'bg-accent hover:bg-accent-hover text-on-accent'
              : 'bg-accent text-on-accent opacity-40 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            t('editor.saving')
          ) : isSuccess ? (
            <span data-testid="save-success" className="glyph-done font-bold">
              {t('editor.saved')}
            </span>
          ) : (
            t('phone.save')
          )}
        </button>
      </div>
    </div>
  );
};
