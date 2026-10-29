import React, { useState } from 'react';
import { buildIssueRequest } from '../../../share/github-issue.js';
import { copyText } from '../../../share/browser.js';

interface GitHubIssueActionProps {
  repo: string;
  token: string;
  count: number;
  by?: string;
  label: string;
  onOpened?: () => void;
}

const TOO_LARGE = 'Too large for a GitHub issue. Run npx livelocale apply with this link instead.';
const COPY_BLOCK = 'Copy change block';
const OPEN_AND_PASTE = 'Open GitHub and paste';
const COPY_FAILED = 'Copying did not work. Copy the block below, then open GitHub and paste it.';

const actionButton =
  'inline-flex items-center h-8 px-3 rounded-xl text-[11px] font-semibold border transition duration-150 text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700';

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
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const request = buildIssueRequest(repo, token, count, by);

  if (request.tooLarge || request.url === null) {
    return <p className="text-[11px] text-amber-300">{TOO_LARGE}</p>;
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
          {COPY_BLOCK}
        </button>
        {copied !== null && link(OPEN_AND_PASTE)}
      </div>
      {copied === 'failed' && (
        <>
          <p className="text-[11px] text-slate-400">{COPY_FAILED}</p>
          <textarea
            data-testid="manual-copy"
            readOnly
            value={block}
            rows={4}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 resize-none"
          />
        </>
      )}
    </div>
  );
}
