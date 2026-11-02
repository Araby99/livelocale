import React from 'react';
import type { LiveLocaleMode } from '../../../api.js';
import { unsentLabel } from '../hooks/useDrafts.js';
import { BrandMark } from './BrandMark.js';
import type { LocaleSource } from '../../../locale-inference.js';

// Injected by Vite at build/dev time from package.json version (see vite.config.ts).
declare const __STUDIO_VERSION__: string;

interface HeaderProps {
  coveragePercentage: number;
  /** Reported by the app's API; `preview` means a hosted, token-protected session. */
  mode?: LiveLocaleMode | null;
  changesCount: number;
  isChangesOpen: boolean;
  onToggleChanges: () => void;
  /** Share-link drafts not sent yet; the counter shows only when above zero. */
  unsentCount?: number;
  /** The locale share-link edits are written to; null or absent on server stacks. */
  targetLocale?: { locale: string; source: LocaleSource | null; mismatch: string | null } | null;
  /** The listed locales; a mismatch is offered only for one of them. */
  locales?: string[];
  onChooseLocale?: (locale: string) => void;
  /** Whether there is anything to send; the Send button is disabled otherwise. */
  canSend?: boolean;
  /** Opens the Send dialog; the Send button renders only when set (static mode). */
  onSend?: () => void;
  /** The number of edits in the open change link; null or absent until a review has opened. */
  reviewCount?: number | null;
  /**
   * True while Review mode is shown, including while a change link opens and after it fails
   * to open; defaults to whether `reviewCount` is set.
   */
  isReviewing?: boolean;
  /** Leaves Review mode; the "Close review" button renders only while reviewing. */
  onCloseReview?: () => void;
  /** Opens the Import change link dialog; the button renders only in development mode. */
  onImport?: () => void;
  /** Header settings (language, then theme); always visible, rendered only when set. */
  settings?: React.ReactNode;
}

const reviewingLabel = (n: number) =>
  n === 1 ? 'Reviewing 1 proposed change' : `Reviewing ${n} proposed changes`;

const SOURCE_HINTS: Record<LocaleSource, string> = {
  content: 'detected from page text',
  url: 'from the page address',
  manual: 'chosen by you',
  remembered: 'from your last visit',
};

