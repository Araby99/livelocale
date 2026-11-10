import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { parsePluralMessage } from '../../../../core/icu-plural.js';
import type { EditStatus } from '../../../../core/apply-plan.js';
import type { ApplyResult, ReviewState } from '../hooks/useReview.js';
import { REVIEW_STATUS_KEYS, reviewSummary, type ReviewRow } from '../../../share/review.js';
import { buildShareLink } from '../../../share/send.js';
import { copyText } from '../../../share/browser.js';
import { PluralEditor } from './PluralEditor.js';
import { SetupProblems } from './SetupProblems.js';
import { GitHubIssueAction } from './GitHubIssueAction.js';
import { RepoPrompt } from './RepoPrompt.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import { studioMessage, type StudioText } from '../../../i18n/catalogue.js';

/** Above this many characters the command reads the link from the clipboard (cmd.exe caps arguments at 8,191). */
export const APPLY_COMMAND_MAX_CHARS = 8000;

const CLIPBOARD_COMMAND = 'npx livelocale apply --clipboard --pr';

/** The terminal command that applies `link` and opens a pull request. */
export function applyCommandFor(link: string): string {
  const command = `npx livelocale apply "${link}" --pr`;
  return command.length > APPLY_COMMAND_MAX_CHARS ? CLIPBOARD_COMMAND : command;
}

interface ReviewPanelProps {
  review: ReviewState | null;
  error: string | null;
  isLoading: boolean;
  /** The key last Alt+Clicked in the app; its row is marked and scrolled into view. */
  focusKey: string | null;
  /** Bumped on every Alt+Click, so a repeat click on the same key scrolls its row back into view. */
  focusSeq?: number;
  /** The page's current locale; the focused row is the one for `focusKey` in it, else the first. */
  locale?: string;
  /** Switches the page language, so the app shows that locale's proposed values. */
  onSelectLocale(l: string): void;
  onClose(): void;
  studioHref: string;
  /** The repository that gets the pull request: the manifest's, else the remembered one. */
  repo: string | null;
  /** True when `repo` comes from the manifest; only a remembered repo can be changed here. */
  repoFromManifest: boolean;
  /** Called with a valid `owner/repo` the developer confirmed. */
  onRepoChange(slug: string): void;
  /** Development: saves the ready rows to the local files; the local actions render only when set. */
  onApplyLocal?: (o: { includeForced: boolean }) => void;
  /** Each row's result after a local apply, keyed by row id. */
  applyResults?: Record<string, ApplyResult>;
  isApplying?: boolean;
  /** Extra apply actions shown under the summary. */
  actions?: ReactNode;
  className?: string;
}

/** GitHub's own menu path, kept English inside the translated hint. */
const RUN_WORKFLOW_PATH = 'Actions → LiveLocale → Run workflow';

const RESULT_CLASS: Record<ApplyResult['state'], string> = {
  applied: 'glyph-done text-success-fg',
  skipped: 'text-fg-muted',
  failed: 'text-danger-fg',
};

const resultText = (result: ApplyResult, t: StudioText) =>
  result.state === 'applied'
    ? t('review.result_applied')
    : result.state === 'failed'
      ? t('review.result_failed', { message: studioMessage(t, result.message) })
      : t('review.result_skipped', { reason: result.reason });

const STATUS_ORDER: EditStatus[] = ['apply', 'already', 'conflict', 'needs-force', 'invalid'];

const STATUS_CLASS: Record<EditStatus, string> = {
  apply: 'glyph-done text-success-fg',
  already: 'text-fg-muted',
  conflict: 'glyph-warn text-warning-fg',
  'needs-force': 'glyph-warn text-warning-fg',
  invalid: 'text-danger-fg',
};

const noop = () => {};

const actionButton =
  'h-8 px-3 rounded-xl text-xs font-semibold border transition duration-150 text-fg hover:text-fg bg-raised hover:bg-raised-hover border-line-strong';

const Value = ({ value }: { value: string | null }) => {
  const { t } = useStudioText();
  return value === null || value === '' ? (
    <em className="text-fg-muted">{t('review.empty')}</em>
  ) : (
    <span dir="auto" className="break-all whitespace-pre-wrap">
      {value}
    </span>
  );
};

const AfterCell = ({ row }: { row: ReviewRow }) =>
  parsePluralMessage(row.to) !== null ? (
    <PluralEditor disabled locale={row.locale} value={row.to} onChange={noop} />
  ) : (
    <Value value={row.to} />
  );

