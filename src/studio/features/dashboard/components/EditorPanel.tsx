import React, { useState, type ReactNode } from 'react';
import { SelectedElement } from '../types/index.js';
import { TranslationEditor, type SaveWarning } from './TranslationEditor.jsx';
import { EmptySelection } from './EmptySelection.jsx';
import { LocaleManager } from './LocaleManager.jsx';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import { getLocaleLabel } from '../locale-names.js';
import type { KeyJumpNote } from '../hooks/useKeyJump.js';

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
  /** The project's source language: named above the text being edited, and never deleted here. */
  referenceLocale?: string;
  /** A plain click picks text on the page (tap-to-edit), so the empty state says so. */
  clickToEdit?: boolean;
  /** Browse is on and the Edit switch is there, so the empty state names it. */
  canSwitchToEdit?: boolean;
  /** Share link: Save keeps the change in this browser until it is sent, and the editor says so. */
  keepsInBrowser?: boolean;
  /** Said under the key when the text picked from the Keys list is not visible on this page. */
  jumpNote?: KeyJumpNote | null;
  /** The Next missing control, shown beside Save. */
  nextMissing?: ReactNode;
  /** Width and flex classes; defaults to the fixed column width. */
  className?: string;
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
  jumpNote = null,
  nextMissing,
  referenceLocale = 'en',
  clickToEdit = false,
  canSwitchToEdit = false,
  keepsInBrowser = false,
  className = 'w-[420px] shrink-0',
}: EditorPanelProps) => {
  const { t } = useStudioText();
  const [isManageOpen, setIsManageOpen] = useState(false);

  return (
    <div
      data-testid="editor-panel"
      className={`${className} bg-raised border border-line rounded-2xl flex flex-col h-full overflow-hidden`}
    >
      {/* Panel Header */}
      <div className="h-14 bg-surface border-b border-line flex items-center justify-between px-6 shrink-0 select-none">
        <h2 className="text-sm font-bold tracking-wide font-heading text-fg">
          {isManageOpen ? t('editor.manage') : t('editor.title')}
        </h2>

        {/* Language select & Manage toggler */}
        <div className="flex items-center gap-2">
          {!isManageOpen && (
            <>
              <label htmlFor="studio-locale-select" className="text-xs font-semibold text-fg-muted">
                {t('editor.locale')}
              </label>
              <select
                id="studio-locale-select"
                value={locale}
                dir="ltr"
                onChange={(e) => onLocaleChange(e.target.value)}
                className="bg-raised border border-line-strong text-fg text-xs rounded-lg px-2.5 py-1.5 cursor-pointer"
              >
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {getLocaleLabel(l, t)}
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            type="button"
            data-testid="manage-languages-toggle"
            onClick={() => setIsManageOpen(!isManageOpen)}
            className={`p-1.5 rounded-lg border transition duration-200 ${
              isManageOpen
                ? 'bg-accent-soft border-accent-line text-accent-fg'
                : 'bg-raised border-line text-fg-muted hover:text-fg hover:border-line-strong'
            }`}
            aria-label={isManageOpen ? t('editor.back') : t('editor.manage')}
            title={isManageOpen ? t('editor.back') : t('editor.manage')}
          >
            {isManageOpen ? (
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
          sourceLocale={referenceLocale}
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
          locale={locale}
          referenceLocale={referenceLocale}
          keepsInBrowser={keepsInBrowser}
          isLoading={isLoading}
          isSuccess={isSuccess}
          error={error}
          saveWarning={saveWarning}
          onInputChange={onInputChange}
          onSave={onSave}
          onForceSave={onForceSave}
          onDismissWarning={onDismissWarning}
          onClear={onClear}
          jumpNote={jumpNote}
          nextMissing={nextMissing}
        />
      ) : (
        <EmptySelection clickToEdit={clickToEdit} canSwitchToEdit={canSwitchToEdit} />
      )}
    </div>
  );
};
