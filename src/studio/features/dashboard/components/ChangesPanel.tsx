import React, { useState } from 'react';
import type { GitState } from '../../../api.js';
import type { HistoryEntry } from '../hooks/useHistory.js';
import type { Draft } from '../../../transport/drafts.js';
import { DraftList } from './DraftList.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface ChangesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  git: GitState | null;
  gitError: string | null;
  isGitLoading: boolean;
  lastCommit: string | null;
  onCommit: (message: string) => Promise<string | undefined>;
  onDiscard: () => Promise<boolean>;
  onRefresh: () => void;
  history: HistoryEntry[];
  onUndo: (entry: HistoryEntry) => Promise<void>;
  isUndoing: boolean;
  /** Share link only: when an array, the draft list replaces the git and session sections. */
  drafts?: Draft[] | null;
  onUndoDraft?: (d: Draft) => Promise<void>;
  onDownloadBackup?: () => Promise<void>;
  onRestoreBackup?: (file: File) => Promise<string>;
  onReviewChange?: () => void;
  /** Share link only: drafts the rebuilt site already shows. */
  liveNow?: Draft[];
  onDismissLiveNow?: () => void;
}

const noop = async (): Promise<void> => {};
const noRestore = async (): Promise<string> => '';

const STATUS_STYLES: Record<string, string> = {
  modified: 'text-warning-fg border-warning-line bg-warning-bg',
  added: 'text-success-fg border-success-line bg-success-bg',
  deleted: 'text-danger-fg border-danger-line bg-danger-bg',
  renamed: 'text-info-fg border-info-line bg-info-bg',
};

const diffLineClass = (line: string): string => {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-fg-muted';
  if (line.startsWith('@@')) return 'text-fg';
  if (line.startsWith('diff ') || line.startsWith('new file')) return 'text-fg-muted';
  if (line.startsWith('+')) return 'text-success-fg bg-success-bg';
  if (line.startsWith('-')) return 'text-danger-fg bg-danger-bg';
  return 'text-fg-muted';
};

