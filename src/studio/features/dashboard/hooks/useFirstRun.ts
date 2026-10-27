import { useState } from 'react';
import { readPref, writePref } from '../../../share/browser.js';

/** The three lines a first-time translator sees, in order. */
export const FIRST_RUN_TIPS: readonly [string, string, string] = [
  'Hold Alt/Option and click any text.',
  'Type your fix. The page updates as you type, and your changes are kept in this browser.',
  'When you are done, press Send to developer and paste the link to your developer.',
];

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
