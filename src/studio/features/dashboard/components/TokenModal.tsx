import React, { useState } from 'react';

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

  if (!isOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 space-y-4"
      >
        <div>
          <h3 className="text-base font-bold text-slate-200 font-outfit">Access token required</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            This app runs i18n Lens in preview mode. Paste the access token configured on the server
            (<code className="font-mono text-slate-300">I18N_LENS_TOKEN</code>) to edit
            translations. It is kept in this browser tab only.
          </p>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="studio-access-token"
            className="text-[11px] font-bold text-slate-500 uppercase tracking-wider"
          >
            Access token
          </label>
          <input
            id="studio-access-token"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-750 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono transition duration-150"
          />
        </div>
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl transition duration-150"
          >
            Connect
          </button>
        </div>
      </form>
    </div>
  );
};
