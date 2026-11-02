import React from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface ConfirmModalProps {
  showConfirmModal: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal = ({ showConfirmModal, onConfirm, onCancel }: ConfirmModalProps) => {
  const { t } = useStudioText();
  const dialogRef = useDialog<HTMLDivElement>(showConfirmModal, onCancel);
  if (!showConfirmModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-confirm-title"
        className="bg-raised border border-line rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
      >
        <h3 id="studio-confirm-title" className="text-base font-bold text-fg font-heading">
          {t('confirm.title')}
        </h3>
        <p className="text-xs text-fg-muted mt-2 leading-relaxed">{t('confirm.body')}</p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-fg-muted hover:text-fg bg-raised hover:bg-raised-hover border border-line hover:border-line-strong rounded-xl transition duration-150"
          >
            {t('confirm.keep')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-semibold bg-transparent border border-dashed border-danger-line text-danger-fg hover:bg-danger-bg rounded-xl shadow-lg transition duration-150"
          >
            {t('confirm.discard')}
          </button>
        </div>
      </div>
    </div>
  );
};