/** A change link shown read-only: who sent it, what each edit does, and how to apply it. */
export const ReviewPanel = ({
  review,
  error,
  isLoading,
  focusKey,
  focusSeq,
  locale,
  onSelectLocale,
  onClose,
  studioHref,
  repo,
  repoFromManifest,
  onRepoChange,
  onApplyLocal,
  applyResults = {},
  isApplying = false,
  actions,
  className = 'w-[420px] shrink-0',
}: ReviewPanelProps) => {
  const { t } = useStudioText();
  const [copied, setCopied] = useState<string | null>(null);
  const [isChangingRepo, setIsChangingRepo] = useState(false);
  const [includeForced, setIncludeForced] = useState(false);
  const focusedRef = useRef<HTMLTableRowElement | null>(null);

  const link = useMemo(
    () => (review ? buildShareLink(studioHref, review.token) : null),
    [review, studioHref]
  );
  const command = link === null ? null : applyCommandFor(link);
  const counts = useMemo(() => (review ? reviewSummary(review.rows) : null), [review]);
  const focusedId = useMemo(() => {
    const withKey = review?.rows.filter((r) => r.key === focusKey) ?? [];
    return (withKey.find((r) => r.locale === locale) ?? withKey[0])?.id ?? null;
  }, [review, focusKey, locale]);

  useEffect(() => setCopied(null), [review]);
  useEffect(() => setIncludeForced(false), [review?.token]);

  const applyCount = counts ? counts.apply + (includeForced ? counts['needs-force'] : 0) : 0;

  // One announcement for the whole apply, not one live region per row (which floods a screen reader).
  const applySummary = useMemo(() => {
    const results = Object.values(applyResults);
    if (results.length === 0) return null;
    const n = (state: ApplyResult['state']) => results.filter((r) => r.state === state).length;
    const failed = n('failed');
    const text = t('review.apply_summary', {
      applied: n('applied'),
      skipped: n('skipped'),
      failed,
    });
    return { text, failed: failed > 0 };
  }, [applyResults, t]);

  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusedId, focusSeq]);

  const copy = async (text: string) => {
    setCopied(t((await copyText(text)) ? 'review.copied' : 'review.copy_failed'));
  };

  const saveRepo = (slug: string) => {
    setIsChangingRepo(false);
    onRepoChange(slug);
  };

  const by = review?.set.by ?? '';
  const note = review?.set.note ?? '';

  return (
    <section
      data-testid="review-panel"
      className={`${className} bg-raised border border-line rounded-2xl flex flex-col h-full overflow-hidden`}
    >
      <div className="h-14 bg-surface border-b border-line flex items-center justify-between px-6 shrink-0 select-none">
        <h2 className="text-sm font-bold tracking-wide font-heading text-fg">
          {t('review.title')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-fg-muted hover:text-fg transition duration-150"
        >
          {t('review.close')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
        {error !== null && <SetupProblems title={t('review.error_title')} problems={[error]} />}

        {isLoading && review === null && (
          <p className="text-xs text-fg-muted">{t('review.opening')}</p>
        )}

        {review && counts && link && command && (
          <>
            <p role="status" className="sr-only">
              {applySummary && !applySummary.failed ? applySummary.text : ''}
            </p>
            <p role="alert" className="sr-only">
              {applySummary?.failed ? applySummary.text : ''}
            </p>
            {(by !== '' || note !== '') && (
              <p
                data-testid="review-note"
                dir="auto"
                className="px-3 py-2 rounded-xl bg-surface border border-line text-xs text-fg whitespace-pre-wrap break-words"
              >
                {by === ''
                  ? t(note === '' ? 'review.from_translator' : 'review.from_translator_note', {
                      note,
                    })
                  : t(note === '' ? 'review.from' : 'review.from_note', { by, note })}
              </p>
            )}

            <ul data-testid="review-summary" className="flex flex-wrap gap-2 text-xs">
              {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
                <li
                  key={s}
                  className={`px-2.5 py-1 rounded-full bg-surface border border-line ${STATUS_CLASS[s]}`}
                >
                  {t('review.summary_count', {
                    count: counts[s],
                    status: t(REVIEW_STATUS_KEYS[s]),
                  })}
                </li>
              ))}
            </ul>

            {review.target === 'github' && (
              <div className="space-y-2 px-3 py-3 rounded-xl bg-surface border border-line">
                {repo === null || isChangingRepo ? (
                  // The repo inside a link is only a suggestion: the developer confirms it first.
                  <RepoPrompt
                    initial={isChangingRepo ? (repo ?? undefined) : review.set.repo}
                    onSave={saveRepo}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Keyed on the link, so a copied block never carries over to the next review. */}
                      <GitHubIssueAction
                        key={review.token}
                        repo={repo}
                        token={review.token}
                        count={review.set.edits.length}
                        by={review.set.by}
                        label={t('review.create_pr')}
                      />
                      <span dir="ltr" className="text-xs font-mono text-fg-muted break-all">
                        {repo}
                      </span>
                      {!repoFromManifest && (
                        <button
                          type="button"
                          onClick={() => setIsChangingRepo(true)}
                          className="text-xs font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
                        >
                          {t('review.change_repo')}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-fg-muted">{t('review.github_hint')}</p>
                  </>
                )}
              </div>
            )}

            {review.target === 'local' && onApplyLocal && (
              <div className="space-y-2 px-3 py-3 rounded-xl bg-surface border border-line">
                <button
                  id="studio-apply-local"
                  type="button"
                  disabled={applyCount === 0 || isApplying}
                  onClick={() => onApplyLocal({ includeForced })}
                  className="h-8 px-3 rounded-xl text-xs font-semibold border transition duration-150 bg-accent border-accent-line text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('review.apply_local', { count: applyCount })}
                </button>
                {counts['needs-force'] > 0 && (
                  <label className="flex items-center gap-2 text-xs text-fg">
                    <input
                      type="checkbox"
                      checked={includeForced}
                      onChange={(e) => setIncludeForced(e.target.checked)}
                    />
                    {t('review.include_forced', { count: counts['needs-force'] })}
                  </label>
                )}
              </div>
            )}

            {actions}

            <div className="space-y-2 px-3 py-3 rounded-xl bg-surface border border-line">
              <h3 className="text-xs font-semibold text-fg">{t('review.command_title')}</h3>
              <code
                data-testid="review-apply-command"
                dir="ltr"
                className="block px-3 py-2 rounded-lg bg-surface border border-line text-xs font-mono text-fg break-all"
              >
                {command}
              </code>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => copy(command)} className={actionButton}>
                  {t('review.copy_command')}
                </button>
                {command === CLIPBOARD_COMMAND && (
                  <button type="button" onClick={() => copy(link)} className={actionButton}>
                    {t('review.copy_link')}
                  </button>
                )}
                {copied && <span className="text-xs text-fg-muted">{copied}</span>}
              </div>
              <p className="text-xs text-fg-muted">{t('review.apply_hint')}</p>
            </div>

            {review.target === 'github' && (
              <p className="text-xs text-fg-muted">
                {t('review.run_workflow_hint', { path: RUN_WORKFLOW_PATH })}
              </p>
            )}

            <table className="w-full text-xs text-start border-collapse">
              <thead className="text-fg-muted">
                <tr>
                  <th className="py-1 pe-2 font-semibold">{t('review.col_language')}</th>
                  <th className="py-1 pe-2 font-semibold">{t('review.col_key')}</th>
                  <th className="py-1 pe-2 font-semibold">{t('review.col_before')}</th>
                  <th className="py-1 pe-2 font-semibold">{t('review.col_after')}</th>
                  <th className="py-1 font-semibold">{t('review.col_check')}</th>
                </tr>
              </thead>
              <tbody className="text-fg align-top">
                {review.rows.map((row) => {
                  const focused = row.id === focusedId;
                  return (
                    <tr
                      key={row.id}
                      ref={focused ? focusedRef : undefined}
                      aria-current={focused ? 'true' : undefined}
                      className={`border-t border-line ${focused ? 'bg-accent-soft' : ''}`}
                    >
                      <td className="py-2 pe-2">
                        <button
                          type="button"
                          onClick={() => onSelectLocale(row.locale)}
                          title={t('review.show_locale', { locale: row.locale })}
                          dir="ltr"
                          className="font-mono text-info-fg hover:text-info-fg underline-offset-2 hover:underline"
                        >
                          {row.locale}
                        </button>
                      </td>
                      <td dir="ltr" className="py-2 pe-2 font-mono text-info-fg break-all">
                        {row.key}
                      </td>
                      <td className="py-2 pe-2 text-sm">
                        <Value value={row.from} />
                        {row.status === 'conflict' && row.current !== undefined && (
                          <p className="mt-1 glyph-warn text-warning-fg">
                            {`${t('review.now_on_site')} `}
                            <span dir="auto" className="break-all whitespace-pre-wrap">
                              {row.current}
                            </span>
                          </p>
                        )}
                      </td>
                      <td className="py-2 pe-2 text-sm">
                        <AfterCell row={row} />
                      </td>
                      <td className="py-2">
                        <span className={`font-semibold ${STATUS_CLASS[row.status]}`}>
                          {t(REVIEW_STATUS_KEYS[row.status])}
                        </span>
                        {applyResults[row.id] && (
                          <p
                            data-testid="apply-result"
                            className={`mt-1 inline-block px-2 py-0.5 rounded-full bg-surface border border-line ${RESULT_CLASS[applyResults[row.id]!.state]}`}
                          >
                            {resultText(applyResults[row.id]!, t)}
                          </p>
                        )}
                        {row.checks.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {row.checks.map((check) => (
                              <li
                                key={check.message}
                                className={
                                  check.level === 'error'
                                    ? 'text-danger-fg'
                                    : 'glyph-warn text-warning-fg'
                                }
                              >
                                {check.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
};
