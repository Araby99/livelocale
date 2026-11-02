import { useCallback, useEffect, useState } from 'react';
import {
  initialThemeChoice,
  saveThemeChoice,
  storedThemeChoice,
  type ThemeChoice,
} from '../../../preferences.js';
import {
  applyTheme,
  PREFERS_DARK_QUERY,
  resolveTheme,
  type ResolvedTheme,
} from '../../../theme.js';
import { useMediaQuery } from './useMediaQuery.js';

/** The theme choice (remembered), resolved against the live system setting and applied to the root. */
export function useTheme(isShareStudio: boolean): {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice(choice: ThemeChoice): void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(() =>
    initialThemeChoice({ stored: storedThemeChoice(), isShareStudio })
  );
  const systemDark = useMediaQuery(PREFERS_DARK_QUERY, true);
  const resolved = resolveTheme(choice, systemDark);

  useEffect(() => {
    applyTheme(document.documentElement, resolved);
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    saveThemeChoice(next);
  }, []);

  return { choice, resolved, setChoice };
}
