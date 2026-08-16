import React, { useState } from 'react';
import { isValidLocaleFormat } from '../../../../core/validate.js';

interface LocaleRowProps {
  code: string;
  isActive: boolean;
  isLoading: boolean;
  allLocales: string[];
  onRename: (oldCode: string, newCode: string) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
}

export const LocaleRow = ({
  code,
  isActive,
  isLoading,
  allLocales,
  onRename,
  onDelete,
}: LocaleRowProps) => {
  const [editing, setEditing] = useState(false);
  const [renameValue, setRenameValue] = useState(code);
  const [deleting, setDeleting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleStartRename = () => {
    setRenameValue(code);
    setLocalError(null);
    setEditing(true);
  };

  const handleRenameSave = async () => {
    setLocalError(null);
    const newCode = renameValue.trim();

    if (!newCode || newCode === code) {
      setEditing(false);
      return;
    }
    if (!isValidLocaleFormat(newCode)) {
      setLocalError('Invalid locale format.');
      return;
    }
    if (allLocales.includes(newCode) && newCode !== code) {
      setLocalError('Target locale already exists.');
      return;
    }

    try {
      await onRename(code, newCode);
      setEditing(false);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to rename.');
    }
  };

  const handleDeleteConfirm = async () => {
    setLocalError(null);
    try {
      await onDelete(code);
      setDeleting(false);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to delete.');
    }
  };

  return (
    <div className="bg-slate-950/40 border border-slate-850 hover:border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition duration-200">
      {editing ? (
        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            disabled={isLoading}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-hidden focus:border-indigo-500"
            autoFocus
          />
          <button
            onClick={handleRenameSave}
            disabled={isLoading}
            className="p-1 text-emerald-400 hover:text-emerald-300 transition duration-150"
            title="Save rename"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={isLoading}
            className="p-1 text-slate-500 hover:text-slate-400 transition duration-150"
            title="Cancel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ) : deleting ? (
        <div className="flex-1 flex flex-col gap-2">
          <span className="text-[10px] font-semibold text-rose-400">
            Confirm deletion? This deletes the translation file.
          </span>
          {localError && <span className="text-[10px] text-rose-400 font-mono">{localError}</span>}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setDeleting(false)}
              disabled={isLoading}
              className="px-2.5 py-1 text-[10px] font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={isLoading}
              className="px-2.5 py-1 text-[10px] font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition shadow-sm shadow-rose-600/10"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-slate-200 truncate">{code}</span>
            {isActive && (
              <span className="text-[9px] text-indigo-400 font-bold tracking-wide mt-0.5">
                ACTIVE WORKSPACE
              </span>
            )}
            {localError && (
              <span className="text-[10px] text-rose-400 font-mono mt-0.5">{localError}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleStartRename}
              disabled={isLoading}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition duration-150"
              title="Rename locale code"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </button>
            <button
              onClick={() => {
                setLocalError(null);
                setDeleting(true);
              }}
              disabled={isLoading}
              className="p-1.5 text-slate-500 hover:text-rose-400 transition duration-150"
              title="Delete locale"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
