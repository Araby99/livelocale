import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { parsePluralMessage } from '../../../../core/icu-plural.js';
import type { EditStatus } from '../../../../core/apply-plan.js';
import type { ReviewState } from '../hooks/useReview.js';
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

const STATUS_ORDER: EditStatus[] = ['apply', 'already', 'conflict', 'needs-force', 'invalid'];

const STATUS_CLASS: Record<EditStatus, string> = {
  apply: 'text-emerald-300',
  already: 'text-slate-400',
  conflict: 'text-amber-300',
  'needs-force': 'text-amber-300',
  invalid: 'text-rose-300',
};

const noop = () => {};

const actionButton =
  'h-8 px-3 rounded-xl text-[11px] font-semibold border transition duration-150 text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700';

const Value = ({ value }: { value: string | null }) =>
  value === null || value === '' ? (
    <em className="text-slate-500">empty</em>
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
  onSelectLocale,
  onClose,
  studioHref,
  repo,
  repoFromManifest,
  onRepoChange,
  actions,
  className = 'w-[420px] shrink-0',
}: ReviewPanelProps) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [isChangingRepo, setIsChangingRepo] = useState(false);
  const focusedRef = useRef<HTMLTableRowElement | null>(null);

  const link = useMemo(
    () => (review ? buildShareLink(studioHref, review.token) : null),
    [review, studioHref]
  );
  const command = link === null ? null : applyCommandFor(link);
  const counts = useMemo(() => (review ? reviewSummary(review.rows) : null), [review]);
  const focusedId = review?.rows.find((r) => r.key === focusKey)?.id ?? null;

  useEffect(() => setCopied(null), [review]);

  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusedId]);

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
      className={`${className} bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-full shadow-2xl overflow-hidden`}
    >
      <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 select-none">
        <h2 className="text-sm font-bold tracking-wide font-outfit text-slate-200">Review</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold text-slate-400 hover:text-slate-100 transition duration-150"
        >
          Close review
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
        {error !== null && <SetupProblems title={ERROR_TITLE} problems={[error]} />}

        {isLoading && review === null && (
          <p className="text-xs text-slate-400">Opening the change link…</p>
        )}

        {review && counts && link && command && (
          <>
            {(by !== '' || note !== '') && (
              <p
                data-testid="review-note"
                dir="auto"
                className="px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap break-words"
              >
                {`From ${by || 'the translator'}${note === '' ? '' : `: ${note}`}`}
              </p>
            )}

            <ul data-testid="review-summary" className="flex flex-wrap gap-2 text-[11px]">
              {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
                <li
                  key={s}
                  className={`px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 ${STATUS_CLASS[s]}`}
                >
                  {`${counts[s]} ${REVIEW_STATUS_LABELS[s]}`}
                </li>
              ))}
            </ul>

            {review.target === 'github' && (
              <div className="space-y-2 px-3 py-3 rounded-xl bg-slate-950/40 border border-slate-800">
                {repo === null || isChangingRepo ? (
                  // The repo inside a link is only a suggestion: the developer confirms it first.
                  <RepoPrompt
                    initial={isChangingRepo ? (repo ?? undefined) : review.set.repo}
                    onSave={saveRepo}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <GitHubIssueAction
                        repo={repo}
                        token={review.token}
                        count={review.set.edits.length}
                        by={review.set.by}
                        label="Create pull request"
                      />
                      <span className="text-[11px] font-mono text-slate-400 break-all">{repo}</span>
                      {!repoFromManifest && (
                        <button
                          type="button"
                          onClick={() => setIsChangingRepo(true)}
                          className="text-[11px] font-semibold text-slate-400 hover:text-slate-100 underline-offset-2 hover:underline"
                        >
                          Change
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">{GITHUB_HINT}</p>
                  </>
                )}
              </div>
            )}

            {actions}

            <div className="space-y-2 px-3 py-3 rounded-xl bg-slate-950/40 border border-slate-800">
              <h3 className="text-xs font-semibold text-slate-200">Apply with the command line</h3>
              <code
                data-testid="review-apply-command"
                className="block px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 break-all"
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
                {copied && <span className="text-[11px] text-slate-400">{copied}</span>}
              </div>
              <p className="text-[11px] text-slate-500">{APPLY_HINT}</p>
            </div>

            {review.target === 'github' && (
              <p className="text-[11px] text-slate-500">{RUN_WORKFLOW_HINT}</p>
            )}

            <table className="w-full text-[11px] text-left border-collapse">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-2 font-semibold">Language</th>
                  <th className="py-1 pr-2 font-semibold">Key</th>
                  <th className="py-1 pr-2 font-semibold">Before</th>
                  <th className="py-1 pr-2 font-semibold">After</th>
                  <th className="py-1 font-semibold">Check</th>
                </tr>
              </thead>
              <tbody className="text-slate-300 align-top">
                {review.rows.map((row) => {
                  const focused = row.id === focusedId;
                  return (
                    <tr
                      key={row.id}
                      ref={focused ? focusedRef : undefined}
                      aria-current={focused ? 'true' : undefined}
                      className={`border-t border-slate-800 ${focused ? 'bg-indigo-600/10' : ''}`}
                    >
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => onSelectLocale(row.locale)}
                          title={`Show the page in ${row.locale}`}
                          className="font-mono text-indigo-300 hover:text-indigo-100 underline-offset-2 hover:underline"
                        >
                          {row.locale}
                        </button>
                      </td>
                      <td className="py-2 pr-2 font-mono text-indigo-400 break-all">{row.key}</td>
                      <td className="py-2 pr-2">
                        <Value value={row.from} />
                        {row.status === 'conflict' && row.current !== undefined && (
                          <p className="mt-1 text-amber-300">
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
                        {row.checks.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {row.checks.map((check) => (
                              <li
                                key={check.message}
                                className={
                                  check.level === 'error' ? 'text-rose-300' : 'text-amber-300'
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
