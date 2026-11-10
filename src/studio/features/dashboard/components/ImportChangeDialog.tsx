import React, { useEffect, useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface ImportChangeDialogProps {
  isOpen: boolean;
  onClose(): void;
  /** Opens the pasted text as a review; resolves false when it cannot be read. */
  onSubmit(text: string): Promise<boolean>;
  /** Why the last submit failed; shown while the dialog stays open. */
  error: string | null;
}

/** Paste a change link, or choose the file a translator sent, to review it. */
export const ImportChangeDialog = ({
  isOpen,
  onClose,
  onSubmit,
  error,
}: ImportChangeDialogProps) => {
  const { t } = useStudioText();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setText('');
    setFileError(null);
    setSubmitted(false);
  }, [isOpen]);

  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);
  if (!isOpen) return null;

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      setText(await file.text());
    } catch {
      setFileError(t('import.file_failed'));
    }
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const opened = await onSubmit(text);
      setSubmitted(true);
      if (opened) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const shownError = fileError ?? (submitted ? error : null);

  return (
    <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-import-title"
        className="bg-raised border border-line rounded-2xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200 select-text"
      >
        <h3 id="studio-import-title" className="text-base font-bold text-fg font-heading">
          {t('import.title')}
        </h3>
        <p className="text-xs text-fg-muted mt-2 leading-relaxed">{t('import.body')}</p>

        <label htmlFor="studio-import-text" className="block mt-5 text-xs font-semibold text-fg">
          {t('import.paste_label')}
        </label>
        <textarea
          id="studio-import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          spellCheck={false}
          className="mt-2 w-full px-3 py-2 rounded-xl bg-surface border border-line-strong text-xs font-mono text-fg break-all resize-y"
        />

        <label htmlFor="studio-import-file" className="block mt-4 text-xs font-semibold text-fg">
          {t('import.file_label')}
        </label>
        <input
          id="studio-import-file"
          type="file"
          accept=".txt,text/plain"
          onChange={(e) => void chooseFile(e.target.files?.[0])}
          className="mt-2 block w-full text-xs text-fg-muted file:me-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-raised file:text-fg file:text-xs file:font-semibold"
        />

        {shownError && (
          <p role="alert" className="mt-4 text-xs text-danger-fg break-words">
            {shownError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-fg-muted hover:text-fg bg-raised border border-line hover:border-line-strong rounded-xl transition duration-150"
          >
            {t('import.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={text.trim() === '' || isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-on-accent bg-accent border border-accent-line hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition duration-150"
          >
            {t('import.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};