const formatTime = (epoch: number) =>
  new Date(epoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Slide-over panel with the git view of the locales directory (status, diff,
 * commit, discard) and the session's edit history with per-entry undo.
 */
export const ChangesPanel = ({
  isOpen,
  onClose,
  git,
  gitError,
  isGitLoading,
  lastCommit,
  onCommit,
  onDiscard,
  onRefresh,
  history,
  onUndo,
  isUndoing,
  drafts,
  onUndoDraft = noop,
  onDownloadBackup = noop,
  onRestoreBackup = noRestore,
  onReviewChange,
  liveNow,
  onDismissLiveNow,
}: ChangesPanelProps) => {
  const { t } = useStudioText();
  const [message, setMessage] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  if (!isOpen) return null;

  const changes = git?.changes ?? [];
  const isGitHub = git?.mode === 'github';
  const canCommit = Boolean(git?.isRepo) && changes.length > 0 && message.trim().length > 0;

  const handleCommit = async () => {
    const hash = await onCommit(message.trim());
    if (hash) setMessage('');
  };

  const handleDiscard = async () => {
    const ok = await onDiscard();
    if (ok) setConfirmDiscard(false);
  };

  return (
    <div className="fixed inset-0 top-16 z-40 flex justify-end" data-testid="changes-panel">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={onClose} />

      <aside className="relative w-[520px] max-w-full h-full bg-raised border-s border-line shadow-2xl flex flex-col animate-in slide-in-from-end duration-200">
        {/* Header */}
        <div className="h-14 bg-surface border-b border-line flex items-center justify-between px-6 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-wide font-heading text-fg">Changes</h2>
            {git?.isRepo && git.branch && (
              <span
                dir="ltr"
                className="px-2 py-0.5 rounded-md bg-raised border border-line text-[10px] font-mono text-fg"
              >
                {git.branch}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-raised-hover border border-transparent hover:border-line-strong transition duration-150"
              title="Refresh"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-raised-hover border border-transparent hover:border-line-strong transition duration-150"
              title="Close"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {Array.isArray(drafts) ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <DraftList
              drafts={drafts}
              onUndo={onUndoDraft}
              isUndoing={isUndoing}
              onDownloadBackup={onDownloadBackup}
              onRestoreBackup={onRestoreBackup}
              onReviewChange={onReviewChange}
              liveNow={liveNow}
              onDismissLiveNow={onDismissLiveNow}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Git status */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
                  Locale files
                </label>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-surface text-fg border border-line">
                  {changes.length} changed
                </span>
              </div>

              {git === null ? (
                <p className="text-xs text-fg-muted">Loading git status…</p>
              ) : !git.available ? (
                <p className="text-xs text-fg-muted leading-relaxed">
                  Git integration is disabled for this handler. Enable it by removing{' '}
                  <code className="font-mono text-fg-muted">git: false</code> from the route
                  configuration.
                </p>
              ) : !git.isRepo ? (
                <p className="text-xs text-fg-muted leading-relaxed">
                  The locales directory is not inside a git repository, or the{' '}
                  <code className="font-mono text-fg-muted">git</code> command is not on PATH.
                </p>
              ) : changes.length === 0 ? (
                <p className="text-xs text-fg-muted">
                  Working tree is clean. Edits you save will show up here.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {changes.map((c) => (
                    <li
                      key={c.path}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-surface border border-line"
                    >
                      <span dir="ltr" className="text-[11px] font-mono text-fg break-all">
                        {c.path}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border shrink-0 ${
                          STATUS_STYLES[c.status] ?? STATUS_STYLES.modified
                        }`}
                      >
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {git?.isRepo && changes.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowDiff((v) => !v)}
                    className="text-[10px] font-semibold text-fg-muted hover:text-fg transition duration-150"
                  >
                    {showDiff ? 'Hide diff' : 'Show diff'}
                  </button>
                  {showDiff && (
                    <pre className="max-h-72 overflow-auto rounded-xl bg-surface border border-line p-3 text-[10px] font-mono leading-relaxed whitespace-pre">
                      {git.diff.split('\n').map((line, i) => (
                        <div key={i} className={`px-1 ${diffLineClass(line)}`}>
                          {line || ' '}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              )}
            </section>

            {/* Commit */}
            {git?.isRepo && (
              <section className="space-y-3">
                <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
                  {isGitHub ? 'Propose' : 'Commit'}
                </label>
                {isGitHub && git?.pullRequestUrl && (
                  <a
                    href={git.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[11px] text-accent-fg hover:text-accent-fg underline underline-offset-2"
                  >
                    View the open pull request
                  </a>
                )}
                <textarea
                  id="studio-commit-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isGitLoading || changes.length === 0}
                  placeholder={
                    changes.length === 0
                      ? isGitHub
                        ? 'No changes on the branch yet'
                        : 'Nothing to commit'
                      : isGitHub
                        ? 'Pull request title, e.g. "Update checkout copy"'
                        : 'i18n: describe the copy change…'
                  }
                  maxLength={500}
                  className="w-full min-h-20 bg-surface border border-line hover:border-line-strong focus:border-focus focus:outline-hidden focus:ring-1 focus:ring-focus rounded-xl px-4 py-3 text-xs text-fg placeholder-fg-muted font-sans resize-none transition duration-150 disabled:opacity-60"
                />
                <div className="flex items-center gap-3">
                  <button
                    id="studio-commit-button"
                    onClick={handleCommit}
                    disabled={!canCommit || isGitLoading}
                    className="flex-1 h-10 rounded-xl text-xs font-semibold tracking-wide bg-accent hover:bg-accent-hover active:bg-accent-hover text-on-accent disabled:bg-raised disabled:text-fg-faint disabled:cursor-not-allowed transition duration-150"
                  >
                    {isGitLoading
                      ? 'Working…'
                      : isGitHub
                        ? git?.pullRequestUrl
                          ? 'Pull request is open'
                          : 'Open pull request'
                        : 'Commit locale changes'}
                  </button>
                  {!confirmDiscard ? (
                    <button
                      onClick={() => setConfirmDiscard(true)}
                      disabled={changes.length === 0 || isGitLoading}
                      className="h-10 px-4 rounded-xl text-xs font-semibold text-danger-fg bg-danger-bg hover:bg-danger-bg border border-danger-line disabled:opacity-40 disabled:cursor-not-allowed transition duration-150"
                    >
                      {isGitHub ? 'Reset branch' : 'Discard'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDiscard}
                        disabled={isGitLoading}
                        className="h-10 px-3 rounded-xl text-xs font-semibold text-on-danger bg-danger-solid hover:bg-danger-solid/90 active:bg-danger-solid transition duration-150"
                      >
                        {isGitHub ? 'Reset to base' : 'Discard all'}
                      </button>
                      <button
                        onClick={() => setConfirmDiscard(false)}
                        className="h-10 px-3 rounded-xl text-xs font-semibold text-fg-muted hover:text-fg bg-raised border border-line transition duration-150"
                      >
                        Keep
                      </button>
                    </div>
                  )}
                </div>
                {lastCommit && !gitError && (
                  <p className="text-[11px] text-success-fg font-mono break-all">
                    {isGitHub ? (
                      <>
                        Pull request:{' '}
                        <a
                          href={lastCommit}
                          dir="ltr"
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {lastCommit}
                        </a>
                      </>
                    ) : (
                      <>Committed as {lastCommit}. Push whenever you are ready.</>
                    )}
                  </p>
                )}
                {gitError && (
                  <div className="bg-danger-bg border border-danger-line rounded-xl p-3 text-xs text-danger-fg font-mono break-all">
                    {gitError}
                  </div>
                )}
              </section>
            )}

            {/* Session history */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
                  This session
                </label>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-surface text-fg-muted border border-line">
                  {history.length} edits
                </span>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-fg-muted">No edits saved yet in this session.</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((entry) => (
                    <li
                      key={entry.id}
                      className="px-3 py-2 rounded-xl bg-surface border border-line space-y-1"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span dir="ltr" className="text-[11px] font-mono text-fg break-all">
                          {entry.key}
                          <span className="text-fg-muted"> · {entry.locale}</span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] text-fg-muted font-mono">
                            {formatTime(entry.at)}
                          </span>
                          <button
                            onClick={() => onUndo(entry)}
                            disabled={isUndoing}
                            className="text-[10px] font-semibold text-fg-muted hover:text-fg px-2 py-0.5 rounded-md border border-line hover:border-line-strong disabled:opacity-40 transition duration-150"
                            title="Restore the previous value"
                          >
                            Undo
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] leading-relaxed">
                        <span className="text-danger-fg line-through break-all">
                          {entry.previousValue || <em>empty</em>}
                        </span>
                        <span className="text-fg-muted" aria-hidden="true">
                          {` ${t('common.arrow')} `}
                        </span>
                        <span className="text-success-fg break-all">
                          {entry.nextValue || <em>empty</em>}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
};
