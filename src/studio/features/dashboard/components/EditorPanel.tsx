import React, { useState } from 'react';
import { SelectedElement } from '../types/index.js';
import { TranslationEditor, type SaveWarning } from './TranslationEditor.jsx';
import { EmptySelection } from './EmptySelection.jsx';
import { LocaleManager } from './LocaleManager.jsx';

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  ja: 'Japanese',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  hi: 'Hindi',
  tr: 'Turkish',
};

const getLocaleLabel = (code: string) => {
  const base = code.split('-')[0]?.toLowerCase() || code;
  const name = LOCALE_NAMES[base] || LOCALE_NAMES[code] || 'Custom';
  return `${name} (${code})`;
};

interface EditorPanelProps {
  selected: SelectedElement | null;
  inputValue: string;
  locale: string;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
  saveWarning: SaveWarning | null;
  onInputChange: (value: string) => void;
  onLocaleChange: (locale: string) => void;
  onSave: () => void;
  onForceSave: () => void;
  onDismissWarning: () => void;
  onClear: () => void;
  locales: string[];
  onAddLocale: (newLocale: string) => Promise<void>;
  onRenameLocale: (oldLocale: string, newLocale: string) => Promise<void>;
  onDeleteLocale: (locale: string) => Promise<void>;
}

/**
 * Shell for the right-hand panel: toggles between the translation editor
 * and the locale management view.
 */
export const EditorPanel = ({
  selected,
  inputValue,
  locale,
  isLoading,
  isSuccess,
  error,
  saveWarning,
  onInputChange,
  onLocaleChange,
  onSave,
  onForceSave,
  onDismissWarning,
  onClear,
  locales,
  onAddLocale,
  onRenameLocale,
  onDeleteLocale,
}: EditorPanelProps) => {
  const [isManageOpen, setIsManageOpen] = useState(false);

  return (
    <div className="w-[420px] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-full shadow-2xl overflow-hidden shrink-0">
      {/* Panel Header */}
      <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 select-none">
        <h2 className="text-sm font-bold tracking-wide font-outfit text-slate-200">
          {isManageOpen ? 'Manage Languages' : 'Translation Studio'}
        </h2>

        {/* Language select & Manage toggler */}
        <div className="flex items-center gap-2">
          {!isManageOpen && (
            <>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Locale
              </label>
              <select
                value={locale}
                onChange={(e) => onLocaleChange(e.target.value)}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50 cursor-pointer font-mono"
              >
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {getLocaleLabel(l)}
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            onClick={() => setIsManageOpen(!isManageOpen)}
            className={`p-1.5 rounded-lg border transition duration-200 ${
              isManageOpen
                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
            title={isManageOpen ? 'Back to Editor' : 'Manage Languages'}
          >
            {isManageOpen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Editor Body or Language Manager Body */}
      {isManageOpen ? (
        <LocaleManager
          locale={locale}
          locales={locales}
          isLoading={isLoading}
          error={error}
          onAddLocale={onAddLocale}
          onRenameLocale={onRenameLocale}
          onDeleteLocale={onDeleteLocale}
        />
      ) : selected ? (
        <TranslationEditor
          selected={selected}
          inputValue={inputValue}
          isLoading={isLoading}
          isSuccess={isSuccess}
          error={error}
          saveWarning={saveWarning}
          onInputChange={onInputChange}
          onSave={onSave}
          onForceSave={onForceSave}
          onDismissWarning={onDismissWarning}
          onClear={onClear}
        />
      ) : (
        <EmptySelection />
      )}
    </div>
  );
};
