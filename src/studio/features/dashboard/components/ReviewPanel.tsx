import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { parsePluralMessage } from '../../../../core/icu-plural.js';
import type { EditStatus } from '../../../../core/apply-plan.js';
import type { ApplyResult, ReviewState } from '../hooks/useReview.js';
import { REVIEW_STATUS_LABELS, reviewSummary, type ReviewRow } from '../../../share/review.js';
import { buildShareLink } from '../../../share/send.js';
import { copyText } from '../../../share/browser.js';
import { PluralEditor } from './PluralEditor.js';
import { SetupProblems } from './SetupProblems.js';
import { GitHubIssueAction } from './GitHubIssueAction.js';
import { RepoPrompt } from './RepoPrompt.js';

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

const ERROR_TITLE = 'This change link cannot be opened:';
const APPLY_HINT =
  'Run it in the repository. It opens a pull request with your git and gh, on any git host.';
const COPIED = 'Copied.';
const COPY_FAILED = 'Copy did not work in this browser. Select the text above and copy it.';
const GITHUB_HINT = 'Then press Submit on GitHub. The pull request opens in about a minute.';
const RUN_WORKFLOW_HINT =
  'Issues turned off? Actions → LiveLocale → Run workflow, then paste the link.';

const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

const RESULT_CLASS: Record<ApplyResult['state'], string> = {
  applied: 'text-success-fg',
  skipped: 'text-fg-muted',
  failed: 'text-danger-fg',
};

const resultText = (result: ApplyResult) =>
  result.state === 'applied'
    ? 'Applied'
    : result.state === 'failed'
      ? `Failed: ${result.message}`
      : `Skipped: ${result.reason}`;

const STATUS_ORDER: EditStatus[] = ['apply', 'already', 'conflict', 'needs-force', 'invalid'];

const STATUS_CLASS: Record<EditStatus, string> = {
  apply: 'text-success-fg',
  already: 'text-fg-muted',
  conflict: 'text-warning-fg',
  'needs-force': 'text-warning-fg',
  invalid: 'text-danger-fg',
};

const noop = () => {};

const actionButton =
  'h-8 px-3 rounded-xl text-[11px] font-semibold border transition duration-150 text-fg hover:text-fg bg-raised hover:bg-raised-hover border-line-strong';

