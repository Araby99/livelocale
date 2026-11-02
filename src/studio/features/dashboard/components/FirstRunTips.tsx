import React from 'react';
import { FIRST_RUN_TIPS } from '../hooks/useFirstRun.js';
import { useDialog } from '../hooks/useDialog.js';

interface FirstRunTipsProps {
  open: boolean;
  name: string;
  onNameChange(v: string): void;
  onDismiss(): void;
}

/** Three short tips and an optional name, shown once to a new translator. */
export const FirstRunTips = ({ open, name, onNameChange, onDismiss }: FirstRunTipsProps) => {
  const dialogRef = useDialog<HTMLDivElement>(open, onDismiss);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-tips-title"
        className="bg-raised border border-line rounded-2xl w-full max-w-md p-6 shadow-2xl"
      >
        <h3 id="studio-tips-title" className="text-base font-bold text-fg font-heading">
          Welcome to LiveLocale
        </h3>
        <ol className="mt-3 space-y-2 list-decimal list-inside text-xs text-fg leading-relaxed">
          {FIRST_RUN_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ol>
        <label
          htmlFor="studio-tips-name"
          className="block mt-5 text-xs font-semibold text-fg-muted"
        >
          Your name (optional, credited in the pull request)
        </label>
        <input
          id="studio-tips-name"
          type="text"
          maxLength={80}
          dir="auto"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="mt-1 w-full h-9 px-3 rounded-xl bg-surface border border-line text-xs text-fg focus:outline-none focus:border-focus"
        />
        <div className="flex items-center justify-end mt-6">
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 text-xs font-semibold text-on-accent bg-accent hover:bg-accent-hover rounded-xl transition duration-150"
          >
            Start editing
          </button>
        </div>
      </div>
    </div>
  );
};
