import React, { useMemo, useState } from 'react';
import { SelectedElement } from '../types/index.js';
import { extractPlaceholders } from '../../../../core/placeholders.js';
import { parsePluralMessage } from '../../../../core/icu-plural.js';
import { PluralEditor } from './PluralEditor.jsx';

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
  present: 'bg-slate-800/80 border-slate-700 text-slate-300',
  missing: 'bg-rose-500/10 border-rose-500/40 text-rose-300 line-through',
  extra: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
};

const CHIP_TITLES: Record<ChipState, string> = {
  present: 'Placeholder from the reference, present in your translation',
  missing: 'Placeholder from the reference is missing from your translation',
  extra: 'Placeholder not present in the reference',
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
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Translation Key
          </label>
          <button
            onClick={onClear}
            className="text-[10px] font-medium text-slate-500 hover:text-slate-300 transition duration-200"
          >
            Clear Selection
          </button>
        </div>
        <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-3 font-mono text-xs text-indigo-400 select-all break-all shadow-inner leading-relaxed">
          {selected.key}
        </div>
      </div>

      {/* Fallback Reference */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Reference (Fallback Value)
        </label>
        <div
          dir="auto"
          className="bg-slate-950/40 border border-slate-850 rounded-xl px-4 py-3 text-sm text-slate-400 select-all leading-relaxed whitespace-pre-wrap"
        >
          {selected.fallbackValue || <span className="italic text-slate-600">None</span>}
        </div>
      </div>

      {/* Placeholder parity */}
      {chips.length > 0 && (
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Placeholders
          </label>
          <div className="flex flex-wrap gap-1.5">
            {chips.map(({ token, state }) => (
              <span
                key={token}
                data-testid={`placeholder-${token}`}
                data-state={state}
                title={CHIP_TITLES[state]}
                className={`px-2 py-0.5 rounded-md border text-[10px] font-mono ${CHIP_STYLES[state]}`}
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
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {usePluralEditor ? 'Plural forms' : 'Translation Output'}
          </label>
          <div className="flex items-center gap-3">
            {isPlural && (
              <button
                type="button"
                data-testid="plural-raw-toggle"
                onClick={() => setShowRaw((v) => !v)}
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition duration-150"
              >
                {showRaw ? 'Edit forms' : 'Edit raw'}
              </button>
            )}
            <span className="text-[10px] text-slate-500 font-mono">{inputValue.length}/10000</span>
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
            placeholder="Type your translation here..."
            className="w-full min-h-32 bg-slate-950 border border-slate-800 hover:border-slate-750 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 font-sans resize-none transition duration-205 shadow-inner leading-relaxed"
          />
        )}
      </div>

      {/* Placeholder / syntax warning from the server */}
      {saveWarning && (
        <div
          data-testid="save-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-3"
        >
          <div className="text-xs text-amber-200 leading-relaxed">{saveWarning.message}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onForceSave}
              disabled={isLoading}
              className="h-8 px-3 rounded-lg text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-500 active:bg-amber-700 transition duration-150"
            >
              Save anyway
            </button>
            <button
              onClick={onDismissWarning}
              className="h-8 px-3 rounded-lg text-[11px] font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:border-slate-600 transition duration-150"
            >
              Keep editing
            </button>
          </div>
        </div>
      )}

      {/* Feedback Messages */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-[0.625rem] shadow-xs">
          <svg
            className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"
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
          <div className="text-xs text-rose-400 font-mono leading-normal break-all">{error}</div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-4 shrink-0">
        <button
          id="studio-save-button"
          onClick={onSave}
          disabled={!canSave}
          className={`flex-1 h-11 rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2 shadow-sm transition duration-205 ${
            inputValue === selected.currentValue
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-slate-850'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white active:bg-indigo-700'
          }`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-indigo-200" fill="none" viewBox="0 0 24 24">
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
              <span>Saving...</span>
            </>
          ) : isSuccess ? (
            <span
              data-testid="save-success"
              className="flex items-center gap-1 text-emerald-400 font-bold"
            >
              <svg
                className="w-4 h-4 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>Saved!</span>
            </span>
          ) : (
            <span>Save Changes</span>
          )}
        </button>
      </div>
    </div>
  );
};