const Value = ({ value }: { value: string | null }) =>
  value === null || value === '' ? (
    <em className="text-fg-muted">empty</em>
  ) : (
    <span dir="auto" className="break-all whitespace-pre-wrap">
      {value}
    </span>
  );

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

  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusedId, focusSeq]);

  const copy = async (text: string) => {
    setCopied((await copyText(text)) ? COPIED : COPY_FAILED);
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
      className={`${className} bg-raised border border-line rounded-2xl flex flex-col h-full shadow-2xl overflow-hidden`}
    >
      <div className="h-14 bg-surface border-b border-line flex items-center justify-between px-6 shrink-0 select-none">
        <h2 className="text-sm font-bold tracking-wide font-heading text-fg">Review</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold text-fg-muted hover:text-fg transition duration-150"
        >
          Close review
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
        {error !== null && <SetupProblems title={ERROR_TITLE} problems={[error]} />}

        {isLoading && review === null && (
          <p className="text-xs text-fg-muted">Opening the change link…</p>
        )}

        {review && counts && link && command && (
          <>
            {(by !== '' || note !== '') && (
              <p
                data-testid="review-note"
                dir="auto"
                className="px-3 py-2 rounded-xl bg-surface border border-line text-xs text-fg whitespace-pre-wrap break-words"
              >
                {`From ${by || 'the translator'}${note === '' ? '' : `: ${note}`}`}
              </p>
            )}

            <ul data-testid="review-summary" className="flex flex-wrap gap-2 text-[11px]">
              {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
                <li
                  key={s}
                  className={`px-2.5 py-1 rounded-full bg-surface border border-line ${STATUS_CLASS[s]}`}
                >
                  {`${counts[s]} ${REVIEW_STATUS_LABELS[s]}`}
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
                        label="Create pull request"
                      />
                      <span className="text-[11px] font-mono text-fg-muted break-all">{repo}</span>
                      {!repoFromManifest && (
                        <button
                          type="button"
                          onClick={() => setIsChangingRepo(true)}
                          className="text-[11px] font-semibold text-fg-muted hover:text-fg underline-offset-2 hover:underline"
                        >
                          Change
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-fg-muted">{GITHUB_HINT}</p>
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
                  className="h-8 px-3 rounded-xl text-[11px] font-semibold border transition duration-150 bg-accent border-accent-line text-on-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {`Apply ${changes(applyCount)} to local files`}
                </button>
                {counts['needs-force'] > 0 && (
                  <label className="flex items-center gap-2 text-[11px] text-fg">
                    <input
                      type="checkbox"
                      checked={includeForced}
                      onChange={(e) => setIncludeForced(e.target.checked)}
                    />
                    {`Include ${changes(counts['needs-force'])} saved with “Save anyway”`}
                  </label>
                )}
              </div>
            )}

            {actions}

            <div className="space-y-2 px-3 py-3 rounded-xl bg-surface border border-line">
              <h3 className="text-xs font-semibold text-fg">Apply with the command line</h3>
              <code
                data-testid="review-apply-command"
                className="block px-3 py-2 rounded-lg bg-surface border border-line text-[11px] font-mono text-fg break-all"
              >
                {command}
              </code>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => copy(command)} className={actionButton}>
                  Copy command
                </button>
                {command === CLIPBOARD_COMMAND && (
                  <button type="button" onClick={() => copy(link)} className={actionButton}>
                    Copy link
                  </button>
                )}
                {copied && <span className="text-[11px] text-fg-muted">{copied}</span>}
              </div>
              <p className="text-[11px] text-fg-muted">{APPLY_HINT}</p>
            </div>

            {review.target === 'github' && (
              <p className="text-[11px] text-fg-muted">{RUN_WORKFLOW_HINT}</p>
            )}

            <table className="w-full text-[11px] text-left border-collapse">
              <thead className="text-fg-muted">
                <tr>
                  <th className="py-1 pr-2 font-semibold">Language</th>
                  <th className="py-1 pr-2 font-semibold">Key</th>
                  <th className="py-1 pr-2 font-semibold">Before</th>
                  <th className="py-1 pr-2 font-semibold">After</th>
                  <th className="py-1 font-semibold">Check</th>
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
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => onSelectLocale(row.locale)}
                          title={`Show the page in ${row.locale}`}
                          className="font-mono text-accent-fg hover:text-accent-fg underline-offset-2 hover:underline"
                        >
                          {row.locale}
                        </button>
                      </td>
                      <td className="py-2 pr-2 font-mono text-fg break-all">{row.key}</td>
                      <td className="py-2 pr-2">
                        <Value value={row.from} />
                        {row.status === 'conflict' && row.current !== undefined && (
                          <p className="mt-1 text-warning-fg">
                            {'Now on the site: '}
                            <span dir="auto" className="break-all whitespace-pre-wrap">
                              {row.current}
                            </span>
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <AfterCell row={row} />
                      </td>
                      <td className="py-2">
                        <span className={`font-semibold ${STATUS_CLASS[row.status]}`}>
                          {REVIEW_STATUS_LABELS[row.status]}
                        </span>
                        {applyResults[row.id] && (
                          <p
                            data-testid="apply-result"
                            className={`mt-1 inline-block px-2 py-0.5 rounded-full bg-surface border border-line ${RESULT_CLASS[applyResults[row.id]!.state]}`}
                          >
                            {resultText(applyResults[row.id]!)}
                          </p>
                        )}
                        {row.checks.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {row.checks.map((check) => (
                              <li
                                key={check.message}
                                className={
                                  check.level === 'error' ? 'text-danger-fg' : 'text-warning-fg'
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
