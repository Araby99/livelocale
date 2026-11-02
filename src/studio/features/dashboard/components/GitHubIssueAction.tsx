import React, { useState } from 'react';
import { buildIssueRequest } from '../../../share/github-issue.js';
import { copyText } from '../../../share/browser.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface GitHubIssueActionProps {
  repo: string;
  token: string;
  count: number;
  by?: string;
  label: string;
  onOpened?: () => void;
}

const actionButton =
  'inline-flex items-center h-8 px-3 rounded-xl text-[11px] font-semibold border transition duration-150 text-fg hover:text-fg bg-raised hover:bg-raised-hover border-line-strong';

/**
 * Opens a pre-filled GitHub issue holding the change block. When the block
 * makes the URL too long, the translator copies it first and pastes it into
 * the issue; when copying fails, the block is shown for manual copy.
 */
export function GitHubIssueAction({
  repo,
  token,
  count,
  by,
  label,
  onOpened,
}: GitHubIssueActionProps) {
  const { t } = useStudioText();
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const request = buildIssueRequest(repo, token, count, by);

  if (request.tooLarge || request.url === null) {
    return (
      <p className="glyph-warn text-[11px] text-warning-fg">
        {t('issue.too_large', { command: 'npx livelocale apply' })}
      </p>
    );
  }

  const link = (text: string) => (
    <a
      href={request.url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onOpened?.()}
      className={actionButton}
    >
      {text}
    </a>
  );

  const block = request.clipboard;
  if (block === null) return link(label);

  const copy = async () => setCopied((await copyText(block)) ? 'ok' : 'failed');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className={actionButton}>
          {t('issue.copy_block')}
        </button>
        {copied !== null && link(t('issue.open_and_paste'))}
      </div>
      {copied === 'failed' && (
        <>
          <p className="text-[11px] text-fg-muted">{t('issue.copy_failed')}</p>
          <textarea
            data-testid="manual-copy"
            readOnly
            value={block}
            rows={4}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-[11px] font-mono text-fg resize-none"
          />
        </>
      )}
    </div>
  );
}
