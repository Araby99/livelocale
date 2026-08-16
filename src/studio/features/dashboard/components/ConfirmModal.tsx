import React from 'react';

interface ConfirmModalProps {
  showConfirmModal: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal = ({ showConfirmModal, onConfirm, onCancel }: ConfirmModalProps) => {
  if (!showConfirmModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-base font-bold text-slate-200 font-outfit">Unsaved Changes</h3>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          You have unsaved edits in your translation. Selecting another element will discard these
          modifications. Do you want to discard your edits?
        </p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-850 hover:border-slate-700 rounded-xl transition duration-150"
          >
            Keep Editing
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-lg shadow-rose-600/10 active:bg-rose-700 transition duration-150"
          >
            Discard Edits
          </button>
        </div>
      </div>
    </div>
  );
};
