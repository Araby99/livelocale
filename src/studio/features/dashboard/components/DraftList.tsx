import React, { useState } from 'react';
import type { Draft } from '../../../transport/drafts.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

export type DraftDisplayState = 'unsent' | 'sent' | 'live' | 'conflict';

export const DRAFT_STATUS_LABELS: Record<DraftDisplayState, string> = {
  unsent: 'Not sent',
  sent: 'Sent',
  live: 'Live now',
  conflict: 'Changed by someone else, please check',
};

const STATE_STYLES: Record<DraftDisplayState, string> = {
  unsent: 'text-warning-fg border-warning-line bg-warning-bg',
  sent: 'text-info-fg border-info-line bg-info-bg',
  live: 'text-success-fg border-success-line bg-success-bg',
  conflict: 'text-danger-fg border-danger-line bg-danger-bg',
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
  /** Drafts the rebuilt site already shows: labelled Live now, with no action. */
  liveNow?: Draft[];
  onDismissLiveNow?: () => void;
}

const stateBadge = (state: DraftDisplayState) => (
  <span
    className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${STATE_STYLES[state]}`}
  >
    {DRAFT_STATUS_LABELS[state]}
  </span>
);

const rowHeading = (d: Draft) => (
  <span dir="ltr" className="text-[11px] font-mono text-fg break-all">
    {`${d.key} · ${d.locale}`}
  </span>
);

/** The draft's built text struck through, then its new text. */
const DraftValues = ({ d }: { d: Draft }) => {
  const { t } = useStudioText();
  return (
    <div className="text-[10px] leading-relaxed">
      {d.from ? (
        <span dir="auto" className="text-danger-fg line-through break-all">
          {d.from}
        </span>
      ) : (
        <em className="text-danger-fg line-through">empty</em>
      )}
      <span className="text-fg-muted" aria-hidden="true">
        {` ${t('common.arrow')} `}
      </span>
      {d.to ? (
        <span dir="auto" className="text-success-fg break-all">
          {d.to}
        </span>
      ) : (
        <em className="text-success-fg">empty</em>
      )}
    </div>
  );
};

const rowClass = 'px-3 py-2 rounded-xl bg-surface border border-line space-y-1';

const footerButton =
  'h-9 px-3 rounded-xl text-xs font-semibold text-fg hover:text-fg bg-raised hover:bg-raised-hover border border-line-strong transition duration-150 cursor-pointer';

/** The share link's drafts with before/after, state and Undo, plus backup and restore. */
export const DraftList = ({
  drafts,
  onUndo,
  isUndoing,
  onDownloadBackup,
  onRestoreBackup,
  onReviewChange,
  liveNow = [],
  onDismissLiveNow,
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
        <h3 className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
          Your changes
        </h3>
        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-surface text-fg border border-line">
          {drafts.length}
        </span>
      </div>

      {drafts.length === 0 && liveNow.length === 0 ? (
        <p className="text-xs text-fg-muted">
          No changes yet. Alt+Click any text in the app to fix it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {drafts.map((d) => {
            const state = draftDisplayState(d);
            const isSent = state === 'sent';
            return (
              <li key={`${d.locale}/${d.key}`} className={rowClass}>
                <div className="flex items-center justify-between gap-3">
                  {rowHeading(d)}
                  <div className="flex items-center gap-2 shrink-0">
                    {stateBadge(state)}
                    <button
                      onClick={() => onUndo(d)}
                      disabled={isUndoing}
                      className="text-[10px] font-semibold text-fg-muted hover:text-fg px-2 py-0.5 rounded-md border border-line hover:border-line-strong disabled:opacity-40 transition duration-150"
                      title={isSent ? REMOVE_TITLE : 'Go back to the published text'}
                    >
                      {isSent ? 'Remove' : 'Undo'}
                    </button>
                  </div>
                </div>
                <DraftValues d={d} />
              </li>
            );
          })}
          {liveNow.map((d) => (
            <li key={`live:${d.locale}/${d.key}`} className={rowClass}>
              <div className="flex items-center justify-between gap-3">
                {rowHeading(d)}
                <div className="flex items-center gap-2 shrink-0">{stateBadge('live')}</div>
              </div>
              <DraftValues d={d} />
            </li>
          ))}
        </ul>
      )}
      {liveNow.length > 0 && onDismissLiveNow && (
        <button
          onClick={onDismissLiveNow}
          className="text-[10px] font-semibold text-fg-muted hover:text-fg transition duration-150"
        >
          Dismiss live changes
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          onClick={handleDownload}
          disabled={drafts.length === 0}
          className={`${footerButton} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
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
        <p role="status" className="text-[11px] text-fg-muted break-words">
          {result}
        </p>
      )}
    </section>
  );
};
