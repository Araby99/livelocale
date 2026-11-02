import React, { useState } from 'react';
import { isValidLocaleFormat } from '../../../../core/validate.js';
import { studioMessage } from '../../../i18n/catalogue.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

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
  const { t } = useStudioText();
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
      setLocalError(t('locales.invalid'));
      return;
    }
    if (allLocales.includes(newCode) && newCode !== code) {
      setLocalError(t('locales.target_exists'));
      return;
    }

    try {
      await onRename(code, newCode);
      setEditing(false);
    } catch (err: any) {
      setLocalError(err.message || t('locales.rename_failed'));
    }
  };

  const handleDeleteConfirm = async () => {
    setLocalError(null);
    try {
      await onDelete(code);
      setDeleting(false);
    } catch (err: any) {
      setLocalError(err.message || t('locales.delete_failed'));
    }
  };

  return (
    <div className="bg-surface border border-line hover:border-line rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition duration-200">
      {editing ? (
        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={renameValue}
            dir="ltr"
            onChange={(e) => setRenameValue(e.target.value)}
            disabled={isLoading}
            className="flex-1 bg-surface border border-line rounded-lg px-2.5 py-1 text-xs font-mono text-fg"
            autoFocus
          />
          <button
            onClick={handleRenameSave}
            disabled={isLoading}
            className="p-1 text-success-fg hover:text-success-fg transition duration-150"
            title={t('locales.save_rename')}
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
            className="p-1 text-fg-muted hover:text-fg-muted transition duration-150"
            title={t('locales.cancel')}
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
          <span className="text-[10px] font-semibold text-danger-fg">
            {t('locales.confirm_delete')}
          </span>
          {localError && (
            <span className="text-[10px] text-danger-fg font-mono">
              {studioMessage(t, localError)}
            </span>
          )}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setDeleting(false)}
              disabled={isLoading}
              className="px-2.5 py-1 text-[10px] font-semibold bg-raised hover:bg-raised-hover text-fg rounded-lg transition"
            >
              {t('locales.cancel')}
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={isLoading}
              className="px-2.5 py-1 text-[10px] font-semibold bg-transparent border border-dashed border-danger-line text-danger-fg hover:bg-danger-bg rounded-lg transition"
            >
              {t('locales.delete')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col min-w-0">
            <span dir="ltr" className="text-xs font-semibold text-fg truncate">
              {code}
            </span>
            {isActive && (
              <span className="text-[9px] text-accent-fg font-bold tracking-wide mt-0.5">
                {t('locales.active')}
              </span>
            )}
            {localError && (
              <span className="text-[10px] text-danger-fg font-mono mt-0.5">
                {studioMessage(t, localError)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleStartRename}
              disabled={isLoading}
              className="p-1.5 text-fg-muted hover:text-fg transition duration-150"
              title={t('locales.rename_title')}
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
              className="p-1.5 text-fg-muted hover:text-danger-fg transition duration-150"
              title={t('locales.delete_title')}
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
