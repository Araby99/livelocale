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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-locale-picker-title"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
      >
        <h3
          id="studio-locale-picker-title"
          className="text-base font-bold text-slate-200 font-heading"
        >
          Which language are you editing?
        </h3>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          LiveLocale could not tell from the page. Your fix will be saved to the language you pick.
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          {candidates.map((locale) => (
            <button
              type="button"
              key={locale}
              onClick={() => onChoose(locale)}
              className="px-4 py-2 text-xs font-mono font-semibold text-indigo-200 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 hover:border-indigo-400 rounded-xl transition duration-150"
            >
              {locale}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl transition duration-150"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
