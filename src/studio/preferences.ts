import { readPref, writePref } from './share/browser.js';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** The `localStorage` key `readPref` uses, for E2E `addInitScript`. */
export const STUDIO_THEME_KEY = 'livelocale:studio-theme';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return (THEME_CHOICES as readonly unknown[]).includes(value);
}

/** The remembered theme choice, or null when none or not a known one. */
export function storedThemeChoice(): ThemeChoice | null {
  const value = readPref('studio-theme');
  return isThemeChoice(value) ? value : null;
}

export function saveThemeChoice(choice: ThemeChoice): void {
  writePref('studio-theme', choice);
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
