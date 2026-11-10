import React from 'react';
import type { LiveLocaleMode } from '../../../api.js';
import { unsentLabel } from '../hooks/useDrafts.js';
import { BrandMark } from './BrandMark.js';
import type { LocaleSource } from '../../../locale-inference.js';
import type { StringKey } from '../../../i18n/catalogue.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import { getLocaleLabel } from '../locale-names.js';

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
  /** Header settings (the theme toggle); always visible, rendered only when set. */
  settings?: React.ReactNode;
  /** Opens the list of texts still missing; given, the coverage meter is a button. */
  onShowMissing?: () => void;
  /** Shows the first-visit tips again; the "How it works" button renders only when set. */
  onShowTips?: () => void;
}

/** The catalogue key of the hint saying where the target locale came from. */
const SOURCE_HINTS: Record<LocaleSource, StringKey> = {
  content: 'header.source_content',
  url: 'header.source_url',
  manual: 'header.source_manual',
  remembered: 'header.source_remembered',
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
  onShowMissing,
  onShowTips,
}: HeaderProps) => {
  const { t } = useStudioText();
  const mismatch =
    targetLocale?.mismatch && (!locales || locales.includes(targetLocale.mismatch))
      ? targetLocale.mismatch
      : null;
  const mismatchLabel = mismatch ? getLocaleLabel(mismatch, t) : '';
  const coverageVisibility = targetLocale ? 'hidden xl:flex' : 'flex';
  // Spans only, so the meter is valid inside the button it becomes.
  const coverageMeter = (
    <>
      <span className="text-xs text-fg-muted font-medium select-none whitespace-nowrap">
        {t('header.coverage')}
      </span>
      <span className="block w-16 xl:w-28 h-1.5 bg-raised rounded-full overflow-hidden">
        <span
          className={`block h-full rounded-full transition-all duration-700 ease-out ${
            coveragePercentage >= 80 ? 'bg-success-fg' : 'bg-warning-fg'
          }`}
          style={{ width: `${coveragePercentage}%` }}
        />
      </span>
      <span className="text-xs font-bold font-mono text-fg-muted select-none tabular-nums">
        {coveragePercentage}%
      </span>
    </>
  );

  return (
    <header className="h-16 bg-surface border-b border-line px-4 xl:px-8 flex items-center justify-between gap-4 shrink-0 select-none">
      <div className="flex items-center gap-3 shrink-0">
        <BrandMark className="h-8 w-8 shrink-0" />
        <div>
          {/* The wordmark is the brand and is never translated. */}
          <h1
            lang="en"
            dir="ltr"
            className="text-base font-heading font-medium tracking-[-0.02em] text-fg"
          >
            livelocale
          </h1>
          <p className="hidden xl:block text-xs text-fg-muted font-medium mt-0.5">
            {t('header.tagline')}
          </p>
        </div>
      </div>

      {/* Coverage progress bar + version badge. Below xl the hints and Coverage hide and the
          locale chip shrinks first, so Send to developer and Changes always stay on screen. */}
      <div className="flex items-center justify-end gap-3 xl:gap-5 min-w-0">
        {/* overflow-hidden truncates the chip; p-1 -m-1 gives the mismatch button's focus ring room
            inside the clip without moving anything. */}
        {targetLocale && (
          <div
            data-testid="target-locale"
            className="flex items-center gap-2 select-none min-w-0 overflow-hidden p-1 -m-1"
          >
            {targetLocale.source === null ? (
              <span className="px-2.5 py-1 rounded-full bg-raised border border-line text-xs font-semibold text-fg-muted whitespace-nowrap truncate min-w-0">
                {t('header.locale_unset')}
              </span>
            ) : (
              // overflow-hidden keeps a chip squeezed by the mismatch notice inside its own box, so
              // the two never draw over each other.
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-soft border border-accent-line text-xs whitespace-nowrap min-w-0 overflow-hidden">
                <span className="font-bold text-accent-fg truncate">
                  {t(isReviewing ? 'header.viewing' : 'header.editing', {
                    locale: targetLocale.locale,
                  })}
                </span>
                {/* While the mismatch notice shows, it explains the choice; the hint would only crowd it. */}
                {!mismatch && (
                  <span className="hidden xl:inline text-fg truncate">
                    {t(SOURCE_HINTS[targetLocale.source])}
                  </span>
                )}
              </span>
            )}
            {mismatch && (
              <span className="glyph-warn flex items-center gap-1.5 text-xs text-warning-fg whitespace-nowrap shrink-0">
                <span className="hidden 2xl:inline">
                  {t('header.mismatch', { locale: mismatchLabel })}
                </span>
                <button
                  type="button"
                  onClick={() => onChooseLocale?.(mismatch)}
                  title={t('header.mismatch', { locale: mismatchLabel })}
                  className="px-2 py-0.5 rounded-md bg-warning-bg border border-warning-line font-semibold hover:bg-warning-bg transition duration-150"
                >
                  {t('header.switch_locale', { locale: mismatchLabel })}
                </button>
              </span>
            )}
          </div>
        )}

        {/* Translation coverage metric. With somewhere to list the gaps it is a button: the
            percentage is where "what is left for me to do?" starts. */}
        {onShowMissing ? (
          <button
            type="button"
            data-testid="coverage-button"
            onClick={onShowMissing}
            // The name is what it shows ("Coverage 33%"), so voice control finds it by those
            // words (WCAG 2.5.3); what it does is the description.
            title={t('header.coverage_show_missing', { percent: coveragePercentage })}
            className={`items-center gap-2.5 shrink-0 px-2 py-1 -mx-2 -my-1 rounded-lg hover:bg-raised transition duration-150 ${coverageVisibility}`}
          >
            {coverageMeter}
          </button>
        ) : (
          <div
            className={`items-center gap-2.5 shrink-0 ${coverageVisibility}`}
            title={t('header.coverage_title', { percent: coveragePercentage })}
          >
            {coverageMeter}
          </div>
        )}

        {mode === 'preview' && (
          <span
            className="glyph-warn px-2.5 py-1 rounded-full bg-warning-bg border border-warning-line text-xs font-extrabold tracking-wider text-warning-fg select-none"
            title={t('header.preview_title')}
          >
            {t('header.preview')}
          </span>
        )}

        {reviewCount !== null && (
          <span
            data-testid="review-chip"
            className="shrink-0 px-2.5 py-1 rounded-full bg-accent-soft border border-accent-line text-xs font-semibold text-fg select-none whitespace-nowrap"
          >
            {t('header.reviewing', { count: reviewCount })}
          </span>
        )}

        {isReviewing && onCloseReview && (
          <button
            id="studio-close-review"
            type="button"
            onClick={onCloseReview}
            className="shrink-0 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-raised border-line text-fg hover:text-fg hover:border-line-strong transition duration-150 whitespace-nowrap"
          >
            {t('header.close_review')}
          </button>
        )}

        {!isReviewing && unsentCount > 0 && (
          <span
            data-testid="unsent-counter"
            className="glyph-warn shrink-0 px-2.5 py-1 rounded-full bg-warning-bg border border-warning-line text-xs font-semibold text-warning-fg select-none whitespace-nowrap"
            title={t('header.unsent_title')}
          >
            {unsentLabel(unsentCount, t)}
          </span>
        )}

        {!isReviewing && onSend && (
          <button
            type="button"
            id="studio-send-button"
            onClick={onSend}
            disabled={!canSend}
            className="shrink-0 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-accent border-accent-line text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition duration-150 whitespace-nowrap"
            title={t('header.send_title')}
          >
            {t('header.send')}
          </button>
        )}

        {mode === 'development' && onImport && (
          <button
            id="studio-import-button"
            type="button"
            onClick={onImport}
            className="shrink-0 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-raised border-line text-fg hover:text-fg hover:border-line-strong transition duration-150 whitespace-nowrap"
            title={t('header.import_title')}
          >
            {t('header.import')}
          </button>
        )}

        <button
          type="button"
          id="studio-changes-button"
          onClick={onToggleChanges}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition duration-150 ${
            isChangesOpen
              ? 'bg-accent-soft border-accent-line text-accent-fg'
              : 'bg-raised border-line text-fg hover:text-fg hover:border-line-strong'
          }`}
          title={t('header.changes_title')}
        >
          <svg
            aria-hidden="true"
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
          {t('header.changes')}
          {changesCount > 0 && (
            <span className="glyph-warn px-1.5 py-0.5 rounded-md bg-warning-bg border border-warning-line text-xs font-mono font-bold text-warning-fg">
              {changesCount}
            </span>
          )}
        </button>

        {onShowTips && (
          <button
            type="button"
            data-testid="show-tips"
            onClick={onShowTips}
            className="shrink-0 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-raised border-line text-fg hover:text-fg hover:border-line-strong transition duration-150 whitespace-nowrap"
          >
            {t('header.show_tips')}
          </button>
        )}

        {settings != null && (
          <div data-testid="header-settings" className="flex items-center gap-2 shrink-0">
            {settings}
          </div>
        )}

        <span
          dir="ltr"
          className="hidden xl:block px-3 py-1 rounded-full bg-raised border border-line text-xs font-bold text-fg-muted select-none whitespace-nowrap"
        >
          v{__STUDIO_VERSION__}
        </span>
      </div>
    </header>
  );
};
