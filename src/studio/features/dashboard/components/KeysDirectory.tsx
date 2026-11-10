import React from 'react';
import { SelectedElement } from '../types/index.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface KeysDirectoryProps {
  filteredKeys: string[];
  selected: SelectedElement | null;
  localeData: Record<string, string>;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterPageOnly: boolean;
  setFilterPageOnly: (filter: boolean) => void;
  /** The list shows only the texts the edited language still lacks. */
  filterMissing?: boolean;
  /** Turns the Missing scope on or off; the Missing button renders only when set. */
  setFilterMissing?: (filter: boolean) => void;
  /** How many texts the edited language still lacks, on every page. */
  missingCount?: number;
  visibleKeys: string[] | null;
  selectKeyDirectly: (key: string) => void;
  /** Called after a pick made from the keyboard (Enter or Space), not by a pointer click. */
  onKeyActivatedByKeyboard?: (key: string) => void;
  /** Width and flex classes; defaults to the fixed column width. */
  className?: string;
}

export const KeysDirectory = ({
  filteredKeys,
  selected,
  localeData,
  searchTerm,
  setSearchTerm,
  filterPageOnly,
  setFilterPageOnly,
  filterMissing = false,
  setFilterMissing,
  missingCount = 0,
  visibleKeys,
  selectKeyDirectly,
  onKeyActivatedByKeyboard,
  className = 'w-[300px] shrink-0',
}: KeysDirectoryProps) => {
  const { t } = useStudioText();
  const showsAll = !filterPageOnly && !filterMissing;
  return (
    <div
      data-testid="keys-directory"
      className={`${className} bg-raised border border-line rounded-2xl flex flex-col h-full overflow-hidden`}
    >
      <div className="h-14 bg-surface border-b border-line flex items-center justify-between px-6 shrink-0 select-none">
        <h2 className="text-sm font-bold tracking-wide font-heading text-fg">{t('keys.title')}</h2>
        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-raised text-fg border border-line">
          {t('keys.count', { count: filteredKeys.length })}
        </span>
      </div>

      {/* Search Box & Page Filter Toggle */}
      <div className="p-4 border-b border-line shrink-0 bg-raised space-y-3">
        <div className="relative">
          <input
            id="studio-keys-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('keys.search')}
            aria-label={t('keys.search_label')}
            className="w-full h-9 ps-9 pe-4 bg-surface border border-line-strong rounded-lg text-sm text-fg placeholder-fg-muted transition duration-150"
          />
          <svg
            aria-hidden="true"
            className="w-3.5 h-3.5 text-fg-muted absolute start-3 top-2.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Three scopes do not fit beside the label in the 300px column, so the row may wrap. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-muted font-semibold">{t('keys.scope')}</span>
          <div className="flex items-center gap-1 bg-surface border border-line rounded-lg p-0.5 select-none shrink-0">
            <button
              type="button"
              onClick={() => setFilterPageOnly(false)}
              aria-pressed={showsAll}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors duration-150 ${
                showsAll
                  ? 'bg-raised hover:bg-raised-hover text-fg border border-line'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {t('keys.all')}
            </button>
            <button
              type="button"
              onClick={() => setFilterPageOnly(true)}
              aria-pressed={filterPageOnly}
              disabled={visibleKeys === null}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors duration-150 ${
                filterPageOnly
                  ? 'bg-raised hover:bg-raised-hover text-fg border border-line'
                  : 'text-fg-muted hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={visibleKeys === null ? t('keys.page_waiting') : t('keys.page_title')}
            >
              {t('keys.page')}
            </button>
            {setFilterMissing && (
              <button
                type="button"
                data-testid="keys-scope-missing"
                onClick={() => setFilterMissing(true)}
                aria-pressed={filterMissing}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors duration-150 ${
                  filterMissing
                    ? 'bg-raised hover:bg-raised-hover text-fg border border-line'
                    : 'text-fg-muted hover:text-fg'
                }`}
                title={t('keys.missing_title')}
              >
                {t('keys.missing_filter', { count: missingCount })}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Keys list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
        {filteredKeys.length > 0 ? (
          filteredKeys.map((key) => {
            const isActive = selected?.key === key;
            const valueText = localeData[key] || '';
            const isMissing = localeData[key] === undefined;
            return (
              <button
                type="button"
                key={key}
                onClick={(event) => {
                  selectKeyDirectly(key);
                  // A click from Enter or Space carries detail 0; a pointer click counts its presses.
                  if (event.detail === 0) onKeyActivatedByKeyboard?.(key);
                }}
                aria-current={isActive ? 'true' : undefined}
                className={`w-full text-start p-3 rounded-xl border transition duration-150 flex flex-col gap-1.5 ${
                  isActive
                    ? 'relative bg-accent-soft border-accent-line text-fg'
                    : 'bg-surface hover:bg-surface border-transparent text-fg hover:text-fg'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    data-testid="key-row-bar"
                    className="absolute inset-y-2 start-0 w-0.75 rounded-full bg-accent-fg"
                  />
                )}
                <div className="w-full flex items-center justify-between gap-2">
                  <span
                    dir="ltr"
                    className="text-xs font-semibold font-mono break-all line-clamp-2 leading-relaxed text-info-fg"
                  >
                    {key}
                  </span>
                  {isMissing && (
                    <span className="px-1.5 py-0.5 rounded bg-transparent text-xs font-bold text-danger-fg border-[1.5px] border-dashed border-danger-line shrink-0">
                      {t('keys.missing')}
                    </span>
                  )}
                </div>
                <span
                  dir="auto"
                  data-testid="key-row-value"
                  className={`text-sm break-all line-clamp-1 ${isActive ? 'text-fg' : 'text-fg-muted'}`}
                >
                  {valueText || <span className="italic">{t('keys.empty_value')}</span>}
                </span>
              </button>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-fg-muted select-none">
            <svg
              className="w-8 h-8 text-fg-muted mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-xs">
              {filterMissing && searchTerm === '' ? t('keys.none_missing') : t('keys.none')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
