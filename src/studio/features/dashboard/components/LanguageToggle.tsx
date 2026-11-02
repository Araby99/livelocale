import React from 'react';
import type { StudioLanguage } from '../../../preferences.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

/** Each Studio language's name in that language. */
export const LANGUAGE_AUTONYMS: Readonly<Record<StudioLanguage, string>> = {
  en: 'English',
  ar: 'العربية',
};

/** Switches the Studio to the other language; shows that language's own name. */
export const LanguageToggle = () => {
  const { lang, t, setLang } = useStudioText();
  const other: StudioLanguage = lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      id="studio-language-toggle"
      aria-label={t(other === 'ar' ? 'language.switch_to_ar' : 'language.switch_to_en')}
      onClick={() => setLang(other)}
      className="h-7 px-2.5 inline-flex items-center rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors bg-raised hover:bg-raised-hover text-fg border border-line"
    >
      <span lang={other} dir={other === 'ar' ? 'rtl' : undefined}>
        {LANGUAGE_AUTONYMS[other]}
      </span>
    </button>
  );
};
