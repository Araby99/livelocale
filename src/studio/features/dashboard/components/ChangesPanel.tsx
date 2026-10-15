import React, { useState } from 'react';
import type { GitState } from '../../../api.js';
import type { HistoryEntry } from '../hooks/useHistory.js';

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
}

const STATUS_STYLES: Record<string, string> = {
  modified: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  added: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  deleted: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  renamed: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
};

const diffLineClass = (line: string): string => {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-slate-500';
  if (line.startsWith('@@')) return 'text-indigo-400';
  if (line.startsWith('diff ') || line.startsWith('new file')) return 'text-slate-600';
  if (line.startsWith('+')) return 'text-emerald-300 bg-emerald-500/10';
  if (line.startsWith('-')) return 'text-rose-300 bg-rose-500/10';
  return 'text-slate-400';
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
}: ChangesPanelProps) => {
  const [message, setMessage] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  if (!isOpen) return null;

  const changes = git?.changes ?? [];
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
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]" onClick={onClose} />

      <aside className="relative w-[520px] max-w-full h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-wide font-outfit text-slate-200">Changes</h2>
            {git?.isRepo && git.branch && (
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-indigo-400">
                {git.branch}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition duration-150"
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
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition duration-150"
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Git status */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Locale files
              </label>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-950 text-indigo-400 border border-slate-850">
                {changes.length} changed
              </span>
            </div>

            {git === null ? (
              <p className="text-xs text-slate-500">Loading git status…</p>
            ) : !git.available ? (
              <p className="text-xs text-slate-500 leading-relaxed">
                Git integration is disabled for this handler. Enable it by removing{' '}
                <code className="font-mono text-slate-400">git: false</code> from the route
                configuration.
              </p>
            ) : !git.isRepo ? (
              <p className="text-xs text-slate-500 leading-relaxed">
                The locales directory is not inside a git repository, or the{' '}
                <code className="font-mono text-slate-400">git</code> command is not on PATH.
              </p>
            ) : changes.length === 0 ? (
              <p className="text-xs text-slate-500">
                Working tree is clean. Edits you save will show up here.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {changes.map((c) => (
                  <li
                    key={c.path}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-800/80"
                  >
                    <span className="text-[11px] font-mono text-slate-300 break-all">{c.path}</span>
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
                  className="text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition duration-150"
                >
                  {showDiff ? 'Hide diff' : 'Show diff'}
                </button>
                {showDiff && (
                  <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 border border-slate-800 p-3 text-[10px] font-mono leading-relaxed whitespace-pre">
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
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Commit
              </label>
              <textarea
                id="studio-commit-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={isGitLoading || changes.length === 0}
                placeholder={
                  changes.length === 0 ? 'Nothing to commit' : 'i18n: describe the copy change…'
                }
                maxLength={500}
                className="w-full min-h-20 bg-slate-950 border border-slate-800 hover:border-slate-750 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-600 font-sans resize-none transition duration-150 disabled:opacity-60"
              />
              <div className="flex items-center gap-3">
                <button
                  id="studio-commit-button"
                  onClick={handleCommit}
                  disabled={!canCommit || isGitLoading}
                  className="flex-1 h-10 rounded-xl text-xs font-semibold tracking-wide bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed transition duration-150"
                >
                  {isGitLoading ? 'Working…' : 'Commit locale changes'}
                </button>
                {!confirmDiscard ? (
                  <button
                    onClick={() => setConfirmDiscard(true)}
                    disabled={changes.length === 0 || isGitLoading}
                    className="h-10 px-4 rounded-xl text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition duration-150"
                  >
                    Discard
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDiscard}
                      disabled={isGitLoading}
                      className="h-10 px-3 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition duration-150"
                    >
                      Discard all
                    </button>
                    <button
                      onClick={() => setConfirmDiscard(false)}
                      className="h-10 px-3 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-850 transition duration-150"
                    >
                      Keep
                    </button>
                  </div>
                )}
              </div>
              {lastCommit && !gitError && (
                <p className="text-[11px] text-emerald-400 font-mono">
                  Committed as {lastCommit}. Push whenever you are ready.
                </p>
              )}
              {gitError && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400 font-mono break-all">
                  {gitError}
                </div>
              )}
            </section>
          )}

          {/* Session history */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                This session
              </label>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-850">
                {history.length} edits
              </span>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-slate-500">No edits saved yet in this session.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-mono text-indigo-400 break-all">
                        {entry.key}
                        <span className="text-slate-600"> · {entry.locale}</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] text-slate-600 font-mono">
                          {formatTime(entry.at)}
                        </span>
                        <button
                          onClick={() => onUndo(entry)}
                          disabled={isUndoing}
                          className="text-[10px] font-semibold text-slate-400 hover:text-slate-100 px-2 py-0.5 rounded-md border border-slate-800 hover:border-slate-600 disabled:opacity-40 transition duration-150"
                          title="Restore the previous value"
                        >
                          Undo
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] leading-relaxed">
                      <span className="text-rose-400/80 line-through break-all">
                        {entry.previousValue || <em>empty</em>}
                      </span>
                      <span className="text-slate-600"> → </span>
                      <span className="text-emerald-300 break-all">
                        {entry.nextValue || <em>empty</em>}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
};
