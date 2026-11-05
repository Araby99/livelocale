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
import { GitHubIssueAction } from './GitHubIssueAction.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import { studioMessage } from '../../../i18n/catalogue.js';
import { useDialog } from '../hooks/useDialog.js';
import { BottomSheet } from './BottomSheet.js';
import { copyText, downloadText, readPref, writePref } from '../../../share/browser.js';

interface SendDialogProps {
  isOpen: boolean;
  onClose(): void;
  drafts: Draft[];
  manifest: ShareManifest | null;
  studioHref: string;
  onMarkSent(ds: readonly Draft[]): Promise<void>;
  /** `sheet` slides up from the bottom on a phone and offers the phone's share menu. */
  presentation?: 'dialog' | 'sheet';
}

type Outcome =
  'copied' | 'copy-failed' | 'shared' | 'share-failed' | 'downloaded' | 'opened' | null;

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

/**
 * Hands `url` to the device's share menu (WhatsApp, Slack, email…). A menu the person
 * dismissed is `cancelled`; a browser without the Web Share API, or one that refuses the
 * link, is `unsupported`, so the caller can point to Copy link instead.
 */
export async function shareLink(
  url: string,
  nav: Pick<Navigator, 'share' | 'canShare'>
): Promise<ShareResult> {
  if (typeof nav.share !== 'function') return 'unsupported';
  if (typeof nav.canShare === 'function' && !nav.canShare({ url })) return 'unsupported';
  try {
    await nav.share({ url });
    return 'shared';
  } catch (err: unknown) {
    // Checked by name: a `DOMException` is not an `Error` in every engine.
    return (err as { name?: unknown } | null)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

/** A batch's link: the one being offered, or the one last copied, saved or opened on GitHub. */
interface BatchLink {
  link: string;
  token: string;
  count: number;
}

const actionButtonBase =
  'px-4 rounded-xl text-xs font-semibold border transition duration-150 disabled:opacity-40 disabled:cursor-not-allowed';

/** Turns the translator's drafts into one change link, copied or saved as a file. */
export const SendDialog = ({
  isOpen,
  onClose,
  drafts,
  manifest,
  studioHref,
  onMarkSent,
  presentation = 'dialog',
}: SendDialogProps) => {
  const { t } = useStudioText();
  const asSheet = presentation === 'sheet';
  // Phones get at least 44 px to tap; the desktop dialog keeps its compact buttons.
  const actionButton = `${actionButtonBase} ${asSheet ? 'min-h-11' : 'h-9'}`;
  const [name, setName] = useState(() => readPref('translator-name') ?? '');
  const [note, setNote] = useState('');
  const [includeSent, setIncludeSent] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(false);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sent, setSent] = useState<BatchLink | null>(null);
  const encodeSeq = useRef(0);
  // The sheet brings its own dialog behaviour.
  const dialogRef = useDialog<HTMLDivElement>(isOpen && manifest !== null && !asSheet, onClose);

  // A fresh dialog each time it opens: a note or "include sent" from an earlier batch
  // must not ride along into the next link.
  useEffect(() => {
    if (!isOpen) return;
    setName(readPref('translator-name') ?? '');
    setNote('');
    setIncludeSent(false);
    setOutcome(null);
    setActionError(null);
    setSent(null);
  }, [isOpen]);

  // Another name, note or selection makes another link, so the sent one is no longer shown.
  useEffect(() => setSent(null), [name, note, includeSent]);

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
    setToken(null);
    setEncodeError(null);
    if (included.length === 0) {
      setEncoding(false);
      return;
    }
    setEncoding(true);
    encodeChangeLink(buildChangeSet({ drafts: included, manifest, by: name, note }))
      .then((token) => {
        if (seq !== encodeSeq.current) return;
        setLink(buildShareLink(studioHref, token));
        setToken(token);
      })
      .catch((err: unknown) => {
        if (seq === encodeSeq.current) {
          setEncodeError(t('send.encode_failed', { reason: describeLinkError(err, t) }));
        }
      })
      .finally(() => {
        if (seq === encodeSeq.current) setEncoding(false);
      });
  }, [isOpen, manifest, included, name, note, studioHref, t]);

  if (!isOpen || !manifest) return null;

  // Once a batch is sent its drafts leave the selection. Until something else is selected,
  // its link stays on screen, copyable, with Open on GitHub.
  const showingSent = included.length === 0 && sent !== null;
  const shown: BatchLink | null = showingSent
    ? sent
    : link !== null && token !== null
      ? { link, token, count: included.length }
      : null;
  const shownLink = shown?.link ?? null;
  const tooLong = shownLink !== null && shownLink.length > CHANGE_LINK_FILE_THRESHOLD;
  const canCopy = !encoding && shownLink !== null && !tooLong;
  const canDownload = !encoding && shownLink !== null;
  // Only on a phone: desktop browsers that have a share menu keep today's Copy link first.
  const canShareNatively = asSheet && typeof navigator.share === 'function';

  /** Reports `done` and marks `batch` sent; the batch already sent is not marked again. */
  const markSent = async (batch: readonly Draft[], done: Outcome) => {
    if (shown === null) return;
    setSent(shown);
    if (showingSent) {
      setOutcome(done);
      return;
    }
    try {
      await onMarkSent(batch);
      setOutcome(done);
    } catch (err: any) {
      setActionError(err?.message || t('send.mark_failed'));
    }
  };

  const handleCopy = async () => {
    if (!shownLink) return;
    const batch = included;
    setActionError(null);
    if (await copyText(shownLink)) await markSent(batch, 'copied');
    else setOutcome('copy-failed');
  };

  // Marked sent only once the share menu reports the link went out, as Copy link does;
  // a dismissed menu changes nothing.
  const handleShare = async () => {
    if (!shownLink) return;
    const batch = included;
    setActionError(null);
    const result = await shareLink(shownLink, navigator);
    if (result === 'shared') await markSent(batch, 'shared');
    else if (result === 'unsupported') setOutcome('share-failed');
  };

  const handleDownload = async () => {
    if (!shownLink) return;
    const batch = included;
    setActionError(null);
    try {
      downloadText(changeFileName('changes', new Date()), shownLink + '\n');
    } catch (err: any) {
      setActionError(err?.message || t('send.save_failed'));
      return;
    }
    await markSent(batch, 'downloaded');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    writePref('translator-name', value === '' ? null : value);
  };

  const content = (
    <>
      <h3 id="studio-send-title" className="text-base font-bold text-fg font-heading">
        {t('send.title')}
      </h3>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-fg-muted">{t('send.name_label')}</span>
        <input
          id="studio-send-name"
          type="text"
          dir="auto"
          maxLength={SEND_NAME_MAX_CHARS}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full h-9 px-3 rounded-xl bg-surface border border-line text-xs text-fg"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-fg-muted">{t('send.note_label')}</span>
        <textarea
          id="studio-send-note"
          dir="auto"
          rows={2}
          maxLength={SEND_NOTE_MAX_CHARS}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs text-fg resize-none"
        />
      </label>

      {alreadySent > 0 && (
        <label className="flex items-center gap-2 text-xs text-fg">
          <input
            type="checkbox"
            checked={includeSent}
            onChange={(e) => setIncludeSent(e.target.checked)}
          />
          {t('send.include_sent', { count: alreadySent })}
        </label>
      )}

      {showingSent ? null : included.length === 0 ? (
        <p className="text-xs text-fg-muted">{t('send.nothing_to_send')}</p>
      ) : (
        <ul data-testid="send-dialog-changes" className="max-h-48 overflow-y-auto space-y-1.5">
          {included.map((d) => (
            <li
              key={`${d.locale}/${d.key}`}
              className="px-3 py-2 rounded-xl bg-surface border border-line space-y-1"
            >
              <span dir="ltr" className="block text-[11px] font-mono text-info-fg break-all">
                {`${d.key} · ${d.locale}`}
              </span>
              <div className="text-[10px] leading-relaxed">
                {d.from ? (
                  <span
                    dir="auto"
                    className="text-fg-muted line-through decoration-fg-faint break-all"
                  >
                    {d.from}
                  </span>
                ) : (
                  <em className="text-fg-muted line-through decoration-fg-faint">
                    {t('send.empty')}
                  </em>
                )}
                <span className="text-fg-muted" aria-hidden="true">
                  {` ${t('common.arrow')} `}
                </span>
                {d.to ? (
                  <span dir="auto" className="text-accent-fg break-all">
                    {d.to}
                  </span>
                ) : (
                  <em className="text-accent-fg">{t('send.empty')}</em>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {overflow > 0 && (
        <p role="status" className="glyph-warn text-xs text-warning-fg">
          {t('send.overflow', { count: included.length, total: included.length + overflow })}
        </p>
      )}

      {encodeError && (
        <p role="alert" className="text-xs text-danger-fg break-words">
          {encodeError}
        </p>
      )}

      {shownLink !== null && !tooLong && (
        <input
          id="studio-send-link"
          data-testid="change-link"
          type="text"
          dir="ltr"
          readOnly
          aria-label={t('send.link_label')}
          value={shownLink}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full h-9 px-3 rounded-xl bg-surface border border-line text-[11px] font-mono text-fg"
        />
      )}
      {tooLong && (
        <p role="status" className="glyph-warn text-xs text-warning-fg">
          {t('send.too_long')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canShareNatively && (
          <button
            type="button"
            id="studio-send-share"
            onClick={handleShare}
            disabled={!canCopy}
            className={`${actionButton} text-on-accent bg-accent hover:bg-accent-hover border-accent-line`}
          >
            {t('send.share')}
          </button>
        )}
        <button
          type="button"
          id="studio-send-copy"
          onClick={handleCopy}
          disabled={!canCopy}
          className={
            canShareNatively
              ? `${actionButton} text-fg hover:text-fg bg-raised hover:bg-raised-hover border-line-strong`
              : `${actionButton} text-on-accent bg-accent hover:bg-accent-hover border-accent-line`
          }
        >
          {t('send.copy')}
        </button>
        <button
          type="button"
          id="studio-send-download"
          onClick={handleDownload}
          disabled={!canDownload}
          className={`${actionButton} text-fg hover:text-fg bg-raised hover:bg-raised-hover border-line-strong`}
        >
          {t('send.download')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`${actionButton} ms-auto text-fg-muted hover:text-fg bg-raised border-line hover:border-line-strong`}
        >
          {t('send.close')}
        </button>
      </div>

      {manifest.repo && shown !== null && !encoding && (
        <div className="space-y-2">
          <GitHubIssueAction
            repo={manifest.repo}
            token={shown.token}
            count={shown.count}
            by={name}
            label={t('send.open_github')}
            onOpened={() => void markSent(included, 'opened')}
          />
          <p className="text-[11px] text-fg-muted">{t('send.github_hint')}</p>
        </div>
      )}

      {outcome === 'copied' && (
        <p role="status" className="glyph-done text-xs text-success-fg">
          {t('send.copied')}
        </p>
      )}
      {outcome === 'shared' && (
        <p role="status" className="glyph-done text-xs text-success-fg">
          {t('send.shared')}
        </p>
      )}
      {outcome === 'share-failed' && (
        <p role="alert" className="glyph-warn text-xs text-warning-fg">
          {t('send.share_failed')}
        </p>
      )}
      {outcome === 'downloaded' && (
        <p role="status" className="glyph-done text-xs text-success-fg">
          {t('send.downloaded')}
        </p>
      )}
      {outcome === 'opened' && (
        <p role="status" className="glyph-done text-xs text-success-fg">
          {t('send.opened')}
        </p>
      )}
      {outcome === 'copy-failed' && (
        <div className="space-y-2">
          <p role="alert" className="glyph-warn text-xs text-warning-fg">
            {t('send.copy_failed')}
          </p>
          <button
            type="button"
            onClick={() => markSent(included, 'copied')}
            className={`${actionButton} text-fg hover:text-fg bg-raised hover:bg-raised-hover border-line-strong`}
          >
            {t('send.copied_confirm')}
          </button>
        </div>
      )}
      {actionError && (
        <p role="alert" className="text-xs text-danger-fg break-words">
          {studioMessage(t, actionError)}
        </p>
      )}
    </>
  );

  if (asSheet) {
    return (
      <BottomSheet open onClose={onClose} labelledBy="studio-send-title">
        <div className="space-y-4">{content}</div>
      </BottomSheet>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-send-title"
        className="bg-raised border border-line rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4"
      >
        {content}
      </div>
    </div>
  );
};
