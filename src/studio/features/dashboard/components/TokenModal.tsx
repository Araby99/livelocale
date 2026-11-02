import React, { useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';

interface TokenModalProps {
  isOpen: boolean;
  onSubmit: (token: string) => void;
}

/**
 * Asked for once per browser session when the app's mutation API requires a
 * bearer token (preview mode). The token is kept in sessionStorage only.
 */
export const TokenModal = ({ isOpen, onSubmit }: TokenModalProps) => {
  const [value, setValue] = useState('');
  // No Escape: the Studio cannot edit anything until a token is given.
  const dialogRef = useDialog<HTMLFormElement>(isOpen);

  if (!isOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4">
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-token-title"
        onSubmit={submit}
        className="bg-raised border border-line rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 space-y-4"
      >
        <div>
          <h3 id="studio-token-title" className="text-base font-bold text-fg font-heading">
            Access token required
          </h3>
          <p className="text-xs text-fg-muted mt-2 leading-relaxed">
            This app runs LiveLocale in preview mode. Paste the access token configured on the
            server (<code className="font-mono text-fg">LIVELOCALE_TOKEN</code>) to edit
            translations. It is kept in this browser tab only.
          </p>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="studio-access-token"
            className="text-[11px] font-bold text-fg-muted uppercase tracking-wider"
          >
            Access token
          </label>
          <input
            id="studio-access-token"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full bg-surface border border-line hover:border-line-strong focus:border-focus focus:outline-hidden focus:ring-1 focus:ring-focus rounded-xl px-4 py-2.5 text-sm text-fg font-mono transition duration-150"
          />
        </div>
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-4 py-2 text-xs font-semibold text-fg bg-raised hover:bg-raised-hover active:bg-raised-hover border border-line disabled:bg-raised disabled:text-fg-faint disabled:cursor-not-allowed rounded-xl transition duration-150"
          >
            Connect
          </button>
        </div>
      </form>
    </div>
  );
};
