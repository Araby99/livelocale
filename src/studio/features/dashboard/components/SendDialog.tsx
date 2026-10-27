import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CHANGE_LINK_FILE_THRESHOLD, encodeChangeLink } from '../../../../core/change-link.js';
import type { ShareManifest } from '../../../../core/share-manifest.js';
import type { Draft } from '../../../transport/drafts.js';
import {
  buildChangeSet,
  buildShareLink,
  changeFileName,
  describeLinkError,
  selectDraftsForSend,
  SEND_NAME_MAX_CHARS,
  SEND_NOTE_MAX_CHARS,
} from '../../../share/send.js';
import { copyText, downloadText, readPref, writePref } from '../../../share/browser.js';

interface SendDialogProps {
  isOpen: boolean;
  onClose(): void;
  drafts: Draft[];
  manifest: ShareManifest | null;
  studioHref: string;
  onMarkSent(ds: readonly Draft[]): Promise<void>;
}

type Outcome = 'copied' | 'copy-failed' | 'downloaded' | null;

const COPIED = 'Link copied. Paste it to your developer in chat or email.';
const COPY_FAILED =
  'Copy did not work in this browser. Select the link above, copy it, then press “I copied it”.';
const DOWNLOADED = 'File saved. Send it to your developer.';
const TOO_LONG = 'This batch is too long for a chat message. Use Download file instead.';
const NOTHING_TO_SEND = 'There are no changes to send.';

const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

const actionButton =
  'h-9 px-4 rounded-xl text-xs font-semibold border transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed';

/** Turns the translator's drafts into one change link, copied or saved as a file. */
export const SendDialog = ({
  isOpen,
  onClose,
  drafts,
  manifest,
  studioHref,
  onMarkSent,
}: SendDialogProps) => {
  const [name, setName] = useState(() => readPref('translator-name') ?? '');
  const [note, setNote] = useState('');
  const [includeSent, setIncludeSent] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(false);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const encodeSeq = useRef(0);

  // A fresh dialog each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    setName(readPref('translator-name') ?? '');
    setOutcome(null);
    setActionError(null);
  }, [isOpen]);

  const alreadySent = useMemo(
    () => drafts.filter((d) => d.status === 'sent' && !d.conflict).length,
    [drafts]
  );
  const { included, overflow } = useMemo(
    () => selectDraftsForSend(drafts, { includeSent }),
    [drafts, includeSent]
  );

  // Re-encode when the batch, name or note changes; a later run wins over a slower earlier one.
  useEffect(() => {
    if (!isOpen || !manifest) return;
    const seq = ++encodeSeq.current;
    setLink(null);
    setEncodeError(null);
    if (included.length === 0) {
      setEncoding(false);
      return;
    }
    setEncoding(true);
    encodeChangeLink(buildChangeSet({ drafts: included, manifest, by: name, note }))
      .then((token) => {
        if (seq === encodeSeq.current) setLink(buildShareLink(studioHref, token));
      })
      .catch((err: unknown) => {
        if (seq === encodeSeq.current) {
          setEncodeError('Could not create the link: ' + describeLinkError(err));
        }
      })
      .finally(() => {
        if (seq === encodeSeq.current) setEncoding(false);
      });
  }, [isOpen, manifest, included, name, note, studioHref]);

  if (!isOpen || !manifest) return null;

  const tooLong = link !== null && link.length > CHANGE_LINK_FILE_THRESHOLD;
  const canCopy = !encoding && link !== null && !tooLong;
  const canDownload = !encoding && link !== null;

  const markSent = async (batch: readonly Draft[], done: Outcome) => {
    try {
      await onMarkSent(batch);
      setOutcome(done);
    } catch (err: any) {
      setActionError(err?.message || 'Could not mark the changes as sent.');
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    const batch = included;
    setActionError(null);
    if (await copyText(link)) await markSent(batch, 'copied');
    else setOutcome('copy-failed');
  };

  const handleDownload = async () => {
    if (!link) return;
    const batch = included;
    setActionError(null);
    try {
      downloadText(changeFileName('changes', new Date()), link + '\n');
    } catch (err: any) {
      setActionError(err?.message || 'Could not save the file.');
      return;
    }
    await markSent(batch, 'downloaded');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    writePref('translator-name', value === '' ? null : value);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-send-title"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4"
      >
        <h3 id="studio-send-title" className="text-base font-bold text-slate-200 font-outfit">
          Send to developer
        </h3>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">Your name</span>
          <input
            id="studio-send-name"
            type="text"
            dir="auto"
            maxLength={SEND_NAME_MAX_CHARS}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">
            Note for the developer (optional)
          </span>
          <textarea
            id="studio-send-note"
            dir="auto"
            rows={2}
            maxLength={SEND_NOTE_MAX_CHARS}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </label>

        {alreadySent > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={includeSent}
              onChange={(e) => setIncludeSent(e.target.checked)}
            />
            {`Also include ${changes(alreadySent)} already sent`}
          </label>
        )}

        {included.length === 0 ? (
          <p className="text-xs text-slate-500">{NOTHING_TO_SEND}</p>
        ) : (
          <ul data-testid="send-dialog-changes" className="max-h-48 overflow-y-auto space-y-1.5">
            {included.map((d) => (
              <li
                key={`${d.locale}/${d.key}`}
                className="px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1"
              >
                <span className="block text-[11px] font-mono text-indigo-400 break-all">
                  {`${d.key} · ${d.locale}`}
                </span>
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
            ))}
          </ul>
        )}

        {overflow > 0 && (
          <p className="text-xs text-amber-300">
            {`${included.length} of ${included.length + overflow} changes are in this link. Send again for the rest.`}
          </p>
        )}

        {encodeError && <p className="text-xs text-rose-400 break-words">{encodeError}</p>}

        {link !== null && !tooLong && (
          <input
            id="studio-send-link"
            data-testid="change-link"
            type="text"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300"
          />
        )}
        {tooLong && <p className="text-xs text-amber-300">{TOO_LONG}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="studio-send-copy"
            onClick={handleCopy}
            disabled={!canCopy}
            className={`${actionButton} text-indigo-100 bg-indigo-600 hover:bg-indigo-500 border-indigo-500`}
          >
            Copy link
          </button>
          <button
            id="studio-send-download"
            onClick={handleDownload}
            disabled={!canDownload}
            className={`${actionButton} text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700`}
          >
            Download file
          </button>
          <button
            onClick={onClose}
            className={`${actionButton} ml-auto text-slate-400 hover:text-slate-200 bg-slate-800 border-slate-800 hover:border-slate-700`}
          >
            Close
          </button>
        </div>

        {outcome === 'copied' && (
          <p role="status" className="text-xs text-emerald-300">
            {COPIED}
          </p>
        )}
        {outcome === 'downloaded' && (
          <p role="status" className="text-xs text-emerald-300">
            {DOWNLOADED}
          </p>
        )}
        {outcome === 'copy-failed' && (
          <div role="status" className="space-y-2">
            <p className="text-xs text-amber-300">{COPY_FAILED}</p>
            <button
              onClick={() => markSent(included, 'copied')}
              className={`${actionButton} text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700`}
            >
              I copied it
            </button>
          </div>
        )}
        {actionError && <p className="text-xs text-rose-400 break-words">{actionError}</p>}
      </div>
    </div>
  );
};
