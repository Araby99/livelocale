import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { saveLanguage, type StudioLanguage } from '../preferences.js';
import { englishText, textDirection, textFor, type StudioText } from './catalogue.js';

export interface StudioLanguageState {
  lang: StudioLanguage;
  dir: 'ltr' | 'rtl';
  t: StudioText;
  setLang(lang: StudioLanguage): void;
}

const ENGLISH: StudioLanguageState = {
  lang: 'en',
  dir: 'ltr',
  t: englishText,
  setLang: () => {},
};

const StudioLanguageContext = createContext<StudioLanguageState>(ENGLISH);

function mirrorDocument(lang: StudioLanguage): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = textDirection(lang);
}

/** Holds the Studio language, remembers a switch, and mirrors it on the document root. */
export function StudioLanguageProvider({
  initial,
  children,
}: {
  initial: StudioLanguage;
  children: React.ReactNode;
}): JSX.Element {
  const [lang, setLangState] = useState<StudioLanguage>(initial);

  useEffect(() => {
    mirrorDocument(lang);
  }, [lang]);

  const setLang = useCallback((next: StudioLanguage) => {
    saveLanguage(next);
    setLangState(next);
    mirrorDocument(next);
  }, []);

  const state = useMemo<StudioLanguageState>(
    () => ({ lang, dir: textDirection(lang), t: textFor(lang), setLang }),
    [lang, setLang]
  );

  return <StudioLanguageContext.Provider value={state}>{children}</StudioLanguageContext.Provider>;
}

/** Outside a provider: English, 'ltr', englishText, and a setLang that does nothing. */
export function useStudioText(): StudioLanguageState {
  return useContext(StudioLanguageContext);
}
