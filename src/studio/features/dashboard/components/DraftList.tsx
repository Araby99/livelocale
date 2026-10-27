import React, { useState } from 'react';
import type { Draft } from '../../../transport/drafts.js';

export type DraftDisplayState = 'unsent' | 'sent' | 'live' | 'conflict';

export const DRAFT_STATUS_LABELS: Record<DraftDisplayState, string> = {
  unsent: 'Not sent',
  sent: 'Sent',
  live: 'Live now',
  conflict: 'Changed by someone else, please check',
};

const STATE_STYLES: Record<DraftDisplayState, string> = {
  unsent: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  sent: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  live: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  conflict: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
};

const REMOVE_TITLE = 'Removes it from this list. A link you already sent still carries it.';

/** How a saved draft is shown: a conflict wins over its send status. */
export function draftDisplayState(d: Draft): Exclude<DraftDisplayState, 'live'> {
  return d.conflict ? 'conflict' : d.status;
}

interface DraftListProps {
  drafts: Draft[];
  onUndo: (d: Draft) => Promise<void>;
  isUndoing: boolean;
  onDownloadBackup: () => Promise<void>;
  onRestoreBackup: (file: File) => Promise<string>;
  onReviewChange?: () => void;
}

const footerButton =
  'h-9 px-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition duration-150 cursor-pointer';

/** The share link's drafts with before/after, state and Undo, plus backup and restore. */
export const DraftList = ({
  drafts,
  onUndo,
  isUndoing,
  onDownloadBackup,
  onRestoreBackup,
  onReviewChange,
}: DraftListProps) => {
  const [result, setResult] = useState<string | null>(null);

  const handleDownload = async () => {
    setResult(null);
    try {
      await onDownloadBackup();
      setResult('Backup downloaded.');
    } catch (err: any) {
      setResult(err?.message || 'Could not create the backup.');
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setResult(null);
    try {
      setResult(await onRestoreBackup(file));
    } catch (err: any) {
      setResult(err?.message || 'Could not restore the backup.');
    } finally {
      // Lets the same file be chosen again.
      input.value = '';
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Your changes
        </h3>
        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-950 text-indigo-400 border border-slate-850">
          {drafts.length}
        </span>
      </div>

      {drafts.length === 0 ? (
        <p className="text-xs text-slate-500">
          No changes yet. Alt+Click any text in the app to fix it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {drafts.map((d) => {
            const state = draftDisplayState(d);
            const isSent = state === 'sent';
            return (
              <li
                key={`${d.locale}/${d.key}`}
                className="px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-mono text-indigo-400 break-all">
                    {`${d.key} · ${d.locale}`}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${STATE_STYLES[state]}`}
                    >
                      {DRAFT_STATUS_LABELS[state]}
                    </span>
                    <button
                      onClick={() => onUndo(d)}
                      disabled={isUndoing}
                      className="text-[10px] font-semibold text-slate-400 hover:text-slate-100 px-2 py-0.5 rounded-md border border-slate-800 hover:border-slate-600 disabled:opacity-40 transition duration-150"
                      title={isSent ? REMOVE_TITLE : 'Go back to the published text'}
                    >
                      {isSent ? 'Remove' : 'Undo'}
                    </button>
                  </div>
                </div>
                <div className="text-[10px] leading-relaxed">
                  {d.from ? (
                    <span dir="auto" className="text-rose-400/80 line-through break-all">
                      {d.from}
                    </span>
                  ) : (
                    <em className="text-rose-400/80 line-through">empty</em>
                  )}
                  <span className="text-slate-600"> → </span>
                  {d.to ? (
                    <span dir="auto" className="text-emerald-300 break-all">
                      {d.to}
                    </span>
                  ) : (
                    <em className="text-emerald-300">empty</em>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button onClick={handleDownload} className={footerButton}>
          Download backup
        </button>
        <label className={`${footerButton} inline-flex items-center`}>
          Restore backup
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={handleRestore}
            className="sr-only"
          />
        </label>
        {onReviewChange && (
          <button onClick={onReviewChange} className={footerButton}>
            Review a change link or file
          </button>
        )}
      </div>
      {result && (
        <p role="status" className="text-[11px] text-slate-400 break-words">
          {result}
        </p>
      )}
    </section>
  );
};