export const Header = ({
  coveragePercentage,
  mode,
  changesCount,
  isChangesOpen,
  onToggleChanges,
  unsentCount = 0,
  targetLocale = null,
  locales,
  onChooseLocale,
  canSend = false,
  onSend,
  reviewCount = null,
  isReviewing = reviewCount !== null,
  onCloseReview,
  onImport,
  settings,
}: HeaderProps) => {
  const mismatch =
    targetLocale?.mismatch && (!locales || locales.includes(targetLocale.mismatch))
      ? targetLocale.mismatch
      : null;

  return (
    <header className="h-16 bg-surface/90 backdrop-blur-md border-b border-line px-4 xl:px-8 flex items-center justify-between gap-4 shrink-0 select-none">
      <div className="flex items-center gap-3 shrink-0">
        <BrandMark className="h-8 w-8 shrink-0" />
        <div>
          <h1 className="text-base font-extrabold font-heading text-fg">livelocale</h1>
          <p className="hidden xl:block text-[10px] text-fg-muted font-medium tracking-wider uppercase mt-0.5">
            Live Visual Translation Studio
          </p>
        </div>
      </div>

      {/* Coverage progress bar + version badge. Below xl the hints and Coverage hide and the
          locale chip shrinks first, so Send to developer and Changes always stay on screen. */}
      <div className="flex items-center justify-end gap-3 xl:gap-5 min-w-0">
        {targetLocale && (
          <div
            data-testid="target-locale"
            className="flex items-center gap-2 select-none min-w-0 overflow-hidden"
          >
            {targetLocale.source === null ? (
              <span className="px-2.5 py-1 rounded-full bg-raised border border-line text-[10px] font-semibold text-fg-muted whitespace-nowrap truncate min-w-0">
                Language: not chosen yet
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-soft border border-accent-line text-[10px] whitespace-nowrap min-w-0">
                <span
                  dir="ltr"
                  className="font-bold text-accent-fg"
                >{`${isReviewing ? 'Viewing' : 'Editing'}: ${targetLocale.locale}`}</span>
                <span className="hidden xl:inline text-fg-muted">
                  {SOURCE_HINTS[targetLocale.source]}
                </span>
              </span>
            )}
            {mismatch && (
              <span className="flex items-center gap-1.5 text-[10px] text-warning-fg whitespace-nowrap shrink-0">
                <span className="hidden xl:inline">{`This text looks like ${mismatch}.`}</span>
                <button
                  type="button"
                  onClick={() => onChooseLocale?.(mismatch)}
                  title={`This text looks like ${mismatch}.`}
                  className="px-2 py-0.5 rounded-md bg-warning-bg border border-warning-line font-semibold hover:bg-warning-bg transition duration-150"
                >
                  {`Switch to ${mismatch}`}
                </button>
              </span>
            )}
          </div>
        )}

        {/* Translation coverage metric */}
        <div
          className={`items-center gap-2.5 shrink-0 ${targetLocale ? 'hidden xl:flex' : 'flex'}`}
          title={`${coveragePercentage}% of keys translated`}
        >
          <span className="text-[10px] text-fg-muted font-medium select-none whitespace-nowrap">
            Coverage
          </span>
          <div className="w-16 xl:w-28 h-1.5 bg-raised rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                coveragePercentage >= 80
                  ? 'bg-success-fg'
                  : coveragePercentage >= 40
                    ? 'bg-warning-fg'
                    : 'bg-danger-fg'
              }`}
              style={{ width: `${coveragePercentage}%` }}
            />
          </div>
          <span className="text-[10px] font-bold font-mono text-fg-muted select-none tabular-nums">
            {coveragePercentage}%
          </span>
        </div>

        {mode === 'preview' && (
          <span
            className="px-2.5 py-1 rounded-full bg-warning-bg border border-warning-line text-[10px] font-extrabold tracking-wider text-warning-fg select-none"
            title="Edits go to a git branch on the server; nothing is written locally."
          >
            PREVIEW
          </span>
        )}

        {reviewCount !== null && (
          <span
            data-testid="review-chip"
            className="shrink-0 px-2.5 py-1 rounded-full bg-accent-soft border border-accent-line text-[10px] font-semibold text-fg select-none whitespace-nowrap"
          >
            {reviewingLabel(reviewCount)}
          </span>
        )}

        {isReviewing && onCloseReview && (
          <button
            id="studio-close-review"
            type="button"
            onClick={onCloseReview}
            className="shrink-0 px-3 py-1.5 rounded-xl border text-[11px] font-semibold bg-raised border-line text-fg hover:text-fg hover:border-line-strong transition duration-150 whitespace-nowrap"
          >
            Close review
          </button>
        )}

        {!isReviewing && unsentCount > 0 && (
          <span
            data-testid="unsent-counter"
            className="shrink-0 px-2.5 py-1 rounded-full bg-warning-bg border border-warning-line text-[10px] font-semibold text-warning-fg select-none whitespace-nowrap"
            title="Saved in this browser only. Send them to your developer before you leave."
          >
            {unsentLabel(unsentCount)}
          </span>
        )}

        {!isReviewing && onSend && (
          <button
            id="studio-send-button"
            onClick={onSend}
            disabled={!canSend}
            className="shrink-0 px-3 py-1.5 rounded-xl border text-[11px] font-semibold bg-accent border-accent-line text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition duration-150 whitespace-nowrap"
            title="Turn your changes into a link or file for your developer"
          >
            Send to developer
          </button>
        )}

        {mode === 'development' && onImport && (
          <button
            id="studio-import-button"
            type="button"
            onClick={onImport}
            className="shrink-0 px-3 py-1.5 rounded-xl border text-[11px] font-semibold bg-raised border-line text-fg hover:text-fg hover:border-line-strong transition duration-150 whitespace-nowrap"
            title="Review a translator's change link and apply it to your local files"
          >
            Import change link
          </button>
        )}

        <button
          id="studio-changes-button"
          onClick={onToggleChanges}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-semibold whitespace-nowrap transition duration-150 ${
            isChangesOpen
              ? 'bg-accent-soft border-accent-line text-accent-fg'
              : 'bg-raised border-line text-fg hover:text-fg hover:border-line-strong'
          }`}
          title="Review, commit, or undo locale changes"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v6M12 15v6" />
          </svg>
          Changes
          {changesCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-warning-bg border border-warning-line text-[10px] font-mono font-bold text-warning-fg">
              {changesCount}
            </span>
          )}
        </button>

        {settings != null && (
          <div data-testid="header-settings" className="flex items-center gap-2 shrink-0">
            {settings}
          </div>
        )}

        <span
          dir="ltr"
          className="hidden xl:block px-3 py-1 rounded-full bg-raised border border-line text-[10px] font-bold text-fg-muted select-none"
        >
          v{__STUDIO_VERSION__} (BETA)
        </span>
      </div>
    </header>
  );
};
