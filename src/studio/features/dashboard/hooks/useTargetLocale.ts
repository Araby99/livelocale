import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectedElement } from '../types/index.js';
import type { VisibleText } from '../../../../client/iframe-bridge.js';
import {
  chooseLocaleOnClick,
  chooseLocaleOnNavigation,
  chooseLocaleOnPageTexts,
  isLocaleConfirmed,
  localeMismatch,
  matchLocalesByText,
  matchLocalesByVisibleTexts,
  type CurrentLocale,
  type LocaleSource,
  type TextCandidates,
} from '../../../locale-inference.js';

/** `localStorage` key prefix for the confirmed target locale; the draft scope follows it. */
export const TARGET_LOCALE_STORAGE_PREFIX = 'livelocale-target-locale:';

export interface UseTargetLocaleParams {
  /** True on a share link (static mode); false keeps today's server-stack behaviour. */
  enabled: boolean;
  /** The draft scope the confirmed locale is remembered under; null remembers nothing. */
  scope: string | null;
  /** The Studio's current locale. */
  locale: string;
  /** Sets the locale; used for inferred and manual decisions. */
  setLocale: (locale: string) => void;
  /** What the editor's language menu calls when `enabled` is false; defaults to `setLocale`. */
  setMenuLocale?: (locale: string) => void;
  locales: readonly string[];
  getCandidates: () => Promise<TextCandidates>;
}

function readRemembered(scope: string): string | null {
  try {
    return localStorage.getItem(TARGET_LOCALE_STORAGE_PREFIX + scope);
  } catch {
    return null;
  }
}

function writeRemembered(scope: string, locale: string): void {
  try {
    localStorage.setItem(TARGET_LOCALE_STORAGE_PREFIX + scope, locale);
  } catch {
    // Storage blocked: the locale is simply not remembered.
  }
}

/**
 * The locale a share-link edit is written to, and why. It is inferred from
 * the page text, then the page address, then a required pick; a manual
 * choice is never overridden, and a confirmed locale is remembered per link.
 * Disabled (server stacks), it passes locale changes straight through.
 */
export const useTargetLocale = ({
  enabled,
  scope,
  locale,
  setLocale,
  setMenuLocale = setLocale,
  locales,
  getCandidates,
}: UseTargetLocaleParams) => {
  const [source, setSource] = useState<LocaleSource | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [pickerCandidates, setPickerCandidates] = useState<string[] | null>(null);

  // Latest values for the async handlers; updated synchronously on each decision.
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const pendingRef = useRef<SelectedElement | null>(null);
  const restoredScopeRef = useRef<string | null>(null);

  const current = (): CurrentLocale => ({
    locale: localeRef.current,
    source: sourceRef.current,
  });

  /** Applies a decision when it changes the locale or its source. */
  const apply = (next: CurrentLocale) => {
    const now = current();
    if (next.locale === now.locale && next.source === now.source) return;
    localeRef.current = next.locale;
    sourceRef.current = next.source;
    setLocale(next.locale);
    setSource(next.source);
    if (scope !== null && isLocaleConfirmed(next)) writeRemembered(scope, next.locale);
  };

  // On start, restore the locale confirmed on an earlier visit, while it is still listed.
  useEffect(() => {
    if (!enabled || scope === null || restoredScopeRef.current === scope) return;
    if (sourceRef.current !== null) return;
    const remembered = readRemembered(scope);
    if (remembered === null || !locales.includes(remembered)) return;
    restoredScopeRef.current = scope;
    localeRef.current = remembered;
    sourceRef.current = 'remembered';
    setLocale(remembered);
    setSource('remembered');
  }, [enabled, scope, locales]);

  const onUrlLocale = (urlLocale: string) => {
    if (!enabled) {
      setLocale(urlLocale);
      return;
    }
    apply(chooseLocaleOnNavigation(urlLocale, current()));
  };

  const onVisibleTexts = async (texts: readonly VisibleText[]) => {
    if (!enabled) return;
    const candidates = await getCandidates();
    apply(chooseLocaleOnPageTexts(matchLocalesByVisibleTexts(texts, candidates), current()));
  };

  const resolveForSelection = async (el: SelectedElement): Promise<boolean> => {
    if (!enabled) return true;
    const candidates = await getCandidates();
    const matches = matchLocalesByText(el.key, [el.currentValue], candidates);
    const now = current();
    setMismatch(localeMismatch(matches, now));
    const choice = chooseLocaleOnClick(matches, now, locales);
    if ('pick' in choice) {
      // Nothing to pick from: keep the current locale rather than show an empty picker.
      if (choice.pick.length === 0) return true;
      pendingRef.current = el;
      setPickerCandidates(choice.pick);
      return false;
    }
    apply(choice);
    return true;
  };

  const choose = (chosen: string): SelectedElement | null => {
    // A manual choice always goes through, even when the locale is unchanged.
    localeRef.current = chosen;
    sourceRef.current = 'manual';
    setLocale(chosen);
    setSource('manual');
    if (scope !== null) writeRemembered(scope, chosen);
    setMismatch(null);
    setPickerCandidates(null);
    const pending = pendingRef.current;
    pendingRef.current = null;
    return pending;
  };

  const onMenuLocale = (chosen: string) => {
    if (enabled) choose(chosen);
    else setMenuLocale(chosen);
  };

  const cancelPick = useCallback(() => {
    pendingRef.current = null;
    setPickerCandidates(null);
  }, []);

  return {
    source,
    confirmed: isLocaleConfirmed({ locale, source }),
    mismatch,
    pickerCandidates,
    onUrlLocale,
    onVisibleTexts,
    resolveForSelection,
    choose,
    onMenuLocale,
    cancelPick,
  };
};
