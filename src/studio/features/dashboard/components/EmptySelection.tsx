import React from 'react';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

interface EmptySelectionProps {
  /** A plain click picks text (tap-to-edit is on), so the hint does not mention Alt. */
  clickToEdit?: boolean;
  /** Browse is on and the Edit switch is there: the hint names it as the way without Alt. */
  canSwitchToEdit?: boolean;
}

export const EmptySelection = ({
  clickToEdit = false,
  canSwitchToEdit = false,
}: EmptySelectionProps) => {
  const { t } = useStudioText();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-16 h-16 rounded-2xl bg-accent-soft border border-accent-line flex items-center justify-center text-fg mb-6">
        <svg className="w-8 h-8 text-fg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
          />
        </svg>
      </div>
      <h3 className="text-fg font-semibold tracking-wide font-heading">{t('empty.title')}</h3>
      <p className="text-sm text-fg-muted max-w-xs mt-2 leading-relaxed">
        {t(clickToEdit ? 'empty.body_click' : canSwitchToEdit ? 'empty.body_switch' : 'empty.body')}
      </p>
    </div>
  );
};
