import React from 'react';
import { SelectedElement } from '../types/index.js';

interface KeysDirectoryProps {
  filteredKeys: string[];
  selected: SelectedElement | null;
  localeData: Record<string, string>;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterPageOnly: boolean;
  setFilterPageOnly: (filter: boolean) => void;
  visibleKeys: string[] | null;
  selectKeyDirectly: (key: string) => void;
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
  visibleKeys,
  selectKeyDirectly,
  className = 'w-[300px] shrink-0',
}: KeysDirectoryProps) => {
  return (
    <div
      data-testid="keys-directory"
      className={`${className} bg-raised border border-line rounded-2xl flex flex-col h-full shadow-2xl overflow-hidden`}
    >
      <div className="h-14 bg-surface border-b border-line flex items-center justify-between px-6 shrink-0 select-none">
        <h2 className="text-sm font-bold tracking-wide font-heading text-fg">Locale Directory</h2>
        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-raised text-fg border border-line">
          {filteredKeys.length} keys
        </span>
      </div>

      {/* Search Box & Page Filter Toggle */}
      <div className="p-4 border-b border-line shrink-0 bg-raised space-y-3">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search keys or values..."
            className="w-full h-9 ps-9 pe-4 bg-surface border border-line hover:border-line-strong focus:border-focus focus:outline-hidden focus:ring-1 focus:ring-focus rounded-lg text-xs text-fg placeholder-fg-muted transition duration-150"
          />
          <svg
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

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-fg-muted font-semibold uppercase tracking-wider">
            Scope
          </span>
          <div className="flex items-center gap-1 bg-surface border border-line rounded-lg p-0.5 select-none shrink-0">
            <button
              onClick={() => setFilterPageOnly(false)}
              className={`px-2.5 py-1 text-[9px] font-bold rounded-md transition duration-150 ${
                !filterPageOnly
                  ? 'bg-raised hover:bg-raised-hover text-fg border border-line shadow-sm'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              All Keys
            </button>
            <button
              onClick={() => setFilterPageOnly(true)}
              disabled={visibleKeys === null}
              className={`px-2.5 py-1 text-[9px] font-bold rounded-md transition duration-150 ${
                filterPageOnly
                  ? 'bg-raised hover:bg-raised-hover text-fg border border-line shadow-sm'
                  : 'text-fg-muted hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={
                visibleKeys === null
                  ? 'Waiting for preview connection...'
                  : 'Only show keys on the current page'
              }
            >
              Page Keys
            </button>
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
                key={key}
                onClick={() => selectKeyDirectly(key)}
                className={`w-full text-start p-3 rounded-xl border transition duration-150 flex flex-col gap-1.5 ${
                  isActive
                    ? 'bg-accent-soft border-accent-line text-fg shadow-sm'
                    : 'bg-surface hover:bg-surface border-transparent text-fg hover:text-fg'
                }`}
              >
                <div className="w-full flex items-center justify-between gap-2">
                  <span
                    dir="ltr"
                    className="text-[11px] font-semibold font-mono break-all line-clamp-2 leading-relaxed text-fg"
                  >
                    {key}
                  </span>
                  {isMissing && (
                    <span className="px-1.5 py-0.5 rounded bg-danger-bg text-[8px] font-extrabold text-danger-fg border border-danger-line shrink-0 uppercase tracking-wider">
                      Missing
                    </span>
                  )}
                </div>
                <span dir="auto" className="text-[10px] text-fg-muted break-all line-clamp-1">
                  {valueText || <span className="italic text-fg-muted">Empty</span>}
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
            <span className="text-xs">No keys found</span>
          </div>
        )}
      </div>
    </div>
  );
};
