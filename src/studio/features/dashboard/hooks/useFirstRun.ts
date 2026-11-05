import { useState } from 'react';
import { readPref, writePref } from '../../../share/browser.js';

/** The catalogue keys of the three lines a first-time translator sees, in order. */
export const FIRST_RUN_TIP_KEYS = ['tips.step1', 'tips.step2', 'tips.step3'] as const;

/** The same lines on a touch device, where a tap replaces Alt+Click. */
export const FIRST_RUN_TOUCH_TIP_KEYS = ['tips.step1_touch', 'tips.step2', 'tips.step3'] as const;

/** First-visit tips and the optional translator name that the Send dialog reuses. */
export function useFirstRun(enabled: boolean): {
  showTips: boolean;
  dismiss(): void;
  name: string;
  setName(v: string): void;
} {
  const [seen, setSeen] = useState(() => readPref('tips-seen') === '1');
  const [name, setNameState] = useState(() => readPref('translator-name') ?? '');

  const dismiss = () => {
    // Memory holds it when localStorage throws, and state hides the tips for the session.
    writePref('tips-seen', '1');
    setSeen(true);
  };

  const setName = (v: string) => {
    setNameState(v);
    writePref('translator-name', v === '' ? null : v);
  };

  return { showTips: enabled && !seen, dismiss, name, setName };
}
