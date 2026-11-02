import type { ThemeChoice } from './preferences.js';

export type ResolvedTheme = 'light' | 'dark';

/** The system setting the `system` choice follows. */
export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

/** Whether the system asks for dark; true when matchMedia is missing. */
export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(PREFERS_DARK_QUERY).matches;
}

/** `system` follows `prefersDark`; an explicit choice wins. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

/** Sets or clears only the `dark` class, leaving the root's other classes alone. */
export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.classList.toggle('dark', theme === 'dark');
}
