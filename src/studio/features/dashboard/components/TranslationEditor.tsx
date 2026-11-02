import React, { useMemo, useState } from 'react';
import { SelectedElement } from '../types/index.js';
import { extractPlaceholders } from '../../../../core/placeholders.js';
import { parsePluralMessage } from '../../../../core/icu-plural.js';
import { PluralEditor } from './PluralEditor.jsx';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import { studioMessage, type StringKey } from '../../../i18n/catalogue.js';

export interface SaveWarning {
  code: string;
  message: string;
  missing: string[];
  extra: string[];
}

interface TranslationEditorProps {
  selected: SelectedElement;
  inputValue: string;
  /** Active locale, used to pick the plural categories in the structured editor. */
  locale?: string;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
  saveWarning: SaveWarning | null;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onForceSave: () => void;
  onDismissWarning: () => void;
  onClear: () => void;
}

type ChipState = 'present' | 'missing' | 'extra';

const CHIP_STYLES: Record<ChipState, string> = {
  present: 'bg-raised border border-line-strong text-fg',
  missing:
    'bg-transparent border-[1.5px] border-dashed border-danger-line text-danger-fg line-through',
  extra: 'glyph-warn bg-warning-bg border border-warning-line text-warning-fg',
};

const CHIP_TITLES: Record<ChipState, StringKey> = {
  present: 'editor.chip_present',
  missing: 'editor.chip_missing',
  extra: 'editor.chip_extra',
};

export const TranslationEditor = ({
  selected,
  inputValue,
  locale = 'en',
  isLoading,
  isSuccess,
  error,
  saveWarning,
  onInputChange,
  onSave,
  onForceSave,
  onDismissWarning,
  onClear,
}: TranslationEditorProps) => {
  const { t } = useStudioText();
  // Plural messages get a structured editor unless the user switches to raw text.
  const [showRaw, setShowRaw] = useState(false);
  const isPlural = useMemo(() => parsePluralMessage(inputValue) !== null, [inputValue]);
  const usePluralEditor = isPlural && !showRaw;
  const canSave = !isLoading && inputValue !== selected.currentValue;

  // Ctrl+Enter (Cmd+Enter on Mac) saves, exactly as the Save button would. "Save anyway" stays a click.
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (canSave) onSave();
  };

  // Live placeholder parity between the reference text and the current input.
  const chips = useMemo(() => {
    const reference = new Set(extractPlaceholders(selected.fallbackValue || ''));
    const current = new Set(extractPlaceholders(inputValue));
    const list: { token: string; state: ChipState }[] = [];
    for (const token of reference) {
      list.push({ token, state: current.has(token) ? 'present' : 'missing' });
    }
    for (const token of current) {
      if (!reference.has(token)) list.push({ token, state: 'extra' });
    }
    return list;
  }, [selected.fallbackValue, inputValue]);

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
      {/* Key Path Info (RULE STD-003: Read-only display) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
            {t('editor.key')}
          </label>
          <button
            onClick={onClear}
            className="text-[10px] font-medium text-fg-muted hover:text-fg transition duration-200"
          >
            {t('editor.clear')}
          </button>
        </div>
        <div
          dir="ltr"
          className="bg-surface border border-line rounded-xl px-4 py-3 font-mono text-xs text-info-fg select-all break-all leading-relaxed"
        >
          {selected.key}
        </div>
      </div>

      {/* Fallback Reference */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
          {t('editor.reference')}
        </label>
        <div
          dir="auto"
          className="bg-surface border border-line rounded-xl px-4 py-3 text-sm text-fg-muted select-all leading-relaxed whitespace-pre-wrap"
        >
          {selected.fallbackValue || (
            <span className="italic text-fg-muted">{t('editor.reference_none')}</span>
          )}
        </div>
      </div>

      {/* Placeholder parity */}
      {chips.length > 0 && (
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
            {t('editor.placeholders')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {chips.map(({ token, state }) => (
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
        </div>
      )}

      {/* Edit Area */}
      <div className="space-y-2 flex-1 flex flex-col min-h-[180px]" onKeyDown={handleEditKeyDown}>
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
            {usePluralEditor ? t('editor.plural_forms') : t('editor.output')}
          </label>
          <div className="flex items-center gap-3">
            {isPlural && (
              <button
                type="button"
                data-testid="plural-raw-toggle"
                onClick={() => setShowRaw((v) => !v)}
                className="text-[10px] font-semibold text-fg-muted hover:text-fg transition duration-150"
              >
                {showRaw ? t('editor.edit_forms') : t('editor.edit_raw')}
              </button>
            )}
            <span dir="ltr" className="text-[10px] text-fg-muted font-mono">
              {inputValue.length}/10000
            </span>
          </div>
        </div>
        {usePluralEditor ? (
          <PluralEditor
            locale={locale}
            value={inputValue}
            onChange={onInputChange}
            disabled={isLoading}
          />
        ) : (
          <textarea
            id="studio-translation-input"
            dir="auto"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            disabled={isLoading}
            placeholder={t('editor.input_placeholder')}
            className="w-full min-h-32 bg-surface border border-line hover:border-line-strong rounded-xl px-4 py-3 text-sm text-fg placeholder-fg-muted font-sans resize-none transition duration-205 leading-relaxed"
          />
        )}
      </div>

      {/* Placeholder / syntax warning from the server */}
      {saveWarning && (
        <div
          data-testid="save-warning"
          className="bg-warning-bg border border-warning-line rounded-xl p-3 space-y-3"
        >
          <div className="glyph-warn text-xs text-warning-fg leading-relaxed">
            {saveWarning.message}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onForceSave}
              disabled={isLoading}
              className="h-8 px-3 rounded-lg text-[11px] font-semibold text-on-warning bg-warning-solid hover:bg-warning-solid/90 transition duration-150"
            >
              {t('editor.save_anyway')}
            </button>
            <button
              onClick={onDismissWarning}
              className="h-8 px-3 rounded-lg text-[11px] font-semibold text-fg bg-raised border border-line-strong hover:border-line-strong transition duration-150"
            >
              {t('editor.keep_editing')}
            </button>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {error && (
        <div className="bg-danger-bg border border-dashed border-danger-line rounded-xl p-3 flex items-start gap-[0.625rem]">
          <svg
            className="w-4 h-4 text-danger-fg shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-xs text-danger-fg font-mono leading-normal break-all">
            {studioMessage(t, error)}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-4 shrink-0">
        <button
          id="studio-save-button"
          onClick={onSave}
          disabled={!canSave}
          className={`flex-1 h-11 rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2 transition duration-205 ${
            inputValue === selected.currentValue
              ? 'bg-raised text-fg-muted cursor-not-allowed shadow-none border border-line'
              : 'bg-accent hover:bg-accent-hover text-on-accent'
          }`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-on-accent" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>{t('editor.saving')}</span>
            </>
          ) : isSuccess ? (
            <span
              data-testid="save-success"
              className="glyph-done flex items-center gap-1 text-success-fg font-bold"
            >
              <span>{t('editor.saved')}</span>
            </span>
          ) : (
            <span>{t('editor.save')}</span>
          )}
        </button>
      </div>
    </div>
  );
};
