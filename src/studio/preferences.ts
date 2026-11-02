import { readPref, writePref } from './share/browser.js';

export type StudioLanguage = 'en' | 'ar';
export type ThemeChoice = 'system' | 'light' | 'dark';

export const STUDIO_LANGUAGES: readonly StudioLanguage[] = ['en', 'ar'];
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** The `localStorage` keys `readPref` uses, for E2E `addInitScript`. */
export const STUDIO_LANGUAGE_KEY = 'livelocale:studio-language';
export const STUDIO_THEME_KEY = 'livelocale:studio-theme';

/** Primary subtags of Arabic and its varieties. `arn` (Mapudungun) is not Arabic. */
const ARABIC_SUBTAGS: ReadonlySet<string> = new Set([
  'ar',
  'arz',
  'ary',
  'arq',
  'aeb',
  'apc',
  'ajp',
  'acm',
  'afb',
  'ayl',
  'ars',
]);

export function isStudioLanguage(value: unknown): value is StudioLanguage {
  return (STUDIO_LANGUAGES as readonly unknown[]).includes(value);
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return (THEME_CHOICES as readonly unknown[]).includes(value);
}

/** The remembered Studio language, or null when none or not a known one. */
export function storedLanguage(): StudioLanguage | null {
  const value = readPref('studio-language');
  return isStudioLanguage(value) ? value : null;
}

/** The remembered theme choice, or null when none or not a known one. */
export function storedThemeChoice(): ThemeChoice | null {
  const value = readPref('studio-theme');
  return isThemeChoice(value) ? value : null;
}

export function saveLanguage(lang: StudioLanguage): void {
  writePref('studio-language', lang);
}

export function saveThemeChoice(choice: ThemeChoice): void {
  writePref('studio-theme', choice);
}

/** Primary subtag (before the first '-' or '_', lowercased) is 'ar' or an Arabic variety. */
export function prefersArabic(browserLanguage: string | undefined): boolean {
  if (!browserLanguage) return false;
  const primary = browserLanguage.split(/[-_]/)[0]!.toLowerCase();
  return ARABIC_SUBTAGS.has(primary);
}

/**
 * A valid remembered language wins; otherwise Arabic only for the share Studio opened
 * from an Arabic browser, so developers keep English unless they choose otherwise.
 */
export function initialStudioLanguage(input: {
  stored: string | null;
  isShareStudio: boolean;
  browserLanguage: string | undefined;
}): StudioLanguage {
  if (isStudioLanguage(input.stored)) return input.stored;
  return input.isShareStudio && prefersArabic(input.browserLanguage) ? 'ar' : 'en';
}

/** The dev Studio starts dark; the share Studio follows the system setting. */
export function defaultThemeChoice(isShareStudio: boolean): ThemeChoice {
  return isShareStudio ? 'system' : 'dark';
}

/** A valid remembered choice wins, else `defaultThemeChoice(isShareStudio)`. */
export function initialThemeChoice(input: {
  stored: string | null;
  isShareStudio: boolean;
}): ThemeChoice {
  return isThemeChoice(input.stored) ? input.stored : defaultThemeChoice(input.isShareStudio);
}
