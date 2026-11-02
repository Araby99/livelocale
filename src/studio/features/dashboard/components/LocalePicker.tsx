import React from 'react';
import { useDialog } from '../hooks/useDialog.js';

interface LocalePickerProps {
  /** The locales to choose from; null keeps the picker closed. */
  candidates: string[] | null;
  onChoose: (locale: string) => void;
  onCancel: () => void;
}

/** Asks which language an Alt+Click edits when neither page text nor address tells. */
export const LocalePicker = ({ candidates, onChoose, onCancel }: LocalePickerProps) => {
  const dialogRef = useDialog<HTMLDivElement>(candidates !== null, onCancel);
  if (candidates === null) return null;

  return (
    <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-locale-picker-title"
        className="bg-raised border border-line rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
      >
        <h3 id="studio-locale-picker-title" className="text-base font-bold text-fg font-heading">
          Which language are you editing?
        </h3>
        <p className="text-xs text-fg-muted mt-2 leading-relaxed">
          LiveLocale could not tell from the page. Your fix will be saved to the language you pick.
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          {candidates.map((locale) => (
            <button
              type="button"
              key={locale}
              onClick={() => onChoose(locale)}
              className="px-4 py-2 text-xs font-mono font-semibold text-accent-fg bg-accent-soft hover:bg-accent-soft border border-accent-line hover:border-accent-line rounded-xl transition duration-150"
            >
              {locale}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-fg-muted hover:text-fg bg-raised border border-line hover:border-line-strong rounded-xl transition duration-150"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
