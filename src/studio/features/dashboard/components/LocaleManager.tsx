import React, { useState } from 'react';
import { isValidLocaleFormat } from '../../../../core/validate.js';
import { LocaleRow } from './LocaleRow.jsx';
import { studioMessage } from '../../../i18n/catalogue.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface LocaleManagerProps {
  locale: string;
  locales: string[];
  isLoading: boolean;
  error: string | null;
  onAddLocale: (code: string) => Promise<void>;
  onRenameLocale: (oldCode: string, newCode: string) => Promise<void>;
  onDeleteLocale: (code: string) => Promise<void>;
}

export const LocaleManager = ({
  locale,
  locales,
  isLoading,
  error,
  onAddLocale,
  onRenameLocale,
  onDeleteLocale,
}: LocaleManagerProps) => {
  const { t } = useStudioText();
  const [newLocaleCode, setNewLocaleCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const code = newLocaleCode.trim();

    if (!code) return;
    if (!isValidLocaleFormat(code)) {
      setLocalError(t('locales.format_hint'));
      return;
    }
    if (locales.includes(code)) {
      setLocalError(t('locales.exists'));
      return;
    }

    try {
      await onAddLocale(code);
      setNewLocaleCode('');
    } catch (err: any) {
      setLocalError(err.message || t('errors.add_locale_failed'));
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
      {/* Add language form */}
      <form onSubmit={handleAdd} className="space-y-2.5">
        <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
          {t('locales.add_label')}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newLocaleCode}
            dir="ltr"
            onChange={(e) => setNewLocaleCode(e.target.value)}
            placeholder={t('locales.add_placeholder')}
            disabled={isLoading}
            className="flex-1 min-w-0 bg-surface border border-line hover:border-line-strong rounded-xl px-4 py-2.5 text-xs text-fg placeholder-fg-muted font-mono transition duration-155"
          />
          <button
            type="submit"
            disabled={isLoading || !newLocaleCode.trim()}
            className="h-10 px-4 bg-raised hover:bg-raised-hover disabled:bg-raised disabled:text-fg-faint text-fg border border-line text-xs font-semibold rounded-xl transition duration-155 flex items-center justify-center gap-1.5 shrink-0"
          >
            {t('locales.add')}
          </button>
        </div>
      </form>

      {/* Errors display */}
      {(localError || error) && (
        <div className="bg-danger-bg border border-dashed border-danger-line rounded-xl p-3 flex items-start gap-[0.625rem]">
          <svg
            className="w-4 h-4 text-danger-fg shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-xs text-danger-fg font-mono leading-normal break-all">
            {studioMessage(t, (localError || error)!)}
          </div>
        </div>
      )}

      {/* Languages list */}
      <div className="flex-1 flex flex-col space-y-2">
        <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider mb-1">
          {t('locales.list')}
        </label>
        <div className="flex-1 overflow-y-auto space-y-2 pe-1 select-none">
          {locales.map((l) => (
            <LocaleRow
              key={l}
              code={l}
              isActive={l === locale}
              isLoading={isLoading}
              allLocales={locales}
              onRename={onRenameLocale}
              onDelete={onDeleteLocale}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
