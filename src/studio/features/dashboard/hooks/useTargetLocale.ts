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
  /**
   * Server stacks only (`enabled` false): the page's text decides the edited locale too, so the
   * Studio follows the app's own language switch (`?lng=`, a cookie, i18next state). A locale
   * chosen in the menu is kept, and text in another language is only flagged. No language pick
   * is ever required.
   */
  followPage?: boolean;
  /** The draft scope the confirmed locale is remembered under; null remembers nothing. */
  scope: string | null;
  /** The Studio's current locale. */
  locale: string;
  /** Sets the locale; used for inferred and manual decisions. */
  setLocale: (locale: string) => void;
  /** What the editor's language menu calls when `enabled` is false; defaults to `setLocale`. */
  setMenuLocale?: (locale: string) => void;
  /**
   * Shows `locale` in the app preview (share links only): called for a choice from the
   * language menu and for a locale remembered from an earlier visit, never for a decision
   * that came from the page itself.
   */
  showLocale?: (locale: string) => void;
  locales: readonly string[];
  getCandidates: () => Promise<TextCandidates>;
  /**
   * True while typed text is not saved yet. The page then never changes the language: the
   * editor would reload with the other language's text and drop what was typed. A text in
   * another language is flagged instead, and switching goes through the unsaved prompt.
   */
  hasUnsavedChanges?: () => boolean;
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
  followPage = false,
  scope,
  locale,
  setLocale,
  setMenuLocale = setLocale,
  showLocale,
  locales,
  getCandidates,
  hasUnsavedChanges = () => false,
}: UseTargetLocaleParams) => {
  const [source, setSource] = useState<LocaleSource | null>(null);
  const [mismatch, setMismatchState] = useState<string | null>(null);
  // Whether the shown mismatch came from the page's text while typing, so it can go once the
  // text is saved and the page decides again.
  const heldMismatchRef = useRef(false);
  const setMismatch = (next: string | null, held = false) => {
    heldMismatchRef.current = held && next !== null;
    setMismatchState(next);
  };
  const [pickerCandidates, setPickerCandidates] = useState<string[] | null>(null);

  // Latest values for the async handlers; updated synchronously on each decision.
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const pendingRef = useRef<SelectedElement | null>(null);
  // Whether the page's text is read to decide the locale at all.
  const infers = enabled || followPage;
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
    showLocale?.(remembered);
  }, [enabled, scope, locales]);

  const onUrlLocale = (urlLocale: string) => {
    if (!enabled) {
      if (!followPage) {
        setLocale(urlLocale);
        return;
      }
      // The address still wins on a server stack, as it always has, except when it only echoes
      // the menu choice the Studio itself put there: that choice stays the person's own.
      const now = current();
      if (now.source === 'manual' && now.locale === urlLocale) return;
      apply({ locale: urlLocale, source: 'url' });
      return;
    }
    apply(chooseLocaleOnNavigation(urlLocale, current()));
  };

  /** True when `next` changes the locale while typed text is unsaved; flags it instead. */
  const holdWhileTyping = (next: CurrentLocale): boolean => {
    if (next.locale === localeRef.current || !hasUnsavedChanges()) return false;
    setMismatch(next.locale, true);
    return true;
  };

  const onVisibleTexts = async (texts: readonly VisibleText[]) => {
    if (!infers) return;
    const candidates = await getCandidates();
    const next = chooseLocaleOnPageTexts(matchLocalesByVisibleTexts(texts, candidates), current());
    if (holdWhileTyping(next)) return;
    if (heldMismatchRef.current) setMismatch(null);
    apply(next);
  };

  const resolveForSelection = async (el: SelectedElement): Promise<boolean> => {
    if (!infers) return true;
    const candidates = await getCandidates();
    // A text the edited language lacks shows the fallback's words; the match counts that
    // language too, so it is neither switched away from nor flagged.
    const matches = matchLocalesByText(el.key, [el.currentValue], candidates);
    const now = current();
    setMismatch(localeMismatch(matches, now));
    const choice = chooseLocaleOnClick(matches, now, locales);
    if (!('pick' in choice) && holdWhileTyping(choice)) return true;
    if ('pick' in choice) {
      // Nothing to pick from: keep the current locale rather than show an empty picker. A
      // server stack never asks either: it keeps the locale it has, as it always did.
      if (choice.pick.length === 0 || !enabled) return true;
      pendingRef.current = el;
      setPickerCandidates(choice.pick);
      return false;
    }
    apply(choice);
    return true;
  };

  /**
   * A key picked from the Keys list has no page text to infer from. While no language
   * is chosen yet, it waits for the same required pick as an Alt+Click, so a save never
   * lands silently in whatever locale the Studio happened to start on.
   */
  const resolveForDirectPick = (el: SelectedElement): boolean => {
    if (!enabled || sourceRef.current !== null || locales.length === 0) return true;
    pendingRef.current = el;
    setPickerCandidates([...locales]);
    return false;
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
    if (!enabled) {
      if (followPage) {
        // Chosen by hand: the page's text no longer moves it, only flags a mismatch.
        localeRef.current = chosen;
        sourceRef.current = 'manual';
        setSource('manual');
        setMismatch(null);
      }
      setMenuLocale(chosen);
      return;
    }
    choose(chosen);
    showLocale?.(chosen);
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
    resolveForDirectPick,
    choose,
    onMenuLocale,
    cancelPick,
  };
};
