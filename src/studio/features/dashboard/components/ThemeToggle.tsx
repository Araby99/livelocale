import React from 'react';
import { THEME_CHOICES, type ThemeChoice } from '../../../preferences.js';

/** Button names for each theme choice; replaced by catalogue keys in Task 21. */
export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

const ICON_PATHS: Record<ThemeChoice, React.ReactNode> = {
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  dark: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
};

const BASE = 'h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors';
const PRESSED = 'bg-raised text-fg border-line-strong';
const UNPRESSED = 'text-fg-muted border-transparent hover:bg-raised-hover';

/** The system, light and dark theme switch shown in the header settings. */
export const ThemeToggle = ({
  choice,
  onChange,
}: {
  choice: ThemeChoice;
  onChange(choice: ThemeChoice): void;
}) => (
  <div role="group" aria-label="Theme" className="flex items-center gap-0.5">
    {THEME_CHOICES.map((c) => (
      <button
        key={c}
        type="button"
        data-theme-choice={c}
        aria-label={THEME_LABELS[c]}
        title={THEME_LABELS[c]}
        aria-pressed={c === choice}
        onClick={() => onChange(c)}
        className={`${BASE} ${c === choice ? PRESSED : UNPRESSED}`}
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          {ICON_PATHS[c]}
        </svg>
      </button>
    ))}
  </div>
);
